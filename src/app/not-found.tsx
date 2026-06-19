import { Compass } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))]">
      <section className="panel grid max-w-md justify-items-center gap-4 p-6 text-center sm:p-8">
        <span
          aria-hidden="true"
          className="orb orb-lg muted grid place-items-center text-ink-3"
        >
          <Compass className="size-5" />
        </span>
        <div className="grid gap-2">
          <p className="eyebrow text-primary">404 {"//"} Not found</p>
          <h1 className="heading-auspex text-xl leading-tight">
            Off the board
          </h1>
          <p className="text-sm text-ink-2">
            That page isn&apos;t on the wire — it may have moved, or never
            existed.
          </p>
        </div>
        <Link href="/" className={cn(buttonVariants({ className: "w-fit" }))}>
          Back to your leagues
        </Link>
      </section>
    </main>
  );
}
