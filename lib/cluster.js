/**
 * Semantic deduplication of new reports against nearby existing ones.
 *
 * Called synchronously from POST /api/reports before INSERT. Returns the
 * effective_cluster_id of an existing cluster the new report belongs to,
 * or null if no match (in which case the new row becomes its own cluster
 * head).
 *
 * Match rules (chosen by user):
 *   - within 100m of the new report (Haversine)
 *   - description sounds similar to a candidate (LLM judgment)
 *   - same category preferred but NOT required
 *   - no time-window filter
 *
 * Costs: at most ONE gpt-4o-mini call per submission, ~$0.001 each, on
 * top of an indexed bbox-narrowed Postgres query. Failure is non-fatal:
 * if the LLM is down or anything throws, we return null and let the
 * caller insert a fresh cluster head.
 */
import OpenAI from "openai";

const RADIUS_METERS = 100;
const MAX_CANDIDATES = 5;
const MODEL = process.env.OPENAI_DEDUP_MODEL || "gpt-4o-mini";

let _client = null;
function client() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) return null;
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT =
  "You are a deduplication assistant for a civic reporting app. " +
  "Given a NEW report and a list of NEARBY existing reports, decide if the new one " +
  "describes the SAME real-world incident as any of them. " +
  "Two reports are 'the same incident' if a city worker triaging the queue would " +
  "treat them as duplicate complaints about the same physical thing — same broken " +
  "streetlight, same pothole, same animal, same person, same intersection. " +
  "Same category is suggestive but NOT required: 'graffiti' and 'vandalism' can be " +
  "the same incident; 'pothole' and 'flooding at the same crack' can be the same. " +
  "Different physical objects at the same intersection are SEPARATE incidents. " +
  "Reply with ONLY the cluster_id of the matching candidate (a UUID exactly as " +
  'shown), or the literal word "NEW" if it is a different incident. No prose, no ' +
  "explanation.";

/**
 * @param {*} sql              tagged-template SQL client from getSql()
 * @param {{
 *   lat: number, lng: number,
 *   description: string,
 *   category: string,
 *   tags?: string[]
 * }} input
 * @returns {Promise<string|null>} effective_cluster_id of matched cluster, or null
 */
export async function findDuplicateCluster(sql, input) {
  const { lat, lng, description, category, tags } = input;

  let candidates;
  try {
    // Within 100m via Haversine. Same-category candidates ranked first, then any.
    candidates = await sql`
      SELECT
        id::text         AS id,
        COALESCE(cluster_id, id)::text AS effective_cluster,
        category,
        description
      FROM reports
      WHERE status NOT IN ('resolved', 'dismissed')
        AND (6371000 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS(lat - ${lat}::double precision) / 2), 2) +
              COS(RADIANS(${lat}::double precision)) * COS(RADIANS(lat)) *
              POWER(SIN(RADIANS(lng - ${lng}::double precision) / 2), 2)
            ))) <= ${RADIUS_METERS}
      ORDER BY (CASE WHEN category = ${category} THEN 0 ELSE 1 END),
               reported_at DESC
      LIMIT ${MAX_CANDIDATES}
    `;
  } catch (e) {
    console.warn("[cluster] candidate query failed; treating as no candidates:", e?.message ?? e);
    return null;
  }

  if (!candidates || candidates.length === 0) return null;

  const c = client();
  if (!c) {
    console.warn("[cluster] OPENAI_API_KEY not set; skipping LLM dedup");
    return null;
  }

  const userMsg =
    `NEW report:\n` +
    `  category: ${category}\n` +
    `  tags: ${(tags && tags.length) ? tags.join(", ") : "(none)"}\n` +
    `  description: ${description}\n\n` +
    `NEARBY existing reports (within ${RADIUS_METERS}m, ranked: same-category first):\n` +
    candidates
      .map(
        (r, i) =>
          `[${i + 1}] cluster_id=${r.effective_cluster} category=${r.category}\n     description: ${r.description}`
      )
      .join("\n\n") +
    `\n\nReply with ONLY the cluster_id of the matching candidate, or "NEW".`;

  let reply;
  try {
    const completion = await c.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0,
      max_tokens: 60,
    });
    reply = completion.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    console.warn("[cluster] OpenAI call failed; treating as NEW:", e?.message ?? e);
    return null;
  }

  if (!reply || reply.toUpperCase().includes("NEW")) return null;

  // Hallucination guard: model must echo back one of the candidate UUIDs.
  // Strip any quoting / surrounding noise and look for a UUID-shaped token.
  const uuidMatch = reply.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );
  const candidate = uuidMatch ? uuidMatch[0] : null;
  if (!candidate) return null;
  const matched = candidates.find((r) => r.effective_cluster === candidate);
  return matched ? matched.effective_cluster : null;
}
