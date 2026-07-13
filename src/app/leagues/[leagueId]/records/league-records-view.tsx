import {
  ArrowLeft,
  Crown,
  Database,
  Landmark,
  Swords,
  Trophy,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  PublicationMasthead,
  type PublicationNavItem,
} from "@/components/publication/front-view";
import { Edge } from "@/components/ui/edge";
import { EmptyState } from "@/components/ui/empty-state";
import { KVList } from "@/components/ui/kv";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import {
  type HeadToHeadPairCatalogEntry,
  RECORD_CATEGORY_REGISTRY,
} from "@/stats";
import {
  formatNumber,
  formatPercent,
  formatRecordValue,
  h2hHref,
  leagueRecordsHref,
  managerHref,
} from "./records-format";
import type {
  CurrentRecordBookEntry,
  RecordsLensInput,
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
    data.catalog.players.bestWeeks.length > 0 ||
    data.catalog.milestones.keeper.status === "available"
  );
}

const segmentOptions = [
  { label: "Both", value: "both" },
  { label: "Regular", value: "regular" },
  { label: "Playoff", value: "playoff" },
] as const;

function lensInput(
  data: RecordsPageData,
  updates: Partial<RecordsLensInput>,
): RecordsLensInput {
  return {
    groupingId:
      updates.groupingId === undefined
        ? data.lens.groupingId
        : updates.groupingId,
    segment: updates.segment ?? data.lens.segment,
  };
}

function seasonSetLabel(seasons: readonly number[]): string {
  if (seasons.length === 0) {
    return "All seasons";
  }
  if (seasons.length === 1) {
    return String(seasons[0]);
  }
  return `${seasons[0]}-${seasons[seasons.length - 1]}`;
}

function LensControls({ data }: { data: RecordsPageData }) {
  const selectedGrouping = data.lens.groupingId
    ? (data.lens.groupings.find(
        (option) => option.id === data.lens.groupingId,
      ) ?? null)
    : null;

  return (
    <section aria-label="Record book lens" className="grid gap-4">
      <div className="grid gap-1">
        <p className="eyebrow text-primary">Lens</p>
        <p className="text-sm text-muted-foreground">
          Records recalculate by segment and confirmed era; cumulative remains
          the default.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="grid gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-4">
            Segment
          </p>
          <div className="flex flex-wrap gap-2">
            {segmentOptions.map((option) => {
              const selected = data.lens.segment === option.value;
              return (
                <Link
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] transition-[background-color,box-shadow,color,border-color]",
                    selected
                      ? "border-primary/50 bg-primary/20 text-lilac-hi shadow-[0_0_18px_var(--glow-lilac)]"
                      : "border-[var(--hair-2)] bg-[var(--control-inset)] text-ink-3 hover:border-primary/40 hover:text-foreground",
                  )}
                  href={leagueRecordsHref(
                    data.league,
                    lensInput(data, { segment: option.value }),
                  )}
                  key={option.value}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>
        {data.lens.groupings.length > 0 ? (
          <div className="grid gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-4">
              Era
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                aria-current={
                  data.lens.groupingId === null ? "page" : undefined
                }
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] transition-[background-color,box-shadow,color,border-color]",
                  data.lens.groupingId === null
                    ? "border-primary/50 bg-primary/20 text-lilac-hi shadow-[0_0_18px_var(--glow-lilac)]"
                    : "border-[var(--hair-2)] bg-[var(--control-inset)] text-ink-3 hover:border-primary/40 hover:text-foreground",
                )}
                href={leagueRecordsHref(
                  data.league,
                  lensInput(data, { groupingId: null }),
                )}
              >
                Cumulative
              </Link>
              {data.lens.groupings.map((option) => {
                const selected = data.lens.groupingId === option.id;
                return (
                  <Link
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] transition-[background-color,box-shadow,color,border-color]",
                      selected
                        ? "border-primary/50 bg-primary/20 text-lilac-hi shadow-[0_0_18px_var(--glow-lilac)]"
                        : "border-[var(--hair-2)] bg-[var(--control-inset)] text-ink-3 hover:border-primary/40 hover:text-foreground",
                    )}
                    href={leagueRecordsHref(
                      data.league,
                      lensInput(data, { groupingId: option.id }),
                    )}
                    key={option.id}
                    title={`${option.name}: ${seasonSetLabel(option.seasons)} (${option.formatType})`}
                  >
                    {option.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusPill tone="info">
          {data.lens.segment === "both" ? "All games" : data.lens.segment}
        </StatusPill>
        <StatusPill tone="neutral">
          {selectedGrouping
            ? `${selectedGrouping.name} · ${seasonSetLabel(selectedGrouping.seasons)}`
            : "Cumulative"}
        </StatusPill>
        <StatusPill tone="neutral">Scope: league</StatusPill>
      </div>
    </section>
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
        <h3 className="font-display text-base font-medium">{record.label}</h3>
        <p className="text-sm text-muted-foreground">
          {record.holderPersonId ? (
            <Link
              className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
              href={managerHref(data.league, record.holderPersonId, data.lens)}
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
        <h2 className="heading-auspex text-lg">{title}</h2>
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
      title="All-time"
    >
      <AllTimeStandingsTable
        league={data.league}
        lens={data.lens}
        rows={standings}
      />
    </Section>
  );
}

function RecordCardGrid({
  data,
  records,
}: {
  data: RecordsPageData;
  records: readonly CurrentRecordBookEntry[];
}) {
  if (records.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {records.map((record, index) => (
        <RecordCard
          data={data}
          key={recordCardKey(record, index)}
          record={record}
        />
      ))}
    </div>
  );
}

function recordCardKey(record: CurrentRecordBookEntry, index: number): string {
  return [
    "record",
    record.id,
    record.recordType,
    record.holderPersonId ?? "unknown",
    record.opponentPersonId ?? "none",
    record.season ?? "career",
    record.scoringPeriod ?? "all",
    record.value,
    index,
  ].join(":");
}

function CompactList({
  items,
  title,
}: {
  items: readonly {
    context: string;
    id: string;
    label: string;
    value: string;
  }[];
  title: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="cell p-4">
      <h3 className="font-display text-sm font-medium">{title}</h3>
      <ol className="mt-3 grid gap-2">
        {items.slice(0, 5).map((item, index) => (
          <li
            className="flex items-start justify-between gap-3"
            key={`${item.id}-${index}`}
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

function RegularSeasonSection({ data }: { data: RecordsPageData }) {
  const regular = data.catalog.regularSeason;
  if (
    regular.standings.length === 0 &&
    regular.highestScoringSeasons.length === 0
  ) {
    return (
      <Section id="regular-season" title="Regular season">
        <div className="cell border-dashed p-4">
          <h3 className="text-sm font-medium">No regular-season rows</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The current lens is excluding regular-season games.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section id="regular-season" title="Regular season">
      <div className="grid gap-3 lg:grid-cols-3">
        <CompactList
          items={regular.standings.map((row) => ({
            context: `${row.wins}-${row.losses}-${row.ties} · ${formatPercent(row.winPercentage)}`,
            id: `regular-standing-${row.personId}`,
            label: row.personName,
            value: formatNumber(row.pointsFor),
          }))}
          title="Regular records"
        />
        <CompactList
          items={regular.highestScoringSeasons.map((row) => ({
            context: `${row.season} · ${row.wins}-${row.losses}-${row.ties}`,
            id: `regular-high-season-${row.personId}-${row.season}`,
            label: row.personName,
            value: formatNumber(row.value),
          }))}
          title="Highest regular seasons"
        />
        <CompactList
          items={[...regular.standings]
            .sort(
              (left, right) =>
                right.topScoringWeeks - left.topScoringWeeks ||
                left.rank - right.rank,
            )
            .map((row) => ({
              context: `${formatNumber(row.avgPointsFor)} avg PF`,
              id: `regular-top-weeks-${row.personId}`,
              label: row.personName,
              value: `${row.topScoringWeeks}`,
            }))}
          title="Top-scoring weeks"
        />
      </div>
    </Section>
  );
}

function PlayoffSection({ data }: { data: RecordsPageData }) {
  const playoff = data.catalog.playoff;
  const managerRecords = data.catalog.championships.managerRecords.filter(
    (row) =>
      row.playoffWins +
        row.playoffLosses +
        row.playoffTies +
        row.championships +
        row.runnerUps >
      0,
  );
  if (playoff.standings.length === 0 && managerRecords.length === 0) {
    return (
      <Section id="playoff" title="Playoff">
        <div className="cell border-dashed p-4">
          <h3 className="text-sm font-medium">No playoff rows</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            The current lens is excluding playoff games or no pushed playoff
            facts exist yet.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section id="playoff" title="Playoff">
      <div className="grid gap-3 lg:grid-cols-3">
        <CompactList
          items={playoff.standings.map((row) => ({
            context: `${row.wins}-${row.losses}-${row.ties} · ${formatPercent(row.winPercentage)}`,
            id: `playoff-standing-${row.personId}`,
            label: row.personName,
            value: formatNumber(row.pointsFor),
          }))}
          title="Playoff records"
        />
        <CompactList
          items={managerRecords.map((row) => ({
            context: `${row.runnerUps} runner-up · ${row.championshipAppearances} title games`,
            id: `playoff-titles-${row.personId}`,
            label: row.personName,
            value: `${row.championships}`,
          }))}
          title="Titles"
        />
        <CompactList
          items={[...managerRecords]
            .sort(
              (left, right) =>
                right.playoffPointsFor - left.playoffPointsFor ||
                compareRecordNames(left.personName, right.personName),
            )
            .map((row) => ({
              context: `${row.playoffWins}-${row.playoffLosses}-${row.playoffTies}`,
              id: `playoff-pf-${row.personId}`,
              label: row.personName,
              value: formatNumber(row.playoffPointsFor),
            }))}
          title="Playoff PF"
        />
      </div>
    </Section>
  );
}

function compareRecordNames(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
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
      <h3 className="text-sm font-medium">{title}</h3>
      <ol className="mt-3 grid gap-2">
        {pairs.slice(0, 4).map((pair, index) => (
          <li
            className="grid gap-1"
            key={`${pair.personA.personId}-${pair.personB.personId}-${pair.season}-${index}`}
          >
            <Link
              className="text-sm font-medium underline-offset-4 hover:underline"
              href={h2hHref(
                data.league,
                pair.personA.personId,
                pair.personB.personId,
                data.lens,
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

function HeadToHeadSection({ data }: { data: RecordsPageData }) {
  const pairs = data.catalog.headToHead.allTimePairs;
  const streaks = data.catalog.headToHead.longestStreaks;
  if (pairs.length === 0 && streaks.length === 0) {
    return null;
  }

  return (
    <Section
      icon={<Swords className="size-4 text-primary" aria-hidden="true" />}
      id="head-to-head"
      title="Head-to-head"
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
        <CompactList
          items={streaks.map((row) => ({
            context: `vs ${row.opponent.personName} · ${row.meetings} meetings`,
            id: `h2h-streak-${row.holder.personId}-${row.opponent.personId}-${row.season}`,
            label: row.holder.personName,
            value: `${row.length}`,
          }))}
          title="Longest H2H streaks"
        />
      </div>
    </Section>
  );
}

const playerPositionOrder = ["QB", "RB", "WR", "TE", "K", "D-ST"] as const;

function playerWeekContext(row: {
  personName: string;
  position: string;
  proTeam: string | null;
  scoringPeriod: number;
  season: number;
}): string {
  return [
    row.position,
    row.proTeam,
    row.personName,
    row.season,
    `Week ${row.scoringPeriod}`,
  ]
    .filter(Boolean)
    .join(" - ");
}

function draftContext(row: {
  personName: string;
  pickOverall: number;
  round: number;
  season: number;
  seasonPoints: number;
}): string {
  return [
    row.personName,
    `${row.season}`,
    `Round ${row.round}`,
    `Pick ${row.pickOverall}`,
    `${formatNumber(row.seasonPoints)} pts`,
  ].join(" - ");
}

function PlayersSection({ data }: { data: RecordsPageData }) {
  const players = data.catalog.players;
  const positionRows = playerPositionOrder.flatMap((position) =>
    players.positionalBests[position].slice(0, 1).map((row) => ({
      ...row,
      positionLabel: position,
    })),
  );

  if (
    players.bestWeeks.length === 0 &&
    positionRows.length === 0 &&
    players.draftSteals.length === 0 &&
    players.draftBusts.length === 0 &&
    players.benchTragedies.length === 0
  ) {
    return null;
  }

  return (
    <Section
      icon={<UserRound className="size-4 text-primary" aria-hidden="true" />}
      id="players"
      title="Players"
    >
      <div className="cell mb-3 flex items-start gap-3 p-3 sm:p-4">
        <span
          aria-hidden="true"
          className="chip-glyph flex size-9 shrink-0 items-center justify-center"
        >
          <Database className="size-4 text-steel" />
        </span>
        <div className="grid gap-1">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
            Player record basis
          </p>
          <p className="text-sm text-foreground">{data.playerDataBasis}</p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <CompactList
          items={players.bestWeeks.map((row) => ({
            context: playerWeekContext(row),
            id: `player-best-week-${row.providerPlayerId}-${row.personId}-${row.season}-${row.scoringPeriod}`,
            label: row.playerName,
            value: formatNumber(row.value),
          }))}
          title="Best player weeks"
        />
        <CompactList
          items={positionRows.map((row) => ({
            context: playerWeekContext(row),
            id: `player-position-${row.positionLabel}-${row.providerPlayerId}-${row.season}-${row.scoringPeriod}`,
            label: `${row.positionLabel}: ${row.playerName}`,
            value: formatNumber(row.value),
          }))}
          title="Positional highs"
        />
        <CompactList
          items={players.benchTragedies.map((row) => ({
            context: playerWeekContext(row),
            id: `player-bench-${row.providerPlayerId}-${row.personId}-${row.season}-${row.scoringPeriod}`,
            label: row.playerName,
            value: formatNumber(row.value),
          }))}
          title="Bench tragedies"
        />
        <CompactList
          items={players.draftSteals.map((row) => ({
            context: draftContext(row),
            id: `player-draft-steal-${row.providerPickId}-${row.providerPlayerId}`,
            label: row.playerName,
            value: `+${row.value}`,
          }))}
          title="Draft steals"
        />
        <CompactList
          items={players.draftBusts.map((row) => ({
            context: draftContext(row),
            id: `player-draft-bust-${row.providerPickId}-${row.providerPlayerId}`,
            label: row.playerName,
            value: `+${row.value}`,
          }))}
          title="Draft busts"
        />
      </div>
    </Section>
  );
}

function AchievementsSection({ data }: { data: RecordsPageData }) {
  const records = recordGroup(data.currentRecords, [
    "best_score_in_loss",
    "biggest_blowout",
    "highest_combined_matchup",
    "highest_single_week_score",
    "longest_win_streak",
    "most_championships",
    "most_points_for_season",
    "most_top_scoring_weeks",
  ]);
  const achievements = data.catalog.achievements;

  if (
    records.length === 0 &&
    achievements.highestScoringSeasons.length === 0 &&
    achievements.mostTopScoringWeeks.length === 0
  ) {
    return null;
  }

  return (
    <Section
      icon={<Trophy className="size-4 text-primary" aria-hidden="true" />}
      id="achievements"
      title="Achievements"
    >
      <RecordCardGrid data={data} records={records} />
      <div className="grid gap-3 lg:grid-cols-3">
        <CompactList
          items={data.catalog.highLow.highestScores.map((row) => ({
            context: `${row.season} · Week ${row.scoringPeriod}`,
            id: `achievement-high-week-${row.personId}-${row.matchupId ?? "no-matchup"}-${row.season}-${row.scoringPeriod}`,
            label: row.personName,
            value: formatNumber(row.value),
          }))}
          title="Highest weeks"
        />
        <CompactList
          items={achievements.highestScoringSeasons.map((row) => ({
            context: `${row.season} · ${row.wins}-${row.losses}-${row.ties}`,
            id: `achievement-high-season-${row.personId}-${row.season}`,
            label: row.personName,
            value: formatNumber(row.value),
          }))}
          title="Highest seasons"
        />
        <CompactList
          items={achievements.mostTopScoringWeeks.map((row) => ({
            context: "Top weekly scorer",
            id: `achievement-top-weeks-${row.personId}`,
            label: row.personName,
            value: `${row.value}`,
          }))}
          title="Top-scoring weeks"
        />
      </div>
    </Section>
  );
}

function LowlightsSection({ data }: { data: RecordsPageData }) {
  const records = recordGroup(data.currentRecords, [
    "biggest_loss",
    "fewest_points_for_season",
    "longest_loss_streak",
    "lowest_season_scoring_average",
    "lowest_single_week_score",
    "most_bottom_scoring_weeks",
    "most_last_place_finishes",
    "most_points_against_season",
    "narrowest_loss",
    "worst_score_in_win",
    "worst_season_win_percentage",
  ]);
  const lowlights = data.catalog.lowlights;

  if (
    records.length === 0 &&
    lowlights.lowestScoringSeasons.length === 0 &&
    lowlights.mostLastPlaceFinishes.length === 0
  ) {
    return null;
  }

  return (
    <Section id="lowlights" title="Lowlights">
      <RecordCardGrid data={data} records={records} />
      <div className="grid gap-3 lg:grid-cols-3">
        <CompactList
          items={data.catalog.highLow.lowestScores.map((row) => ({
            context: `${row.season} · Week ${row.scoringPeriod}`,
            id: `lowlight-low-week-${row.personId}-${row.matchupId ?? "no-matchup"}-${row.season}-${row.scoringPeriod}`,
            label: row.personName,
            value: formatNumber(row.value),
          }))}
          title="Lowest weeks"
        />
        <CompactList
          items={lowlights.lowestScoringSeasons.map((row) => ({
            context: `${row.season} · ${row.wins}-${row.losses}-${row.ties}`,
            id: `lowlight-low-season-${row.personId}-${row.season}`,
            label: row.personName,
            value: formatNumber(row.value),
          }))}
          title="Lowest PF seasons"
        />
        <CompactList
          items={lowlights.mostLastPlaceFinishes.map((row) => ({
            context: "Last-place finishes",
            id: `lowlight-last-place-${row.personId}`,
            label: row.personName,
            value: `${row.value}`,
          }))}
          title="Most last-place finishes"
        />
        <CompactList
          items={lowlights.biggestLosses.map((row) => ({
            context: `${row.season} · Week ${row.scoringPeriod} vs ${row.opponentName ?? "unknown"}`,
            id: `lowlight-big-loss-${row.personId}-${row.opponentPersonId ?? "no-opponent"}-${row.matchupId ?? "no-matchup"}-${row.season}-${row.scoringPeriod}`,
            label: row.personName,
            value: formatNumber(row.margin),
          }))}
          title="Biggest losses"
        />
        <CompactList
          items={lowlights.narrowestLosses.map((row) => ({
            context: `${row.season} · Week ${row.scoringPeriod} vs ${row.opponentName ?? "unknown"}`,
            id: `lowlight-narrow-loss-${row.personId}-${row.opponentPersonId ?? "no-opponent"}-${row.matchupId ?? "no-matchup"}-${row.season}-${row.scoringPeriod}`,
            label: row.personName,
            value: formatNumber(row.margin),
          }))}
          title="Narrowest losses"
        />
        <CompactList
          items={lowlights.mostBottomScoringWeeks.map((row) => ({
            context: "Bottom weekly scorer",
            id: `lowlight-bottom-weeks-${row.personId}`,
            label: row.personName,
            value: `${row.value}`,
          }))}
          title="Bottom-scoring weeks"
        />
      </div>
    </Section>
  );
}

const recordBookNav: PublicationNavItem[] = RECORD_CATEGORY_REGISTRY.map(
  (category, index) => ({
    active: index === 0,
    href: `#${category.anchorId}`,
    label: category.label,
  }),
);

export function LeagueRecordsView({ data }: { data: RecordsPageData }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-7 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <PublicationMasthead
        actions={[
          {
            href: `/leagues/${data.league.id}`,
            icon: <ArrowLeft data-icon="inline-start" />,
            label: "League home",
          },
          {
            href: `/leagues/${data.league.id}/lore`,
            icon: <Landmark data-icon="inline-start" />,
            label: "Lore",
          },
        ]}
        controls={<LensControls data={data} />}
        deck={`${data.managers.length} managers, ${data.catalog.allTimeStandings.length} career rows, and pushed canonical snapshots only.`}
        eyebrow="RECORD BOOK"
        navAriaLabel="Record book sections"
        navItems={recordBookNav}
        sectionLabel={`${data.league.provider.toUpperCase()} ${data.league.season}`}
        title={`${data.league.name} record book`}
      />

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
        <EmptyState
          className="p-5"
          title={"No pushed data yet \u2014 push from the Data Book"}
        >
          <p>
            Saved checkpoints remain draft-only until a steward pushes a
            canonical snapshot.
          </p>
        </EmptyState>
      ) : null}

      {!data.catalog.integrityBlocked && hasTrustedRecordData(data) ? (
        <>
          <AllTimeStandings data={data} />
          <RegularSeasonSection data={data} />
          <PlayoffSection data={data} />
          <HeadToHeadSection data={data} />
          <PlayersSection data={data} />
          <AchievementsSection data={data} />
          <LowlightsSection data={data} />
        </>
      ) : null}
    </main>
  );
}
