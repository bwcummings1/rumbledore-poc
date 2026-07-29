"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function ErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return <RouteErrorState error={error} reset={reset} segment="root" />;
}
