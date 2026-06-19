import {
  ArrowRight,
  type LucideIcon,
  Newspaper,
  Plug,
  Radio,
  ScrollText,
  Swords,
  Trophy,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  YourLeagueCard,
  YourLeagueMatchup,
  YourLeagueMatchupSide,
  YourLeaguePressHeadline,
  YourLeaguesLandingData,
} from "@/home/your-leagues";
import { cn } from "@/lib/utils";

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

const PROVIDERS: ReadonlyArray<{
  blurb: string;
  href: string;
  label: string;
}> = [
  {
    blurb: "Cookie or session import; full history + live scoring.",
    href: "/onboarding/espn",
    label: "ESPN",
  },
  {
    blurb: "Public username or league ID. No password needed.",
    href: "/onboarding/sleeper",
    label: "Sleeper",
  },
  {
    blurb: "OAuth connect; rosters, matchups, and standings.",
    href: "/onboarding/yahoo",
    label: "Yahoo",
  },
];

const UNLOCKS: ReadonlyArray<{
  desc: string;
  icon: LucideIcon;
  label: string;
}> = [
  {
    desc: "A living home base for your league.",
    icon: Swords,
    label: "League home",
  },
  {
    desc: "AI cast headlines, recaps, and trash talk.",
    icon: ScrollText,
    label: "The Press",
  },
  {
    desc: "Career marks, streaks, and rivalries.",
    icon: Trophy,
    label: "Records",
  },
  {
    desc: "Paper bankroll on real odds.",
    icon: WalletCards,
    label: "Bankroll",
  },
];

function ProviderConnectCard({
  blurb,
  href,
  label,
}: {
  blurb: string;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-label={`Connect ${label}`}
      className="group cell grid content-between gap-3 p-4 transition-[border-color,background-color] hover:border-primary/50 focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="chip-glyph flex size-8 shrink-0 items-center justify-center text-primary">
          <Plug className="size-4" aria-hidden="true" />
        </span>
        <ArrowRight
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </div>
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-2">
          {label}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{blurb}</p>
      </div>
    </Link>
  );
}

function UnlockCell({
  desc,
  icon: Icon,
  label,
}: {
  desc: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="cell grid gap-2 p-3">
      <span className="chip-glyph flex size-7 shrink-0 items-center justify-center text-steel-soft">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-2">
        {label}
      </p>
      <p className="text-xs leading-relaxed text-ink-3">{desc}</p>
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

function ConnectEntry({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel grid gap-3 p-5 sm:p-6">
        <p className="eyebrow text-primary">{eyebrow}</p>
        <h1 className="heading-auspex text-xl leading-tight">{title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-2">{blurb}</p>
        <div className="mt-1">
          <GlobalLinks />
        </div>
      </header>

      <section aria-label="Connect a provider" className="grid gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-ink-4">
          Connect a provider
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {PROVIDERS.map((provider) => (
            <ProviderConnectCard key={provider.label} {...provider} />
          ))}
        </div>
      </section>

      <section aria-label="What you unlock" className="grid gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-ink-4">
          What a league unlocks
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {UNLOCKS.map((unlock) => (
            <UnlockCell key={unlock.label} {...unlock} />
          ))}
        </div>
      </section>
    </main>
  );
}

export function LoggedOutLanding() {
  return (
    <ConnectEntry
      blurb="Connect a league once to unlock its home base, Press headlines, records, AI cast, and paper-betting arena. News and Arena stay open while you get set up."
      eyebrow="Rumbledore"
      title="Your fantasy league becomes the show"
    />
  );
}

function EmptyLeaguesLanding() {
  return (
    <ConnectEntry
      blurb="ESPN, Sleeper, and Yahoo leagues share one lobby. The show starts the moment your first league connects."
      eyebrow="Your Leagues"
      title="Connect a league to open the lobby"
    />
  );
}

function LeagueAvatar({ league }: { league: YourLeagueCard }) {
  if (league.logo) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--void-2)]">
        <span
          aria-hidden="true"
          className="size-full bg-cover bg-center"
          style={{ backgroundImage: `url(${JSON.stringify(league.logo)})` }}
        />
      </span>
    );
  }
  return <Avatar decorative name={league.name} size="sm" />;
}

function ScoreLine({ side }: { side: YourLeagueMatchupSide }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4.75rem] items-center gap-3">
      <p
        className={cn(
          "truncate text-sm",
          side.isUserTeam ? "font-medium text-foreground" : "text-ink-3",
        )}
      >
        {side.name}
      </p>
      <p
        className={cn(
          "metric text-right text-sm",
          side.isUserTeam ? "text-jade" : "text-ink-2",
        )}
      >
        {formatPoints(side.score)}
      </p>
    </div>
  );
}

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink-3">
      {children}
    </p>
  );
}

function MatchupPanel({ matchup }: { matchup: YourLeagueMatchup | null }) {
  if (!matchup) {
    return (
      <section className="cell grid gap-1 p-3">
        <PanelLabel>This week</PanelLabel>
        <p className="text-xs text-ink-3">No matchup rows ingested yet.</p>
      </section>
    );
  }

  return (
    <section className="cell grid gap-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <PanelLabel>
          {matchup.isUserMatchup ? "Your matchup" : "Featured"} · Week{" "}
          {matchup.scoringPeriod}
        </PanelLabel>
        <StatusPill
          showDot={false}
          tone={matchup.status === "in_progress" ? "live" : "neutral"}
        >
          {matchupStatusLabel(matchup.status)}
        </StatusPill>
      </div>
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
      <section className="cell grid gap-1 p-3">
        <PanelLabel>Latest Press</PanelLabel>
        <p className="text-xs text-ink-3">No league headline published yet.</p>
      </section>
    );
  }

  return (
    <section className="cell grid gap-1.5 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.16em] text-primary">
          <Radio className="size-3" aria-hidden="true" />
          Latest Press
        </span>
        <time
          className="metric shrink-0 text-xs text-ink-4"
          dateTime={headline.publishedAt}
        >
          {formatPublishedAt(headline.publishedAt)}
        </time>
      </div>
      <h3 className="line-clamp-2 font-display text-sm font-medium text-foreground">
        {headline.title}
      </h3>
      {headline.summary ? (
        <p className="line-clamp-2 text-xs text-ink-3">{headline.summary}</p>
      ) : null}
    </section>
  );
}

function LeagueCard({ league }: { league: YourLeagueCard }) {
  return (
    <Link
      aria-label={`Open ${league.name}`}
      className="group panel grid min-h-[19rem] content-start gap-4 p-4 transition-[border-color] hover:border-primary/50 focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
      href={league.href}
    >
      <div className="flex items-start gap-3">
        <LeagueAvatar league={league} />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-ink-4">
              {league.providerLabel}
            </span>
            <ArrowRight
              className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </div>
          <h2 className="line-clamp-2 font-display text-lg font-medium text-foreground">
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
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="eyebrow text-primary">Global lobby</p>
          <h1 className="heading-auspex mt-2 text-xl leading-tight">
            Your Leagues
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Scoreboard pressure and Press heat, league by league. Pick up where
            the last opened league left off.
          </p>
        </div>
        <Link
          href="/onboarding/espn"
          className={cn(buttonVariants({ className: "w-fit" }))}
        >
          <Plug data-icon="inline-start" />
          Connect league
        </Link>
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
