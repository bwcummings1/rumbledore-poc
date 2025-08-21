/**
 * BankrollManager - Manages user bankrolls for paper betting
 * 
 * This service handles:
 * - Weekly bankroll initialization (1000 units)
 * - Balance tracking and updates
 * - Transaction history
 * - ROI calculations
 * - Weekly resets
 */

import { PrismaClient, BankrollStatus, Prisma } from '@prisma/client';
import { 
  BankrollInfo, 
  DEFAULT_BETTING_LIMITS, 
  calculateROI,
  BettingStats 
} from '@/types/betting';
import { redis } from '@/lib/redis';

export class BankrollManager {
  private prisma: PrismaClient;
  private cachePrefix = 'bankroll:';
  private cacheTTL = 300; // 5 minutes

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get current NFL week number based on date
   */
  private getCurrentWeek(): number {
    const now = new Date();
    const seasonStart = new Date(now.getFullYear(), 8, 1); // September 1st
    
    // If before September, use previous year's season
    if (now.getMonth() < 8) {
      seasonStart.setFullYear(now.getFullYear() - 1);
    }
    
    // Calculate weeks since season start (NFL weeks start on Tuesday)
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / msPerWeek);
    
    // NFL regular season is 18 weeks
    return Math.min(Math.max(1, weeksSinceStart + 1), 18);
  }

  /**
   * Get current NFL season year
   */
  private getCurrentSeason(): number {
    const now = new Date();
    // NFL season starts in September and ends in January/February
    // If we're in Jan-Aug, we're still in the previous year's season
    return now.getMonth() < 8 ? now.getFullYear() - 1 : now.getFullYear();
  }

  /**
   * Initialize or get weekly bankroll for a user
   */
  async initializeWeeklyBankroll(
    userId: string, 
    leagueId: string,
    leagueSandbox: string,
    week?: number,
    season?: number
  ): Promise<BankrollInfo> {
    const currentWeek = week ?? this.getCurrentWeek();
    const currentSeason = season ?? this.getCurrentSeason();

    // Check cache first
    const cacheKey = `${this.cachePrefix}${userId}:${leagueId}:${currentWeek}:${currentSeason}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Check if bankroll already exists
    const existingBankroll = await this.prisma.bankroll.findUnique({
      where: {
        userId_leagueId_week_season: {
          userId,
          leagueId,
          week: currentWeek,
          season: currentSeason,
        },
      },
    });

    if (existingBankroll) {
      const bankrollInfo = this.toBankrollInfo(existingBankroll);
      await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(bankrollInfo));
      return bankrollInfo;
    }

    // Create new bankroll
    const newBankroll = await this.prisma.bankroll.create({
      data: {
        userId,
        leagueId,
        leagueSandbox,
        week: currentWeek,
        season: currentSeason,
        startingBalance: DEFAULT_BETTING_LIMITS.weeklyBankroll,
        currentBalance: DEFAULT_BETTING_LIMITS.weeklyBankroll,
        status: BankrollStatus.ACTIVE,
      },
    });

    const bankrollInfo = this.toBankrollInfo(newBankroll);
    await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(bankrollInfo));
    return bankrollInfo;
  }

  /**
   * Get bankroll for a specific week
   */
  async getBankroll(
    userId: string,
    leagueId: string,
    week?: number,
    season?: number
  ): Promise<BankrollInfo | null> {
    const currentWeek = week ?? this.getCurrentWeek();
    const currentSeason = season ?? this.getCurrentSeason();

    const bankroll = await this.prisma.bankroll.findUnique({
      where: {
        userId_leagueId_week_season: {
          userId,
          leagueId,
          week: currentWeek,
          season: currentSeason,
        },
      },
    });

    return bankroll ? this.toBankrollInfo(bankroll) : null;
  }

  /**
   * Get current week's bankroll
   */
  async getCurrentBankroll(
    userId: string,
    leagueId: string
  ): Promise<BankrollInfo | null> {
    return this.getBankroll(userId, leagueId);
  }

  /**
   * Update bankroll balance
   */
  async updateBalance(
    bankrollId: string,
    amount: number,
    operation: 'debit' | 'credit' | 'ENTRY_FEE' | 'ENTRY_FEE_REFUND'
  ): Promise<BankrollInfo> {
    const bankroll = await this.prisma.bankroll.findUnique({
      where: { id: bankrollId },
    });

    if (!bankroll) {
      throw new Error('Bankroll not found');
    }

    const isDebit = operation === 'debit' || operation === 'ENTRY_FEE';
    const newBalance = isDebit 
      ? Number(bankroll.currentBalance) - Math.abs(amount)
      : Number(bankroll.currentBalance) + Math.abs(amount);

    if (newBalance < 0) {
      throw new Error('Insufficient funds');
    }

    const updated = await this.prisma.bankroll.update({
      where: { id: bankrollId },
      data: {
        currentBalance: newBalance,
        profitLoss: newBalance - Number(bankroll.startingBalance),
        roi: calculateROI(
          Number(bankroll.totalWon), 
          Number(bankroll.totalWagered)
        ),
      },
    });

    // Invalidate cache
    const cacheKey = `${this.cachePrefix}${bankroll.userId}:${bankroll.leagueId}:${bankroll.week}:${bankroll.season}`;
    await redis.del(cacheKey);

    return this.toBankrollInfo(updated);
  }

  /**
   * Record a bet placement
   */
  async recordBetPlacement(
    bankrollId: string,
    stake: number
  ): Promise<void> {
    await this.prisma.bankroll.update({
      where: { id: bankrollId },
      data: {
        currentBalance: { decrement: stake },
        totalBets: { increment: 1 },
        pendingBets: { increment: 1 },
        totalWagered: { increment: stake },
      },
    });

    // Invalidate cache
    const bankroll = await this.prisma.bankroll.findUnique({
      where: { id: bankrollId },
    });
    if (bankroll) {
      const cacheKey = `${this.cachePrefix}${bankroll.userId}:${bankroll.leagueId}:${bankroll.week}:${bankroll.season}`;
      await redis.del(cacheKey);
    }
  }

  /**
   * Record bet settlement
   */
  async recordBetSettlement(
    bankrollId: string,
    stake: number,
    payout: number,
    won: boolean
  ): Promise<void> {
    const updateData: Prisma.BankrollUpdateInput = {
      pendingBets: { decrement: 1 },
    };

    if (won) {
      updateData.wonBets = { increment: 1 };
      updateData.currentBalance = { increment: payout };
      updateData.totalWon = { increment: payout - stake };
    } else {
      updateData.lostBets = { increment: 1 };
      updateData.totalLost = { increment: stake };
    }

    const updated = await this.prisma.bankroll.update({
      where: { id: bankrollId },
      data: updateData,
    });

    // Update ROI and profit/loss
    await this.prisma.bankroll.update({
      where: { id: bankrollId },
      data: {
        profitLoss: Number(updated.currentBalance) - Number(updated.startingBalance),
        roi: calculateROI(
          Number(updated.totalWon),
          Number(updated.totalWagered)
        ),
      },
    });

    // Invalidate cache
    const cacheKey = `${this.cachePrefix}${updated.userId}:${updated.leagueId}:${updated.week}:${updated.season}`;
    await redis.del(cacheKey);
  }

  /**
   * Get user's betting history across all weeks
   */
  async getUserBettingHistory(
    userId: string,
    leagueId: string,
    season?: number
  ): Promise<BankrollInfo[]> {
    const currentSeason = season ?? this.getCurrentSeason();

    const bankrolls = await this.prisma.bankroll.findMany({
      where: {
        userId,
        leagueId,
        season: currentSeason,
      },
      orderBy: { week: 'desc' },
    });

    return bankrolls.map(b => this.toBankrollInfo(b));
  }

  /**
   * Get user's overall betting statistics
   */
  async getUserBettingStats(
    userId: string,
    leagueId: string,
    season?: number
  ): Promise<BettingStats> {
    const currentSeason = season ?? this.getCurrentSeason();

    const bankrolls = await this.prisma.bankroll.findMany({
      where: {
        userId,
        leagueId,
        season: currentSeason,
      },
    });

    // Aggregate statistics
    const stats = bankrolls.reduce((acc, b) => {
      acc.totalBets += b.totalBets;
      acc.wonBets += b.wonBets;
      acc.lostBets += b.lostBets;
      acc.totalWagered += Number(b.totalWagered);
      acc.totalWon += Number(b.totalWon);
      acc.totalLost += Number(b.totalLost);
      return acc;
    }, {
      totalBets: 0,
      wonBets: 0,
      lostBets: 0,
      totalWagered: 0,
      totalWon: 0,
      totalLost: 0,
    });

    // Get best win and worst loss from bets
    const bets = await this.prisma.bet.findMany({
      where: {
        userId,
        leagueId,
        status: { in: ['WON', 'LOST'] },
      },
      orderBy: [
        { actualPayout: 'desc' },
        { stake: 'desc' },
      ],
    });

    const bestWin = bets.find(b => b.status === 'WON') || null;
    const worstLoss = bets
      .filter(b => b.status === 'LOST')
      .sort((a, b) => Number(b.stake) - Number(a.stake))[0] || null;

    // Calculate streaks (simplified for now)
    const recentBets = await this.prisma.bet.findMany({
      where: {
        userId,
        leagueId,
        status: { in: ['WON', 'LOST'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    let currentStreak = { type: 'winning' as const, count: 0 };
    if (recentBets.length > 0) {
      const streakType = recentBets[0].status === 'WON' ? 'winning' : 'losing';
      currentStreak = { type: streakType, count: 1 };
      
      for (let i = 1; i < recentBets.length; i++) {
        if ((streakType === 'winning' && recentBets[i].status === 'WON') ||
            (streakType === 'losing' && recentBets[i].status === 'LOST')) {
          currentStreak.count++;
        } else {
          break;
        }
      }
    }

    return {
      totalBets: stats.totalBets,
      wonBets: stats.wonBets,
      lostBets: stats.lostBets,
      pushBets: 0, // Can be calculated from bets with PUSH status
      winRate: stats.totalBets > 0 ? (stats.wonBets / stats.totalBets) * 100 : 0,
      totalWagered: stats.totalWagered,
      totalWon: stats.totalWon,
      totalLost: stats.totalLost,
      netProfit: stats.totalWon - stats.totalLost,
      roi: calculateROI(stats.totalWon, stats.totalWagered),
      averageStake: stats.totalBets > 0 ? stats.totalWagered / stats.totalBets : 0,
      averageOdds: 0, // Would need to calculate from bets
      bestWin: bestWin as any,
      worstLoss: worstLoss as any,
      currentStreak,
      longestWinStreak: 0, // Would need more complex calculation
      longestLoseStreak: 0, // Would need more complex calculation
    };
  }

  /**
   * Reset weekly bankrolls (called by cron job)
   */
  async resetWeeklyBankrolls(): Promise<number> {
    const previousWeek = this.getCurrentWeek() - 1;
    const currentSeason = this.getCurrentSeason();

    // Mark previous week's bankrolls as completed
    const updated = await this.prisma.bankroll.updateMany({
      where: {
        week: previousWeek,
        season: currentSeason,
        status: BankrollStatus.ACTIVE,
      },
      data: {
        status: BankrollStatus.COMPLETED,
      },
    });

    return updated.count;
  }

  /**
   * Archive old bankrolls (older than 12 weeks)
   */
  async archiveOldBankrolls(): Promise<number> {
    const currentWeek = this.getCurrentWeek();
    const currentSeason = this.getCurrentSeason();
    const cutoffWeek = currentWeek - 12;

    const archived = await this.prisma.bankroll.updateMany({
      where: {
        week: { lt: cutoffWeek },
        season: currentSeason,
        status: { not: BankrollStatus.ARCHIVED },
      },
      data: {
        status: BankrollStatus.ARCHIVED,
      },
    });

    return archived.count;
  }

  /**
   * Convert Prisma bankroll to BankrollInfo
   */
  private toBankrollInfo(bankroll: any): BankrollInfo {
    return {
      id: bankroll.id,
      userId: bankroll.userId,
      leagueId: bankroll.leagueId,
      leagueSandbox: bankroll.leagueSandbox,
      week: bankroll.week,
      season: bankroll.season,
      startingBalance: Number(bankroll.startingBalance),
      currentBalance: Number(bankroll.currentBalance),
      totalBets: bankroll.totalBets,
      pendingBets: bankroll.pendingBets,
      wonBets: bankroll.wonBets,
      lostBets: bankroll.lostBets,
      totalWagered: Number(bankroll.totalWagered),
      totalWon: Number(bankroll.totalWon),
      totalLost: Number(bankroll.totalLost),
      profitLoss: Number(bankroll.profitLoss),
      roi: bankroll.roi ? Number(bankroll.roi) : null,
      status: bankroll.status,
      createdAt: bankroll.createdAt,
      updatedAt: bankroll.updatedAt,
    };
  }
}

// Export singleton instance
export const bankrollManager = (prisma: PrismaClient) => new BankrollManager(prisma);