/**
 * VoiceMap reports — shared logic for schemav2 (`DB/schemav2.sql`).
 * DB: `reports`, `submit_report` / `set_report_severity` flow; enum `severity_level` uses `moderate` (UI: `medium`).
 */

export const ISSUE_KEYS = new Set([
  "pothole",
  "streetlight",
  "crosswalk",
  "graffiti",
  "flooding",
  "debris",
  "other",
]);

/** @typedef {"low" | "medium" | "high" | "emergency"} UiSeverity */
/** @typedef {"low" | "moderate" | "high" | "emergency"} DbSeverity */

const UI_TO_DB = /** @type {const} */ ({
  low: "low",
  medium: "moderate",
  high: "high",
  emergency: "emergency",
});

const DB_TO_UI = /** @type {const} */ ({
  low: "low",
  moderate: "medium",
  high: "high",
  emergency: "emergency",
});

/**
 * @param {string} ui
 * @returns {keyof typeof UI_TO_DB}
 */
export function uiSeverityToDb(ui) {
  return UI_TO_DB[ui] || "moderate";
}

/**
 * @param {string | null | undefined} db
 * @returns {UiSeverity}
 */
export function dbSeverityToUi(db) {
  if (!db) return "medium";
  return DB_TO_UI[db] || "medium";
}

/**
 * Full `reports.description` text (title line + optional blocks).
 * @param {{
 *  title: string;
 *  impactSummary?: string;
 *  otherIssueKey?: string;
 *  otherIssueLabel?: string;
 *  transcript?: string;
 * }} p
 */
export function buildReportDescription(p) {
  let text = (p.title || "").trim();
  if (!text) text = "Untitled report";
  if (p.otherIssueKey === "other" && typeof p.otherIssueLabel === "string" && p.otherIssueLabel.trim()) {
    text += `\n\n[Other: ${p.otherIssueLabel.trim()}]`;
  }
  if (typeof p.impactSummary === "string" && p.impactSummary.trim()) {
    text += `\n\n${p.impactSummary.trim()}`;
  }
  if (typeof p.transcript === "string" && p.transcript.trim()) {
    text += `\n\n[Voice: ${p.transcript.trim()}]`;
  }
  return text;
}

/**
 * @param {string} description
 * @returns {{ title: string, impact_summary: string }}
 */
export function splitDescriptionForUi(description) {
  if (!description || typeof description !== "string") {
    return { title: "", impact_summary: "" };
  }
  const lines = description.split("\n");
  const title = (lines[0] || description).trim();
  const rest = lines.length > 1 ? lines.slice(1).join("\n").trim() : "";
  return { title: title || description.trim(), impact_summary: rest };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} s
 * @returns {string | null}
 */
export function parseUuid(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return UUID_RE.test(t) ? t : null;
}

/**
 * Map a `reports` row to the client report shape used by `VoiceMap`.
 * @param {object} row
 */
export function mapReportRowToClient(row) {
  const { title, impact_summary } = splitDescriptionForUi(row.description);
  return {
    id: String(row.id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    category: row.category,
    other_type: undefined,
    severity: dbSeverityToUi(row.severity),
    title: title || "Report",
    location_description: `${Number(row.lat).toFixed(5)}, ${Number(row.lng).toFixed(5)}`,
    impact_summary,
    // From the GET aggregation (window-function COUNT). When this row is the
    // direct response to a POST, report_count isn't set — fall back to 1.
    report_count: (() => {
      const n = typeof row.report_count === "number"
        ? row.report_count
        : parseInt(row.report_count, 10);
      return Number.isFinite(n) && n > 0 ? n : 1;
    })(),
    cluster_id: row.cluster_id ? String(row.cluster_id) : null,
    status: row.status === "active" ? "open" : String(row.status || "open"),
    created_at: row.reported_at
      ? new Date(row.reported_at).toISOString()
      : new Date().toISOString(),
    tags: Array.isArray(row.tags) ? row.tags : [],
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    duration: typeof row.duration === "string" ? row.duration : null,
  };
}
