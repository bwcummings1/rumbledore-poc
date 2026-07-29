"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function InviteErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <RouteErrorState
      body="This invite could not be opened. The link itself is still good — try again in a moment."
      error={error}
      reset={reset}
      segment="invite"
      title="The invite would not open"
    />
  );
}
