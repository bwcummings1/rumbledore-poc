import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { PWA_BACKGROUND_HEX } from "@/lib/pwa";
import { NavigationShell } from "@/navigation/navigation-shell";
import { AuspexAtmosphere } from "@/theme/atmosphere";
import { coerceThemeId, getDefaultTheme, getThemeById } from "@/theme/registry";
import { THEME_COOKIE_NAME } from "@/theme/settings";
import { ThemeProvider } from "@/theme/theme-provider";
import { ThemePreloadScript } from "@/theme/theme-script";
import { ThemeTokenStyle } from "@/theme/theme-style";
import { auspexFontVariables } from "../../auspex-fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rumbledore",
  description:
    "Your fantasy league's home base: history, records, news, AI takes, and paper betting.",
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
      className={`${auspexFontVariables} ${initialTheme.mode}`}
      style={{ colorScheme: initialTheme.colorScheme }}
      suppressHydrationWarning
    >
      <body>
        <ThemePreloadScript initialThemeId={initialTheme.id} />
        <ThemeTokenStyle />
        <ThemeProvider initialThemeId={initialTheme.id}>
          <AuspexAtmosphere />
          <div className="relative z-10 min-h-dvh" data-slot="app-content">
            <NavigationShell>{children}</NavigationShell>
          </div>
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
