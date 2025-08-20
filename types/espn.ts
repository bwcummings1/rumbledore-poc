// ESPN Fantasy Football API type definitions

export interface ESPNLeague {
  id: number;
  name: string;
  seasonId: number;
  scoringPeriodId: number;
  firstScoringPeriod: number;
  finalScoringPeriod: number;
  status: {
    currentMatchupPeriod: number;
    isActive: boolean;
    latestScoringPeriod: number;
    previousSeasons: number[];
    standingsUpdateDate: number;
    teamsJoined: number;
    waiverLastExecutionDate: number;
    waiverProcessStatus: Record<string, any>;
  };
  settings: ESPNLeagueSettings;
  teams: ESPNTeam[];
  schedule: ESPNMatchup[];
  members: ESPNMember[];
}

export interface ESPNLeagueSettings {
  name: string;
  size: number;
  isPublic: boolean;
  draftSettings: {
    date: number;
    type: string;
    timePerSelection: number;
    pickOrder: number[];
    availableDate: number;
  };
  rosterSettings: {
    lineupSlotCounts: Record<string, number>;
    positionLimits: Record<string, number>;
    rosterLocktimeType: string;
    universeIds: number[];
  };
  scheduleSettings: {
    divisions: ESPNDivision[];
    matchupPeriodCount: number;
    matchupPeriodLength: number;
    matchupPeriods: Record<string, number[]>;
    periodTypeId: number;
    playoffMatchupPeriodLength: number;
    playoffSeedingRule: string;
    playoffSeedingRuleBy: number;
    playoffTeamCount: number;
  };
  scoringSettings: {
    scoringType: string;
    playerRankType: string;
    homeTeamBonus: number;
    playoffHomeTeamBonus: number;
    playoffMatchupTieRule: string;
    scoringItems: ESPNScoringItem[];
  };
  tradeSettings: {
    allowOutOfUniverse: boolean;
    deadlineDate: number;
    max: number;
    revisionHours: number;
    vetoVotesRequired: number;
  };
}

export interface ESPNDivision {
  id: number;
  name: string;
  size: number;
}

export interface ESPNScoringItem {
  isReverseItem: boolean;
  leagueRanking: number;
  leagueTotal: number;
  pointsOverrides?: Record<string, number>;
  statId: number;
  points?: number;
}

export interface ESPNTeam {
  id: number;
  abbrev: string;
  currentProjectedRank: number;
  currentSimulationResults: {
    rank: Record<string, any>;
    playoff: Record<string, any>;
  };
  divisionId: number;
  draftDayProjectedRank: number;
  draftStrategy: {
    keeperPlayerIds: number[];
  };
  isActive: boolean;
  location: string;
  logo: string;
  logoType: string;
  nickname: string;
  owners: string[];
  playoffSeed: number;
  points: number;
  pointsAdjusted: number;
  pointsDelta: number;
  primaryOwner: string;
  rankCalculatedFinal: number;
  rankFinal: number;
  record: ESPNRecord;
  roster: ESPNRoster;
  tradeBlock: Record<string, any>;
  transactionCounter: ESPNTransactionCounter;
  waiverRank: number;
}

export interface ESPNRecord {
  away: ESPNRecordDetail;
  division: ESPNRecordDetail;
  home: ESPNRecordDetail;
  overall: ESPNRecordDetail;
}

export interface ESPNRecordDetail {
  gamesBack: number;
  losses: number;
  percentage: number;
  pointsAgainst: number;
  pointsFor: number;
  streakLength: number;
  streakType: string;
  ties: number;
  wins: number;
}

export interface ESPNRoster {
  appliedStatTotal: number;
  entries: ESPNRosterEntry[];
  tradeBlock: {
    proposedTransactions: any[];
    receivedTransactions: any[];
    sentTransactions: any[];
  };
}

export interface ESPNRosterEntry {
  acquisitionDate: number;
  acquisitionType: string;
  injuryStatus: string;
  lineupSlotId: number;
  pendingTransactionIds: number[];
  playerId: number;
  playerPoolEntry: ESPNPlayerPoolEntry;
  status: string;
}

export interface ESPNPlayerPoolEntry {
  appliedStatTotal: number;
  id: number;
  keeperValue: number;
  keeperValueFuture: number;
  lineupLocked: boolean;
  onTeamId: number;
  player: ESPNPlayer;
  rosterLocked: boolean;
  status: string;
  tradeLocked: boolean;
}

export interface ESPNPlayer {
  id: number;
  defaultPositionId: number;
  draftRanksByRankType: Record<string, any>;
  droppable: boolean;
  eligibleSlots: number[];
  firstName: string;
  fullName: string;
  injured: boolean;
  injuryStatus: string;
  jersey: string;
  lastName: string;
  lastNewsDate: number;
  outlooks: Record<string, string>;
  ownership: ESPNOwnership;
  proTeamId: number;
  rankings: Record<string, ESPNRanking[]>;
  seasonOutlook: string;
  stats: ESPNPlayerStats[];
  universeId: number;
}

export interface ESPNOwnership {
  activityLevel: number;
  auctionValueAverage: number;
  auctionValueAverageChange: number;
  averageDraftPosition: number;
  averageDraftPositionPercentChange: number;
  date: number;
  leagueType: number;
  percentChange: number;
  percentOwned: number;
  percentStarted: number;
}

export interface ESPNRanking {
  auctionValue: number;
  averageRank?: number;
  published: boolean;
  rank: number;
  rankSourceId: number;
  rankType: string;
  slotId: number;
}

export interface ESPNPlayerStats {
  appliedStats: Record<string, number>;
  appliedTotal: number;
  externalId: string;
  id: string;
  proTeamId: number;
  scoringPeriodId: number;
  seasonId: number;
  statSourceId: number;
  statSplitTypeId: number;
  stats: Record<string, number>;
  variance: Record<string, number>;
}

export interface ESPNMatchup {
  away: ESPNMatchupTeam;
  home: ESPNMatchupTeam;
  id: number;
  matchupPeriodId: number;
  playoffTierType: string;
  winner: string;
}

export interface ESPNMatchupTeam {
  adjustment: number;
  cumulativeScore: {
    losses: number;
    statBySlot: Record<string, any>;
    ties: number;
    wins: number;
  };
  divisionId: number;
  pointsByScoringPeriod: Record<string, number>;
  rosterForCurrentScoringPeriod: {
    appliedStatTotal: number;
    entries: ESPNRosterEntry[];
  };
  rosterForMatchupPeriod: {
    appliedStatTotal: number;
    entries: ESPNRosterEntry[];
  };
  teamId: number;
  tiebreak: number;
  totalPoints: number;
}

export interface ESPNMember {
  displayName: string;
  firstName: string;
  id: string;
  isLeagueCreator: boolean;
  isLeagueManager: boolean;
  lastName: string;
  notificationSettings: ESPNNotificationSettings[];
}

export interface ESPNNotificationSettings {
  enabled: boolean;
  id: string;
  type: string;
}

// Position mappings
export const ESPNPositions: Record<number, string> = {
  0: 'QB',
  1: 'TQB',
  2: 'RB',
  3: 'RB/WR',
  4: 'WR',
  5: 'WR/TE',
  6: 'TE',
  7: 'OP',
  8: 'DT',
  9: 'DE',
  10: 'LB',
  11: 'DL',
  12: 'CB',
  13: 'S',
  14: 'DB',
  15: 'DP',
  16: 'D/ST',
  17: 'K',
  18: 'P',
  19: 'HC',
  20: 'BE',
  21: 'IR',
  22: '',
  23: 'FLEX',
  24: 'EDR',
  25: 'RB/WR/TE'
};

// Lineup slot mappings
export const ESPNLineupSlots: Record<number, string> = {
  0: 'QB',
  2: 'RB',
  4: 'WR',
  6: 'TE',
  16: 'D/ST',
  17: 'K',
  20: 'Bench',
  21: 'IR',
  23: 'FLEX',
  25: 'SUPERFLEX'
};

// Pro team mappings
export const ESPNProTeams: Record<number, string> = {
  0: 'None',
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WSH',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU'
};

// Transaction types
export const ESPNTransactionTypes: Record<string, string> = {
  'FREEAGENT': 'Free Agent',
  'WAIVER': 'Waiver',
  'TRADE_ACCEPT': 'Trade',
  'TRADE_VETO': 'Trade Veto',
  'TRADE_CANCEL': 'Trade Cancel',
  'TRADE_PROPOSE': 'Trade Proposal',
  'ROSTER': 'Roster Move',
  'DRAFT': 'Draft Pick'
};

export interface ESPNTransactionCounter {
  acquisitionBudgetSpent: number;
  acquisitions: number;
  drops: number;
  matchupAcquisitionTotals: Record<string, number>;
  misc: number;
  moveToActive: number;
  moveToIR: number;
  paid: number;
  teamCharges: number;
  trades: number;
}