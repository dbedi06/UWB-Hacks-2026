import { getSql } from "@/lib/db";
import {
  buildReportDescription,
  mapReportRowToClient,
  parseUuid,
  ISSUE_KEYS,
  ISSUE_KEY_TO_NAME,
  sessionAnonEmail,
} from "@/lib/reports";

const SEVERITY_UI = new Set(["low", "medium", "high", "emergency"]);

const DB_UNCONFIGURED = {
  error:
    "Database not configured. Set DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL in .env.local (or your host’s environment).",
};

function getBoundsFromUrl(request) {
  const u = new URL(request.url);
  const minLat = parseFloat(u.searchParams.get("minLat") ?? "-90");
  const maxLat = parseFloat(u.searchParams.get("maxLat") ?? "90");
  const minLng = parseFloat(u.searchParams.get("minLng") ?? "-180");
  const maxLng = parseFloat(u.searchParams.get("maxLng") ?? "180");
  if (![minLat, maxLat, minLng, maxLng].every((n) => Number.isFinite(n))) {
    return null;
  }
  if (minLat > maxLat || minLng > maxLng) return null;
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * GET: reports in a lat/lng bounding box (`DB/schema.sql`: `report` + `issue_type`).
 */
export async function GET(request) {
  const sql = getSql();
  if (!sql) {
    return Response.json(DB_UNCONFIGURED, { status: 503 });
  }

  const bounds = getBoundsFromUrl(request) ?? { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 };

  try {
    const rows = await sql`
      SELECT
        r.id,
        r.latitude,
        r.longitude,
        r.severity_level_id,
        r.description,
        it.name AS issue_type_name
      FROM report r
      INNER JOIN issue_type it ON it.id = r.issue_type_id
      WHERE
        r.latitude BETWEEN ${bounds.minLat}::double precision AND ${bounds.maxLat}::double precision
        AND r.longitude BETWEEN ${bounds.minLng}::double precision AND ${bounds.maxLng}::double precision
      ORDER BY r.id DESC
    `;
    const reports = rows.map((row) => mapReportRowToClient(row));
    return Response.json({ reports });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Failed to load reports." }, { status: 500 });
  }
}

/**
 * POST: insert one `report` row; resolve or create `app_user` (see `DB/schema.sql`).
 * Anonymous: `sessionToken` UUID → stable `anon+<token>@voicemap.local` identity.
 */
export async function POST(request) {
  const sql = getSql();
  if (!sql) {
    return Response.json(DB_UNCONFIGURED, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const lat = typeof body.lat === "number" ? body.lat : body.latitude;
  const lng = typeof body.lng === "number" ? body.lng : body.longitude;

  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: "lat and lng (or latitude and longitude) are required numbers." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title : body.description;
  if (typeof title !== "string" || !title.trim()) {
    return Response.json({ error: "title (short description) is required." }, { status: 400 });
  }

  const category = body.category;
  if (typeof category !== "string" || !ISSUE_KEYS.has(category)) {
    return Response.json({ error: "Invalid category." }, { status: 400 });
  }

  const sev = body.severity;
  if (typeof sev !== "string" || !SEVERITY_UI.has(sev)) {
    return Response.json({ error: "Invalid severity (use low, medium, high, or emergency)." }, { status: 400 });
  }

  const userUuid = parseUuid(body.userId ?? body.user_id ?? body.reporterUserId);
  const sessionToken = parseUuid(body.sessionToken ?? body.session_token);

  const email = typeof body.reporter?.email === "string" && body.reporter.email.trim() ? body.reporter.email.trim() : null;
  const phone = typeof body.reporter?.phone === "string" && body.reporter.phone.trim() ? body.reporter.phone.trim() : null;
  const displayName =
    typeof body.reporter?.displayName === "string" && body.reporter.displayName.trim()
      ? body.reporter.displayName.trim()
      : null;

  if (!userUuid && !email && !phone && !sessionToken) {
    return Response.json(
      { error: "Provide userId, reporter email/phone, or sessionToken for identity." },
      { status: 400 }
    );
  }

  const descriptionText = buildReportDescription({
    title: title.trim(),
    impactSummary: body.impactSummary ?? body.impact_summary,
    otherIssueKey: category,
    otherIssueLabel: body.otherIssueLabel ?? body.other_type,
    transcript: body.transcript,
  });

  const typeName = ISSUE_KEY_TO_NAME[category];
  if (!typeName) {
    return Response.json({ error: "Invalid category." }, { status: 400 });
  }

  try {
    let userId;
    let existing = null;

    if (userUuid) {
      [existing] = await sql`SELECT id FROM app_user WHERE id = ${userUuid}::uuid LIMIT 1`;
    }
    if (!existing && email) {
      [existing] = await sql`SELECT id FROM app_user WHERE email = ${email} LIMIT 1`;
    }
    if (!existing && phone) {
      [existing] = await sql`SELECT id FROM app_user WHERE phone = ${phone} LIMIT 1`;
    }
    if (!existing && sessionToken) {
      const anonEmail = sessionAnonEmail(sessionToken);
      [existing] = await sql`SELECT id FROM app_user WHERE email = ${anonEmail} LIMIT 1`;
    }

    if (existing) {
      userId = existing.id;
      if (displayName) {
        await sql`
          UPDATE app_user
          SET latitude = ${lat}, longitude = ${lng}, display_name = ${displayName}
          WHERE id = ${userId}
        `;
      } else {
        await sql`
          UPDATE app_user
          SET latitude = ${lat}, longitude = ${lng}
          WHERE id = ${userId}
        `;
      }
    } else {
      const insertEmail = email || (sessionToken ? sessionAnonEmail(sessionToken) : null);
      if (!insertEmail && !phone) {
        return Response.json({ error: "Could not resolve app_user identity." }, { status: 400 });
      }
      const [inserted] = await sql`
        INSERT INTO app_user (latitude, longitude, email, phone, display_name)
        VALUES (${lat}, ${lng}, ${insertEmail}, ${phone}, ${displayName})
        RETURNING id
      `;
      userId = inserted.id;
    }

    const [typeRow] = await sql`SELECT id FROM issue_type WHERE name = ${typeName} LIMIT 1`;
    if (!typeRow) {
      return Response.json({ error: `Unknown issue type: ${typeName}` }, { status: 500 });
    }

    const [row] = await sql`
      INSERT INTO report (user_id, latitude, longitude, severity_level_id, description, issue_type_id)
      VALUES (
        ${userId}::uuid,
        ${lat}::double precision,
        ${lng}::double precision,
        ${sev},
        ${descriptionText}::text,
        ${typeRow.id}
      )
      RETURNING id
    `;

    const [join] = await sql`
      SELECT
        r.id,
        r.latitude,
        r.longitude,
        r.severity_level_id,
        r.description,
        it.name AS issue_type_name
      FROM report r
      INNER JOIN issue_type it ON it.id = r.issue_type_id
      WHERE r.id = ${row.id}::uuid
    `;

    const report = { ...mapReportRowToClient(join), created_at: new Date().toISOString() };
    return Response.json({ report, id: report.id, userId });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Failed to save report." }, { status: 500 });
  }
}
