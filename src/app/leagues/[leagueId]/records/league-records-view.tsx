import {
  ArrowLeft,
  BookOpen,
  Crown,
  Landmark,
  Swords,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Edge } from "@/components/ui/edge";
import { EmptyState } from "@/components/ui/empty-state";
import { KVList } from "@/components/ui/kv";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type { HeadToHeadPairCatalogEntry } from "@/stats";
import {
  formatNumber,
  formatRecordContext,
  formatRecordValue,
  h2hHref,
  managerHref,
} from "./records-format";
import type {
  CurrentRecordBookEntry,
  RecordsPageData,
} from "./records-page-data";
import { AllTimeStandingsTable } from "./records-tables";

function recordGroup(
  records: readonly CurrentRecordBookEntry[],
  recordTypes: readonly string[],
): CurrentRecordBookEntry[] {
  const wanted = new Set(recordTypes);
  return records.filter((record) => wanted.has(record.recordType));
}

function hasTrustedRecordData(data: RecordsPageData): boolean {
  return (
    data.currentRecords.length > 0 ||
    data.catalog.allTimeStandings.length > 0 ||
    data.catalog.headToHead.allTimePairs.length > 0 ||
    data.catalog.championships.seasons.length > 0 ||
    data.catalog.milestones.keeper.status === "available"
  );
}

function RecordCard({
  data,
  record,
}: {
  data: RecordsPageData;
  record: CurrentRecordBookEntry;
}) {
  return (
    <article
      className="cell grid gap-4 p-4"
      data-record-type={record.recordType}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className="chip-glyph flex size-10 shrink-0 items-center justify-center"
        >
          <Trophy className="size-4 text-primary" />
        </span>
        <p className="lcd shrink-0 text-xl font-bold">
          {formatRecordValue(record)}
        </p>
      </div>
      <div className="grid gap-2">
        <h3 className="font-display text-base font-semibold tracking-tight">
          {record.label}
        </h3>
        <p className="text-sm text-muted-foreground">
          {record.holderPersonId ? (
            <Link
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
              href={managerHref(data.league, record.holderPersonId)}
            >
              {record.holderName ?? "Unknown holder"}
            </Link>
          ) : (
            "Unknown holder"
          )}
          {record.opponentName ? ` · vs ${record.opponentName}` : ""}
          {record.season ? ` · ${record.season}` : ""}
          {record.scoringPeriod ? ` · Week ${record.scoringPeriod}` : ""}
        </p>
      </div>
      {record.previousRecordId ? (
        <KVList
          className="border-t border-[var(--hair)] pt-2"
          items={[
            {
              label: "Previous",
              value: `${record.previousHolderName ?? "Unknown holder"}${
                record.previousValue !== null
                  ? ` at ${formatNumber(record.previousValue)}`
                  : ""
              }`,
            },
          ]}
        />
      ) : null}
    </article>
  );
}

function Section({
  children,
  icon,
  id,
  title,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  id?: string;
  title: string;
}) {
  return (
    <section className="scroll-mt-28 grid gap-3" id={id}>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function AllTimeStandings({ data }: { data: RecordsPageData }) {
  const standings = data.catalog.allTimeStandings;
  if (standings.length === 0) {
    return null;
  }

  return (
    <Section
      icon={<Crown className="size-4 text-primary" aria-hidden="true" />}
      id="all-time"
      title="All-time standings"
    >
      <AllTimeStandingsTable league={data.league} rows={standings} />
    </Section>
  );
}

function RecordSection({
  data,
  id,
  records,
  title,
}: {
  data: RecordsPageData;
  id: string;
  records: readonly CurrentRecordBookEntry[];
  title: string;
}) {
  if (records.length === 0) {
    return null;
  }

  return (
    <Section id={id} title={title}>
      <div className="grid gap-3 sm:grid-cols-2">
        {records.map((record) => (
          <RecordCard data={data} key={record.id} record={record} />
        ))}
      </div>
    </Section>
  );
}

function CompactList({
  items,
  title,
}: {
  items: readonly { context: string; label: string; value: string }[];
  title: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="cell p-4">
      <h3 className="font-display text-sm font-semibold tracking-tight">
        {title}
      </h3>
      <ol className="mt-3 grid gap-2">
        {items.slice(0, 5).map((item) => (
          <li
            className="flex items-start justify-between gap-3"
            key={item.label}
          >
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.context}</p>
            </div>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {item.value}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HighLowSection({ data }: { data: RecordsPageData }) {
  const { highLow } = data.catalog;
  return (
    <Section id="highs-lows" title="Highs and lows">
      <div className="grid gap-3 lg:grid-cols-3">
        <CompactList
          items={highLow.highestScores.map((row) => ({
            context: `${row.season} - Week ${row.scoringPeriod}`,
            label: row.personName,
            value: formatNumber(row.value),
          }))}
          title="Highest weeks"
        />
        <CompactList
          items={highLow.lowestScores.map((row) => ({
            context: `${row.season} - Week ${row.scoringPeriod}`,
            label: row.personName,
            value: formatNumber(row.value),
          }))}
          title="Lowest weeks"
        />
        <CompactList
          items={highLow.highestCombinedMatchups.map((row) => ({
            context: `${row.personName} vs ${row.opponentName ?? "unknown"} - ${row.season}`,
            label: "Highest combined",
            value: formatNumber(row.value),
          }))}
          title="Highest-scoring matchups"
        />
        <CompactList
          items={highLow.bestScoresInLosses.map((row) => ({
            context: `${row.season} - Week ${row.scoringPeriod}`,
            label: row.personName,
            value: formatNumber(row.value),
          }))}
          title="Best losses"
        />
        <CompactList
          items={highLow.worstScoresInWins.map((row) => ({
            context: `${row.season} - Week ${row.scoringPeriod}`,
            label: row.personName,
            value: formatNumber(row.value),
          }))}
          title="Worst wins"
        />
      </div>
    </Section>
  );
}

function StreaksAndBlowouts({ data }: { data: RecordsPageData }) {
  const { blowouts, streaks } = data.catalog;
  return (
    <Section id="streaks-margins" title="Streaks and margins">
      <div className="grid gap-3 lg:grid-cols-2">
        <CompactList
          items={streaks.longestWins.map((row) => ({
            context: `${row.startSeason} W${row.startScoringPeriod} to ${row.endSeason} W${row.endScoringPeriod}`,
            label: row.personName,
            value: `${row.length}`,
          }))}
          title="Longest winning streaks"
        />
        <CompactList
          items={streaks.longestLosses.map((row) => ({
            context: `${row.startSeason} W${row.startScoringPeriod} to ${row.endSeason} W${row.endScoringPeriod}`,
            label: row.personName,
            value: `${row.length}`,
          }))}
          title="Longest losing streaks"
        />
        <CompactList
          items={blowouts.biggest.map((row) => ({
            context: formatRecordContext({
              holderName: row.personName,
              holderPersonId: row.personId,
              id: `${row.recordType}-${row.personId}-${row.season}-${row.scoringPeriod}`,
              label: "Biggest blowout",
              opponentName: row.opponentName,
              opponentPersonId: row.opponentPersonId,
              previousHolderName: null,
              previousRecordId: null,
              previousValue: null,
              recordType: row.recordType,
              scoringPeriod: row.scoringPeriod,
              season: row.season,
              value: row.margin,
            }),
            label: row.personName,
            value: formatNumber(row.margin),
          }))}
          title="Biggest blowouts"
        />
        <CompactList
          items={blowouts.narrowestWins.map((row) => ({
            context: `${row.season} - Week ${row.scoringPeriod}`,
            label: row.personName,
            value: formatNumber(row.margin),
          }))}
          title="Closest wins"
        />
      </div>
    </Section>
  );
}

function Championships({ data }: { data: RecordsPageData }) {
  const { championships } = data.catalog;
  if (
    championships.seasons.length === 0 &&
    championships.managerRecords.length === 0
  ) {
    return null;
  }

  return (
    <Section
      icon={<Crown className="size-4 text-primary" aria-hidden="true" />}
      id="championships"
      title="Championship history"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-card border border-border bg-[var(--panel)] shadow-[var(--bevel)]">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Season</th>
                <th className="px-3 py-2 font-medium">Champion</th>
                <th className="px-3 py-2 font-medium">Runner-up</th>
                <th className="px-3 py-2 font-medium">Regular season</th>
              </tr>
            </thead>
            <tbody>
              {championships.seasons.slice(0, 8).map((row) => (
                <tr className="border-t border-border" key={row.season}>
                  <td className="px-3 py-3 tabular-nums">{row.season}</td>
                  <td className="px-3 py-3">
                    {row.champion?.personName ?? "-"}
                  </td>
                  <td className="px-3 py-3">
                    {row.runnerUp?.personName ?? "-"}
                  </td>
                  <td className="px-3 py-3">
                    {row.regularSeasonWinner?.personName ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CompactList
          items={championships.managerRecords.map((row) => ({
            context: `${row.runnerUps} runner-up - ${row.playoffAppearances} playoff trips`,
            label: row.personName,
            value: `${row.championships}`,
          }))}
          title="Title count"
        />
      </div>
    </Section>
  );
}

function rivalryScore(pair: HeadToHeadPairCatalogEntry): number {
  return Math.abs(pair.personA.wins - pair.personB.wins);
}

function RivalryList({
  data,
  pairs,
  title,
}: {
  data: RecordsPageData;
  pairs: readonly HeadToHeadPairCatalogEntry[];
  title: string;
}) {
  if (pairs.length === 0) {
    return null;
  }

  return (
    <div className="cell p-4">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <ol className="mt-3 grid gap-2">
        {pairs.slice(0, 4).map((pair) => (
          <li
            className="grid gap-1"
            key={`${pair.personA.personId}-${pair.personB.personId}`}
          >
            <Link
              className="text-sm font-medium underline-offset-4 hover:underline"
              href={h2hHref(
                data.league,
                pair.personA.personId,
                pair.personB.personId,
              )}
            >
              {pair.personA.personName} vs {pair.personB.personName}
            </Link>
            <p className="text-xs text-muted-foreground">
              {pair.personA.wins}-{pair.personB.wins}-{pair.ties} -{" "}
              {pair.meetings} meetings -{" "}
              {formatNumber(pair.personA.points + pair.personB.points)} points
            </p>
            <Edge
              className="mt-1 w-fit"
              eyebrow="margin"
              tone={rivalryScore(pair) === 0 ? "neutral" : "positive"}
              value={rivalryScore(pair)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Rivalries({ data }: { data: RecordsPageData }) {
  const pairs = data.catalog.headToHead.allTimePairs;
  if (pairs.length === 0) {
    return null;
  }

  return (
    <Section
      icon={<Swords className="size-4 text-primary" aria-hidden="true" />}
      id="rivalries"
      title="Rivalries"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <RivalryList
          data={data}
          pairs={[...pairs].sort(
            (left, right) =>
              rivalryScore(left) - rivalryScore(right) ||
              right.meetings - left.meetings,
          )}
          title="Closest series"
        />
        <RivalryList
          data={data}
          pairs={[...pairs].sort(
            (left, right) =>
              rivalryScore(right) - rivalryScore(left) ||
              right.meetings - left.meetings,
          )}
          title="Most lopsided"
        />
        <RivalryList
          data={data}
          pairs={[...pairs].sort(
            (left, right) =>
              right.personA.points +
              right.personB.points -
              (left.personA.points + left.personB.points),
          )}
          title="Highest scoring"
        />
        <RivalryList
          data={data}
          pairs={[...pairs].sort(
            (left, right) =>
              right.playoffMeetings - left.playoffMeetings ||
              right.championshipMeetings - left.championshipMeetings,
          )}
          title="Playoff grudges"
        />
      </div>
    </Section>
  );
}

function KeeperMilestones({ data }: { data: RecordsPageData }) {
  const keeper = data.catalog.milestones.keeper;
  if (keeper.status === "unavailable") {
    return (
      <Section id="keeper-milestones" title="Draft and keeper milestones">
        <div className="cell border-dashed p-4">
          <h3 className="text-sm font-semibold tracking-tight">
            Keeper milestones unavailable
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This provider import has no trusted draft or keeper milestone
            aggregate yet.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section
      icon={<Landmark className="size-4 text-primary" aria-hidden="true" />}
      id="keeper-milestones"
      title="Draft and keeper milestones"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {keeper.entries.slice(0, 6).map((entry) => (
          <article className="cell p-4" key={entry.milestoneKey}>
            <p className="text-xs uppercase text-muted-foreground">
              {entry.milestoneType.replaceAll("_", " ")}
            </p>
            <h3 className="mt-2 text-sm font-semibold tracking-tight">
              {entry.label}
            </h3>
            <p className="mt-3 font-mono text-lg font-semibold tabular-nums">
              {formatNumber(entry.value)}
            </p>
            {entry.personId ? (
              <Link
                className="mt-2 block text-sm text-muted-foreground underline-offset-4 hover:underline"
                href={managerHref(data.league, entry.personId)}
              >
                {entry.personName ?? "Unknown manager"}
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </Section>
  );
}

const recordBookNav = [
  { href: "#all-time", label: "All-time" },
  { href: "#career-marks", label: "Career" },
  { href: "#season-records", label: "Season" },
  { href: "#single-week-records", label: "Weeks" },
  { href: "#highs-lows", label: "High/low" },
  { href: "#streaks-margins", label: "Streaks" },
  { href: "#championships", label: "Titles" },
  { href: "#rivalries", label: "Rivalries" },
  { href: "#keeper-milestones", label: "Keeper" },
] as const;

export function LeagueRecordsView({ data }: { data: RecordsPageData }) {
  const weeklyRecords = recordGroup(data.currentRecords, [
    "highest_single_week_score",
    "lowest_single_week_score",
    "highest_combined_matchup",
    "best_score_in_loss",
    "worst_score_in_win",
    "biggest_blowout",
    "narrowest_win",
  ]);
  const seasonRecords = recordGroup(data.currentRecords, [
    "best_luck_season",
    "fewest_points_against_season",
    "fewest_points_for_season",
    "fewest_wins_season",
    "highest_season_scoring_average",
    "most_points_against_season",
    "most_points_for_season",
    "most_wins_season",
    "worst_luck_season",
  ]);
  const careerRecords = recordGroup(data.currentRecords, [
    "best_career_win_percentage",
    "longest_loss_streak",
    "longest_win_streak",
    "luckiest_career",
    "most_career_points",
    "most_championships",
    "most_playoff_appearances",
  ]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-7 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel grid gap-4 p-4">
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
            <h1 className="heading-auspex text-2xl leading-tight sm:text-3xl">
              {data.league.name} record book
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The league history rolled into standings, marks, rivalries, and
              title lore for the cast to cite.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill tone="info">
                {data.league.provider.toUpperCase()} {data.league.season}
              </StatusPill>
              <StatusPill tone="neutral">
                {data.managers.length} managers
              </StatusPill>
              <StatusPill tone="neutral">
                {data.catalog.allTimeStandings.length} all-time rows
              </StatusPill>
            </div>
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

      {!data.catalog.integrityBlocked && !hasTrustedRecordData(data) ? (
        <EmptyState className="p-5" title="No records calculated yet">
          <p>
            Historical import and stats recompute will populate this page with
            the league's all-time marks.
          </p>
        </EmptyState>
      ) : null}

      {!data.catalog.integrityBlocked && hasTrustedRecordData(data) ? (
        <>
          <nav
            aria-label="Record book sections"
            className="panel sticky top-14 z-10 overflow-x-auto px-2 py-2 lg:top-16"
          >
            <div className="flex min-w-max gap-1">
              {recordBookNav.map((item) => (
                <Link
                  className="inline-flex min-h-11 items-center rounded-control px-3 py-2 font-display text-sm text-muted-foreground hover:bg-primary/10 hover:text-foreground focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
          <AllTimeStandings data={data} />
          <RecordSection
            data={data}
            id="career-marks"
            records={careerRecords}
            title="Career marks"
          />
          <RecordSection
            data={data}
            id="season-records"
            records={seasonRecords}
            title="Season records"
          />
          <RecordSection
            data={data}
            id="single-week-records"
            records={weeklyRecords}
            title="Single-week records"
          />
          <HighLowSection data={data} />
          <StreaksAndBlowouts data={data} />
          <Championships data={data} />
          <Rivalries data={data} />
          <KeeperMilestones data={data} />
        </>
      ) : null}
    </main>
  );
}
