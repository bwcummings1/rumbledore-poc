import { ArrowRight, Newspaper, Plug, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type {
  YourLeagueCard,
  YourLeagueMatchup,
  YourLeagueMatchupSide,
  YourLeaguePressHeadline,
  YourLeaguesLandingData,
} from "@/home/your-leagues";
import { cn } from "@/lib/utils";
import { getLeagueAvatarFallback } from "@/navigation/league-switcher-model";

function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function matchupStatusLabel(status: YourLeagueMatchup["status"]): string {
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

function ConnectLeagueLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/onboarding/espn"
        className={cn(buttonVariants({ className: "w-fit" }))}
      >
        <Plug data-icon="inline-start" />
        Connect ESPN
      </Link>
      <Link
        href="/onboarding/sleeper"
        className={cn(
          buttonVariants({ className: "w-fit", variant: "secondary" }),
        )}
      >
        <Plug data-icon="inline-start" />
        Connect Sleeper
      </Link>
      <Link
        href="/onboarding/yahoo"
        className={cn(
          buttonVariants({ className: "w-fit", variant: "secondary" }),
        )}
      >
        <Plug data-icon="inline-start" />
        Connect Yahoo
      </Link>
    </div>
  );
}

function GlobalLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/news"
        className={cn(
          buttonVariants({ className: "w-fit", variant: "outline" }),
        )}
      >
        <Newspaper data-icon="inline-start" />
        News
      </Link>
      <Link
        href="/arena"
        className={cn(
          buttonVariants({ className: "w-fit", variant: "outline" }),
        )}
      >
        <Trophy data-icon="inline-start" />
        Arena
      </Link>
    </div>
  );
}

export function LoggedOutLanding() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center gap-8 px-4 py-8 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <section className="max-w-2xl">
        <p className="text-sm font-medium text-primary">Rumbledore</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Your fantasy league becomes the show.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Connect a league once to unlock its home base, Press headlines,
          records, AI cast, and paper-betting arena. News and Arena stay open
          while you get set up.
        </p>
      </section>
      <div className="grid gap-3">
        <ConnectLeagueLinks />
        <GlobalLinks />
      </div>
    </main>
  );
}

function EmptyLeaguesLanding() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center gap-8 px-4 py-8 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <section className="max-w-2xl">
        <p className="text-sm font-medium text-primary">Your Leagues</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Connect a league to open the lobby.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          ESPN, Sleeper, and Yahoo leagues share one lobby. The show starts
          after the first league connects.
        </p>
      </section>
      <div className="grid gap-3">
        <ConnectLeagueLinks />
        <GlobalLinks />
      </div>
    </main>
  );
}

function ProviderBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-sm border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
      {label}
    </span>
  );
}

function LeagueAvatar({ league }: { league: YourLeagueCard }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-elevated text-xs font-semibold text-muted-foreground">
      {league.logo ? (
        <span
          aria-hidden="true"
          className="size-full bg-cover bg-center"
          style={{ backgroundImage: `url(${JSON.stringify(league.logo)})` }}
        />
      ) : (
        getLeagueAvatarFallback(league.name)
      )}
    </span>
  );
}

function ScoreLine({ side }: { side: YourLeagueMatchupSide }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4.75rem] items-center gap-3">
      <p
        className={cn(
          "truncate text-sm",
          side.isUserTeam
            ? "font-semibold text-foreground"
            : "text-muted-foreground",
        )}
      >
        {side.name}
      </p>
      <p
        className={cn(
          "text-right font-mono text-sm tabular-nums",
          side.isUserTeam && "font-semibold text-positive",
        )}
      >
        {formatPoints(side.score)}
      </p>
    </div>
  );
}

function MatchupPanel({ matchup }: { matchup: YourLeagueMatchup | null }) {
  if (!matchup) {
    return (
      <section className="rounded-control border border-dashed border-border bg-muted/25 px-3 py-3">
        <p className="text-xs font-medium text-muted-foreground">This week</p>
        <p className="mt-1 text-sm text-muted-foreground">
          No matchup rows have been ingested yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-control border border-border bg-background/45 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          {matchup.isUserMatchup ? "Your matchup" : "Featured matchup"} · Week{" "}
          {matchup.scoringPeriod}
        </p>
        <span
          className={cn(
            "rounded-sm border border-border px-1.5 py-0.5 text-xs leading-none text-muted-foreground",
            matchup.status === "in_progress" &&
              "border-primary/40 text-primary",
          )}
        >
          {matchupStatusLabel(matchup.status)}
        </span>
      </div>
      {matchup.isUserMatchup ? (
        <h3 className="mb-2 truncate text-sm font-semibold">
          {matchup.userTeamName} vs {matchup.opponentTeamName}
        </h3>
      ) : (
        <h3 className="mb-2 truncate text-sm font-semibold">
          {matchup.away.name} at {matchup.home.name}
        </h3>
      )}
      <div className="grid gap-1.5">
        <ScoreLine side={matchup.away} />
        <ScoreLine side={matchup.home} />
      </div>
    </section>
  );
}

function PressHeadline({
  headline,
}: {
  headline: YourLeaguePressHeadline | null;
}) {
  if (!headline) {
    return (
      <section className="rounded-control border border-dashed border-border bg-muted/25 px-3 py-3">
        <p className="text-xs font-medium text-muted-foreground">
          Latest Press
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          No league headline has been published yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-control border border-border bg-background/45 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-primary">Latest Press</p>
        <time
          className="shrink-0 text-xs text-muted-foreground"
          dateTime={headline.publishedAt}
        >
          {formatPublishedAt(headline.publishedAt)}
        </time>
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold">{headline.title}</h3>
      {headline.summary ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {headline.summary}
        </p>
      ) : null}
    </section>
  );
}

function LeagueCard({ league }: { league: YourLeagueCard }) {
  return (
    <Link
      aria-label={`Open ${league.name}`}
      className="group grid min-h-[20rem] gap-4 rounded-card border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-elevated focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
      href={league.href}
    >
      <div className="flex items-start gap-3">
        <LeagueAvatar league={league} />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <ProviderBadge label={league.providerLabel} />
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </div>
          <h2 className="line-clamp-2 text-lg font-semibold tracking-tight">
            {league.name}
          </h2>
        </div>
      </div>
      <MatchupPanel matchup={league.matchup} />
      <PressHeadline headline={league.latestPress} />
    </Link>
  );
}

export function YourLeaguesLandingView({
  data,
}: {
  data: YourLeaguesLandingData;
}) {
  if (data.leagues.length === 0) {
    return <EmptyLeaguesLanding />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="grid gap-4">
        <div className="flex items-center gap-2 text-primary">
          <Swords className="size-5" aria-hidden="true" />
          <p className="text-sm font-medium">Global lobby</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Your Leagues
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Scoreboard pressure and Press heat, league by league. Pick up
              where the last opened league left off.
            </p>
          </div>
          <ConnectLeagueLinks />
        </div>
      </header>

      <section
        aria-label="Your leagues"
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        {data.leagues.map((league) => (
          <LeagueCard key={league.leagueId} league={league} />
        ))}
      </section>
    </main>
  );
}
