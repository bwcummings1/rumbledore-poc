import {
  Activity,
  ArrowRight,
  CalendarDays,
  Clapperboard,
  ListOrdered,
  Newspaper,
  Rss,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  type PublicationStory,
  PublicationStoryCard,
} from "@/components/publication/story-card";
import { LeagueNotificationToggle } from "@/components/pwa/league-notification-toggle";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState as UiEmptyState } from "@/components/ui/empty-state";
import type {
  LeagueHomeData,
  LeagueHomeMatchup,
  LeagueHomeStanding,
  LeagueHomeStoryline,
  LeagueHomeTeam,
} from "@/home/league-home";
import { cn } from "@/lib/utils";
import { LeagueRealtimeRefresh } from "@/realtime/client";

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

function formatGamesBack(value: number): string {
  if (value === 0) {
    return "-";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatWinPercentage(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
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
  icon: typeof ListOrdered;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <Icon className="size-5 text-primary" aria-hidden="true" />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <UiEmptyState
      className="justify-items-start px-3 py-3 text-left"
      title={children}
    />
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-control border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-base font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function StandingsRow({ row }: { row: LeagueHomeStanding }) {
  return (
    <>
      <div
        className={cn(
          "grid min-h-14 grid-cols-[2rem_minmax(0,1fr)_4.25rem_4.25rem] items-center gap-2 border-border border-t px-3 py-2 text-sm sm:grid-cols-[2rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem_3.25rem]",
          row.isClaimedByUser ? "bg-primary/10" : "",
        )}
      >
        <div className="font-mono text-muted-foreground tabular-nums">
          {row.rank}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">
            {row.name}
            {row.isClaimedByUser ? (
              <span className="ml-2 rounded-control border border-primary/40 px-1.5 py-0.5 align-middle text-xs font-semibold text-primary">
                You
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.managerNames.join(", ")}
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          {row.wins}-{row.losses}-{row.ties}
        </div>
        <div className="text-right font-mono tabular-nums">
          {formatPoints(row.pointsFor)}
        </div>
        <div className="hidden text-right font-mono text-muted-foreground tabular-nums sm:block">
          {formatPoints(row.pointsAgainst)}
        </div>
        <div className="hidden text-right font-mono text-muted-foreground tabular-nums sm:block">
          {formatGamesBack(row.gamesBack)}
        </div>
      </div>
      {row.playoffLineAfter ? (
        <div className="border-border border-t px-3 py-1 text-center text-xs font-medium text-highlight">
          Playoff line
        </div>
      ) : null}
    </>
  );
}

function ActivationHookSection({ data }: { data: LeagueHomeData }) {
  const activation = data.activation;
  if (!activation) {
    return null;
  }

  const story = activation.castTeaser.storyline
    ? toPressTeaserStory({
        leagueId: data.league.id,
        storyline: activation.castTeaser.storyline,
      })
    : null;

  return (
    <section className="-mx-4 grid gap-4 border-primary/30 border-y bg-primary/10 px-4 py-4 sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">
            Your team is waiting
          </p>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">
            {activation.team.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rank {activation.team.rank} · {activation.team.wins}-
            {activation.team.losses}-{activation.team.ties} ·{" "}
            {formatPoints(activation.team.pointsFor)} PF
          </p>
        </div>
        <Clapperboard className="size-6 text-primary" aria-hidden="true" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-control border border-primary/20 bg-background/70 px-3 py-2">
          <p className="text-xs text-muted-foreground">Standings</p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums">
            #{activation.team.rank} · {activation.team.wins}-
            {activation.team.losses}-{activation.team.ties}
          </p>
        </div>
        <div className="rounded-control border border-primary/20 bg-background/70 px-3 py-2">
          <p className="text-xs text-muted-foreground">Current matchup</p>
          <p className="mt-1 truncate text-sm font-semibold">
            {activation.currentMatchup
              ? `${activation.currentMatchup.away.name} at ${activation.currentMatchup.home.name}`
              : "No matchup on the board"}
          </p>
        </div>
        <div className="rounded-control border border-primary/20 bg-background/70 px-3 py-2">
          <p className="text-xs text-muted-foreground">All-time</p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums">
            {activation.allTime
              ? `${activation.allTime.wins}-${activation.allTime.losses}-${activation.allTime.ties} · ${formatWinPercentage(
                  activation.allTime.winPercentage,
                )}`
              : "History building"}
          </p>
        </div>
      </div>

      {activation.records.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Record-book hits
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {activation.records.map((record) => (
              <div
                key={record.id}
                className="rounded-control border border-primary/20 bg-background/70 px-3 py-2"
              >
                <p className="truncate text-xs font-semibold">{record.label}</p>
                <p className="mt-1 font-mono text-sm tabular-nums">
                  {formatRecordValue(record.recordType, record.value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <p className="text-sm font-medium">{activation.castTeaser.message}</p>
        {story ? (
          <PublicationStoryCard story={story} variant="rail" />
        ) : (
          <p className="rounded-control border border-dashed border-primary/30 bg-background/60 px-3 py-3 text-sm text-muted-foreground">
            You're in the next one.
          </p>
        )}
      </div>
    </section>
  );
}

function StandingsSection({ data }: { data: LeagueHomeData }) {
  return (
    <section className="rounded-card border border-border bg-card">
      <div className="p-4">
        <SectionTitle
          icon={ListOrdered}
          eyebrow={`${data.league.scoringType} standings`}
          title="Standings"
        />
      </div>
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_4.25rem_4.25rem] gap-2 px-3 pb-2 text-xs font-medium text-muted-foreground sm:grid-cols-[2rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem_3.25rem]">
        <span>#</span>
        <span>Team</span>
        <span className="text-right">W-L-T</span>
        <span className="text-right">PF</span>
        <span className="hidden text-right sm:block">PA</span>
        <span className="hidden text-right sm:block">GB</span>
      </div>
      {data.standings.length > 0 ? (
        data.standings.map((row) => <StandingsRow key={row.id} row={row} />)
      ) : (
        <div className="p-4 pt-0">
          <EmptyState>No standings rows have been ingested yet.</EmptyState>
        </div>
      )}
    </section>
  );
}

function MatchupCard({ matchup }: { matchup: LeagueHomeMatchup }) {
  return (
    <article className="rounded-card border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          Week {matchup.scoringPeriod}
        </p>
        <span className="rounded-control border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {matchupStatusLabel(matchup.status)}
        </span>
      </div>
      {[matchup.away, matchup.home].map((side) => (
        <div
          key={`${matchup.id}-${side.teamId}`}
          className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3 py-1"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{side.name}</p>
            <p className="text-xs text-muted-foreground">{side.abbrev}</p>
          </div>
          <p
            className={
              side.isWinner
                ? "text-right font-mono text-positive tabular-nums"
                : "text-right font-mono tabular-nums"
            }
          >
            {formatPoints(side.score)}
          </p>
        </div>
      ))}
    </article>
  );
}

function ScoresSection({ data }: { data: LeagueHomeData }) {
  const title =
    data.currentScoringPeriod === null
      ? "Current matchups"
      : `Week ${data.currentScoringPeriod} matchups`;

  return (
    <section className="grid gap-3">
      <SectionTitle icon={Activity} title={title} />
      {data.currentMatchups.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.currentMatchups.map((matchup) => (
            <MatchupCard key={matchup.id} matchup={matchup} />
          ))}
        </div>
      ) : (
        <EmptyState>No current matchup rows have been ingested yet.</EmptyState>
      )}
    </section>
  );
}

function TeamCard({ team }: { team: LeagueHomeTeam }) {
  return (
    <article className="rounded-card border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-muted font-mono text-xs font-semibold">
          {team.abbrev.slice(0, 3)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{team.name}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {team.managerNames.join(", ")}
          </p>
        </div>
      </div>
    </article>
  );
}

function TeamsSection({ data }: { data: LeagueHomeData }) {
  return (
    <section className="grid gap-3">
      <SectionTitle
        icon={Users}
        eyebrow={`${data.totals.members} managers`}
        title="Teams"
      />
      {data.teams.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {data.teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      ) : (
        <EmptyState>No teams have been ingested yet.</EmptyState>
      )}
    </section>
  );
}

function RecordsSection({ data }: { data: LeagueHomeData }) {
  const featured = data.records.slice(0, 6);
  return (
    <section className="grid gap-3">
      <SectionTitle icon={Trophy} title="Record book" />
      {featured.length > 0 ? (
        <div className="grid gap-3">
          {featured.map((record) => (
            <article
              key={record.id}
              className="rounded-card border border-border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{record.label}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {record.holderName ?? "Unknown holder"}
                    {record.season ? ` · ${record.season}` : ""}
                    {record.scoringPeriod
                      ? ` · Week ${record.scoringPeriod}`
                      : ""}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                  {formatRecordValue(record.recordType, record.value)}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>
          No finalized matchup records have been calculated yet.
        </EmptyState>
      )}
    </section>
  );
}

function PressTeaserSection({ data }: { data: LeagueHomeData }) {
  return (
    <section
      className="grid gap-3"
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
      {data.storylines.length > 0 ? (
        <div className="grid gap-3">
          {data.storylines.map((storyline) => (
            <PublicationStoryCard
              key={storyline.id}
              story={toPressTeaserStory({
                leagueId: data.league.id,
                storyline,
              })}
              variant="rail"
            />
          ))}
        </div>
      ) : (
        <EmptyState>
          No league posts or activity items have been published yet.
        </EmptyState>
      )}
    </section>
  );
}

export function LeagueHomeView({ data }: { data: LeagueHomeData }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <LeagueRealtimeRefresh leagueId={data.league.id} />
      <header className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">League home</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
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
                buttonVariants({ className: "w-fit", variant: "secondary" }),
              )}
            >
              <UserPlus data-icon="inline-start" />
              Invite
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="Teams" value={data.totals.teams} />
          <StatPill label="Matchups" value={data.totals.matchups} />
          <StatPill label="Period" value={data.currentScoringPeriod ?? "-"} />
          <StatPill label="Role" value={data.userRole.replace("_", " ")} />
        </div>
      </header>

      <ActivationHookSection data={data} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <div className="grid gap-6">
          <StandingsSection data={data} />
          <ScoresSection data={data} />
        </div>
        <aside className="grid content-start gap-6">
          <RecordsSection data={data} />
          <TeamsSection data={data} />
          <section className="grid gap-3">
            <SectionTitle icon={CalendarDays} title="Upcoming" />
            {data.currentMatchups.length > 0 ? (
              <p className="rounded-card border border-border bg-card px-3 py-3 text-sm text-muted-foreground">
                {data.currentMatchups.length} scheduled pairing
                {data.currentMatchups.length === 1 ? "" : "s"} are on the board.
              </p>
            ) : (
              <EmptyState>No upcoming matchups are available.</EmptyState>
            )}
          </section>
          <PressTeaserSection data={data} />
        </aside>
      </div>
    </main>
  );
}
