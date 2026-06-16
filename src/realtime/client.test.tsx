import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserRealtimeChannel, BrowserRealtimeClient } from "./client";
import {
  buildRealtimeGrantPath,
  openRealtimePresenceSubscription,
  openRealtimeRefreshSubscription,
  useRealtimeRefresh,
} from "./client";
import type { RealtimeSubscriptionGrant } from "./grants";
import {
  leagueRealtimeChannel,
  REALTIME_EVENTS,
  type RealtimePayload,
} from "./interfaces";

const leagueId = "00000000-0000-4000-8000-000000000001";
const fixtureValue = (...parts: string[]) => parts.join("-");
const navigationMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigationMock.refresh }),
}));

class FakeChannel implements BrowserRealtimeChannel {
  readonly callbacks = new Map<
    string,
    (message: { event: string; payload?: RealtimePayload }) => void
  >();
  readonly presenceCallbacks = new Map<string, () => void>();
  readonly options: { config: { private: true } };
  private presenceEntries: Record<string, unknown[]> = {};
  readonly topic: string;
  private statusCallback:
    | ((status: string, error?: Error | undefined) => void)
    | null = null;
  subscribed = false;
  trackedPayload: Record<string, unknown> | null = null;

  constructor(topic: string, options: { config: { private: true } }) {
    this.topic = topic;
    this.options = options;
  }

  on(
    type: "broadcast",
    filter: { event: string },
    callback: (message: { event: string; payload?: RealtimePayload }) => void,
  ): BrowserRealtimeChannel;
  on(
    type: "presence",
    filter: { event: string },
    callback: () => void,
  ): BrowserRealtimeChannel;
  on(
    type: "broadcast" | "presence",
    filter: { event: string },
    callback:
      | ((message: { event: string; payload?: RealtimePayload }) => void)
      | (() => void),
  ): BrowserRealtimeChannel {
    if (type === "presence") {
      this.presenceCallbacks.set(filter.event, callback as () => void);
      return this;
    }
    this.callbacks.set(
      filter.event,
      callback as (message: {
        event: string;
        payload?: RealtimePayload;
      }) => void,
    );
    return this;
  }

  presenceState(): Record<string, unknown[]> {
    return this.presenceEntries;
  }

  subscribe(
    callback?: (status: string, error?: Error | undefined) => void,
  ): BrowserRealtimeChannel {
    this.statusCallback = callback ?? null;
    this.subscribed = true;
    return this;
  }

  emit(event: string, payload: RealtimePayload) {
    this.callbacks.get(event)?.({ event, payload });
  }

  emitPresence(event: string, state: Record<string, unknown[]>) {
    this.presenceEntries = state;
    this.presenceCallbacks.get(event)?.();
  }

  track(payload: Record<string, unknown>) {
    this.trackedPayload = payload;
  }

  transition(status: string, error?: Error) {
    this.statusCallback?.(status, error);
  }
}

class FakeClient implements BrowserRealtimeClient {
  readonly channels: FakeChannel[] = [];
  readonly removed: BrowserRealtimeChannel[] = [];

  channel(
    topic: string,
    options: { config: { private: true } },
  ): BrowserRealtimeChannel {
    const channel = new FakeChannel(topic, options);
    this.channels.push(channel);
    return channel;
  }

  removeChannel(channel: BrowserRealtimeChannel): void {
    this.removed.push(channel);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function supabaseGrant(
  topic: RealtimeSubscriptionGrant["channels"][number]["topic"],
  expiresAt = "2026-06-12T00:05:00.000Z",
): RealtimeSubscriptionGrant {
  return {
    channels: [{ capabilities: ["broadcast:read"], private: true, topic }],
    expiresAt,
    issuedAt: "2026-06-12T00:00:00.000Z",
    token: fixtureValue("client", "grant"),
    transport: {
      kind: "supabase",
      publishableKey: fixtureValue("publishable", "key"),
      url: "https://project.supabase.co",
    },
    ttlSeconds: 300,
  };
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function RealtimeHarness({
  createClient,
  fetcher,
  subscriptions,
}: {
  createClient: () => BrowserRealtimeClient;
  fetcher: typeof fetch;
  subscriptions: Parameters<typeof useRealtimeRefresh>[0]["subscriptions"];
}) {
  useRealtimeRefresh({
    createClient,
    fetcher,
    leagueIds: [leagueId],
    subscriptions,
  });
  return null;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  navigationMock.refresh.mockReset();
});

describe("realtime browser client", () => {
  it("builds token paths with sorted deduplicated league ids", () => {
    expect(buildRealtimeGrantPath()).toBe("/api/realtime/token");
    expect(buildRealtimeGrantPath(["b", "a", "b"])).toBe(
      "/api/realtime/token?leagueId=a&leagueId=b",
    );
  });

  it("does not open channels for mock or unauthorized grants", async () => {
    const topic = leagueRealtimeChannel(leagueId, "blog");
    const mockGrant: RealtimeSubscriptionGrant = {
      channels: [{ capabilities: ["broadcast:read"], private: true, topic }],
      expiresAt: "2026-06-12T00:05:00.000Z",
      issuedAt: "2026-06-12T00:00:00.000Z",
      token: fixtureValue("mock", "grant"),
      transport: { kind: "mock" },
      ttlSeconds: 300,
    };
    const createClient = vi.fn<() => BrowserRealtimeClient>();

    const mockHandle = await openRealtimeRefreshSubscription({
      createClient,
      fetcher: async () => jsonResponse(mockGrant),
      onRefresh: vi.fn(),
      subscriptions: [{ events: [REALTIME_EVENTS.blogPublished], topic }],
    });
    mockHandle.unsubscribe();

    const forbiddenHandle = await openRealtimeRefreshSubscription({
      createClient,
      fetcher: async () => jsonResponse({ error: "forbidden" }, 403),
      onRefresh: vi.fn(),
      subscriptions: [{ events: [REALTIME_EVENTS.blogPublished], topic }],
    });
    forbiddenHandle.unsubscribe();

    expect(createClient).not.toHaveBeenCalled();
  });

  it("subscribes to granted Supabase broadcasts and cleans them up", async () => {
    const topic = leagueRealtimeChannel(leagueId, "blog");
    const payload = {
      at: "2026-06-12T00:00:00.000Z",
      contentItemId: "content-1",
      leagueId,
      persona: "commissioner",
      publishedAt: "2026-06-12T00:00:00.000Z",
      title: "Commissioner note",
      triggerKey: "weekly-preview",
      type: REALTIME_EVENTS.blogPublished,
      v: 1,
    } as const;
    const grant = supabaseGrant(topic);
    const client = new FakeClient();
    const onRefresh = vi.fn();
    const fetcher = vi.fn(async () => jsonResponse(grant));

    const handle = await openRealtimeRefreshSubscription({
      createClient: () => client,
      fetcher,
      leagueIds: [leagueId],
      onRefresh,
      subscriptions: [{ events: [REALTIME_EVENTS.blogPublished], topic }],
    });

    expect(fetcher).toHaveBeenCalledWith(
      `/api/realtime/token?leagueId=${leagueId}`,
      { cache: "no-store", credentials: "same-origin" },
    );
    expect(client.channels).toHaveLength(1);
    expect(client.channels[0]?.topic).toBe(topic);
    expect(client.channels[0]?.options.config.private).toBe(true);
    expect(client.channels[0]?.subscribed).toBe(true);

    client.channels[0]?.emit(REALTIME_EVENTS.blogPublished, payload);
    expect(onRefresh).toHaveBeenCalledWith({
      event: REALTIME_EVENTS.blogPublished,
      payload,
      topic,
    });

    handle.unsubscribe();
    expect(client.removed).toEqual(client.channels);
  });

  it("subscribes one channel to multiple broadcast events", async () => {
    const topic = "arena:leaderboard" as const;
    const leaderboardPayload = {
      at: "2026-06-15T12:00:00.000Z",
      seasonId: "season-1",
      type: REALTIME_EVENTS.arenaLeaderboardUpdated,
      v: 1,
    } as const;
    const swingPayload: RealtimePayload = {
      at: "2026-06-15T12:00:01.000Z",
      computedAt: "2026-06-15T12:00:00.000Z",
      seasonId: "season-1",
      swings: [],
      type: REALTIME_EVENTS.arenaStandingsSwing,
      v: 1,
    };
    const grant = supabaseGrant(topic);
    const client = new FakeClient();
    const onRefresh = vi.fn();

    await openRealtimeRefreshSubscription({
      createClient: () => client,
      fetcher: async () => jsonResponse(grant),
      onRefresh,
      subscriptions: [
        {
          events: [
            REALTIME_EVENTS.arenaLeaderboardUpdated,
            REALTIME_EVENTS.arenaStandingsSwing,
          ],
          topic,
        },
      ],
    });

    client.channels[0]?.emit(
      REALTIME_EVENTS.arenaLeaderboardUpdated,
      leaderboardPayload,
    );
    client.channels[0]?.emit(REALTIME_EVENTS.arenaStandingsSwing, swingPayload);

    expect(onRefresh).toHaveBeenCalledWith({
      event: REALTIME_EVENTS.arenaLeaderboardUpdated,
      payload: leaderboardPayload,
      topic,
    });
    expect(onRefresh).toHaveBeenCalledWith({
      event: REALTIME_EVENTS.arenaStandingsSwing,
      payload: swingPayload,
      topic,
    });
  });

  it("refreshes the grant before the short-lived token expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T00:00:00.000Z"));

    const topic = leagueRealtimeChannel(leagueId, "blog");
    const grant = supabaseGrant(topic);
    const client = new FakeClient();
    const fetcher = vi.fn(async () => jsonResponse(grant));

    render(
      <RealtimeHarness
        createClient={() => client}
        fetcher={fetcher}
        subscriptions={[{ events: [REALTIME_EVENTS.blogPublished], topic }]}
      />,
    );
    await flushAsyncWork();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.channels).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(269_999);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await flushAsyncWork();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.channels).toHaveLength(2);
    expect(client.removed).toEqual([client.channels[0]]);
  });

  it("reconnects after Supabase channel failures using fallback backoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T00:00:00.000Z"));

    const topic = leagueRealtimeChannel(leagueId, "blog");
    const grant = supabaseGrant(topic);
    const client = new FakeClient();
    const fetcher = vi.fn(async () => jsonResponse(grant));

    render(
      <RealtimeHarness
        createClient={() => client}
        fetcher={fetcher}
        subscriptions={[{ events: [REALTIME_EVENTS.blogPublished], topic }]}
      />,
    );
    await flushAsyncWork();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.channels).toHaveLength(1);

    act(() => {
      client.channels[0]?.transition("CHANNEL_ERROR", new Error("lost"));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await flushAsyncWork();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.channels).toHaveLength(2);
    expect(client.removed).toEqual([client.channels[0]]);
  });

  it("retries token fetch failures using fallback backoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T00:00:00.000Z"));

    const topic = leagueRealtimeChannel(leagueId, "blog");
    const grant = supabaseGrant(topic);
    const client = new FakeClient();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse(grant));

    render(
      <RealtimeHarness
        createClient={() => client}
        fetcher={fetcher}
        subscriptions={[{ events: [REALTIME_EVENTS.blogPublished], topic }]}
      />,
    );
    await flushAsyncWork();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.channels).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await flushAsyncWork();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.channels).toHaveLength(1);
    expect(client.channels[0]?.subscribed).toBe(true);
  });

  it("subscribes to league presence and reports online counts", async () => {
    const topic = leagueRealtimeChannel(leagueId, "presence");
    const grant = supabaseGrant(topic);
    const client = new FakeClient();
    const onPresence = vi.fn();

    const handle = await openRealtimePresenceSubscription({
      createClient: () => client,
      fetcher: async () => jsonResponse(grant),
      leagueId,
      now: () => new Date("2026-06-12T00:00:00.000Z"),
      onPresence,
    });

    expect(client.channels).toHaveLength(1);
    expect(client.channels[0]?.topic).toBe(topic);

    client.channels[0]?.transition("SUBSCRIBED");
    expect(client.channels[0]?.trackedPayload).toEqual({
      online_at: "2026-06-12T00:00:00.000Z",
    });
    expect(onPresence).toHaveBeenCalledWith({
      leagueId,
      onlineCount: 1,
      status: "online",
    });

    client.channels[0]?.emitPresence("sync", {
      memberA: [{ online_at: "now" }, { online_at: "also-now" }],
      memberB: [{ online_at: "now" }],
    });
    expect(onPresence).toHaveBeenLastCalledWith({
      leagueId,
      onlineCount: 3,
      status: "online",
    });

    handle.unsubscribe();
    expect(client.removed).toEqual(client.channels);
  });
});
