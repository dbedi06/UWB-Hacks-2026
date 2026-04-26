import { getSql } from "@/lib/db";
import { runDigest } from "@/lib/digest";
import { getAdminSession } from "@/lib/admin";

const DB_UNCONFIGURED = {
  error: "Database not configured.",
};

const DEFAULT_HOURS_BACK = 24;
const MAX_HOURS_BACK = 24 * 14; // 2 weeks max — guards against runaway queries

/**
 * POST /api/digest — compile the City Hall digest and send.
 * Body (all optional):
 *   { hoursBack?: number }
 * Returns:
 *   { ok, recipient, totalReports, totalClusters, summary, messageId } on success
 *   { ok: false, error } on failure
 *
 * Auth: requires an Auth0 session whose email is in ADMIN_EMAILS.
 * Recipient is server-controlled via DIGEST_RECIPIENT_EMAIL — the endpoint
 * is not a relay to arbitrary inboxes.
 */
export async function POST(request) {
  // Admin gate first — cheap, no DB hit if unauthorized.
  const { session, isAdmin } = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdmin) {
    return Response.json({ ok: false, error: "Admin access required." }, { status: 403 });
  }

  const sql = getSql();
  if (!sql) return Response.json(DB_UNCONFIGURED, { status: 503 });

  let body = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  // Allow optional override of the window via the body — capped to 2 weeks.
  let hoursBack = DEFAULT_HOURS_BACK;
  if (body.hoursBack != null) {
    const n = Number(body.hoursBack);
    if (!Number.isFinite(n) || n < 1 || n > MAX_HOURS_BACK) {
      return Response.json(
        { error: `hoursBack must be a number between 1 and ${MAX_HOURS_BACK}.` },
        { status: 400 }
      );
    }
    hoursBack = Math.round(n);
  }

  // Recipient override is intentionally NOT honored — the endpoint always
  // sends to the configured address. Keeps the endpoint from being misused
  // as a relay to arbitrary inboxes.
  try {
    const result = await runDigest(sql, { hoursBack });
    if (!result.ok) {
      console.warn("[digest] runDigest failed:", result.error);
      return Response.json(result, { status: 502 });
    }
    console.log(
      `[digest] sent to=${result.recipient} clusters=${result.totalClusters} reports=${result.totalReports} msg=${result.messageId}`
    );
    return Response.json(result);
  } catch (e) {
    console.error("[digest.POST]", e);
    return Response.json({ ok: false, error: e?.message || "digest_failed" }, { status: 500 });
  }
}
