// Extended League Types for Sprint 18

import { League, LeagueTeam, LeagueMatchup, LeaguePlayer } from './index';

// Extended team standings with additional fields
export interface TeamStanding extends LeagueTeam {
  streak?: {
    type: 'W' | 'L';
    count: number;
  };
  trend?: number; // Position change from previous week (-1, 0, 1)
  isPlayoffTeam?: boolean;
  isEliminated?: boolean;
  clinched?: boolean;
  owner?: string; // Team owner name
  record?: string; // Formatted W-L-T record
}

// Extended matchup with real-time data
export interface ExtendedMatchup extends LeagueMatchup {
  homeTeam?: TeamStanding;
  awayTeam?: TeamStanding;
  homeProjected?: number;
  awayProjected?: number;
  gamesPlayed?: number;
  totalGames?: number;
  status?: 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL';
}

// Player with lineup and injury information
export interface RosterPlayer extends LeaguePlayer {
  firstName?: string;
  lastName?: string;
  team: string; // NFL team
  lineupSlot?: string; // QB, RB, WR, TE, FLEX, etc.
  image?: string;
  injuryStatus?: 'ACTIVE' | 'QUESTIONABLE' | 'DOUBTFUL' | 'OUT' | 'IR';
  opponent?: string;
  projectedPoints: number;
  actualPoints?: number;
}

// Team roster
export interface TeamRoster {
  teamId: string;
  leagueId: string;
  players: RosterPlayer[];
  lastUpdated: Date;
}

// League history types
export interface LeagueHistory {
  leagueId: string;
  seasonsCount: number;
  firstSeason: number;
  currentSeason: number;
  championships: Championship[];
  records: LeagueRecord[];
}

export interface Championship {
  season: number;
  champion: {
    teamId: string;
    name: string;
    owner: string;
    record: string;
    logo?: string;
  };
  runnerUp: {
    teamId: string;
    name: string;
    owner: string;
    record: string;
    logo?: string;
  };
  finalScore: string;
}

export interface LeagueRecord {
  category: string;
  value: string | number;
  holder: string; // Team or owner name
  date: string; // When the record was set
  description?: string;
}

// Transaction types
export interface LeagueTransaction {
  id: string;
  leagueId: string;
  type: 'ADD' | 'DROP' | 'TRADE' | 'WAIVER';
  teamId: string;
  teamName: string;
  description: string;
  date: Date;
  players?: {
    added?: string[];
    dropped?: string[];
    traded?: {
      from: string;
      to: string;
      players: string[];
    }[];
  };
}

// Season statistics
export interface SeasonStats {
  season: number;
  avgScore: number;
  highScore: number;
  lowScore: number;
  totalTrades: number;
  totalTransactions: number;
  champion: string;
  topScorer: string;
  mostImproved: string;
}

// League achievements
export interface LeagueAchievement {
  id: string;
  title: string;
  description: string;
  category: 'CHAMPIONSHIP' | 'PERFORMANCE' | 'ACTIVITY' | 'SPECIAL';
  icon?: string;
  holders: {
    userId: string;
    userName: string;
    dateEarned: Date;
  }[];
}

// Weekly performance
export interface WeeklyPerformance {
  week: number;
  teamId: string;
  score: number;
  projectedScore: number;
  win: boolean;
  opponentId: string;
  opponentScore: number;
}