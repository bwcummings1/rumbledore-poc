"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { RouteErrorState } from "@/components/ui/route-error-state";
import { cn } from "@/lib/utils";

export default function LeagueErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <RouteErrorState
      action={
        <Link
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
          href="/"
        >
          Back to your leagues
        </Link>
      }
      body="This league section could not be loaded. Your league data is intact — nothing was written."
      error={error}
      reset={reset}
      segment="leagues/[leagueId]"
      title="This league would not load"
    />
  );
}
