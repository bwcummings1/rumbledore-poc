'use client';

import { ClientProviders } from "./client-providers";

export default function Template({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientProviders>{children}</ClientProviders>;
}