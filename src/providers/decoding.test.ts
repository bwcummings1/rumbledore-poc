import { describe, expect, it } from "vitest";
import { providerCodeDecodingIssues } from "./decoding";

describe("providerCodeDecodingIssues", () => {
  it("keeps registered ESPN dictionary coverage passing", () => {
    expect(
      providerCodeDecodingIssues("espn", {
        activities: [180, 239],
        lineupSlots: [0, 23],
        positions: [1, 16],
        proTeams: [0, 33],
        scoringStats: [3, 205],
      }),
    ).toEqual([]);
  });

  it("attributes an unknown ESPN code to its registered dictionary", () => {
    expect(providerCodeDecodingIssues("espn", { positions: [999] })).toEqual([
      {
        id: 999,
        kind: "position",
        provider: "espn",
        reason: "unknown_code",
      },
    ]);
  });

  it.each(["sleeper", "yahoo"] as const)(
    "fails loudly when %s has no registered dictionary",
    (provider) => {
      expect(providerCodeDecodingIssues(provider, {})).toEqual([
        { provider, reason: "dictionary_missing" },
      ]);
    },
  );
});
