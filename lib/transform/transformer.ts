import {
  ESPNLeague,
  ESPNTeam,
  ESPNPlayer,
  ESPNMatchup,
  ESPNPlayerStats,
  ESPNRosterEntry,
  ESPNLeagueSettings,
  ESPNProTeams,
  ESPNPositions,
  ESPNLineupSlots
} from '@/types/espn';

export interface LeagueData {
  settings: any;
  teams: TeamData[];
  players: PlayerData[];
  currentWeek: number;
  lastSync: Date;
}

export interface TeamData {
  espnTeamId: number;
  name: string;
  abbreviation: string;
  logoUrl?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  standing?: number;
  playoffSeed?: number;
  roster: RosterData[];
}

export interface RosterData {
  playerId: number;
  lineupSlotId: number;
  acquisitionType: string;
  acquisitionDate: Date;
}

export interface PlayerData {
  espnPlayerId: number;
  name: string;
  firstName?: string;
  lastName?: string;
  position: string;
  nflTeam: string;
  injured: boolean;
  injuryStatus?: string;
  percentOwned: number;
  percentStarted: number;
  stats: PlayerStatsData;
}

export interface PlayerStatsData {
  points: number;
  projectedPoints: number;
  seasonTotal: number;
  averagePoints: number;
  lastWeekPoints?: number;
}

export interface MatchupData {
  week: number;
  matchupPeriod: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  isPlayoffs: boolean;
  isComplete: boolean;
}

/**
 * Data Transformer
 *
 * Transforms ESPN API responses into application data formats.
 * Handles data normalization, validation, and type conversion.
 */
export class DataTransformer {

  /**
   * Transform complete ESPN league data
   * @param espnLeague Raw ESPN league data
   * @returns Normalized league data
   */
  async transformLeague(espnLeague: ESPNLeague): Promise<LeagueData> {
    if (!espnLeague) {
      throw new Error('Invalid ESPN league data: league data is null or undefined');
    }

    if (!espnLeague.teams || !Array.isArray(espnLeague.teams)) {
      throw new Error('Invalid ESPN league data: teams array is missing');
    }

    return {
      settings: this.transformSettings(espnLeague.settings),
      teams: espnLeague.teams.map(team => this.transformTeam(team)),
      players: this.extractPlayers(espnLeague.teams),
      currentWeek: espnLeague.scoringPeriodId || 1,
      lastSync: new Date(),
    };
  }

  /**
   * Transform league settings
   * @private
   */
  private transformSettings(settings: ESPNLeagueSettings): any {
    if (!settings) {
      throw new Error('Invalid ESPN league data: settings are missing');
    }

    return {
      name: settings.name || 'Unnamed League',
      size: settings.size || 0,
      isPublic: settings.isPublic || false,
      scoring: this.transformScoringSettings(settings.scoringSettings),
      roster: this.transformRosterSettings(settings.rosterSettings),
      schedule: {
        regularSeasonLength: settings.scheduleSettings?.matchupPeriodLength || 14,
        playoffTeams: settings.scheduleSettings?.playoffTeamCount || 4,
        totalWeeks: settings.scheduleSettings?.matchupPeriodCount || 17,
      },
      draft: {
        type: settings.draftSettings?.type || 'SNAKE',
        date: settings.draftSettings?.date ? new Date(settings.draftSettings.date) : null,
      },
      trade: {
        deadline: settings.tradeSettings?.deadlineDate ? new Date(settings.tradeSettings.deadlineDate) : null,
        reviewPeriod: settings.tradeSettings?.revisionHours || 48,
        votesRequired: settings.tradeSettings?.vetoVotesRequired || 4,
      },
    };
  }

  /**
   * Transform scoring settings to a normalized map
   * @private
   */
  private transformScoringSettings(scoring: any): Record<string, number> {
    const scoringMap: Record<string, number> = {};

    // Map of ESPN stat IDs to readable names
    const statIdToName: Record<number, string> = {
      3: 'passingYards',
      4: 'passingTouchdowns',
      19: 'passing2PtConversions',
      20: 'passingInterceptions',
      24: 'rushingYards',
      25: 'rushingTouchdowns',
      26: 'rushing2PtConversions',
      42: 'receivingYards',
      43: 'receivingTouchdowns',
      44: 'receiving2PtConversions',
      53: 'receivingReceptions',
      72: 'lostFumbles',
      74: 'fumbleRecoveryTouchdowns',
      77: 'passingAttempts',
      78: 'passingCompletions',
      79: 'passingIncompletions',
      80: 'fieldGoalsMade0to19',
      81: 'fieldGoalsMade20to29',
      82: 'fieldGoalsMade30to39',
      83: 'fieldGoalsMade40to49',
      84: 'fieldGoalsMade50Plus',
      85: 'fieldGoalsMissed0to19',
      86: 'fieldGoalsMissed20to29',
      87: 'fieldGoalsMissed30to39',
      88: 'fieldGoalsMissed40to49',
      89: 'fieldGoalsMissed50Plus',
      90: 'sacks',
      91: 'interceptions',
      92: 'fumbleRecoveries',
      93: 'forcedFumbles',
      94: 'defensiveTouchdowns',
      95: 'safeties',
      96: 'blockedKicks',
      97: 'teamKickoffReturnTouchdowns',
      98: 'teamPuntReturnTouchdowns',
      99: 'pointsAllowed0',
      100: 'pointsAllowed1to6',
      101: 'pointsAllowed7to13',
      102: 'pointsAllowed14to20',
      103: 'pointsAllowed21to27',
      104: 'pointsAllowed28to34',
      105: 'pointsAllowed35Plus',
      129: 'yardsAllowed0to99',
      130: 'yardsAllowed100to199',
      131: 'yardsAllowed200to299',
      132: 'yardsAllowed300to399',
      133: 'yardsAllowed400to499',
      134: 'yardsAllowed500Plus',
    };

    if (!scoring?.scoringItems || !Array.isArray(scoring.scoringItems)) {
      return scoringMap;
    }

    scoring.scoringItems.forEach((item: any) => {
      const statName = statIdToName[item.statId];
      if (statName) {
        if (item.pointsOverrides) {
          Object.values(item.pointsOverrides).forEach((value: any) => {
            if (typeof value === 'number') {
              scoringMap[statName] = value;
            }
          });
        } else if (typeof item.points === 'number') {
          scoringMap[statName] = item.points;
        }
      }
    });

    return scoringMap;
  }

  /**
   * Transform roster settings
   * @private
   */
  private transformRosterSettings(roster: any): any {
    const positions: Record<string, number> = {};

    if (roster?.lineupSlotCounts) {
      Object.entries(roster.lineupSlotCounts).forEach(([slotId, count]) => {
        const position = ESPNLineupSlots[parseInt(slotId)];
        if (position && typeof count === 'number' && count > 0) {
          positions[position] = count;
        }
      });
    }

    return {
      positions,
      rosterSize: Object.values(positions).reduce((sum, count) => sum + count, 0),
      universeIds: roster?.universeIds || [],
    };
  }

  /**
   * Transform an ESPN team to application format
   * @private
   */
  private transformTeam(team: ESPNTeam): TeamData {
    if (!team || typeof team.id !== 'number') {
      throw new Error('Invalid team data: team ID is missing');
    }

    // Build team name
    let name = team.nickname || 'Unknown Team';
    if (team.location) {
      name = `${team.location} ${team.nickname}`;
    }

    return {
      espnTeamId: team.id,
      name,
      abbreviation: team.abbrev || name.substring(0, 3).toUpperCase(),
      logoUrl: team.logo,
      wins: team.record?.overall?.wins || 0,
      losses: team.record?.overall?.losses || 0,
      ties: team.record?.overall?.ties || 0,
      pointsFor: team.points || 0,
      // Note: ESPN doesn't directly provide "points against" in all API responses
      // Using points for now, should be calculated from matchup data
      pointsAgainst: team.record?.overall?.pointsAgainst || 0,
      standing: team.rankCalculatedFinal || team.rankFinal,
      playoffSeed: team.playoffSeed,
      roster: team.roster?.entries?.map(entry => this.transformRosterEntry(entry)).filter(Boolean) as RosterData[] || [],
    };
  }

  /**
   * Transform a roster entry
   * @private
   */
  private transformRosterEntry(entry: any): RosterData | null {
    if (!entry || typeof entry.playerId !== 'number') {
      return null;
    }

    return {
      playerId: entry.playerId,
      lineupSlotId: entry.lineupSlotId || 0,
      acquisitionType: entry.acquisitionType || 'UNKNOWN',
      acquisitionDate: entry.acquisitionDate ? new Date(entry.acquisitionDate) : new Date(),
    };
  }

  /**
   * Extract unique players from all team rosters
   * @private
   */
  private extractPlayers(teams: ESPNTeam[]): PlayerData[] {
    const playerMap = new Map<number, PlayerData>();

    teams.forEach(team => {
      team.roster?.entries?.forEach(entry => {
        const player = entry.playerPoolEntry?.player;
        if (player && player.id && !playerMap.has(player.id)) {
          try {
            const playerData = this.transformPlayer(player);
            playerMap.set(player.id, playerData);
          } catch (error) {
            console.warn(`Failed to transform player ${player.id}:`, error);
          }
        }
      });
    });

    return Array.from(playerMap.values());
  }

  /**
   * Transform an ESPN player to application format
   * @private
   */
  private transformPlayer(player: ESPNPlayer): PlayerData {
    if (!player || typeof player.id !== 'number') {
      throw new Error('Invalid player data: player ID is missing');
    }

    const position = this.getPositionName(player.defaultPositionId);
    const nflTeam = this.getNFLTeamAbbrev(player.proTeamId);

    return {
      espnPlayerId: player.id,
      name: player.fullName || `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Unknown Player',
      firstName: player.firstName,
      lastName: player.lastName,
      position,
      nflTeam,
      injured: player.injured || false,
      injuryStatus: player.injuryStatus,
      percentOwned: player.ownership?.percentOwned || 0,
      percentStarted: player.ownership?.percentStarted || 0,
      stats: this.transformPlayerStats(player.stats),
    };
  }

  /**
   * Transform player stats
   * @private
   */
  private transformPlayerStats(stats: ESPNPlayerStats[] | undefined): PlayerStatsData {
    if (!stats || !Array.isArray(stats) || stats.length === 0) {
      return {
        points: 0,
        projectedPoints: 0,
        seasonTotal: 0,
        averagePoints: 0,
      };
    }

    const currentStats = stats[stats.length - 1];
    const projectedStats = stats.find(s => s.statSourceId === 1);
    const actualStats = stats.filter(s => s.statSourceId === 0);

    const seasonTotal = actualStats.reduce((sum, s) => sum + (s.appliedTotal || 0), 0);
    const averagePoints = actualStats.length > 0
      ? Math.round((seasonTotal / actualStats.length) * 10) / 10
      : 0;

    const lastWeekPoints = actualStats.length > 1
      ? actualStats[actualStats.length - 2]?.appliedTotal || 0
      : undefined;

    return {
      points: currentStats?.appliedTotal || 0,
      projectedPoints: projectedStats?.appliedTotal || 0,
      seasonTotal,
      averagePoints,
      lastWeekPoints,
    };
  }

  /**
   * Transform matchup data
   */
  transformMatchups(matchups: ESPNMatchup[]): MatchupData[] {
    if (!matchups || !Array.isArray(matchups)) {
      return [];
    }

    return matchups.map(matchup => this.transformMatchup(matchup)).filter(Boolean) as MatchupData[];
  }

  /**
   * Transform a single matchup
   * @private
   */
  private transformMatchup(matchup: ESPNMatchup): MatchupData | null {
    if (!matchup) {
      return null;
    }

    return {
      week: matchup.matchupPeriodId || 0,
      matchupPeriod: matchup.matchupPeriodId || 0,
      homeTeamId: matchup.home?.teamId || 0,
      awayTeamId: matchup.away?.teamId || 0,
      homeScore: matchup.home?.totalPoints || 0,
      awayScore: matchup.away?.totalPoints || 0,
      isPlayoffs: matchup.playoffTierType ? matchup.playoffTierType !== 'NONE' : false,
      isComplete: matchup.winner ? matchup.winner !== 'UNDECIDED' : false,
    };
  }

  /**
   * Get position name from ESPN position ID
   * @private
   */
  private getPositionName(positionId: number): string {
    const positionMap: Record<number, string> = {
      1: 'QB',
      2: 'RB',
      3: 'WR',
      4: 'TE',
      5: 'K',
      16: 'D/ST',
    };

    return positionMap[positionId] || 'UNKNOWN';
  }

  /**
   * Get NFL team abbreviation from ESPN pro team ID
   * @private
   */
  private getNFLTeamAbbrev(proTeamId: number): string {
    return ESPNProTeams[proTeamId] || 'FA';
  }

  /**
   * Get projected points for a player
   */
  getProjectedPoints(stats: ESPNPlayerStats[]): number {
    if (!stats || !Array.isArray(stats)) return 0;
    const projected = stats.find(s => s.statSourceId === 1);
    return projected?.appliedTotal || 0;
  }

  /**
   * Get season total points for a player
   */
  getSeasonTotal(stats: ESPNPlayerStats[]): number {
    if (!stats || !Array.isArray(stats)) return 0;
    return stats
      .filter(s => s.statSourceId === 0)
      .reduce((sum, s) => sum + (s.appliedTotal || 0), 0);
  }

  /**
   * Get average points per game for a player
   */
  getAveragePoints(stats: ESPNPlayerStats[]): number {
    if (!stats || !Array.isArray(stats)) return 0;
    const actualStats = stats.filter(s => s.statSourceId === 0 && s.appliedTotal);
    if (actualStats.length === 0) return 0;

    const total = actualStats.reduce((sum, s) => sum + (s.appliedTotal || 0), 0);
    return Math.round((total / actualStats.length) * 10) / 10;
  }
}
