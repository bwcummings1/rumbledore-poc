import { describe, expect, it, vi } from "vitest";
import { providerCodeDecodingIssues } from "./decoding";
import {
  encodeSleeperPosition,
  encodeSleeperProTeam,
  encodeSleeperRosterSlot,
  encodeSleeperScoringSetting,
  encodeSleeperTransactionType,
} from "./sleeper/reference-data";

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

  it("keeps Yahoo loud while its dictionary remains unregistered", () => {
    expect(providerCodeDecodingIssues("yahoo", {})).toEqual([
      { provider: "yahoo", reason: "dictionary_missing" },
    ]);
  });

  it("checks registered Sleeper string-code adapters across every kind", () => {
    expect(
      providerCodeDecodingIssues("sleeper", {
        activities: [requiredCode(encodeSleeperTransactionType("trade"))],
        lineupSlots: [requiredCode(encodeSleeperRosterSlot("SUPER_FLEX"))],
        positions: [requiredCode(encodeSleeperPosition("CB"))],
        proTeams: [requiredCode(encodeSleeperProTeam("WAS"))],
        scoringStats: [
          requiredCode(encodeSleeperScoringSetting("idp_tkl_solo")),
        ],
      }),
    ).toEqual([]);
  });

  it("returns dictionary_missing when the Sleeper registry export is removed", async () => {
    vi.resetModules();
    vi.doMock("./sleeper/reference-data", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("./sleeper/reference-data")>();
      return {
        ...actual,
        SLEEPER_PROVIDER_DECODING_DICTIONARY: undefined,
      };
    });

    try {
      const isolated = await import("./decoding");
      expect(isolated.providerCodeDecodingIssues("sleeper", {})).toEqual([
        { provider: "sleeper", reason: "dictionary_missing" },
      ]);
    } finally {
      vi.doUnmock("./sleeper/reference-data");
      vi.resetModules();
    }
  });

  it("attributes synthetic unknown Sleeper slot and position codes exactly", () => {
    const lineupSlotId = requiredCode(encodeSleeperRosterSlot("MYSTERY_SLOT"));
    const positionId = requiredCode(encodeSleeperPosition("MYSTERY_POSITION"));

    expect(
      providerCodeDecodingIssues("sleeper", {
        lineupSlots: [lineupSlotId],
        positions: [positionId],
      }),
    ).toEqual([
      {
        id: lineupSlotId,
        kind: "lineup_slot",
        provider: "sleeper",
        reason: "unknown_code",
      },
      {
        id: positionId,
        kind: "position",
        provider: "sleeper",
        reason: "unknown_code",
      },
    ]);
  });
});

function requiredCode(value: number | undefined): number {
  if (value === undefined) throw new Error("expected a Sleeper adapter code");
  return value;
}
