import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Auth0Provider } from "@auth0/nextjs-auth0";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata = {
    title: "VoiceMap",
    description: "Community issue reporting map for Bothell, WA",
    // PWA: lets iOS Safari treat the home-screen launch as a standalone app,
    // and gives both iOS and Android a clean app icon. Android reads the
    // /manifest.webmanifest from app/manifest.js for additional details.
    manifest: "/manifest.webmanifest",
    icons: {
        icon: [
            { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
            { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        ],
        apple: "/icons/apple-icon.png", // 180x180 — iOS home screen
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "VoiceMap",
    },
};

export const viewport = {
    themeColor: "#3BBFA3",
    // Prevents iOS Safari from auto-zooming when an input is focused — the
    // form fields use 13px text which iOS would otherwise zoom into.
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    viewportFit: "cover",
};

export default function RootLayout({ children }) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col" suppressHydrationWarning>
                <Auth0Provider>
                    {children}
                </Auth0Provider>
            </body>
        </html>
    );
}