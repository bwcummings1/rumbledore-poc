"use client";

import { ExternalLink, KeyRound, Plug, RefreshCw } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { type StepItem, Steps } from "@/components/ui/steps";
import { cn } from "@/lib/utils";
import type { FantasyProviderId } from "@/providers";
import {
  getJson,
  type OnboardingPanelError,
  onboardingPanelError,
  postJson,
} from "../client-http";
import {
  canImportLeague,
  type DiscoveredLeagueCandidate,
  type ImportResult,
  leagueKey,
  OnboardingLeagueInventory,
  ProviderConnectPanelShell,
  useOnlineStatus,
} from "../onboarding-flow";
import { OnboardingErrorBanner } from "../reconnect-cta";
import { ReturnToInviteLink } from "../return-to-invite-link";
import {
  continueToReturnTo,
  returnToAfterConnection,
  returnToAfterImport,
} from "../return-to-navigation";

interface DiscoveredLeague {
  provider: FantasyProviderId;
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

const DISCOVERED_LEAGUES_URL = "/api/onboarding/discovered";

function isLiveImport(imported: ImportResult): boolean {
  switch (imported.onboardingState) {
    case "live":
      return true;
    default:
      return false;
  }
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

export function EspnConnectPanel({ returnTo }: { returnTo?: string | null }) {
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
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [browserNow, setBrowserNow] = useState(() => Date.now());
  const isOnline = useOnlineStatus();
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
  const connectedProviders = useMemo(
    () =>
      Array.from(
        new Set(discoveredLeagues.map((league) => league.provider)),
      ) as FantasyProviderId[],
    [discoveredLeagues],
  );
  const onboardingSteps = buildEspnOnboardingSteps({
    connected: Boolean(connection) || discoveredLeagues.length > 0,
    discovered: discoveredLeagues.length > 0,
    imported:
      Object.keys(imports).length > 0 ||
      discoveredLeagues.some((league) => league.imported),
  });

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
      if (!silent) {
        setDiscoveryLoading(true);
      }
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
    } finally {
      if (!silent) {
        setDiscoveryLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDiscoveryLoading(true);
      const leagues = await getJson<DiscoveredLeagueCandidate[]>(
        DISCOVERED_LEAGUES_URL,
      ).catch(() => null);
      if (!cancelled && leagues) {
        replaceDiscoveredLeagues(leagues, false);
      }
      if (!cancelled) {
        setDiscoveryLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [replaceDiscoveredLeagues]);

  useEffect(() => {
    if (!browser) {
      return;
    }

    const interval = window.setInterval(() => setBrowserNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [browser]);

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
      const returnHref = returnToAfterConnection(returnTo);
      if (continueToReturnTo(returnHref)) {
        return;
      }
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
      const returnHref = returnToAfterConnection(returnTo);
      if (continueToReturnTo(returnHref)) {
        return;
      }
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
    const isLive = isLiveImport(imported);
    setDiscoveredLeagues((current) =>
      current.map((league) =>
        leagueKey(league) === key
          ? {
              ...league,
              imported: isLive,
              isRecommendedImport: false,
              leagueId: imported.leagueId,
              onboardingState: imported.onboardingState,
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
      if (isLiveImport(imported)) {
        continueToReturnTo(returnToAfterImport(returnTo, [imported.leagueId]));
      }
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
      const liveLeagueIds = Object.values(imported)
        .filter(isLiveImport)
        .map((result) => result.leagueId);
      if (liveLeagueIds.length > 0) {
        continueToReturnTo(returnToAfterImport(returnTo, liveLeagueIds));
      }
    }
  }

  return (
    <ProviderConnectPanelShell
      connectedProviders={connectedProviders}
      provider="espn"
      returnTo={returnTo}
    >
      <ReturnToInviteLink returnTo={returnTo} />
      <Steps aria-label="ESPN onboarding progress" steps={onboardingSteps} />
      <section className="panel grid gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-primary">Primary connect</p>
            <h2 className="mt-1 font-display text-base font-medium text-foreground">
              Hosted ESPN login
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Open a controlled browser session, log into ESPN there, then
              capture only the session credentials server-side.
            </p>
          </div>
          <span
            aria-hidden="true"
            className={cn(
              "orb orb-md",
              isHostedBrowserBusy(busy) ? "think" : "",
            )}
            data-persona="commissioner"
            data-state={
              isHostedBrowserBusy(busy)
                ? "think"
                : connection
                  ? "speaking"
                  : "idle"
            }
          >
            <Plug className="size-3.5" />
          </span>
        </div>
        <HostedBrowserStatus
          browser={browser}
          connection={connection}
          isOnline={isOnline}
          now={browserNow}
          busy={busy}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={startHostedBrowser}
            disabled={isBusy || !isOnline}
          >
            <ExternalLink data-icon="inline-start" />
            {browser ? "Restart session" : "Connect ESPN"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={captureHostedBrowser}
            disabled={
              isBusy ||
              !browser ||
              !isOnline ||
              isBrowserExpired(browser, browserNow)
            }
          >
            <RefreshCw data-icon="inline-start" />
            Capture
          </Button>
        </div>
        {isBrowserStarting(busy) ? (
          <output aria-label="Starting hosted browser" aria-live="polite">
            <Skeleton className="h-60" variant="card" />
          </output>
        ) : null}
        {browser && !isBrowserExpired(browser, browserNow) ? (
          <div
            className={cn(
              "bezel overflow-hidden rounded-card border border-border bg-[var(--panel-solid)] shadow-overlay",
              isBrowserCapturing(busy) && "opacity-70",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hair)] px-3 py-2">
              <p className="font-display text-sm font-medium text-foreground">
                Secure ESPN login - hosted by Rumbledore
              </p>
              <span className="lcd text-xs text-muted-foreground">
                {browser.sessionId.slice(0, 8)} ·{" "}
                {formatBrowserExpiry(browser, browserNow)}
              </span>
            </div>
            <iframe
              title="Hosted ESPN login"
              src={browser.liveViewUrl}
              className="h-[min(65dvh,34rem)] min-h-72 w-full bg-background"
            />
            <p className="border-t border-[var(--hair)] px-3 py-2 text-xs text-muted-foreground">
              Your ESPN password stays inside the hosted browser. Rumbledore
              stores only validated session credentials after Capture.
            </p>
          </div>
        ) : null}
        {browser && isBrowserExpired(browser, browserNow) ? (
          <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
            <StatusPill tone="danger">session expired</StatusPill>
            <p className="text-sm text-muted-foreground">
              The hosted browser window lapsed. Start a new ESPN session to
              continue.
            </p>
          </output>
        ) : null}
      </section>

      <form onSubmit={submitManual} className="panel grid gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-warning">Fallback</p>
            <h2 className="mt-1 font-display text-base font-medium text-foreground">
              Manual cookie fallback
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste SWID and espn_s2 only when the hosted flow is unavailable.
            </p>
          </div>
          <KeyRound className="mt-1 size-5 text-highlight" aria-hidden="true" />
        </div>
        <div className="grid gap-3">
          <Field
            hint="Brace-wrapped ESPN account identifier. It is validated server-side and never echoed."
            label="SWID"
          >
            <Input
              value={manualSwid}
              onChange={(event) => setManualSwid(event.target.value)}
              autoComplete="off"
              inputMode="text"
            />
          </Field>
          <Field
            hint="Private ESPN session token. This field stays masked."
            label="espn_s2"
          >
            <Input
              value={manualEspnS2}
              onChange={(event) => setManualEspnS2(event.target.value)}
              autoComplete="off"
              type="password"
            />
          </Field>
          <Button type="submit" disabled={isBusy}>
            <KeyRound data-icon="inline-start" />
            Validate cookies
          </Button>
        </div>
      </form>

      {error ? <OnboardingErrorBanner error={error} /> : null}

      <OnboardingLeagueInventory
        imports={imports}
        isBusy={isBusy}
        isOnline={isOnline}
        leagues={discoveredLeagues}
        loading={discoveryLoading}
        onImportLeague={(league) => void importLeague(league)}
        onImportSelected={() => void importSelectedLeagues()}
        onRefresh={() => void loadDiscoveredLeagues()}
        onToggleLeague={toggleLeague}
        remainingImportCount={remainingImportCount}
        selectedKeys={selectedKeys}
        selectedLeagues={selectedLeagues}
      />
    </ProviderConnectPanelShell>
  );
}

function HostedBrowserStatus({
  browser,
  busy,
  connection,
  isOnline,
  now,
}: {
  readonly browser: BrowserStartResult | null;
  readonly busy: string | null;
  readonly connection: ConnectResult | null;
  readonly isOnline: boolean;
  readonly now: number;
}) {
  if (!isOnline) {
    return (
      <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
        <StatusPill tone="warning">offline</StatusPill>
        <p className="text-sm text-muted-foreground">
          Reconnect to start or capture a hosted ESPN session.
        </p>
      </output>
    );
  }

  if (connection) {
    return (
      <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
        <StatusPill tone="success">connected</StatusPill>
        <p className="text-sm text-muted-foreground">
          ESPN is connected. Discovery rows below now reflect connected provider
          inventory.
        </p>
      </output>
    );
  }

  if (isBrowserStarting(busy)) {
    return (
      <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
        <StatusPill tone="live">starting</StatusPill>
        <p className="text-sm text-muted-foreground">
          Opening a hosted ESPN login session.
        </p>
      </output>
    );
  }

  if (isBrowserCapturing(busy)) {
    return (
      <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
        <StatusPill tone="live">capturing</StatusPill>
        <p className="text-sm text-muted-foreground">
          Validating the ESPN session and storing encrypted credentials.
        </p>
      </output>
    );
  }

  if (browser && isBrowserExpired(browser, now)) {
    return (
      <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
        <StatusPill tone="danger">expired</StatusPill>
        <p className="text-sm text-muted-foreground">
          Session expired. Start again for a fresh hosted browser.
        </p>
      </output>
    );
  }

  if (browser) {
    return (
      <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
        <StatusPill tone="live">session active</StatusPill>
        <p className="text-sm text-muted-foreground">
          Log into ESPN in the frame, then press Capture before{" "}
          {formatBrowserExpiry(browser, now)}.
        </p>
      </output>
    );
  }

  return (
    <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
      <StatusPill tone="neutral">ready</StatusPill>
      <p className="text-sm text-muted-foreground">
        Start the hosted browser. No ESPN password or cookie is shown in this
        app.
      </p>
    </output>
  );
}

function isHostedBrowserBusy(busy: string | null): boolean {
  switch (busy) {
    case "browser-start":
    case "browser-capture":
      return true;
    default:
      return false;
  }
}

function isBrowserStarting(busy: string | null): boolean {
  switch (busy) {
    case "browser-start":
      return true;
    default:
      return false;
  }
}

function isBrowserCapturing(busy: string | null): boolean {
  switch (busy) {
    case "browser-capture":
      return true;
    default:
      return false;
  }
}

function isBrowserExpired(browser: BrowserStartResult, now: number): boolean {
  const expiresAt = new Date(browser.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function formatBrowserExpiry(browser: BrowserStartResult, now: number): string {
  const expiresAt = new Date(browser.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) {
    return "expiry pending";
  }

  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function buildEspnOnboardingSteps({
  connected,
  discovered,
  imported,
}: {
  readonly connected: boolean;
  readonly discovered: boolean;
  readonly imported: boolean;
}): readonly StepItem[] {
  const current =
    connected && discovered && imported
      ? "invite"
      : connected && discovered
        ? "claim"
        : connected
          ? "discover"
          : "connect";

  return [
    {
      description: "Authorize ESPN access.",
      id: "connect",
      label: "Connect",
      status: stepStatus("connect", current),
    },
    {
      description: "Find every fantasy league.",
      id: "discover",
      label: "Discover",
      status: stepStatus("discover", current),
    },
    {
      description: "Import or open your teams.",
      id: "claim",
      label: "Claim",
      status: stepStatus("claim", current),
    },
    {
      description: "Bring leaguemates in.",
      id: "invite",
      label: "Invite",
      status: stepStatus("invite", current),
    },
  ];
}

function stepStatus(
  step: "connect" | "discover" | "claim" | "invite",
  current: "connect" | "discover" | "claim" | "invite",
): StepItem["status"] {
  const order = ["connect", "discover", "claim", "invite"] as const;
  const stepIndex = order.indexOf(step);
  const currentIndex = order.indexOf(current);

  if (stepIndex < currentIndex) {
    return "complete";
  }
  if (stepIndex === currentIndex) {
    return "current";
  }
  return "upcoming";
}
