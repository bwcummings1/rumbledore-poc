import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rumbledore - Fantasy Football Platform",
  description: "AI-powered fantasy football with paper betting and real-time insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}