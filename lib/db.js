import { neon } from "@neondatabase/serverless";

let _sql;

/**
 * Resolves a Postgres connection string (Neon, Vercel Postgres, or plain `DATABASE_URL`).
 * Uses bracket access so the value is read at runtime (not inlined empty at build time).
 */
export function getDatabaseUrl() {
  const candidates = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "NEON_DATABASE_URL",
  ];
  for (const name of candidates) {
    const v = process.env[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function getSql() {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (!_sql) _sql = neon(url);
  return _sql;
}
