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
});
