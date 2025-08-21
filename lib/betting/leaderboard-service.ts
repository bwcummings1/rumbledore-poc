/**
 * LeaderboardService - Manages competition leaderboards and standings
 * 
 * This service handles:
 * - Real-time leaderboard calculation
 * - Ranking and scoring algorithms
 * - Movement tracking
 * - Efficient caching and updates
 * - Tie-breaking logic
 */

import { PrismaClient, Prisma } from '@prisma/client';
import {
  LeaderboardStandings,
  LeaderboardEntry,
  CompetitionStats,
  ScoringRules,
  calculateCompetitionScore,
  calculateROI,
} from '@/types/betting';
import { redis } from '@/lib/redis';
import { EventEmitter } from 'events';

export class LeaderboardService extends EventEmitter {
  private prisma: PrismaClient;
  private cachePrefix = 'leaderboard:';
  private cacheTTL = 300; // 5 minutes

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
  }

  /**
   * Calculate and update leaderboard for a competition
   */
  async updateLeaderboard(competitionId: string): Promise<LeaderboardStandings> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        entries: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!competition) {
      throw new Error('Competition not found');
    }

    const scoringRules = competition.scoringRules as ScoringRules;
    
    // Get current leaderboard for movement tracking
    const currentLeaderboard = await this.getLeaderboard(competitionId);
    const currentRankings = new Map<string, number>();
    if (currentLeaderboard) {
      currentLeaderboard.standings.forEach((entry, index) => {
        currentRankings.set(entry.userId, index + 1);
      });
    }

    // Calculate standings for each participant
    const standings: LeaderboardEntry[] = await Promise.all(
      competition.entries.map(async (entry) => {
        const stats = await this.getUserCompetitionStats(
          entry.userId,
          competition.leagueId || undefined,
          competition.startDate,
          competition.endDate
        );

        const score = calculateCompetitionScore(stats, scoringRules);
        const previousRank = currentRankings.get(entry.userId);
        
        return {
          rank: 0, // Will be set after sorting
          userId: entry.userId,
          userName: entry.user.displayName || entry.user.username,
          userAvatar: entry.user.avatarUrl || undefined,
          score,
          profit: stats.totalWon - stats.totalWagered,
          roi: calculateROI(stats.totalWon, stats.totalWagered),
          winRate: stats.totalBets > 0 
            ? (stats.wonBets / stats.totalBets) * 100 
            : 0,
          totalBets: stats.totalBets,
          movement: previousRank ? 0 : undefined, // Will be calculated after sorting
          trend: 'unchanged' as const,
        };
      })
    );

    // Sort standings by score (with tie-breaking)
    standings.sort((a, b) => {
      if (Math.abs(b.score - a.score) < 0.01) {
        // Scores are effectively tied, use tie-breaker
        return this.applyTieBreaker(a, b, scoringRules.tieBreaker);
      }
      return b.score - a.score;
    });

    // Assign ranks and calculate movement
    standings.forEach((entry, index) => {
      entry.rank = index + 1;
      
      const previousRank = currentRankings.get(entry.userId);
      if (previousRank) {
        entry.movement = previousRank - entry.rank;
        if (entry.movement > 0) {
          entry.trend = 'up';
        } else if (entry.movement < 0) {
          entry.trend = 'down';
        }
      }
    });

    // Update database entries with new rankings
    await this.updateEntryRankings(competitionId, standings);

    // Save leaderboard to database
    const leaderboardData: LeaderboardStandings = {
      competitionId,
      standings,
      lastCalculated: new Date(),
      version: (currentLeaderboard?.version || 0) + 1,
    };

    await this.saveLeaderboard(leaderboardData);

    // Cache the result
    await this.cacheLeaderboard(leaderboardData);

    // Emit event for real-time updates
    this.emit('leaderboard:updated', {
      competitionId,
      standings: standings.slice(0, 10), // Top 10 for notifications
    });

    return leaderboardData;
  }

  /**
   * Get leaderboard for a competition
   */
  async getLeaderboard(
    competitionId: string,
    limit?: number,
    offset?: number
  ): Promise<LeaderboardStandings | null> {
    // Check cache first
    const cached = await this.getCachedLeaderboard(competitionId);
    if (cached) {
      if (limit || offset) {
        cached.standings = cached.standings.slice(
          offset || 0,
          limit ? (offset || 0) + limit : undefined
        );
      }
      return cached;
    }

    // Get from database
    const leaderboard = await this.prisma.leaderboard.findUnique({
      where: { competitionId },
    });

    if (!leaderboard) {
      return null;
    }

    const standings = leaderboard.standings as unknown as LeaderboardEntry[];
    
    const result: LeaderboardStandings = {
      competitionId,
      standings: limit || offset 
        ? standings.slice(offset || 0, limit ? (offset || 0) + limit : undefined)
        : standings,
      lastCalculated: leaderboard.lastCalculated,
      version: leaderboard.version,
    };

    // Cache the full result
    if (!limit && !offset) {
      await this.cacheLeaderboard(result);
    }

    return result;
  }

  /**
   * Get user's position in a competition
   */
  async getUserPosition(
    competitionId: string,
    userId: string
  ): Promise<LeaderboardEntry | null> {
    const leaderboard = await this.getLeaderboard(competitionId);
    if (!leaderboard) return null;

    return leaderboard.standings.find(entry => entry.userId === userId) || null;
  }

  /**
   * Get top performers across all competitions
   */
  async getGlobalLeaderboard(
    leagueId?: string,
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    const where: Prisma.CompetitionWhereInput = {
      status: 'COMPLETED',
    };
    
    if (leagueId) {
      where.leagueId = leagueId;
    }

    // Get all first place finishes
    const topPerformers = await this.prisma.competitionEntry.groupBy({
      by: ['userId'],
      where: {
        rank: 1,
        competition: where,
      },
      _count: {
        id: true,
      },
      _sum: {
        profit: true,
      },
      orderBy: [
        {
          _count: {
            id: 'desc',
          },
        },
        {
          _sum: {
            profit: 'desc',
          },
        },
      ],
      take: limit,
    });

    // Get user details
    const userIds = topPerformers.map(p => p.userId);
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    return topPerformers.map((performer, index) => {
      const user = userMap.get(performer.userId);
      return {
        rank: index + 1,
        userId: performer.userId,
        userName: user?.displayName || user?.username || 'Unknown',
        userAvatar: user?.avatarUrl || undefined,
        score: performer._count.id * 100, // Simple scoring based on wins
        profit: Number(performer._sum.profit || 0),
        roi: 0, // Would need more data to calculate
        winRate: 0, // Would need more data to calculate
        totalBets: 0, // Would need more data to calculate
        trend: 'unchanged' as const,
      };
    });
  }

  /**
   * Batch update multiple leaderboards
   */
  async updateMultipleLeaderboards(competitionIds: string[]): Promise<void> {
    for (const competitionId of competitionIds) {
      try {
        await this.updateLeaderboard(competitionId);
        // Add small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to update leaderboard for ${competitionId}:`, error);
      }
    }
  }

  /**
   * Get user's competition statistics
   */
  private async getUserCompetitionStats(
    userId: string,
    leagueId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CompetitionStats> {
    const where: Prisma.BetWhereInput = {
      userId,
      status: { in: ['WON', 'LOST', 'PUSH'] },
    };

    if (leagueId) {
      where.leagueId = leagueId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const bets = await this.prisma.bet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const totalBets = bets.length;
    const wonBets = bets.filter(b => b.status === 'WON').length;
    const totalWagered = bets.reduce((sum, b) => sum + Number(b.stake), 0);
    const totalWon = bets
      .filter(b => b.status === 'WON')
      .reduce((sum, b) => sum + Number(b.actualPayout || 0), 0);

    // Find best and worst bets
    const sortedByProfit = bets
      .filter(b => b.actualPayout !== null)
      .sort((a, b) => {
        const profitA = Number(a.actualPayout || 0) - Number(a.stake);
        const profitB = Number(b.actualPayout || 0) - Number(b.stake);
        return profitB - profitA;
      });

    const bestBet = sortedByProfit[0] || null;
    const worstBet = sortedByProfit[sortedByProfit.length - 1] || null;

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    for (const bet of bets) {
      if (bet.status === 'WON') {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }
    
    // Current streak (from most recent bets)
    for (const bet of bets) {
      if (bet.status === 'WON') {
        currentStreak++;
      } else {
        break;
      }
    }

    // Calculate average odds
    const averageOdds = bets.length > 0
      ? bets.reduce((sum, b) => sum + b.odds, 0) / bets.length
      : 0;

    // Find favorite market
    const marketCounts = bets.reduce((counts, bet) => {
      counts[bet.marketType] = (counts[bet.marketType] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const favoriteMarket = Object.entries(marketCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'H2H';

    return {
      totalBets,
      wonBets,
      totalWagered,
      totalWon,
      bestBet: bestBet ? this.mapBetToInfo(bestBet) : undefined,
      worstBet: worstBet ? this.mapBetToInfo(worstBet) : undefined,
      currentStreak,
      longestStreak,
      averageOdds,
      favoriteMarket: favoriteMarket as any,
    };
  }

  /**
   * Apply tie-breaking rules
   */
  private applyTieBreaker(
    a: LeaderboardEntry,
    b: LeaderboardEntry,
    tieBreaker?: string
  ): number {
    switch (tieBreaker) {
      case 'ROI':
        return b.roi - a.roi;
      case 'WIN_RATE':
        return b.winRate - a.winRate;
      case 'TOTAL_BETS':
        return b.totalBets - a.totalBets;
      case 'PROFIT':
      default:
        return b.profit - a.profit;
    }
  }

  /**
   * Update entry rankings in database
   */
  private async updateEntryRankings(
    competitionId: string,
    standings: LeaderboardEntry[]
  ): Promise<void> {
    // Batch update all entries
    const updates = standings.map(entry =>
      this.prisma.competitionEntry.update({
        where: {
          competitionId_userId: {
            competitionId,
            userId: entry.userId,
          },
        },
        data: {
          rank: entry.rank,
          score: entry.score,
          profit: entry.profit,
          roi: entry.roi,
          winRate: entry.winRate,
          totalBets: entry.totalBets,
          wonBets: Math.round((entry.winRate / 100) * entry.totalBets),
          lastUpdate: new Date(),
        },
      })
    );

    await Promise.all(updates);
  }

  /**
   * Save leaderboard to database
   */
  private async saveLeaderboard(leaderboard: LeaderboardStandings): Promise<void> {
    await this.prisma.leaderboard.upsert({
      where: { competitionId: leaderboard.competitionId },
      update: {
        standings: leaderboard.standings as any,
        lastCalculated: leaderboard.lastCalculated,
        version: leaderboard.version,
        calculatedBy: 'SYSTEM',
      },
      create: {
        competitionId: leaderboard.competitionId,
        standings: leaderboard.standings as any,
        lastCalculated: leaderboard.lastCalculated,
        version: leaderboard.version,
        calculatedBy: 'SYSTEM',
      },
    });
  }

  /**
   * Map bet to BetInfo type
   */
  private mapBetToInfo(bet: any): any {
    return {
      id: bet.id,
      userId: bet.userId,
      leagueId: bet.leagueId,
      leagueSandbox: bet.leagueSandbox,
      bankrollId: bet.bankrollId,
      betSlipId: bet.betSlipId,
      gameId: bet.gameId,
      eventDate: bet.eventDate,
      betType: bet.betType,
      marketType: bet.marketType,
      selection: bet.selection,
      line: bet.line ? Number(bet.line) : undefined,
      odds: bet.odds,
      stake: Number(bet.stake),
      potentialPayout: Number(bet.potentialPayout),
      actualPayout: bet.actualPayout ? Number(bet.actualPayout) : undefined,
      status: bet.status,
      result: bet.result,
      settledAt: bet.settledAt,
      metadata: bet.metadata,
      createdAt: bet.createdAt,
      updatedAt: bet.updatedAt,
    };
  }

  // Cache methods

  private async getCachedLeaderboard(
    competitionId: string
  ): Promise<LeaderboardStandings | null> {
    const key = `${this.cachePrefix}${competitionId}`;
    const cached = await redis.get(key);
    if (!cached) return null;

    return JSON.parse(cached);
  }

  private async cacheLeaderboard(leaderboard: LeaderboardStandings): Promise<void> {
    const key = `${this.cachePrefix}${leaderboard.competitionId}`;
    await redis.setex(key, this.cacheTTL, JSON.stringify(leaderboard));
  }

  /**
   * Clear leaderboard cache
   */
  async clearLeaderboardCache(competitionId: string): Promise<void> {
    const key = `${this.cachePrefix}${competitionId}`;
    await redis.del(key);
  }
}