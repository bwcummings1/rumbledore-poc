"use client";

import {
  CheckCircle2,
  House,
  ListChecks,
  RefreshCw,
  Search,
  UserRound,
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

interface DiscoveredLeague {
  provider: "sleeper";
  providerId: string;
  season: number;
  sport: "ffl" | "unknown";
  name: string;
  teamName?: string;
  size?: number;
}

interface DiscoveredLeagueCandidate extends DiscoveredLeague {
  imported: boolean;
  isRecommendedImport: boolean;
  lastDiscoveredAt: string;
  leagueId?: string;
}

interface ConnectResult {
  credentialId: string;
  discoveredLeagues: DiscoveredLeague[];
}

interface ImportResult {
  leagueId: string;
  sync: {
    teams: { total: number };
    members: { total: number };
    matchups: { total: number };
  };
}

const DISCOVERED_LEAGUES_URL = "/api/onboarding/sleeper/discovered";

function leagueKey(league: Pick<DiscoveredLeague, "providerId" | "season">) {
  return `${league.providerId}:${league.season}`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Request failed";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Request failed");
  }
  return payload as T;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  return requestJson<T>(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    method: "POST",
  });
}

function getJson<T>(url: string): Promise<T> {
  return requestJson<T>(url, { method: "GET" });
}

function recommendedKeys(leagues: readonly DiscoveredLeagueCandidate[]) {
  return leagues
    .filter((league) => league.isRecommendedImport && !league.imported)
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

export function SleeperConnectPanel() {
  const [connection, setConnection] = useState<ConnectResult | null>(null);
  const [discoveredLeagues, setDiscoveredLeagues] = useState<
    DiscoveredLeagueCandidate[]
  >([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [usernameOrUserId, setUsernameOrUserId] = useState("");
  const [imports, setImports] = useState<Record<string, ImportResult>>({});
  const isBusy = Boolean(busy);

  const selectedLeagues = useMemo(
    () =>
      discoveredLeagues.filter(
        (league) =>
          selectedKeys.includes(leagueKey(league)) && !league.imported,
      ),
    [discoveredLeagues, selectedKeys],
  );

  const remainingImportCount = discoveredLeagues.filter(
    (league) => !league.imported,
  ).length;

  const replaceDiscoveredLeagues = useCallback(
    (nextLeagues: DiscoveredLeagueCandidate[], preserveSelection: boolean) => {
      setDiscoveredLeagues(nextLeagues);
      setSelectedKeys((current) => {
        const selectableKeys = new Set(
          nextLeagues.filter((league) => !league.imported).map(leagueKey),
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
        setError(errorMessage(cause));
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
      setError(errorMessage(cause));
      return null;
    } finally {
      setBusy(null);
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

  async function submitPublicConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const connected = await run("connect", () =>
      postJson<ConnectResult>("/api/onboarding/sleeper/connect", {
        usernameOrUserId,
      }),
    );
    if (connected) {
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
      postJson<ImportResult>("/api/onboarding/sleeper/import", {
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
        const result = await postJson<ImportResult>(
          "/api/onboarding/sleeper/import",
          {
            providerLeagueId: league.providerId,
            season: league.season,
          },
        );
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
      <form
        onSubmit={submitPublicConnect}
        className="rounded-card border border-border bg-card p-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Sleeper account</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Public usernames and user IDs can discover public NFL leagues.
            </p>
          </div>
          <UserRound className="mt-1 size-5 text-primary" aria-hidden="true" />
        </div>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Username or user ID
            <input
              value={usernameOrUserId}
              onChange={(event) => setUsernameOrUserId(event.target.value)}
              className="min-h-11 rounded-control border border-input bg-background px-3 text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/30"
              autoComplete="username"
              inputMode="text"
            />
          </label>
          <Button type="submit" disabled={isBusy}>
            <Search data-icon="inline-start" />
            Find leagues
          </Button>
        </div>
      </form>

      {error ? (
        <p className="rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Discovered leagues</h2>
            <p className="text-sm text-muted-foreground">
              {discoveredLeagues.length > 0
                ? `${discoveredLeagues.length} Sleeper league${
                    discoveredLeagues.length === 1 ? "" : "s"
                  } found.`
                : connection
                  ? "No Sleeper fantasy football leagues were found."
                  : "Find a Sleeper account to populate this import list."}
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
          const imported = imports[key];
          const checked = selectedKeys.includes(key) && !league.imported;
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
                    disabled={isBusy || league.imported}
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
                      {league.season} · {league.size ?? "unknown"} teams
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
                    : imported
                      ? `${imported.sync.teams.total} teams · ${imported.sync.members.total} members · ${imported.sync.matchups.total} matchups`
                      : league.isRecommendedImport
                        ? "Selected by default"
                        : `Sleeper league ${league.providerId}`}
                </p>
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
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => importLeague(league)}
                    disabled={isBusy || league.imported}
                  >
                    Import
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
