"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

interface StartResult {
  authorizationUrl: string;
}

const DISCOVERED_LEAGUES_URL = "/api/onboarding/discovered";

function recommendedKeys(leagues: readonly DiscoveredLeagueCandidate[]) {
  return leagues
    .filter((league) => league.isRecommendedImport && canImportLeague(league))
    .map(leagueKey);
}

export function YahooConnectPanel({ returnTo }: { returnTo?: string | null }) {
  const [discoveredLeagues, setDiscoveredLeagues] = useState<
    DiscoveredLeagueCandidate[]
  >([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<OnboardingPanelError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
    connected: Boolean(notice) || discoveredLeagues.length > 0,
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
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("connected");
      const callbackError = params.get("error");
      if (connected) {
        const returnHref = returnToAfterConnection(returnTo);
        if (continueToReturnTo(returnHref)) {
          return;
        }
        setNotice("Yahoo connected. Choose leagues to import.");
      }
      if (callbackError) {
        setError({ message: "Yahoo authorization could not be completed." });
      }

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
  }, [replaceDiscoveredLeagues, returnTo]);

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

  async function startYahooConnect() {
    const started = await run("connect", () =>
      postJson<StartResult>("/api/onboarding/yahoo/start", { returnTo }),
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
      continueToReturnTo(returnToAfterImport(returnTo, [imported.leagueId]));
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
      continueToReturnTo(
        returnToAfterImport(
          returnTo,
          Object.values(imported).map((result) => result.leagueId),
        ),
      );
    }
  }

  return (
    <ProviderConnectPanelShell
      connectedProviders={connectedProviders}
      provider="yahoo"
      returnTo={returnTo}
    >
      <ReturnToInviteLink returnTo={returnTo} />
      <Steps aria-label="Yahoo onboarding progress" steps={onboardingSteps} />
      <section className="panel grid gap-4 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-primary">OAuth connect</p>
            <h2 className="mt-1 font-display text-base font-semibold text-foreground">
              Yahoo authorization
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Connect with Yahoo to discover Fantasy Football leagues.
            </p>
          </div>
          <span
            aria-hidden="true"
            className={isConnecting(busy) ? "orb orb-md think" : "orb orb-md"}
            data-persona="commissioner"
            data-state={yahooOrbState(busy, Boolean(notice))}
          >
            <ShieldCheck className="size-3.5" />
          </span>
        </div>
        <output aria-live="polite" className="cell grid gap-2 px-3 py-3">
          <StatusPill
            tone={notice ? "success" : isOnline ? "neutral" : "warning"}
          >
            {notice ? "connected" : isOnline ? "ready" : "offline"}
          </StatusPill>
          <p className="text-sm text-muted-foreground">
            {notice ??
              (isOnline
                ? "Start Yahoo authorization, then choose leagues from the shared inventory."
                : "You are offline. Yahoo authorization resumes when the network returns.")}
          </p>
        </output>
        <Button
          type="button"
          disabled={isBusy || !isOnline}
          onClick={() => void startYahooConnect()}
        >
          <KeyRound data-icon="inline-start" />
          Connect Yahoo
        </Button>
      </section>

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

function yahooOrbState(
  busy: string | null,
  connected: boolean,
): "idle" | "speaking" | "think" {
  if (isConnecting(busy)) {
    return "think";
  }
  return connected ? "speaking" : "idle";
}
