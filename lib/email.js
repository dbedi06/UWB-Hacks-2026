/**
 * AWS SES email sender — minimal wrapper around SendEmailCommand.
 *
 * Returns { ok, messageId } on success, { ok: false, error } otherwise.
 * Never throws. Mirrors lib/sms.js so report submission doesn't break
 * because SES is misconfigured.
 *
 * The HTML template is lifted from notification-sender/index.mjs on the
 * email-notifications branch — same dark theme as the app, severity
 * badge, Google Maps deep-link.
 */
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

let _client = null;
function client() {
  if (!_client) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null;
    _client = new SESClient({
      region: process.env.AWS_REGION || "us-west-2",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

const CATEGORY_LABELS = {
  pothole: "Pothole",
  streetlight: "Streetlight",
  crosswalk: "Crosswalk",
  graffiti: "Graffiti",
  flooding: "Flooding",
  debris: "Debris/Hazard",
  other: "Other",
};

const SEVERITY_COLORS = {
  low: "#3BBFA3",
  medium: "#F5C842",
  moderate: "#F5C842",
  high: "#E07B39",
  emergency: "#D45F5F",
};

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildEmailContent({ category, severity, description, lat, lng, title }) {
  const label = CATEGORY_LABELS[category] || category || "Issue";
  const color = SEVERITY_COLORS[severity] || "#8A8A8A";
  const sev = String(severity || "").toLowerCase();
  const desc = description || title || "A new issue was reported nearby.";
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  const subject = `[VoiceMap] New ${sev} alert — ${label}`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0d1117">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e8e8e8;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#3BBFA3,#4A9EE0);padding:20px 24px">
        <h2 style="margin:0;color:#fff;font-size:18px">VoiceMap alert</h2>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px">A new issue was reported near your watch area</p>
      </div>
      <div style="padding:24px">
        <div style="background:#1f2937;border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="margin-bottom:8px">
            <span style="font-size:15px;font-weight:600;color:#e8e8e8">${escapeHtml(label)}</span>
            <span style="margin-left:8px;background:${color}22;color:${color};border-radius:4px;padding:2px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(sev)}</span>
          </div>
          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">${escapeHtml(desc)}</p>
        </div>
        <a href="${mapsUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#3BBFA3,#4A9EE0);color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">View on map</a>
        <p style="margin:16px 0 0;font-size:11px;color:#4b5563;text-align:center">You are receiving this because you subscribed to VoiceMap alerts. Reply STOP or open the app to unsubscribe.</p>
      </div>
    </div></body></html>`;

  const text = `VoiceMap alert: ${label} (${sev})\n\n${desc}\n\nMap: ${mapsUrl}`;

  return { subject, html, text };
}

/**
 * @param {{ to: string, subject: string, html: string, text?: string }} input
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, error: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const c = client();
  if (!c) {
    console.warn("[email] AWS_ACCESS_KEY_ID/SECRET not set; skipping send");
    return { ok: false, error: "ses_unconfigured" };
  }
  const from = process.env.SES_FROM;
  if (!from) {
    console.warn("[email] SES_FROM not set; skipping send");
    return { ok: false, error: "ses_from_missing" };
  }

  try {
    const cmd = new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
        },
      },
    });
    const out = await c.send(cmd);
    return { ok: true, messageId: out?.MessageId };
  } catch (e) {
    return { ok: false, error: e?.name === "MessageRejected" ? `ses_rejected: ${e.message}` : e?.message || "ses_failed" };
  }
}
