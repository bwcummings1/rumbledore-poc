"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function NewsErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <RouteErrorState
      body="The wire dropped mid-transmission. Nothing published was lost."
      error={error}
      reset={reset}
      segment="news"
      title="The wire went quiet"
    />
  );
}
