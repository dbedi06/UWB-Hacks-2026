/**
 * Subscriber alert dispatch — find subscriptions whose watch radius covers
 * a new report's location, then fire SMS via Twilio.
 *
 * Called fire-and-forget from POST /api/reports after a successful INSERT.
 * Must never throw out — the report is already saved; SMS failures are a
 * separate concern logged to the notifications table and stderr.
 */
import { sendSms } from "@/lib/sms";
import { uiSeverityToDb } from "@/lib/reports";

const RADIUS_QUERY_NOTE =
  "Geo filter uses Haversine to match center_lat/lng/radius_meters; " +
  "category_filter NULL = all categories, min_severity NULL = all severities. " +
  "Severity comparison relies on the severity_level enum being ordered " +
  "low < moderate < high < emergency.";

function buildSmsBody({ severity, category, title }) {
  const url = process.env.VOICEMAP_PUBLIC_URL || "";
  const sev = String(severity || "").toLowerCase();
  const cat = String(category || "issue").toLowerCase();
  const safeTitle = String(title || "").trim() || "Untitled report";

  // Compose with budget for url (+ leading space) so the whole thing fits
  // a single 160-char SMS segment.
  const suffix = url ? ` ${url}` : "";
  // GSM-7 only — em-dash and ellipsis force UCS2 (70-char segments) and
  // rack up the segment count, especially with the trial-account prefix.
  const head = `VoiceMap: new ${sev} ${cat} near you - `;
  const remaining = 160 - head.length - suffix.length - 2; // 2 for quotes
  const truncatedTitle =
    safeTitle.length > remaining
      ? safeTitle.slice(0, Math.max(0, remaining - 3)) + "..."
      : safeTitle;
  return `${head}"${truncatedTitle}".${suffix}`;
}

/**
 * @param {*} sql       tagged-template SQL client from getSql()
 * @param {{
 *   id: string, lat: number, lng: number,
 *   category: string, severity: string,
 *   title?: string,
 * }} report
 */
export async function dispatchSubscriberAlerts(sql, report) {
  if (!sql || !report?.id) return;

  const { id: reportId, lat, lng, category, title } = report;
  const dbSev = uiSeverityToDb(report.severity);
  if (!dbSev) {
    console.warn(`[sms] dispatch skipped: unknown severity ${report.severity}`);
    return;
  }

  let subs;
  try {
    subs = await sql`
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
    `;
  } catch (e) {
    console.warn("[sms] subscriber query failed:", e?.message ?? e);
    return;
  }

  if (!subs || subs.length === 0) return;

  const body = buildSmsBody({ severity: report.severity, category, title });

  const results = await Promise.allSettled(
    subs.map(async (s) => {
      const send = await sendSms({ to: s.contact_override, body });
      // Log every attempt to the notifications table — non-fatal if it fails.
      try {
        await sql`
          INSERT INTO notifications (subscription_id, report_id, channel, status, sent_at)
          VALUES (
            ${s.id}::uuid,
            ${reportId}::uuid,
            'sms',
            ${send.ok ? "sent" : "failed"}::notification_status,
            ${send.ok ? new Date().toISOString() : null}
          )
        `;
      } catch (e) {
        console.warn("[sms] notifications log insert failed:", e?.message ?? e);
      }
      if (!send.ok) {
        console.warn(
          `[sms] send failed sub=${s.id} status=${send.status ?? "?"} err=${send.error}`
        );
      }
      return send.ok;
    })
  );

  const ok = results.filter((r) => r.status === "fulfilled" && r.value).length;
  console.log(
    `[sms] dispatched ${ok}/${subs.length} (${subs.length - ok} failed) for report=${reportId}`
  );
}
