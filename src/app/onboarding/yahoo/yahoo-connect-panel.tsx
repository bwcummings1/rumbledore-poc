"use client";

import {
  CheckCircle2,
  House,
  KeyRound,
  ListChecks,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DiscoveredLeague {
  provider: "yahoo";
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

interface StartResult {
  authorizationUrl: string;
}

interface ImportResult {
  leagueId: string;
  sync: {
    teams: { total: number };
    members: { total: number };
    matchups: { total: number };
  };
}

const DISCOVERED_LEAGUES_URL = "/api/onboarding/yahoo/discovered";

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

export function YahooConnectPanel() {
  const [discoveredLeagues, setDiscoveredLeagues] = useState<
    DiscoveredLeagueCandidate[]
  >([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("connected");
      const callbackError = params.get("error");
      if (connected) {
        setNotice("Yahoo connected. Choose leagues to import.");
      }
      if (callbackError) {
        setError("Yahoo authorization could not be completed.");
      }

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

  async function startYahooConnect() {
    const started = await run("connect", () =>
      postJson<StartResult>("/api/onboarding/yahoo/start"),
    );
    if (started) {
      window.location.assign(started.authorizationUrl);
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
      postJson<ImportResult>("/api/onboarding/yahoo/import", {
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
          "/api/onboarding/yahoo/import",
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
      <section className="rounded-card border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Yahoo authorization</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect with Yahoo to discover Fantasy Football leagues.
            </p>
          </div>
          <ShieldCheck
            className="mt-1 size-5 text-primary"
            aria-hidden="true"
          />
        </div>
        <Button
          type="button"
          className="mt-4"
          disabled={isBusy}
          onClick={() => void startYahooConnect()}
        >
          <KeyRound data-icon="inline-start" />
          Connect Yahoo
        </Button>
      </section>

      {notice ? (
        <p className="rounded-control border border-positive/40 bg-positive/10 px-3 py-2 text-sm text-positive">
          {notice}
        </p>
      ) : null}

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
                ? `${discoveredLeagues.length} Yahoo league${
                    discoveredLeagues.length === 1 ? "" : "s"
                  } found.`
                : "Connect Yahoo to populate this import list."}
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
                        : `Yahoo league ${league.providerId}`}
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
