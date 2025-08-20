// Statistics Engine - Core calculation service
// Sprint 6: Statistics Engine

import { PrismaClient } from '@prisma/client';
import { Queue, Worker, Job } from 'bull';
import Redis from 'ioredis';
import { 
  StatisticsCalculation, 
  CalculationType, 
  CalculationStatus,
  CalculationResult,
  AllTimeRecord,
  SeasonStatistics,
  HeadToHeadRecord,
  PerformanceTrend,
  ChampionshipRecord,
  WeeklyStatistics,
  MatchupResult,
  RecordType,
  RecordHolderType,
  TrendDirection,
  PeriodType
} from '@/types/statistics';

const prisma = new PrismaClient();

export class StatisticsEngine {
  private queue: Queue<StatisticsCalculation>;
  private worker: Worker<StatisticsCalculation>;
  private redis: Redis;
  private pubClient: Redis;

  constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl);
    this.pubClient = this.redis.duplicate();

    // Initialize queue
    this.queue = new Queue('statistics-calculations', redisUrl, {
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Initialize worker
    this.worker = new Worker(
      'statistics-calculations',
      async (job: Job<StatisticsCalculation>) => {
        return this.processCalculation(job.data, job.id || 'unknown');
      },
      {
        connection: this.redis,
        concurrency: 2, // Limit concurrent calculations to avoid overload
      }
    );

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.worker.on('completed', (job) => {
      console.log(`[StatisticsEngine] Job ${job.id} completed`);
      this.pubClient.publish('stats:complete', JSON.stringify({
        jobId: job.id,
        leagueId: job.data.leagueId,
        calculationType: job.data.calculationType,
        executionTime: job.returnvalue?.executionTime,
      }));
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[StatisticsEngine] Job ${job?.id} failed:`, err);
      if (job) {
        this.pubClient.publish('stats:failed', JSON.stringify({
          jobId: job.id,
          leagueId: job.data.leagueId,
          error: err.message,
        }));
      }
    });

    this.worker.on('progress', (job, progress) => {
      console.log(`[StatisticsEngine] Job ${job.id} progress: ${progress}%`);
      this.pubClient.publish('stats:progress', JSON.stringify({
        jobId: job.id,
        leagueId: job.data.leagueId,
        progress,
      }));
    });
  }

  async queueCalculation(data: StatisticsCalculation): Promise<string> {
    const job = await this.queue.add('calculate', data, {
      priority: data.priority || (data.calculationType === CalculationType.ALL ? 1 : 10),
    });

    // Notify clients that calculation has started
    this.pubClient.publish('stats:calculate', JSON.stringify({
      jobId: job.id,
      leagueId: data.leagueId,
      calculationType: data.calculationType,
    }));

    return job.id as string;
  }

  private async processCalculation(
    data: StatisticsCalculation,
    jobId: string
  ): Promise<CalculationResult> {
    const startTime = Date.now();
    const logId = await this.logCalculationStart(data);

    try {
      let result: CalculationResult = { success: true };

      switch (data.calculationType) {
        case CalculationType.ALL:
          result = await this.calculateAllStatistics(data.leagueId, jobId);
          break;
        case CalculationType.SEASON:
          result = await this.calculateSeasonStatistics(
            data.leagueId,
            data.seasonId!,
            jobId
          );
          break;
        case CalculationType.HEAD_TO_HEAD:
          result = await this.calculateHeadToHead(data.leagueId, jobId);
          break;
        case CalculationType.RECORDS:
          result = await this.calculateAllTimeRecords(data.leagueId, jobId);
          break;
        case CalculationType.TRENDS:
          result = await this.calculatePerformanceTrends(data.leagueId, jobId);
          break;
        case CalculationType.CHAMPIONSHIPS:
          result = await this.calculateChampionshipRecords(data.leagueId, jobId);
          break;
        default:
          throw new Error(`Unknown calculation type: ${data.calculationType}`);
      }

      const executionTime = Date.now() - startTime;
      await this.logCalculationComplete(logId, executionTime, result.recordsProcessed || 0);

      return {
        ...result,
        executionTime,
        jobId,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.logCalculationError(logId, error as Error);
      throw error;
    }
  }

  private async calculateAllStatistics(
    leagueId: string,
    jobId: string
  ): Promise<CalculationResult> {
    console.log(`[StatisticsEngine] Calculating all statistics for league ${leagueId}`);
    
    // Update progress
    const job = await this.queue.getJob(jobId);
    await job?.updateProgress(10);

    // First, populate weekly statistics from matchup data
    await this.populateWeeklyStatistics(leagueId);
    await job?.updateProgress(25);

    // Refresh materialized views
    await prisma.$executeRaw`
      SELECT refresh_statistics_views();
    `;
    await job?.updateProgress(40);

    // Calculate all sub-statistics in parallel
    const results = await Promise.all([
      this.calculateSeasonStatistics(leagueId, undefined, jobId),
      this.calculateHeadToHead(leagueId, jobId),
      this.calculateAllTimeRecords(leagueId, jobId),
      this.calculatePerformanceTrends(leagueId, jobId),
      this.calculateChampionshipRecords(leagueId, jobId),
    ]);
    await job?.updateProgress(90);

    // Clear cache for this league
    const cachePattern = `stats:${leagueId}:*`;
    const keys = await this.redis.keys(cachePattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    await job?.updateProgress(100);

    const totalRecords = results.reduce((sum, r) => sum + (r.recordsProcessed || 0), 0);

    return {
      success: true,
      recordsProcessed: totalRecords,
      data: {
        message: 'All statistics calculated successfully',
        breakdown: results.map((r, i) => ({
          type: ['SEASON', 'HEAD_TO_HEAD', 'RECORDS', 'TRENDS', 'CHAMPIONSHIPS'][i],
          recordsProcessed: r.recordsProcessed || 0,
        })),
      },
    };
  }

  private async populateWeeklyStatistics(leagueId: string): Promise<void> {
    // Get all matchups for the league
    const matchups = await prisma.leagueMatchup.findMany({
      where: { leagueId },
      orderBy: [{ week: 'asc' }],
    });

    const weeklyStatsMap = new Map<string, any>();

    for (const matchup of matchups) {
      // Create entries for both home and away teams
      const homeKey = `${leagueId}-${matchup.week}-${matchup.homeTeamId}`;
      const awayKey = `${leagueId}-${matchup.week}-${matchup.awayTeamId}`;

      // Determine results
      let homeResult: MatchupResult | undefined;
      let awayResult: MatchupResult | undefined;
      let marginHome = 0;
      let marginAway = 0;

      if (matchup.homeScore !== null && matchup.awayScore !== null) {
        marginHome = matchup.homeScore - matchup.awayScore;
        marginAway = matchup.awayScore - matchup.homeScore;

        if (matchup.homeScore > matchup.awayScore) {
          homeResult = MatchupResult.WIN;
          awayResult = MatchupResult.LOSS;
        } else if (matchup.awayScore > matchup.homeScore) {
          homeResult = MatchupResult.LOSS;
          awayResult = MatchupResult.WIN;
        } else {
          homeResult = MatchupResult.TIE;
          awayResult = MatchupResult.TIE;
        }
      }

      // Store home team stats
      weeklyStatsMap.set(homeKey, {
        leagueId,
        season: '2024', // You may need to determine season from matchup data
        week: matchup.week,
        teamId: matchup.homeTeamId,
        opponentId: matchup.awayTeamId,
        pointsFor: matchup.homeScore || 0,
        pointsAgainst: matchup.awayScore || 0,
        result: homeResult,
        isPlayoff: matchup.isPlayoffs,
        isChampionship: false, // You may need additional logic here
        marginOfVictory: marginHome,
      });

      // Store away team stats
      weeklyStatsMap.set(awayKey, {
        leagueId,
        season: '2024',
        week: matchup.week,
        teamId: matchup.awayTeamId,
        opponentId: matchup.homeTeamId,
        pointsFor: matchup.awayScore || 0,
        pointsAgainst: matchup.homeScore || 0,
        result: awayResult,
        isPlayoff: matchup.isPlayoffs,
        isChampionship: false,
        marginOfVictory: marginAway,
      });
    }

    // Upsert all weekly statistics
    for (const [key, stats] of weeklyStatsMap) {
      await prisma.weeklyStatistics.upsert({
        where: {
          leagueId_season_week_teamId: {
            leagueId: stats.leagueId,
            season: stats.season,
            week: stats.week,
            teamId: stats.teamId,
          },
        },
        update: stats,
        create: stats,
      });
    }
  }

  async calculateSeasonStatistics(
    leagueId: string,
    seasonId?: string,
    jobId?: string
  ): Promise<CalculationResult> {
    console.log(`[StatisticsEngine] Calculating season statistics for league ${leagueId}`);

    // Get weekly statistics
    const where: any = { leagueId };
    if (seasonId) {
      where.season = seasonId;
    }

    const weeklyStats = await prisma.weeklyStatistics.findMany({
      where,
      orderBy: [{ season: 'asc' }, { week: 'asc' }],
    });

    // Group by team and season
    const teamSeasonMap = new Map<string, any>();

    for (const stat of weeklyStats) {
      const key = `${stat.teamId}-${stat.season}`;
      
      if (!teamSeasonMap.has(key)) {
        teamSeasonMap.set(key, {
          leagueId,
          season: stat.season,
          teamId: stat.teamId,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          scores: [],
          currentStreak: { type: null, count: 0 },
          longestWinStreak: 0,
          longestLossStreak: 0,
          highestScore: 0,
          lowestScore: Infinity,
          weeklyResults: [],
        });
      }

      const teamStats = teamSeasonMap.get(key);
      teamStats.pointsFor += Number(stat.pointsFor);
      teamStats.pointsAgainst += Number(stat.pointsAgainst || 0);
      teamStats.scores.push(Number(stat.pointsFor));
      
      if (Number(stat.pointsFor) > teamStats.highestScore) {
        teamStats.highestScore = Number(stat.pointsFor);
      }
      if (Number(stat.pointsFor) < teamStats.lowestScore && Number(stat.pointsFor) > 0) {
        teamStats.lowestScore = Number(stat.pointsFor);
      }

      // Track W/L/T and streaks
      if (stat.result === MatchupResult.WIN) {
        teamStats.wins++;
        if (teamStats.currentStreak.type === MatchupResult.WIN) {
          teamStats.currentStreak.count++;
        } else {
          teamStats.currentStreak = { type: MatchupResult.WIN, count: 1 };
        }
        teamStats.longestWinStreak = Math.max(
          teamStats.longestWinStreak,
          teamStats.currentStreak.count
        );
      } else if (stat.result === MatchupResult.LOSS) {
        teamStats.losses++;
        if (teamStats.currentStreak.type === MatchupResult.LOSS) {
          teamStats.currentStreak.count++;
        } else {
          teamStats.currentStreak = { type: MatchupResult.LOSS, count: 1 };
        }
        teamStats.longestLossStreak = Math.max(
          teamStats.longestLossStreak,
          teamStats.currentStreak.count
        );
      } else if (stat.result === MatchupResult.TIE) {
        teamStats.ties++;
        teamStats.currentStreak = { type: MatchupResult.TIE, count: 1 };
      }

      teamStats.weeklyResults.push(stat.result);
    }

    // Calculate averages and standard deviation, then save
    let recordsProcessed = 0;
    for (const [key, stats] of teamSeasonMap) {
      const gamesPlayed = stats.wins + stats.losses + stats.ties;
      
      if (gamesPlayed > 0) {
        stats.avgPointsFor = stats.pointsFor / gamesPlayed;
        stats.avgPointsAgainst = stats.pointsAgainst / gamesPlayed;
        
        // Calculate standard deviation
        const mean = stats.avgPointsFor;
        const variance = stats.scores.reduce((sum: number, score: number) => {
          return sum + Math.pow(score - mean, 2);
        }, 0) / gamesPlayed;
        stats.pointsStdDev = Math.sqrt(variance);
      }

      // Remove temporary fields
      delete stats.scores;
      delete stats.weeklyResults;

      // Set final streak info
      stats.currentStreakType = stats.currentStreak.type;
      stats.currentStreakCount = stats.currentStreak.count;
      delete stats.currentStreak;

      // Handle infinity case for lowest score
      if (stats.lowestScore === Infinity) {
        stats.lowestScore = 0;
      }

      // Upsert season statistics
      await prisma.seasonStatistics.upsert({
        where: {
          leagueId_season_teamId: {
            leagueId: stats.leagueId,
            season: stats.season,
            teamId: stats.teamId,
          },
        },
        update: stats,
        create: stats,
      });
      recordsProcessed++;
    }

    // Cache the results
    const cacheKey = `stats:${leagueId}:season${seasonId ? `:${seasonId}` : ''}`;
    await this.redis.setex(
      cacheKey,
      3600, // 1 hour TTL
      JSON.stringify(Array.from(teamSeasonMap.values()))
    );

    return {
      success: true,
      recordsProcessed,
      data: { message: `Processed ${recordsProcessed} season statistics` },
    };
  }

  async calculateHeadToHead(leagueId: string, jobId?: string): Promise<CalculationResult> {
    console.log(`[StatisticsEngine] Calculating head-to-head records for league ${leagueId}`);

    const weeklyStats = await prisma.weeklyStatistics.findMany({
      where: { leagueId },
      orderBy: [{ season: 'asc' }, { week: 'asc' }],
    });

    const h2hMap = new Map<string, any>();

    for (const stat of weeklyStats) {
      if (!stat.opponentId) continue;

      // Create consistent key (alphabetically sorted team IDs)
      const key = [stat.teamId, stat.opponentId].sort().join('-');
      
      if (!h2hMap.has(key)) {
        const [team1Id, team2Id] = [stat.teamId, stat.opponentId].sort();
        h2hMap.set(key, {
          leagueId,
          team1Id,
          team2Id,
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
      const isTeam1 = stat.teamId === h2h.team1Id;
      
      // Only count each matchup once (from one team's perspective)
      if (isTeam1) {
        h2h.totalMatchups++;
        h2h.team1TotalPoints += Number(stat.pointsFor);
        h2h.team2TotalPoints += Number(stat.pointsAgainst || 0);
        
        if (Number(stat.pointsFor) > h2h.team1HighestScore) {
          h2h.team1HighestScore = Number(stat.pointsFor);
        }
        if (Number(stat.pointsAgainst || 0) > h2h.team2HighestScore) {
          h2h.team2HighestScore = Number(stat.pointsAgainst || 0);
        }

        if (stat.result === MatchupResult.WIN) {
          h2h.team1Wins++;
        } else if (stat.result === MatchupResult.LOSS) {
          h2h.team2Wins++;
        } else if (stat.result === MatchupResult.TIE) {
          h2h.ties++;
        }

        h2h.lastMatchupDate = new Date(); // You may want to derive this from season/week
        if (stat.isPlayoff) h2h.playoffMatchups++;
        if (stat.isChampionship) h2h.championshipMatchups++;
      }
    }

    // Upsert all head-to-head records
    let recordsProcessed = 0;
    for (const [key, h2h] of h2hMap) {
      await prisma.headToHeadRecord.upsert({
        where: {
          leagueId_team1Id_team2Id: {
            leagueId: h2h.leagueId,
            team1Id: h2h.team1Id,
            team2Id: h2h.team2Id,
          },
        },
        update: h2h,
        create: h2h,
      });
      recordsProcessed++;
    }

    // Cache the results
    const cacheKey = `stats:${leagueId}:h2h`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify(Array.from(h2hMap.values())));

    return {
      success: true,
      recordsProcessed,
      data: { message: `Processed ${recordsProcessed} head-to-head records` },
    };
  }

  async calculateAllTimeRecords(leagueId: string, jobId?: string): Promise<CalculationResult> {
    console.log(`[StatisticsEngine] Calculating all-time records for league ${leagueId}`);

    const recordQueries = [
      { type: RecordType.HIGHEST_SINGLE_GAME_SCORE, query: () => this.getHighestScore(leagueId) },
      { type: RecordType.LOWEST_SINGLE_GAME_SCORE, query: () => this.getLowestScore(leagueId) },
      { type: RecordType.HIGHEST_SEASON_AVERAGE, query: () => this.getHighestSeasonAverage(leagueId) },
      { type: RecordType.MOST_WINS_SEASON, query: () => this.getMostWinsSeason(leagueId) },
      { type: RecordType.LONGEST_WIN_STREAK, query: () => this.getLongestWinStreak(leagueId) },
      { type: RecordType.HIGHEST_TOTAL_SEASON_POINTS, query: () => this.getHighestTotalPoints(leagueId) },
      { type: RecordType.MOST_CHAMPIONSHIPS, query: () => this.getMostChampionships(leagueId) },
      { type: RecordType.HIGHEST_PLAYOFF_SCORE, query: () => this.getHighestPlayoffScore(leagueId) },
      { type: RecordType.MOST_POINTS_IN_LOSS, query: () => this.getMostPointsInLoss(leagueId) },
    ];

    let recordsProcessed = 0;
    for (const { type, query } of recordQueries) {
      const result = await query();
      if (result) {
        await prisma.allTimeRecord.upsert({
          where: {
            leagueId_recordType_recordHolderType: {
              leagueId,
              recordType: type,
              recordHolderType: result.holderType,
            },
          },
          update: {
            recordHolderId: result.holderId,
            recordValue: result.value,
            season: result.season,
            week: result.week,
            dateAchieved: result.date,
            metadata: result.metadata || {},
            updatedAt: new Date(),
          },
          create: {
            leagueId,
            recordType: type,
            recordHolderType: result.holderType,
            recordHolderId: result.holderId,
            recordValue: result.value,
            season: result.season,
            week: result.week,
            dateAchieved: result.date,
            metadata: result.metadata || {},
          },
        });
        recordsProcessed++;
      }
    }

    // Cache the results
    const records = await prisma.allTimeRecord.findMany({ where: { leagueId } });
    const cacheKey = `stats:${leagueId}:records`;
    await this.redis.setex(cacheKey, 3600, JSON.stringify(records));

    return {
      success: true,
      recordsProcessed,
      data: { message: `Processed ${recordsProcessed} all-time records` },
    };
  }

  private async getHighestScore(leagueId: string) {
    const result = await prisma.weeklyStatistics.findFirst({
      where: { leagueId },
      orderBy: { pointsFor: 'desc' },
    });

    if (!result) return null;

    return {
      holderType: RecordHolderType.TEAM,
      holderId: result.teamId,
      value: result.pointsFor,
      season: result.season,
      week: result.week,
      date: result.createdAt,
      metadata: {
        opponentId: result.opponentId,
      },
    };
  }

  private async getLowestScore(leagueId: string) {
    const result = await prisma.weeklyStatistics.findFirst({
      where: { 
        leagueId,
        pointsFor: { gt: 0 }, // Exclude forfeits
      },
      orderBy: { pointsFor: 'asc' },
    });

    if (!result) return null;

    return {
      holderType: RecordHolderType.TEAM,
      holderId: result.teamId,
      value: result.pointsFor,
      season: result.season,
      week: result.week,
      date: result.createdAt,
      metadata: {
        opponentId: result.opponentId,
      },
    };
  }

  private async getHighestSeasonAverage(leagueId: string) {
    const result = await prisma.seasonStatistics.findFirst({
      where: { leagueId },
      orderBy: { avgPointsFor: 'desc' },
    });

    if (!result || !result.avgPointsFor) return null;

    return {
      holderType: RecordHolderType.TEAM,
      holderId: result.teamId,
      value: result.avgPointsFor,
      season: result.season,
      week: null,
      date: new Date(),
      metadata: {
        gamesPlayed: result.wins + result.losses + result.ties,
      },
    };
  }

  private async getMostWinsSeason(leagueId: string) {
    const result = await prisma.seasonStatistics.findFirst({
      where: { leagueId },
      orderBy: { wins: 'desc' },
    });

    if (!result) return null;

    return {
      holderType: RecordHolderType.TEAM,
      holderId: result.teamId,
      value: result.wins,
      season: result.season,
      week: null,
      date: new Date(),
      metadata: {
        record: `${result.wins}-${result.losses}${result.ties > 0 ? `-${result.ties}` : ''}`,
      },
    };
  }

  private async getLongestWinStreak(leagueId: string) {
    const result = await prisma.seasonStatistics.findFirst({
      where: { leagueId },
      orderBy: { longestWinStreak: 'desc' },
    });

    if (!result) return null;

    return {
      holderType: RecordHolderType.TEAM,
      holderId: result.teamId,
      value: result.longestWinStreak,
      season: result.season,
      week: null,
      date: new Date(),
      metadata: {},
    };
  }

  private async getHighestTotalPoints(leagueId: string) {
    const result = await prisma.seasonStatistics.findFirst({
      where: { leagueId },
      orderBy: { pointsFor: 'desc' },
    });

    if (!result) return null;

    return {
      holderType: RecordHolderType.TEAM,
      holderId: result.teamId,
      value: result.pointsFor,
      season: result.season,
      week: null,
      date: new Date(),
      metadata: {},
    };
  }

  private async getMostChampionships(leagueId: string) {
    const championships = await prisma.championshipRecord.groupBy({
      by: ['championId'],
      where: { leagueId },
      _count: {
        championId: true,
      },
      orderBy: {
        _count: {
          championId: 'desc',
        },
      },
      take: 1,
    });

    if (!championships.length) return null;

    return {
      holderType: RecordHolderType.TEAM,
      holderId: championships[0].championId,
      value: championships[0]._count.championId,
      season: null,
      week: null,
      date: new Date(),
      metadata: {},
    };
  }

  private async getHighestPlayoffScore(leagueId: string) {
    const result = await prisma.weeklyStatistics.findFirst({
      where: { 
        leagueId,
        isPlayoff: true,
      },
      orderBy: { pointsFor: 'desc' },
    });

    if (!result) return null;

    return {
      holderType: RecordHolderType.TEAM,
      holderId: result.teamId,
      value: result.pointsFor,
      season: result.season,
      week: result.week,
      date: result.createdAt,
      metadata: {
        isChampionship: result.isChampionship,
      },
    };
  }

  private async getMostPointsInLoss(leagueId: string) {
    const result = await prisma.weeklyStatistics.findFirst({
      where: { 
        leagueId,
        result: MatchupResult.LOSS,
      },
      orderBy: { pointsFor: 'desc' },
    });

    if (!result) return null;

    return {
      holderType: RecordHolderType.TEAM,
      holderId: result.teamId,
      value: result.pointsFor,
      season: result.season,
      week: result.week,
      date: result.createdAt,
      metadata: {
        opponentId: result.opponentId,
        opponentScore: result.pointsAgainst,
      },
    };
  }

  async calculatePerformanceTrends(leagueId: string, jobId?: string): Promise<CalculationResult> {
    console.log(`[StatisticsEngine] Calculating performance trends for league ${leagueId}`);

    // Get recent weekly statistics
    const recentStats = await prisma.weeklyStatistics.findMany({
      where: { leagueId },
      orderBy: [{ season: 'desc' }, { week: 'desc' }],
      take: 200, // Last ~12 weeks of data for a 12-team league
    });

    const teamTrends = new Map<string, any[]>();

    // Group by team
    for (const stat of recentStats) {
      if (!teamTrends.has(stat.teamId)) {
        teamTrends.set(stat.teamId, []);
      }
      teamTrends.get(stat.teamId)!.push(stat);
    }

    let recordsProcessed = 0;
    for (const [teamId, stats] of teamTrends) {
      if (stats.length < 3) continue; // Need at least 3 games for trend

      // Calculate recent trend (last 3 games vs previous 3)
      const recent = stats.slice(0, 3);
      const previous = stats.slice(3, 6);

      if (previous.length < 3) continue;

      const recentAvg = recent.reduce((sum, s) => sum + Number(s.pointsFor), 0) / recent.length;
      const previousAvg = previous.reduce((sum, s) => sum + Number(s.pointsFor), 0) / previous.length;
      const recentWins = recent.filter(s => s.result === MatchupResult.WIN).length;

      const trendStrength = ((recentAvg - previousAvg) / previousAvg) * 100;
      const trendDirection = trendStrength > 5 ? TrendDirection.UP : 
                            trendStrength < -5 ? TrendDirection.DOWN : 
                            TrendDirection.STABLE;

      const periodValue = `${recent[0].season}-W${recent[0].week}`;

      await prisma.performanceTrend.upsert({
        where: {
          leagueId_entityType_entityId_periodType_periodValue: {
            leagueId,
            entityType: RecordHolderType.TEAM,
            entityId: teamId,
            periodType: PeriodType.WEEKLY,
            periodValue,
          },
        },
        update: {
          metrics: {
            recentAverage: recentAvg,
            previousAverage: previousAvg,
            recentGames: recent.length,
            winPercentage: (recentWins / recent.length) * 100,
            pointsPerGame: recentAvg,
          },
          trendDirection,
          trendStrength,
          calculatedAt: new Date(),
        },
        create: {
          leagueId,
          entityType: RecordHolderType.TEAM,
          entityId: teamId,
          periodType: PeriodType.WEEKLY,
          periodValue,
          metrics: {
            recentAverage: recentAvg,
            previousAverage: previousAvg,
            recentGames: recent.length,
            winPercentage: (recentWins / recent.length) * 100,
            pointsPerGame: recentAvg,
          },
          trendDirection,
          trendStrength,
        },
      });
      recordsProcessed++;
    }

    return {
      success: true,
      recordsProcessed,
      data: { message: `Processed ${recordsProcessed} performance trends` },
    };
  }

  async calculateChampionshipRecords(leagueId: string, jobId?: string): Promise<CalculationResult> {
    console.log(`[StatisticsEngine] Calculating championship records for league ${leagueId}`);

    // Get playoff matchups grouped by season
    const playoffStats = await prisma.weeklyStatistics.findMany({
      where: {
        leagueId,
        isPlayoff: true,
      },
      orderBy: [{ season: 'asc' }, { week: 'desc' }],
    });

    // Group by season
    const seasonMap = new Map<string, any[]>();
    for (const stat of playoffStats) {
      if (!seasonMap.has(stat.season)) {
        seasonMap.set(stat.season, []);
      }
      seasonMap.get(stat.season)!.push(stat);
    }

    let recordsProcessed = 0;
    for (const [season, stats] of seasonMap) {
      if (stats.length === 0) continue;

      // Find championship game (assuming it's the last week)
      const championshipWeek = Math.max(...stats.map(s => s.week));
      const championshipGames = stats.filter(s => s.week === championshipWeek);

      if (championshipGames.length >= 2) {
        // Determine champion (highest score in championship)
        const sorted = championshipGames.sort((a, b) => 
          Number(b.pointsFor) - Number(a.pointsFor)
        );

        await prisma.championshipRecord.upsert({
          where: {
            leagueId_season: {
              leagueId,
              season,
            },
          },
          update: {
            championId: sorted[0].teamId,
            runnerUpId: sorted[1]?.teamId,
            thirdPlaceId: sorted[2]?.teamId,
            championshipScore: sorted[0].pointsFor,
            runnerUpScore: sorted[1]?.pointsFor,
            playoffBracket: { games: stats },
          },
          create: {
            leagueId,
            season,
            championId: sorted[0].teamId,
            runnerUpId: sorted[1]?.teamId,
            thirdPlaceId: sorted[2]?.teamId,
            championshipScore: sorted[0].pointsFor,
            runnerUpScore: sorted[1]?.pointsFor,
            playoffBracket: { games: stats },
          },
        });
        recordsProcessed++;
      }
    }

    return {
      success: true,
      recordsProcessed,
      data: { message: `Processed ${recordsProcessed} championship records` },
    };
  }

  private async logCalculationStart(data: StatisticsCalculation): Promise<string> {
    const log = await prisma.statisticsCalculation.create({
      data: {
        leagueId: data.leagueId,
        calculationType: data.calculationType,
        status: CalculationStatus.IN_PROGRESS,
        startedAt: new Date(),
        metadata: data,
      },
    });
    return log.id;
  }

  private async logCalculationComplete(logId: string, executionTime: number, recordsProcessed: number) {
    await prisma.statisticsCalculation.update({
      where: { id: logId },
      data: {
        status: CalculationStatus.COMPLETED,
        completedAt: new Date(),
        executionTimeMs: executionTime,
        recordsProcessed,
      },
    });
  }

  private async logCalculationError(logId: string, error: Error) {
    await prisma.statisticsCalculation.update({
      where: { id: logId },
      data: {
        status: CalculationStatus.FAILED,
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
      progress: job.progress(),
      state: await job.getState(),
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  async shutdown() {
    await this.queue.close();
    await this.worker.close();
    this.redis.disconnect();
    this.pubClient.disconnect();
  }
}