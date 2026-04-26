import { getSql } from "@/lib/db";
import { ISSUE_KEYS, parseUuid, uiSeverityToDb } from "@/lib/reports";
import { normalizeE164 } from "@/lib/sms";

const DB_UNCONFIGURED = {
  error: "Database not configured.",
};

const RADIUS_MIN = 100;       // 100m floor — anything tighter is jitter
const RADIUS_MAX = 100_000;   // 100km ceiling — at this scale, just opt into "all"

const CONTACT_PREFS = new Set(["email", "sms", "both"]);

/** RFC 5322-lite — good enough for hackathon validation. */
function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s.length === 0 || s.length > 255) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

/**
 * POST: create a subscription.
 * Body: {
 *   contact_preference?: 'email' | 'sms' | 'both',   // default 'sms'
 *   phone?: string,        // required when preference is 'sms' or 'both'
 *   email?: string,        // required when preference is 'email' or 'both'
 *   lat: number, lng: number,
 *   radius_meters: number,
 *   min_severity?: string,
 *   category_filter?: string[],
 * }
 * Returns: { id, dedup?: boolean }
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

  const prefRaw = typeof body.contact_preference === "string"
    ? body.contact_preference.trim().toLowerCase()
    : "sms";
  if (!CONTACT_PREFS.has(prefRaw)) {
    return Response.json(
      { error: "contact_preference must be email, sms, or both." },
      { status: 400 }
    );
  }
  /** @type {'email'|'sms'|'both'} */
  const contactPreference = prefRaw;

  const phone =
    typeof body.phone === "string" && body.phone.trim()
      ? normalizeE164(body.phone)
      : null;
  const email =
    typeof body.email === "string" && body.email.trim()
      ? normalizeEmail(body.email)
      : null;

  if ((contactPreference === "sms" || contactPreference === "both") && !phone) {
    return Response.json(
      { error: "A valid phone number (E.164 format) is required for SMS alerts." },
      { status: 400 }
    );
  }
  if ((contactPreference === "email" || contactPreference === "both") && !email) {
    return Response.json(
      { error: "A valid email address is required for email alerts." },
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

  // Per-channel column writes — only set the channel we'll actually use.
  const contactOverride = contactPreference === "email" ? null : phone;
  const contactEmail = contactPreference === "sms" ? null : email;

  try {
    // Dedup: if the same (recipient + watch area + radius) already exists,
    // return that row's id instead of inserting a new one. Prevents repeat
    // notifications when the user re-submits the same form. Keying logic:
    //   - sms: phone + lat + lng + radius
    //   - email: email + lat + lng + radius
    //   - both: all of the above
    const radiusInt = Math.round(radius);
    const existing = await sql`
      SELECT id::text AS id
      FROM subscriptions
      WHERE contact_preference = ${contactPreference}::contact_preference
        AND (${contactOverride}::varchar(255) IS NULL OR contact_override = ${contactOverride}::varchar(255))
        AND (${contactEmail}::varchar(255) IS NULL OR contact_email = ${contactEmail}::varchar(255))
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
        contact_override, contact_email, contact_preference,
        center_lat, center_lng, radius_meters,
        category_filter, min_severity
      )
      VALUES (
        ${contactOverride}::varchar(255),
        ${contactEmail}::varchar(255),
        ${contactPreference}::contact_preference,
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
