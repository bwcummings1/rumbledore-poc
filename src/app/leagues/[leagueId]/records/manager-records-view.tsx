import { ArrowLeft, BookOpen, Crown, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatNumber,
  formatPercent,
  formatRecordContext,
  formatRecordValue,
  formatWeekContext,
  h2hHref,
} from "./records-format";
import type {
  CurrentRecordBookEntry,
  ManagerRecordsPageData,
  ManagerWeeklyHighlight,
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

function Section({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function HeldRecords({
  data,
  records,
}: {
  data: ManagerRecordsPageData;
  records: readonly CurrentRecordBookEntry[];
}) {
  if (records.length === 0) {
    return null;
  }

  return (
    <Section
      icon={<Trophy className="size-4 text-primary" aria-hidden="true" />}
      title="Current records held"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {records.map((record) => (
          <article
            className="rounded-card border border-border bg-card p-4"
            key={record.id}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold tracking-tight">
                {record.label}
              </h3>
              <p className="font-mono text-lg font-semibold tabular-nums">
                {formatRecordValue(record)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatRecordContext(record)}
            </p>
            {record.opponentPersonId ? (
              <Link
                className="mt-3 inline-flex text-sm font-medium underline-offset-4 hover:underline"
                href={h2hHref(
                  data.league,
                  record.holderPersonId ?? data.manager.id,
                  record.opponentPersonId,
                )}
              >
                Open rivalry
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </Section>
  );
}

function WeeklyList({
  rows,
  title,
}: {
  rows: readonly ManagerWeeklyHighlight[];
  title: string;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-card border border-border bg-card p-4">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <ol className="mt-3 grid gap-2">
        {rows.slice(0, 5).map((row) => (
          <li
            className="flex items-start justify-between gap-3"
            key={`${row.matchupId}-${row.season}-${row.scoringPeriod}`}
          >
            <div>
              <p className="text-sm font-medium">
                {row.result.toUpperCase()} {formatNumber(row.pointsFor)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatWeekContext(row)}
              </p>
            </div>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">
              PA {formatNumber(row.pointsAgainst)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SeasonTable({ data }: { data: ManagerRecordsPageData }) {
  if (data.seasonLines.length === 0) {
    return null;
  }

  return (
    <Section title="Season by season">
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Season</th>
              <th className="px-3 py-2 font-medium">W-L-T</th>
              <th className="px-3 py-2 font-medium">Win %</th>
              <th className="px-3 py-2 font-medium">PF</th>
              <th className="px-3 py-2 font-medium">PA</th>
              <th className="px-3 py-2 font-medium">Luck</th>
              <th className="px-3 py-2 font-medium">Finish</th>
              <th className="px-3 py-2 font-medium">Streaks</th>
            </tr>
          </thead>
          <tbody>
            {data.seasonLines.map((row) => (
              <tr className="border-t border-border" key={row.season}>
                <td className="px-3 py-3 tabular-nums">{row.season}</td>
                <td className="px-3 py-3 tabular-nums">
                  {row.wins}-{row.losses}-{row.ties}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatPercent(row.winPercentage)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatNumber(row.pointsFor)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatNumber(row.pointsAgainst)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatNumber(row.luck)}
                </td>
                <td className="px-3 py-3">
                  {row.finalPlacement.replaceAll("_", " ")} #{row.finalRank}
                </td>
                <td className="px-3 py-3">
                  W{row.longestWinStreak} / L{row.longestLossStreak}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function H2HLedgers({ data }: { data: ManagerRecordsPageData }) {
  if (data.h2hLedgers.length === 0) {
    return null;
  }

  return (
    <Section
      icon={<Swords className="size-4 text-primary" aria-hidden="true" />}
      title="Head-to-head ledgers"
    >
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Opponent</th>
              <th className="px-3 py-2 font-medium">Series</th>
              <th className="px-3 py-2 font-medium">Points</th>
              <th className="px-3 py-2 font-medium">High</th>
              <th className="px-3 py-2 font-medium">Playoff</th>
              <th className="px-3 py-2 font-medium">Last</th>
            </tr>
          </thead>
          <tbody>
            {data.h2hLedgers.map((row) => (
              <tr className="border-t border-border" key={row.opponentPersonId}>
                <td className="px-3 py-3 font-medium">
                  <Link
                    className="underline-offset-4 hover:underline"
                    href={h2hHref(
                      data.league,
                      data.manager.id,
                      row.opponentPersonId,
                    )}
                  >
                    {row.opponentName}
                  </Link>
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {row.wins}-{row.losses}-{row.ties}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatNumber(row.pointsFor)} /{" "}
                  {formatNumber(row.pointsAgainst)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatNumber(row.highestScore)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {row.playoffMeetings} / {row.championshipMeetings}
                </td>
                <td className="px-3 py-3">
                  {row.lastSeason
                    ? `${row.lastSeason} W${row.lastScoringPeriod ?? "?"}`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function ManagerRecordsView({ data }: { data: ManagerRecordsPageData }) {
  const career = data.catalog.allTimeStandings.find((row) =>
    [data.manager.id].includes(row.personId),
  );
  const ownerLine =
    data.manager.ownerNames.length > 0
      ? data.manager.ownerNames.join(", ")
      : "Owner history unavailable";

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
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">
            Manager record book
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {data.manager.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ownerLine}
            {data.manager.seasonSpan ? ` - ${data.manager.seasonSpan}` : ""}
          </p>
        </div>
      </header>

      {data.catalog.integrityBlocked ? (
        <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold tracking-tight">
            Records paused for data review
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A steward-visible integrity check is unresolved, so trusted record
            reads are withheld until the imported history is reviewed.
          </p>
        </section>
      ) : null}

      {!data.catalog.integrityBlocked && career ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Career"
            value={`${career.wins}-${career.losses}-${career.ties}`}
          />
          <StatTile label="Win %" value={formatPercent(career.winPercentage)} />
          <StatTile label="Points for" value={formatNumber(career.pointsFor)} />
          <StatTile label="Titles" value={`${career.championships}`} />
        </section>
      ) : null}

      {!data.catalog.integrityBlocked ? (
        <>
          <HeldRecords data={data} records={data.heldRecords} />
          <Section
            icon={<Crown className="size-4 text-primary" aria-hidden="true" />}
            title="Postseason line"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Playoffs"
                value={`${data.championshipRecord?.playoffAppearances ?? 0}`}
              />
              <StatTile
                label="Title games"
                value={`${
                  data.championshipRecord?.championshipAppearances ?? 0
                }`}
              />
              <StatTile
                label="Runner-up"
                value={`${data.championshipRecord?.runnerUps ?? 0}`}
              />
              <StatTile
                label="Regular titles"
                value={`${data.championshipRecord?.regularSeasonTitles ?? 0}`}
              />
            </div>
            {data.placements.length > 0 ? (
              <div className="rounded-card border border-border bg-card p-4">
                <h3 className="text-sm font-semibold tracking-tight">
                  Placement ledger
                </h3>
                <ol className="mt-3 grid gap-2">
                  {data.placements.map((placement) => (
                    <li
                      className="flex items-center justify-between gap-3 text-sm"
                      key={placement.season}
                    >
                      <span>{placement.season}</span>
                      <span className="text-muted-foreground">
                        {placement.roles.join(", ")}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </Section>
          <SeasonTable data={data} />
          <Section title="Signature weeks">
            <div className="grid gap-3 lg:grid-cols-2">
              <WeeklyList
                rows={data.signatureWeeks.highestScores}
                title="Highest scores"
              />
              <WeeklyList
                rows={data.signatureWeeks.lowestScores}
                title="Lowest scores"
              />
              <WeeklyList
                rows={data.signatureWeeks.bestLosses}
                title="Best losses"
              />
              <WeeklyList
                rows={data.signatureWeeks.worstWins}
                title="Worst wins"
              />
            </div>
          </Section>
          <H2HLedgers data={data} />
        </>
      ) : null}
    </main>
  );
}
