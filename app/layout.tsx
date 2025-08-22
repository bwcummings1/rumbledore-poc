import { Inter } from "next/font/google";
import "./globals.css";
import { Metadata } from "next";
import React from "react";
import { Providers } from "./client-providers";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
