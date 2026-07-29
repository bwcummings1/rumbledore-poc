"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function OnboardingErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <RouteErrorState
      body="The connect flow stopped before it finished. Retrying is safe — nothing was half-imported."
      error={error}
      reset={reset}
      segment="onboarding"
      title="The connection stalled"
    />
  );
}
