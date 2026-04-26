import { auth0 } from "@/lib/auth0";

export async function middleware(request) {
  return await auth0.middleware(request);
}

export const config = {
  // Run on every request EXCEPT Next.js static assets and the favicon —
  // anything else might need session lookup or auth dispatch.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
