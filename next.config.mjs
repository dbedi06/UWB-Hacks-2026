/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@neondatabase/serverless"],

  // Allow the Next.js dev server to accept requests proxied through tunnels
  // (cloudflared / ngrok) and any LAN IP. Production builds ignore this.
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io",
  ],
};

export default nextConfig;
