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
import { cn } from "@/lib/utils";
import type { HeadToHeadPairCatalogEntry } from "@/stats";
import {
  formatNumber,
  formatPercent,
  formatRecordContext,
  formatRecordValue,
  h2hHref,
  managerHref,
} from "./records-format";
import type {
  CurrentRecordBookEntry,
  RecordsPageData,
} from "./records-page-data";

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
    <article className="rounded-card border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Trophy className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="font-mono text-lg font-semibold tabular-nums">
          {formatRecordValue(record)}
        </p>
      </div>
      <h3 className="text-base font-semibold tracking-tight">{record.label}</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {record.holderPersonId ? (
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline"
            href={managerHref(data.league, record.holderPersonId)}
          >
            {record.holderName ?? "Unknown holder"}
          </Link>
        ) : (
          "Unknown holder"
        )}
        {record.opponentName ? ` - vs ${record.opponentName}` : ""}
        {record.season ? ` - ${record.season}` : ""}
        {record.scoringPeriod ? ` - Week ${record.scoringPeriod}` : ""}
      </p>
      {record.previousRecordId ? (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Previous: {record.previousHolderName ?? "Unknown holder"}
          {record.previousValue !== null
            ? ` at ${formatNumber(record.previousValue)}`
            : ""}
        </p>
      ) : null}
    </article>
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

function AllTimeStandings({ data }: { data: RecordsPageData }) {
  const standings = data.catalog.allTimeStandings;
  if (standings.length === 0) {
    return null;
  }

  return (
    <Section
      icon={<Crown className="size-4 text-primary" aria-hidden="true" />}
      title="All-time standings"
    >
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Rank</th>
              <th className="px-3 py-2 font-medium">Manager</th>
              <th className="px-3 py-2 font-medium">W-L-T</th>
              <th className="px-3 py-2 font-medium">Win %</th>
              <th className="px-3 py-2 font-medium">PF</th>
              <th className="px-3 py-2 font-medium">Titles</th>
              <th className="px-3 py-2 font-medium">Playoffs</th>
              <th className="px-3 py-2 font-medium">Best season</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr className="border-t border-border" key={row.personId}>
                <td className="px-3 py-3 font-mono tabular-nums">{row.rank}</td>
                <td className="px-3 py-3 font-medium">
                  <Link
                    className="underline-offset-4 hover:underline"
                    href={managerHref(data.league, row.personId)}
                  >
                    {row.personName}
                  </Link>
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {row.wins}-{row.losses}-{row.ties}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatPercent(row.winPercentage)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {formatNumber(row.pointsFor)}
                </td>
                <td className="px-3 py-3 tabular-nums">{row.championships}</td>
                <td className="px-3 py-3 tabular-nums">
                  {row.playoffAppearances}
                </td>
                <td className="px-3 py-3">
                  {row.bestSeason
                    ? `${row.bestSeason.season} (${row.bestSeason.wins}-${row.bestSeason.losses})`
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

function RecordSection({
  data,
  records,
  title,
}: {
  data: RecordsPageData;
  records: readonly CurrentRecordBookEntry[];
  title: string;
}) {
  if (records.length === 0) {
    return null;
  }

  return (
    <Section title={title}>
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
    <div className="rounded-card border border-border bg-card p-4">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
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
    <Section title="Highs and lows">
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
    <Section title="Streaks and margins">
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
      title="Championship history"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-card border border-border">
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
    <div className="rounded-card border border-border bg-card p-4">
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
      <Section title="Draft and keeper milestones">
        <div className="rounded-card border border-dashed border-border bg-muted/25 p-4">
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
      title="Draft and keeper milestones"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {keeper.entries.slice(0, 6).map((entry) => (
          <article
            className="rounded-card border border-border bg-card p-4"
            key={entry.milestoneKey}
          >
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
              The league history rolled into standings, marks, rivalries, and
              title lore for the cast to cite.
            </p>
          </div>
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

      {!data.catalog.integrityBlocked && !hasTrustedRecordData(data) ? (
        <section className="rounded-card border border-dashed border-border bg-muted/25 p-4">
          <h2 className="text-base font-semibold tracking-tight">
            No records calculated yet
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Historical import and stats recompute will populate this page with
            the league's all-time marks.
          </p>
        </section>
      ) : null}

      {!data.catalog.integrityBlocked && hasTrustedRecordData(data) ? (
        <>
          <AllTimeStandings data={data} />
          <RecordSection
            data={data}
            records={careerRecords}
            title="Career marks"
          />
          <RecordSection
            data={data}
            records={seasonRecords}
            title="Season records"
          />
          <RecordSection
            data={data}
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
