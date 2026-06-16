import { ArrowLeft, BookOpen, Crown, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Edge } from "@/components/ui/edge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import {
  formatNumber,
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
import { ManagerH2HLedgersTable, ManagerSeasonTable } from "./records-tables";

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
          <article className="cell grid gap-3 p-4" key={record.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-display text-base font-semibold tracking-tight">
                {record.label}
              </h3>
              <p className="lcd text-lg font-semibold">
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
    <div className="cell p-4">
      <h3 className="font-display text-sm font-semibold tracking-tight">
        {title}
      </h3>
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
            <p className="metric text-sm text-muted-foreground">
              PA {formatNumber(row.pointsAgainst)}
            </p>
          </li>
        ))}
      </ol>
    </div>
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
      <header className="panel grid gap-4 p-4">
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
          <p className="eyebrow text-primary">Manager record book</p>
          <h1 className="heading-auspex h-grad mt-2 text-2xl leading-tight sm:text-3xl">
            {data.manager.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ownerLine}
            {data.manager.seasonSpan ? ` - ${data.manager.seasonSpan}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill tone="info">
              {data.league.provider.toUpperCase()} {data.league.season}
            </StatusPill>
            <StatusPill tone="neutral">
              {data.seasonLines.length} seasons
            </StatusPill>
            <StatusPill tone="neutral">
              {data.heldRecords.length} records held
            </StatusPill>
          </div>
        </div>
      </header>

      {data.catalog.integrityBlocked ? (
        <EmptyState
          className="p-5"
          title="Records paused for data review"
          variant="gated"
        >
          <p>
            A steward-visible integrity check is unresolved, so trusted record
            reads are withheld until the imported history is reviewed.
          </p>
        </EmptyState>
      ) : null}

      {!data.catalog.integrityBlocked && career ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Career"
            value={`${career.wins}-${career.losses}-${career.ties}`}
          />
          <StatTile
            label="Win %"
            value={`${(career.winPercentage * 100).toFixed(1)}%`}
          />
          <StatTile
            label="Points for"
            tone="lilac"
            value={formatNumber(career.pointsFor)}
          />
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
              <div className="cell p-4">
                <h3 className="font-display text-sm font-semibold tracking-tight">
                  Placement ledger
                </h3>
                <ol className="mt-3 grid gap-2">
                  {data.placements.map((placement) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 text-sm"
                      key={placement.season}
                    >
                      <span className="metric">{placement.season}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {placement.roles.map((role) => (
                          <Edge
                            eyebrow="finish"
                            key={`${placement.season}-${role}`}
                            tone="positive"
                            value={role}
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </Section>
          {data.seasonLines.length > 0 ? (
            <Section title="Season by season">
              <ManagerSeasonTable rows={data.seasonLines} />
            </Section>
          ) : null}
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
          {data.h2hLedgers.length > 0 ? (
            <Section
              icon={
                <Swords className="size-4 text-primary" aria-hidden="true" />
              }
              title="Head-to-head ledgers"
            >
              <ManagerH2HLedgersTable
                league={data.league}
                managerId={data.manager.id}
                rows={data.h2hLedgers}
              />
            </Section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
