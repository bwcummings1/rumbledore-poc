import { RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Offline — Rumbledore",
};

// Precached by public/sw.js as the navigation fallback; must stay static.
export default function OfflinePage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-6 pb-[calc(var(--space-6)+env(safe-area-inset-bottom))]">
      <main className="panel grid w-full max-w-md justify-items-center gap-5 p-6 text-center shadow-overlay">
        <span
          aria-hidden="true"
          className="orb offline size-16"
          data-state="offline"
        />
        <div className="grid gap-2">
          <p className="eyebrow text-muted-foreground">Connection</p>
          <h1 className="heading-auspex text-xl leading-tight">Offline</h1>
          <output className="lcd text-sm text-muted-foreground">
            OFFLINE — reconnect to see live league data
          </output>
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          Rumbledore keeps the shell ready, but live scores, odds, league data,
          and The Wire need a connection.
        </p>
        <a className={cn(buttonVariants({ variant: "steel" }))} href="/">
          <RefreshCw data-icon="inline-start" />
          Retry
        </a>
      </main>
    </div>
  );
}
