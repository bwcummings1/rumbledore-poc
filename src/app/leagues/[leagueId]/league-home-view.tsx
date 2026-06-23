import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  Bot,
  CalendarDays,
  Clapperboard,
  ListOrdered,
  Newspaper,
  Rss,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { DEFAULT_BANKROLL_FLOOR_CENTS } from "@/betting/bankroll";
import {
  type PublicationStory,
  PublicationStoryCard,
} from "@/components/publication/story-card";
import { LeagueNotificationToggle } from "@/components/pwa/league-notification-toggle";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { type KVItem, KVList } from "@/components/ui/kv";
import { LockedFeatureCard } from "@/components/ui/locked-feature-card";
import {
  CastOrbStatus,
  CountUpValue,
  type ScoreboardMatchup,
  type ScoreboardStatus,
  ScoreboardStrip,
} from "@/components/ui/spectacle";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import {
  TabLinksPanelGroup,
  type TabPanelLinkItem,
} from "@/components/ui/tabs";
import type { EntitlementResolution } from "@/entitlements";
import type {
  LeagueHomeActivation,
  LeagueHomeData,
  LeagueHomeMatchup,
  LeagueHomeMatchupSide,
  LeagueHomeRecord,
  LeagueHomeStanding,
  LeagueHomeStoryline,
  LeagueHomeTeam,
} from "@/home/league-home";
import { cn } from "@/lib/utils";
import { LeagueRealtimeRefresh } from "@/realtime/client";
import { LeagueStandingsTable } from "./league-standings-table";

type LeagueHomeSectionId =
  | "press"
  | "this-week"
  | "standings"
  | "bankroll"
  | "teams"
  | "records"
  | "upcoming";

function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatRecordValue(
  recordType: LeagueHomeData["records"][number]["recordType"],
  value: number,
): string {
  if (recordType === "best_career_win_percentage") {
    return `${Math.round(value * 1000) / 10}%`;
  }
  return formatPoints(value);
}

function formatWinPercentage(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatCents(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function formatRole(value: LeagueHomeData["userRole"]): string {
  return value.replaceAll("_", " ");
}

function leagueStatusLabel(status: LeagueHomeData["league"]["status"]): string {
  switch (status) {
    case "preseason":
      return "Preseason";
    case "in_season":
      return "In season";
    case "complete":
      return "Complete";
    case "unknown":
      return "Status unknown";
  }
}

function leagueStatusTone(
  status: LeagueHomeData["league"]["status"],
): StatusTone {
  switch (status) {
    case "in_season":
      return "live";
    case "complete":
      return "success";
    case "preseason":
      return "warning";
    case "unknown":
      return "neutral";
  }
}

function matchupStatusLabel(status: LeagueHomeMatchup["status"]): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "Live";
    case "final":
      return "Final";
    case "unknown":
      return "Unknown";
  }
}

function matchupStatusTone(status: LeagueHomeMatchup["status"]): StatusTone {
  switch (status) {
    case "in_progress":
      return "live";
    case "final":
      return "success";
    case "scheduled":
      return "warning";
    case "unknown":
      return "neutral";
  }
}

function scoreboardStatus(
  status: LeagueHomeMatchup["status"],
): ScoreboardStatus {
  switch (status) {
    case "final":
      return "final";
    case "in_progress":
      return "live";
    case "scheduled":
      return "upcoming";
    case "unknown":
      return "stale";
  }
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function matchupHomeWinProbability(matchup: LeagueHomeMatchup): number {
  if (matchup.status === "final") {
    if (matchup.home.isWinner) return 100;
    if (matchup.away.isWinner) return 0;
    return 50;
  }
  const diff = matchup.home.score - matchup.away.score;
  if (diff === 0) {
    return 50;
  }
  return Math.round(clampPercent(50 + Math.max(-24, Math.min(24, diff)) * 1.6));
}

function teamStanding(
  standings: readonly LeagueHomeStanding[],
  providerTeamId: string,
): LeagueHomeStanding | null {
  return (
    standings.find((standing) => standing.providerTeamId === providerTeamId) ??
    null
  );
}

function recordLine(row: Pick<LeagueHomeStanding, "losses" | "ties" | "wins">) {
  return `${row.wins}-${row.losses}-${row.ties}`;
}

function toPressTeaserStory({
  leagueId,
  storyline,
}: {
  leagueId: string;
  storyline: LeagueHomeStoryline;
}): PublicationStory {
  return {
    byline: storyline.byline,
    dek: storyline.dek,
    headline: storyline.title,
    href: `/leagues/${leagueId}/press/${storyline.id}`,
    hrefLabel: "Read post",
    id: storyline.id,
    origin: "cast",
    publishedAt: storyline.publishedAt,
    sectionTag: storyline.section.label,
    thumbnailAlt: storyline.title,
    thumbnailUrl: storyline.thumbnailUrl || undefined,
  };
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
}: {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="chip-glyph flex size-7 shrink-0 items-center justify-center">
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <h2 className="truncate font-mono text-xs font-medium uppercase tracking-[0.16em] text-ink-2">
          {title}
        </h2>
      </div>
      {eyebrow ? (
        <span className="hidden max-w-[45%] truncate font-mono text-xs uppercase tracking-[0.1em] text-ink-4 sm:block">
          {eyebrow}
        </span>
      ) : null}
    </div>
  );
}

function HeaderStats({ data }: { data: LeagueHomeData }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Teams"
        value={data.totals.teams}
        caption={`${data.totals.members} managers`}
      />
      <StatTile
        label="Matchups"
        tone="lilac"
        value={data.totals.matchups}
        caption="stored rows"
      />
      <StatTile
        label="Period"
        value={data.currentScoringPeriod ?? "-"}
        caption={`${data.league.season} season`}
      />
      <StatTile
        label="Role"
        value={formatRole(data.userRole)}
        caption={data.league.scoringType}
      />
    </div>
  );
}

function MatchupSideCell({
  claimed,
  side,
  standing,
}: {
  claimed: boolean;
  side: LeagueHomeMatchupSide;
  standing: LeagueHomeStanding | null;
}) {
  const facts: readonly KVItem[] = [
    {
      label: "Record",
      value: standing ? recordLine(standing) : "pending",
    },
    {
      label: "PF",
      value: standing ? formatPoints(standing.pointsFor) : "-",
    },
    {
      label: "Managers",
      value: standing?.managerNames.join(", ") ?? side.abbrev,
    },
  ];

  return (
    <article
      className={cn(
        "cell grid min-w-0 gap-4 p-4",
        claimed &&
          "border-primary bg-primary/10 shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]",
      )}
      data-claimed={claimed ? "true" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-muted-foreground">{side.abbrev}</p>
          <h3 className="truncate font-display text-base font-medium text-foreground">
            {side.name}
          </h3>
        </div>
        {claimed ? (
          <StatusPill tone="live" variant="soft">
            You
          </StatusPill>
        ) : null}
      </div>
      <CountUpValue
        className="justify-self-start text-4xl font-bold leading-none sm:text-5xl"
        label={`${side.name} score`}
        tone={claimed ? "live" : side.isWinner ? "positive" : "default"}
        value={formatPoints(side.score)}
      />
      <KVList items={facts} />
    </article>
  );
}

function MatchupRange({ matchup }: { matchup: LeagueHomeMatchup }) {
  const homeProbability = matchupHomeWinProbability(matchup);
  return (
    <div className="cell grid gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <StatusPill tone={matchupStatusTone(matchup.status)}>
          {matchupStatusLabel(matchup.status)}
        </StatusPill>
        <span className="metric text-xs text-muted-foreground">
          Week {matchup.scoringPeriod}
        </span>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{matchup.away.abbrev}</span>
          <span className="eyebrow text-foreground">win probability range</span>
          <span>{matchup.home.abbrev}</span>
        </div>
        <div
          aria-label={`${matchup.home.name} win probability`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={homeProbability}
          className="h-3 overflow-hidden rounded-full bg-[var(--hair-2)]"
          role="progressbar"
        >
          <span
            className="block h-full rounded-full bg-primary shadow-[0_0_14px_var(--glow-lilac)]"
            style={{ inlineSize: `${homeProbability}%` }}
          />
        </div>
        <p className="metric text-center text-xs text-muted-foreground">
          {matchup.home.abbrev} {homeProbability}%
        </p>
      </div>
    </div>
  );
}

function CastInsightStrip({
  activation,
  leagueId,
}: {
  activation: LeagueHomeActivation;
  leagueId: string;
}) {
  const story = activation.castTeaser.storyline
    ? toPressTeaserStory({
        leagueId,
        storyline: activation.castTeaser.storyline,
      })
    : null;
  const allTime = activation.allTime
    ? `${activation.allTime.wins}-${activation.allTime.losses}-${
        activation.allTime.ties
      } · ${formatWinPercentage(activation.allTime.winPercentage)}`
    : "History building";

  return (
    <div className="cell grid gap-3 p-4 lg:col-span-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CastOrbStatus
            label="The cast is reading this matchup"
            state={story ? "writing" : "idle"}
          />
          <div className="min-w-0">
            <p className="eyebrow text-primary">Cast read</p>
            <p className="text-sm font-medium text-foreground">
              {activation.castTeaser.message}
            </p>
          </div>
        </div>
        <p className="metric text-sm text-muted-foreground">{allTime}</p>
      </div>
      {story ? (
        <PublicationStoryCard story={story} variant="inFeed" />
      ) : (
        <p className="rounded-control border border-dashed border-primary/30 bg-primary/10 px-3 py-3 text-sm text-muted-foreground">
          You're in the next dispatch.
        </p>
      )}
    </div>
  );
}

function MatchupHeroSection({ data }: { data: LeagueHomeData }) {
  const activation = data.activation;
  if (!activation) {
    return (
      <section
        aria-label="This-week matchup"
        className="panel grid gap-4 p-4 sm:p-5"
      >
        <SectionTitle
          icon={Clapperboard}
          eyebrow="This week"
          title="Your week is not locked yet"
        />
        <EmptyState
          className="justify-items-start text-left"
          icon={<Clapperboard className="size-4" />}
          title="Your league is importing — history lands soon"
        >
          <p>
            League data remains visible below. Once your team claim or import
            completes, this hero locks onto your matchup and cast read.
          </p>
        </EmptyState>
      </section>
    );
  }

  const matchup = activation.currentMatchup;
  if (!matchup) {
    return (
      <section
        aria-label="This-week matchup"
        className="panel grid gap-4 p-4 sm:p-5"
      >
        <SectionTitle
          icon={Clapperboard}
          eyebrow="Your team is waiting"
          title={activation.team.name}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Standings"
            tone="lilac"
            value={`#${activation.team.rank}`}
            caption={recordLine(activation.team)}
          />
          <StatTile
            label="Points for"
            value={formatPoints(activation.team.pointsFor)}
            caption="current season"
          />
          <StatTile
            label="All-time"
            value={
              activation.allTime
                ? `${activation.allTime.wins}-${activation.allTime.losses}-${activation.allTime.ties}`
                : "pending"
            }
            caption={
              activation.allTime
                ? formatWinPercentage(activation.allTime.winPercentage)
                : "history building"
            }
          />
        </div>
        <CastInsightStrip activation={activation} leagueId={data.league.id} />
      </section>
    );
  }

  const awayStanding = teamStanding(data.standings, matchup.away.teamId);
  const homeStanding = teamStanding(data.standings, matchup.home.teamId);

  return (
    <section
      aria-label="This-week matchup"
      className="panel grid gap-4 overflow-hidden p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle
          icon={Clapperboard}
          eyebrow="Your team is waiting"
          title={`${matchup.away.name} at ${matchup.home.name}`}
        />
        <StatusPill tone={matchupStatusTone(matchup.status)}>
          Week {matchup.scoringPeriod} · {matchupStatusLabel(matchup.status)}
        </StatusPill>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem_minmax(0,1fr)]">
        <MatchupSideCell
          claimed={matchup.away.teamId === activation.team.providerTeamId}
          side={matchup.away}
          standing={awayStanding}
        />
        <MatchupRange matchup={matchup} />
        <MatchupSideCell
          claimed={matchup.home.teamId === activation.team.providerTeamId}
          side={matchup.home}
          standing={homeStanding}
        />
        <CastInsightStrip activation={activation} leagueId={data.league.id} />
      </div>
    </section>
  );
}

function toScoreboardMatchup(matchup: LeagueHomeMatchup): ScoreboardMatchup {
  return {
    awayLabel: matchup.away.abbrev,
    awayScore: formatPoints(matchup.away.score),
    homeLabel: matchup.home.abbrev,
    homeScore: formatPoints(matchup.home.score),
    id: matchup.id,
    kickoffLabel: `Week ${matchup.scoringPeriod}`,
    status: scoreboardStatus(matchup.status),
    winProbability: matchupHomeWinProbability(matchup),
  };
}

function ScoresSection({ data }: { data: LeagueHomeData }) {
  const title =
    data.currentScoringPeriod === null
      ? "Current matchups"
      : `Week ${data.currentScoringPeriod} matchups`;

  return (
    <section className="grid gap-3">
      <SectionTitle icon={Activity} title={title} />
      <ScoreboardStrip
        matchups={data.currentMatchups.map(toScoreboardMatchup)}
        nextKickoffLabel="Matchups are still importing"
      />
    </section>
  );
}

function StandingsSection({ data }: { data: LeagueHomeData }) {
  return (
    <section className="panel grid gap-4 p-4">
      <SectionTitle
        icon={ListOrdered}
        eyebrow={`${data.league.scoringType} standings`}
        title="Standings"
      />
      <LeagueStandingsTable rows={data.standings} />
    </section>
  );
}

function RecordTile({ record }: { record: LeagueHomeRecord }) {
  return (
    <article className="cell grid gap-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-medium text-foreground">
            {record.label}
          </h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {record.holderName ?? "Unknown holder"}
            {record.season ? ` · ${record.season}` : ""}
            {record.scoringPeriod ? ` · Week ${record.scoringPeriod}` : ""}
          </p>
        </div>
        <p className="lcd shrink-0 text-sm font-semibold">
          {formatRecordValue(record.recordType, record.value)}
        </p>
      </div>
      {record.previousRecordId ? (
        <p className="text-xs text-muted-foreground">Previous mark archived</p>
      ) : null}
    </article>
  );
}

function RecordsSection({ data }: { data: LeagueHomeData }) {
  const featured = data.records.slice(0, 6);
  return (
    <section className="panel grid gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle icon={Trophy} title="Record book" />
        <Link
          href={`/leagues/${data.league.id}/records`}
          className={cn(
            buttonVariants({
              className: "shrink-0",
              size: "sm",
              variant: "outline",
            }),
          )}
        >
          Open records
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
      {featured.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {featured.map((record, index) => (
            <RecordTile
              key={[
                record.id,
                record.recordType,
                record.holderName ?? "unknown",
                record.opponentName ?? "none",
                record.season ?? "career",
                record.scoringPeriod ?? "all",
                record.value,
                index,
              ].join(":")}
              record={record}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No finalized matchup records have been calculated yet." />
      )}
    </section>
  );
}

function TeamCell({ team }: { team: LeagueHomeTeam }) {
  return (
    <article
      className={cn(
        "cell flex min-w-0 items-start gap-3 p-3",
        team.isClaimedByUser &&
          "border-primary bg-primary/10 shadow-[0_0_16px_var(--glow-lilac),var(--bevel)]",
      )}
    >
      <span
        aria-hidden="true"
        className="chip-glyph flex size-9 shrink-0 items-center justify-center text-xs"
      >
        {team.abbrev.slice(0, 3)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {team.name}
          {team.isClaimedByUser ? (
            <span className="ml-2 text-xs text-primary">You</span>
          ) : null}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {team.managerNames.join(", ")}
        </p>
      </div>
    </article>
  );
}

function TeamsSection({ data }: { data: LeagueHomeData }) {
  return (
    <section className="panel grid gap-4 p-4">
      <SectionTitle
        icon={Users}
        eyebrow={`${data.totals.members} managers`}
        title="Teams"
      />
      {data.teams.length > 0 ? (
        <div className="grid max-h-[32rem] gap-3 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-1">
          {data.teams.map((team) => (
            <TeamCell key={team.id} team={team} />
          ))}
        </div>
      ) : (
        <EmptyState title="No teams have been ingested yet." />
      )}
    </section>
  );
}

function CastRailLockedPreview() {
  return (
    <div className="grid h-full gap-3 p-4">
      <div className="cell grid gap-2 p-3">
        <div className="flex items-center gap-2">
          <span className="orb orb-sm muted" aria-hidden="true" />
          <div className="h-3 w-32 rounded-full bg-primary/40" />
        </div>
        <div className="h-3 w-4/5 rounded-full bg-muted-foreground/30" />
        <div className="h-3 w-2/3 rounded-full bg-warning/30" />
      </div>
      <div className="cell grid gap-2 p-3">
        <div className="h-3 w-24 rounded-full bg-primary/30" />
        <div className="h-3 w-3/4 rounded-full bg-muted-foreground/25" />
      </div>
    </div>
  );
}

function PressTeaserSection({
  castEntitlement,
  data,
}: {
  castEntitlement?: EntitlementResolution;
  data: LeagueHomeData;
}) {
  const [lead, ...river] = data.storylines;
  const castBlocked = castEntitlement && !castEntitlement.allowed;

  return (
    <section
      className="panel grid gap-4 p-4"
      aria-label="From the Press"
      data-register="dashboard-press-teaser"
    >
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          icon={Newspaper}
          eyebrow="League publication teaser"
          title="From the Press"
        />
        <Link
          href={`/leagues/${data.league.id}/press`}
          className={cn(
            buttonVariants({
              className: "shrink-0",
              size: "sm",
              variant: "outline",
            }),
          )}
        >
          Read The Press
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
      {castBlocked ? (
        <LockedFeatureCard
          action={
            <Link
              href="/you#upgrade-options"
              className={cn(buttonVariants({ variant: "amber" }))}
            >
              Review upgrade options
              <ArrowRight data-icon="inline-end" />
            </Link>
          }
          feature="league-cast"
          preview={<CastRailLockedPreview />}
          previewLabel="A muted preview of the league cast rail is shown behind the locked message."
          reasonCode={castEntitlement.reason}
        />
      ) : lead ? (
        <div className="grid gap-3">
          <PublicationStoryCard
            story={toPressTeaserStory({
              leagueId: data.league.id,
              storyline: lead,
            })}
            variant="inFeed"
          />
          {river.map((storyline) => (
            <PublicationStoryCard
              key={storyline.id}
              story={toPressTeaserStory({
                leagueId: data.league.id,
                storyline,
              })}
              variant="compact"
            />
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/leagues/${data.league.id}/cast`}
                className={cn(
                  buttonVariants({ className: "w-fit", variant: "outline" }),
                )}
              >
                <Bot data-icon="inline-start" />
                Cast roster
              </Link>
              <Link
                href={`/leagues/${data.league.id}/press`}
                className={cn(buttonVariants({ className: "w-fit" }))}
              >
                Unlock the cast
                <ArrowRight data-icon="inline-end" />
              </Link>
            </div>
          }
          title="The Press is quiet"
        >
          <p>
            Standings and records stay open. Cast headlines appear here after
            the next entitled publishing run.
          </p>
        </EmptyState>
      )}
    </section>
  );
}

function BankrollPreviewSection({ leagueId }: { leagueId: string }) {
  return (
    <section className="panel grid gap-4 border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          icon={WalletCards}
          eyebrow="Paper bankroll"
          title="Bankroll"
        />
        <StatusPill tone="warning">play-money</StatusPill>
      </div>
      <StatTile
        caption="Weekly rolling floor before open slips."
        label="Floor"
        tone="amber"
        value={formatCents(DEFAULT_BANKROLL_FLOOR_CENTS)}
      />
      <KVList
        items={[
          {
            label: "Loop",
            value: "finish above floor to carry; below floor resets",
          },
          {
            label: "Desk",
            value: (
              <Link
                href={`/leagues/${leagueId}/bet`}
                className="font-medium text-warning underline-offset-4 hover:underline focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
              >
                Open Bet
              </Link>
            ),
            tone: "money",
          },
        ]}
      />
    </section>
  );
}

function UpcomingSection({ data }: { data: LeagueHomeData }) {
  return (
    <section className="panel grid gap-4 p-4">
      <SectionTitle icon={CalendarDays} title="Upcoming" />
      <KVList
        items={[
          {
            label: "Pairings",
            value:
              data.currentMatchups.length > 0
                ? `${data.currentMatchups.length} on the board`
                : "none imported",
          },
          {
            label: "Scoring period",
            value: data.currentScoringPeriod ?? "-",
          },
          {
            label: "Provider",
            value: data.league.provider.toUpperCase(),
          },
        ]}
      />
    </section>
  );
}

export function LeagueHomeView({
  castEntitlement,
  data,
}: {
  castEntitlement?: EntitlementResolution;
  data: LeagueHomeData;
}) {
  const sectionItems: readonly TabPanelLinkItem[] = [
    {
      label: "Press",
      panel: (
        <PressTeaserSection castEntitlement={castEntitlement} data={data} />
      ),
      value: "press" satisfies LeagueHomeSectionId,
    },
    {
      label: "This Week",
      panel: (
        <div className="grid gap-6">
          <MatchupHeroSection data={data} />
          <ScoresSection data={data} />
        </div>
      ),
      value: "this-week" satisfies LeagueHomeSectionId,
    },
    {
      label: "Standings",
      panel: <StandingsSection data={data} />,
      value: "standings" satisfies LeagueHomeSectionId,
    },
    {
      label: "Bankroll",
      panel: <BankrollPreviewSection leagueId={data.league.id} />,
      value: "bankroll" satisfies LeagueHomeSectionId,
    },
    {
      label: "Teams",
      panel: <TeamsSection data={data} />,
      value: "teams" satisfies LeagueHomeSectionId,
    },
    {
      label: "Record Book",
      panel: <RecordsSection data={data} />,
      value: "records" satisfies LeagueHomeSectionId,
    },
    {
      label: "Upcoming",
      panel: <UpcomingSection data={data} />,
      value: "upcoming" satisfies LeagueHomeSectionId,
    },
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <LeagueRealtimeRefresh leagueId={data.league.id} />
      <TabLinksPanelGroup
        ariaLabel="League home sections"
        defaultValue="press"
        header={
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={leagueStatusTone(data.league.status)}>
                    {leagueStatusLabel(data.league.status)}
                  </StatusPill>
                  <span className="eyebrow text-primary">League home</span>
                </div>
                <h1 className="heading-auspex mt-3 text-xl leading-tight">
                  {data.league.name}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.league.season} ESPN fantasy football ·{" "}
                  {leagueStatusLabel(data.league.status)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <LeagueNotificationToggle leagueId={data.league.id} />
                <Link
                  href={`/leagues/${data.league.id}/members`}
                  className={cn(
                    buttonVariants({
                      className: "w-fit",
                      variant: "secondary",
                    }),
                  )}
                >
                  <UserPlus data-icon="inline-start" />
                  Invite
                </Link>
                <Link
                  href={`/leagues/${data.league.id}/cast`}
                  className={cn(
                    buttonVariants({ className: "w-fit", variant: "outline" }),
                  )}
                >
                  <Bot data-icon="inline-start" />
                  Cast
                </Link>
                <Link
                  href={`/leagues/${data.league.id}/press`}
                  className={cn(buttonVariants({ className: "w-fit" }))}
                >
                  <Rss data-icon="inline-start" />
                  The Press
                </Link>
                <Link
                  href={`/news?leagueId=${data.league.id}`}
                  className={cn(
                    buttonVariants({ className: "w-fit", variant: "outline" }),
                  )}
                >
                  <Newspaper data-icon="inline-start" />
                  Central news
                </Link>
              </div>
            </div>
            <HeaderStats data={data} />
          </>
        }
        items={sectionItems}
      />
    </main>
  );
}
