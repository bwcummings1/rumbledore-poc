import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { PWA_BACKGROUND_HEX } from "@/lib/pwa";
import { NavigationShell } from "@/navigation/navigation-shell";
import { DEFAULT_THEME_ID } from "@/theme/registry";
import { ThemeTokenStyle } from "@/theme/theme-style";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rumbledore",
  description:
    "Your fantasy league's home base — history, records, news, AI takes, and paper betting.",
  applicationName: "Rumbledore",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rumbledore",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: PWA_BACKGROUND_HEX,
  // Draw edge-to-edge on notched devices; content opts back in via safe-area utilities.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME_ID}
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <ThemeTokenStyle />
        <NavigationShell>{children}</NavigationShell>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
