/**
 * Performance optimizations for the betting engine
 * Includes caching strategies, batch processing, and query optimization
 */

import Redis from 'ioredis';
import { prisma } from '@/lib/prisma';
import { Bet, Bankroll, BetStatus } from '@prisma/client';

export class BettingOptimizations {
  private redis: Redis;
  private cachePrefix = 'betting:opt:';
  
  constructor(redis: Redis) {
    this.redis = redis;
  }
  
  /**
   * Batch fetch bets with optimized query
   */
  async batchFetchBets(
    betIds: string[],
    includeRelations = false
  ): Promise<Map<string, Bet>> {
    const bets = await prisma.bet.findMany({
      where: {
        id: { in: betIds },
      },
      include: includeRelations ? {
        user: true,
        bankroll: true,
        settlement: true,
      } : undefined,
    });
    
    return new Map(bets.map(bet => [bet.id, bet]));
  }
  
  /**
   * Cache frequently accessed bankroll data
   */
  async getCachedBankroll(
    leagueId: string,
    userId: string,
    week: number
  ): Promise<Bankroll | null> {
    const cacheKey = `${this.cachePrefix}bankroll:${leagueId}:${userId}:${week}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fetch from database
    const bankroll = await prisma.bankroll.findFirst({
      where: {
        leagueId,
        userId,
        week,
      },
    });
    
    if (bankroll) {
      // Cache for 5 minutes
      await this.redis.set(
        cacheKey,
        JSON.stringify(bankroll),
        'EX',
        300
      );
    }
    
    return bankroll;
  }
  
  /**
   * Invalidate bankroll cache
   */
  async invalidateBankrollCache(
    leagueId: string,
    userId: string,
    week: number
  ): Promise<void> {
    const cacheKey = `${this.cachePrefix}bankroll:${leagueId}:${userId}:${week}`;
    await this.redis.del(cacheKey);
  }
  
  /**
   * Optimized statistics aggregation with caching
   */
  async getCachedUserStats(
    leagueId: string,
    userId: string
  ): Promise<any> {
    const cacheKey = `${this.cachePrefix}stats:${leagueId}:${userId}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Aggregate statistics
    const [totalStats, weeklyStats] = await Promise.all([
      prisma.bet.aggregate({
        where: {
          leagueId,
          userId,
          status: BetStatus.SETTLED,
        },
        _count: true,
        _sum: {
          stake: true,
          actualPayout: true,
        },
      }),
      prisma.bet.groupBy({
        by: ['week'],
        where: {
          leagueId,
          userId,
          status: BetStatus.SETTLED,
        },
        _count: true,
        _sum: {
          stake: true,
          actualPayout: true,
        },
        orderBy: {
          week: 'desc',
        },
        take: 10,
      }),
    ]);
    
    const stats = {
      total: totalStats,
      weekly: weeklyStats,
      calculated: new Date(),
    };
    
    // Cache for 10 minutes
    await this.redis.set(
      cacheKey,
      JSON.stringify(stats),
      'EX',
      600
    );
    
    return stats;
  }
  
  /**
   * Batch update bankroll balances
   */
  async batchUpdateBankrolls(
    updates: Array<{ bankrollId: string; amount: number }>
  ): Promise<void> {
    // Use transaction for consistency
    await prisma.$transaction(
      updates.map(({ bankrollId, amount }) =>
        prisma.bankroll.update({
          where: { id: bankrollId },
          data: {
            currentBalance: {
              increment: amount,
            },
            profitLoss: {
              increment: amount,
            },
          },
        })
      )
    );
    
    // Invalidate related caches
    const bankrolls = await prisma.bankroll.findMany({
      where: {
        id: { in: updates.map(u => u.bankrollId) },
      },
      select: {
        leagueId: true,
        userId: true,
        week: true,
      },
    });
    
    await Promise.all(
      bankrolls.map(b =>
        this.invalidateBankrollCache(b.leagueId, b.userId, b.week)
      )
    );
  }
  
  /**
   * Optimized bet history query with cursor pagination
   */
  async getOptimizedBetHistory(
    leagueId: string,
    userId: string,
    cursor?: string,
    limit = 20
  ): Promise<{ bets: Bet[]; nextCursor: string | null }> {
    const bets = await prisma.bet.findMany({
      where: {
        leagueId,
        userId,
        status: BetStatus.SETTLED,
        ...(cursor && {
          id: {
            lt: cursor,
          },
        }),
      },
      orderBy: {
        settledAt: 'desc',
      },
      take: limit + 1,
    });
    
    const hasMore = bets.length > limit;
    const results = hasMore ? bets.slice(0, -1) : bets;
    const nextCursor = hasMore ? results[results.length - 1].id : null;
    
    return {
      bets: results,
      nextCursor,
    };
  }
  
  /**
   * Preload and cache odds for active games
   */
  async preloadOddsCache(gameIds: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    // Fetch odds from database
    const odds = await prisma.oddsSnapshot.findMany({
      where: {
        gameId: { in: gameIds },
      },
      orderBy: {
        createdAt: 'desc',
      },
      distinct: ['gameId'],
    });
    
    // Cache each game's odds
    for (const odd of odds) {
      const cacheKey = `${this.cachePrefix}odds:${odd.gameId}`;
      pipeline.set(cacheKey, JSON.stringify(odd.data), 'EX', 300);
    }
    
    await pipeline.exec();
  }
  
  /**
   * Bulk insert bets with optimized transaction
   */
  async bulkInsertBets(bets: any[]): Promise<void> {
    // Split into chunks to avoid overwhelming the database
    const chunkSize = 100;
    for (let i = 0; i < bets.length; i += chunkSize) {
      const chunk = bets.slice(i, i + chunkSize);
      await prisma.bet.createMany({
        data: chunk,
        skipDuplicates: true,
      });
    }
  }
  
  /**
   * Optimized leaderboard calculation
   */
  async getOptimizedLeaderboard(
    leagueId: string,
    week?: number
  ): Promise<any[]> {
    const cacheKey = `${this.cachePrefix}leaderboard:${leagueId}:${week || 'all'}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Calculate leaderboard
    const leaderboard = await prisma.$queryRaw`
      SELECT 
        b.user_id,
        u.name as user_name,
        COUNT(CASE WHEN bet.result = 'WIN' THEN 1 END) as wins,
        COUNT(CASE WHEN bet.result = 'LOSS' THEN 1 END) as losses,
        COUNT(CASE WHEN bet.result = 'PUSH' THEN 1 END) as pushes,
        SUM(bet.stake) as total_wagered,
        SUM(COALESCE(bet.actual_payout, 0)) as total_payout,
        SUM(COALESCE(bet.actual_payout, 0) - bet.stake) as net_profit,
        CASE 
          WHEN SUM(bet.stake) > 0 
          THEN ROUND((SUM(COALESCE(bet.actual_payout, 0) - bet.stake) / SUM(bet.stake)) * 100, 2)
          ELSE 0 
        END as roi,
        COUNT(*) as total_bets,
        CASE 
          WHEN COUNT(*) > 0 
          THEN ROUND(COUNT(CASE WHEN bet.result = 'WIN' THEN 1 END)::numeric / COUNT(*)::numeric * 100, 2)
          ELSE 0 
        END as win_rate
      FROM bankroll b
      INNER JOIN "User" u ON b.user_id = u.id
      LEFT JOIN bet ON bet.bankroll_id = b.id AND bet.status = 'SETTLED'
      WHERE b.league_id = ${leagueId}
      ${week ? prisma.Prisma.sql`AND b.week = ${week}` : prisma.Prisma.empty}
      GROUP BY b.user_id, u.name
      ORDER BY net_profit DESC, win_rate DESC
      LIMIT 25
    `;
    
    // Cache for 5 minutes
    await this.redis.set(
      cacheKey,
      JSON.stringify(leaderboard),
      'EX',
      300
    );
    
    return leaderboard;
  }
  
  /**
   * Warm up caches for active users
   */
  async warmupCaches(leagueId: string): Promise<void> {
    // Get active users
    const activeUsers = await prisma.bankroll.findMany({
      where: {
        leagueId,
        status: 'ACTIVE',
      },
      select: {
        userId: true,
        week: true,
      },
      distinct: ['userId'],
    });
    
    // Preload caches in parallel
    await Promise.all([
      // User stats
      ...activeUsers.map(u =>
        this.getCachedUserStats(leagueId, u.userId)
      ),
      // Current bankrolls
      ...activeUsers.map(u =>
        this.getCachedBankroll(leagueId, u.userId, u.week)
      ),
      // Leaderboard
      this.getOptimizedLeaderboard(leagueId),
    ]);
  }
  
  /**
   * Clean up old data
   */
  async cleanupOldData(daysToKeep = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    // Archive old settled bets
    const oldBets = await prisma.bet.findMany({
      where: {
        status: BetStatus.SETTLED,
        settledAt: {
          lt: cutoffDate,
        },
      },
      select: {
        id: true,
        leagueId: true,
        userId: true,
        week: true,
        stake: true,
        actualPayout: true,
        result: true,
      },
    });
    
    if (oldBets.length > 0) {
      // Store summary data before deletion
      const summaries = oldBets.reduce((acc, bet) => {
        const key = `${bet.leagueId}-${bet.userId}-${bet.week}`;
        if (!acc[key]) {
          acc[key] = {
            leagueId: bet.leagueId,
            userId: bet.userId,
            week: bet.week,
            totalBets: 0,
            totalStake: 0,
            totalPayout: 0,
            wins: 0,
            losses: 0,
            pushes: 0,
          };
        }
        
        acc[key].totalBets++;
        acc[key].totalStake += bet.stake;
        acc[key].totalPayout += bet.actualPayout || 0;
        
        if (bet.result === 'WIN') acc[key].wins++;
        else if (bet.result === 'LOSS') acc[key].losses++;
        else if (bet.result === 'PUSH') acc[key].pushes++;
        
        return acc;
      }, {} as Record<string, any>);
      
      // Store summaries (implement BettingSummary table if needed)
      // await prisma.bettingSummary.createMany({
      //   data: Object.values(summaries),
      //   skipDuplicates: true,
      // });
      
      // Delete old bets
      await prisma.bet.deleteMany({
        where: {
          id: { in: oldBets.map(b => b.id) },
        },
      });
      
      console.log(`Cleaned up ${oldBets.length} old bets`);
    }
  }
  
  /**
   * Index optimization suggestions
   */
  async analyzeIndexUsage(): Promise<any> {
    // Analyze slow queries and suggest indexes
    const slowQueries = await prisma.$queryRaw`
      SELECT 
        query,
        calls,
        mean_exec_time,
        total_exec_time
      FROM pg_stat_statements
      WHERE query LIKE '%bet%' OR query LIKE '%bankroll%'
      ORDER BY mean_exec_time DESC
      LIMIT 10
    `;
    
    const suggestions = [];
    
    // Suggest indexes based on common query patterns
    suggestions.push({
      table: 'bet',
      columns: ['league_id', 'user_id', 'status', 'settled_at'],
      reason: 'Optimize bet history queries',
    });
    
    suggestions.push({
      table: 'bet',
      columns: ['game_id', 'status'],
      reason: 'Optimize game-based bet lookups',
    });
    
    suggestions.push({
      table: 'bankroll',
      columns: ['league_id', 'week', 'status'],
      reason: 'Optimize active bankroll queries',
    });
    
    return {
      slowQueries,
      suggestions,
    };
  }
}