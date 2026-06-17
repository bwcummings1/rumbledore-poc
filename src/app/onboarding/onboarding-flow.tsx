"use client";

import {
  CheckCircle2,
  DatabaseZap,
  House,
  Link2,
  ListChecks,
  Plug,
  RefreshCw,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { getProviderBadgeLabel } from "@/navigation";
import type { ProviderReconnectAction } from "@/onboarding/reconnect";
import type { FantasyProviderId } from "@/providers";
import {
  type ImportLeaguemateSummary,
  LeaguemateDetectionCallout,
} from "./leaguemate-detection-callout";
import { ReconnectActionLink } from "./reconnect-cta";

interface DiscoveredLeagueCandidate {
  readonly connectionInvalidAt?: string;
  readonly connectionState?: "connected" | "invalid";
  readonly credentialId?: string;
  readonly imported: boolean;
  readonly isRecommendedImport: boolean;
  readonly lastDiscoveredAt: string;
  readonly leagueId?: string;
  readonly name: string;
  readonly provider: FantasyProviderId;
  readonly providerId: string;
  readonly reconnect?: ProviderReconnectAction;
  readonly season: number;
  readonly size?: number;
  readonly sport: "ffl" | "unknown";
  readonly teamName?: string;
}

interface ImportResult {
  readonly leagueId: string;
  readonly leaguemateInvites?: ImportLeaguemateSummary;
  readonly sync: {
    readonly matchups: { readonly total: number };
    readonly members: { readonly total: number };
    readonly teams: { readonly total: number };
  };
}

interface ProviderCard {
  readonly body: string;
  readonly href: string;
  readonly label: string;
  readonly provider: FantasyProviderId;
}

const providerCards = [
  {
    body: "Hosted ESPN login, with manual cookie fallback only when the hosted flow is unavailable.",
    href: "/onboarding/espn",
    label: "Hosted browser",
    provider: "espn",
  },
  {
    body: "Public username or user ID lookup for leagues that do not need private credentials.",
    href: "/onboarding/sleeper",
    label: "Public account",
    provider: "sleeper",
  },
  {
    body: "OAuth authorization, fixture-backed in local mock mode until real Yahoo keys exist.",
    href: "/onboarding/yahoo",
    label: "OAuth",
    provider: "yahoo",
  },
] satisfies readonly ProviderCard[];

function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(globalThis.navigator?.onLine ?? true);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    globalThis.addEventListener("online", handleOnline);
    globalThis.addEventListener("offline", handleOffline);
    return () => {
      globalThis.removeEventListener("online", handleOnline);
      globalThis.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

function providerHref(provider: FantasyProviderId, returnTo?: string | null) {
  const href = `/onboarding/${provider}`;
  if (!returnTo) {
    return href;
  }
  return `${href}?returnTo=${encodeURIComponent(returnTo)}`;
}

function OnboardingProviderPicker({
  activeProvider,
  connectedProviders,
  returnTo,
}: {
  readonly activeProvider: FantasyProviderId;
  readonly connectedProviders: readonly FantasyProviderId[];
  readonly returnTo?: string | null;
}) {
  const connected = new Set(connectedProviders);

  return (
    <section aria-labelledby="provider-picker-heading" className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-primary">Connect once</p>
          <h2
            className="mt-1 font-display text-base font-medium text-foreground"
            id="provider-picker-heading"
          >
            Provider options stay open
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Add ESPN, Sleeper, or Yahoo accounts into one inventory. A second
            provider appends leagues instead of replacing the first.
          </p>
        </div>
        <span
          aria-hidden="true"
          className="orb orb-md"
          data-persona="commissioner"
          data-state="idle"
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {providerCards.map((card) => {
          const isActive = card.provider === activeProvider;
          const isConnected = connected.has(card.provider);
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "bezel grid min-h-36 gap-3 rounded-card border border-border bg-[var(--panel-2)] p-3 text-left shadow-[var(--bevel)] outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[var(--hair-3)] focus-visible:border-primary focus-visible:shadow-[var(--focus-ring-shadow),var(--bevel)] motion-reduce:hover:translate-y-0",
                isActive &&
                  "border-primary/60 bg-primary/10 shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]",
              )}
              href={providerHref(card.provider, returnTo)}
              key={card.provider}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="font-display text-sm font-medium text-foreground">
                    {getProviderBadgeLabel(card.provider)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {card.label}
                  </span>
                </span>
                <StatusPill
                  tone={isConnected ? "success" : isActive ? "live" : "neutral"}
                >
                  {isConnected ? "connected" : isActive ? "current" : "add"}
                </StatusPill>
              </span>
              <span className="text-sm leading-6 text-muted-foreground">
                {card.body}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function OnboardingStatusBanner({
  isOnline,
  isRefreshing,
}: {
  readonly isOnline: boolean;
  readonly isRefreshing: boolean;
}) {
  if (!isRefreshing && isOnline) {
    return null;
  }

  return (
    <output
      aria-live="polite"
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-card border px-3 py-3 text-sm shadow-[var(--bevel)]",
        isOnline
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-warning/50 bg-warning/10 text-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("orb orb-sm", isRefreshing ? "think" : "offline")}
        data-state={isRefreshing ? "think" : "offline"}
      />
      <div className="min-w-0">
        <p className="font-display text-sm font-medium">
          {isOnline ? "Refreshing league inventory" : "Offline"}
        </p>
        <p className="mt-1 text-muted-foreground">
          {isOnline
            ? "Discovery rows are updating from connected providers."
            : "Cached discoveries remain visible; imports and provider connects resume when the network returns."}
        </p>
      </div>
    </output>
  );
}

function LeagueInventorySkeleton() {
  return (
    <output
      className="grid gap-3"
      aria-label="Discovering leagues"
      aria-live="polite"
    >
      <Skeleton className="h-24" variant="card" />
      <Skeleton className="h-24" variant="card" />
      <Skeleton className="h-24" variant="card" />
    </output>
  );
}

function OnboardingLeagueInventory({
  imports,
  isBusy,
  isOnline,
  leagues,
  loading,
  onImportLeague,
  onImportSelected,
  onRefresh,
  onToggleLeague,
  remainingImportCount,
  selectedKeys,
  selectedLeagues,
}: {
  readonly imports: Record<string, ImportResult>;
  readonly isBusy: boolean;
  readonly isOnline: boolean;
  readonly leagues: readonly DiscoveredLeagueCandidate[];
  readonly loading: boolean;
  readonly onImportLeague: (league: DiscoveredLeagueCandidate) => void;
  readonly onImportSelected: () => void;
  readonly onRefresh: () => void;
  readonly onToggleLeague: (
    league: DiscoveredLeagueCandidate,
    checked: boolean,
  ) => void;
  readonly remainingImportCount: number;
  readonly selectedKeys: readonly string[];
  readonly selectedLeagues: readonly DiscoveredLeagueCandidate[];
}) {
  const importedCount = leagues.filter((league) => league.imported).length;
  const providerCount = new Set(leagues.map((league) => league.provider)).size;
  const selectedCount = selectedLeagues.length;

  return (
    <section className="grid gap-3" aria-labelledby="league-inventory-heading">
      <div className="panel flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="eyebrow text-primary">Discovery</p>
          <h2
            className="mt-1 font-display text-base font-medium text-foreground"
            id="league-inventory-heading"
          >
            Your leagues
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {leagues.length > 0
              ? `${leagues.length} league${
                  leagues.length === 1 ? "" : "s"
                } found across ${providerCount || 1} connected provider${
                  providerCount === 1 ? "" : "s"
                }.`
              : "Connect a provider to populate the shared import list."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {leagues.length > 0 ? (
            <StatusPill tone={importedCount > 0 ? "success" : "neutral"}>
              {importedCount} imported
            </StatusPill>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={isBusy || !isOnline}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Button>
        </div>
      </div>

      <OnboardingStatusBanner isOnline={isOnline} isRefreshing={loading} />

      {leagues.length > 0 ? (
        <div className="cell flex flex-wrap items-center justify-between gap-3 px-3 py-3">
          <p className="text-sm text-muted-foreground">
            <span className="metric text-foreground">{selectedCount}</span>{" "}
            selected ·{" "}
            <span className="metric text-foreground">
              {remainingImportCount}
            </span>{" "}
            not imported
          </p>
          <Button
            type="button"
            onClick={onImportSelected}
            disabled={isBusy || !isOnline || selectedCount === 0}
          >
            <ListChecks data-icon="inline-start" />
            Import selected
          </Button>
        </div>
      ) : null}

      {loading && leagues.length === 0 ? <LeagueInventorySkeleton /> : null}

      {!loading && leagues.length === 0 ? (
        <EmptyState
          icon={<DatabaseZap className="size-4" />}
          title="No fantasy football leagues found yet."
        >
          Try another provider, refresh after connecting, or use the ESPN manual
          fallback if the hosted session is unavailable.
        </EmptyState>
      ) : null}

      {leagues.map((league) => (
        <LeagueInventoryRow
          importResult={imports[leagueKey(league)]}
          isBusy={isBusy}
          isOnline={isOnline}
          key={leagueKey(league)}
          league={league}
          onImportLeague={onImportLeague}
          onToggleLeague={onToggleLeague}
          selected={selectedKeys.includes(leagueKey(league))}
        />
      ))}
    </section>
  );
}

function LeagueInventoryRow({
  importResult,
  isBusy,
  isOnline,
  league,
  onImportLeague,
  onToggleLeague,
  selected,
}: {
  readonly importResult?: ImportResult;
  readonly isBusy: boolean;
  readonly isOnline: boolean;
  readonly league: DiscoveredLeagueCandidate;
  readonly onImportLeague: (league: DiscoveredLeagueCandidate) => void;
  readonly onToggleLeague: (
    league: DiscoveredLeagueCandidate,
    checked: boolean,
  ) => void;
  readonly selected: boolean;
}) {
  const blockedByConnection = Boolean(league.reconnect);
  const canImport = canImportLeague(league);
  const checked = selected && canImport;
  const providerLabel = getProviderBadgeLabel(league.provider);
  const status = league.imported
    ? "Imported"
    : blockedByConnection && league.reconnect
      ? league.reconnect.message
      : importResult
        ? `${importResult.sync.teams.total} teams · ${importResult.sync.members.total} members · ${importResult.sync.matchups.total} matchups`
        : league.isRecommendedImport
          ? "Selected by default"
          : `${providerLabel} league ${league.providerId}`;

  return (
    <article
      className={cn(
        "panel grid gap-3 p-4",
        checked &&
          "border-primary/50 shadow-[0_0_18px_var(--glow-lilac),var(--bevel)]",
      )}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            disabled={isBusy || !isOnline || !canImport}
            onChange={(event) => onToggleLeague(league, event.target.checked)}
            className="mt-1 size-5 shrink-0 accent-primary"
          />
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate font-display text-sm font-medium text-foreground">
                {league.name}
              </span>
              <Tag>{providerLabel}</Tag>
              {league.imported ? (
                <StatusPill tone="success">imported</StatusPill>
              ) : league.reconnect ? (
                <StatusPill tone="danger">reconnect</StatusPill>
              ) : league.isRecommendedImport ? (
                <StatusPill tone="live">recommended</StatusPill>
              ) : null}
            </span>
            <span className="mt-2 block text-sm text-muted-foreground">
              {league.season} · {league.size ?? "unknown"} teams
              {league.teamName ? ` · ${league.teamName}` : ""}
            </span>
          </span>
        </label>
        {league.imported ? (
          <CheckCircle2
            className="size-5 text-positive sm:mt-1"
            aria-label="Imported"
          />
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-[var(--hair)] pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <p className="text-sm text-muted-foreground">{status}</p>
        <div className="flex flex-wrap gap-2">
          {league.imported && league.leagueId ? (
            <Link
              href={`/leagues/${league.leagueId}`}
              className={cn(
                buttonVariants({ size: "sm", variant: "secondary" }),
              )}
            >
              <House data-icon="inline-start" />
              Open home
            </Link>
          ) : null}
          {blockedByConnection && league.reconnect ? (
            <ReconnectActionLink action={league.reconnect} />
          ) : !league.imported ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onImportLeague(league)}
              disabled={isBusy || !isOnline || !canImport}
            >
              Import
            </Button>
          ) : null}
        </div>
      </div>

      <LeaguemateDetectionCallout
        leagueId={importResult?.leagueId ?? league.leagueId ?? ""}
        summary={importResult?.leaguemateInvites}
      />
    </article>
  );
}

function canImportLeague(
  league: Pick<DiscoveredLeagueCandidate, "imported" | "reconnect">,
) {
  return !league.imported && !league.reconnect;
}

function leagueKey(
  league: Pick<DiscoveredLeagueCandidate, "provider" | "providerId" | "season">,
) {
  return `${league.provider}:${league.providerId}:${league.season}`;
}

function OnboardingFlowCallout() {
  const items = [
    ["Connect", "Authorize a provider account."],
    ["Discover", "Load every league from connected providers."],
    ["Import", "Bring teams, members, matchups, and history in."],
    ["Invite", "Send share links or SMS from the roster surface."],
    ["Claim", "Leaguemates map themselves to their real teams."],
  ] as const;

  return (
    <section className="cell grid gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <ShieldAlert aria-hidden="true" className="size-4 text-primary" />
        <p className="font-display text-sm font-medium text-foreground">
          Onboarding path
        </p>
      </div>
      <ol className="grid gap-2 text-sm text-muted-foreground md:grid-cols-5">
        {items.map(([label, description]) => (
          <li className="grid gap-1" key={label}>
            <span className="metric text-xs text-primary">{label}</span>
            <span>{description}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InvitePathChip() {
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-control border border-primary/40 bg-primary/10 px-2.5 text-xs font-semibold text-primary shadow-[var(--bevel)]">
      <Link2 aria-hidden="true" className="size-3.5" />
      Share link first
    </span>
  );
}

function MobileReadyChip() {
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-control border border-warning/40 bg-warning/10 px-2.5 text-xs font-semibold text-warning shadow-[var(--bevel)]">
      <Smartphone aria-hidden="true" className="size-3.5" />
      Mobile ready
    </span>
  );
}

function ProviderConnectPanelShell({
  children,
  connectedProviders,
  provider,
  returnTo,
}: {
  readonly children: ReactNode;
  readonly connectedProviders: readonly FantasyProviderId[];
  readonly provider: FantasyProviderId;
  readonly returnTo?: string | null;
}) {
  return (
    <div className="grid gap-5">
      <OnboardingProviderPicker
        activeProvider={provider}
        connectedProviders={connectedProviders}
        returnTo={returnTo}
      />
      <OnboardingFlowCallout />
      <div className="flex flex-wrap gap-2">
        <InvitePathChip />
        <MobileReadyChip />
        <span className="inline-flex min-h-8 items-center gap-2 rounded-control border border-input bg-[var(--panel)] px-2.5 text-xs font-semibold text-muted-foreground shadow-[var(--bevel)]">
          <Plug aria-hidden="true" className="size-3.5" />
          {getProviderBadgeLabel(provider)}
        </span>
      </div>
      {children}
    </div>
  );
}

export {
  canImportLeague,
  leagueKey,
  OnboardingLeagueInventory,
  OnboardingProviderPicker,
  ProviderConnectPanelShell,
  useOnlineStatus,
};
export type { DiscoveredLeagueCandidate, ImportResult };
