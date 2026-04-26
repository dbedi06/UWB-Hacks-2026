/**
 * Subscriber alert dispatch — find subscriptions whose watch radius covers
 * a new report's location, then fire SMS via Twilio AND email via AWS SES.
 *
 * Called fire-and-forget from POST /api/reports after a successful INSERT.
 * Must never throw — the report is already saved; delivery failures are a
 * separate concern logged to the notifications table and stderr.
 *
 * Two channels run in parallel:
 *  - SMS rows: contact_preference IN ('sms','both') AND contact_override IS NOT NULL
 *  - Email rows: contact_preference IN ('email','both') AND contact_email IS NOT NULL
 *
 * A subscription with preference='both' yields one row in each set, so a
 * single subscriber gets one SMS and one email — by design.
 */
import { sendSms } from "@/lib/sms";
import { sendEmail, buildEmailContent } from "@/lib/email";
import { uiSeverityToDb } from "@/lib/reports";

function buildSmsBody({ severity, category, title }) {
  const url = process.env.VOICEMAP_PUBLIC_URL || "";
  const sev = String(severity || "").toLowerCase();
  const cat = String(category || "issue").toLowerCase();
  const safeTitle = String(title || "").trim() || "Untitled report";

  const suffix = url ? ` ${url}` : "";
  // GSM-7 only — em-dash and ellipsis force UCS2 (70-char segments) and
  // rack up the segment count, especially with the trial-account prefix.
  const head = `VoiceMap: new ${sev} ${cat} near you - `;
  const remaining = 160 - head.length - suffix.length - 2;
  const truncatedTitle =
    safeTitle.length > remaining
      ? safeTitle.slice(0, Math.max(0, remaining - 3)) + "..."
      : safeTitle;
  return `${head}"${truncatedTitle}".${suffix}`;
}

async function logNotification(sql, { subscriptionId, reportId, channel, ok }) {
  try {
    await sql`
      INSERT INTO notifications (subscription_id, report_id, channel, status, sent_at)
      VALUES (
        ${subscriptionId}::uuid,
        ${reportId}::uuid,
        ${channel}::notification_channel,
        ${ok ? "sent" : "failed"}::notification_status,
        ${ok ? new Date().toISOString() : null}
      )
    `;
  } catch (e) {
    console.warn(`[notify] notifications log insert failed (${channel}):`, e?.message ?? e);
  }
}

/**
 * @param {*} sql       tagged-template SQL client from getSql()
 * @param {{
 *   id: string, lat: number, lng: number,
 *   category: string, severity: string,
 *   title?: string, impact_summary?: string,
 * }} report
 */
export async function dispatchSubscriberAlerts(sql, report) {
  if (!sql || !report?.id) return;

  const { id: reportId, lat, lng, category, title } = report;
  const dbSev = uiSeverityToDb(report.severity);
  if (!dbSev) {
    console.warn(`[notify] dispatch skipped: unknown severity ${report.severity}`);
    return;
  }

  // Run both channel queries in parallel.
  const [smsSubs, emailSubs] = await Promise.all([
    sql`
      SELECT id::text AS id, contact_override
      FROM subscriptions
      WHERE contact_preference IN ('sms', 'both')
        AND contact_override IS NOT NULL
        AND (category_filter IS NULL OR ${category} = ANY(category_filter))
        AND (min_severity IS NULL OR ${dbSev}::severity_level >= min_severity)
        AND (6371000 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS(center_lat - ${lat}::double precision) / 2), 2) +
              COS(RADIANS(${lat}::double precision)) * COS(RADIANS(center_lat)) *
              POWER(SIN(RADIANS(center_lng - ${lng}::double precision) / 2), 2)
            ))) <= radius_meters
    `.catch((e) => { console.warn("[notify] sms query failed:", e?.message ?? e); return []; }),
    sql`
      SELECT id::text AS id, contact_email
      FROM subscriptions
      WHERE contact_preference IN ('email', 'both')
        AND contact_email IS NOT NULL
        AND (category_filter IS NULL OR ${category} = ANY(category_filter))
        AND (min_severity IS NULL OR ${dbSev}::severity_level >= min_severity)
        AND (6371000 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS(center_lat - ${lat}::double precision) / 2), 2) +
              COS(RADIANS(${lat}::double precision)) * COS(RADIANS(center_lat)) *
              POWER(SIN(RADIANS(center_lng - ${lng}::double precision) / 2), 2)
            ))) <= radius_meters
    `.catch((e) => { console.warn("[notify] email query failed:", e?.message ?? e); return []; }),
  ]);

  if ((smsSubs?.length || 0) === 0 && (emailSubs?.length || 0) === 0) return;

  // Dedup by recipient — multiple subscription rows for the same phone or
  // email (e.g. duplicate Subscribe clicks, or separate "home"/"work" watch
  // areas covering the same report) should result in ONE message per
  // recipient. Keep the first matching subscription as the send target;
  // log the rest as failed/suppressed so the audit trail is preserved.
  const seenPhones = new Set();
  const smsSend = [];
  const smsDupe = [];
  for (const s of smsSubs || []) {
    const phone = (s.contact_override || "").trim();
    if (!phone) continue;
    if (seenPhones.has(phone)) smsDupe.push(s);
    else { seenPhones.add(phone); smsSend.push(s); }
  }

  const seenEmails = new Set();
  const emailSend = [];
  const emailDupe = [];
  for (const s of emailSubs || []) {
    const email = (s.contact_email || "").trim().toLowerCase();
    if (!email) continue;
    if (seenEmails.has(email)) emailDupe.push(s);
    else { seenEmails.add(email); emailSend.push({ ...s, contact_email: email }); }
  }

  const smsBody = buildSmsBody({ severity: report.severity, category, title });
  const emailContent = buildEmailContent({
    category,
    severity: report.severity,
    description: report.impact_summary || title || "",
    title,
    lat,
    lng,
  });

  const [smsResults, emailResults] = await Promise.all([
    Promise.allSettled(smsSend.map(async (s) => {
      const send = await sendSms({ to: s.contact_override, body: smsBody });
      await logNotification(sql, { subscriptionId: s.id, reportId, channel: "sms", ok: send.ok });
      if (!send.ok) console.warn(`[sms] send failed sub=${s.id} status=${send.status ?? "?"} err=${send.error}`);
      return send.ok;
    })),
    Promise.allSettled(emailSend.map(async (s) => {
      const send = await sendEmail({
        to: s.contact_email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
      await logNotification(sql, { subscriptionId: s.id, reportId, channel: "email", ok: send.ok });
      if (!send.ok) console.warn(`[email] send failed sub=${s.id} err=${send.error}`);
      return send.ok;
    })),
  ]);

  // Audit suppressed dupes (one row per matching sub even if no message went).
  await Promise.all([
    ...smsDupe.map((s) => logNotification(sql, { subscriptionId: s.id, reportId, channel: "sms", ok: false })),
    ...emailDupe.map((s) => logNotification(sql, { subscriptionId: s.id, reportId, channel: "email", ok: false })),
  ]);

  const smsOk = smsResults.filter((r) => r.status === "fulfilled" && r.value).length;
  const emailOk = emailResults.filter((r) => r.status === "fulfilled" && r.value).length;
  console.log(
    `[notify] sms ${smsOk}/${smsSend.length}, email ${emailOk}/${emailSend.length} for report=${reportId}` +
    (smsDupe.length || emailDupe.length ? ` (suppressed ${smsDupe.length} sms + ${emailDupe.length} email dupes)` : "")
  );
}
