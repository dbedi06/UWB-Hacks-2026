/**
 * VoiceMap reports — helpers aligned with `DB/schema.sql` (`report`, `issue_type`, `app_user`).
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

/** Maps VoiceMap `category` keys to `issue_type.name` in the database. */
export const ISSUE_KEY_TO_NAME = {
  pothole: "Pothole",
  streetlight: "Streetlight",
  crosswalk: "Crosswalk",
  graffiti: "Graffiti",
  flooding: "Flooding",
  debris: "Debris",
  other: "Other",
};

/** Maps `issue_type.name` to VoiceMap `category` keys. */
export const ISSUE_NAME_TO_KEY = {
  Pothole: "pothole",
  Streetlight: "streetlight",
  Crosswalk: "crosswalk",
  Graffiti: "graffiti",
  Flooding: "flooding",
  Debris: "debris",
  Other: "other",
};

/**
 * @param {string | null | undefined} sev
 * @returns {"low" | "medium" | "high" | "emergency"}
 */
export function normalizeSeverityForUi(sev) {
  if (!sev) return "medium";
  if (sev === "moderate") return "medium";
  if (sev === "low" || sev === "medium" || sev === "high" || sev === "emergency") return sev;
  return "medium";
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

/**
 * Full `report.description` (title line + optional blocks).
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
 * Map a joined `report` + `issue_type` row to the client report shape for `VoiceMap`.
 * @param {object} row
 */
export function mapReportRowToClient(row) {
  const { title, impact_summary } = splitDescriptionForUi(row.description);
  const sev = normalizeSeverityForUi(row.severity_level_id);
  const cat = row.issue_type_name
    ? ISSUE_NAME_TO_KEY[row.issue_type_name] || "other"
    : "other";
  return {
    id: String(row.id),
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    category: cat,
    other_type: undefined,
    severity: sev,
    title: title || "Report",
    location_description: `${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}`,
    impact_summary,
    report_count: 1,
    status: "open",
    created_at: null,
  };
}

/** Stable fake email for anonymous sessions (unique per `sessionToken` UUID). */
export function sessionAnonEmail(sessionToken) {
  return `anon+${sessionToken}@voicemap.local`;
}
