/**
 * Admin gating — single source of truth for "is this user an admin".
 * V1 uses an env-var allowlist (`ADMIN_EMAILS`, comma-separated). Easy
 * to update without DB migrations. Could later move to a `users.is_admin`
 * column or Auth0 roles.
 */
import { auth0 } from "@/lib/auth0";

/** Parsed allowlist — lazily initialized so changes to .env.local on
 *  dev-server restart take effect without code changes. */
function adminEmails() {
  const raw = process.env.ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** @param {string | null | undefined} email */
export function isAdminEmail(email) {
  if (!email) return false;
  return adminEmails().has(String(email).toLowerCase());
}

/**
 * Convenience: read the Auth0 session and return { session, isAdmin }.
 * Returns { session: null, isAdmin: false } when there's no session.
 */
export async function getAdminSession() {
  const session = await auth0.getSession();
  if (!session?.user?.email) return { session: null, isAdmin: false };
  return { session, isAdmin: isAdminEmail(session.user.email) };
}
