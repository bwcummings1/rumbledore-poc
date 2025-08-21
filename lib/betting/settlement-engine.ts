/**
 * SettlementEngine - Handles automated bet settlement
 * 
 * This service handles:
 * - Fetching completed game results
 * - Evaluating bet outcomes
 * - Calculating payouts
 * - Updating bankrolls
 * - Settlement history tracking
 * - Parlay settlement logic
 */

import { 
  PrismaClient, 
  BetStatus, 
  BetResult, 
  MarketType,
  BetType 
} from '@prisma/client';
import {
  BetInfo,
  GameResult,
  SettlementInfo,
  calculatePayout,
} from '@/types/betting';
import { BankrollManager } from './bankroll-manager';
import { redis } from '@/lib/redis';

export interface SettlementResult {
  settledCount: number;
  settledBets: SettledBet[];
  errors: SettlementError[];
}

export interface SettledBet {
  betId: string;
  userId: string;
  result: BetResult;
  payout: number;
  settledAt: Date;
}

export interface SettlementError {
  betId: string;
  error: string;
}

export class SettlementEngine {
  private prisma: PrismaClient;
  private bankrollManager: BankrollManager;

  constructor(prisma: PrismaClient, bankrollManager: BankrollManager) {
    this.prisma = prisma;
    this.bankrollManager = bankrollManager;
  }

  /**
   * Settle all pending bets for completed games
   */
  async settleCompletedGames(gameResults: GameResult[]): Promise<SettlementResult> {
    const settledBets: SettledBet[] = [];
    const errors: SettlementError[] = [];

    // Get all pending bets for the completed games
    const gameIds = gameResults.map(g => g.gameId);
    const pendingBets = await this.prisma.bet.findMany({
      where: {
        gameId: { in: gameIds },
        status: { in: [BetStatus.PENDING, BetStatus.LIVE] },
      },
      include: {
        betSlip: true,
      },
    });

    // Group bets by bet slip (for parlays)
    const standaloneBets = pendingBets.filter(b => !b.betSlipId);
    const parlayBets = pendingBets.filter(b => b.betSlipId);
    const parlayGroups = this.groupBetsBySlip(parlayBets);

    // Settle standalone bets
    for (const bet of standaloneBets) {
      try {
        const settled = await this.settleSingleBet(bet, gameResults);
        if (settled) {
          settledBets.push(settled);
        }
      } catch (error: any) {
        errors.push({
          betId: bet.id,
          error: error.message,
        });
      }
    }

    // Settle parlays
    for (const [betSlipId, bets] of parlayGroups.entries()) {
      try {
        const settledParlay = await this.settleParlay(betSlipId, bets, gameResults);
        settledBets.push(...settledParlay);
      } catch (error: any) {
        errors.push({
          betId: betSlipId,
          error: `Parlay settlement error: ${error.message}`,
        });
      }
    }

    return {
      settledCount: settledBets.length,
      settledBets,
      errors,
    };
  }

  /**
   * Settle a single bet
   */
  private async settleSingleBet(
    bet: any,
    gameResults: GameResult[]
  ): Promise<SettledBet | null> {
    const gameResult = gameResults.find(g => g.gameId === bet.gameId);
    if (!gameResult) {
      return null;
    }

    // Handle cancelled or postponed games
    if (gameResult.status === 'cancelled' || gameResult.status === 'postponed') {
      return await this.voidBet(bet);
    }

    // Evaluate the bet
    const betResult = this.evaluateBet(bet, gameResult);
    const payout = betResult === BetResult.WIN ? Number(bet.potentialPayout) : 0;

    // Update bet record
    await this.prisma.bet.update({
      where: { id: bet.id },
      data: {
        status: this.resultToStatus(betResult),
        result: betResult,
        actualPayout: payout,
        settledAt: new Date(),
        metadata: {
          ...(bet.metadata as any),
          gameScore: {
            home: gameResult.homeScore,
            away: gameResult.awayScore,
          },
        },
      },
    });

    // Update bankroll
    if (betResult === BetResult.WIN || betResult === BetResult.PUSH) {
      const refundAmount = betResult === BetResult.PUSH ? Number(bet.stake) : payout;
      await this.bankrollManager.recordBetSettlement(
        bet.bankrollId,
        Number(bet.stake),
        refundAmount,
        betResult === BetResult.WIN
      );
    } else {
      await this.bankrollManager.recordBetSettlement(
        bet.bankrollId,
        Number(bet.stake),
        0,
        false
      );
    }

    // Create settlement record
    await this.prisma.settlement.create({
      data: {
        betId: bet.id,
        userId: bet.userId,
        leagueId: bet.leagueId,
        leagueSandbox: bet.leagueSandbox,
        gameId: bet.gameId,
        betAmount: Number(bet.stake),
        payoutAmount: payout,
        result: betResult,
        gameScore: {
          home: gameResult.homeScore,
          away: gameResult.awayScore,
        },
        settledBy: 'AUTO',
      },
    });

    return {
      betId: bet.id,
      userId: bet.userId,
      result: betResult,
      payout,
      settledAt: new Date(),
    };
  }

  /**
   * Settle a parlay bet
   */
  private async settleParlay(
    betSlipId: string,
    bets: any[],
    gameResults: GameResult[]
  ): Promise<SettledBet[]> {
    const settledLegs: SettledBet[] = [];
    let parlayWon = true;
    let anyPush = false;
    let anyVoid = false;

    // Evaluate each leg
    for (const bet of bets) {
      const gameResult = gameResults.find(g => g.gameId === bet.gameId);
      
      if (!gameResult) {
        // Game not completed yet - parlay remains pending
        return [];
      }

      if (gameResult.status === 'cancelled' || gameResult.status === 'postponed') {
        anyVoid = true;
        continue;
      }

      const betResult = this.evaluateBet(bet, gameResult);
      
      if (betResult === BetResult.LOSS) {
        parlayWon = false;
      } else if (betResult === BetResult.PUSH) {
        anyPush = true;
      } else if (betResult === BetResult.VOID) {
        anyVoid = true;
      }

      // Update individual leg
      await this.prisma.bet.update({
        where: { id: bet.id },
        data: {
          status: this.resultToStatus(betResult),
          result: betResult,
          settledAt: new Date(),
        },
      });
    }

    // Determine parlay result
    let parlayResult: BetResult;
    let parlayPayout = 0;

    if (!parlayWon) {
      parlayResult = BetResult.LOSS;
    } else if (anyVoid && bets.length === 1) {
      parlayResult = BetResult.VOID;
    } else if (anyPush || anyVoid) {
      // Recalculate odds without pushed/voided legs
      parlayResult = BetResult.WIN;
      const activeBets = bets.filter(b => {
        const result = this.evaluateBet(b, gameResults.find(g => g.gameId === b.gameId)!);
        return result !== BetResult.PUSH && result !== BetResult.VOID;
      });
      
      if (activeBets.length > 0) {
        const betSlip = await this.prisma.betSlip.findUnique({
          where: { id: betSlipId },
        });
        
        if (betSlip) {
          // Simplified payout calculation for reduced parlay
          const reductionFactor = activeBets.length / bets.length;
          parlayPayout = Number(betSlip.potentialPayout) * reductionFactor;
        }
      }
    } else {
      parlayResult = BetResult.WIN;
      const betSlip = await this.prisma.betSlip.findUnique({
        where: { id: betSlipId },
      });
      parlayPayout = betSlip ? Number(betSlip.potentialPayout) : 0;
    }

    // Update bet slip
    const betSlip = await this.prisma.betSlip.update({
      where: { id: betSlipId },
      data: {
        status: this.resultToStatus(parlayResult),
        result: parlayResult,
        actualPayout: parlayPayout,
        settledAt: new Date(),
      },
    });

    // Update bankroll for parlay
    if (parlayResult === BetResult.WIN) {
      const firstBet = bets[0];
      await this.bankrollManager.recordBetSettlement(
        firstBet.bankrollId,
        Number(betSlip.totalStake),
        parlayPayout,
        true
      );
    } else if (parlayResult === BetResult.VOID) {
      const firstBet = bets[0];
      await this.bankrollManager.recordBetSettlement(
        firstBet.bankrollId,
        Number(betSlip.totalStake),
        Number(betSlip.totalStake),
        false
      );
    } else {
      const firstBet = bets[0];
      await this.bankrollManager.recordBetSettlement(
        firstBet.bankrollId,
        Number(betSlip.totalStake),
        0,
        false
      );
    }

    return bets.map(bet => ({
      betId: bet.id,
      userId: bet.userId,
      result: parlayResult,
      payout: parlayPayout / bets.length, // Distribute payout
      settledAt: new Date(),
    }));
  }

  /**
   * Evaluate a bet against game results
   */
  private evaluateBet(bet: any, gameResult: GameResult): BetResult {
    const homeScore = gameResult.homeScore;
    const awayScore = gameResult.awayScore;
    const spread = bet.line ? Number(bet.line) : 0;

    switch (bet.marketType) {
      case MarketType.H2H: // Moneyline
        return this.evaluateMoneyline(bet.selection, gameResult);

      case MarketType.SPREADS:
        return this.evaluateSpread(bet.selection, spread, gameResult);

      case MarketType.TOTALS:
        return this.evaluateTotal(bet.selection, spread, gameResult);

      default:
        throw new Error(`Unknown market type: ${bet.marketType}`);
    }
  }

  /**
   * Evaluate moneyline bet
   */
  private evaluateMoneyline(selection: string, gameResult: GameResult): BetResult {
    const homeWon = gameResult.homeScore > gameResult.awayScore;
    const isHomeTeam = selection === gameResult.homeTeam;
    
    if (gameResult.homeScore === gameResult.awayScore) {
      return BetResult.PUSH;
    }
    
    const betWon = (isHomeTeam && homeWon) || (!isHomeTeam && !homeWon);
    return betWon ? BetResult.WIN : BetResult.LOSS;
  }

  /**
   * Evaluate spread bet
   */
  private evaluateSpread(
    selection: string, 
    spread: number, 
    gameResult: GameResult
  ): BetResult {
    const isHomeTeam = selection === gameResult.homeTeam;
    const actualDiff = gameResult.homeScore - gameResult.awayScore;
    
    let adjustedDiff: number;
    if (isHomeTeam) {
      adjustedDiff = actualDiff + spread;
    } else {
      adjustedDiff = -actualDiff + spread;
    }
    
    if (adjustedDiff > 0) {
      return BetResult.WIN;
    } else if (adjustedDiff < 0) {
      return BetResult.LOSS;
    } else {
      return BetResult.PUSH;
    }
  }

  /**
   * Evaluate total (over/under) bet
   */
  private evaluateTotal(
    selection: string, 
    total: number, 
    gameResult: GameResult
  ): BetResult {
    const actualTotal = gameResult.homeScore + gameResult.awayScore;
    const isOver = selection.toLowerCase() === 'over';
    
    if (actualTotal === total) {
      return BetResult.PUSH;
    }
    
    const betWon = (isOver && actualTotal > total) || (!isOver && actualTotal < total);
    return betWon ? BetResult.WIN : BetResult.LOSS;
  }

  /**
   * Void a bet (for cancelled/postponed games)
   */
  private async voidBet(bet: any): Promise<SettledBet> {
    await this.prisma.bet.update({
      where: { id: bet.id },
      data: {
        status: BetStatus.VOID,
        result: BetResult.VOID,
        actualPayout: Number(bet.stake), // Refund stake
        settledAt: new Date(),
      },
    });

    // Refund stake to bankroll
    await this.bankrollManager.recordBetSettlement(
      bet.bankrollId,
      Number(bet.stake),
      Number(bet.stake),
      false
    );

    return {
      betId: bet.id,
      userId: bet.userId,
      result: BetResult.VOID,
      payout: Number(bet.stake),
      settledAt: new Date(),
    };
  }

  /**
   * Convert result to status
   */
  private resultToStatus(result: BetResult): BetStatus {
    switch (result) {
      case BetResult.WIN:
        return BetStatus.WON;
      case BetResult.LOSS:
        return BetStatus.LOST;
      case BetResult.PUSH:
        return BetStatus.PUSH;
      case BetResult.VOID:
        return BetStatus.VOID;
      default:
        return BetStatus.PENDING;
    }
  }

  /**
   * Group bets by slip ID
   */
  private groupBetsBySlip(bets: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    
    for (const bet of bets) {
      if (bet.betSlipId) {
        const existing = groups.get(bet.betSlipId) || [];
        existing.push(bet);
        groups.set(bet.betSlipId, existing);
      }
    }
    
    return groups;
  }

  /**
   * Manually settle a bet (admin function)
   */
  async manuallySettleBet(
    betId: string,
    result: BetResult,
    notes: string
  ): Promise<void> {
    const bet = await this.prisma.bet.findUnique({
      where: { id: betId },
    });

    if (!bet) {
      throw new Error('Bet not found');
    }

    const payout = result === BetResult.WIN ? Number(bet.potentialPayout) : 0;

    await this.prisma.$transaction(async (tx) => {
      // Update bet
      await tx.bet.update({
        where: { id: betId },
        data: {
          status: this.resultToStatus(result),
          result,
          actualPayout: payout,
          settledAt: new Date(),
          metadata: {
            ...(bet.metadata as any),
            manualSettlement: true,
            notes,
          },
        },
      });

      // Create settlement record
      await tx.settlement.create({
        data: {
          betId,
          userId: bet.userId,
          leagueId: bet.leagueId,
          leagueSandbox: bet.leagueSandbox,
          gameId: bet.gameId,
          betAmount: Number(bet.stake),
          payoutAmount: payout,
          result,
          gameScore: {},
          settledBy: 'MANUAL',
          notes,
        },
      });

      // Update bankroll
      if (result === BetResult.WIN || result === BetResult.PUSH) {
        const refundAmount = result === BetResult.PUSH ? Number(bet.stake) : payout;
        await this.bankrollManager.recordBetSettlement(
          bet.bankrollId,
          Number(bet.stake),
          refundAmount,
          result === BetResult.WIN
        );
      }
    });
  }
}

// Export singleton factory
export const settlementEngine = (
  prisma: PrismaClient,
  bankrollManager: BankrollManager
) => new SettlementEngine(prisma, bankrollManager);