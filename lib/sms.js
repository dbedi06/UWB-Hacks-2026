/**
 * Twilio SMS sender — minimal wrapper around the REST API.
 *
 * Returns { ok, sid } on success, { ok: false, error, status } otherwise.
 * Never throws. Mirrors the lazy/fail-open pattern of lib/cluster.js so
 * report submission never breaks because Twilio is misconfigured.
 *
 * Trial accounts can only message verified Caller IDs. Failures (401/422)
 * are logged but not surfaced to the user — the moderation gate already
 * passed; the report itself is saved.
 */

const TIMEOUT_MS = 5000;

/** Strip non-digits, prepend +1 for 10-digit US numbers, else +. */
export function normalizeE164(raw) {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const candidate =
    raw.trim().startsWith("+")
      ? `+${digits}`
      : digits.length === 10
      ? `+1${digits}`
      : `+${digits}`;
  return /^\+\d{10,15}$/.test(candidate) ? candidate : null;
}

function creds() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  // WhatsApp sandbox bypasses US toll-free verification entirely.
  // Set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886 (Twilio's sandbox From)
  // and recipients join with "join <word>" once. If unset, fall back to SMS.
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  const smsFrom = process.env.TWILIO_FROM_NUMBER;
  const from = whatsappFrom || smsFrom;
  if (!sid || !token || !from) return null;
  return { sid, token, from, isWhatsApp: Boolean(whatsappFrom) };
}

/**
 * @param {{ to: string, body: string }} input
 * @returns {Promise<{ ok: true, sid: string } | { ok: false, error: string, status?: number }>}
 */
export async function sendSms({ to, body }) {
  const c = creds();
  if (!c) {
    console.warn("[sms] Twilio creds not set; skipping send");
    return { ok: false, error: "twilio_unconfigured" };
  }

  const e164 = normalizeE164(to);
  if (!e164) {
    return { ok: false, error: "invalid_phone" };
  }

  const params = new URLSearchParams({
    From: c.from,
    To: c.isWhatsApp ? `whatsapp:${e164}` : e164,
    Body: body,
  });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${c.sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: ac.signal,
      }
    );

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: json?.message || `twilio_${res.status}`,
        status: res.status,
      };
    }
    return { ok: true, sid: json.sid };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : e?.message || "fetch_failed" };
  } finally {
    clearTimeout(timer);
  }
}
