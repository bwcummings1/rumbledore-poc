import { ArrowRight, Bell, Bot, Link2, User } from "lucide-react";
import Link from "next/link";
import type { PersonalAgentBriefingResult } from "@/ai/personal-agent";
import { ReconnectActionLink } from "@/app/onboarding/reconnect-cta";
import { InstallAffordance } from "@/components/pwa/install-affordance";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { KVList } from "@/components/ui/kv";
import {
  LockedFeatureCard,
  UpgradeSurface,
} from "@/components/ui/locked-feature-card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type { LeagueSwitcherViewItem } from "@/navigation";
import { reconnectActionForProvider } from "@/onboarding/reconnect";
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

function personalAgentActionLabel(
  reason: PersonalAgentBriefingResult["entitlement"]["reason"],
): string {
  switch (reason) {
    case "EXPIRED":
    case "SUSPENDED":
      return "Review access";
    case "CAP_EXCEEDED":
      return "Review limits";
    case "TIER_REQUIRED":
      return "Get personal agent";
    case "DEV_OVERRIDE":
    case "ENTITLED":
      return "Personal agent";
  }
}

function PersonalAgentLockedPreview() {
  return (
    <div className="grid h-full gap-3 p-4">
      <div className="cell grid gap-2 p-3">
        <p className="eyebrow text-primary">your week</p>
        <div className="h-3 w-3/4 rounded-full bg-primary/40" />
        <div className="h-3 w-1/2 rounded-full bg-warning/40" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="cell h-20 bg-primary/10" />
        <div className="cell h-20 bg-warning/10" />
      </div>
    </div>
  );
}

function ProviderConnectionCard({
  connection,
}: {
  connection: YouProviderConnection;
}) {
  const reconnect =
    connection.status === "invalid"
      ? reconnectActionForProvider(connection.provider)
      : null;

  return (
    <article className="cell grid gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-medium">
            {connection.providerLabel}
          </h3>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {connection.subjectProviderId}
          </p>
        </div>
        <StatusPill
          tone={connection.status === "connected" ? "success" : "danger"}
        >
          {connection.status === "connected" ? "Connected" : "Reconnect"}
        </StatusPill>
      </div>
      <KVList
        items={[
          { label: "Flow", value: flowLabel(connection.connectionFlow) },
          { label: "Validated", value: formatDate(connection.lastValidatedAt) },
          ...(connection.invalidAt
            ? [
                {
                  label: "Invalidated",
                  value: formatDate(connection.invalidAt),
                },
              ]
            : []),
        ]}
      />
      {reconnect ? (
        <div className="grid gap-2 border-t border-[var(--hair)] pt-3">
          <p className="text-sm text-muted-foreground">{reconnect.message}</p>
          <ReconnectActionLink action={reconnect} />
        </div>
      ) : null}
    </article>
  );
}

function PersonalAgentPanel({
  personalAgent,
}: {
  personalAgent: PersonalAgentBriefingResult;
}) {
  if (personalAgent.status === "blocked") {
    const reason = personalAgent.entitlement.reason;
    return (
      <LockedFeatureCard
        action={
          <Link
            className={cn(buttonVariants({ variant: "amber" }))}
            href="#upgrade-options"
          >
            {personalAgentActionLabel(reason)}
            <ArrowRight data-icon="inline-end" />
          </Link>
        }
        feature="personal-agent"
        preview={<PersonalAgentLockedPreview />}
        previewLabel="A muted preview of a cross-league personal briefing is shown behind the locked message."
        reasonCode={reason === "DEV_OVERRIDE" ? "ENTITLED" : reason}
      />
    );
  }

  const { briefing } = personalAgent;
  return (
    <div className="panel grid gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-primary">Personal agent</p>
          <h2 className="mt-1 heading-auspex text-lg">
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
      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="Covered"
          tone="lilac"
          value={`${briefing.coveredLeagueCount}`}
        />
        <StatTile label="Total" value={`${briefing.totalLeagueCount}`} />
      </div>
      <div className="grid gap-3">
        {briefing.leagues.length > 0 ? (
          briefing.leagues.map((league) => (
            <Link
              className="cell grid gap-2 p-3 transition-colors hover:border-[var(--hair-3)] hover:bg-elevated/60 focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
              href={league.href}
              key={league.leagueId}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold">{league.name}</p>
                <StatusPill showDot={false} tone="neutral">
                  {league.providerLabel}
                </StatusPill>
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
          <EmptyState
            action={
              <Link
                className={cn(buttonVariants({ variant: "outline" }))}
                href="/onboarding/espn"
              >
                Connect a league
              </Link>
            }
            title="No covered leagues"
          />
        )}
      </div>
    </div>
  );
}

export function YouAccountView({ data }: { data: YouAccountData }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-5 pb-[calc(--spacing(6)+env(safe-area-inset-bottom))] sm:px-6">
      <header className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-primary">
            <User className="size-5" aria-hidden="true" />
            <p className="eyebrow">Account console</p>
          </div>
          <div className="max-w-2xl">
            <h1 className="heading-auspex text-xl leading-tight">
              {data.user.displayName}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="break-all text-sm text-muted-foreground">
                {data.user.email}
              </p>
              <StatusPill
                tone={data.user.emailVerified ? "success" : "warning"}
              >
                {data.user.emailVerified ? "Verified" : "Unverified"}
              </StatusPill>
            </div>
          </div>
        </div>
        <SignOutButton />
      </header>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="panel grid gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-primary">Connected providers</p>
              <h2 className="mt-1 heading-auspex text-lg">
                {data.connections.length}
              </h2>
            </div>
            <Link2 className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div className="grid gap-3">
            {data.connections.length > 0 ? (
              data.connections.map((connection) => (
                <ProviderConnectionCard
                  connection={connection}
                  key={`${connection.provider}-${connection.subjectProviderId}`}
                />
              ))
            ) : (
              <EmptyState title="No provider connections">
                Connect a provider to discover leagues.
              </EmptyState>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
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

        <div className="panel grid gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-primary">Notification prefs</p>
              <h2 className="mt-1 heading-auspex text-lg">
                Digest first, push when installed
              </h2>
            </div>
            <Bell className="size-5 text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">
            Weekly digests and commissioner webhooks are the baseline arrival
            path. Web push is an installed-app enhancement; on iOS, Safari only
            delivers it after Add to Home Screen.
          </p>
          <KVList
            items={[
              { label: "Content", value: "Digest" },
              { label: "Bets, lore, arena", value: "Push" },
              { label: "Mute option", value: "None per family" },
            ]}
          />
        </div>

        <InstallAffordance />
      </section>

      <section className="grid gap-3">
        <h2 className="heading-auspex text-lg">Installed leagues</h2>
        {data.leagues.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.leagues.map((league) => (
              <Link
                aria-label={`Open ${league.name}`}
                className="cell grid gap-3 p-4 transition-colors hover:border-[var(--hair-3)] hover:bg-elevated/60 focus-visible:shadow-[var(--focus-ring-shadow)] focus-visible:outline-none"
                href={`/leagues/${league.leagueId}`}
                key={league.leagueId}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display font-medium">
                      {league.name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusPill showDot={false} tone="neutral">
                        {league.providerLabel}
                      </StatusPill>
                      <StatusPill showDot={false} tone="info">
                        {league.role.replace("_", " ")}
                      </StatusPill>
                    </div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-primary" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <Link
                className={cn(buttonVariants({ variant: "outline" }))}
                href="/onboarding/espn"
              >
                Connect ESPN
              </Link>
            }
            title="No leagues connected"
          >
            Connect a provider to discover leagues.
          </EmptyState>
        )}
      </section>

      <UpgradeSurface id="upgrade-options">
        Pricing and checkout are not wired here; this surface explains what the
        server-side entitlement gates unlock when an admin grant or future
        purchase flow flips access on.
      </UpgradeSurface>
    </main>
  );
}
