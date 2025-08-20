import {
  IConfidenceScorer,
  ConfidenceFactors,
  ConfidenceExplanation,
  MatchAction,
  ConfidenceLevel,
} from '@/types/identity';

/**
 * ConfidenceScorer class for calculating and explaining match confidence scores
 * Uses weighted factors to determine the likelihood of an identity match
 */
export class ConfidenceScorer implements IConfidenceScorer {
  // Default weights for different factors
  private readonly defaultWeights = {
    nameSimilarity: 0.35,      // Name is the most important factor
    positionMatch: 0.15,        // Position consistency matters
    teamContinuity: 0.15,       // Being on same team across seasons
    statSimilarity: 0.20,       // Statistical performance similarity
    draftPosition: 0.10,        // Draft position consistency
    ownership: 0.05,            // Ownership percentage similarity
  };
  
  /**
   * Calculate overall confidence score for identity match
   * @param factors - Individual confidence factors
   * @returns Confidence score between 0 and 1
   */
  calculateConfidence(factors: ConfidenceFactors): number {
    let score = 0;
    let totalWeight = 0;
    
    // Calculate weighted score
    for (const [factor, weight] of Object.entries(this.defaultWeights)) {
      const factorKey = factor as keyof ConfidenceFactors;
      const factorValue = factors[factorKey];
      
      if (factorValue !== undefined && factorValue !== null) {
        score += factorValue * weight;
        totalWeight += weight;
      }
    }
    
    // Handle seasonal performance if provided
    if (factors.seasonalPerformance !== undefined) {
      score += factors.seasonalPerformance * 0.1;
      totalWeight += 0.1;
    }
    
    // Normalize score if not all factors are present
    const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;
    
    // Apply adjustments based on special conditions
    return this.applySpecialAdjustments(normalizedScore, factors);
  }
  
  /**
   * Apply special adjustments to confidence score
   * Handles edge cases and special scenarios
   */
  private applySpecialAdjustments(
    baseScore: number,
    factors: ConfidenceFactors
  ): number {
    let adjustedScore = baseScore;
    
    // Boost score if name is nearly identical
    if (factors.nameSimilarity >= 0.95) {
      adjustedScore = Math.min(adjustedScore + 0.1, 1.0);
    }
    
    // Penalize if position doesn't match at all
    if (factors.positionMatch === 0) {
      adjustedScore *= 0.8;
    }
    
    // Boost if both name and stats are very similar
    if (factors.nameSimilarity >= 0.8 && factors.statSimilarity >= 0.8) {
      adjustedScore = Math.min(adjustedScore + 0.05, 1.0);
    }
    
    // Ensure score stays within bounds
    return Math.min(Math.max(adjustedScore, 0), 1);
  }
  
  /**
   * Determine action based on confidence score
   * @param confidence - Confidence score between 0 and 1
   * @returns Recommended action
   */
  determineAction(confidence: number): MatchAction {
    if (confidence >= 0.95) return 'auto_approve_high';
    if (confidence >= 0.85) return 'auto_approve';
    if (confidence >= 0.70) return 'manual_review';
    if (confidence >= 0.50) return 'manual_review_low';
    return 'skip';
  }
  
  /**
   * Generate detailed explanation for confidence score
   * @param factors - Individual confidence factors
   * @param score - Overall confidence score
   * @returns Detailed explanation with strengths, weaknesses, and suggestions
   */
  explainConfidence(
    factors: ConfidenceFactors,
    score: number
  ): ConfidenceExplanation {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const suggestions: string[] = [];
    
    // Analyze name similarity
    this.analyzeNameSimilarity(factors.nameSimilarity, strengths, weaknesses, suggestions);
    
    // Analyze position match
    this.analyzePositionMatch(factors.positionMatch, strengths, weaknesses, suggestions);
    
    // Analyze team continuity
    this.analyzeTeamContinuity(factors.teamContinuity, strengths, weaknesses, suggestions);
    
    // Analyze statistical similarity
    this.analyzeStatSimilarity(factors.statSimilarity, strengths, weaknesses, suggestions);
    
    // Analyze draft position if available
    if (factors.draftPosition !== undefined) {
      this.analyzeDraftPosition(factors.draftPosition, strengths, weaknesses, suggestions);
    }
    
    // Analyze ownership if available
    if (factors.ownership !== undefined) {
      this.analyzeOwnership(factors.ownership, strengths, weaknesses, suggestions);
    }
    
    // Add overall recommendations
    this.addOverallRecommendations(score, strengths, weaknesses, suggestions);
    
    return {
      score,
      level: this.getConfidenceLevel(score),
      strengths,
      weaknesses,
      suggestions,
      action: this.determineAction(score),
    };
  }
  
  /**
   * Analyze name similarity factor
   */
  private analyzeNameSimilarity(
    similarity: number,
    strengths: string[],
    weaknesses: string[],
    suggestions: string[]
  ): void {
    if (similarity >= 0.95) {
      strengths.push('Names are virtually identical');
    } else if (similarity >= 0.85) {
      strengths.push('Names are very similar');
    } else if (similarity >= 0.70) {
      strengths.push('Names have good similarity');
    } else if (similarity >= 0.50) {
      weaknesses.push('Names have moderate differences');
      suggestions.push('Check for nickname variations or name changes');
    } else {
      weaknesses.push('Names are significantly different');
      suggestions.push('Verify this is the same player despite name differences');
      suggestions.push('Check for data entry errors or official name changes');
    }
  }
  
  /**
   * Analyze position match factor
   */
  private analyzePositionMatch(
    match: number,
    strengths: string[],
    weaknesses: string[],
    suggestions: string[]
  ): void {
    if (match === 1.0) {
      strengths.push('Exact position match');
    } else if (match >= 0.5) {
      strengths.push('Compatible positions (e.g., FLEX eligible)');
    } else if (match > 0) {
      weaknesses.push('Positions are somewhat different');
      suggestions.push('Verify if player changed positions');
    } else {
      weaknesses.push('Completely different positions');
      suggestions.push('Check if this is actually the same player');
      suggestions.push('Investigate potential position changes or data errors');
    }
  }
  
  /**
   * Analyze team continuity factor
   */
  private analyzeTeamContinuity(
    continuity: number,
    strengths: string[],
    weaknesses: string[],
    suggestions: string[]
  ): void {
    if (continuity >= 0.8) {
      strengths.push('Strong NFL team continuity');
    } else if (continuity >= 0.5) {
      strengths.push('Some team continuity');
    } else if (continuity >= 0.3) {
      weaknesses.push('Limited team continuity');
      suggestions.push('Player may have been traded or changed teams');
    } else {
      weaknesses.push('No team continuity between seasons');
      suggestions.push('Verify player team history and trades');
    }
  }
  
  /**
   * Analyze statistical similarity factor
   */
  private analyzeStatSimilarity(
    similarity: number,
    strengths: string[],
    weaknesses: string[],
    suggestions: string[]
  ): void {
    if (similarity >= 0.85) {
      strengths.push('Very consistent statistical performance');
    } else if (similarity >= 0.70) {
      strengths.push('Similar statistical profile');
    } else if (similarity >= 0.50) {
      weaknesses.push('Moderate statistical variance');
      suggestions.push('Check for injuries or role changes');
    } else if (similarity >= 0.30) {
      weaknesses.push('Significant statistical differences');
      suggestions.push('Review if player had injury or major role change');
      suggestions.push('Verify playing time and usage differences');
    } else {
      weaknesses.push('Completely different statistical profiles');
      suggestions.push('May indicate different players or major career changes');
    }
  }
  
  /**
   * Analyze draft position factor
   */
  private analyzeDraftPosition(
    similarity: number,
    strengths: string[],
    weaknesses: string[],
    suggestions: string[]
  ): void {
    if (similarity >= 0.8) {
      strengths.push('Consistent draft position across seasons');
    } else if (similarity >= 0.5) {
      weaknesses.push('Significant draft position variance');
      suggestions.push('Player value may have changed due to performance');
    } else {
      weaknesses.push('Very different draft positions');
      suggestions.push('Check for breakout/decline seasons affecting draft stock');
    }
  }
  
  /**
   * Analyze ownership factor
   */
  private analyzeOwnership(
    similarity: number,
    strengths: string[],
    weaknesses: string[],
    suggestions: string[]
  ): void {
    if (similarity >= 0.8) {
      strengths.push('Similar ownership percentages');
    } else if (similarity < 0.3) {
      weaknesses.push('Very different ownership levels');
      suggestions.push('Player popularity may have changed significantly');
    }
  }
  
  /**
   * Add overall recommendations based on score
   */
  private addOverallRecommendations(
    score: number,
    strengths: string[],
    weaknesses: string[],
    suggestions: string[]
  ): void {
    if (score >= 0.95) {
      suggestions.push('Highly confident match - safe to auto-approve');
    } else if (score >= 0.85) {
      suggestions.push('Strong match - recommend automatic approval');
    } else if (score >= 0.70) {
      suggestions.push('Good match - manual review recommended for verification');
    } else if (score >= 0.50) {
      suggestions.push('Uncertain match - requires careful manual review');
      suggestions.push('Consider additional data sources for verification');
    } else {
      suggestions.push('Low confidence - likely different players');
      suggestions.push('Only merge if you have strong external evidence');
    }
    
    // Add data quality suggestions if there are many weaknesses
    if (weaknesses.length >= 3) {
      suggestions.push('Consider checking data quality and completeness');
    }
  }
  
  /**
   * Get confidence level description
   */
  private getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.9) return 'Very High';
    if (score >= 0.75) return 'High';
    if (score >= 0.6) return 'Medium';
    if (score >= 0.4) return 'Low';
    return 'Very Low';
  }
  
  /**
   * Calculate position compatibility score
   * Handles FLEX positions and multi-position eligibility
   */
  calculatePositionCompatibility(position1: string, position2: string): number {
    if (!position1 || !position2) return 0;
    
    const p1 = position1.toUpperCase();
    const p2 = position2.toUpperCase();
    
    // Exact match
    if (p1 === p2) return 1.0;
    
    // FLEX compatibility
    const flexPositions = ['RB', 'WR', 'TE'];
    if ((p1 === 'FLEX' && flexPositions.includes(p2)) ||
        (p2 === 'FLEX' && flexPositions.includes(p1))) {
      return 0.8;
    }
    
    // Both are FLEX-eligible positions
    if (flexPositions.includes(p1) && flexPositions.includes(p2)) {
      return 0.3;
    }
    
    // D/ST variations
    if ((p1.includes('D/ST') || p1.includes('DST') || p1 === 'DEF') &&
        (p2.includes('D/ST') || p2.includes('DST') || p2 === 'DEF')) {
      return 1.0;
    }
    
    // No compatibility
    return 0;
  }
  
  /**
   * Calculate statistical similarity between two players
   * Compares average points, consistency, and trends
   */
  calculateStatisticalSimilarity(
    stats1: { averagePoints: number; games: number; totalPoints: number },
    stats2: { averagePoints: number; games: number; totalPoints: number }
  ): number {
    if (!stats1 || !stats2) return 0;
    
    // Both players have no stats
    if (stats1.games === 0 && stats2.games === 0) return 1.0;
    
    // One player has no stats
    if (stats1.games === 0 || stats2.games === 0) return 0;
    
    // Compare average points per game
    const avgDiff = Math.abs(stats1.averagePoints - stats2.averagePoints);
    const avgMean = (stats1.averagePoints + stats2.averagePoints) / 2;
    
    if (avgMean === 0) return 0;
    
    // Calculate similarity as percentage difference from mean
    const avgSimilarity = Math.max(0, 1 - (avgDiff / avgMean));
    
    // Compare games played (availability)
    const gamesDiff = Math.abs(stats1.games - stats2.games);
    const maxGames = Math.max(stats1.games, stats2.games);
    const gamesSimilarity = 1 - (gamesDiff / maxGames);
    
    // Weighted average (points matter more than games)
    return avgSimilarity * 0.7 + gamesSimilarity * 0.3;
  }
}