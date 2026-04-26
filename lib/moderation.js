/**
 * Auto-moderation gate for new reports.
 *
 * Called from POST /api/reports before INSERT. Returns whether to allow the
 * submission and, if not, a user-safe reason to surface in the UI.
 *
 * Posture: heavy bias toward ALLOW. False rejections of real civic complaints
 * are far worse than letting through a borderline one. We reject only the
 * obvious — spam, joke entries, hate speech, sexual content, threats, and
 * targeted harassment of named private individuals.
 *
 * Failure is non-fatal: any throw, timeout, or missing OPENAI_API_KEY returns
 * { allow: true, reason: "" } and logs a warning. Mirrors lib/cluster.js.
 */
import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODERATION_MODEL || "gpt-4o-mini";
const TIMEOUT_MS = 3000;
const MAX_DESC_LEN = 4000;

let _client = null;
function client() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) return null;
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT = `You are a content gate for VoiceMap, a civic reporting app where residents report
neighborhood problems (potholes, broken streetlights, flooding, graffiti, illegal
dumping, unsafe crosswalks, and similar). Your job is to filter out reports that
are OBVIOUSLY not real civic complaints, while letting through everything else.

DEFAULT TO ALLOW. False rejections of real complaints are far worse than letting
through a borderline report. The map already tolerates duplicates, vague text,
and low-quality input — moderation is only for OBVIOUS violations.

ALWAYS ALLOW (do not reject for any of these reasons):
- Profanity used to vent frustration ("this fucking pothole has been here for months")
- ESL phrasing, typos, broken grammar, all-caps, run-on sentences
- Very short or vague descriptions ("pothole", "fire", "tree down", "help")
- Slang, regional dialect, code-switching
- Emotional, angry, or sarcastic tone
- Reports with no specific location, no duration, no context
- Reports that seem implausible but describe a possible real issue
- Reports about animals, smells, noise, encampments, accessibility
- Reports about people behaving badly in public, as long as the report describes
  a civic concern (e.g. "drug users in the park") and not a personal attack
- Reports the reporter clearly believes are real, even if you doubt them

REJECT ONLY IF OBVIOUSLY:
- spam: marketing, ads, links to products, promotional copy
- fake: fictional or joke content (sci-fi creatures, video game references,
  named celebrities not plausibly present, "Godzilla downtown")
- hate: slurs targeting people by race/religion/ethnicity/sexual orientation/
  gender identity/disability, or threats against named individuals or groups
- sexual: explicit sexual content, solicitation
- harassment: targeted attacks on a named private person ("John Smith at 123
  Main St is a [insult]") — distinct from reporting public misbehavior

When unsure: ALLOW. Set obvious_violation=false unless you are confident this
is one of the rejection classes above.

Reply with ONLY a JSON object matching this schema, no prose:
{
  "verdict": "allow" | "reject",
  "obvious_violation": true | false,
  "category": "spam" | "hate" | "sexual" | "fake" | "harassment" | "none",
  "reason": string
}

The reason field will be shown to the user. Keep it under 15 words, neutral,
non-accusatory. Examples:
- "This looks like an advertisement, not a civic issue."
- "This appears to be a joke or fictional report."
- "Reports targeting individuals by name aren't allowed."
- "" (empty string when verdict is allow)`;

const ALLOW = { allow: true, reason: "", category: "none" };

/**
 * @param {{
 *   title: string,
 *   description: string,
 *   category: string,
 *   tags?: string[],
 * }} input
 * @returns {Promise<{ allow: boolean, reason: string, category: string }>}
 */
export async function moderateReport(input) {
  const title = (input.title ?? "").trim();
  const description = (input.description ?? "").trim();
  const category = input.category ?? "";
  const tags = Array.isArray(input.tags) ? input.tags : [];

  // ── Lexical pre-check (no LLM) ─────────────────────────────────────────
  if (description.length > MAX_DESC_LEN) {
    return {
      allow: false,
      reason: "Report is too long. Please shorten it.",
      category: "size",
    };
  }
  if (!/[a-z0-9]/i.test(title)) {
    return {
      allow: false,
      reason: "Title needs at least one letter or number.",
      category: "format",
    };
  }

  // ── LLM gate ───────────────────────────────────────────────────────────
  const c = client();
  if (!c) {
    console.warn("[moderation] OPENAI_API_KEY not set; allowing by default");
    return ALLOW;
  }

  const userMsg =
    `Category: ${category}\n` +
    `Tags: ${tags.length ? tags.join(", ") : "(none)"}\n` +
    `Title: ${title}\n` +
    `Description:\n${description}\n\n` +
    `Decide.`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  let raw;
  try {
    const completion = await c.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        temperature: 0,
        max_tokens: 120,
        response_format: { type: "json_object" },
      },
      { signal: ac.signal }
    );
    raw = completion.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.warn("[moderation] OpenAI call failed; allowing:", e?.message ?? e);
    return ALLOW;
  } finally {
    clearTimeout(timer);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[moderation] non-JSON response; allowing. raw=", raw?.slice(0, 200));
    return ALLOW;
  }

  // Both signals must trip to reject — guards against the model getting one
  // dimension subtly wrong.
  const reject =
    parsed?.verdict === "reject" && parsed?.obvious_violation === true;
  if (!reject) return ALLOW;

  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : "This report couldn't be posted. Try rephrasing.";

  const cat =
    typeof parsed.category === "string" && parsed.category
      ? parsed.category
      : "none";

  return { allow: false, reason, category: cat };
}
