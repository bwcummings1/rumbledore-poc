// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  GuardedEmbeddingProvider,
  GuardedLlmClient,
  GuardedWebGrounding,
} from "@/ai/dependencies";
import type { LlmGenerateRequest } from "@/ai/interfaces";
import { MockLlmClient, MockWebGrounding } from "@/ai/mocks";
import { DEFAULT_TONE_PROFILES, DEFAULT_TONE_VERSION } from "@/ai/personas";
import {
  AnthropicLlmClient,
  anthropicModelForTier,
  TavilyWebGrounding,
  VoyageEmbeddingProvider,
} from "@/ai/real";
import {
  GuardedOddsProvider,
  GuardedResultsProvider,
} from "@/betting/dependencies";
import { MockOddsProvider, MockResultsProvider } from "@/betting/mocks";
import {
  SportsDataIoResultsProvider,
  TheOddsApiProvider,
} from "@/betting/real";
import {
  DEFAULT_SPEND_GUARD_CAPS,
  type Env,
  type PaidService,
  parseEnv,
  type ServiceConfig,
} from "@/core/env/schema";
import { MemorySpendCounterStore, SpendGuard } from "@/core/spend-guard";
import { DeterministicEmbeddingProvider } from "../ai/mocks";

const liveIt = process.env.LIVE_SMOKE === "1" ? it : it.skip;

function liveEnv(): Env {
  return parseEnv(process.env);
}

function requireRealService(
  env: Env,
  service: PaidService,
): Extract<ServiceConfig, { mock: false }> {
  const config = env.services[service];
  if (config.mock) {
    throw new Error(
      `LIVE_SMOKE=1 requires ${service} to resolve real. Export its key and do not force MOCK_* true.`,
    );
  }
  return config;
}

function memoryGuard(env: Env): SpendGuard {
  return new SpendGuard({
    config: {
      ...env.spendGuard,
      providers: {
        anthropic: { ...DEFAULT_SPEND_GUARD_CAPS.anthropic },
        odds: { ...DEFAULT_SPEND_GUARD_CAPS.odds },
        sportsdataio: { ...DEFAULT_SPEND_GUARD_CAPS.sportsdataio },
        tavily: { ...DEFAULT_SPEND_GUARD_CAPS.tavily },
        voyage: { ...DEFAULT_SPEND_GUARD_CAPS.voyage },
      },
    },
    store: new MemorySpendCounterStore(),
  });
}

function requestFor(
  persona: LlmGenerateRequest["persona"],
): LlmGenerateRequest {
  return {
    attempt: 1,
    contentType: "matchup_preview",
    context: {
      league: {
        currentScoringPeriod: 1,
        id: "00000000-0000-0000-0000-000000000001",
        name: "Private Fixture League",
        providerLeagueId: "95050",
        scoringType: "H2H_POINTS",
        season: 2026,
        status: "in_season",
      },
      arena: {
        computedAt: null,
        fieldLeader: null,
        headToHead: null,
        leagueStanding: null,
        movers: { fallers: [], risers: [] },
        season: null,
        topLeagueStandings: [],
      },
      authenticity: {
        canonLore: [],
        entityTokens: [],
        lore: {
          canon: [],
          disputed: [],
          pending: [],
          refuted: [],
        },
        people: [],
        rivalries: [],
      },
      memory: [],
      persona: {
        beat: "League-official framing",
        enabled: true,
        id: "00000000-0000-0000-0000-000000000002",
        maxWords: 180,
        minWords: 80,
        name: "Commissioner",
        performsWhen: ["weekly-preview"],
        persona,
        pointOfView: "Warm and authoritative",
        promptTemplate: "Frame the week.",
        purpose: "League framing",
        tone: "warm and direct",
        toneProfile: DEFAULT_TONE_PROFILES[persona],
        toneUpdatedAt: new Date("2026-06-11T00:00:00.000Z"),
        toneUpdatedBy: null,
        toneVersion: DEFAULT_TONE_VERSION,
      },
      priorPosts: [],
      records: [],
      teams: [
        {
          losses: 1,
          managerNames: ["Fixture Manager"],
          name: "Fixture Team",
          pointsAgainst: 100,
          pointsFor: 120,
          ties: 0,
          wins: 2,
        },
      ],
      trigger: {
        correction: null,
        instigation: null,
        loreClaim: null,
        poll: null,
      },
    },
    newsItems: [],
    persona,
    prompt: {
      prompt: "stable\nvolatile",
      systemPrefix: '{"league":"fixture","teams":["Fixture Team"]}',
      volatileContext:
        '{"untrustedNews":"<untrusted_news>[]</untrusted_news>"}',
    },
  };
}

describe("gated live provider smoke", () => {
  liveIt(
    "generates one valid Anthropic blog draft through the spend guard",
    async () => {
      const env = liveEnv();
      const service = requireRealService(env, "anthropic");
      const client = new GuardedLlmClient(
        new AnthropicLlmClient({
          apiKey: service.apiKey,
          modelForPersona: anthropicModelForTier(env.ai.anthropicModelTier),
        }),
        new MockLlmClient(),
        memoryGuard(env),
      );

      await expect(
        client.generate(requestFor("commissioner")),
      ).resolves.toMatchObject({
        contentType: "matchup_preview",
      });
    },
    60_000,
  );

  liveIt(
    "returns one Voyage embedding through the spend guard",
    async () => {
      const env = liveEnv();
      const service = requireRealService(env, "voyage");
      const provider = new GuardedEmbeddingProvider(
        new VoyageEmbeddingProvider({
          apiKey: service.apiKey,
          model: env.ai.voyageEmbeddingModel,
        }),
        new DeterministicEmbeddingProvider(),
        memoryGuard(env),
      );

      const embedding = await provider.embed("Rumbledore live smoke vector");
      expect(embedding.length).toBeGreaterThan(0);
      expect(embedding.every((value) => typeof value === "number")).toBe(true);
    },
    60_000,
  );

  liveIt(
    "fetches Tavily grounding results through the spend guard",
    async () => {
      const env = liveEnv();
      const service = requireRealService(env, "tavily");
      const grounding = new GuardedWebGrounding(
        new TavilyWebGrounding({
          apiKey: service.apiKey,
          maxResults: 1,
        }),
        new MockWebGrounding(),
        memoryGuard(env),
      );

      await expect(
        grounding.fetch({
          leagueId: "00000000-0000-0000-0000-000000000001",
          leagueName: "Live Smoke Fixture",
          persona: "analyst",
          triggerKey: "live-smoke",
        }),
      ).resolves.toEqual(expect.any(Array));
    },
    60_000,
  );

  liveIt(
    "fetches a parseable The Odds API slate through the spend guard",
    async () => {
      const env = liveEnv();
      const service = requireRealService(env, "odds");
      const provider = new GuardedOddsProvider(
        new TheOddsApiProvider({ apiKey: service.apiKey }),
        new MockOddsProvider(),
        memoryGuard(env),
      );

      await expect(
        provider.listEvents({ now: new Date(), sport: "nfl" }),
      ).resolves.toEqual(expect.any(Array));
    },
    60_000,
  );

  liveIt(
    "fetches one SportsDataIO result through the spend guard",
    async () => {
      const env = liveEnv();
      const service = requireRealService(env, "sportsdataio");
      const provider = new GuardedResultsProvider(
        new SportsDataIoResultsProvider({ apiKey: service.apiKey }),
        new MockResultsProvider(),
        memoryGuard(env),
      );

      await expect(
        provider.getEventResult({
          event: {
            awayTeam: process.env.LIVE_SMOKE_SPORTSDATAIO_AWAY ?? "DAL",
            homeTeam: process.env.LIVE_SMOKE_SPORTSDATAIO_HOME ?? "PHI",
            id: "live-smoke-event",
            provider: "sportsdataio",
            providerEventId:
              process.env.LIVE_SMOKE_SPORTSDATAIO_EVENT_ID ??
              "20250904-DAL-PHI",
            sport: "nfl",
            startTime: new Date(
              process.env.LIVE_SMOKE_SPORTSDATAIO_START ??
                "2025-09-04T20:20:00.000Z",
            ),
          },
        }),
      ).resolves.toMatchObject({
        provider: "sportsdataio",
      });
    },
    60_000,
  );
});
