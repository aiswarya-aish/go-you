import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (the offline screen's file): builds never fetch Google Fonts, whose newer URLs broke a Vercel build (2026-11-16).
// One variable file, latin, weights 300-700 (Space Grotesk tops out at 700, so no faux bold).
const spaceGrotesk = localFont({
  src: "../public/fonts/space-grotesk-latin.woff2",
  weight: "300 700",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: { default: "GO—YOU", template: "%s — GO—YOU" },
  description: "Train. Log. Progress.",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  // iOS has no manifest-based install: these make "Add to Home Screen" open full screen with the right name.
  appleWebApp: { capable: true, title: "GO—YOU", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover", // lets the bottom bar respect the home indicator
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body>{children}</body>
    </html>
  );
}
