import { ArrowLeft, BookOpen, Swords } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Edge } from "@/components/ui/edge";
import { KVList } from "@/components/ui/kv";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import {
  formatMeetingContext,
  formatNumber,
  leagueRecordsHref,
  managerHref,
} from "./records-format";
import type {
  HeadToHeadMeeting,
  HeadToHeadRecordsPageData,
} from "./records-page-data";
import { H2HSeasonPairsTable } from "./records-tables";

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
      <h2 className="heading-auspex text-lg">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.slice(0, 6).map((row, index) => (
          <article
            className="cell grid gap-3 p-4"
            key={`${row.matchupId}-${row.season}-${row.scoringPeriod}-${row.winnerPersonId ?? "tie"}-${index}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{formatMeetingContext(row)}</p>
              <p className="metric text-sm font-semibold">
                {formatNumber(row.combinedPoints)}
              </p>
            </div>
            <div className="mt-3 grid gap-1 text-sm">
              <p>
                {data.personA.name}:{" "}
                <span className="metric">
                  {formatNumber(row.personAPoints)}
                </span>
              </p>
              <p>
                {data.personB.name}:{" "}
                <span className="metric">
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
  const margin = pair.personA.wins - pair.personB.wins;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-7 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel grid gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={leagueRecordsHref(data.league, data.lens)}
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
            <p className="eyebrow">Head-to-head</p>
          </div>
          <div className="max-w-2xl">
            <h1 className="heading-auspex text-xl leading-tight">
              {data.personA.name} vs {data.personB.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {pair.meetings} meetings across the imported league history.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill tone="info">
                {data.league.provider.toUpperCase()} {data.league.season}
              </StatusPill>
              <StatusPill tone="neutral">{pair.meetings} meetings</StatusPill>
              <Edge
                eyebrow="margin"
                tone={
                  margin === 0
                    ? "neutral"
                    : margin > 0
                      ? "positive"
                      : "negative"
                }
                value={Math.abs(margin)}
              />
            </div>
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
        <div className="panel grid gap-4 p-4">
          <h2 className="font-display text-base font-medium">
            {data.personA.name}
          </h2>
          <Link
            className="mt-1 inline-flex text-sm font-medium underline-offset-4 hover:underline"
            href={managerHref(data.league, data.personA.id, data.lens)}
          >
            Manager page
          </Link>
          <KVList
            items={[
              {
                label: "Total points",
                value: formatNumber(pair.personA.points),
              },
              { label: "Average", value: formatNumber(pair.personA.avgPoints) },
              {
                label: "Series high",
                value: formatNumber(pair.personA.highestScore),
              },
            ]}
          />
        </div>
        <div className="panel grid gap-4 p-4">
          <h2 className="font-display text-base font-medium">
            {data.personB.name}
          </h2>
          <Link
            className="mt-1 inline-flex text-sm font-medium underline-offset-4 hover:underline"
            href={managerHref(data.league, data.personB.id, data.lens)}
          >
            Manager page
          </Link>
          <KVList
            items={[
              {
                label: "Total points",
                value: formatNumber(pair.personB.points),
              },
              { label: "Average", value: formatNumber(pair.personB.avgPoints) },
              {
                label: "Series high",
                value: formatNumber(pair.personB.highestScore),
              },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="heading-auspex text-lg">Streaks</h2>
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
          <h2 className="heading-auspex text-lg">Season ledgers</h2>
          <H2HSeasonPairsTable
            personAName={data.personA.name}
            personBName={data.personB.name}
            rows={data.seasonPairs}
          />
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
