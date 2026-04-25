import { getSql } from "@/lib/db";
import {
  buildReportDescription,
  mapReportRowToClient,
  parseUuid,
  ISSUE_KEYS,
  uiSeverityToDb,
} from "@/lib/reports";
import { findDuplicateCluster } from "@/lib/cluster";

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
 * GET: active reports in a lat/lng bounding box.
 * Inlines the same filters as `get_reports_in_bounds` (DB/schemav2.sql) so we do not
 * cast to enum types in SQL — avoids `severity_level` / search_path issues on some connections.
 */
export async function GET(request) {
  const sql = getSql();
  if (!sql) {
    return Response.json(DB_UNCONFIGURED, { status: 503 });
  }

  const bounds = getBoundsFromUrl(request) ?? { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 };

  try {
    // Group by effective cluster id (COALESCE(cluster_id, id)). Return one
    // representative row per cluster — the most recent member — annotated
    // with report_count for the count badge in the pin SVG.
    const rows = await sql`
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
          AND r.lat BETWEEN ${bounds.minLat}::double precision AND ${bounds.maxLat}::double precision
          AND r.lng BETWEEN ${bounds.minLng}::double precision AND ${bounds.maxLng}::double precision
      )
      SELECT * FROM ranked WHERE rn = 1 ORDER BY reported_at DESC
    `;
    const reports = rows.map((row) => mapReportRowToClient(row));
    return Response.json({ reports });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Failed to load reports." }, { status: 500 });
  }
}

/**
 * POST: insert a report and apply user-chosen priority via `set_report_severity` (schemav2).
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

  if (!userUuid && !sessionToken) {
    return Response.json(
      { error: "Provide a valid userId (UUID) or sessionToken (UUID) for anonymous reports." },
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

  // Optional AI-extracted columns added in schema PR #2.
  // tags must be lower_snake_case strings; cap at 8 to keep rows lean.
  const tags = Array.isArray(body.tags)
    ? body.tags
        .filter((t) => typeof t === "string" && /^[a-z][a-z0-9_]*$/.test(t))
        .slice(0, 8)
    : [];
  const confidence =
    typeof body.confidence === "number" && body.confidence >= 0 && body.confidence <= 1
      ? body.confidence
      : null;
  const duration =
    typeof body.duration === "string" && body.duration.trim()
      ? body.duration.trim()
      : null;

  const dbSev = uiSeverityToDb(sev);

  // Semantic dedup: if a nearby report is the same incident, attach this
  // row to that cluster instead of starting a new one. Failures here are
  // non-fatal — fall through with clusterId=null and let this row be its
  // own cluster head.
  let clusterId = null;
  try {
    clusterId = await findDuplicateCluster(sql, {
      lat,
      lng,
      description: descriptionText,
      category,
      tags,
    });
  } catch (e) {
    console.warn("[reports.POST] dedup check failed; inserting as new cluster:", e?.message ?? e);
  }

  try {
    const [row] = await sql`
      WITH new_row AS (
        INSERT INTO reports (
          user_id, session_token, lat, lng, category, description,
          tags, confidence, duration, cluster_id
        )
        VALUES (
          ${userUuid}::uuid,
          ${sessionToken}::uuid,
          ${lat}::double precision,
          ${lng}::double precision,
          ${category}::varchar(100),
          ${descriptionText}::text,
          ${tags}::text[],
          ${confidence}::real,
          ${duration}::text,
          ${clusterId}::uuid
        )
        RETURNING id
      )
      SELECT * FROM set_report_severity((SELECT id FROM new_row), ${dbSev}::severity_level)
    `;

    if (!row) {
      return Response.json({ error: "Failed to create report." }, { status: 500 });
    }

    const report = mapReportRowToClient(row);
    return Response.json({ report, id: report.id });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Failed to save report." }, { status: 500 });
  }
}
