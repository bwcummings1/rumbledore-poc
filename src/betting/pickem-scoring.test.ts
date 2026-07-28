import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_PICKS_PER_USER,
  rankEntries,
  scorePickWeek,
  toStoredAccuracy,
  WEEKLY_PARTICIPATION_FLOOR,
} from "./pickem-scoring";

/**
 * The worked examples in PROJECT_CONTEXT.md §3.3, pinned as tests.
 *
 * Scoring IS the product here — it decides who wins an inter-league
 * competition — so the arithmetic is verified directly rather than inferred
 * from a fixture league.
 */
describe("Pick 'em absolute-denominator scoring", () => {
  const base = { maxPicksPerUser: DEFAULT_MAX_PICKS_PER_USER, voidPicks: 0 };

  it("normalises league size away", () => {
    // The headline property: a 10-person and a 12-person league that perform
    // equally well score equally, with no tiering.
    const twelve = scorePickWeek({
      ...base,
      correctPicks: 80,
      rosterSize: 12,
      submittedPicks: 120,
    });
    const ten = scorePickWeek({
      ...base,
      correctPicks: 66,
      rosterSize: 10,
      submittedPicks: 100,
    });

    expect(twelve.potentialPicks).toBe(120);
    expect(ten.potentialPicks).toBe(100);
    expect(toStoredAccuracy(twelve.accuracy)).toBeCloseTo(0.6667, 4);
    expect(toStoredAccuracy(ten.accuracy)).toBeCloseTo(0.66, 4);
  });

  it("treats an unsubmitted pick exactly like a wrong one", () => {
    // Both leagues got 80 right. The one that left 12 picks unsubmitted scores
    // identically to the one that submitted all 120 — it simply left points on
    // the table. No penalty formula is needed; the denominator does the work.
    const full = scorePickWeek({
      ...base,
      correctPicks: 80,
      rosterSize: 12,
      submittedPicks: 120,
    });
    const partial = scorePickWeek({
      ...base,
      correctPicks: 80,
      rosterSize: 12,
      submittedPicks: 108,
    });

    expect(partial.accuracy).toBe(full.accuracy);
    expect(partial.scorablePicks).toBe(120);
  });

  it("does not reward a low-volume league with a smaller denominator", () => {
    // The loophole the model exists to close: submit few picks, get most of
    // them right, and claim a high percentage. 60 correct out of 80 submitted
    // is 75% on submissions but 50% here, because the denominator is fixed.
    const lazy = scorePickWeek({
      ...base,
      correctPicks: 60,
      rosterSize: 12,
      submittedPicks: 80,
    });

    expect(lazy.accuracy).toBeCloseTo(0.5, 10);
    expect(lazy.accuracy).not.toBeCloseTo(0.75, 2);
  });

  it("counts a user who submits nothing as a full block of wrong answers", () => {
    // One silent member of a 10-person league costs the league 10 picks.
    const score = scorePickWeek({
      ...base,
      correctPicks: 54,
      rosterSize: 10,
      submittedPicks: 90,
    });
    expect(score.potentialPicks).toBe(100);
    expect(score.accuracy).toBeCloseTo(0.54, 10);
  });

  it("voids pushes out of the denominator rather than grading them wrong", () => {
    // A user allotted 10 picks who pushes 3 is graded out of 7. Grading the
    // pushes incorrect would punish an undecidable outcome (DD-2).
    const score = scorePickWeek({
      correctPicks: 5,
      maxPicksPerUser: 10,
      rosterSize: 1,
      submittedPicks: 7,
      voidPicks: 3,
    });

    expect(score.potentialPicks).toBe(10);
    expect(score.scorablePicks).toBe(7);
    expect(score.accuracy).toBeCloseTo(5 / 7, 10);
    // Voiding must not quietly cost participation either.
    expect(score.participationRate).toBe(1);
    expect(score.isEligibleForWeeklyPrize).toBe(true);
  });

  it("gates weekly eligibility on the participation floor without touching accuracy", () => {
    // 108/120 = exactly the floor -> eligible.
    const atFloor = scorePickWeek({
      ...base,
      correctPicks: 80,
      rosterSize: 12,
      submittedPicks: 108,
    });
    // 107/120 = 89.2% -> not eligible, but accuracy is still recorded.
    const belowFloor = scorePickWeek({
      ...base,
      correctPicks: 80,
      rosterSize: 12,
      submittedPicks: 107,
    });

    expect(WEEKLY_PARTICIPATION_FLOOR).toBe(0.9);
    expect(atFloor.isEligibleForWeeklyPrize).toBe(true);
    expect(belowFloor.isEligibleForWeeklyPrize).toBe(false);
    // The gate governs eligibility only — the score is unaffected.
    expect(belowFloor.accuracy).toBe(atFloor.accuracy);
  });

  it("never reports an accuracy above 1 from inconsistent totals", () => {
    // Defensive: bad input should not corrupt a leaderboard silently.
    const score = scorePickWeek({
      correctPicks: 999,
      maxPicksPerUser: 10,
      rosterSize: 1,
      submittedPicks: 999,
      voidPicks: 0,
    });
    expect(score.accuracy).toBeLessThanOrEqual(1);
  });

  it("handles an empty entry without dividing by zero", () => {
    const score = scorePickWeek({
      correctPicks: 0,
      maxPicksPerUser: 10,
      rosterSize: 0,
      submittedPicks: 0,
      voidPicks: 0,
    });
    expect(score.accuracy).toBe(0);
    expect(score.isEligibleForWeeklyPrize).toBe(false);
  });

  it("surfaces ties as groups instead of picking an arbitrary winner", () => {
    // The prize rule is an even split among tied entries, so the leaderboard
    // must report the tie rather than silently ordering one above the other.
    const ranked = rankEntries([
      { accuracy: 0.6666666, name: "a" },
      { accuracy: 0.7, name: "b" },
      { accuracy: 0.6666667, name: "c" },
    ]);

    expect(ranked[0]?.map((entry) => entry.name)).toEqual(["b"]);
    expect(ranked[1]?.map((entry) => entry.name)?.sort()).toEqual(["a", "c"]);
  });

  it("stores accuracy at 4dp so near-misses do not collapse into false ties", () => {
    expect(toStoredAccuracy(2 / 3)).toBe(0.6667);
    // Entries that genuinely differ in the 4th decimal must stay distinct —
    // that resolution is why the column is DECIMAL(6,4) rather than a coarser
    // type, since a false tie would split a prize neither entry earned.
    expect(toStoredAccuracy(0.66664)).toBe(0.6666);
    expect(toStoredAccuracy(0.66664)).not.toBe(toStoredAccuracy(2 / 3));
    // 79/120 and 80/120 are one pick apart and must not collapse together.
    expect(toStoredAccuracy(79 / 120)).not.toBe(toStoredAccuracy(80 / 120));
  });
});
