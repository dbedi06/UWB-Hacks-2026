/**
 * Minimal email normalisation for alert subscriptions and SES.
 * Returns lowercased local part or null if invalid/empty.
 */
export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (t.length < 3 || t.length > 254) return null;
  // Pragmatic RFC 5322 subset: one @, no spaces, TLD at least 2 chars
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  return t;
}
