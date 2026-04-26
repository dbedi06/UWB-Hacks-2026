import { getSql } from "@/lib/db";
import { ISSUE_KEYS, parseUuid, uiSeverityToDb } from "@/lib/reports";
import { normalizeE164 } from "@/lib/sms";

const DB_UNCONFIGURED = {
  error: "Database not configured.",
};

const RADIUS_MIN = 100;       // 100m floor — anything tighter is jitter
const RADIUS_MAX = 100_000;   // 100km ceiling — at this scale, just opt into "all"

/**
 * POST: create a subscription.
 * Body: { phone, lat, lng, radius_meters, min_severity?, category_filter? }
 * Returns: { id }
 */
export async function POST(request) {
  const sql = getSql();
  if (!sql) return Response.json(DB_UNCONFIGURED, { status: 503 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const phone = normalizeE164(body.phone);
  if (!phone) {
    return Response.json(
      { error: "A valid phone number is required (E.164 format)." },
      { status: 400 }
    );
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "lat and lng must be valid coordinates." }, { status: 400 });
  }

  const radius = Number(body.radius_meters);
  if (!Number.isFinite(radius) || radius < RADIUS_MIN || radius > RADIUS_MAX) {
    return Response.json(
      { error: `radius_meters must be between ${RADIUS_MIN} and ${RADIUS_MAX}.` },
      { status: 400 }
    );
  }

  let minSeverity = null;
  if (body.min_severity != null) {
    const dbSev = uiSeverityToDb(body.min_severity);
    if (!dbSev) {
      return Response.json({ error: "Invalid min_severity." }, { status: 400 });
    }
    minSeverity = dbSev;
  }

  let categoryFilter = null;
  if (Array.isArray(body.category_filter) && body.category_filter.length > 0) {
    const filtered = body.category_filter.filter((c) => typeof c === "string" && ISSUE_KEYS.has(c));
    if (filtered.length === 0) {
      return Response.json({ error: "category_filter contains no valid categories." }, { status: 400 });
    }
    categoryFilter = filtered;
  }

  try {
    // Don't create duplicate rows when the same (phone, lat, lng, radius)
    // tuple already exists — return the existing id instead. Prevents the
    // SMS dispatcher from sending two messages to the same number when the
    // user clicks Subscribe twice.
    const radiusInt = Math.round(radius);
    const existing = await sql`
      SELECT id::text AS id
      FROM subscriptions
      WHERE contact_override = ${phone}::varchar(255)
        AND ABS(center_lat - ${lat}::double precision) < 0.00001
        AND ABS(center_lng - ${lng}::double precision) < 0.00001
        AND radius_meters = ${radiusInt}
      LIMIT 1
    `;
    if (existing.length > 0) {
      return Response.json({ id: existing[0].id, dedup: true });
    }

    const [row] = await sql`
      INSERT INTO subscriptions (
        contact_override, contact_preference,
        center_lat, center_lng, radius_meters,
        category_filter, min_severity
      )
      VALUES (
        ${phone}::varchar(255),
        'sms'::contact_preference,
        ${lat}::double precision,
        ${lng}::double precision,
        ${radiusInt}::int,
        ${categoryFilter}::text[],
        ${minSeverity}::severity_level
      )
      RETURNING id::text AS id
    `;
    return Response.json({ id: row.id });
  } catch (e) {
    console.error("[subscriptions.POST]", e);
    return Response.json({ error: "Failed to create subscription." }, { status: 500 });
  }
}

/**
 * DELETE: remove a subscription by id.
 * Auth model: possession of the UUID is the credential (magic-link unsubscribe).
 */
export async function DELETE(request) {
  const sql = getSql();
  if (!sql) return Response.json(DB_UNCONFIGURED, { status: 503 });

  const id = parseUuid(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return Response.json({ error: "id (UUID) query param required." }, { status: 400 });
  }

  try {
    const rows = await sql`DELETE FROM subscriptions WHERE id = ${id}::uuid RETURNING id`;
    if (rows.length === 0) {
      return Response.json({ error: "Subscription not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[subscriptions.DELETE]", e);
    return Response.json({ error: "Failed to delete subscription." }, { status: 500 });
  }
}
