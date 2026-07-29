"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function YouErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <RouteErrorState
      body="Your cross-league summary could not be assembled. No settings were changed."
      error={error}
      reset={reset}
      segment="you"
      title="Your desk did not load"
    />
  );
}
