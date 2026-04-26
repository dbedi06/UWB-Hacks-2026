/**
 * City Hall digest — pulls last-N-hours of cluster heads, computes
 * severity x category breakdown, generates a 2-3 sentence executive
 * summary via OpenAI (fail-open if unconfigured), renders an HTML +
 * plaintext email, and sends via AWS SES.
 *
 * Triggered on-demand from POST /api/digest. Stats are computed
 * deterministically in JS — only the executive summary uses an LLM,
 * to keep the counts honest and the model cheap.
 */
import OpenAI from "openai";
import { sendEmail } from "@/lib/email";
import { dbSeverityToUi, splitDescriptionForUi } from "@/lib/reports";

const SUMMARY_MODEL = process.env.OPENAI_DIGEST_MODEL || "gpt-4o-mini";

let _openai = null;
function openai() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) return null;
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
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

const SEV_RANK = { low: 0, medium: 1, high: 2, emergency: 3 };
const SEV_LABEL = { low: "Low", medium: "Medium", high: "High", emergency: "Emergency" };
const SEV_COLOR = {
  low: "#3BBFA3",
  medium: "#F5C842",
  high: "#E07B39",
  emergency: "#D45F5F",
};
const SEV_ORDER = ["emergency", "high", "medium", "low"];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Pull cluster heads in the last `hoursBack` hours and compute the stats
 * that go on the email. Returns null on DB error (we don't want to spam).
 */
export async function summarizeWindow(sql, hoursBack = 24) {
  let rows;
  try {
    rows = await sql`
      WITH ranked AS (
        SELECT
          r.*,
          COALESCE(r.cluster_id, r.id) AS effective_cluster,
          COUNT(*) OVER (PARTITION BY COALESCE(r.cluster_id, r.id))      AS report_count,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(r.cluster_id, r.id)
            ORDER BY r.reported_at DESC
          ) AS rn
        FROM reports r
        WHERE r.status NOT IN ('resolved', 'dismissed')
          AND r.reported_at >= NOW() - (${hoursBack}::int * INTERVAL '1 hour')
      )
      SELECT * FROM ranked WHERE rn = 1 ORDER BY reported_at DESC
    `;
  } catch (e) {
    console.warn("[digest] summarizeWindow query failed:", e?.message ?? e);
    return null;
  }

  // Project DB rows to a thinner shape we control + UI severity strings.
  const items = (rows || []).map((r) => {
    const { title, impact_summary } = splitDescriptionForUi(r.description);
    return {
      id: String(r.id),
      title: title || "Untitled report",
      impact: impact_summary || "",
      category: r.category,
      severity: dbSeverityToUi(r.severity) || "low",
      lat: Number(r.lat),
      lng: Number(r.lng),
      report_count: Number(r.report_count) || 1,
      reported_at: r.reported_at ? new Date(r.reported_at).toISOString() : null,
    };
  });

  const totalClusters = items.length;
  const totalReports = items.reduce((n, it) => n + it.report_count, 0);

  const bySeverity = { low: 0, medium: 0, high: 0, emergency: 0 };
  const byCategory = {};
  const cross = {}; // category -> sev -> count
  for (const it of items) {
    bySeverity[it.severity] = (bySeverity[it.severity] || 0) + 1;
    byCategory[it.category] = (byCategory[it.category] || 0) + 1;
    cross[it.category] = cross[it.category] || { low: 0, medium: 0, high: 0, emergency: 0 };
    cross[it.category][it.severity] = (cross[it.category][it.severity] || 0) + 1;
  }

  // Top 5 priorities — sort by SEV_RANK desc, then report_count desc, then recency
  const topItems = [...items]
    .sort((a, b) => {
      const r = (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0);
      if (r !== 0) return r;
      const c = b.report_count - a.report_count;
      if (c !== 0) return c;
      return (b.reported_at || "").localeCompare(a.reported_at || "");
    })
    .slice(0, 5);

  return {
    windowStart: new Date(Date.now() - hoursBack * 3600 * 1000).toISOString(),
    windowEnd: new Date().toISOString(),
    hoursBack,
    totalClusters,
    totalReports,
    bySeverity,
    byCategory,
    cross,
    topItems,
  };
}

/**
 * Ask gpt-4o-mini for a 2-3 sentence operational summary. Fails open
 * to a templated fallback so the email still sends if OpenAI is down.
 */
export async function generateExecutiveSummary(stats) {
  const fallback = stats.totalClusters === 0
    ? `No new reports in the last ${stats.hoursBack} hours.`
    : `VoiceMap received ${stats.totalReports} report${stats.totalReports === 1 ? "" : "s"} across ${stats.totalClusters} location${stats.totalClusters === 1 ? "" : "s"} in the last ${stats.hoursBack} hours.`;

  const c = openai();
  if (!c) {
    console.warn("[digest] OPENAI_API_KEY not set; using fallback summary");
    return fallback;
  }

  const payload = {
    window_hours: stats.hoursBack,
    total_clusters: stats.totalClusters,
    total_reports: stats.totalReports,
    by_severity: stats.bySeverity,
    by_category: stats.byCategory,
    top_items: stats.topItems.map((it) => ({
      title: it.title,
      severity: it.severity,
      category: it.category,
      report_count: it.report_count,
    })),
  };

  try {
    const completion = await c.chat.completions.create({
      model: SUMMARY_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an analyst writing a 2-3 sentence executive summary for a city operations team. " +
            "The data is the last N hours of civic reports submitted to VoiceMap (potholes, streetlights, " +
            "graffiti, flooding, etc.). Be neutral, specific, and operational. Do not invent facts. " +
            "Do not editorialize. Plain text only — no markdown, no greeting, no closing.",
        },
        { role: "user", content: JSON.stringify(payload, null, 2) },
      ],
      temperature: 0.2,
      max_tokens: 180,
    });
    const out = completion.choices?.[0]?.message?.content?.trim();
    return out || fallback;
  } catch (e) {
    console.warn("[digest] OpenAI summary failed; using fallback:", e?.message ?? e);
    return fallback;
  }
}

function tableRow(category, cross, total) {
  const cells = SEV_ORDER.map((sev) => {
    const n = cross[category]?.[sev] || 0;
    if (!n) return `<td style="padding:6px 10px;text-align:center;color:#4b5563">·</td>`;
    return `<td style="padding:6px 10px;text-align:center;color:${SEV_COLOR[sev]};font-weight:600">${n}</td>`;
  }).join("");
  return `<tr style="border-top:1px solid #1f2937">
    <td style="padding:6px 10px;color:#e8e8e8">${escapeHtml(CATEGORY_LABELS[category] || category)}</td>
    ${cells}
    <td style="padding:6px 10px;text-align:right;color:#e8e8e8;font-weight:600">${total}</td>
  </tr>`;
}

export function buildDigestEmail({ stats, summary, mapUrl }) {
  const { totalClusters, totalReports, hoursBack, bySeverity, cross, byCategory, topItems, windowStart, windowEnd } = stats;
  const totalSev = SEV_ORDER.reduce((acc, k) => acc + (bySeverity[k] || 0), 0);
  const subject = `[VoiceMap] City Hall digest — ${totalReports} new report${totalReports === 1 ? "" : "s"} in the last ${hoursBack}h`;

  const orderedCategories = Object.keys(byCategory).sort(
    (a, b) => (byCategory[b] || 0) - (byCategory[a] || 0)
  );

  const tableHeader = `
    <thead>
      <tr style="background:#0d1117">
        <th style="padding:8px 10px;text-align:left;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">Category</th>
        ${SEV_ORDER.map((s) => `<th style="padding:8px 10px;text-align:center;color:${SEV_COLOR[s]};font-size:11px;text-transform:uppercase;letter-spacing:0.06em">${SEV_LABEL[s]}</th>`).join("")}
        <th style="padding:8px 10px;text-align:right;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">Total</th>
      </tr>
    </thead>`;

  const tableBody = orderedCategories.length === 0
    ? `<tbody><tr><td colspan="${SEV_ORDER.length + 2}" style="padding:14px 10px;text-align:center;color:#6b7280;font-style:italic">No reports in this window</td></tr></tbody>`
    : `<tbody>${orderedCategories.map((cat) => tableRow(cat, cross, byCategory[cat])).join("")}</tbody>
       <tfoot><tr style="border-top:2px solid #374151;background:#0d1117">
         <td style="padding:8px 10px;color:#9ca3af;text-transform:uppercase;font-size:11px;letter-spacing:0.06em">Total</td>
         ${SEV_ORDER.map((s) => `<td style="padding:8px 10px;text-align:center;color:${SEV_COLOR[s]};font-weight:700">${bySeverity[s] || 0}</td>`).join("")}
         <td style="padding:8px 10px;text-align:right;color:#e8e8e8;font-weight:700">${totalSev}</td>
       </tr></tfoot>`;

  const itemsList = topItems.length === 0
    ? `<p style="margin:8px 0 0;color:#6b7280;font-size:13px;font-style:italic">No items to surface this window.</p>`
    : topItems
        .map((it, i) => {
          const sevColor = SEV_COLOR[it.severity] || "#9ca3af";
          const link = mapUrl ? `${mapUrl}?report=${encodeURIComponent(it.id)}` : "";
          const mapsUrl = `https://www.google.com/maps?q=${it.lat},${it.lng}`;
          return `
            <div style="background:#1f2937;border-radius:8px;padding:14px 16px;margin-top:${i === 0 ? 0 : 10}px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="background:${sevColor}22;color:${sevColor};border-radius:4px;padding:2px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(it.severity)}</span>
                <span style="color:#9ca3af;font-size:11px">${escapeHtml(CATEGORY_LABELS[it.category] || it.category)}</span>
                ${it.report_count > 1 ? `<span style="color:#9ca3af;font-size:11px">· ${it.report_count} reports</span>` : ""}
              </div>
              <div style="font-size:14px;font-weight:600;color:#e8e8e8;margin-bottom:4px">${i + 1}. ${escapeHtml(it.title)}</div>
              ${it.impact ? `<p style="margin:0 0 6px;font-size:12px;color:#9ca3af;line-height:1.5">${escapeHtml(it.impact)}</p>` : ""}
              <div style="font-size:11px;color:#6b7280">
                📍 ${it.lat.toFixed(5)}, ${it.lng.toFixed(5)}
                ${link ? ` · <a href="${link}" style="color:#4A9EE0;text-decoration:none">View in app</a>` : ""}
                · <a href="${mapsUrl}" style="color:#4A9EE0;text-decoration:none">Google Maps</a>
              </div>
            </div>`;
        })
        .join("");

  const fmt = (iso) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0d1117">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;background:#0d1117;color:#e8e8e8;border-radius:12px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#3BBFA3,#4A9EE0);padding:22px 24px">
        <h2 style="margin:0;color:#fff;font-size:20px">VoiceMap · City Hall digest</h2>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:12px">${escapeHtml(fmt(windowStart))} → ${escapeHtml(fmt(windowEnd))} (${hoursBack}h window)</p>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 18px;font-size:14px;color:#e8e8e8;line-height:1.6">${escapeHtml(summary)}</p>
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Reports by severity & category</div>
        <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;overflow:hidden;margin-bottom:22px">
          ${tableHeader}
          ${tableBody}
        </table>
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Top priorities</div>
        ${itemsList}
        <p style="margin:24px 0 0;font-size:11px;color:#4b5563;text-align:center">Generated ${escapeHtml(fmt(new Date().toISOString()))}. Reply to follow up.</p>
      </div>
    </div></body></html>`;

  const text = [
    `VoiceMap City Hall digest — ${totalReports} new reports / ${totalClusters} locations in last ${hoursBack}h`,
    `Window: ${fmt(windowStart)} → ${fmt(windowEnd)}`,
    "",
    summary,
    "",
    "By severity: " + SEV_ORDER.map((s) => `${SEV_LABEL[s]} ${bySeverity[s] || 0}`).join(", "),
    "",
    "Top priorities:",
    ...topItems.map((it, i) => `  ${i + 1}. [${it.severity}] ${it.title} (${it.category}) — ${it.report_count} report${it.report_count === 1 ? "" : "s"} at ${it.lat.toFixed(5)},${it.lng.toFixed(5)}`),
  ].join("\n");

  return { subject, html, text };
}

/**
 * Orchestrate the full digest: query, AI summarize, build, send.
 */
export async function runDigest(sql, { hoursBack = 24, recipient } = {}) {
  const stats = await summarizeWindow(sql, hoursBack);
  if (!stats) return { ok: false, error: "query_failed" };

  const summary = await generateExecutiveSummary(stats);
  const mapUrl = process.env.VOICEMAP_PUBLIC_URL || "";
  const email = buildDigestEmail({ stats, summary, mapUrl });

  const to = recipient || process.env.DIGEST_RECIPIENT_EMAIL || "abprojects.work@gmail.com";
  const send = await sendEmail({
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return {
    ok: send.ok,
    error: send.ok ? null : send.error,
    recipient: to,
    totalReports: stats.totalReports,
    totalClusters: stats.totalClusters,
    summary,
    messageId: send.messageId,
  };
}
