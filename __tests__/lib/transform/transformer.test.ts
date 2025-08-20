import { DataTransformer } from '@/lib/transform/transformer';
import { ESPNLeague, ESPNTeam, ESPNPlayer, ESPNMatchup } from '@/types/espn';

describe('DataTransformer', () => {
  let transformer: DataTransformer;

  beforeEach(() => {
    transformer = new DataTransformer();
  });

  describe('transformLeague', () => {
    it('should transform ESPN league data correctly', async () => {
      const mockESPNLeague: ESPNLeague = {
        id: 123456,
        name: 'Test League',
        seasonId: 2024,
        scoringPeriodId: 10,
        firstScoringPeriod: 1,
        finalScoringPeriod: 17,
        status: {
          currentMatchupPeriod: 10,
          isActive: true,
          latestScoringPeriod: 10,
          previousSeasons: [],
          standingsUpdateDate: Date.now(),
          teamsJoined: 12,
          waiverLastExecutionDate: Date.now(),
          waiverProcessStatus: {},
        },
        settings: {
          name: 'Test League',
          size: 12,
          isPublic: false,
          draftSettings: {
            date: Date.now(),
            type: 'SNAKE',
            timePerSelection: 90,
            pickOrder: [],
            availableDate: Date.now(),
          },
          rosterSettings: {
            lineupSlotCounts: {
              '0': 1,  // QB
              '2': 2,  // RB
              '4': 2,  // WR
              '6': 1,  // TE
              '23': 1, // FLEX
              '16': 1, // D/ST
              '17': 1, // K
              '20': 7, // Bench
            },
            positionLimits: {},
            rosterLocktimeType: 'INDIVIDUAL_GAME',
            universeIds: [],
          },
          scheduleSettings: {
            divisions: [],
            matchupPeriodCount: 14,
            matchupPeriodLength: 1,
            matchupPeriods: {},
            periodTypeId: 1,
            playoffMatchupPeriodLength: 1,
            playoffSeedingRule: 'HEAD_TO_HEAD',
            playoffSeedingRuleBy: 0,
            playoffTeamCount: 6,
          },
          scoringSettings: {
            scoringType: 'H2H_POINTS',
            playerRankType: 'PPR',
            homeTeamBonus: 0,
            playoffHomeTeamBonus: 0,
            playoffMatchupTieRule: 'NONE',
            scoringItems: [
              { statId: 3, isReverseItem: false, leagueRanking: 0, leagueTotal: 0, pointsOverrides: { '16': 0.04 } },
              { statId: 4, isReverseItem: false, leagueRanking: 0, leagueTotal: 0, pointsOverrides: { '16': 4 } },
            ],
          },
          tradeSettings: {
            allowOutOfUniverse: false,
            deadlineDate: Date.now(),
            max: -1,
            revisionHours: 48,
            vetoVotesRequired: 4,
          },
        },
        teams: [],
        schedule: [],
        members: [],
      };

      const result = await transformer.transformLeague(mockESPNLeague);

      expect(result).toHaveProperty('settings');
      expect(result).toHaveProperty('teams');
      expect(result).toHaveProperty('players');
      expect(result).toHaveProperty('currentWeek');
      expect(result).toHaveProperty('lastSync');
      expect(result.currentWeek).toBe(10);
      expect(result.settings.name).toBe('Test League');
      expect(result.settings.roster.positions).toHaveProperty('QB', 1);
      expect(result.settings.roster.positions).toHaveProperty('RB', 2);
    });
  });

  describe('transformMatchups', () => {
    it('should transform matchup data correctly', () => {
      const mockMatchups: ESPNMatchup[] = [
        {
          id: 1,
          matchupPeriodId: 1,
          playoffTierType: 'NONE',
          winner: 'HOME',
          home: {
            teamId: 1,
            totalPoints: 120.5,
            adjustment: 0,
            cumulativeScore: {
              losses: 0,
              ties: 0,
              wins: 1,
              statBySlot: {},
            },
            divisionId: 0,
            pointsByScoringPeriod: {},
            rosterForCurrentScoringPeriod: {
              appliedStatTotal: 120.5,
              entries: [],
            },
            rosterForMatchupPeriod: {
              appliedStatTotal: 120.5,
              entries: [],
            },
            tiebreak: 0,
          },
          away: {
            teamId: 2,
            totalPoints: 110.2,
            adjustment: 0,
            cumulativeScore: {
              losses: 1,
              ties: 0,
              wins: 0,
              statBySlot: {},
            },
            divisionId: 0,
            pointsByScoringPeriod: {},
            rosterForCurrentScoringPeriod: {
              appliedStatTotal: 110.2,
              entries: [],
            },
            rosterForMatchupPeriod: {
              appliedStatTotal: 110.2,
              entries: [],
            },
            tiebreak: 0,
          },
        },
      ];

      const result = transformer.transformMatchups(mockMatchups);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        week: 1,
        matchupPeriod: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        homeScore: 120.5,
        awayScore: 110.2,
        isPlayoffs: false,
        isComplete: true,
      });
    });

    it('should handle playoff matchups', () => {
      const mockMatchups: ESPNMatchup[] = [
        {
          id: 2,
          matchupPeriodId: 15,
          playoffTierType: 'WINNERS_BRACKET',
          winner: 'UNDECIDED',
          home: {
            teamId: 3,
            totalPoints: 0,
            adjustment: 0,
            cumulativeScore: {
              losses: 0,
              ties: 0,
              wins: 0,
              statBySlot: {},
            },
            divisionId: 0,
            pointsByScoringPeriod: {},
            rosterForCurrentScoringPeriod: {
              appliedStatTotal: 0,
              entries: [],
            },
            rosterForMatchupPeriod: {
              appliedStatTotal: 0,
              entries: [],
            },
            tiebreak: 0,
          },
          away: {
            teamId: 4,
            totalPoints: 0,
            adjustment: 0,
            cumulativeScore: {
              losses: 0,
              ties: 0,
              wins: 0,
              statBySlot: {},
            },
            divisionId: 0,
            pointsByScoringPeriod: {},
            rosterForCurrentScoringPeriod: {
              appliedStatTotal: 0,
              entries: [],
            },
            rosterForMatchupPeriod: {
              appliedStatTotal: 0,
              entries: [],
            },
            tiebreak: 0,
          },
        },
      ];

      const result = transformer.transformMatchups(mockMatchups);

      expect(result[0].isPlayoffs).toBe(true);
      expect(result[0].isComplete).toBe(false);
    });
  });

  describe('player stat transformation', () => {
    it('should calculate projected points correctly', () => {
      const stats = [
        { statSourceId: 1, appliedTotal: 20.5 } as any,
        { statSourceId: 0, appliedTotal: 18.2 } as any,
      ];

      const projectedPoints = transformer.getProjectedPoints(stats);
      expect(projectedPoints).toBe(20.5);
    });

    it('should calculate season total correctly', () => {
      const stats = [
        { statSourceId: 0, appliedTotal: 15.0 } as any,
        { statSourceId: 0, appliedTotal: 20.5 } as any,
        { statSourceId: 1, appliedTotal: 18.0 } as any, // Projected, should be ignored
        { statSourceId: 0, appliedTotal: 12.3 } as any,
      ];

      const seasonTotal = transformer.getSeasonTotal(stats);
      expect(seasonTotal).toBe(47.8);
    });

    it('should calculate average points correctly', () => {
      const stats = [
        { statSourceId: 0, appliedTotal: 10.0 } as any,
        { statSourceId: 0, appliedTotal: 20.0 } as any,
        { statSourceId: 0, appliedTotal: 15.0 } as any,
      ];

      const averagePoints = transformer.getAveragePoints(stats);
      expect(averagePoints).toBe(15.0);
    });

    it('should handle empty stats array', () => {
      const emptyStats: any[] = [];

      expect(transformer.getProjectedPoints(emptyStats)).toBe(0);
      expect(transformer.getSeasonTotal(emptyStats)).toBe(0);
      expect(transformer.getAveragePoints(emptyStats)).toBe(0);
    });
  });
});