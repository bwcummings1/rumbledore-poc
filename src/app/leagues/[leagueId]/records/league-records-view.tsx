import { ArrowLeft, BookOpen, Landmark, Trophy } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { LeagueHomeData } from "@/home/league-home";
import { cn } from "@/lib/utils";

function formatRecordValue(
  recordType: LeagueHomeData["records"][number]["recordType"],
  value: number,
): string {
  if (recordType === "best_career_win_percentage") {
    return `${Math.round(value * 1000) / 10}%`;
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function recordContext(record: LeagueHomeData["records"][number]): string {
  const pieces = [
    record.holderName ?? "Unknown holder",
    record.opponentName ? `vs ${record.opponentName}` : null,
    record.season ? String(record.season) : null,
    record.scoringPeriod ? `Week ${record.scoringPeriod}` : null,
  ].filter((piece): piece is string => Boolean(piece));

  return pieces.join(" · ");
}

export function LeagueRecordsView({ data }: { data: LeagueHomeData }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/leagues/${data.league.id}`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "ghost" }),
            )}
          >
            <ArrowLeft data-icon="inline-start" />
            League home
          </Link>
          <Link
            href={`/leagues/${data.league.id}/lore`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "outline" }),
            )}
          >
            <Landmark data-icon="inline-start" />
            Lore
          </Link>
        </div>
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <BookOpen className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">Records</p>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {data.league.name} record book
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Current all-time marks from the imported league history. This is
              the scorekeeping spine the cast uses when it mythologizes a
              collapse or crowns a recurring villain. Lore is where the league
              decides what the numbers mean.
            </p>
          </div>
        </div>
      </header>

      {data.records.length > 0 ? (
        <section
          aria-label="League records"
          className="grid gap-3 sm:grid-cols-2"
        >
          {data.records.map((record) => (
            <article
              className="rounded-card border border-border bg-card p-4"
              key={record.id}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <Trophy className="size-4 shrink-0 text-primary" />
                <p className="font-mono text-lg font-semibold tabular-nums">
                  {formatRecordValue(record.recordType, record.value)}
                </p>
              </div>
              <h2 className="text-base font-semibold tracking-tight">
                {record.label}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {recordContext(record)}
              </p>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold tracking-tight">
            No records calculated yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Historical import and stats recompute will populate this page with
            the league's all-time marks.
          </p>
        </section>
      )}
    </main>
  );
}
