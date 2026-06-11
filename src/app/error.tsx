"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]">
      <section className="flex max-w-md flex-col gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-base text-muted-foreground">
            The app hit an unexpected error. Try again from the last stable
            screen.
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          className="self-start"
          onClick={reset}
          aria-label="Try again"
          title="Try again"
        >
          <RotateCcw data-icon="inline-start" />
        </Button>
      </section>
    </main>
  );
}
