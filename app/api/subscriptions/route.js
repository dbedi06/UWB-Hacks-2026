import { getSql } from "@/lib/db";
import { ISSUE_KEYS, parseUuid, uiSeverityToDb } from "@/lib/reports";
import { normalizeE164 } from "@/lib/sms";
import { normalizeEmail } from "@/lib/email";

const DB_UNCONFIGURED = {
  error: "Database not configured.",
};

const RADIUS_MIN = 100; // 100m floor — anything tighter is jitter
const RADIUS_MAX = 100_000; // 100km ceiling — at this scale, just opt into "all"

const PREFS = new Set(["email", "sms", "both"]);

/**
 * POST: create a subscription.
 * Body: {
 *   contact_preference: 'email' | 'sms' | 'both',
 *   email?: string,        // required for email, both
 *   phone?: string,        // required for sms, both
 *   lat, lng, radius_meters, min_severity?, category_filter?,
 *   userId?: string        // optional Neon user UUID
 * }
 * Returns: { id, dedup?: true }
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

  const prefRaw = typeof body.contact_preference === "string" ? body.contact_preference.toLowerCase() : "sms";
  if (!PREFS.has(prefRaw)) {
    return Response.json(
      { error: "contact_preference must be email, sms, or both." },
      { status: 400 }
    );
  }
  const contactPref = /** @type {"email" | "sms" | "both"} */ (prefRaw);

  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const phone = normalizeE164(typeof body.phone === "string" ? body.phone : "");

  if (contactPref === "email" && !email) {
    return Response.json({ error: "A valid email is required for email alerts." }, { status: 400 });
  }
  if (contactPref === "sms" && !phone) {
    return Response.json(
      { error: "A valid phone number is required (E.164 format) for SMS alerts." },
      { status: 400 }
    );
  }
  if (contactPref === "both" && (!email || !phone)) {
    return Response.json(
      { error: "Both email and phone are required when contact_preference is 'both'." },
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

  const userId = parseUuid(body.userId ?? body.user_id);

  /** Primary row key for contact_override: phone for sms/both, email for email-only */
  const contactOverride =
    contactPref === "email" ? email : phone;

  const contactEmail = contactPref === "both" ? email : null;

  const radiusInt = Math.round(radius);

  try {
    // Dedup: same preference + same geo + same radius + same contact(s)
    let existing;
    if (contactPref === "email") {
      existing = await sql`
        SELECT id::text AS id
        FROM subscriptions
        WHERE contact_preference = 'email'
          AND LOWER(TRIM(contact_override)) = ${email}
          AND (contact_email IS NULL OR contact_email = '')
          AND ABS(center_lat - ${lat}::double precision) < 0.00001
          AND ABS(center_lng - ${lng}::double precision) < 0.00001
          AND radius_meters = ${radiusInt}
        LIMIT 1
      `;
    } else if (contactPref === "sms") {
      existing = await sql`
        SELECT id::text AS id
        FROM subscriptions
        WHERE contact_preference = 'sms'
          AND contact_override = ${phone}::varchar(255)
          AND (contact_email IS NULL OR contact_email = '')
          AND ABS(center_lat - ${lat}::double precision) < 0.00001
          AND ABS(center_lng - ${lng}::double precision) < 0.00001
          AND radius_meters = ${radiusInt}
        LIMIT 1
      `;
    } else {
      existing = await sql`
        SELECT id::text AS id
        FROM subscriptions
        WHERE contact_preference = 'both'
          AND contact_override = ${phone}::varchar(255)
          AND LOWER(TRIM(COALESCE(contact_email, ''))) = ${email}
          AND ABS(center_lat - ${lat}::double precision) < 0.00001
          AND ABS(center_lng - ${lng}::double precision) < 0.00001
          AND radius_meters = ${radiusInt}
        LIMIT 1
      `;
    }

    if (existing.length > 0) {
      return Response.json({ id: existing[0].id, dedup: true });
    }

    if (userId) {
      const [row] = await sql`
        INSERT INTO subscriptions (
          user_id, contact_override, contact_email, contact_preference,
          center_lat, center_lng, radius_meters,
          category_filter, min_severity
        )
        VALUES (
          ${userId}::uuid,
          ${contactOverride}::varchar(255),
          ${contactEmail}::varchar(255),
          ${contactPref}::contact_preference,
          ${lat}::double precision,
          ${lng}::double precision,
          ${radiusInt}::int,
          ${categoryFilter}::text[],
          ${minSeverity}::severity_level
        )
        RETURNING id::text AS id
      `;
      return Response.json({ id: row.id });
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
        ${contactPref}::contact_preference,
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
    // Helpful if migration 003 (contact_email) not applied
    if (e?.code === "42703" || /contact_email/.test(String(e?.message || ""))) {
      return Response.json(
        { error: "Database is missing column contact_email. Run DB/003_subscriptions_contact_email.sql on Neon." },
        { status: 503 }
      );
    }
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
