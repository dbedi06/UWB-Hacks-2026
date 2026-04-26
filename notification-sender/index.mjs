import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import pg from "pg";

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-west-2";
const fromHeader = process.env.SES_FROM || "VoiceMap Alerts <alerts@example.com>";

const ses = new SESClient({ region });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL");
}

const db = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

let dbConnected = false;

const categoryLabels = {
  pothole: "Pothole",
  streetlight: "Streetlight",
  crosswalk: "Crosswalk",
  graffiti: "Graffiti",
  flooding: "Flooding",
  debris: "Debris / hazard",
  other: "Other",
};

const severityColors = {
  low: "#3BBFA3",
  moderate: "#F5C842",
  high: "#E07B39",
  emergency: "#D45F5F",
};

export const handler = async () => {
  if (!connectionString) {
    return { sent: 0, error: "no_database_url" };
  }
  if (!dbConnected) {
    await db.connect();
    dbConnected = true;
  }

  const { rows } = await db.query("SELECT * FROM get_pending_notifications(100)");
  if (rows.length === 0) return { sent: 0, total: 0 };

  let sent = 0;
  for (const n of rows) {
    if (n.channel !== "email") continue;
    if (!n.contact) {
      console.warn("Skip notification: no contact for email channel", n.notification_id);
      continue;
    }

    const notifId = n.notification_id;
    const label = categoryLabels[n.category] || n.category;
    const color = severityColors[n.severity] || "#8A8A8A";

    try {
      await ses.send(
        new SendEmailCommand({
          Source: fromHeader,
          Destination: { ToAddresses: [n.contact] },
          Message: {
            Subject: {
              Data: `[VoiceMap] New ${n.severity} alert near you — ${label}`,
            },
            Body: {
              Html: {
                Data: buildEmailHtml({
                  label,
                  color,
                  severity: n.severity,
                  description: n.description,
                  lat: n.lat,
                  lng: n.lng,
                }),
              },
              Text: { Data: buildEmailText(n, label) },
            },
          },
        })
      );

      await db.query("SELECT mark_notification_sent($1, true)", [notifId]);
      sent += 1;
    } catch (err) {
      console.error(`Failed for notification ${notifId}:`, err);
      try {
        await db.query("SELECT mark_notification_sent($1, false)", [notifId]);
      } catch (e2) {
        console.error("mark_notification_sent false failed", e2);
      }
    }
  }

  console.log(`Sent ${sent} email(s) (batch size ${rows.length})`);
  return { sent, total: rows.length };
};

function buildEmailHtml({ label, color, severity, description, lat, lng }) {
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const bodyText = (description || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e8e8e8;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#3BBFA3,#4A9EE0);padding:20px 24px">
        <h2 style="margin:0;color:#fff;font-size:18px">VoiceMap alert</h2>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">A new issue was reported near your watch area</p>
      </div>
      <div style="padding:24px">
        <div style="background:#1f2937;border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
            <span style="font-size:15px;font-weight:600">${label}</span>
            <span style="margin-left:auto;background:${color}22;color:${color};border-radius:4px;padding:2px 10px;font-size:11px;font-weight:700;text-transform:uppercase">${severity}</span>
          </div>
          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;white-space:pre-wrap">${bodyText}</p>
        </div>
        <a href="${mapsUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#3BBFA3,#4A9EE0);color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">
          View on map
        </a>
        <p style="margin:16px 0 0;font-size:11px;color:#4b5563;text-align:center">
          You are receiving this because you subscribed to VoiceMap alerts.
        </p>
      </div>
    </div>`;
}

function buildEmailText(n, label) {
  return `VoiceMap alert: ${label} (${n.severity})\n\n${n.description || ""}\n\nMap: https://www.google.com/maps?q=${n.lat},${n.lng}`;
}
