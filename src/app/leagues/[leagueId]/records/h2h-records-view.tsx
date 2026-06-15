import { ArrowLeft, BookOpen, Swords } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatMeetingContext,
  formatNumber,
  managerHref,
} from "./records-format";
import type {
  HeadToHeadMeeting,
  HeadToHeadRecordsPageData,
} from "./records-page-data";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function winnerName(data: HeadToHeadRecordsPageData, row: HeadToHeadMeeting) {
  if (row.winnerPersonId === data.personA.id) {
    return data.personA.name;
  }
  if (row.winnerPersonId === data.personB.id) {
    return data.personB.name;
  }
  return "Tie";
}

function MeetingList({
  data,
  rows,
  title,
}: {
  data: HeadToHeadRecordsPageData;
  rows: readonly HeadToHeadMeeting[];
  title: string;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.slice(0, 6).map((row) => (
          <article
            className="rounded-card border border-border bg-card p-4"
            key={`${row.matchupId}-${row.season}-${row.scoringPeriod}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{formatMeetingContext(row)}</p>
              <p className="font-mono text-sm font-semibold tabular-nums">
                {formatNumber(row.combinedPoints)}
              </p>
            </div>
            <div className="mt-3 grid gap-1 text-sm">
              <p>
                {data.personA.name}:{" "}
                <span className="font-mono tabular-nums">
                  {formatNumber(row.personAPoints)}
                </span>
              </p>
              <p>
                {data.personB.name}:{" "}
                <span className="font-mono tabular-nums">
                  {formatNumber(row.personBPoints)}
                </span>
              </p>
              <p className="text-muted-foreground">
                Winner: {winnerName(data, row)}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HeadToHeadRecordsView({
  data,
}: {
  data: HeadToHeadRecordsPageData;
}) {
  const { pair } = data;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-7 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/leagues/${data.league.id}/records`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "ghost" }),
            )}
          >
            <ArrowLeft data-icon="inline-start" />
            Records
          </Link>
          <Link
            href={`/leagues/${data.league.id}`}
            className={cn(
              buttonVariants({ className: "w-fit", variant: "outline" }),
            )}
          >
            <BookOpen data-icon="inline-start" />
            League home
          </Link>
        </div>
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <Swords className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">Head-to-head</p>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {data.personA.name} vs {data.personB.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {pair.meetings} meetings across the imported league history.
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`${data.personA.name} series`}
          value={`${pair.personA.wins}-${pair.personA.losses}-${pair.ties}`}
        />
        <StatTile
          label={`${data.personB.name} series`}
          value={`${pair.personB.wins}-${pair.personB.losses}-${pair.ties}`}
        />
        <StatTile label="Playoff meetings" value={`${pair.playoffMeetings}`} />
        <StatTile
          label="Title meetings"
          value={`${pair.championshipMeetings}`}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-card p-4">
          <h2 className="text-base font-semibold tracking-tight">
            {data.personA.name}
          </h2>
          <Link
            className="mt-1 inline-flex text-sm font-medium underline-offset-4 hover:underline"
            href={managerHref(data.league, data.personA.id)}
          >
            Manager page
          </Link>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Total points</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {formatNumber(pair.personA.points)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Average</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {formatNumber(pair.personA.avgPoints)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Series high</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {formatNumber(pair.personA.highestScore)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="rounded-card border border-border bg-card p-4">
          <h2 className="text-base font-semibold tracking-tight">
            {data.personB.name}
          </h2>
          <Link
            className="mt-1 inline-flex text-sm font-medium underline-offset-4 hover:underline"
            href={managerHref(data.league, data.personB.id)}
          >
            Manager page
          </Link>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Total points</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {formatNumber(pair.personB.points)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Average</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {formatNumber(pair.personB.avgPoints)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Series high</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {formatNumber(pair.personB.highestScore)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Streaks</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Current"
            value={
              pair.currentStreak
                ? `${pair.currentStreak.personName} ${pair.currentStreak.length}`
                : "-"
            }
          />
          <StatTile
            label="Longest"
            value={
              pair.longestStreak
                ? `${pair.longestStreak.personName} ${pair.longestStreak.length}`
                : "-"
            }
          />
          <StatTile
            label="Last meeting"
            value={
              pair.lastSeason
                ? `${pair.lastSeason} W${pair.lastScoringPeriod ?? "?"}`
                : "-"
            }
          />
        </div>
      </section>

      {data.seasonPairs.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Season ledgers
          </h2>
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Season</th>
                  <th className="px-3 py-2 font-medium">{data.personA.name}</th>
                  <th className="px-3 py-2 font-medium">{data.personB.name}</th>
                  <th className="px-3 py-2 font-medium">Ties</th>
                  <th className="px-3 py-2 font-medium">Points</th>
                  <th className="px-3 py-2 font-medium">Playoff</th>
                </tr>
              </thead>
              <tbody>
                {data.seasonPairs.map((row) => (
                  <tr className="border-t border-border" key={row.season}>
                    <td className="px-3 py-3 tabular-nums">{row.season}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.personA.wins}-{row.personA.losses}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.personB.wins}-{row.personB.losses}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{row.ties}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {formatNumber(row.personA.points)} /{" "}
                      {formatNumber(row.personB.points)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {row.playoffMeetings} / {row.championshipMeetings}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <MeetingList
        data={data}
        rows={data.biggestMeetings}
        title="Biggest meetings"
      />
      <MeetingList data={data} rows={data.meetings} title="Recent meetings" />
    </main>
  );
}
