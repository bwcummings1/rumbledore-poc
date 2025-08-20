import { ConfidenceScorer } from '@/lib/identity/confidence-scorer';
import { ConfidenceFactors, MatchAction } from '@/types/identity';

describe('ConfidenceScorer', () => {
  let scorer: ConfidenceScorer;

  beforeEach(() => {
    scorer = new ConfidenceScorer();
  });

  describe('calculateConfidence', () => {
    it('should calculate perfect confidence for perfect match', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 1.0,
        positionMatch: 1.0,
        teamContinuity: 1.0,
        statSimilarity: 1.0,
        draftPosition: 1.0,
        ownership: 1.0,
      };
      
      const score = scorer.calculateConfidence(factors);
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('should calculate zero confidence for no match', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 0,
        positionMatch: 0,
        teamContinuity: 0,
        statSimilarity: 0,
      };
      
      const score = scorer.calculateConfidence(factors);
      expect(score).toBe(0);
    });

    it('should weight factors correctly', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 1.0, // 35% weight
        positionMatch: 0,     // 15% weight
        teamContinuity: 0,    // 15% weight
        statSimilarity: 0,    // 20% weight
      };
      
      const score = scorer.calculateConfidence(factors);
      expect(score).toBeCloseTo(0.35, 2);
    });

    it('should normalize when not all factors present', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 1.0,
        positionMatch: 1.0,
        teamContinuity: 0.5,
        statSimilarity: 0.8,
        // draft and ownership not provided
      };
      
      const score = scorer.calculateConfidence(factors);
      expect(score).toBeGreaterThan(0.7);
      expect(score).toBeLessThan(0.9);
    });

    it('should apply boost for near-identical names', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 0.96,
        positionMatch: 0.5,
        teamContinuity: 0.5,
        statSimilarity: 0.5,
      };
      
      const score = scorer.calculateConfidence(factors);
      const baseScore = 0.96 * 0.35 + 0.5 * 0.15 + 0.5 * 0.15 + 0.5 * 0.2;
      const normalized = baseScore / 0.85;
      
      // Should be boosted by 0.1
      expect(score).toBeGreaterThan(normalized);
    });

    it('should penalize position mismatch', () => {
      const factorsWithMatch: ConfidenceFactors = {
        nameSimilarity: 0.8,
        positionMatch: 1.0,
        teamContinuity: 0.5,
        statSimilarity: 0.5,
      };
      
      const factorsNoMatch: ConfidenceFactors = {
        nameSimilarity: 0.8,
        positionMatch: 0,
        teamContinuity: 0.5,
        statSimilarity: 0.5,
      };
      
      const scoreWithMatch = scorer.calculateConfidence(factorsWithMatch);
      const scoreNoMatch = scorer.calculateConfidence(factorsNoMatch);
      
      // Position mismatch should reduce score by ~20%
      expect(scoreNoMatch).toBeLessThan(scoreWithMatch * 0.85);
    });

    it('should boost for high name and stat similarity', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 0.85,
        positionMatch: 1.0,
        teamContinuity: 0.5,
        statSimilarity: 0.85,
      };
      
      const score = scorer.calculateConfidence(factors);
      expect(score).toBeGreaterThan(0.8);
    });

    it('should handle edge cases', () => {
      // Empty factors
      const emptyScore = scorer.calculateConfidence({
        nameSimilarity: 0,
        positionMatch: 0,
        teamContinuity: 0,
        statSimilarity: 0,
      });
      expect(emptyScore).toBe(0);

      // Only optional factors
      const optionalOnly = scorer.calculateConfidence({
        nameSimilarity: 0,
        positionMatch: 0,
        teamContinuity: 0,
        statSimilarity: 0,
        draftPosition: 1.0,
        ownership: 1.0,
      });
      expect(optionalOnly).toBeCloseTo(0.15, 2);
    });
  });

  describe('determineAction', () => {
    it('should return correct actions for confidence levels', () => {
      expect(scorer.determineAction(0.96)).toBe('auto_approve_high');
      expect(scorer.determineAction(0.95)).toBe('auto_approve_high');
      expect(scorer.determineAction(0.90)).toBe('auto_approve');
      expect(scorer.determineAction(0.85)).toBe('auto_approve');
      expect(scorer.determineAction(0.75)).toBe('manual_review');
      expect(scorer.determineAction(0.70)).toBe('manual_review');
      expect(scorer.determineAction(0.60)).toBe('manual_review_low');
      expect(scorer.determineAction(0.50)).toBe('manual_review_low');
      expect(scorer.determineAction(0.40)).toBe('skip');
      expect(scorer.determineAction(0)).toBe('skip');
    });

    it('should handle edge values', () => {
      expect(scorer.determineAction(1.0)).toBe('auto_approve_high');
      expect(scorer.determineAction(0.949)).toBe('auto_approve');
      expect(scorer.determineAction(0.849)).toBe('manual_review');
      expect(scorer.determineAction(0.699)).toBe('manual_review_low');
      expect(scorer.determineAction(0.499)).toBe('skip');
    });
  });

  describe('explainConfidence', () => {
    it('should provide detailed explanation for high confidence', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 0.95,
        positionMatch: 1.0,
        teamContinuity: 0.8,
        statSimilarity: 0.85,
      };
      
      const explanation = scorer.explainConfidence(factors, 0.9);
      
      expect(explanation.level).toBe('Very High');
      expect(explanation.action).toBe('auto_approve');
      expect(explanation.strengths).toContain('Names are virtually identical');
      expect(explanation.strengths).toContain('Exact position match');
      expect(explanation.strengths).toContain('Strong NFL team continuity');
      expect(explanation.strengths).toContain('Very consistent statistical performance');
      expect(explanation.weaknesses).toHaveLength(0);
    });

    it('should provide warnings for low confidence', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 0.4,
        positionMatch: 0,
        teamContinuity: 0.2,
        statSimilarity: 0.3,
      };
      
      const explanation = scorer.explainConfidence(factors, 0.3);
      
      expect(explanation.level).toBe('Very Low');
      expect(explanation.action).toBe('skip');
      expect(explanation.weaknesses).toContain('Names are significantly different');
      expect(explanation.weaknesses).toContain('Completely different positions');
      expect(explanation.weaknesses).toContain('No team continuity between seasons');
      expect(explanation.weaknesses).toContain('Significant statistical differences');
      expect(explanation.suggestions.length).toBeGreaterThan(3);
    });

    it('should provide balanced feedback for medium confidence', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 0.75,
        positionMatch: 1.0,
        teamContinuity: 0.4,
        statSimilarity: 0.6,
      };
      
      const explanation = scorer.explainConfidence(factors, 0.65);
      
      expect(explanation.level).toBe('Medium');
      expect(explanation.action).toBe('manual_review_low');
      expect(explanation.strengths.length).toBeGreaterThan(0);
      expect(explanation.weaknesses.length).toBeGreaterThan(0);
      expect(explanation.suggestions).toContain('Consider additional data sources for verification');
    });

    it('should handle optional factors in explanation', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 0.8,
        positionMatch: 1.0,
        teamContinuity: 0.7,
        statSimilarity: 0.8,
        draftPosition: 0.3,
        ownership: 0.9,
      };
      
      const explanation = scorer.explainConfidence(factors, 0.75);
      
      expect(explanation.weaknesses).toContain('Very different draft positions');
      expect(explanation.strengths).toContain('Similar ownership percentages');
    });
  });

  describe('calculatePositionCompatibility', () => {
    it('should return 1.0 for exact matches', () => {
      expect(scorer.calculatePositionCompatibility('QB', 'QB')).toBe(1.0);
      expect(scorer.calculatePositionCompatibility('RB', 'RB')).toBe(1.0);
      expect(scorer.calculatePositionCompatibility('WR', 'WR')).toBe(1.0);
      expect(scorer.calculatePositionCompatibility('TE', 'TE')).toBe(1.0);
    });

    it('should handle FLEX compatibility', () => {
      expect(scorer.calculatePositionCompatibility('RB', 'FLEX')).toBe(0.8);
      expect(scorer.calculatePositionCompatibility('WR', 'FLEX')).toBe(0.8);
      expect(scorer.calculatePositionCompatibility('TE', 'FLEX')).toBe(0.8);
      expect(scorer.calculatePositionCompatibility('FLEX', 'RB')).toBe(0.8);
    });

    it('should handle FLEX-eligible positions', () => {
      expect(scorer.calculatePositionCompatibility('RB', 'WR')).toBe(0.3);
      expect(scorer.calculatePositionCompatibility('RB', 'TE')).toBe(0.3);
      expect(scorer.calculatePositionCompatibility('WR', 'TE')).toBe(0.3);
    });

    it('should handle defense variations', () => {
      expect(scorer.calculatePositionCompatibility('D/ST', 'DST')).toBe(1.0);
      expect(scorer.calculatePositionCompatibility('DEF', 'D/ST')).toBe(1.0);
      expect(scorer.calculatePositionCompatibility('DST', 'DEF')).toBe(1.0);
    });

    it('should return 0 for incompatible positions', () => {
      expect(scorer.calculatePositionCompatibility('QB', 'RB')).toBe(0);
      expect(scorer.calculatePositionCompatibility('K', 'DEF')).toBe(0);
      expect(scorer.calculatePositionCompatibility('QB', 'WR')).toBe(0);
    });

    it('should handle null/empty positions', () => {
      expect(scorer.calculatePositionCompatibility('', 'QB')).toBe(0);
      expect(scorer.calculatePositionCompatibility('RB', '')).toBe(0);
      expect(scorer.calculatePositionCompatibility(null as any, 'QB')).toBe(0);
    });
  });

  describe('calculateStatisticalSimilarity', () => {
    it('should return 1.0 for identical stats', () => {
      const stats1 = { averagePoints: 15.5, games: 16, totalPoints: 248 };
      const stats2 = { averagePoints: 15.5, games: 16, totalPoints: 248 };
      
      expect(scorer.calculateStatisticalSimilarity(stats1, stats2)).toBe(1.0);
    });

    it('should calculate similarity for similar stats', () => {
      const stats1 = { averagePoints: 15.0, games: 16, totalPoints: 240 };
      const stats2 = { averagePoints: 14.0, games: 15, totalPoints: 210 };
      
      const similarity = scorer.calculateStatisticalSimilarity(stats1, stats2);
      expect(similarity).toBeGreaterThan(0.8);
      expect(similarity).toBeLessThan(1.0);
    });

    it('should return low similarity for very different stats', () => {
      const stats1 = { averagePoints: 20.0, games: 16, totalPoints: 320 };
      const stats2 = { averagePoints: 5.0, games: 8, totalPoints: 40 };
      
      const similarity = scorer.calculateStatisticalSimilarity(stats1, stats2);
      expect(similarity).toBeLessThan(0.4);
    });

    it('should handle players with no games', () => {
      const stats1 = { averagePoints: 0, games: 0, totalPoints: 0 };
      const stats2 = { averagePoints: 0, games: 0, totalPoints: 0 };
      
      expect(scorer.calculateStatisticalSimilarity(stats1, stats2)).toBe(1.0);
      
      const stats3 = { averagePoints: 15.0, games: 16, totalPoints: 240 };
      expect(scorer.calculateStatisticalSimilarity(stats1, stats3)).toBe(0);
    });

    it('should handle null stats', () => {
      const stats1 = { averagePoints: 15.0, games: 16, totalPoints: 240 };
      
      expect(scorer.calculateStatisticalSimilarity(null as any, stats1)).toBe(0);
      expect(scorer.calculateStatisticalSimilarity(stats1, null as any)).toBe(0);
    });
  });

  describe('Real-world scenarios', () => {
    it('should identify same player across seasons with high confidence', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 0.95, // "Patrick Mahomes" vs "Pat Mahomes"
        positionMatch: 1.0,    // Both QB
        teamContinuity: 1.0,   // Same team
        statSimilarity: 0.85,  // Similar performance
      };
      
      const score = scorer.calculateConfidence(factors);
      expect(score).toBeGreaterThan(0.85);
      expect(scorer.determineAction(score)).toBe('auto_approve');
    });

    it('should flag player who changed teams for manual review', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 1.0,   // Exact name match
        positionMatch: 1.0,    // Same position
        teamContinuity: 0,     // Different team
        statSimilarity: 0.7,   // Somewhat similar stats
      };
      
      const score = scorer.calculateConfidence(factors);
      expect(score).toBeGreaterThan(0.6);
      expect(score).toBeLessThan(0.85);
      expect(scorer.determineAction(score)).toBe('manual_review');
    });

    it('should reject different players with similar names', () => {
      const factors: ConfidenceFactors = {
        nameSimilarity: 0.6,   // "Mike Williams" vs "Mike Evans"
        positionMatch: 1.0,    // Both WR
        teamContinuity: 0,     // Different teams
        statSimilarity: 0.3,   // Different performance levels
      };
      
      const score = scorer.calculateConfidence(factors);
      expect(score).toBeLessThan(0.6);
      expect(scorer.determineAction(score)).toBe('manual_review_low');
    });
  });
});