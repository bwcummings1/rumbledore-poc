/**
 * BetValidator - Validates bet requests before placement
 * 
 * This service handles:
 * - Stake validation (min/max amounts)
 * - Bankroll sufficiency checks
 * - Game status validation
 * - Odds freshness verification
 * - Duplicate bet prevention
 * - Parlay validation
 */

import { PrismaClient } from '@prisma/client';
import {
  BetRequest,
  BetValidationError,
  BettingLimits,
  DEFAULT_BETTING_LIMITS,
  BankrollInfo,
  GameOdds,
} from '@/types/betting';
import { OddsApiClient } from './odds-client';
import { redis } from '@/lib/redis';

export interface ValidationResult {
  valid: boolean;
  error?: BetValidationError;
  message?: string;
}

export interface ParlayValidationResult extends ValidationResult {
  invalidLegs?: number[]; // Indices of invalid legs
}

export class BetValidator {
  private prisma: PrismaClient;
  private oddsClient: OddsApiClient;
  private limits: BettingLimits;
  private duplicateCheckWindow = 30; // seconds

  constructor(
    prisma: PrismaClient, 
    oddsClient: OddsApiClient,
    limits: BettingLimits = DEFAULT_BETTING_LIMITS
  ) {
    this.prisma = prisma;
    this.oddsClient = oddsClient;
    this.limits = limits;
  }

  /**
   * Validate a single bet request
   */
  async validateBet(
    bet: BetRequest,
    bankroll: BankrollInfo
  ): Promise<ValidationResult> {
    // 1. Validate stake amount
    const stakeValidation = this.validateStake(bet.stake, bankroll.currentBalance);
    if (!stakeValidation.valid) {
      return stakeValidation;
    }

    // 2. Check for sufficient funds
    if (bet.stake > bankroll.currentBalance) {
      return {
        valid: false,
        error: BetValidationError.INSUFFICIENT_FUNDS,
        message: `Insufficient funds. Available: $${bankroll.currentBalance.toFixed(2)}`,
      };
    }

    // 3. Check if game has already started
    const gameStarted = await this.hasGameStarted(bet.gameId, bet.eventDate);
    if (gameStarted) {
      return {
        valid: false,
        error: BetValidationError.GAME_ALREADY_STARTED,
        message: 'Cannot place bet on a game that has already started',
      };
    }

    // 4. Validate odds are still available and fresh
    const oddsValid = await this.validateOdds(bet.gameId, bet.marketType, bet.odds);
    if (!oddsValid) {
      return {
        valid: false,
        error: BetValidationError.INVALID_ODDS,
        message: 'Odds have changed or are no longer available',
      };
    }

    // 5. Check for duplicate bets (same game, market, selection within time window)
    const isDuplicate = await this.checkDuplicateBet(bet);
    if (isDuplicate) {
      return {
        valid: false,
        error: BetValidationError.DUPLICATE_BET,
        message: 'Similar bet already placed recently',
      };
    }

    // 6. Check weekly bet limit
    const betCount = await this.getUserWeeklyBetCount(bet.userId, bet.leagueId);
    if (betCount >= this.limits.maxWeeklyBets) {
      return {
        valid: false,
        error: BetValidationError.MAX_BETS_EXCEEDED,
        message: `Weekly bet limit reached (${this.limits.maxWeeklyBets} bets)`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate a parlay bet
   */
  async validateParlay(
    bets: BetRequest[],
    totalStake: number,
    bankroll: BankrollInfo
  ): Promise<ParlayValidationResult> {
    // 1. Check parlay leg limit
    if (bets.length > this.limits.maxParlayLegs) {
      return {
        valid: false,
        error: BetValidationError.MAX_BETS_EXCEEDED,
        message: `Maximum ${this.limits.maxParlayLegs} legs allowed in a parlay`,
      };
    }

    // 2. Validate total stake
    const stakeValidation = this.validateStake(totalStake, bankroll.currentBalance);
    if (!stakeValidation.valid) {
      return stakeValidation;
    }

    // 3. Check for duplicate games in parlay
    const gameIds = bets.map(b => b.gameId);
    const uniqueGames = new Set(gameIds);
    if (uniqueGames.size !== gameIds.length) {
      return {
        valid: false,
        error: BetValidationError.DUPLICATE_BET,
        message: 'Cannot include the same game multiple times in a parlay',
      };
    }

    // 4. Validate each individual leg
    const invalidLegs: number[] = [];
    for (let i = 0; i < bets.length; i++) {
      const bet = bets[i];
      
      // Check if game has started
      const gameStarted = await this.hasGameStarted(bet.gameId, bet.eventDate);
      if (gameStarted) {
        invalidLegs.push(i);
        continue;
      }

      // Validate odds
      const oddsValid = await this.validateOdds(bet.gameId, bet.marketType, bet.odds);
      if (!oddsValid) {
        invalidLegs.push(i);
      }
    }

    if (invalidLegs.length > 0) {
      return {
        valid: false,
        error: BetValidationError.INVALID_ODDS,
        message: `Invalid legs in parlay: ${invalidLegs.map(i => i + 1).join(', ')}`,
        invalidLegs,
      };
    }

    return { valid: true };
  }

  /**
   * Validate stake amount
   */
  private validateStake(stake: number, currentBalance: number): ValidationResult {
    if (stake < this.limits.minBet) {
      return {
        valid: false,
        error: BetValidationError.INVALID_STAKE,
        message: `Minimum bet is $${this.limits.minBet}`,
      };
    }

    if (stake > this.limits.maxBet) {
      return {
        valid: false,
        error: BetValidationError.INVALID_STAKE,
        message: `Maximum bet is $${this.limits.maxBet}`,
      };
    }

    if (stake > currentBalance) {
      return {
        valid: false,
        error: BetValidationError.INSUFFICIENT_FUNDS,
        message: `Insufficient funds. Available: $${currentBalance.toFixed(2)}`,
      };
    }

    return { valid: true };
  }

  /**
   * Check if a game has already started
   */
  private async hasGameStarted(gameId: string, eventDate: Date): Promise<boolean> {
    const now = new Date();
    
    // First check the provided event date
    if (eventDate <= now) {
      return true;
    }

    // Double-check with live odds data if available
    const cacheKey = `game:started:${gameId}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    // Check with odds API for latest game status
    try {
      const odds = await this.oddsClient.getGameOdds(gameId);
      if (odds && odds.commenceTime) {
        const gameStart = new Date(odds.commenceTime);
        const started = gameStart <= now;
        
        // Cache the result for 5 minutes
        await redis.setex(cacheKey, 300, started.toString());
        return started;
      }
    } catch (error) {
      console.error('Error checking game status:', error);
    }

    // Fall back to the provided event date
    return false;
  }

  /**
   * Validate that odds are still available and haven't changed significantly
   */
  private async validateOdds(
    gameId: string,
    marketType: string,
    requestedOdds: number
  ): Promise<boolean> {
    try {
      // Get current odds from cache or API
      const currentOdds = await this.oddsClient.getGameOdds(gameId);
      if (!currentOdds) {
        return false;
      }

      // Check if the market is still available
      const market = currentOdds.markets?.[marketType.toLowerCase()];
      if (!market) {
        return false;
      }

      // Allow some tolerance for odds movement (within 10 points)
      const oddsTolerance = 10;
      const availableOdds = market.bestOdds || market.odds;
      
      if (Math.abs(availableOdds - requestedOdds) > oddsTolerance) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating odds:', error);
      return false;
    }
  }

  /**
   * Check for duplicate bets within a time window
   */
  private async checkDuplicateBet(bet: BetRequest): Promise<boolean> {
    const recentBets = await this.prisma.bet.findMany({
      where: {
        userId: bet.userId,
        leagueId: bet.leagueId,
        gameId: bet.gameId,
        marketType: bet.marketType,
        selection: bet.selection,
        status: 'PENDING',
        createdAt: {
          gte: new Date(Date.now() - this.duplicateCheckWindow * 1000),
        },
      },
    });

    return recentBets.length > 0;
  }

  /**
   * Get user's bet count for the current week
   */
  private async getUserWeeklyBetCount(
    userId: string,
    leagueId: string
  ): Promise<number> {
    const weekStart = this.getWeekStart();
    
    const count = await this.prisma.bet.count({
      where: {
        userId,
        leagueId,
        createdAt: { gte: weekStart },
      },
    });

    return count;
  }

  /**
   * Get the start of the current NFL week (Tuesday)
   */
  private getWeekStart(): Date {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToTuesday = dayOfWeek === 0 ? 2 : (dayOfWeek === 1 ? 1 : 9 - dayOfWeek);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToTuesday);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }

  /**
   * Validate game selection (team name or over/under)
   */
  async validateSelection(
    gameId: string,
    marketType: string,
    selection: string
  ): Promise<boolean> {
    try {
      const gameOdds = await this.oddsClient.getGameOdds(gameId);
      if (!gameOdds) {
        return false;
      }

      // For moneyline and spreads, selection should be a team name
      if (marketType === 'H2H' || marketType === 'SPREADS') {
        const validTeams = [gameOdds.homeTeam, gameOdds.awayTeam];
        return validTeams.includes(selection);
      }

      // For totals, selection should be 'Over' or 'Under'
      if (marketType === 'TOTALS') {
        return ['Over', 'Under'].includes(selection);
      }

      return false;
    } catch (error) {
      console.error('Error validating selection:', error);
      return false;
    }
  }

  /**
   * Update betting limits (for admin use)
   */
  updateLimits(newLimits: Partial<BettingLimits>): void {
    this.limits = { ...this.limits, ...newLimits };
  }

  /**
   * Get current betting limits
   */
  getLimits(): BettingLimits {
    return this.limits;
  }
}

// Export singleton factory
export const betValidator = (
  prisma: PrismaClient,
  oddsClient: OddsApiClient,
  limits?: BettingLimits
) => new BetValidator(prisma, oddsClient, limits);