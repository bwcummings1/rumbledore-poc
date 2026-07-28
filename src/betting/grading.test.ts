import { describe, expect, it } from "vitest";
import { gradeSelection, toPickOutcome } from "./grading";
import type { EventResult } from "./interfaces";

/**
 * Grading decides who wins an inter-league competition, so the math is tested
 * directly rather than inferred through a fixture league.
 *
 * The push cases carry the most weight: a push wrongly graded as a loss takes
 * points off a user for an outcome that was never decidable, and under
 * absolute-denominator scoring that error propagates straight into a league's
 * accuracy.
 */

function result(overrides: Partial<EventResult> = {}): EventResult {
  return {
    awayScore: 17,
    finalStatus: "final",
    homeScore: 24,
    playerStats: [],
    provider: "mock",
    ...overrides,
  } as EventResult;
}

describe("selection grading", () => {
  it("grades a moneyline by the winner", () => {
    // Home won 24-17.
    expect(
      gradeSelection(
        { lockedLine: null, marketType: "moneyline", selection: "home" },
        result(),
      )?.status,
    ).toBe("won");
    expect(
      gradeSelection(
        { lockedLine: null, marketType: "moneyline", selection: "away" },
        result(),
      )?.status,
    ).toBe("lost");
  });

  it("treats a drawn moneyline as a push", () => {
    expect(
      gradeSelection(
        { lockedLine: null, marketType: "moneyline", selection: "home" },
        result({ awayScore: 20, homeScore: 20 }),
      )?.status,
    ).toBe("push");
  });

  it("applies the locked spread to the picked side", () => {
    // Home won by 7. Laying 3.5 still covers; laying 10.5 does not.
    expect(
      gradeSelection(
        { lockedLine: -3.5, marketType: "spread", selection: "home" },
        result(),
      )?.status,
    ).toBe("won");
    expect(
      gradeSelection(
        { lockedLine: -10.5, marketType: "spread", selection: "home" },
        result(),
      )?.status,
    ).toBe("lost");
    // Taking +10.5 as the away side covers a 7-point loss.
    expect(
      gradeSelection(
        { lockedLine: 10.5, marketType: "spread", selection: "away" },
        result(),
      )?.status,
    ).toBe("won");
  });

  it("pushes when the spread lands exactly on the number", () => {
    // Home won by exactly 7 laying exactly 7 — the canonical push, and the
    // reason whole-number lines must not be penalised.
    expect(
      gradeSelection(
        { lockedLine: -7, marketType: "spread", selection: "home" },
        result(),
      )?.status,
    ).toBe("push");
  });

  it("pushes when a total lands exactly on the number", () => {
    // 24 + 17 = 41.
    expect(
      gradeSelection(
        { lockedLine: 41, marketType: "total", selection: "over" },
        result(),
      )?.status,
    ).toBe("push");
    expect(
      gradeSelection(
        { lockedLine: 40.5, marketType: "total", selection: "over" },
        result(),
      )?.status,
    ).toBe("won");
    expect(
      gradeSelection(
        { lockedLine: 41.5, marketType: "total", selection: "over" },
        result(),
      )?.status,
    ).toBe("lost");
  });

  it("survives floating-point noise on a push", () => {
    // Numerics round-trip imprecisely; an exact === 0 comparison would miss
    // this push by a hair and grade it a loss.
    expect(
      gradeSelection(
        { lockedLine: 41.000000000001, marketType: "total", selection: "over" },
        result(),
      )?.status,
    ).toBe("push");
  });

  it("grades a player prop against the player's stat", () => {
    const withStats = result({
      playerStats: [{ playerId: "p1", stats: { receiving_yards: 88 } }],
    } as Partial<EventResult>);

    expect(
      gradeSelection(
        {
          lockedLine: 75.5,
          marketSubject: "p1",
          marketType: "player_prop",
          propType: "receiving_yards",
          selection: "over",
        },
        withStats,
      )?.status,
    ).toBe("won");
  });

  it("voids a prop whose stat is missing rather than guessing", () => {
    expect(
      gradeSelection(
        {
          lockedLine: 75.5,
          marketSubject: "absent-player",
          marketType: "player_prop",
          propType: "receiving_yards",
          selection: "over",
        },
        result(),
      )?.status,
    ).toBe("void");
  });

  it("returns null — not void — while the event is unfinished", () => {
    // The distinction is load-bearing: null means "ask again later", void means
    // "this will never resolve". Collapsing them would either abandon a live
    // game or poll a canceled one forever.
    expect(
      gradeSelection(
        { lockedLine: null, marketType: "moneyline", selection: "home" },
        result({ finalStatus: "in_progress" }),
      ),
    ).toBeNull();
  });

  it("voids a postponed or canceled event", () => {
    for (const finalStatus of ["postponed", "canceled"] as const) {
      expect(
        gradeSelection(
          { lockedLine: null, marketType: "moneyline", selection: "home" },
          result({ finalStatus }),
        )?.status,
      ).toBe("void");
    }
  });

  it("voids a final result with no score rather than grading everyone wrong", () => {
    expect(
      gradeSelection(
        { lockedLine: null, marketType: "moneyline", selection: "home" },
        result({ awayScore: null, homeScore: null }),
      )?.status,
    ).toBe("void");
  });
});

describe("pick outcome mapping", () => {
  it("maps a push to void, NOT incorrect", () => {
    // The single most consequential mapping in the module. Under
    // absolute-denominator scoring a void is subtracted from the denominator,
    // so the user is neither rewarded nor punished for an undecidable outcome.
    expect(toPickOutcome("push")).toBe("void");
    expect(toPickOutcome("push")).not.toBe("incorrect");
  });

  it("maps wins and losses straight through", () => {
    expect(toPickOutcome("won")).toBe("correct");
    expect(toPickOutcome("lost")).toBe("incorrect");
    expect(toPickOutcome("void")).toBe("void");
  });
});
