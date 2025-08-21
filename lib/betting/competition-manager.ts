/**
 * CompetitionManager - Manages betting competitions and tournaments
 * 
 * This service handles:
 * - Competition creation and lifecycle management
 * - Entry processing and eligibility checks
 * - Competition status transitions
 * - Entry fee and prize pool management
 * - Competition rules and validation
 */

import { PrismaClient, CompetitionStatus, Prisma } from '@prisma/client';
import {
  Competition,
  CompetitionConfig,
  CompetitionEntry,
  CompetitionFilters,
  CompetitionSummary,
  ScoringRules,
  checkCompetitionEligibility,
} from '@/types/betting';
import { redis } from '@/lib/redis';
import { BankrollManager } from './bankroll-manager';

export class CompetitionManager {
  private prisma: PrismaClient;
  private bankrollManager: BankrollManager;
  private cachePrefix = 'competition:';
  private cacheTTL = 300; // 5 minutes

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.bankrollManager = new BankrollManager(prisma);
  }

  /**
   * Create a new competition
   */
  async createCompetition(
    config: CompetitionConfig,
    createdBy: string
  ): Promise<Competition> {
    // Validate dates
    if (config.endDate <= config.startDate) {
      throw new Error('End date must be after start date');
    }

    // Validate league-specific competitions
    if (config.scope === 'LEAGUE' && !config.leagueId) {
      throw new Error('League ID required for league-scoped competitions');
    }

    // Default scoring rules if not provided
    const defaultScoringRules: ScoringRules = {
      profitWeight: 1.0,
      roiWeight: 0.5,
      winRateWeight: 0.3,
      activityBonus: 0.1,
      minBetsRequired: 3,
      tieBreaker: 'PROFIT',
    };

    const competition = await this.prisma.competition.create({
      data: {
        name: config.name,
        description: config.description,
        type: config.type,
        scope: config.scope,
        leagueId: config.leagueId,
        leagueSandbox: config.leagueSandbox,
        startDate: config.startDate,
        endDate: config.endDate,
        week: config.week,
        season: config.season,
        entryFee: config.entryFee || 0,
        prizePool: config.prizePool || 0,
        maxEntrants: config.maxEntrants,
        minEntrants: config.minEntrants || 2,
        scoringRules: config.scoringRules || defaultScoringRules,
        status: 'PENDING',
        createdBy,
      },
      include: {
        _count: {
          select: { entries: true },
        },
      },
    });

    // Clear cache
    await this.clearCompetitionCache(competition.id);

    return this.mapToCompetitionModel(competition);
  }

  /**
   * Join a competition
   */
  async joinCompetition(
    competitionId: string,
    userId: string,
    leagueId?: string
  ): Promise<CompetitionEntry> {
    // Start transaction for entry fee processing
    return await this.prisma.$transaction(async (prisma) => {
      // Get competition details
      const competition = await prisma.competition.findUnique({
        where: { id: competitionId },
        include: {
          _count: {
            select: { entries: true },
          },
        },
      });

      if (!competition) {
        throw new Error('Competition not found');
      }

      // Check if already entered
      const existingEntry = await prisma.competitionEntry.findUnique({
        where: {
          competitionId_userId: {
            competitionId,
            userId,
          },
        },
      });

      if (existingEntry) {
        throw new Error('Already entered in this competition');
      }

      // Check eligibility
      const userBalance = leagueId
        ? await this.getUserBalance(userId, leagueId)
        : 0;

      const userCompetitions = await this.getUserCompetitionIds(userId);
      const eligibility = checkCompetitionEligibility(
        this.mapToCompetitionModel(competition),
        userBalance,
        userCompetitions
      );

      if (!eligibility.eligible) {
        throw new Error(eligibility.reason);
      }

      // Process entry fee if required
      if (competition.entryFee && competition.entryFee > 0) {
        await this.processEntryFee(
          userId,
          competition.leagueId || leagueId!,
          Number(competition.entryFee)
        );
      }

      // Create competition entry
      const entry = await prisma.competitionEntry.create({
        data: {
          competitionId,
          userId,
          score: 0,
          profit: 0,
          totalBets: 0,
          wonBets: 0,
        },
        include: {
          user: {
            select: {
              username: true,
              displayName: true,
            },
          },
        },
      });

      // Update competition status if minimum entrants reached
      if (
        competition.status === 'PENDING' &&
        competition._count.entries + 1 >= competition.minEntrants &&
        new Date() >= competition.startDate
      ) {
        await prisma.competition.update({
          where: { id: competitionId },
          data: { status: 'ACTIVE' },
        });
      }

      // Clear cache
      await this.clearCompetitionCache(competitionId);

      return this.mapToEntryModel(entry);
    });
  }

  /**
   * Leave a competition (if allowed)
   */
  async leaveCompetition(
    competitionId: string,
    userId: string
  ): Promise<void> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new Error('Competition not found');
    }

    // Can only leave pending competitions
    if (competition.status !== 'PENDING') {
      throw new Error('Cannot leave an active or completed competition');
    }

    // Delete entry and refund entry fee
    await this.prisma.$transaction(async (prisma) => {
      const entry = await prisma.competitionEntry.findUnique({
        where: {
          competitionId_userId: {
            competitionId,
            userId,
          },
        },
      });

      if (!entry) {
        throw new Error('Not entered in this competition');
      }

      // Delete entry
      await prisma.competitionEntry.delete({
        where: { id: entry.id },
      });

      // Refund entry fee if applicable
      if (competition.entryFee && competition.entryFee > 0) {
        await this.refundEntryFee(
          userId,
          competition.leagueId!,
          Number(competition.entryFee)
        );
      }
    });

    // Clear cache
    await this.clearCompetitionCache(competitionId);
  }

  /**
   * Get competition details
   */
  async getCompetition(competitionId: string): Promise<Competition | null> {
    // Check cache first
    const cached = await this.getCachedCompetition(competitionId);
    if (cached) return cached;

    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        _count: {
          select: { entries: true },
        },
      },
    });

    if (!competition) return null;

    const result = this.mapToCompetitionModel(competition);

    // Cache the result
    await this.cacheCompetition(result);

    return result;
  }

  /**
   * List competitions with filters
   */
  async listCompetitions(
    filters?: CompetitionFilters
  ): Promise<Competition[]> {
    const where: Prisma.CompetitionWhereInput = {};

    if (filters) {
      if (filters.status && filters.status.length > 0) {
        where.status = { in: filters.status };
      }
      if (filters.type && filters.type.length > 0) {
        where.type = { in: filters.type };
      }
      if (filters.scope) {
        where.scope = filters.scope;
      }
      if (filters.leagueId) {
        where.leagueId = filters.leagueId;
      }
      if (filters.userId) {
        where.entries = {
          some: {
            userId: filters.userId,
          },
        };
      }
      if (filters.dateFrom || filters.dateTo) {
        where.startDate = {};
        if (filters.dateFrom) {
          where.startDate.gte = filters.dateFrom;
        }
        if (filters.dateTo) {
          where.startDate.lte = filters.dateTo;
        }
      }
    }

    const competitions = await this.prisma.competition.findMany({
      where,
      include: {
        _count: {
          select: { entries: true },
        },
      },
      orderBy: [
        { status: 'asc' },
        { startDate: 'desc' },
      ],
    });

    return competitions.map((c) => this.mapToCompetitionModel(c));
  }

  /**
   * Get user's competitions
   */
  async getUserCompetitions(userId: string): Promise<Competition[]> {
    const competitions = await this.prisma.competition.findMany({
      where: {
        entries: {
          some: {
            userId,
          },
        },
      },
      include: {
        _count: {
          select: { entries: true },
        },
      },
      orderBy: {
        startDate: 'desc',
      },
    });

    return competitions.map((c) => this.mapToCompetitionModel(c));
  }

  /**
   * Update competition status
   */
  async updateCompetitionStatus(
    competitionId: string,
    status: CompetitionStatus
  ): Promise<void> {
    await this.prisma.competition.update({
      where: { id: competitionId },
      data: { status },
    });

    // Clear cache
    await this.clearCompetitionCache(competitionId);
  }

  /**
   * Check and activate pending competitions
   */
  async activatePendingCompetitions(): Promise<void> {
    const now = new Date();

    const competitions = await this.prisma.competition.findMany({
      where: {
        status: 'PENDING',
        startDate: { lte: now },
      },
      include: {
        _count: {
          select: { entries: true },
        },
      },
    });

    for (const competition of competitions) {
      // Check if minimum entrants met
      if (competition._count.entries >= competition.minEntrants) {
        await this.updateCompetitionStatus(competition.id, 'ACTIVE');
      } else if (new Date() > competition.endDate) {
        // Cancel if past end date without minimum entrants
        await this.cancelCompetition(competition.id);
      }
    }
  }

  /**
   * Check and complete finished competitions
   */
  async completeFinishedCompetitions(): Promise<void> {
    const now = new Date();

    const competitions = await this.prisma.competition.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { lte: now },
      },
    });

    for (const competition of competitions) {
      await this.updateCompetitionStatus(competition.id, 'SETTLING');
      // Settlement will be handled by the settlement service
    }
  }

  /**
   * Cancel a competition and refund entry fees
   */
  async cancelCompetition(competitionId: string): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      const competition = await prisma.competition.findUnique({
        where: { id: competitionId },
        include: {
          entries: true,
        },
      });

      if (!competition) {
        throw new Error('Competition not found');
      }

      if (competition.status === 'COMPLETED') {
        throw new Error('Cannot cancel a completed competition');
      }

      // Refund all entry fees
      if (competition.entryFee && competition.entryFee > 0) {
        for (const entry of competition.entries) {
          await this.refundEntryFee(
            entry.userId,
            competition.leagueId!,
            Number(competition.entryFee)
          );
        }
      }

      // Update status
      await prisma.competition.update({
        where: { id: competitionId },
        data: { status: 'CANCELLED' },
      });
    });

    // Clear cache
    await this.clearCompetitionCache(competitionId);
  }

  /**
   * Get competition summary statistics
   */
  async getCompetitionSummary(
    leagueId?: string
  ): Promise<CompetitionSummary> {
    const where: Prisma.CompetitionWhereInput = {};
    if (leagueId) {
      where.leagueId = leagueId;
    }

    const [
      totalCompetitions,
      activeCompetitions,
      totalPrizePool,
      entries,
    ] = await Promise.all([
      this.prisma.competition.count({ where }),
      this.prisma.competition.count({
        where: { ...where, status: 'ACTIVE' },
      }),
      this.prisma.competition.aggregate({
        where,
        _sum: { prizePool: true },
      }),
      this.prisma.competitionEntry.groupBy({
        by: ['competitionId'],
        _count: { userId: true },
      }),
    ]);

    const totalParticipants = await this.prisma.competitionEntry.count({
      where: {
        competition: where,
      },
    });

    const averageEntrants =
      entries.length > 0
        ? entries.reduce((sum, e) => sum + e._count.userId, 0) / entries.length
        : 0;

    // Get top competitor
    const topCompetitor = await this.getTopCompetitor(leagueId);

    return {
      totalCompetitions,
      activeCompetitions,
      totalParticipants,
      totalPrizePool: Number(totalPrizePool._sum.prizePool || 0),
      averageEntrants,
      topCompetitor,
    };
  }

  // Private helper methods

  private async getUserBalance(
    userId: string,
    leagueId: string
  ): Promise<number> {
    const bankroll = await this.bankrollManager.getCurrentBankroll(
      userId,
      leagueId
    );
    return bankroll ? Number(bankroll.currentBalance) : 0;
  }

  private async getUserCompetitionIds(userId: string): Promise<string[]> {
    const entries = await this.prisma.competitionEntry.findMany({
      where: { userId },
      select: { competitionId: true },
    });
    return entries.map((e) => e.competitionId);
  }

  private async processEntryFee(
    userId: string,
    leagueId: string,
    amount: number
  ): Promise<void> {
    const bankroll = await this.bankrollManager.getCurrentBankroll(
      userId,
      leagueId
    );
    
    if (!bankroll) {
      throw new Error('No active bankroll found');
    }

    if (Number(bankroll.currentBalance) < amount) {
      throw new Error('Insufficient balance for entry fee');
    }

    await this.bankrollManager.updateBalance(
      bankroll.id,
      -amount,
      'ENTRY_FEE'
    );
  }

  private async refundEntryFee(
    userId: string,
    leagueId: string,
    amount: number
  ): Promise<void> {
    const bankroll = await this.bankrollManager.getCurrentBankroll(
      userId,
      leagueId
    );
    
    if (bankroll) {
      await this.bankrollManager.updateBalance(
        bankroll.id,
        amount,
        'ENTRY_FEE_REFUND'
      );
    }
  }

  private async getTopCompetitor(leagueId?: string) {
    const topWins = await this.prisma.competitionEntry.groupBy({
      by: ['userId'],
      where: {
        rank: 1,
        competition: leagueId ? { leagueId } : undefined,
      },
      _count: { id: true },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 1,
    });

    if (topWins.length === 0) return undefined;

    const user = await this.prisma.user.findUnique({
      where: { id: topWins[0].userId },
      select: { username: true, displayName: true },
    });

    if (!user) return undefined;

    // Get total earnings
    const rewards = await this.prisma.competitionReward.aggregate({
      where: {
        userId: topWins[0].userId,
        rewardType: 'UNITS',
      },
      _sum: {
        rewardValue: true,
      },
    });

    return {
      userId: topWins[0].userId,
      userName: user.displayName || user.username,
      wins: topWins[0]._count.id,
      totalEarnings: 0, // Would need to parse JSON reward values
    };
  }

  private mapToCompetitionModel(competition: any): Competition {
    return {
      id: competition.id,
      name: competition.name,
      description: competition.description,
      type: competition.type,
      scope: competition.scope,
      leagueId: competition.leagueId,
      leagueSandbox: competition.leagueSandbox,
      startDate: competition.startDate,
      endDate: competition.endDate,
      week: competition.week,
      season: competition.season,
      entryFee: Number(competition.entryFee),
      prizePool: Number(competition.prizePool),
      maxEntrants: competition.maxEntrants,
      minEntrants: competition.minEntrants,
      currentEntrants: competition._count?.entries || 0,
      scoringRules: competition.scoringRules as ScoringRules,
      status: competition.status,
      createdBy: competition.createdBy,
      createdAt: competition.createdAt,
      updatedAt: competition.updatedAt,
    };
  }

  private mapToEntryModel(entry: any): CompetitionEntry {
    return {
      id: entry.id,
      competitionId: entry.competitionId,
      userId: entry.userId,
      userName: entry.user?.displayName || entry.user?.username,
      joinedAt: entry.joinedAt,
      rank: entry.rank,
      score: Number(entry.score),
      profit: Number(entry.profit),
      roi: entry.roi ? Number(entry.roi) : undefined,
      winRate: entry.winRate ? Number(entry.winRate) : undefined,
      totalBets: entry.totalBets,
      wonBets: entry.wonBets,
      stats: entry.stats,
      lastUpdate: entry.lastUpdate,
    };
  }

  // Cache methods

  private async getCachedCompetition(
    competitionId: string
  ): Promise<Competition | null> {
    const key = `${this.cachePrefix}${competitionId}`;
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  private async cacheCompetition(competition: Competition): Promise<void> {
    const key = `${this.cachePrefix}${competition.id}`;
    await redis.setex(key, this.cacheTTL, JSON.stringify(competition));
  }

  private async clearCompetitionCache(competitionId: string): Promise<void> {
    const key = `${this.cachePrefix}${competitionId}`;
    await redis.del(key);
  }
}