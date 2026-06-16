import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { PWA_BACKGROUND_HEX } from "@/lib/pwa";
import { NavigationShell } from "@/navigation/navigation-shell";
import { coerceThemeId, getDefaultTheme, getThemeById } from "@/theme/registry";
import { THEME_COOKIE_NAME } from "@/theme/settings";
import { ThemeProvider } from "@/theme/theme-provider";
import { ThemePreloadScript } from "@/theme/theme-script";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialTheme = await getInitialTheme();

  return (
    <html
      lang="en"
      data-theme={initialTheme.id}
      className={`${geistSans.variable} ${geistMono.variable} ${initialTheme.mode}`}
      style={{ colorScheme: initialTheme.colorScheme }}
      suppressHydrationWarning
    >
      <body>
        <ThemePreloadScript initialThemeId={initialTheme.id} />
        <ThemeTokenStyle />
        <ThemeProvider initialThemeId={initialTheme.id}>
          <NavigationShell>{children}</NavigationShell>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

async function getInitialTheme() {
  const cookieStore = await cookies();
  const themeId = coerceThemeId(cookieStore.get(THEME_COOKIE_NAME)?.value);
  return getThemeById(themeId) ?? getDefaultTheme();
}
