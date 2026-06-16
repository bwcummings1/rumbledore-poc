// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertCassetteSecretFree,
  createVcrReplayer,
  readVcrCassette,
} from "@/testing/vcr";
import { TavilyCentralNewsSource } from "./real";

describe("news provider VCR replay", () => {
  it("replays Tavily central news offline", async () => {
    const cassette = await readVcrCassette(
      new URL("__cassettes__/tavily-central-news.json", import.meta.url),
    );
    const fixtureKey = [
      "real",
      "tavily",
      "provider",
      "value",
      "never",
      "written",
    ].join("-");
    assertCassetteSecretFree(cassette, [fixtureKey]);
    const replayer = createVcrReplayer(cassette, { mode: "replay" });
    const source = new TavilyCentralNewsSource({
      apiKey: fixtureKey,
      client: {
        search: (query: string, options?: unknown) =>
          replayer.replay({
            method: "tavily.search",
            options,
            query,
          }),
      },
    });

    await expect(
      source.fetch({
        limit: 2,
        now: new Date("2026-06-16T00:00:00.000Z"),
        topic: "nfl fantasy injuries",
      }),
    ).resolves.toEqual([
      {
        body: "Replay central news body with general fantasy-football context and no league-private facts.",
        canonicalUrl: "https://fantasy.example.com/news/replay-update",
        id: expect.stringMatching(/^tavily:/),
        publishedAt: new Date("2026-06-15T14:30:00.000Z"),
        source: "fantasy.example.com",
        sourceType: "web",
        sourceUrl: "https://fantasy.example.com/news/replay-update",
        summary: "Replay central news summary.",
        title: "Replay central fantasy update",
        topics: ["nfl", "fantasy"],
      },
    ]);
  });
});
