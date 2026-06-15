import { ArrowLeft, FilePlus2, Landmark, Vote } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LoreSectionData } from "@/lore/member-ui";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function LeagueLoreView({ data }: { data: LoreSectionData }) {
  const submitHref = `/leagues/${encodeURIComponent(data.league.id)}/lore/new`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <Link
          href={`/leagues/${encodeURIComponent(data.league.id)}`}
          className={cn(
            buttonVariants({ className: "w-fit", variant: "ghost" }),
          )}
        >
          <ArrowLeft data-icon="inline-start" />
          League home
        </Link>

        <div className="grid gap-4 rounded-card border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <Landmark className="size-5" aria-hidden="true" />
              <p className="text-sm font-medium">Lore</p>
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
              {data.league.name} official lore
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              The league's narrative record lives here: claims members submit,
              facts the data can verify, and arguments the league decides by
              vote.
            </p>
          </div>

          <Link
            href={submitHref}
            className={cn(buttonVariants({ className: "w-full sm:w-auto" }))}
          >
            <FilePlus2 data-icon="inline-start" />
            Submit claim
          </Link>
        </div>
      </header>

      <section aria-label="Lore status" className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-card border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Canon entries</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formatCount(data.counts.canon)}
          </p>
        </article>
        <article className="rounded-card border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Open votes</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formatCount(data.counts.openVotes)}
          </p>
        </article>
        <article className="rounded-card border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Refuted facts</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formatCount(data.counts.refuted)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 rounded-card border border-dashed border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Vote className="size-4 text-primary" aria-hidden="true" />
              Start the record
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Opinion claims open a league vote. Structured fact claims are
              checked against imported weekly, season, and all-time records
              before the league has to argue about them.
            </p>
          </div>
          <Link
            href={submitHref}
            className={cn(buttonVariants({ variant: "secondary" }))}
          >
            <FilePlus2 data-icon="inline-start" />
            New claim
          </Link>
        </div>
      </section>
    </main>
  );
}
