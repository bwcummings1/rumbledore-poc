import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — Rumbledore",
};

// Precached by public/sw.js as the navigation fallback; must stay static.
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]">
      <main className="flex max-w-md flex-col gap-3 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          You&apos;re offline
        </h1>
        <p className="text-base text-muted-foreground">
          Rumbledore needs a connection for live league data. Reconnect and pull
          to retry.
        </p>
      </main>
    </div>
  );
}
