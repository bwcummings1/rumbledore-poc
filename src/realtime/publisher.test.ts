import { describe, expect, it } from "vitest";
import {
  arenaLeaderboardChannel,
  leagueBlogChannel,
  leagueHistoryChannel,
  leagueLeaderboardChannel,
  leagueScoresChannel,
  REALTIME_EVENTS,
} from "./interfaces";
import { InProcessRealtimePublisher } from "./mocks";
import { SupabaseRealtimePublisher } from "./publisher";

function okResponse(): Response {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  try {
    return JSON.parse(String(body));
  } catch (cause) {
    throw new Error("Expected realtime request body to be JSON", { cause });
  }
}

describe("realtime publisher", () => {
  it("uses the stable per-league blog channel name", () => {
    expect(leagueBlogChannel("league-123")).toBe("league:league-123:blog");
  });

  it("uses the stable per-league scores channel name", () => {
    expect(leagueScoresChannel("league-123")).toBe("league:league-123:scores");
  });

  it("uses the stable per-league history channel name", () => {
    expect(leagueHistoryChannel("league-123")).toBe(
      "league:league-123:history",
    );
  });

  it("uses the stable leaderboard channel names", () => {
    expect(leagueLeaderboardChannel("league-123")).toBe(
      "league:league-123:leaderboard",
    );
    expect(arenaLeaderboardChannel()).toBe("arena:leaderboard");
  });

  it("posts blog.published payloads to Supabase private broadcast", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const publisher = new SupabaseRealtimePublisher({
      apiKey: "supabase-service-key", // ubs:ignore — fake fixture value
      fetchFn: async (input, init) => {
        calls.push({ input, init });
        return okResponse();
      },
      url: "https://project.supabase.co/",
    });

    await publisher.publishLeagueBlogPublished({
      at: "2026-06-11T12:00:01.000Z",
      contentItemId: "post-1",
      leagueId: "league-123",
      persona: "commissioner",
      publishedAt: "2026-06-11T12:00:00.000Z",
      title: "Commissioner note",
      triggerKey: "weekly:1",
      type: "blog.published",
      v: 1,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected fetch call");

    expect(call.input.toString()).toBe(
      "https://project.supabase.co/realtime/v1/api/broadcast/league%3Aleague-123%3Ablog/events/blog.published?private=true",
    );
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toEqual({
      apikey: "supabase-service-key", // ubs:ignore — fake fixture value
      "Content-Type": "application/json",
    });
    expect(parseJsonBody(call.init?.body)).toMatchObject({
      contentItemId: "post-1",
      leagueId: "league-123",
      type: "blog.published",
      v: 1,
    });
  });

  it("throws when Supabase rejects the broadcast", async () => {
    const publisher = new SupabaseRealtimePublisher({
      apiKey: "supabase-service-key", // ubs:ignore — fake fixture value
      fetchFn: async () => new Response("nope", { status: 500 }),
      url: "https://project.supabase.co",
    });

    await expect(
      publisher.publishLeagueBlogPublished({
        at: "2026-06-11T12:00:01.000Z",
        contentItemId: "post-1",
        leagueId: "league-123",
        persona: "commissioner",
        publishedAt: "2026-06-11T12:00:00.000Z",
        title: "Commissioner note",
        triggerKey: "weekly:1",
        type: "blog.published",
        v: 1,
      }),
    ).rejects.toMatchObject({
      code: "REALTIME_BROADCAST_FAILED",
      status: 502,
    });
  });

  it("posts scores.updated payloads to Supabase private broadcast", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const publisher = new SupabaseRealtimePublisher({
      apiKey: "supabase-service-key", // ubs:ignore — fake fixture value
      fetchFn: async (input, init) => {
        calls.push({ input, init });
        return okResponse();
      },
      url: "https://project.supabase.co/",
    });

    await publisher.publishLeagueScoresUpdated({
      at: "2026-06-12T12:00:01.000Z",
      leagueId: "league-123",
      matchupIds: ["matchup-1", "matchup-2"],
      scoringPeriod: 3,
      type: REALTIME_EVENTS.scoresUpdated,
      v: 1,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected fetch call");

    expect(call.input.toString()).toBe(
      "https://project.supabase.co/realtime/v1/api/broadcast/league%3Aleague-123%3Ascores/events/scores.updated?private=true",
    );
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toEqual({
      apikey: "supabase-service-key", // ubs:ignore — fake fixture value
      "Content-Type": "application/json",
    });
    expect(parseJsonBody(call.init?.body)).toMatchObject({
      leagueId: "league-123",
      matchupIds: ["matchup-1", "matchup-2"],
      scoringPeriod: 3,
      type: "scores.updated",
      v: 1,
    });
  });

  it("posts history.import.progress payloads to Supabase private broadcast", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const publisher = new SupabaseRealtimePublisher({
      apiKey: "supabase-service-key", // ubs:ignore — fake fixture value
      fetchFn: async (input, init) => {
        calls.push({ input, init });
        return okResponse();
      },
      url: "https://project.supabase.co/",
    });

    await publisher.publishLeagueHistoryImportProgress({
      at: "2026-06-15T12:00:01.000Z",
      currentSeason: 2026,
      importedSeasons: [2025],
      lastCompletedSeason: 2025,
      leagueId: "league-123",
      nextSeason: 2024,
      provider: "espn",
      providerLeagueId: "95050",
      requestedSeasons: [2025, 2024],
      seasonsCompleted: 1,
      seasonsTotal: 2,
      skippedSeasons: [],
      status: "running",
      type: REALTIME_EVENTS.historyImportProgress,
      v: 1,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected fetch call");

    expect(call.input.toString()).toBe(
      "https://project.supabase.co/realtime/v1/api/broadcast/league%3Aleague-123%3Ahistory/events/history.import.progress?private=true",
    );
    expect(parseJsonBody(call.init?.body)).toMatchObject({
      importedSeasons: [2025],
      leagueId: "league-123",
      provider: "espn",
      providerLeagueId: "95050",
      type: "history.import.progress",
      v: 1,
    });
  });

  it("posts league.leaderboard.updated payloads to Supabase private broadcast", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const publisher = new SupabaseRealtimePublisher({
      apiKey: "supabase-service-key", // ubs:ignore — fake fixture value
      fetchFn: async (input, init) => {
        calls.push({ input, init });
        return okResponse();
      },
      url: "https://project.supabase.co/",
    });

    await publisher.publishLeagueLeaderboardUpdated({
      at: "2026-06-15T12:00:01.000Z",
      bankrollWeekId: "week-1",
      leagueId: "league-123",
      type: REALTIME_EVENTS.leagueLeaderboardUpdated,
      v: 1,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected fetch call");

    expect(call.input.toString()).toBe(
      "https://project.supabase.co/realtime/v1/api/broadcast/league%3Aleague-123%3Aleaderboard/events/league.leaderboard.updated?private=true",
    );
    expect(parseJsonBody(call.init?.body)).toMatchObject({
      bankrollWeekId: "week-1",
      leagueId: "league-123",
      type: "league.leaderboard.updated",
      v: 1,
    });
  });

  it("posts arena leaderboard and swing payloads to Supabase private broadcast", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const publisher = new SupabaseRealtimePublisher({
      apiKey: "supabase-service-key", // ubs:ignore — fake fixture value
      fetchFn: async (input, init) => {
        calls.push({ input, init });
        return okResponse();
      },
      url: "https://project.supabase.co/",
    });

    await publisher.publishArenaLeaderboardUpdated({
      at: "2026-06-15T12:00:01.000Z",
      seasonId: "season-1",
      type: REALTIME_EVENTS.arenaLeaderboardUpdated,
      v: 1,
    });
    await publisher.publishArenaStandingsSwing({
      at: "2026-06-15T12:00:02.000Z",
      computedAt: "2026-06-15T12:00:00.000Z",
      seasonId: "season-1",
      swings: [
        {
          kind: "league",
          leagueId: "league-123",
          netPnlCents: 2500,
          newRank: 1,
          oldRank: 2,
          rankDelta: 1,
          subjectId: "league-123",
          userId: null,
        },
      ],
      type: REALTIME_EVENTS.arenaStandingsSwing,
      v: 1,
    });

    expect(calls.map((call) => call.input.toString())).toEqual([
      "https://project.supabase.co/realtime/v1/api/broadcast/arena%3Aleaderboard/events/arena.leaderboard.updated?private=true",
      "https://project.supabase.co/realtime/v1/api/broadcast/arena%3Aleaderboard/events/arena.standings.swing?private=true",
    ]);
    expect(parseJsonBody(calls[1]?.init?.body)).toMatchObject({
      seasonId: "season-1",
      swings: [
        {
          kind: "league",
          newRank: 1,
          oldRank: 2,
          rankDelta: 1,
          subjectId: "league-123",
        },
      ],
      type: "arena.standings.swing",
      v: 1,
    });
  });

  it("delivers scores.updated payloads through the in-process publisher", async () => {
    const publisher = new InProcessRealtimePublisher();
    const received: unknown[] = [];
    const unsubscribe = publisher.subscribe(
      leagueScoresChannel("league-123"),
      REALTIME_EVENTS.scoresUpdated,
      (message) => {
        received.push(message);
      },
    );

    await publisher.publishLeagueScoresUpdated({
      at: "2026-06-12T12:00:01.000Z",
      leagueId: "league-123",
      matchupIds: ["matchup-1"],
      scoringPeriod: 3,
      type: REALTIME_EVENTS.scoresUpdated,
      v: 1,
    });

    expect(received).toEqual([
      {
        event: REALTIME_EVENTS.scoresUpdated,
        payload: {
          at: "2026-06-12T12:00:01.000Z",
          leagueId: "league-123",
          matchupIds: ["matchup-1"],
          scoringPeriod: 3,
          type: "scores.updated",
          v: 1,
        },
        topic: "league:league-123:scores",
      },
    ]);

    unsubscribe();
    await publisher.publishLeagueScoresUpdated({
      at: "2026-06-12T12:01:01.000Z",
      leagueId: "league-123",
      matchupIds: ["matchup-2"],
      scoringPeriod: 3,
      type: REALTIME_EVENTS.scoresUpdated,
      v: 1,
    });

    expect(received).toHaveLength(1);
  });

  it("delivers history.import.progress payloads through the in-process publisher", async () => {
    const publisher = new InProcessRealtimePublisher();
    const received: unknown[] = [];
    const unsubscribe = publisher.subscribe(
      leagueHistoryChannel("league-123"),
      REALTIME_EVENTS.historyImportProgress,
      (message) => {
        received.push(message);
      },
    );

    await publisher.publishLeagueHistoryImportProgress({
      at: "2026-06-15T12:00:01.000Z",
      currentSeason: 2026,
      importedSeasons: [2025],
      lastCompletedSeason: 2025,
      leagueId: "league-123",
      nextSeason: 2024,
      provider: "espn",
      providerLeagueId: "95050",
      requestedSeasons: [2025, 2024],
      seasonsCompleted: 1,
      seasonsTotal: 2,
      skippedSeasons: [],
      status: "running",
      type: REALTIME_EVENTS.historyImportProgress,
      v: 1,
    });

    expect(received).toEqual([
      {
        event: REALTIME_EVENTS.historyImportProgress,
        payload: expect.objectContaining({
          importedSeasons: [2025],
          leagueId: "league-123",
          providerLeagueId: "95050",
          type: "history.import.progress",
        }),
        topic: "league:league-123:history",
      },
    ]);

    unsubscribe();
  });

  it("delivers arena swing payloads through the in-process publisher", async () => {
    const publisher = new InProcessRealtimePublisher();
    const received: unknown[] = [];
    const unsubscribe = publisher.subscribe(
      arenaLeaderboardChannel(),
      REALTIME_EVENTS.arenaStandingsSwing,
      (message) => {
        received.push(message);
      },
    );

    await publisher.publishArenaStandingsSwing({
      at: "2026-06-15T12:00:02.000Z",
      computedAt: "2026-06-15T12:00:00.000Z",
      seasonId: "season-1",
      swings: [
        {
          kind: "individual",
          leagueId: null,
          netPnlCents: 1200,
          newRank: 3,
          oldRank: 8,
          rankDelta: 5,
          subjectId: "user-1",
          userId: "user-1",
        },
      ],
      type: REALTIME_EVENTS.arenaStandingsSwing,
      v: 1,
    });

    expect(received).toEqual([
      {
        event: REALTIME_EVENTS.arenaStandingsSwing,
        payload: expect.objectContaining({
          seasonId: "season-1",
          swings: [
            expect.objectContaining({
              newRank: 3,
              oldRank: 8,
              rankDelta: 5,
              subjectId: "user-1",
            }),
          ],
          type: "arena.standings.swing",
        }),
        topic: "arena:leaderboard",
      },
    ]);

    unsubscribe();
  });
});
