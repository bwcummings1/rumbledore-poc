"use client";

import { Search, UserRound } from "lucide-react";
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
import { StatusPill } from "@/components/ui/status-pill";
import { type StepItem, Steps } from "@/components/ui/steps";
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

const DISCOVERED_LEAGUES_URL = "/api/onboarding/discovered";

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

export function SleeperConnectPanel({
  returnTo,
}: {
  returnTo?: string | null;
}) {
  const [connection, setConnection] = useState<ConnectResult | null>(null);
  const [discoveredLeagues, setDiscoveredLeagues] = useState<
    DiscoveredLeagueCandidate[]
  >([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<OnboardingPanelError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [usernameOrUserId, setUsernameOrUserId] = useState("");
  const [imports, setImports] = useState<Record<string, ImportResult>>({});
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
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
  const onboardingSteps = buildProviderOnboardingSteps({
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
    const isLive = imported.onboardingState === "live";
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
      if (imported.onboardingState === "live") {
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
        .filter((result) => result.onboardingState === "live")
        .map((result) => result.leagueId);
      if (liveLeagueIds.length > 0) {
        continueToReturnTo(returnToAfterImport(returnTo, liveLeagueIds));
      }
    }
  }

  return (
    <ProviderConnectPanelShell
      connectedProviders={connectedProviders}
      provider="sleeper"
      returnTo={returnTo}
    >
      <ReturnToInviteLink returnTo={returnTo} />
      <Steps aria-label="Sleeper onboarding progress" steps={onboardingSteps} />
      <form onSubmit={submitPublicConnect} className="panel grid gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-primary">Public connect</p>
            <h2 className="mt-1 font-display text-base font-medium text-foreground">
              Sleeper account
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Public usernames and user IDs can discover public NFL leagues.
            </p>
          </div>
          <span
            aria-hidden="true"
            className={isConnecting(busy) ? "orb orb-md think" : "orb orb-md"}
            data-persona="analyst"
            data-state={sleeperOrbState(busy, Boolean(connection))}
          >
            <UserRound className="size-3.5" />
          </span>
        </div>
        <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
          <StatusPill
            tone={connection ? "success" : isOnline ? "neutral" : "warning"}
          >
            {connection ? "connected" : isOnline ? "ready" : "offline"}
          </StatusPill>
          <p className="text-sm text-muted-foreground">
            {connection
              ? "Sleeper is connected. Discovery rows below now reflect the shared inventory."
              : isOnline
                ? "Enter a public Sleeper username or user ID to discover leagues."
                : "You are offline. Connect resumes when the network returns."}
          </p>
        </output>
        <div className="grid gap-3">
          <Field label="Username or user ID">
            <Input
              value={usernameOrUserId}
              onChange={(event) => setUsernameOrUserId(event.target.value)}
              autoComplete="username"
              inputMode="text"
            />
          </Field>
          <Button type="submit" disabled={isBusy || !isOnline}>
            <Search data-icon="inline-start" />
            Find leagues
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

function buildProviderOnboardingSteps({
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
      description: "Authorize provider access.",
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

function isConnecting(busy: string | null): boolean {
  switch (busy) {
    case "connect":
      return true;
    default:
      return false;
  }
}

function sleeperOrbState(
  busy: string | null,
  connected: boolean,
): "idle" | "speaking" | "think" {
  if (isConnecting(busy)) {
    return "think";
  }
  return connected ? "speaking" : "idle";
}
