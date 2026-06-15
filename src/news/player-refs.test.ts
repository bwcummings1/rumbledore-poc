// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDictionaryPlayerRefExtractor } from "./player-refs";

describe("createDictionaryPlayerRefExtractor", () => {
  it("extracts normalized provider player refs from exact text mentions", async () => {
    const extractor = createDictionaryPlayerRefExtractor([
      {
        aliases: ["AJ Brown"],
        label: "A.J. Brown",
        provider: "ESPN",
        providerId: "3918298",
      },
      {
        label: "Kenneth Walker III",
        provider: "sleeper",
        providerId: "8155",
      },
    ]);

    await expect(
      extractor.extract({
        body: "The practice report also mentions Kenneth Walker in passing.",
        summary: "A.J. Brown is expected to return to practice.",
        title: "Fantasy injury roundup",
        topics: ["fantasy"],
      }),
    ).resolves.toEqual([
      {
        label: "A.J. Brown",
        provider: "espn",
        providerId: "3918298",
      },
      {
        label: "Kenneth Walker III",
        provider: "sleeper",
        providerId: "8155",
      },
    ]);
  });

  it("does not match partial names inside unrelated words", async () => {
    const extractor = createDictionaryPlayerRefExtractor([
      {
        label: "Joe Mixon",
        provider: "espn",
        providerId: "3116385",
      },
    ]);

    await expect(
      extractor.extract({
        summary: "Coordinator notes the offense keeps mixing personnel.",
        title: "Practice report",
      }),
    ).resolves.toEqual([]);
  });
});
