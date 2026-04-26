import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Singleton — reads AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET /
// AUTH0_SECRET / APP_BASE_URL from process.env. The middleware in
// middleware.js mounts /auth/login, /auth/logout, /auth/callback,
// /auth/profile, /auth/access-token automatically.
export const auth0 = new Auth0Client();
