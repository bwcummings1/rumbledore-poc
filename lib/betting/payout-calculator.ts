/**
 * PayoutCalculator - Handles payout calculations for different bet types
 * 
 * This service handles:
 * - American odds to decimal conversion
 * - Single bet payout calculation
 * - Parlay payout calculation
 * - Round robin payout calculation
 * - Implied probability calculation
 * - Vig/juice calculation
 */

import { MarketType, BetType } from '@prisma/client';

export class PayoutCalculator {
  /**
   * Convert American odds to decimal odds
   */
  static americanToDecimal(americanOdds: number): number {
    if (americanOdds > 0) {
      return 1 + (americanOdds / 100);
    } else {
      return 1 + (100 / Math.abs(americanOdds));
    }
  }

  /**
   * Convert decimal odds to American odds
   */
  static decimalToAmerican(decimalOdds: number): number {
    if (decimalOdds >= 2) {
      return Math.round((decimalOdds - 1) * 100);
    } else {
      return Math.round(-100 / (decimalOdds - 1));
    }
  }

  /**
   * Calculate implied probability from American odds
   */
  static americanToImpliedProbability(americanOdds: number): number {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }

  /**
   * Calculate payout for a single bet
   */
  static calculateSinglePayout(stake: number, americanOdds: number): number {
    const decimalOdds = this.americanToDecimal(americanOdds);
    return stake * decimalOdds;
  }

  /**
   * Calculate profit for a single bet
   */
  static calculateProfit(stake: number, americanOdds: number): number {
    return this.calculateSinglePayout(stake, americanOdds) - stake;
  }

  /**
   * Calculate parlay payout
   */
  static calculateParlayPayout(stake: number, odds: number[]): number {
    const decimalOdds = odds.map(o => this.americanToDecimal(o));
    const combinedOdds = decimalOdds.reduce((acc, curr) => acc * curr, 1);
    return stake * combinedOdds;
  }

  /**
   * Calculate parlay odds from individual legs
   */
  static calculateParlayOdds(odds: number[]): number {
    const decimalOdds = odds.map(o => this.americanToDecimal(o));
    const combinedDecimal = decimalOdds.reduce((acc, curr) => acc * curr, 1);
    return this.decimalToAmerican(combinedDecimal);
  }

  /**
   * Calculate round robin payouts
   * @param stake - Stake per combination
   * @param odds - Array of odds for each selection
   * @param combinationSize - Size of each parlay (2 for doubles, 3 for trebles, etc.)
   */
  static calculateRoundRobinPayout(
    stake: number,
    odds: number[],
    combinationSize: number
  ): {
    combinations: number[][];
    payouts: number[];
    totalPayout: number;
    totalStake: number;
  } {
    const combinations = this.getCombinations(odds, combinationSize);
    const payouts = combinations.map(combo => 
      this.calculateParlayPayout(stake, combo)
    );
    
    return {
      combinations,
      payouts,
      totalPayout: payouts.reduce((sum, payout) => sum + payout, 0),
      totalStake: stake * combinations.length,
    };
  }

  /**
   * Get all combinations of a certain size from an array
   */
  private static getCombinations<T>(arr: T[], size: number): T[][] {
    if (size === 1) {
      return arr.map(el => [el]);
    }

    const combinations: T[][] = [];
    
    for (let i = 0; i <= arr.length - size; i++) {
      const head = arr[i];
      const tail = arr.slice(i + 1);
      const tailCombinations = this.getCombinations(tail, size - 1);
      
      for (const combo of tailCombinations) {
        combinations.push([head, ...combo]);
      }
    }
    
    return combinations;
  }

  /**
   * Calculate the vig/juice for a market
   */
  static calculateVig(odds1: number, odds2: number): number {
    const prob1 = this.americanToImpliedProbability(odds1);
    const prob2 = this.americanToImpliedProbability(odds2);
    const totalProb = prob1 + prob2;
    return ((totalProb - 1) / totalProb) * 100;
  }

  /**
   * Calculate true odds removing vig
   */
  static removedVigOdds(odds1: number, odds2: number): {
    trueOdds1: number;
    trueOdds2: number;
    vig: number;
  } {
    const prob1 = this.americanToImpliedProbability(odds1);
    const prob2 = this.americanToImpliedProbability(odds2);
    const totalProb = prob1 + prob2;
    
    const trueProb1 = prob1 / totalProb;
    const trueProb2 = prob2 / totalProb;
    
    const trueOdds1 = this.impliedProbabilityToAmerican(trueProb1);
    const trueOdds2 = this.impliedProbabilityToAmerican(trueProb2);
    
    return {
      trueOdds1,
      trueOdds2,
      vig: this.calculateVig(odds1, odds2),
    };
  }

  /**
   * Convert implied probability to American odds
   */
  static impliedProbabilityToAmerican(probability: number): number {
    if (probability >= 0.5) {
      return Math.round(-(probability * 100) / (1 - probability));
    } else {
      return Math.round((100 / probability) - 100);
    }
  }

  /**
   * Calculate Kelly Criterion bet size
   * @param bankroll - Total bankroll
   * @param probability - Estimated win probability (0-1)
   * @param americanOdds - American odds
   * @param kellyFraction - Fraction of Kelly to use (e.g., 0.25 for quarter Kelly)
   */
  static calculateKellyBet(
    bankroll: number,
    probability: number,
    americanOdds: number,
    kellyFraction = 0.25
  ): number {
    const decimalOdds = this.americanToDecimal(americanOdds) - 1;
    const kelly = (probability * decimalOdds - (1 - probability)) / decimalOdds;
    
    if (kelly <= 0) {
      return 0; // Don't bet if Kelly is negative
    }
    
    const betSize = bankroll * kelly * kellyFraction;
    return Math.min(betSize, bankroll * 0.1); // Cap at 10% of bankroll
  }

  /**
   * Calculate expected value of a bet
   */
  static calculateExpectedValue(
    stake: number,
    winProbability: number,
    americanOdds: number
  ): number {
    const payout = this.calculateSinglePayout(stake, americanOdds);
    const profit = payout - stake;
    return (winProbability * profit) - ((1 - winProbability) * stake);
  }

  /**
   * Calculate ROI percentage
   */
  static calculateROI(totalWon: number, totalWagered: number): number {
    if (totalWagered === 0) return 0;
    return ((totalWon - totalWagered) / totalWagered) * 100;
  }

  /**
   * Calculate breakeven win percentage for given odds
   */
  static calculateBreakevenPercentage(americanOdds: number): number {
    return this.americanToImpliedProbability(americanOdds) * 100;
  }

  /**
   * Format payout for display
   */
  static formatPayout(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  /**
   * Format American odds for display
   */
  static formatAmericanOdds(odds: number): string {
    return odds > 0 ? `+${odds}` : `${odds}`;
  }

  /**
   * Calculate parlay with push handling
   * Some legs might push, reducing the parlay
   */
  static calculateReducedParlay(
    stake: number,
    odds: number[],
    results: ('win' | 'loss' | 'push')[]
  ): {
    payout: number;
    activeLegs: number;
    result: 'win' | 'loss' | 'push';
  } {
    // Check for any losses
    if (results.includes('loss')) {
      return { payout: 0, activeLegs: 0, result: 'loss' };
    }

    // Filter out pushes
    const activeOdds = odds.filter((_, i) => results[i] === 'win');
    
    // If all legs pushed
    if (activeOdds.length === 0) {
      return { payout: stake, activeLegs: 0, result: 'push' };
    }

    // Calculate payout with remaining legs
    const payout = this.calculateParlayPayout(stake, activeOdds);
    
    return {
      payout,
      activeLegs: activeOdds.length,
      result: 'win',
    };
  }

  /**
   * Calculate hedge bet amount
   * Used to guarantee profit or minimize loss
   */
  static calculateHedgeBet(
    originalStake: number,
    originalOdds: number,
    hedgeOdds: number,
    desiredProfit = 0
  ): {
    hedgeStake: number;
    originalWinProfit: number;
    hedgeWinProfit: number;
    guaranteedProfit: number;
  } {
    const originalPayout = this.calculateSinglePayout(originalStake, originalOdds);
    
    // Calculate hedge stake to guarantee desired profit
    const hedgeStake = (originalPayout - originalStake - desiredProfit) / 
                      (this.americanToDecimal(hedgeOdds) - 1);
    
    const hedgePayout = this.calculateSinglePayout(hedgeStake, hedgeOdds);
    
    return {
      hedgeStake: Math.max(0, hedgeStake),
      originalWinProfit: originalPayout - originalStake - hedgeStake,
      hedgeWinProfit: hedgePayout - hedgeStake - originalStake,
      guaranteedProfit: Math.min(
        originalPayout - originalStake - hedgeStake,
        hedgePayout - hedgeStake - originalStake
      ),
    };
  }
}

// Export as singleton
export const payoutCalculator = PayoutCalculator;