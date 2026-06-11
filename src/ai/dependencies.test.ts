// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import type { Db } from "@/db/client";
import { createAiDependencies } from "./dependencies";
import {
  DeterministicEmbeddingProvider,
  MockLlmClient,
  MockWebGrounding,
} from "./mocks";
import {
  AnthropicLlmClient,
  TavilyWebGrounding,
  VoyageEmbeddingProvider,
} from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

describe("createAiDependencies", () => {
  it("keeps the full AI pipeline mocked with zero paid configuration", () => {
    const deps = createAiDependencies({} as Db, parseEnv({}));

    expect(deps.llm).toBeInstanceOf(MockLlmClient);
    expect(deps.web).toBeInstanceOf(MockWebGrounding);
    expect(deps.embeddings).toBeInstanceOf(DeterministicEmbeddingProvider);
  });

  it("selects real Anthropic, Tavily, and Voyage clients when keys are present", () => {
    const deps = createAiDependencies(
      {} as Db,
      parseEnv({
        ANTHROPIC_API_KEY: fakeKey(),
        TAVILY_API_KEY: fakeKey(),
        VOYAGE_API_KEY: fakeKey(),
      }),
    );

    expect(deps.llm).toBeInstanceOf(AnthropicLlmClient);
    expect(deps.web).toBeInstanceOf(TavilyWebGrounding);
    expect(deps.embeddings).toBeInstanceOf(VoyageEmbeddingProvider);
  });
});
