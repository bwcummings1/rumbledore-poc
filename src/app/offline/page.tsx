import type { Metadata } from "next";
import { Banner } from "@/components/ui/banner";

export const metadata: Metadata = {
  title: "Offline — Rumbledore",
};

// Precached by public/sw.js as the navigation fallback; must stay static.
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]">
      <main className="flex max-w-md flex-col gap-3 text-center">
        <Banner title="You're offline" tone="info">
          Rumbledore needs a connection for live league data. Reconnect and pull
          to retry.
        </Banner>
      </main>
    </div>
  );
}
