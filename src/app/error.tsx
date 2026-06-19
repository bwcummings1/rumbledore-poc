"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]">
      <section className="panel grid max-w-md justify-items-center gap-4 p-6 text-center sm:p-8">
        <span
          aria-hidden="true"
          className="orb orb-lg muted grid place-items-center text-coral"
        >
          <TriangleAlert className="size-5" />
        </span>
        <div className="grid gap-2">
          <p className="eyebrow text-coral">System {"//"} Error</p>
          <h1 className="heading-auspex text-xl leading-tight">Signal lost</h1>
          <p className="text-sm text-ink-2">
            The app hit an unexpected error. Try again from the last stable
            screen.
          </p>
        </div>
        <Button className="w-fit" onClick={reset} type="button">
          <RotateCcw data-icon="inline-start" />
          Try again
        </Button>
      </section>
    </main>
  );
}
