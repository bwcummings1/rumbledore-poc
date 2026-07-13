import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildNormalizedSeasonBundle,
  NORMALIZED_ERA_POSITION_VOCABULARIES,
  type NormalizedSeasonShape,
  normalizedSeasonBundleArbitrary,
  normalizedSeasonShapeArbitrary,
} from "./arbitraries";

const PROPERTY_SEED = 0x47b;

function shape(
  overrides: Partial<NormalizedSeasonShape> = {},
): NormalizedSeasonShape {
  return {
    caseId: 47,
    draft: true,
    era: "mixed",
    leagueSize: 8,
    nameStyle: "ascii",
    ownerOverlap: "none",
    playerDepth: true,
    playersPerTeam: 5,
    playoffMatchupPeriodLength: 1,
    playoffRounds: 2,
    playoffTeamCount: 4,
    regularSeasonWeeks: 12,
    season: 2026,
    statBreakdowns: true,
    transactions: true,
    zeroScoreWeek: null,
    ...overrides,
  };
}

describe("normalized schema arbitraries", () => {
  it("generates relationally consistent season bundles for 4-20 teams", () => {
    fc.assert(
      fc.property(normalizedSeasonShapeArbitrary, (generatedShape) => {
        const bundle = buildNormalizedSeasonBundle(generatedShape);
        const teamIds = new Set(bundle.teams.map((team) => team.providerId));
        const memberIds = new Set(
          bundle.members.map((member) => member.providerId),
        );

        expect(bundle.league.size).toBe(generatedShape.leagueSize);
        expect(bundle.teams).toHaveLength(generatedShape.leagueSize);
        expect(generatedShape.leagueSize).toBeGreaterThanOrEqual(4);
        expect(generatedShape.leagueSize).toBeLessThanOrEqual(20);
        expect(bundle.league.postseason).toMatchObject({
          matchupPeriodCount: generatedShape.regularSeasonWeeks,
          playoffMatchupPeriodLength: generatedShape.playoffMatchupPeriodLength,
          playoffTeamCount: generatedShape.playoffTeamCount,
        });
        expect(
          bundle.teams.every((team) =>
            team.ownerMemberIds.every((memberId) => memberIds.has(memberId)),
          ),
        ).toBe(true);
        expect(
          bundle.matchups.every(
            (matchup) =>
              teamIds.has(matchup.homeTeamRef.providerId) &&
              (!matchup.awayTeamRef ||
                teamIds.has(matchup.awayTeamRef.providerId)),
          ),
        ).toBe(true);
        expect(
          (bundle.rosters ?? []).every((roster) =>
            teamIds.has(roster.teamRef.providerId),
          ),
        ).toBe(true);
        expect(
          (bundle.draftPicks ?? []).every((pick) =>
            teamIds.has(pick.teamRef.providerId),
          ),
        ).toBe(true);
      }),
      { numRuns: 75, seed: PROPERTY_SEED },
    );
  });

  it("materializes every required sparse, era, identity, name, and score class", () => {
    const sparse = buildNormalizedSeasonBundle(
      shape({
        draft: false,
        playerDepth: false,
        statBreakdowns: false,
        transactions: false,
      }),
    );
    expect(sparse).toMatchObject({
      draftPicks: undefined,
      players: undefined,
      rosters: undefined,
      transactions: [],
    });

    const legacy = buildNormalizedSeasonBundle(shape({ era: "legacy" }));
    expect(new Set(legacy.players?.map((player) => player.position))).toEqual(
      new Set(NORMALIZED_ERA_POSITION_VOCABULARIES.legacy),
    );
    expect(
      legacy.players?.some(
        (player) => player.position === "D/ST" && Number(player.providerId) < 0,
      ),
    ).toBe(true);

    const overlapped = buildNormalizedSeasonBundle(
      shape({ ownerOverlap: "co_owned" }),
    );
    expect(
      overlapped.teams.every((team) =>
        team.ownerMemberIds.includes("owner-shared"),
      ),
    ).toBe(true);
    expect(new Set(overlapped.teams.map((team) => team.providerId)).size).toBe(
      overlapped.teams.length,
    );

    const unicodeDuplicates = buildNormalizedSeasonBundle(
      shape({ nameStyle: "unicode" }),
    );
    expect(
      unicodeDuplicates.teams.some((team) =>
        [...team.name].some(
          (character) => (character.codePointAt(0) ?? 0) > 127,
        ),
      ),
    ).toBe(true);
    const duplicates = buildNormalizedSeasonBundle(
      shape({ nameStyle: "duplicate" }),
    );
    expect(new Set(duplicates.teams.map((team) => team.name))).toEqual(
      new Set(["Same Name"]),
    );

    const zeroScore = buildNormalizedSeasonBundle(shape({ zeroScoreWeek: 1 }));
    expect(
      zeroScore.matchups
        .filter((matchup) => matchup.scoringPeriod === 1)
        .every((matchup) => matchup.homeScore === 0 && matchup.awayScore === 0),
    ).toBe(true);
  });

  it("represents two-week playoff spans and every season-length boundary", () => {
    for (const leagueSize of [4, 20]) {
      for (const regularSeasonWeeks of [1, 14]) {
        const bundle = buildNormalizedSeasonBundle(
          shape({
            leagueSize,
            playoffMatchupPeriodLength: 2,
            playoffRounds: 3,
            playoffTeamCount: Math.min(leagueSize, 8),
            regularSeasonWeeks,
          }),
        );
        expect(
          bundle.matchups
            .filter((matchup) => matchup.scoringPeriod > regularSeasonWeeks)
            .every((matchup) => matchup.scoringPeriodSpan === 2),
        ).toBe(true);
        expect(bundle.league.postseason?.championshipScoringPeriod).toBe(
          regularSeasonWeeks + 6,
        );
      }
    }
  });

  it("also exposes a direct NormalizedSeasonBundle arbitrary", () => {
    const bundles = fc.sample(normalizedSeasonBundleArbitrary, {
      numRuns: 5,
      seed: PROPERTY_SEED,
    });
    expect(bundles).toHaveLength(5);
    expect(
      bundles.every((bundle) => bundle.league.size === bundle.teams.length),
    ).toBe(true);
    expect(fc.stringify(bundles[0])).toMatch(/^NormalizedSeasonBundle\(\{/);
    expect(fc.stringify(bundles[0]).length).toBeLessThan(750);
  });
});
