import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";

import { AppProviders } from "@/components/features/AppProviders";

import "./globals.css";

/**
 * Fonts are loaded through `next/font` so they are self-hosted, preloaded and
 * `font-display: swap` — no render-blocking request to a third party.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // `viewportFit: cover` lets the top bar and bottom nav reach into the notch
  // area; they opt back in to the safe-area insets themselves.
  viewportFit: "cover",
  themeColor: "#0B0B0D",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Aura — Cinematic Video Courses",
    template: "%s · Aura",
  },
  description:
    "Premium video courses with world-class instructors, streaming from Mux. Watch, resume, and earn a certificate.",
  applicationName: "Aura",
  openGraph: {
    type: "website",
    siteName: "Aura",
    title: "Aura — Cinematic Video Courses",
    description: "Premium video courses with world-class instructors, streaming from Mux.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aura — Cinematic Video Courses",
    description: "Premium video courses with world-class instructors, streaming from Mux.",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${fraunces.variable} ${manrope.variable}`}
      data-theme="dark"
    >
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        {/*
          First tab stop on every page. `skip-link` keeps it off-screen until
          focused, so it never disturbs the visual design.
        */}
        <a href="#main-content" className="skip-link bg-gold px-4 py-2.5 font-semibold text-gold-ink">
          Skip to main content
        </a>

        <div id="main-content" tabIndex={-1} className="flex min-h-dvh flex-col outline-none">
          <AppProviders>{children}</AppProviders>
        </div>
      </body>
    </html>
  );
}
