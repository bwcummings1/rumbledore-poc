"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { logger } from "@/core/logging";
import { cn } from "@/lib/utils";

interface RouteErrorStateProps {
  readonly action?: ReactNode;
  readonly body?: ReactNode;
  readonly className?: string;
  readonly error: Error & { digest?: string };
  /** Stable identifier for the boundary, e.g. "leagues/[leagueId]". */
  readonly segment: string;
  readonly reset: () => void;
  readonly title?: string;
}

/**
 * The shared fallback behind every App Router `error.tsx`.
 *
 * It renders no part of the error. In production Next.js replaces a server
 * error's message with a placeholder and passes only `digest`, but in
 * development the real message — and anything a thrown error happens to carry,
 * a connection string, a row, a token — arrives here intact. A boundary that
 * prints `error.message` therefore looks harmless locally and leaks in staging.
 * The digest is a hash Next.js also writes to the server log, so it is the one
 * safe thing to show: it lets a user quote a reference an operator can grep.
 */
function RouteErrorState({
  action,
  body,
  className,
  error,
  reset,
  segment,
  title = "Signal lost",
}: RouteErrorStateProps) {
  const digest = error.digest;

  useEffect(() => {
    // Next.js already logged the server-side error and its stack before the
    // digest reached the browser. This adds the client-side half — which
    // boundary caught it — and carries no message, no stack, no request state.
    logger.error("route_error_boundary", { digest: digest ?? null, segment });
  }, [digest, segment]);

  return (
    <main
      className={cn(
        "flex min-h-dvh items-center justify-center p-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <section
        className="panel grid max-w-md justify-items-center gap-4 p-6 text-center sm:p-8"
        data-slot="route-error-state"
        data-segment={segment}
      >
        <span
          aria-hidden="true"
          className="orb orb-lg muted grid place-items-center text-coral"
        >
          <TriangleAlert className="size-5" />
        </span>
        <div className="grid gap-2">
          <p className="eyebrow text-coral">System {"//"} Error</p>
          <h1 className="heading-auspex text-xl leading-tight">{title}</h1>
          <p className="text-sm text-ink-2">
            {body ??
              "The app hit an unexpected error. Try again from the last stable screen."}
          </p>
        </div>
        <Button className="w-fit" onClick={reset} type="button">
          <RotateCcw data-icon="inline-start" />
          Try again
        </Button>
        {action}
        {digest ? (
          <p className="metric text-xs text-ink-3" data-slot="error-digest">
            Reference {digest}
          </p>
        ) : null}
      </section>
    </main>
  );
}

export { RouteErrorState };
export type { RouteErrorStateProps };
