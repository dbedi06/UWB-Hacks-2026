import { getSql } from "@/lib/db";

const SYNC_SECRET = process.env.AUTH0_SYNC_SECRET;

export async function POST(request) {
  // Verify the shared secret
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${SYNC_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  if (!sql) {
    return Response.json({ error: "Database not configured." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : null;

  if (!email) {
    return Response.json({ error: "email is required." }, { status: 400 });
  }

  try {
    // Upsert: insert if email doesn't exist, update display_name if it does.
    // phone and contact_preference are left untouched on conflict so users
    // can update them in-app without Auth0 overwriting them.
    const [row] = await sql`
      INSERT INTO users (email, display_name, contact_preference)
      VALUES (
        ${email},
        ${displayName},
        'email'
      )
      ON CONFLICT (email) DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, users.display_name)
      RETURNING id, email, display_name, contact_preference, created_at
    `;

    return Response.json({ user: row });
  } catch (e) {
    console.error("[auth/sync] DB error:", e);
    return Response.json({ error: "Failed to sync user." }, { status: 500 });
  }
}
