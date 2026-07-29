"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function ArenaErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <RouteErrorState
      body="The arena ladders could not be drawn. Your standings and history are unaffected."
      error={error}
      reset={reset}
      segment="arena"
      title="The arena went dark"
    />
  );
}
