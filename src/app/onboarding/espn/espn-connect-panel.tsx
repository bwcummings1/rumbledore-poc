"use client";

import {
  CheckCircle2,
  ExternalLink,
  House,
  KeyRound,
  ListChecks,
  Plug,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProviderBadgeLabel } from "@/navigation";
import type { ProviderReconnectAction } from "@/onboarding/reconnect";
import type { FantasyProviderId } from "@/providers";
import {
  getJson,
  type OnboardingPanelError,
  onboardingPanelError,
  postJson,
} from "../client-http";
import { OnboardingErrorBanner, ReconnectActionLink } from "../reconnect-cta";

interface DiscoveredLeague {
  provider: FantasyProviderId;
  providerId: string;
  season: number;
  sport: "ffl" | "unknown";
  name: string;
  teamName?: string;
  size?: number;
}

interface DiscoveredLeagueCandidate extends DiscoveredLeague {
  credentialId?: string;
  connectionInvalidAt?: string;
  connectionState?: "connected" | "invalid";
  imported: boolean;
  isRecommendedImport: boolean;
  lastDiscoveredAt: string;
  leagueId?: string;
  reconnect?: ProviderReconnectAction;
}

interface ConnectResult {
  credentialId: string;
  discoveredLeagues: DiscoveredLeague[];
}

interface BrowserStartResult {
  sessionId: string;
  liveViewUrl: string;
  expiresAt: string;
}

interface ImportResult {
  leagueId: string;
  sync: {
    teams: { total: number };
    members: { total: number };
    matchups: { total: number };
  };
}

const DISCOVERED_LEAGUES_URL = "/api/onboarding/discovered";

function leagueKey(
  league: Pick<DiscoveredLeague, "provider" | "providerId" | "season">,
) {
  return `${league.provider}:${league.providerId}:${league.season}`;
}

function canImportLeague(
  league: Pick<DiscoveredLeagueCandidate, "imported" | "reconnect">,
) {
  return !league.imported && !league.reconnect;
}

function recommendedKeys(leagues: readonly DiscoveredLeagueCandidate[]) {
  return leagues
    .filter((league) => league.isRecommendedImport && canImportLeague(league))
    .map(leagueKey);
}

function fallbackCandidates(
  discoveredLeagues: readonly DiscoveredLeague[],
): DiscoveredLeagueCandidate[] {
  const latestFflSeason = discoveredLeagues.reduce<number | null>(
    (latest, league) => {
      if (league.sport !== "ffl") {
        return latest;
      }
      return latest === null ? league.season : Math.max(latest, league.season);
    },
    null,
  );

  const discoveredAt = new Date().toISOString();
  return discoveredLeagues.map((league) => ({
    ...league,
    imported: false,
    isRecommendedImport:
      league.sport === "ffl" && league.season === latestFflSeason,
    lastDiscoveredAt: discoveredAt,
  }));
}

export function EspnConnectPanel() {
  const [browser, setBrowser] = useState<BrowserStartResult | null>(null);
  const [connection, setConnection] = useState<ConnectResult | null>(null);
  const [discoveredLeagues, setDiscoveredLeagues] = useState<
    DiscoveredLeagueCandidate[]
  >([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<OnboardingPanelError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manualSwid, setManualSwid] = useState("");
  const [manualEspnS2, setManualEspnS2] = useState("");
  const [imports, setImports] = useState<Record<string, ImportResult>>({});
  const isBusy = Boolean(busy);

  const selectedLeagues = useMemo(
    () =>
      discoveredLeagues.filter(
        (league) =>
          selectedKeys.includes(leagueKey(league)) && canImportLeague(league),
      ),
    [discoveredLeagues, selectedKeys],
  );

  const remainingImportCount = discoveredLeagues.filter(canImportLeague).length;

  const replaceDiscoveredLeagues = useCallback(
    (nextLeagues: DiscoveredLeagueCandidate[], preserveSelection: boolean) => {
      setDiscoveredLeagues(nextLeagues);
      setSelectedKeys((current) => {
        const selectableKeys = new Set(
          nextLeagues.filter(canImportLeague).map(leagueKey),
        );
        if (preserveSelection) {
          const retained = current.filter((key) => selectableKeys.has(key));
          if (retained.length > 0) {
            return retained;
          }
        }
        return recommendedKeys(nextLeagues);
      });
    },
    [],
  );

  async function loadDiscoveredLeagues({
    preserveSelection = false,
    silent = false,
  }: {
    preserveSelection?: boolean;
    silent?: boolean;
  } = {}) {
    try {
      const leagues = await getJson<DiscoveredLeagueCandidate[]>(
        DISCOVERED_LEAGUES_URL,
      );
      replaceDiscoveredLeagues(leagues, preserveSelection);
      return leagues;
    } catch (cause) {
      if (!silent) {
        setError(onboardingPanelError(cause));
      }
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const leagues = await getJson<DiscoveredLeagueCandidate[]>(
        DISCOVERED_LEAGUES_URL,
      ).catch(() => null);
      if (!cancelled && leagues) {
        replaceDiscoveredLeagues(leagues, false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [replaceDiscoveredLeagues]);

  async function run<T>(
    label: string,
    action: () => Promise<T>,
  ): Promise<T | null> {
    setBusy(label);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      setError(onboardingPanelError(cause));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function startHostedBrowser() {
    const started = await run("browser-start", () =>
      postJson<BrowserStartResult>("/api/onboarding/espn/browser/start"),
    );
    if (started) {
      setBrowser(started);
    }
  }

  async function showConnectedLeagues(connected: ConnectResult) {
    setConnection(connected);
    setImports({});
    const listed = await loadDiscoveredLeagues({ silent: true });
    if (!listed) {
      replaceDiscoveredLeagues(
        fallbackCandidates(connected.discoveredLeagues),
        false,
      );
    }
  }

  async function captureHostedBrowser() {
    if (!browser) {
      setError({ message: "Start the hosted browser first." });
      return;
    }
    const connected = await run("browser-capture", () =>
      postJson<ConnectResult>("/api/onboarding/espn/browser/capture", {
        sessionId: browser.sessionId,
      }),
    );
    if (connected) {
      await showConnectedLeagues(connected);
    }
  }

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const connected = await run("manual", () =>
      postJson<ConnectResult>("/api/onboarding/espn/manual", {
        espn_s2: manualEspnS2,
        swid: manualSwid,
      }),
    );
    if (connected) {
      setManualEspnS2("");
      setManualSwid("");
      await showConnectedLeagues(connected);
    }
  }

  function toggleLeague(league: DiscoveredLeagueCandidate, checked: boolean) {
    const key = leagueKey(league);
    setSelectedKeys((current) => {
      if (checked) {
        return current.includes(key) ? current : [...current, key];
      }
      return current.filter((selectedKey) => selectedKey !== key);
    });
  }

  function markLeagueImported(key: string, imported: ImportResult) {
    setDiscoveredLeagues((current) =>
      current.map((league) =>
        leagueKey(league) === key
          ? {
              ...league,
              imported: true,
              isRecommendedImport: false,
              leagueId: imported.leagueId,
            }
          : league,
      ),
    );
    setSelectedKeys((current) =>
      current.filter((selectedKey) => selectedKey !== key),
    );
  }

  async function importLeague(league: DiscoveredLeagueCandidate) {
    const key = leagueKey(league);
    const imported = await run(`import-${key}`, () =>
      postJson<ImportResult>("/api/onboarding/import", {
        provider: league.provider,
        providerLeagueId: league.providerId,
        season: league.season,
      }),
    );
    if (imported) {
      setImports((current) => ({ ...current, [key]: imported }));
      markLeagueImported(key, imported);
      await loadDiscoveredLeagues({
        preserveSelection: true,
        silent: true,
      });
    }
  }

  async function importSelectedLeagues() {
    if (selectedLeagues.length === 0) {
      return;
    }

    const imported = await run("import-selected", async () => {
      const results: Record<string, ImportResult> = {};
      for (const league of selectedLeagues) {
        const result = await postJson<ImportResult>("/api/onboarding/import", {
          provider: league.provider,
          providerLeagueId: league.providerId,
          season: league.season,
        });
        results[leagueKey(league)] = result;
      }
      return results;
    });

    if (imported) {
      setImports((current) => ({ ...current, ...imported }));
      for (const [key, result] of Object.entries(imported)) {
        markLeagueImported(key, result);
      }
      await loadDiscoveredLeagues({
        preserveSelection: true,
        silent: true,
      });
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-card border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Hosted ESPN login</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a controlled browser session, then capture the ESPN session.
            </p>
          </div>
          <Plug className="mt-1 size-5 text-primary" aria-hidden="true" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={startHostedBrowser} disabled={isBusy}>
            <ExternalLink data-icon="inline-start" />
            Connect ESPN
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={captureHostedBrowser}
            disabled={isBusy || !browser}
          >
            <RefreshCw data-icon="inline-start" />
            Capture
          </Button>
        </div>
        {browser ? (
          <div className="mt-4 overflow-hidden rounded-card border border-border bg-background">
            <iframe
              title="Hosted ESPN login"
              src={browser.liveViewUrl}
              className="h-52 w-full"
            />
          </div>
        ) : null}
      </section>

      <form
        onSubmit={submitManual}
        className="rounded-card border border-border bg-card p-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Manual fallback</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste SWID and espn_s2 only when the hosted flow is unavailable.
            </p>
          </div>
          <KeyRound className="mt-1 size-5 text-highlight" aria-hidden="true" />
        </div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            SWID
            <input
              value={manualSwid}
              onChange={(event) => setManualSwid(event.target.value)}
              className="min-h-11 rounded-control border border-input bg-background px-3 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
              autoComplete="off"
              inputMode="text"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            espn_s2
            <input
              value={manualEspnS2}
              onChange={(event) => setManualEspnS2(event.target.value)}
              className="min-h-11 rounded-control border border-input bg-background px-3 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
              autoComplete="off"
              type="password"
            />
          </label>
          <Button type="submit" disabled={isBusy}>
            <KeyRound data-icon="inline-start" />
            Validate cookies
          </Button>
        </div>
      </form>

      {error ? <OnboardingErrorBanner error={error} /> : null}

      <section className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Your leagues</h2>
            <p className="text-sm text-muted-foreground">
              {discoveredLeagues.length > 0
                ? `${discoveredLeagues.length} league${
                    discoveredLeagues.length === 1 ? "" : "s"
                  } found across connected providers.`
                : connection
                  ? "No ESPN fantasy football leagues were found."
                  : "Connect a provider to populate this import list."}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void loadDiscoveredLeagues()}
            disabled={isBusy}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Button>
        </div>

        {discoveredLeagues.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-muted/35 px-3 py-2">
            <p className="text-sm text-muted-foreground">
              {selectedLeagues.length} selected · {remainingImportCount} not
              imported
            </p>
            <Button
              type="button"
              onClick={importSelectedLeagues}
              disabled={isBusy || selectedLeagues.length === 0}
            >
              <ListChecks data-icon="inline-start" />
              Import selected
            </Button>
          </div>
        ) : null}

        {discoveredLeagues.map((league) => {
          const key = leagueKey(league);
          const importStats = imports[key];
          const blockedByConnection = Boolean(league.reconnect);
          const checked = selectedKeys.includes(key) && canImportLeague(league);
          return (
            <article
              key={key}
              className="rounded-card border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isBusy || !canImportLeague(league)}
                    onChange={(event) =>
                      toggleLeague(league, event.target.checked)
                    }
                    className="mt-1 size-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {league.name}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {getProviderBadgeLabel(league.provider)} · {league.season}{" "}
                      · {league.size ?? "unknown"} teams
                      {league.teamName ? ` · ${league.teamName}` : ""}
                    </span>
                  </span>
                </label>
                {league.imported ? (
                  <CheckCircle2
                    className="mt-1 size-5 shrink-0 text-positive"
                    aria-label="Imported"
                  />
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {league.imported
                    ? "Imported"
                    : blockedByConnection && league.reconnect
                      ? league.reconnect.message
                      : importStats
                        ? `${importStats.sync.teams.total} teams · ${importStats.sync.members.total} members · ${importStats.sync.matchups.total} matchups`
                        : league.isRecommendedImport
                          ? "Selected by default"
                          : `${getProviderBadgeLabel(league.provider)} league ${league.providerId}`}
                </p>
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
                      onClick={() => importLeague(league)}
                      disabled={isBusy || !canImportLeague(league)}
                    >
                      Import
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
