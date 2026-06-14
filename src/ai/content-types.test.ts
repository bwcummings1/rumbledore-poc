import { describe, expect, it } from "vitest";
import { validateContentStructure } from "./content-types";

const context = {
  league: { name: "Fixture League" },
  teams: [
    {
      losses: 1,
      managerNames: ["Alpha Manager"],
      name: "Alpha Team",
      pointsFor: 120,
      ties: 0,
      wins: 2,
    },
    {
      losses: 2,
      managerNames: ["Beta Manager"],
      name: "Beta Team",
      pointsFor: 90,
      ties: 0,
      wins: 1,
    },
  ],
};

describe("content type templates", () => {
  it("accepts power rankings sized to the league team count", () => {
    expect(
      validateContentStructure({
        contentType: "power_rankings",
        context,
        structure: {
          rankings: [
            {
              delta: 0,
              rank: 1,
              rationale: "Alpha Team has the top record.",
              record: "2-1-0",
              team: "Alpha Team",
            },
            {
              delta: -1,
              rank: 2,
              rationale: "Beta Team is chasing.",
              record: "1-2-0",
              team: "Beta Team",
            },
          ],
          type: "power_rankings",
        },
      }),
    ).toMatchObject({
      rankings: [{ team: "Alpha Team" }, { team: "Beta Team" }],
      type: "power_rankings",
    });
  });

  it("rejects malformed structures before publication", () => {
    expect(() =>
      validateContentStructure({
        contentType: "power_rankings",
        context,
        structure: {
          rankings: [
            {
              delta: 0,
              rank: 1,
              rationale: "Alpha Team has the top record.",
              record: "2-1-0",
              team: "Alpha Team",
            },
          ],
          type: "power_rankings",
        },
      }),
    ).toThrow(/team count/);

    expect(() =>
      validateContentStructure({
        contentType: "awards_superlatives",
        context,
        structure: {
          awards: [
            {
              award: "MVP",
              fact: "Alpha Team has the top record.",
              recipient: "Alpha Manager",
            },
          ],
          type: "awards_superlatives",
        },
      }),
    ).toThrow(/3 to 5/);
  });

  it("accepts spectacle-era structures tied to league entities", () => {
    expect(
      validateContentStructure({
        contentType: "rivalry_piece",
        context,
        structure: {
          history: "Alpha Team and Beta Team keep dragging the room back in.",
          needle: "Alpha Team gets the first needle.",
          score: "Alpha Team leads the fixture scoreboard.",
          stakes: "Beta Team has to answer this week.",
          type: "rivalry_piece",
        },
      }),
    ).toMatchObject({ type: "rivalry_piece" });

    expect(
      validateContentStructure({
        contentType: "milestone_record",
        context,
        structure: {
          legend: "Alpha Team gets the record-book paragraph.",
          math: "Alpha Team cleared 120 points for.",
          newHolder: "Alpha Team",
          previousHolder: "Beta Team",
          record: "Highest weekly score",
          type: "milestone_record",
        },
      }),
    ).toMatchObject({ newHolder: "Alpha Team", type: "milestone_record" });

    expect(
      validateContentStructure({
        contentType: "instigation_column",
        context,
        structure: {
          provocation: "Settle it: Alpha Team or Beta Team?",
          settleItCta: "Vote before kickoff.",
          stakes: "The winner owns the week's argument.",
          twoSides: ["Alpha Team", "Beta Team"],
          type: "instigation_column",
        },
      }),
    ).toMatchObject({ twoSides: ["Alpha Team", "Beta Team"] });

    expect(
      validateContentStructure({
        contentType: "verdict_column",
        context,
        structure: {
          newCanon: "Alpha Team owns the room's ruling.",
          question: "Did Alpha Team settle it?",
          ruling: "The Commissioner rules for Alpha Team.",
          type: "verdict_column",
          vote: "Alpha Team over Beta Team.",
        },
      }),
    ).toMatchObject({ type: "verdict_column" });
  });
});
