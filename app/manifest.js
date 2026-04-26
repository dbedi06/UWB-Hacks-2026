// Next.js App Router metadata route — served at /manifest.webmanifest.
// https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
export default function manifest() {
  return {
    name: "VoiceMap",
    short_name: "VoiceMap",
    description: "Voice your neighborhood's problems. We pin them on the map and alert nearby.",
    start_url: "/",
    display: "standalone",       // hides browser chrome when launched from home screen
    orientation: "portrait",
    background_color: "#0d1117", // matches T.pageBg in dark mode (default)
    theme_color: "#3BBFA3",      // app's primary brand color — colors the status bar on Android
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}
