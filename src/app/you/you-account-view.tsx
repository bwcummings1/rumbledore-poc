import { ArrowRight, Bell, Bot, Link2, LockKeyhole, User } from "lucide-react";
import Link from "next/link";
import type { PersonalAgentBriefingResult } from "@/ai/personal-agent";
import { InstallAffordance } from "@/components/pwa/install-affordance";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LeagueSwitcherViewItem } from "@/navigation";
import type { FantasyProviderId } from "@/providers";
import { SignOutButton } from "./sign-out-button";

export interface YouProviderConnection {
  readonly connectionFlow:
    | "browser"
    | "extension"
    | "manual"
    | "oauth"
    | "public";
  readonly invalidAt: string | null;
  readonly lastValidatedAt: string;
  readonly provider: FantasyProviderId;
  readonly providerLabel: string;
  readonly status: "connected" | "invalid";
  readonly subjectProviderId: string;
}

export interface YouAccountData {
  readonly connections: YouProviderConnection[];
  readonly leagues: LeagueSwitcherViewItem[];
  readonly personalAgent: PersonalAgentBriefingResult;
  readonly user: {
    readonly displayName: string;
    readonly email: string;
    readonly emailVerified: boolean;
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function flowLabel(flow: YouProviderConnection["connectionFlow"]): string {
  switch (flow) {
    case "browser":
      return "Hosted browser";
    case "extension":
      return "Browser extension";
    case "manual":
      return "Manual";
    case "oauth":
      return "OAuth";
    case "public":
      return "Public ID";
  }
}

function personalAgentLockedCopy(
  reason: PersonalAgentBriefingResult["entitlement"]["reason"],
): string {
  switch (reason) {
    case "EXPIRED":
      return "Individual access expired. Your leagues and records stay available.";
    case "SUSPENDED":
      return "Individual access is suspended. Your leagues and records stay available.";
    case "CAP_EXCEEDED":
      return "The individual coverage limit has been reached.";
    case "TIER_REQUIRED":
      return "Get your personal agent for cross-league briefings about your teams.";
    case "DEV_OVERRIDE":
    case "ENTITLED":
      return "Personal agent access is available.";
  }
}

function PersonalAgentPanel({
  personalAgent,
}: {
  personalAgent: PersonalAgentBriefingResult;
}) {
  if (personalAgent.status === "blocked") {
    return (
      <div className="rounded-card border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">Personal agent</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              Individual tier required
            </h2>
          </div>
          <LockKeyhole className="size-5 text-primary" aria-hidden="true" />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {personalAgentLockedCopy(personalAgent.entitlement.reason)}
        </p>
      </div>
    );
  }

  const { briefing } = personalAgent;
  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">Personal agent</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            Watching {briefing.coveredLeagueCount} of{" "}
            {briefing.totalLeagueCount} leagues
          </h2>
        </div>
        <Bot className="size-5 text-primary" aria-hidden="true" />
      </div>
      {briefing.capped ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Showing the first {briefing.leagueLimit} leagues by recency.
        </p>
      ) : null}
      <div className="mt-4 grid gap-3">
        {briefing.leagues.length > 0 ? (
          briefing.leagues.map((league) => (
            <Link
              className="grid gap-1 border-border border-t pt-3 first:border-t-0 first:pt-0 transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
              href={league.href}
              key={league.leagueId}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold">{league.name}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {league.providerLabel}
                </span>
              </div>
              {league.matchup ? (
                <p className="text-sm text-muted-foreground">
                  Week {league.matchup.scoringPeriod}: {league.matchup.label}
                  {league.matchup.userScore !== null &&
                  league.matchup.opponentScore !== null
                    ? ` (${formatPoints(league.matchup.userScore)}-${formatPoints(league.matchup.opponentScore)})`
                    : ""}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No current matchup has been ingested.
                </p>
              )}
              {league.latestPressTitle ? (
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  Press: {league.latestPressTitle}
                </p>
              ) : null}
            </Link>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Connect a league to give the personal agent something to follow.
          </p>
        )}
      </div>
    </div>
  );
}

export function YouAccountView({ data }: { data: YouAccountData }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <User className="size-5" aria-hidden="true" />
            <p className="text-sm font-medium">You</p>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {data.user.displayName}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.user.email} ·{" "}
              {data.user.emailVerified ? "verified" : "not verified"}
            </p>
          </div>
        </div>
        <SignOutButton />
      </header>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-card border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">
                Connected providers
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">
                {data.connections.length}
              </h2>
            </div>
            <Link2 className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-4 grid gap-2">
            {data.connections.length > 0 ? (
              data.connections.map((connection) => (
                <div
                  className="rounded-control border border-border bg-muted/25 px-3 py-2"
                  key={`${connection.provider}-${connection.subjectProviderId}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{connection.providerLabel}</p>
                    <span
                      className={cn(
                        "rounded-sm border px-2 py-0.5 text-xs",
                        connection.status === "connected"
                          ? "border-positive/40 text-positive"
                          : "border-destructive/40 text-destructive",
                      )}
                    >
                      {connection.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {flowLabel(connection.connectionFlow)} · validated{" "}
                    {formatDate(connection.lastValidatedAt)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No provider connection has been saved for this account.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/onboarding/espn"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              ESPN
            </Link>
            <Link
              href="/onboarding/sleeper"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              Sleeper
            </Link>
            <Link
              href="/onboarding/yahoo"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              Yahoo
            </Link>
          </div>
        </div>

        <PersonalAgentPanel personalAgent={data.personalAgent} />

        <div className="rounded-card border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">
                Notification prefs
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">
                League-scoped
              </h2>
            </div>
            <Bell className="size-5 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Push subscriptions are stored per league. Open a league home to
            toggle alerts for that league without exposing cross-league data.
          </p>
        </div>

        <InstallAffordance />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Installed leagues
        </h2>
        {data.leagues.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.leagues.map((league) => (
              <Link
                aria-label={`Open ${league.name}`}
                className="rounded-card border border-border bg-card p-4 transition-colors hover:bg-elevated focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                href={`/leagues/${league.leagueId}`}
                key={league.leagueId}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{league.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {league.providerLabel} · {league.role.replace("_", " ")}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-primary" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-border bg-muted/25 p-4">
            <h3 className="text-base font-semibold tracking-tight">
              No leagues connected
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect a provider to discover leagues and seed the show.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
