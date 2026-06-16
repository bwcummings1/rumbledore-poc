// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createLogger } from "@/core/logging";
import { MemorySpendCounterStore, SpendGuard } from "@/core/spend-guard";
import type { Db } from "@/db/client";
import { CompositeCentralNewsSource } from "./composite";
import {
  createNewsDependencies,
  GuardedCentralNewsSource,
} from "./dependencies";
import {
  MockRssCentralNewsSource,
  MockWebGroundingCentralNewsSource,
} from "./mocks";
import { RssCentralNewsSource, TavilyCentralNewsSource } from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

function spendGuard() {
  return new SpendGuard({
    config: parseEnv({}).spendGuard,
    store: new MemorySpendCounterStore(),
  });
}

function testLogger() {
  return createLogger({ sink: () => undefined });
}

describe("createNewsDependencies", () => {
  it("keeps central news mocked with zero paid configuration", () => {
    const deps = createNewsDependencies({} as Db, parseEnv({}));

    expect(deps.source).toBeInstanceOf(CompositeCentralNewsSource);
    expect((deps.source as CompositeCentralNewsSource).sources).toEqual([
      expect.any(MockWebGroundingCentralNewsSource),
      expect.any(MockRssCentralNewsSource),
    ]);
  });

  it("selects Tavily plus mocked RSS for central news when only Tavily is configured", () => {
    const deps = createNewsDependencies(
      {} as Db,
      parseEnv({ TAVILY_API_KEY: fakeKey() }),
    );

    expect((deps.source as CompositeCentralNewsSource).sources).toEqual([
      expect.any(GuardedCentralNewsSource),
      expect.any(MockRssCentralNewsSource),
    ]);
    const [grounding] = (deps.source as CompositeCentralNewsSource).sources;
    expect((grounding as GuardedCentralNewsSource).real).toBeInstanceOf(
      TavilyCentralNewsSource,
    );
  });

  it("keeps Tavily grounding mocked when forced even if its key is present", () => {
    const deps = createNewsDependencies(
      {} as Db,
      parseEnv({
        MOCK_TAVILY: "true",
        TAVILY_API_KEY: fakeKey(),
      }),
    );

    expect((deps.source as CompositeCentralNewsSource).sources).toEqual([
      expect.any(MockWebGroundingCentralNewsSource),
      expect.any(MockRssCentralNewsSource),
    ]);
  });

  it("selects configured RSS feeds alongside mocked grounding", () => {
    const deps = createNewsDependencies(
      {} as Db,
      parseEnv({
        NEWS_RSS_FEED_URLS: "https://feeds.example.invalid/fantasy.xml",
      }),
    );

    expect((deps.source as CompositeCentralNewsSource).sources).toEqual([
      expect.any(MockWebGroundingCentralNewsSource),
      expect.any(RssCentralNewsSource),
    ]);
  });
});

describe("GuardedCentralNewsSource", () => {
  it("falls back to the mock source when Tavily central news is unavailable", async () => {
    const fallbackItem = {
      body: "Mock central fallback body.",
      id: "mock-central-fallback",
      publishedAt: new Date("2026-06-16T00:00:00.000Z"),
      source: "Mock Wire",
      sourceUrl: "https://news.example.invalid/mock",
      summary: "Mock central fallback summary.",
      title: "Mock central fallback",
      topics: ["fantasy"],
    };
    const source = new GuardedCentralNewsSource(
      {
        fetch: async () => {
          // ubs:ignore — interface test double named fetch; it performs no network request.
          throw new Error("Tavily unavailable");
        },
      },
      {
        fetch: async () => [fallbackItem],
      },
      spendGuard(),
      testLogger(),
    );

    await expect(
      source.fetch({
        limit: 1,
        now: new Date("2026-06-16T00:00:00.000Z"),
        topic: "fantasy",
      }),
    ).resolves.toEqual([fallbackItem]);
  });
});
