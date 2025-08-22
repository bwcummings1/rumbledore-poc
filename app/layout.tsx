import { Inter } from "next/font/google";
import "./globals.css";
import { Metadata } from "next";
import { Providers } from "./providers";
import { headers } from "next/headers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | Rumbledore",
    default: "Rumbledore - Fantasy Football Platform",
  },
  description:
    "The ultimate fantasy football platform with AI-driven insights, paper betting, and league management.",
  keywords: ["fantasy football", "ESPN", "betting", "AI", "league management"],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // This will be used to get the session server-side
  // For now, we'll pass null and let the SessionProvider handle client-side session
  
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
