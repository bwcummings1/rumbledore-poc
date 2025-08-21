/**
 * BetPlacementEngine - Handles bet placement and bet slip management
 * 
 * This service handles:
 * - Single bet placement
 * - Parlay bet construction
 * - Bet slip management
 * - Potential payout calculation
 * - Transaction management
 */

import { PrismaClient, BetType, BetStatus, BetSlipType } from '@prisma/client';
import {
  BetRequest,
  BetInfo,
  BetSlipInfo,
  calculatePayout,
  calculateParlayOdds,
  BettingError,
  BettingErrorCode,
} from '@/types/betting';
import { BankrollManager } from './bankroll-manager';
import { BetValidator } from './bet-validator';
import { redis } from '@/lib/redis';
import { v4 as uuidv4 } from 'uuid';

export interface PlaceBetResult {
  success: boolean;
  bet?: BetInfo;
  betSlip?: BetSlipInfo;
  error?: string;
  transactionId?: string;
}

export interface BetSlipSelection {
  gameId: string;
  eventDate: Date;
  marketType: string;
  selection: string;
  line?: number;
  odds: number;
}

export class BetPlacementEngine {
  private prisma: PrismaClient;
  private bankrollManager: BankrollManager;
  private betValidator: BetValidator;
  private activeBetSlips: Map<string, BetSlipSelection[]> = new Map();

  constructor(
    prisma: PrismaClient,
    bankrollManager: BankrollManager,
    betValidator: BetValidator
  ) {
    this.prisma = prisma;
    this.bankrollManager = bankrollManager;
    this.betValidator = betValidator;
  }

  /**
   * Place a single bet
   */
  async placeSingleBet(betRequest: BetRequest): Promise<PlaceBetResult> {
    const transactionId = uuidv4();

    try {
      // Start transaction
      return await this.prisma.$transaction(async (tx) => {
        // 1. Get or initialize bankroll
        const bankroll = await this.bankrollManager.initializeWeeklyBankroll(
          betRequest.userId,
          betRequest.leagueId,
          betRequest.leagueSandbox
        );

        // 2. Validate bet
        const validation = await this.betValidator.validateBet(betRequest, bankroll);
        if (!validation.valid) {
          throw new BettingError(
            validation.message || 'Bet validation failed',
            BettingErrorCode.VALIDATION_ERROR,
            400,
            { error: validation.error }
          );
        }

        // 3. Calculate potential payout
        const potentialPayout = calculatePayout(betRequest.stake, betRequest.odds);

        // 4. Create bet record
        const bet = await tx.bet.create({
          data: {
            userId: betRequest.userId,
            leagueId: betRequest.leagueId,
            leagueSandbox: betRequest.leagueSandbox,
            bankrollId: bankroll.id,
            gameId: betRequest.gameId,
            eventDate: betRequest.eventDate,
            betType: BetType.STRAIGHT,
            marketType: betRequest.marketType,
            selection: betRequest.selection,
            line: betRequest.line,
            odds: betRequest.odds,
            stake: betRequest.stake,
            potentialPayout,
            status: BetStatus.PENDING,
            metadata: {
              transactionId,
              placedAt: new Date().toISOString(),
            },
          },
        });

        // 5. Update bankroll
        await tx.bankroll.update({
          where: { id: bankroll.id },
          data: {
            currentBalance: { decrement: betRequest.stake },
            totalBets: { increment: 1 },
            pendingBets: { increment: 1 },
            totalWagered: { increment: betRequest.stake },
          },
        });

        // 6. Invalidate cache
        await this.invalidateBankrollCache(betRequest.userId, betRequest.leagueId);

        // 7. Log the bet placement
        await this.logBetPlacement(bet.id, betRequest.userId, 'SINGLE', transactionId);

        return {
          success: true,
          bet: this.toBetInfo(bet),
          transactionId,
        };
      });
    } catch (error: any) {
      console.error('Error placing bet:', error);
      return {
        success: false,
        error: error.message || 'Failed to place bet',
      };
    }
  }

  /**
   * Place a parlay bet
   */
  async placeParlayBet(
    userId: string,
    leagueId: string,
    leagueSandbox: string,
    selections: BetSlipSelection[],
    stake: number
  ): Promise<PlaceBetResult> {
    const transactionId = uuidv4();

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Get or initialize bankroll
        const bankroll = await this.bankrollManager.initializeWeeklyBankroll(
          userId,
          leagueId,
          leagueSandbox
        );

        // 2. Convert selections to bet requests for validation
        const betRequests: BetRequest[] = selections.map(s => ({
          userId,
          leagueId,
          leagueSandbox,
          gameId: s.gameId,
          eventDate: s.eventDate,
          betType: BetType.PARLAY,
          marketType: s.marketType as any,
          selection: s.selection,
          line: s.line,
          odds: s.odds,
          stake: 0, // Individual stake not used in parlay
        }));

        // 3. Validate parlay
        const validation = await this.betValidator.validateParlay(
          betRequests,
          stake,
          bankroll
        );
        if (!validation.valid) {
          throw new BettingError(
            validation.message || 'Parlay validation failed',
            BettingErrorCode.VALIDATION_ERROR,
            400,
            { error: validation.error, invalidLegs: validation.invalidLegs }
          );
        }

        // 4. Calculate combined odds and potential payout
        const parlayOdds = calculateParlayOdds(selections.map(s => s.odds));
        const potentialPayout = calculatePayout(stake, parlayOdds);

        // 5. Create bet slip
        const betSlip = await tx.betSlip.create({
          data: {
            userId,
            leagueId,
            leagueSandbox,
            type: BetSlipType.PARLAY,
            totalStake: stake,
            totalOdds: parlayOdds,
            potentialPayout,
            status: BetStatus.PENDING,
          },
        });

        // 6. Create individual bet legs
        const betLegs = await Promise.all(
          selections.map((selection, index) =>
            tx.bet.create({
              data: {
                userId,
                leagueId,
                leagueSandbox,
                bankrollId: bankroll.id,
                betSlipId: betSlip.id,
                gameId: selection.gameId,
                eventDate: selection.eventDate,
                betType: BetType.PARLAY,
                marketType: selection.marketType as any,
                selection: selection.selection,
                line: selection.line,
                odds: selection.odds,
                stake: stake / selections.length, // Distribute stake across legs
                potentialPayout: 0, // Individual payout not used in parlay
                status: BetStatus.PENDING,
                metadata: {
                  transactionId,
                  parlayLeg: index + 1,
                  totalLegs: selections.length,
                },
              },
            })
          )
        );

        // 7. Update bankroll
        await tx.bankroll.update({
          where: { id: bankroll.id },
          data: {
            currentBalance: { decrement: stake },
            totalBets: { increment: 1 }, // Count parlay as 1 bet
            pendingBets: { increment: 1 },
            totalWagered: { increment: stake },
          },
        });

        // 8. Invalidate cache
        await this.invalidateBankrollCache(userId, leagueId);

        // 9. Log the bet placement
        await this.logBetPlacement(betSlip.id, userId, 'PARLAY', transactionId);

        return {
          success: true,
          betSlip: {
            ...betSlip,
            legs: betLegs.map(leg => this.toBetInfo(leg)),
          } as BetSlipInfo,
          transactionId,
        };
      });
    } catch (error: any) {
      console.error('Error placing parlay bet:', error);
      return {
        success: false,
        error: error.message || 'Failed to place parlay bet',
      };
    }
  }

  /**
   * Add selection to bet slip (for UI)
   */
  async addToBetSlip(
    userId: string,
    selection: BetSlipSelection
  ): Promise<void> {
    const betSlipKey = `betslip:${userId}`;
    const currentSlip = this.activeBetSlips.get(betSlipKey) || [];
    
    // Check for duplicates
    const isDuplicate = currentSlip.some(
      s => s.gameId === selection.gameId && s.marketType === selection.marketType
    );
    
    if (!isDuplicate) {
      currentSlip.push(selection);
      this.activeBetSlips.set(betSlipKey, currentSlip);
      
      // Also store in Redis for persistence
      await redis.setex(betSlipKey, 3600, JSON.stringify(currentSlip));
    }
  }

  /**
   * Remove selection from bet slip
   */
  async removeFromBetSlip(
    userId: string,
    gameId: string,
    marketType: string
  ): Promise<void> {
    const betSlipKey = `betslip:${userId}`;
    const currentSlip = this.activeBetSlips.get(betSlipKey) || [];
    
    const filtered = currentSlip.filter(
      s => !(s.gameId === gameId && s.marketType === marketType)
    );
    
    this.activeBetSlips.set(betSlipKey, filtered);
    
    if (filtered.length > 0) {
      await redis.setex(betSlipKey, 3600, JSON.stringify(filtered));
    } else {
      await redis.del(betSlipKey);
    }
  }

  /**
   * Clear entire bet slip
   */
  async clearBetSlip(userId: string): Promise<void> {
    const betSlipKey = `betslip:${userId}`;
    this.activeBetSlips.delete(betSlipKey);
    await redis.del(betSlipKey);
  }

  /**
   * Get current bet slip
   */
  async getBetSlip(userId: string): Promise<BetSlipSelection[]> {
    const betSlipKey = `betslip:${userId}`;
    
    // Check memory first
    if (this.activeBetSlips.has(betSlipKey)) {
      return this.activeBetSlips.get(betSlipKey) || [];
    }
    
    // Check Redis
    const cached = await redis.get(betSlipKey);
    if (cached) {
      const selections = JSON.parse(cached);
      this.activeBetSlips.set(betSlipKey, selections);
      return selections;
    }
    
    return [];
  }

  /**
   * Calculate bet slip potential payout
   */
  calculateBetSlipPayout(
    selections: BetSlipSelection[],
    stake: number,
    type: 'single' | 'parlay' = 'parlay'
  ): number {
    if (type === 'single') {
      // For single bets, calculate individual payouts
      return selections.reduce((total, selection) => {
        const individualStake = stake / selections.length;
        return total + calculatePayout(individualStake, selection.odds);
      }, 0);
    } else {
      // For parlays, calculate combined payout
      const parlayOdds = calculateParlayOdds(selections.map(s => s.odds));
      return calculatePayout(stake, parlayOdds);
    }
  }

  /**
   * Cancel a pending bet
   */
  async cancelBet(betId: string, userId: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Get the bet
        const bet = await tx.bet.findFirst({
          where: {
            id: betId,
            userId,
            status: BetStatus.PENDING,
          },
        });

        if (!bet) {
          throw new Error('Bet not found or cannot be cancelled');
        }

        // Check if game has started
        const now = new Date();
        if (bet.eventDate <= now) {
          throw new Error('Cannot cancel bet - game has started');
        }

        // Update bet status
        await tx.bet.update({
          where: { id: betId },
          data: { 
            status: BetStatus.CANCELLED,
            metadata: {
              ...(bet.metadata as any),
              cancelledAt: new Date().toISOString(),
            },
          },
        });

        // Refund stake to bankroll
        await tx.bankroll.update({
          where: { id: bet.bankrollId },
          data: {
            currentBalance: { increment: Number(bet.stake) },
            pendingBets: { decrement: 1 },
            totalBets: { decrement: 1 },
            totalWagered: { decrement: Number(bet.stake) },
          },
        });

        // Invalidate cache
        await this.invalidateBankrollCache(userId, bet.leagueId);

        return true;
      });
    } catch (error) {
      console.error('Error cancelling bet:', error);
      return false;
    }
  }

  /**
   * Get user's active bets
   */
  async getActiveBets(userId: string, leagueId: string): Promise<BetInfo[]> {
    const bets = await this.prisma.bet.findMany({
      where: {
        userId,
        leagueId,
        status: { in: [BetStatus.PENDING, BetStatus.LIVE] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return bets.map(bet => this.toBetInfo(bet));
  }

  /**
   * Get user's bet history
   */
  async getBetHistory(
    userId: string,
    leagueId: string,
    limit = 50,
    offset = 0
  ): Promise<BetInfo[]> {
    const bets = await this.prisma.bet.findMany({
      where: {
        userId,
        leagueId,
        status: { in: [BetStatus.WON, BetStatus.LOST, BetStatus.PUSH, BetStatus.VOID] },
      },
      orderBy: { settledAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return bets.map(bet => this.toBetInfo(bet));
  }

  /**
   * Convert Prisma bet to BetInfo
   */
  private toBetInfo(bet: any): BetInfo {
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

  /**
   * Invalidate bankroll cache
   */
  private async invalidateBankrollCache(userId: string, leagueId: string): Promise<void> {
    const pattern = `bankroll:${userId}:${leagueId}:*`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Log bet placement for audit
   */
  private async logBetPlacement(
    betId: string,
    userId: string,
    type: string,
    transactionId: string
  ): Promise<void> {
    console.log(`Bet placed: ${type} bet ${betId} by user ${userId} (tx: ${transactionId})`);
    // Could also write to audit log table if needed
  }
}

// Export singleton factory
export const betPlacementEngine = (
  prisma: PrismaClient,
  bankrollManager: BankrollManager,
  betValidator: BetValidator
) => new BetPlacementEngine(prisma, bankrollManager, betValidator);