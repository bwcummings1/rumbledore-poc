# Sprint 6: Statistics Engine

## Sprint Overview
Build a comprehensive statistics calculation and tracking system for all-time league records, head-to-head histories, performance analytics, and real-time updates.

**Duration**: 2 weeks (Week 3-4 of Phase 2)  
**Dependencies**: Sprint 5 (Identity Resolution) must be complete  
**Risk Level**: Medium - Complex calculations with performance requirements

## Learning Outcomes
By the end of this sprint, you will have:
1. Implemented materialized views for performance optimization
2. Built complex statistical aggregation pipelines
3. Created real-time statistics update mechanisms
4. Developed comprehensive league analytics
5. Mastered PostgreSQL advanced features

## Technical Stack
- **Database**: PostgreSQL with materialized views
- **Cache**: Redis for computed statistics
- **Queue**: Bull for async calculations
- **Language**: TypeScript
- **Real-time**: WebSocket for live updates

## Implementation Guide

### Step 1: Database Schema for Statistics

```sql
-- /prisma/migrations/add_statistics_tables.sql

-- Materialized view for season statistics
CREATE MATERIALIZED VIEW season_statistics AS
SELECT 
  s.league_sandbox,
  s.season_id,
  s.team_id,
  s.week,
  COUNT(*) FILTER (WHERE s.result = 'WIN') as wins,
  COUNT(*) FILTER (WHERE s.result = 'LOSS') as losses,
  COUNT(*) FILTER (WHERE s.result = 'TIE') as ties,
  AVG(s.points_for) as avg_points_for,
  AVG(s.points_against) as avg_points_against,
  MAX(s.points_for) as highest_score,
  MIN(s.points_for) as lowest_score,
  SUM(s.points_for) as total_points_for,
  SUM(s.points_against) as total_points_against,
  STDDEV(s.points_for) as points_std_dev,
  -- Streak calculation
  (SELECT MAX(streak_length) FROM (
    SELECT COUNT(*) as streak_length
    FROM (
      SELECT *,
        SUM(CASE WHEN result != LAG(result) OVER (ORDER BY week) 
            THEN 1 ELSE 0 END) OVER (ORDER BY week) as streak_group
      FROM matchups
      WHERE team_id = s.team_id AND season_id = s.season_id
    ) t
    WHERE result = 'WIN'
    GROUP BY streak_group
  ) streaks) as longest_win_streak,
  NOW() as calculated_at
FROM matchups s
GROUP BY s.league_sandbox, s.season_id, s.team_id, s.week
WITH DATA;

-- Index for fast queries
CREATE INDEX idx_season_stats_lookup 
ON season_statistics(league_sandbox, season_id, team_id);

-- All-time records table
CREATE TABLE all_time_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_sandbox VARCHAR(255) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  record_holder_type VARCHAR(50) NOT NULL, -- 'TEAM' or 'PLAYER'
  record_holder_id VARCHAR(255) NOT NULL,
  record_value DECIMAL(10,2) NOT NULL,
  season_id VARCHAR(50),
  week INTEGER,
  opponent_id VARCHAR(255),
  date_achieved DATE,
  metadata JSONB DEFAULT '{}',
  previous_record_id UUID REFERENCES all_time_records(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(league_sandbox, record_type, record_holder_type)
);

-- Head-to-head history
CREATE TABLE head_to_head_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_sandbox VARCHAR(255) NOT NULL,
  team1_id VARCHAR(255) NOT NULL,
  team2_id VARCHAR(255) NOT NULL,
  total_matchups INTEGER DEFAULT 0,
  team1_wins INTEGER DEFAULT 0,
  team2_wins INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  team1_total_points DECIMAL(10,2) DEFAULT 0,
  team2_total_points DECIMAL(10,2) DEFAULT 0,
  team1_highest_score DECIMAL(10,2),
  team2_highest_score DECIMAL(10,2),
  last_matchup_date DATE,
  playoff_matchups INTEGER DEFAULT 0,
  championship_matchups INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(league_sandbox, team1_id, team2_id),
  CHECK (team1_id < team2_id) -- Ensure consistent ordering
);

-- Performance trends
CREATE TABLE performance_trends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_sandbox VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'TEAM' or 'PLAYER'
  entity_id VARCHAR(255) NOT NULL,
  period_type VARCHAR(50) NOT NULL, -- 'WEEKLY', 'MONTHLY', 'SEASONAL'
  period_value VARCHAR(50) NOT NULL,
  metrics JSONB NOT NULL,
  trend_direction VARCHAR(20), -- 'UP', 'DOWN', 'STABLE'
  trend_strength DECIMAL(5,2), -- Percentage change
  calculated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(league_sandbox, entity_type, entity_id, period_type, period_value)
);

-- Championship history
CREATE TABLE championship_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_sandbox VARCHAR(255) NOT NULL,
  season_id VARCHAR(50) NOT NULL,
  champion_id VARCHAR(255) NOT NULL,
  runner_up_id VARCHAR(255),
  third_place_id VARCHAR(255),
  regular_season_winner_id VARCHAR(255),
  championship_score DECIMAL(10,2),
  runner_up_score DECIMAL(10,2),
  playoff_bracket JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(league_sandbox, season_id)
);

-- Statistics calculation log
CREATE TABLE statistics_calculations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_sandbox VARCHAR(255) NOT NULL,
  calculation_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  records_processed INTEGER DEFAULT 0,
  execution_time_ms INTEGER,
  metadata JSONB DEFAULT '{}'
);
```

### Step 2: Statistics Calculation Service

```typescript
// /lib/services/statistics-engine.ts

import { PrismaClient } from '@prisma/client';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);

export interface StatisticsCalculation {
  leagueSandbox: string;
  calculationType: 'ALL' | 'SEASON' | 'HEAD_TO_HEAD' | 'RECORDS' | 'TRENDS';
  seasonId?: string;
  forceRecalculate?: boolean;
}

export class StatisticsEngine {
  private queue: Queue;
  private worker: Worker;

  constructor() {
    this.queue = new Queue('statistics-calculations', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
      }
    });

    this.worker = new Worker(
      'statistics-calculations',
      async (job: Job<StatisticsCalculation>) => {
        return this.processCalculation(job.data);
      },
      {
        connection: redis,
        concurrency: 2, // Limit concurrent calculations
      }
    );
  }

  async queueCalculation(data: StatisticsCalculation): Promise<string> {
    const job = await this.queue.add('calculate', data, {
      priority: data.calculationType === 'ALL' ? 1 : 10,
    });
    return job.id!;
  }

  private async processCalculation(data: StatisticsCalculation) {
    const logId = await this.logCalculationStart(data);
    const startTime = Date.now();

    try {
      switch (data.calculationType) {
        case 'ALL':
          await this.calculateAllStatistics(data.leagueSandbox);
          break;
        case 'SEASON':
          await this.calculateSeasonStatistics(data.leagueSandbox, data.seasonId!);
          break;
        case 'HEAD_TO_HEAD':
          await this.calculateHeadToHead(data.leagueSandbox);
          break;
        case 'RECORDS':
          await this.calculateAllTimeRecords(data.leagueSandbox);
          break;
        case 'TRENDS':
          await this.calculatePerformanceTrends(data.leagueSandbox);
          break;
      }

      await this.logCalculationComplete(logId, Date.now() - startTime);
      return { success: true, executionTime: Date.now() - startTime };
    } catch (error) {
      await this.logCalculationError(logId, error as Error);
      throw error;
    }
  }

  private async calculateAllStatistics(leagueSandbox: string) {
    // Refresh materialized view
    await prisma.$executeRaw`
      REFRESH MATERIALIZED VIEW CONCURRENTLY season_statistics
      WHERE league_sandbox = ${leagueSandbox}
    `;

    // Calculate all sub-statistics
    await Promise.all([
      this.calculateHeadToHead(leagueSandbox),
      this.calculateAllTimeRecords(leagueSandbox),
      this.calculatePerformanceTrends(leagueSandbox),
      this.calculateChampionshipRecords(leagueSandbox),
    ]);
  }

  private async calculateSeasonStatistics(leagueSandbox: string, seasonId: string) {
    // Get all matchups for the season
    const matchups = await prisma.matchup.findMany({
      where: { leagueSandbox, seasonId },
      orderBy: { week: 'asc' },
    });

    // Group by team
    const teamStats = new Map<string, any>();

    for (const matchup of matchups) {
      if (!teamStats.has(matchup.teamId)) {
        teamStats.set(matchup.teamId, {
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          scores: [],
          currentStreak: { type: null, count: 0 },
          longestWinStreak: 0,
          longestLossStreak: 0,
        });
      }

      const stats = teamStats.get(matchup.teamId);
      stats.pointsFor += matchup.pointsFor;
      stats.pointsAgainst += matchup.pointsAgainst;
      stats.scores.push(matchup.pointsFor);

      // Update W/L/T
      if (matchup.result === 'WIN') {
        stats.wins++;
        if (stats.currentStreak.type === 'WIN') {
          stats.currentStreak.count++;
        } else {
          stats.currentStreak = { type: 'WIN', count: 1 };
        }
        stats.longestWinStreak = Math.max(stats.longestWinStreak, stats.currentStreak.count);
      } else if (matchup.result === 'LOSS') {
        stats.losses++;
        if (stats.currentStreak.type === 'LOSS') {
          stats.currentStreak.count++;
        } else {
          stats.currentStreak = { type: 'LOSS', count: 1 };
        }
        stats.longestLossStreak = Math.max(stats.longestLossStreak, stats.currentStreak.count);
      } else {
        stats.ties++;
        stats.currentStreak = { type: 'TIE', count: 1 };
      }
    }

    // Store in cache
    const cacheKey = `stats:${leagueSandbox}:season:${seasonId}`;
    await redis.setex(cacheKey, 3600, JSON.stringify(Object.fromEntries(teamStats)));

    return teamStats;
  }

  private async calculateHeadToHead(leagueSandbox: string) {
    // Get all matchups
    const matchups = await prisma.matchup.findMany({
      where: { leagueSandbox },
      orderBy: { date: 'asc' },
    });

    // Build head-to-head records
    const h2hMap = new Map<string, any>();

    for (const matchup of matchups) {
      // Get corresponding opponent matchup
      const opponent = await prisma.matchup.findFirst({
        where: {
          leagueSandbox,
          seasonId: matchup.seasonId,
          week: matchup.week,
          teamId: matchup.opponentId,
        },
      });

      if (!opponent) continue;

      // Create consistent key (alphabetically sorted)
      const key = [matchup.teamId, matchup.opponentId].sort().join('-');
      
      if (!h2hMap.has(key)) {
        h2hMap.set(key, {
          team1Id: [matchup.teamId, matchup.opponentId].sort()[0],
          team2Id: [matchup.teamId, matchup.opponentId].sort()[1],
          totalMatchups: 0,
          team1Wins: 0,
          team2Wins: 0,
          ties: 0,
          team1TotalPoints: 0,
          team2TotalPoints: 0,
          team1HighestScore: 0,
          team2HighestScore: 0,
          lastMatchupDate: null,
          playoffMatchups: 0,
          championshipMatchups: 0,
        });
      }

      const h2h = h2hMap.get(key);
      h2h.totalMatchups++;
      
      const isTeam1 = matchup.teamId === h2h.team1Id;
      if (isTeam1) {
        h2h.team1TotalPoints += matchup.pointsFor;
        h2h.team1HighestScore = Math.max(h2h.team1HighestScore, matchup.pointsFor);
        if (matchup.result === 'WIN') h2h.team1Wins++;
        else if (matchup.result === 'TIE') h2h.ties++;
      } else {
        h2h.team2TotalPoints += matchup.pointsFor;
        h2h.team2HighestScore = Math.max(h2h.team2HighestScore, matchup.pointsFor);
        if (matchup.result === 'WIN') h2h.team2Wins++;
      }

      h2h.lastMatchupDate = matchup.date;
      if (matchup.isPlayoff) h2h.playoffMatchups++;
      if (matchup.isChampionship) h2h.championshipMatchups++;
    }

    // Upsert all records
    for (const [key, h2h] of h2hMap) {
      await prisma.headToHeadRecord.upsert({
        where: {
          league_sandbox_team1_id_team2_id: {
            leagueSandbox,
            team1Id: h2h.team1Id,
            team2Id: h2h.team2Id,
          },
        },
        update: h2h,
        create: { ...h2h, leagueSandbox },
      });
    }
  }

  private async calculateAllTimeRecords(leagueSandbox: string) {
    const records = [
      { type: 'HIGHEST_SINGLE_GAME_SCORE', query: this.getHighestScore },
      { type: 'LOWEST_SINGLE_GAME_SCORE', query: this.getLowestScore },
      { type: 'HIGHEST_SEASON_AVERAGE', query: this.getHighestSeasonAverage },
      { type: 'MOST_WINS_SEASON', query: this.getMostWinsSeason },
      { type: 'LONGEST_WIN_STREAK', query: this.getLongestWinStreak },
      { type: 'HIGHEST_TOTAL_SEASON_POINTS', query: this.getHighestTotalPoints },
      { type: 'MOST_CHAMPIONSHIPS', query: this.getMostChampionships },
      { type: 'HIGHEST_PLAYOFF_SCORE', query: this.getHighestPlayoffScore },
      { type: 'BIGGEST_COMEBACK', query: this.getBiggestComeback },
      { type: 'MOST_POINTS_IN_LOSS', query: this.getMostPointsInLoss },
    ];

    for (const { type, query } of records) {
      const result = await query(leagueSandbox);
      if (result) {
        await prisma.allTimeRecord.upsert({
          where: {
            league_sandbox_record_type_record_holder_type: {
              leagueSandbox,
              recordType: type,
              recordHolderType: result.holderType,
            },
          },
          update: {
            recordHolderId: result.holderId,
            recordValue: result.value,
            seasonId: result.seasonId,
            week: result.week,
            dateAchieved: result.date,
            metadata: result.metadata || {},
          },
          create: {
            leagueSandbox,
            recordType: type,
            recordHolderType: result.holderType,
            recordHolderId: result.holderId,
            recordValue: result.value,
            seasonId: result.seasonId,
            week: result.week,
            dateAchieved: result.date,
            metadata: result.metadata || {},
          },
        });
      }
    }
  }

  private async getHighestScore(leagueSandbox: string) {
    const result = await prisma.matchup.findFirst({
      where: { leagueSandbox },
      orderBy: { pointsFor: 'desc' },
      include: { team: true },
    });

    if (!result) return null;

    return {
      holderType: 'TEAM',
      holderId: result.teamId,
      value: result.pointsFor,
      seasonId: result.seasonId,
      week: result.week,
      date: result.date,
      metadata: {
        teamName: result.team.teamName,
        opponentId: result.opponentId,
      },
    };
  }

  private async getLowestScore(leagueSandbox: string) {
    const result = await prisma.matchup.findFirst({
      where: { 
        leagueSandbox,
        pointsFor: { gt: 0 }, // Exclude forfeits
      },
      orderBy: { pointsFor: 'asc' },
      include: { team: true },
    });

    if (!result) return null;

    return {
      holderType: 'TEAM',
      holderId: result.teamId,
      value: result.pointsFor,
      seasonId: result.seasonId,
      week: result.week,
      date: result.date,
      metadata: {
        teamName: result.team.teamName,
        opponentId: result.opponentId,
      },
    };
  }

  private async getHighestSeasonAverage(leagueSandbox: string) {
    const result = await prisma.$queryRaw`
      SELECT 
        team_id,
        season_id,
        AVG(points_for) as avg_points,
        COUNT(*) as games_played
      FROM matchups
      WHERE league_sandbox = ${leagueSandbox}
      GROUP BY team_id, season_id
      HAVING COUNT(*) >= 10
      ORDER BY avg_points DESC
      LIMIT 1
    `;

    if (!result || !Array.isArray(result) || result.length === 0) return null;

    const record = result[0] as any;
    return {
      holderType: 'TEAM',
      holderId: record.team_id,
      value: record.avg_points,
      seasonId: record.season_id,
      week: null,
      date: new Date(),
      metadata: {
        gamesPlayed: record.games_played,
      },
    };
  }

  private async getMostWinsSeason(leagueSandbox: string) {
    const result = await prisma.$queryRaw`
      SELECT 
        team_id,
        season_id,
        COUNT(*) FILTER (WHERE result = 'WIN') as wins
      FROM matchups
      WHERE league_sandbox = ${leagueSandbox}
      GROUP BY team_id, season_id
      ORDER BY wins DESC
      LIMIT 1
    `;

    if (!result || !Array.isArray(result) || result.length === 0) return null;

    const record = result[0] as any;
    return {
      holderType: 'TEAM',
      holderId: record.team_id,
      value: record.wins,
      seasonId: record.season_id,
      week: null,
      date: new Date(),
      metadata: {},
    };
  }

  private async getLongestWinStreak(leagueSandbox: string) {
    // Complex query to find longest streak
    const matchups = await prisma.matchup.findMany({
      where: { leagueSandbox },
      orderBy: [{ teamId: 'asc' }, { date: 'asc' }],
    });

    let longestStreak = 0;
    let streakHolder = null;
    let streakSeason = null;

    const teamStreaks = new Map();

    for (const matchup of matchups) {
      const key = matchup.teamId;
      if (!teamStreaks.has(key)) {
        teamStreaks.set(key, { current: 0, longest: 0, season: null });
      }

      const streak = teamStreaks.get(key);
      if (matchup.result === 'WIN') {
        streak.current++;
        if (streak.current > streak.longest) {
          streak.longest = streak.current;
          streak.season = matchup.seasonId;
          
          if (streak.longest > longestStreak) {
            longestStreak = streak.longest;
            streakHolder = key;
            streakSeason = matchup.seasonId;
          }
        }
      } else {
        streak.current = 0;
      }
    }

    if (!streakHolder) return null;

    return {
      holderType: 'TEAM',
      holderId: streakHolder,
      value: longestStreak,
      seasonId: streakSeason,
      week: null,
      date: new Date(),
      metadata: {},
    };
  }

  private async getHighestTotalPoints(leagueSandbox: string) {
    const result = await prisma.$queryRaw`
      SELECT 
        team_id,
        season_id,
        SUM(points_for) as total_points
      FROM matchups
      WHERE league_sandbox = ${leagueSandbox}
      GROUP BY team_id, season_id
      ORDER BY total_points DESC
      LIMIT 1
    `;

    if (!result || !Array.isArray(result) || result.length === 0) return null;

    const record = result[0] as any;
    return {
      holderType: 'TEAM',
      holderId: record.team_id,
      value: record.total_points,
      seasonId: record.season_id,
      week: null,
      date: new Date(),
      metadata: {},
    };
  }

  private async getMostChampionships(leagueSandbox: string) {
    const result = await prisma.$queryRaw`
      SELECT 
        champion_id,
        COUNT(*) as championships
      FROM championship_records
      WHERE league_sandbox = ${leagueSandbox}
      GROUP BY champion_id
      ORDER BY championships DESC
      LIMIT 1
    `;

    if (!result || !Array.isArray(result) || result.length === 0) return null;

    const record = result[0] as any;
    return {
      holderType: 'TEAM',
      holderId: record.champion_id,
      value: record.championships,
      seasonId: null,
      week: null,
      date: new Date(),
      metadata: {},
    };
  }

  private async getHighestPlayoffScore(leagueSandbox: string) {
    const result = await prisma.matchup.findFirst({
      where: { 
        leagueSandbox,
        isPlayoff: true,
      },
      orderBy: { pointsFor: 'desc' },
    });

    if (!result) return null;

    return {
      holderType: 'TEAM',
      holderId: result.teamId,
      value: result.pointsFor,
      seasonId: result.seasonId,
      week: result.week,
      date: result.date,
      metadata: {
        isChampionship: result.isChampionship,
      },
    };
  }

  private async getBiggestComeback(leagueSandbox: string) {
    // This would require live scoring data - simplified version
    const result = await prisma.$queryRaw`
      SELECT 
        m1.team_id,
        m1.season_id,
        m1.week,
        m1.points_for - m2.points_for as margin
      FROM matchups m1
      JOIN matchups m2 ON m1.opponent_id = m2.team_id 
        AND m1.season_id = m2.season_id 
        AND m1.week = m2.week
      WHERE m1.league_sandbox = ${leagueSandbox}
        AND m1.result = 'WIN'
        AND m1.points_for > m2.points_for
      ORDER BY margin DESC
      LIMIT 1
    `;

    if (!result || !Array.isArray(result) || result.length === 0) return null;

    const record = result[0] as any;
    return {
      holderType: 'TEAM',
      holderId: record.team_id,
      value: record.margin,
      seasonId: record.season_id,
      week: record.week,
      date: new Date(),
      metadata: {},
    };
  }

  private async getMostPointsInLoss(leagueSandbox: string) {
    const result = await prisma.matchup.findFirst({
      where: { 
        leagueSandbox,
        result: 'LOSS',
      },
      orderBy: { pointsFor: 'desc' },
    });

    if (!result) return null;

    return {
      holderType: 'TEAM',
      holderId: result.teamId,
      value: result.pointsFor,
      seasonId: result.seasonId,
      week: result.week,
      date: result.date,
      metadata: {
        opponentId: result.opponentId,
        opponentScore: result.pointsAgainst,
      },
    };
  }

  private async calculatePerformanceTrends(leagueSandbox: string) {
    // Calculate weekly trends
    const recentMatchups = await prisma.matchup.findMany({
      where: { leagueSandbox },
      orderBy: { date: 'desc' },
      take: 100,
    });

    const teamTrends = new Map<string, any[]>();

    for (const matchup of recentMatchups) {
      if (!teamTrends.has(matchup.teamId)) {
        teamTrends.set(matchup.teamId, []);
      }
      teamTrends.get(matchup.teamId)!.push(matchup);
    }

    for (const [teamId, matchups] of teamTrends) {
      if (matchups.length < 3) continue;

      // Calculate recent trend (last 3 games vs previous 3)
      const recent = matchups.slice(0, 3);
      const previous = matchups.slice(3, 6);

      if (previous.length < 3) continue;

      const recentAvg = recent.reduce((sum, m) => sum + m.pointsFor, 0) / recent.length;
      const previousAvg = previous.reduce((sum, m) => sum + m.pointsFor, 0) / previous.length;

      const trendStrength = ((recentAvg - previousAvg) / previousAvg) * 100;
      const trendDirection = trendStrength > 5 ? 'UP' : trendStrength < -5 ? 'DOWN' : 'STABLE';

      await prisma.performanceTrend.upsert({
        where: {
          league_sandbox_entity_type_entity_id_period_type_period_value: {
            leagueSandbox,
            entityType: 'TEAM',
            entityId: teamId,
            periodType: 'WEEKLY',
            periodValue: `${recent[0].seasonId}-W${recent[0].week}`,
          },
        },
        update: {
          metrics: {
            recentAverage: recentAvg,
            previousAverage: previousAvg,
            recentGames: recent.length,
            winPercentage: recent.filter(m => m.result === 'WIN').length / recent.length,
          },
          trendDirection,
          trendStrength,
        },
        create: {
          leagueSandbox,
          entityType: 'TEAM',
          entityId: teamId,
          periodType: 'WEEKLY',
          periodValue: `${recent[0].seasonId}-W${recent[0].week}`,
          metrics: {
            recentAverage: recentAvg,
            previousAverage: previousAvg,
            recentGames: recent.length,
            winPercentage: recent.filter(m => m.result === 'WIN').length / recent.length,
          },
          trendDirection,
          trendStrength,
        },
      });
    }
  }

  private async calculateChampionshipRecords(leagueSandbox: string) {
    // Get all playoff matchups grouped by season
    const seasons = await prisma.season.findMany({
      where: { leagueSandbox },
    });

    for (const season of seasons) {
      const playoffMatchups = await prisma.matchup.findMany({
        where: {
          leagueSandbox,
          seasonId: season.seasonId,
          isPlayoff: true,
        },
        orderBy: { week: 'desc' },
      });

      if (playoffMatchups.length === 0) continue;

      // Find championship game (last week of playoffs)
      const championshipWeek = Math.max(...playoffMatchups.map(m => m.week));
      const championshipMatchups = playoffMatchups.filter(m => m.week === championshipWeek);

      if (championshipMatchups.length >= 2) {
        // Determine champion (highest score in championship)
        const sorted = championshipMatchups.sort((a, b) => b.pointsFor - a.pointsFor);
        
        await prisma.championshipRecord.upsert({
          where: {
            league_sandbox_season_id: {
              leagueSandbox,
              seasonId: season.seasonId,
            },
          },
          update: {
            championId: sorted[0].teamId,
            runnerUpId: sorted[1]?.teamId,
            thirdPlaceId: sorted[2]?.teamId,
            championshipScore: sorted[0].pointsFor,
            runnerUpScore: sorted[1]?.pointsFor,
            playoffBracket: { matchups: playoffMatchups },
          },
          create: {
            leagueSandbox,
            seasonId: season.seasonId,
            championId: sorted[0].teamId,
            runnerUpId: sorted[1]?.teamId,
            thirdPlaceId: sorted[2]?.teamId,
            championshipScore: sorted[0].pointsFor,
            runnerUpScore: sorted[1]?.pointsFor,
            playoffBracket: { matchups: playoffMatchups },
          },
        });
      }
    }
  }

  private async logCalculationStart(data: StatisticsCalculation): Promise<string> {
    const log = await prisma.statisticsCalculation.create({
      data: {
        leagueSandbox: data.leagueSandbox,
        calculationType: data.calculationType,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        metadata: data,
      },
    });
    return log.id;
  }

  private async logCalculationComplete(logId: string, executionTime: number) {
    await prisma.statisticsCalculation.update({
      where: { id: logId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        executionTimeMs: executionTime,
      },
    });
  }

  private async logCalculationError(logId: string, error: Error) {
    await prisma.statisticsCalculation.update({
      where: { id: logId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: error.message,
      },
    });
  }

  async getProgress(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      progress: job.progress,
      state: await job.getState(),
      data: job.data,
      returnValue: job.returnvalue,
      failedReason: job.failedReason,
    };
  }
}
```

### Step 3: Real-time Statistics Updates

```typescript
// /lib/services/realtime-stats.ts

import { Server } from 'socket.io';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { StatisticsEngine } from './statistics-engine';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);
const pubClient = redis.duplicate();
const subClient = redis.duplicate();

export class RealtimeStatsService {
  private io: Server;
  private statsEngine: StatisticsEngine;

  constructor(io: Server) {
    this.io = io;
    this.statsEngine = new StatisticsEngine();
    this.initializeSubscriptions();
  }

  private initializeSubscriptions() {
    // Subscribe to matchup updates
    subClient.subscribe('matchup:update');
    subClient.subscribe('stats:calculate');
    subClient.subscribe('stats:complete');

    subClient.on('message', async (channel, message) => {
      const data = JSON.parse(message);

      switch (channel) {
        case 'matchup:update':
          await this.handleMatchupUpdate(data);
          break;
        case 'stats:calculate':
          await this.handleStatsCalculation(data);
          break;
        case 'stats:complete':
          await this.handleStatsComplete(data);
          break;
      }
    });
  }

  private async handleMatchupUpdate(data: any) {
    const { leagueSandbox, seasonId, week, teamId } = data;

    // Trigger incremental stats update
    await this.statsEngine.queueCalculation({
      leagueSandbox,
      calculationType: 'SEASON',
      seasonId,
    });

    // Get updated stats from cache
    const cacheKey = `stats:${leagueSandbox}:season:${seasonId}`;
    const cachedStats = await redis.get(cacheKey);

    if (cachedStats) {
      // Emit to connected clients in the league room
      this.io.to(`league:${leagueSandbox}`).emit('stats:update', {
        type: 'SEASON',
        seasonId,
        week,
        teamId,
        stats: JSON.parse(cachedStats),
      });
    }

    // Check for new records
    await this.checkForNewRecords(leagueSandbox, data);
  }

  private async checkForNewRecords(leagueSandbox: string, matchupData: any) {
    // Check if this matchup broke any records
    const currentRecords = await prisma.allTimeRecord.findMany({
      where: { leagueSandbox },
    });

    const checks = [
      {
        type: 'HIGHEST_SINGLE_GAME_SCORE',
        value: matchupData.pointsFor,
        check: (record: any) => matchupData.pointsFor > record.recordValue,
      },
      // Add more record checks as needed
    ];

    for (const check of checks) {
      const record = currentRecords.find(r => r.recordType === check.type);
      if (record && check.check(record)) {
        // New record!
        this.io.to(`league:${leagueSandbox}`).emit('record:broken', {
          type: check.type,
          oldRecord: record,
          newValue: check.value,
          achievedBy: matchupData.teamId,
          date: new Date(),
        });

        // Update the record
        await this.statsEngine.queueCalculation({
          leagueSandbox,
          calculationType: 'RECORDS',
        });
      }
    }
  }

  private async handleStatsCalculation(data: any) {
    // Notify clients that calculation has started
    this.io.to(`league:${data.leagueSandbox}`).emit('stats:calculating', {
      type: data.calculationType,
      jobId: data.jobId,
    });
  }

  private async handleStatsComplete(data: any) {
    // Notify clients that calculation is complete
    this.io.to(`league:${data.leagueSandbox}`).emit('stats:ready', {
      type: data.calculationType,
      jobId: data.jobId,
      executionTime: data.executionTime,
    });

    // Send updated data based on calculation type
    switch (data.calculationType) {
      case 'HEAD_TO_HEAD':
        const h2h = await prisma.headToHeadRecord.findMany({
          where: { leagueSandbox: data.leagueSandbox },
        });
        this.io.to(`league:${data.leagueSandbox}`).emit('h2h:update', h2h);
        break;

      case 'RECORDS':
        const records = await prisma.allTimeRecord.findMany({
          where: { leagueSandbox: data.leagueSandbox },
        });
        this.io.to(`league:${data.leagueSandbox}`).emit('records:update', records);
        break;

      case 'TRENDS':
        const trends = await prisma.performanceTrend.findMany({
          where: { leagueSandbox: data.leagueSandbox },
          orderBy: { calculatedAt: 'desc' },
          take: 50,
        });
        this.io.to(`league:${data.leagueSandbox}`).emit('trends:update', trends);
        break;
    }
  }

  async subscribeToLeague(socketId: string, leagueSandbox: string) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      await socket.join(`league:${leagueSandbox}`);
      
      // Send initial stats
      const cacheKey = `stats:${leagueSandbox}:current`;
      const cachedStats = await redis.get(cacheKey);
      if (cachedStats) {
        socket.emit('stats:initial', JSON.parse(cachedStats));
      }
    }
  }

  async unsubscribeFromLeague(socketId: string, leagueSandbox: string) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      await socket.leave(`league:${leagueSandbox}`);
    }
  }

  async publishUpdate(channel: string, data: any) {
    await pubClient.publish(channel, JSON.stringify(data));
  }
}
```

### Step 4: API Routes for Statistics

```typescript
// /app/api/statistics/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { StatisticsEngine } from '@/lib/services/statistics-engine';
import { z } from 'zod';

const prisma = new PrismaClient();
const statsEngine = new StatisticsEngine();

const QuerySchema = z.object({
  leagueSandbox: z.string(),
  type: z.enum(['season', 'alltime', 'h2h', 'trends', 'championships']),
  seasonId: z.string().optional(),
  teamId: z.string().optional(),
  limit: z.number().default(10),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  try {
    const query = QuerySchema.parse({
      leagueSandbox: searchParams.get('leagueSandbox'),
      type: searchParams.get('type'),
      seasonId: searchParams.get('seasonId') || undefined,
      teamId: searchParams.get('teamId') || undefined,
      limit: parseInt(searchParams.get('limit') || '10'),
    });

    let data;

    switch (query.type) {
      case 'season':
        data = await getSeasonStats(query);
        break;
      case 'alltime':
        data = await getAllTimeRecords(query);
        break;
      case 'h2h':
        data = await getHeadToHead(query);
        break;
      case 'trends':
        data = await getTrends(query);
        break;
      case 'championships':
        data = await getChampionships(query);
        break;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Statistics API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}

async function getSeasonStats(query: any) {
  const where: any = { leagueSandbox: query.leagueSandbox };
  if (query.seasonId) where.seasonId = query.seasonId;
  if (query.teamId) where.teamId = query.teamId;

  const stats = await prisma.$queryRaw`
    SELECT * FROM season_statistics
    WHERE league_sandbox = ${query.leagueSandbox}
    ${query.seasonId ? prisma.sql`AND season_id = ${query.seasonId}` : prisma.sql``}
    ${query.teamId ? prisma.sql`AND team_id = ${query.teamId}` : prisma.sql``}
    ORDER BY avg_points_for DESC
    LIMIT ${query.limit}
  `;

  return stats;
}

async function getAllTimeRecords(query: any) {
  return await prisma.allTimeRecord.findMany({
    where: { leagueSandbox: query.leagueSandbox },
    orderBy: { updatedAt: 'desc' },
    take: query.limit,
  });
}

async function getHeadToHead(query: any) {
  if (!query.teamId) {
    return await prisma.headToHeadRecord.findMany({
      where: { leagueSandbox: query.leagueSandbox },
      orderBy: { totalMatchups: 'desc' },
      take: query.limit,
    });
  }

  return await prisma.headToHeadRecord.findMany({
    where: {
      leagueSandbox: query.leagueSandbox,
      OR: [
        { team1Id: query.teamId },
        { team2Id: query.teamId },
      ],
    },
    orderBy: { totalMatchups: 'desc' },
  });
}

async function getTrends(query: any) {
  const where: any = { leagueSandbox: query.leagueSandbox };
  if (query.teamId) {
    where.entityId = query.teamId;
    where.entityType = 'TEAM';
  }

  return await prisma.performanceTrend.findMany({
    where,
    orderBy: { calculatedAt: 'desc' },
    take: query.limit,
  });
}

async function getChampionships(query: any) {
  return await prisma.championshipRecord.findMany({
    where: { leagueSandbox: query.leagueSandbox },
    orderBy: { seasonId: 'desc' },
    take: query.limit,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  const CalculateSchema = z.object({
    leagueSandbox: z.string(),
    calculationType: z.enum(['ALL', 'SEASON', 'HEAD_TO_HEAD', 'RECORDS', 'TRENDS']),
    seasonId: z.string().optional(),
    forceRecalculate: z.boolean().default(false),
  });

  try {
    const data = CalculateSchema.parse(body);
    const jobId = await statsEngine.queueCalculation(data);

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Calculation queued',
    });
  } catch (error) {
    console.error('Statistics calculation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to queue calculation' },
      { status: 500 }
    );
  }
}
```

### Step 5: React Components for Statistics Display

```tsx
// /components/statistics/stats-dashboard.tsx

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface StatsDashboardProps {
  leagueSandbox: string;
  seasonId?: string;
}

export function StatsDashboard({ leagueSandbox, seasonId }: StatsDashboardProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [seasonStats, setSeasonStats] = useState<any[]>([]);
  const [allTimeRecords, setAllTimeRecords] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    // Initialize WebSocket connection
    const newSocket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001');
    setSocket(newSocket);

    newSocket.emit('subscribe:league', leagueSandbox);

    newSocket.on('stats:update', (data) => {
      if (data.type === 'SEASON') {
        fetchSeasonStats();
      }
    });

    newSocket.on('records:update', (data) => {
      setAllTimeRecords(data);
    });

    newSocket.on('trends:update', (data) => {
      setTrends(data);
    });

    newSocket.on('stats:calculating', () => {
      setCalculating(true);
    });

    newSocket.on('stats:ready', () => {
      setCalculating(false);
      fetchAllStats();
    });

    newSocket.on('record:broken', (data) => {
      // Show notification for broken record
      console.log('New record!', data);
    });

    // Initial data fetch
    fetchAllStats();

    return () => {
      newSocket.emit('unsubscribe:league', leagueSandbox);
      newSocket.close();
    };
  }, [leagueSandbox]);

  const fetchAllStats = async () => {
    setLoading(true);
    await Promise.all([
      fetchSeasonStats(),
      fetchAllTimeRecords(),
      fetchTrends(),
    ]);
    setLoading(false);
  };

  const fetchSeasonStats = async () => {
    const response = await fetch(
      `/api/statistics?leagueSandbox=${leagueSandbox}&type=season${
        seasonId ? `&seasonId=${seasonId}` : ''
      }`
    );
    const data = await response.json();
    if (data.success) {
      setSeasonStats(data.data);
    }
  };

  const fetchAllTimeRecords = async () => {
    const response = await fetch(
      `/api/statistics?leagueSandbox=${leagueSandbox}&type=alltime`
    );
    const data = await response.json();
    if (data.success) {
      setAllTimeRecords(data.data);
    }
  };

  const fetchTrends = async () => {
    const response = await fetch(
      `/api/statistics?leagueSandbox=${leagueSandbox}&type=trends`
    );
    const data = await response.json();
    if (data.success) {
      setTrends(data.data);
    }
  };

  const triggerRecalculation = async () => {
    const response = await fetch('/api/statistics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leagueSandbox,
        calculationType: 'ALL',
        forceRecalculate: true,
      }),
    });

    const data = await response.json();
    if (data.success) {
      console.log('Calculation queued:', data.jobId);
    }
  };

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'UP':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'DOWN':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {calculating && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            <span className="text-sm text-blue-800">Recalculating statistics...</span>
          </div>
        </div>
      )}

      <Tabs defaultValue="season" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="season">Season Stats</TabsTrigger>
          <TabsTrigger value="records">All-Time Records</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="season" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Season Standings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {seasonStats.map((stat: any, index: number) => (
                  <div
                    key={stat.team_id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-lg font-semibold text-gray-500">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{stat.team_name}</p>
                        <p className="text-sm text-gray-500">
                          {stat.wins}-{stat.losses}
                          {stat.ties > 0 && `-${stat.ties}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {stat.avg_points_for?.toFixed(1)} PPG
                      </p>
                      <p className="text-sm text-gray-500">
                        {stat.total_points_for?.toFixed(0)} total
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>League Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {allTimeRecords.map((record: any) => (
                  <div
                    key={record.id}
                    className="p-4 border rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">
                        {record.recordType.replace(/_/g, ' ')}
                      </Badge>
                      {record.seasonId && (
                        <span className="text-xs text-gray-500">
                          {record.seasonId}
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-bold">
                      {record.recordValue}
                    </p>
                    <p className="text-sm text-gray-600">
                      {record.metadata?.teamName || record.recordHolderId}
                    </p>
                    {record.week && (
                      <p className="text-xs text-gray-500">Week {record.week}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trends.map((trend: any) => (
                  <div
                    key={trend.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      {getTrendIcon(trend.trendDirection)}
                      <div>
                        <p className="font-medium">{trend.entityId}</p>
                        <p className="text-sm text-gray-500">
                          {trend.periodType} - {trend.periodValue}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        trend.trendStrength > 0 ? 'text-green-600' : 
                        trend.trendStrength < 0 ? 'text-red-600' : 
                        'text-gray-600'
                      }`}>
                        {trend.trendStrength > 0 ? '+' : ''}
                        {trend.trendStrength?.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">
                        {trend.metrics?.recentAverage?.toFixed(1)} PPG
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <button
          onClick={triggerRecalculation}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          disabled={calculating}
        >
          Recalculate All Statistics
        </button>
      </div>
    </div>
  );
}
```

### Step 6: Head-to-Head Comparison Component

```tsx
// /components/statistics/head-to-head.tsx

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

interface HeadToHeadProps {
  leagueSandbox: string;
  teams: Array<{ id: string; name: string }>;
}

export function HeadToHead({ leagueSandbox, teams }: HeadToHeadProps) {
  const [team1, setTeam1] = useState<string>('');
  const [team2, setTeam2] = useState<string>('');
  const [h2hData, setH2hData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (team1 && team2 && team1 !== team2) {
      fetchH2HData();
    }
  }, [team1, team2]);

  const fetchH2HData = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/statistics/h2h?leagueSandbox=${leagueSandbox}&team1=${team1}&team2=${team2}`
      );
      const data = await response.json();
      if (data.success) {
        setH2hData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch H2H data:', error);
    }
    setLoading(false);
  };

  const getWinPercentage = (wins: number, total: number) => {
    if (total === 0) return 0;
    return (wins / total) * 100;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Head-to-Head Comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Select value={team1} onValueChange={setTeam1}>
            <SelectTrigger>
              <SelectValue placeholder="Select Team 1" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={team2} onValueChange={setTeam2}>
            <SelectTrigger>
              <SelectValue placeholder="Select Team 2" />
            </SelectTrigger>
            <SelectContent>
              {teams.filter(t => t.id !== team1).map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}

        {h2hData && !loading && (
          <div className="space-y-6">
            {/* Overall Record */}
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">Overall Record</p>
              <div className="flex items-center space-x-4">
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold">{h2hData.team1Wins}</p>
                  <p className="text-sm text-gray-500">
                    {teams.find(t => t.id === team1)?.name}
                  </p>
                </div>
                <div className="text-gray-400">-</div>
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold">{h2hData.team2Wins}</p>
                  <p className="text-sm text-gray-500">
                    {teams.find(t => t.id === team2)?.name}
                  </p>
                </div>
                {h2hData.ties > 0 && (
                  <>
                    <div className="text-gray-400">-</div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{h2hData.ties}</p>
                      <p className="text-sm text-gray-500">Ties</p>
                    </div>
                  </>
                )}
              </div>
              
              {/* Win percentage bar */}
              <div className="mt-4">
                <Progress 
                  value={getWinPercentage(h2hData.team1Wins, h2hData.totalMatchups)}
                  className="h-3"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-500">
                    {getWinPercentage(h2hData.team1Wins, h2hData.totalMatchups).toFixed(0)}%
                  </span>
                  <span className="text-xs text-gray-500">
                    {getWinPercentage(h2hData.team2Wins, h2hData.totalMatchups).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">Average Score</p>
                <p className="text-xl font-semibold">
                  {(h2hData.team1TotalPoints / h2hData.totalMatchups).toFixed(1)}
                </p>
              </div>
              <div className="space-y-2 text-right">
                <p className="text-sm font-medium text-gray-500">Average Score</p>
                <p className="text-xl font-semibold">
                  {(h2hData.team2TotalPoints / h2hData.totalMatchups).toFixed(1)}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">Highest Score</p>
                <p className="text-xl font-semibold">
                  {h2hData.team1HighestScore.toFixed(1)}
                </p>
              </div>
              <div className="space-y-2 text-right">
                <p className="text-sm font-medium text-gray-500">Highest Score</p>
                <p className="text-xl font-semibold">
                  {h2hData.team2HighestScore.toFixed(1)}
                </p>
              </div>
            </div>

            {/* Playoff/Championship Stats */}
            {(h2hData.playoffMatchups > 0 || h2hData.championshipMatchups > 0) && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium text-gray-500 mb-2">Postseason</p>
                <div className="flex justify-between text-sm">
                  {h2hData.playoffMatchups > 0 && (
                    <span>Playoff Matchups: {h2hData.playoffMatchups}</span>
                  )}
                  {h2hData.championshipMatchups > 0 && (
                    <span className="font-semibold text-primary">
                      Championship Games: {h2hData.championshipMatchups}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Last Matchup */}
            {h2hData.lastMatchupDate && (
              <div className="pt-4 border-t">
                <p className="text-sm text-gray-500">
                  Last matchup: {new Date(h2hData.lastMatchupDate).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        )}

        {!h2hData && !loading && team1 && team2 && team1 !== team2 && (
          <div className="text-center py-8 text-gray-500">
            <p>No head-to-head matchups found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

## Testing Checklist

### Unit Tests
- [ ] Statistics calculation functions
- [ ] Trend analysis algorithms
- [ ] Record comparison logic
- [ ] Materialized view refresh
- [ ] Cache invalidation

### Integration Tests
- [ ] End-to-end statistics calculation
- [ ] Real-time update flow
- [ ] WebSocket event handling
- [ ] Queue processing
- [ ] Database performance

### Performance Tests
- [ ] Large dataset calculations (10+ years)
- [ ] Concurrent calculations
- [ ] Materialized view performance
- [ ] Cache effectiveness
- [ ] Query optimization

## Deployment Steps

1. **Database Migration**
   ```bash
   npx prisma migrate dev --name add_statistics_tables
   ```

2. **Create Materialized View Refresh Job**
   ```bash
   npm run jobs:schedule:stats
   ```

3. **Start Statistics Worker**
   ```bash
   npm run worker:stats
   ```

4. **Initialize Statistics**
   ```bash
   npm run stats:initialize
   ```

5. **Verify Calculations**
   - Check materialized views populated
   - Verify all-time records calculated
   - Test real-time updates
   - Monitor performance metrics

## Success Criteria

- [ ] All statistics calculate correctly
- [ ] Materialized views update on schedule
- [ ] Real-time updates work within 100ms
- [ ] Head-to-head records accurate
- [ ] Performance trends calculated
- [ ] All-time records tracked
- [ ] Championship history maintained
- [ ] < 500ms query response time
- [ ] < 10 second full recalculation

## Notes

- Materialized views significantly improve query performance
- Use background jobs for heavy calculations
- Cache frequently accessed statistics
- Consider partitioning for very large leagues
- Monitor calculation job queue depth
- Implement incremental updates where possible