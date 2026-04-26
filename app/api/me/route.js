import { auth0 } from "@/lib/auth0";
import { getSql } from "@/lib/db";

export async function GET() {
    // v4: getSession() reads from middleware-injected context, no request arg.
    const session = await auth0.getSession();
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
