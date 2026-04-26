import { getSession } from "@auth0/nextjs-auth0";
import { getSql } from "@/lib/db";

export async function GET(request) {
    const session = await getSession(request);
    if (!session?.user?.email) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sql = getSql();
    const email = session.user.email.toLowerCase();

    const [row] = await sql`
    SELECT id, email, display_name, contact_preference
    FROM users
    WHERE email = ${email}
  `;

    if (!row) {
        return Response.json({ error: "User not found in DB" }, { status: 404 });
    }

    return Response.json({ user: row });
}