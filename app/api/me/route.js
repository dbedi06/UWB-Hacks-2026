import { auth0 } from "@/lib/auth0";
import { getSql } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

export async function GET() {
    // v4: getSession() reads from middleware-injected context, no request arg.
    const session = await auth0.getSession();
    if (!session?.user?.email) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sql = getSql();
    const email = session.user.email.toLowerCase();
    const isAdmin = isAdminEmail(email);

    const [row] = await sql`
    SELECT id, email, display_name, contact_preference
    FROM users
    WHERE email = ${email}
  `;

    // If the Neon row doesn't exist yet (Auth0 sync hasn't fired), still
    // return enough info for the UI to act on — most importantly the
    // is_admin flag so admin gating doesn't silently fail.
    if (!row) {
        return Response.json({
            user: {
                id: null,
                email,
                display_name: session.user.name || email,
                contact_preference: null,
                is_admin: isAdmin,
                neon_synced: false,
            },
        });
    }

    return Response.json({
        user: { ...row, is_admin: isAdmin, neon_synced: true },
    });
}
