import { describe, expect, it } from "vitest";
import {
  detectSeasonGroupingProposals,
  type SeasonGroupingSettingsDescriptor,
} from "./curation";

function descriptor(
  season: number,
  overrides: Partial<SeasonGroupingSettingsDescriptor> = {},
): SeasonGroupingSettingsDescriptor {
  return {
    leagueSize: 12,
    lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "16": 1, "17": 1 },
    matchupPeriodCount: 16,
    playoffMatchupPeriodLength: 1,
    playoffTeamCount: 6,
    regularSeasonEndScoringPeriod: 14,
    scoringType: "H2H_POINTS",
    season,
    ...overrides,
  };
}

describe("detectSeasonGroupingProposals", () => {
  it("proposes eras from settings boundaries with names and rationales", () => {
    const proposals = detectSeasonGroupingProposals({
      descriptors: [
        descriptor(2011, {
          leagueSize: 10,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1 },
          playoffMatchupPeriodLength: 2,
          playoffTeamCount: 4,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2012, {
          leagueSize: 10,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1 },
          playoffMatchupPeriodLength: 2,
          playoffTeamCount: 4,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2013, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 4,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2014, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 4,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2015, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 4,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2016, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 4,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2017, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 4,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2018, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 4,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2019, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "7": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 4,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2020, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "23": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 6,
          regularSeasonEndScoringPeriod: 13,
        }),
        descriptor(2021, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "23": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 6,
          regularSeasonEndScoringPeriod: 14,
        }),
        descriptor(2022, {
          leagueSize: 12,
          lineupSlotCounts: { "0": 1, "2": 2, "4": 2, "6": 1, "23": 1 },
          playoffMatchupPeriodLength: 1,
          playoffTeamCount: 6,
          regularSeasonEndScoringPeriod: 14,
        }),
      ],
    });

    expect(proposals.map((proposal) => proposal.seasons)).toEqual([
      [2011, 2012],
      [2013, 2014, 2015, 2016, 2017, 2018, 2019],
      [2020],
      [2021, 2022],
    ]);
    expect(proposals.map((proposal) => proposal.name)).toEqual([
      "2-week playoffs (2011-2012)",
      "12-team era (2013-2019)",
      "FLEX lineup era (2020)",
      "14-week regular season (2021-present)",
    ]);
    expect(proposals[1]?.derivedFrom).toMatchObject({
      boundaryReasons: ["team_count_change", "playoff_matchup_length_change"],
    });
    expect(proposals[2]?.derivedFrom).toMatchObject({
      boundaryReasons: [
        "playoff_team_count_change",
        "roster_lineup_slot_counts_change",
      ],
    });
    expect(proposals[3]?.derivedFrom).toMatchObject({
      boundaryReasons: ["regular_season_week_count_change"],
    });
    expect(proposals[0]?.rationale).toContain("2-week playoffs");
    expect(proposals[2]?.rationale).toContain(
      "lineup slots changed from OP lineup to FLEX lineup",
    );
  });

  it("returns no proposals for a single-format league", () => {
    expect(
      detectSeasonGroupingProposals({
        descriptors: [descriptor(2024), descriptor(2025), descriptor(2026)],
      }),
    ).toEqual([]);
  });

  it("does not propose regular/playoff segments as eras", () => {
    const proposals = detectSeasonGroupingProposals({
      descriptors: [
        {
          ...descriptor(2024),
          playoffStartScoringPeriod: 15,
        } as SeasonGroupingSettingsDescriptor & {
          playoffStartScoringPeriod: number;
        },
        {
          ...descriptor(2025),
          playoffStartScoringPeriod: 16,
        } as SeasonGroupingSettingsDescriptor & {
          playoffStartScoringPeriod: number;
        },
      ],
    });

    expect(proposals).toEqual([]);
  });
});
