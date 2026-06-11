"use client";

import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Plug,
  RefreshCw,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

interface DiscoveredLeague {
  provider: "espn";
  providerId: string;
  season: number;
  sport: "ffl" | "unknown";
  name: string;
  teamName?: string;
  size?: number;
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

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    method: "POST",
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

export function EspnConnectPanel() {
  const [browser, setBrowser] = useState<BrowserStartResult | null>(null);
  const [connection, setConnection] = useState<ConnectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manualSwid, setManualSwid] = useState("");
  const [manualEspnS2, setManualEspnS2] = useState("");
  const [imports, setImports] = useState<Record<string, ImportResult>>({});
  const isBusy = Boolean(busy);

  async function run<T>(
    label: string,
    action: () => Promise<T>,
  ): Promise<T | null> {
    setBusy(label);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
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

  async function captureHostedBrowser() {
    if (!browser) {
      setError("Start the hosted browser first.");
      return;
    }
    const connected = await run("browser-capture", () =>
      postJson<ConnectResult>("/api/onboarding/espn/browser/capture", {
        sessionId: browser.sessionId,
      }),
    );
    if (connected) {
      setConnection(connected);
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
      setConnection(connected);
    }
  }

  async function importLeague(league: DiscoveredLeague) {
    const key = `${league.providerId}:${league.season}`;
    const imported = await run(`import-${key}`, () =>
      postJson<ImportResult>("/api/onboarding/espn/import", {
        providerLeagueId: league.providerId,
        season: league.season,
      }),
    );
    if (imported) {
      setImports((current) => ({ ...current, [key]: imported }));
    }
  }

  return (
    <div className="grid gap-4">
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

      {error ? (
        <p className="rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {connection ? (
        <section className="grid gap-3">
          <div>
            <h2 className="text-lg font-semibold">Discovered leagues</h2>
            <p className="text-sm text-muted-foreground">
              {connection.discoveredLeagues.length} ESPN league
              {connection.discoveredLeagues.length === 1 ? "" : "s"} ready.
            </p>
          </div>
          {connection.discoveredLeagues.map((league) => {
            const key = `${league.providerId}:${league.season}`;
            const imported = imports[key];
            return (
              <article
                key={key}
                className="rounded-card border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{league.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {league.season} · {league.size ?? "unknown"} teams
                      {league.teamName ? ` · ${league.teamName}` : ""}
                    </p>
                  </div>
                  {imported ? (
                    <CheckCircle2
                      className="mt-1 size-5 text-positive"
                      aria-label="Imported"
                    />
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  {imported ? (
                    <p className="text-sm text-muted-foreground">
                      {imported.sync.teams.total} teams ·{" "}
                      {imported.sync.members.total} members ·{" "}
                      {imported.sync.matchups.total} matchups
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      ESPN league {league.providerId}
                    </p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => importLeague(league)}
                    disabled={isBusy || Boolean(imported)}
                  >
                    Import
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
