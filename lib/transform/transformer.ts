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

export class DataTransformer {
  
  async transformLeague(espnLeague: ESPNLeague): Promise<LeagueData> {
    return {
      settings: this.transformSettings(espnLeague.settings),
      teams: espnLeague.teams.map(team => this.transformTeam(team)),
      players: this.extractPlayers(espnLeague.teams),
      currentWeek: espnLeague.scoringPeriodId,
      lastSync: new Date(),
    };
  }

  private transformSettings(settings: ESPNLeagueSettings): any {
    return {
      name: settings.name,
      size: settings.size,
      isPublic: settings.isPublic,
      scoring: this.transformScoringSettings(settings.scoringSettings),
      roster: this.transformRosterSettings(settings.rosterSettings),
      schedule: {
        regularSeasonLength: settings.scheduleSettings.matchupPeriodCount - settings.scheduleSettings.playoffTeamCount,
        playoffTeams: settings.scheduleSettings.playoffTeamCount,
        totalWeeks: settings.scheduleSettings.matchupPeriodCount,
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

  private transformScoringSettings(scoring: any): Record<string, number> {
    const scoringMap: Record<string, number> = {};
    
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

    scoring.scoringItems?.forEach((item: any) => {
      const statName = statIdToName[item.statId];
      if (statName) {
        if (item.pointsOverrides) {
          Object.values(item.pointsOverrides).forEach((value: any) => {
            if (typeof value === 'number') {
              scoringMap[statName] = value;
            }
          });
        } else if (item.points) {
          scoringMap[statName] = item.points;
        }
      }
    });

    return scoringMap;
  }

  private transformRosterSettings(roster: any): any {
    const positions: Record<string, number> = {};
    
    if (roster.lineupSlotCounts) {
      Object.entries(roster.lineupSlotCounts).forEach(([slotId, count]) => {
        const position = ESPNLineupSlots[parseInt(slotId)];
        if (position && count > 0) {
          positions[position] = count as number;
        }
      });
    }

    return {
      positions,
      rosterSize: Object.values(positions).reduce((sum, count) => sum + count, 0),
      universeIds: roster.universeIds || [],
    };
  }

  private transformTeam(team: ESPNTeam): TeamData {
    return {
      espnTeamId: team.id,
      name: team.location ? `${team.location} ${team.nickname}` : team.nickname,
      abbreviation: team.abbrev,
      logoUrl: team.logo,
      wins: team.record?.overall?.wins || 0,
      losses: team.record?.overall?.losses || 0,
      ties: team.record?.overall?.ties || 0,
      pointsFor: team.points || 0,
      pointsAgainst: team.pointsAdjusted || 0,
      standing: team.rankCalculatedFinal || team.rankFinal,
      playoffSeed: team.playoffSeed,
      roster: team.roster?.entries?.map(entry => ({
        playerId: entry.playerId,
        lineupSlotId: entry.lineupSlotId,
        acquisitionType: entry.acquisitionType,
        acquisitionDate: new Date(entry.acquisitionDate),
      })) || [],
    };
  }

  private extractPlayers(teams: ESPNTeam[]): PlayerData[] {
    const playerMap = new Map<number, PlayerData>();

    teams.forEach(team => {
      team.roster?.entries?.forEach(entry => {
        const player = entry.playerPoolEntry?.player;
        if (player && !playerMap.has(player.id)) {
          playerMap.set(player.id, this.transformPlayer(player));
        }
      });
    });

    return Array.from(playerMap.values());
  }

  private transformPlayer(player: ESPNPlayer): PlayerData {
    const position = this.getPositionName(player.defaultPositionId);
    const nflTeam = this.getNFLTeamAbbrev(player.proTeamId);

    return {
      espnPlayerId: player.id,
      name: player.fullName,
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

  private transformPlayerStats(stats: ESPNPlayerStats[] | undefined): PlayerStatsData {
    if (!stats || stats.length === 0) {
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

    return {
      points: currentStats?.appliedTotal || 0,
      projectedPoints: projectedStats?.appliedTotal || 0,
      seasonTotal,
      averagePoints,
      lastWeekPoints: actualStats[actualStats.length - 1]?.appliedTotal || 0,
    };
  }

  transformMatchups(matchups: ESPNMatchup[]): MatchupData[] {
    return matchups.map(matchup => ({
      week: matchup.matchupPeriodId,
      matchupPeriod: matchup.matchupPeriodId,
      homeTeamId: matchup.home?.teamId || 0,
      awayTeamId: matchup.away?.teamId || 0,
      homeScore: matchup.home?.totalPoints || 0,
      awayScore: matchup.away?.totalPoints || 0,
      isPlayoffs: matchup.playoffTierType !== 'NONE',
      isComplete: matchup.winner !== 'UNDECIDED',
    }));
  }

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

  private getNFLTeamAbbrev(proTeamId: number): string {
    return ESPNProTeams[proTeamId] || 'FA';
  }

  getProjectedPoints(stats: ESPNPlayerStats[]): number {
    const projected = stats.find(s => s.statSourceId === 1);
    return projected?.appliedTotal || 0;
  }

  getSeasonTotal(stats: ESPNPlayerStats[]): number {
    return stats
      .filter(s => s.statSourceId === 0)
      .reduce((sum, s) => sum + (s.appliedTotal || 0), 0);
  }

  getAveragePoints(stats: ESPNPlayerStats[]): number {
    const actualStats = stats.filter(s => s.statSourceId === 0 && s.appliedTotal);
    if (actualStats.length === 0) return 0;
    
    const total = actualStats.reduce((sum, s) => sum + (s.appliedTotal || 0), 0);
    return Math.round((total / actualStats.length) * 10) / 10;
  }
}