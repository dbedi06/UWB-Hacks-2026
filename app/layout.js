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