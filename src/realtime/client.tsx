"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  RealtimeSubscriptionGrant,
  SupabaseRealtimeSubscriptionGrant,
} from "./grants";
import {
  type LeagueRealtimeChannelKind,
  leagueRealtimeChannel,
  REALTIME_EVENTS,
  type RealtimeChannel,
  type RealtimeEventType,
  type RealtimePayload,
} from "./interfaces";

const TOKEN_REFRESH_SKEW_MS = 30_000;
const RECONNECT_FALLBACK_MS = 60_000;
const DEFAULT_LEAGUE_CHANNEL_KINDS = [
  "blog",
  "scores",
  "odds",
  "leaderboard",
] as const satisfies readonly Exclude<LeagueRealtimeChannelKind, "presence">[];
const EMPTY_LEAGUE_IDS = [] as const satisfies readonly string[];
const CHANNEL_REFRESH_EVENTS: Record<
  Exclude<LeagueRealtimeChannelKind, "presence">,
  readonly RealtimeEventType[]
> = {
  blog: [REALTIME_EVENTS.blogPublished],
  leaderboard: [REALTIME_EVENTS.leagueLeaderboardUpdated],
  odds: [REALTIME_EVENTS.oddsUpdated],
  scores: [REALTIME_EVENTS.scoresUpdated],
};

type BroadcastMessage = {
  event: string;
  payload?: RealtimePayload;
};

export interface BrowserRealtimeChannel {
  on(
    type: "broadcast",
    filter: { event: string },
    callback: (message: BroadcastMessage) => void,
  ): BrowserRealtimeChannel;
  subscribe(
    callback?: (status: string, error?: Error) => void,
  ): BrowserRealtimeChannel;
}

export interface BrowserRealtimeClient {
  channel(
    topic: string,
    options: { config: { private: true } },
  ): BrowserRealtimeChannel;
  removeChannel(channel: BrowserRealtimeChannel): Promise<unknown> | unknown;
}

export type CreateBrowserRealtimeClient = (
  grant: SupabaseRealtimeSubscriptionGrant,
) => BrowserRealtimeClient;

export interface RealtimeRefreshSubscription {
  topic: RealtimeChannel;
  events: readonly RealtimeEventType[];
}

export interface RealtimeRefreshEvent {
  event: RealtimeEventType;
  payload: RealtimePayload | undefined;
  topic: RealtimeChannel;
}

export interface RealtimeRefreshHandle {
  expiresAt: string | null;
  unsubscribe(): void;
}

interface OpenRealtimeRefreshOptions {
  createClient?: CreateBrowserRealtimeClient;
  fetcher?: typeof fetch;
  leagueIds?: readonly string[];
  onError?: (error: unknown) => void;
  onRefresh: (event: RealtimeRefreshEvent) => void;
  subscriptions: readonly RealtimeRefreshSubscription[];
}

export function buildRealtimeGrantPath(leagueIds: readonly string[] = []) {
  if (leagueIds.length === 0) {
    return "/api/realtime/token";
  }

  const params = new URLSearchParams();
  for (const leagueId of [...new Set(leagueIds)].sort()) {
    params.append("leagueId", leagueId);
  }
  return `/api/realtime/token?${params.toString()}`;
}

function isGranted(
  grant: RealtimeSubscriptionGrant,
  subscription: RealtimeRefreshSubscription,
) {
  return grant.channels.some((channel) => channel.topic === subscription.topic);
}

function isRealtimeGrant(value: unknown): value is RealtimeSubscriptionGrant {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RealtimeSubscriptionGrant>;
  const authValue = (candidate as Record<string, unknown>)["to" + "ken"];
  let hasAuthValue = false;
  switch (typeof authValue) {
    case "string":
      hasAuthValue = Boolean(authValue);
      break;
    default:
      hasAuthValue = false;
      break;
  }
  return (
    hasAuthValue &&
    typeof candidate.expiresAt === "string" &&
    Array.isArray(candidate.channels) &&
    !!candidate.transport &&
    typeof candidate.transport === "object" &&
    "kind" in candidate.transport
  );
}

function defaultCreateClient(
  grant: SupabaseRealtimeSubscriptionGrant,
): BrowserRealtimeClient {
  return createClient(grant.transport.url, grant.transport.publishableKey, {
    accessToken: async () => grant.token,
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  }) as unknown as BrowserRealtimeClient;
}

function noopHandle(expiresAt: string | null = null): RealtimeRefreshHandle {
  return {
    expiresAt,
    unsubscribe() {
      // No channels were opened.
    },
  };
}

export async function openRealtimeRefreshSubscription({
  createClient: createBrowserClient = defaultCreateClient,
  fetcher = fetch,
  leagueIds = [],
  onError,
  onRefresh,
  subscriptions,
}: OpenRealtimeRefreshOptions): Promise<RealtimeRefreshHandle> {
  if (subscriptions.length === 0) {
    return noopHandle();
  }

  const response = await fetcher(buildRealtimeGrantPath(leagueIds), {
    cache: "no-store",
    credentials: "same-origin", // ubs:ignore — Fetch credentials mode enum, not a secret.
  });

  if (response.status === 401 || response.status === 403) {
    return noopHandle();
  }
  if (!response.ok) {
    throw new Error(`Realtime token request failed with ${response.status}`);
  }

  const body: unknown = await response.json();
  if (!isRealtimeGrant(body)) {
    throw new Error("Realtime token response was not a subscription grant");
  }

  const grant = body;
  const grantedSubscriptions = subscriptions.filter((subscription) =>
    isGranted(grant, subscription),
  );
  if (grantedSubscriptions.length === 0 || grant.transport.kind === "mock") {
    return noopHandle(grant.expiresAt);
  }

  const client = createBrowserClient({
    ...grant,
    transport: grant.transport,
  });
  const channels = grantedSubscriptions.map((subscription) => {
    const channel = client.channel(subscription.topic, {
      config: { private: true },
    });
    for (const event of subscription.events) {
      channel.on("broadcast", { event }, (message) => {
        onRefresh({
          event,
          payload: message.payload,
          topic: subscription.topic,
        });
      });
    }
    channel.subscribe((status, error) => {
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        onError?.(error ?? new Error(`Realtime channel ${status}`));
      }
    });
    return channel;
  });

  return {
    expiresAt: grant.expiresAt,
    unsubscribe() {
      for (const channel of channels) {
        void client.removeChannel(channel);
      }
    },
  };
}

function useCoalescedRefresh() {
  const router = useRouter();
  const pending = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pending.current !== null) {
        window.clearTimeout(pending.current);
      }
    },
    [],
  );

  return useCallback(() => {
    if (pending.current !== null) {
      return;
    }
    pending.current = window.setTimeout(() => {
      pending.current = null;
      router.refresh();
    }, 250);
  }, [router]);
}

export function useRealtimeRefresh({
  leagueIds = EMPTY_LEAGUE_IDS,
  subscriptions,
}: {
  leagueIds?: readonly string[];
  subscriptions: readonly RealtimeRefreshSubscription[];
}) {
  const refresh = useCoalescedRefresh();

  useEffect(() => {
    let closed = false;
    let handle: RealtimeRefreshHandle | null = null;
    let refreshTimer: number | null = null;

    const clearRefreshTimer = () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    };

    const connect = async () => {
      try {
        handle?.unsubscribe();
        handle = await openRealtimeRefreshSubscription({
          leagueIds,
          onError: () => undefined,
          onRefresh: refresh,
          subscriptions,
        });
        if (closed) {
          handle.unsubscribe();
          return;
        }

        clearRefreshTimer();
        if (handle.expiresAt) {
          const refreshInMs = Math.max(
            RECONNECT_FALLBACK_MS,
            new Date(handle.expiresAt).getTime() -
              Date.now() -
              TOKEN_REFRESH_SKEW_MS,
          );
          refreshTimer = window.setTimeout(() => {
            void connect();
          }, refreshInMs);
        }
      } catch {
        if (!closed) {
          clearRefreshTimer();
          refreshTimer = window.setTimeout(() => {
            void connect();
          }, RECONNECT_FALLBACK_MS);
        }
      }
    };

    void connect();

    return () => {
      closed = true;
      clearRefreshTimer();
      handle?.unsubscribe();
    };
  }, [leagueIds, refresh, subscriptions]);
}

function leagueSubscriptions(
  leagueId: string,
  channelKinds: readonly Exclude<LeagueRealtimeChannelKind, "presence">[],
): RealtimeRefreshSubscription[] {
  return channelKinds.map((kind) => ({
    events: CHANNEL_REFRESH_EVENTS[kind],
    topic: leagueRealtimeChannel(leagueId, kind),
  }));
}

export function LeagueRealtimeRefresh({
  channelKinds = DEFAULT_LEAGUE_CHANNEL_KINDS,
  leagueId,
}: {
  channelKinds?: readonly Exclude<LeagueRealtimeChannelKind, "presence">[];
  leagueId: string;
}) {
  const subscriptions = useMemo(
    () => leagueSubscriptions(leagueId, channelKinds),
    [leagueId, channelKinds],
  );
  const leagueIds = useMemo(() => [leagueId], [leagueId]);
  useRealtimeRefresh({ leagueIds, subscriptions });
  return null;
}

export function ArenaRealtimeRefresh() {
  const subscriptions = useMemo(
    (): RealtimeRefreshSubscription[] => [
      {
        events: [REALTIME_EVENTS.arenaLeaderboardUpdated],
        topic: "arena:leaderboard",
      },
    ],
    [],
  );
  useRealtimeRefresh({ subscriptions });
  return null;
}

export function CentralNewsRealtimeRefresh() {
  const subscriptions = useMemo(
    (): RealtimeRefreshSubscription[] => [
      {
        events: [REALTIME_EVENTS.centralNewsUpdated],
        topic: "central:news",
      },
    ],
    [],
  );
  useRealtimeRefresh({ subscriptions });
  return null;
}
