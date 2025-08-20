import { FuzzyMatcher } from '@/lib/identity/fuzzy-matcher';

describe('FuzzyMatcher', () => {
  let matcher: FuzzyMatcher;

  beforeEach(() => {
    matcher = new FuzzyMatcher();
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical names', () => {
      const score = matcher.calculateSimilarity('Patrick Mahomes', 'Patrick Mahomes');
      expect(score).toBe(1.0);
    });

    it('should handle case differences', () => {
      const score = matcher.calculateSimilarity('PATRICK MAHOMES', 'patrick mahomes');
      expect(score).toBe(1.0);
    });

    it('should match similar names with high confidence', () => {
      const score = matcher.calculateSimilarity('Patrick Mahomes', 'Pat Mahomes');
      expect(score).toBeGreaterThan(0.8);
    });

    it('should handle name variations with periods', () => {
      const score = matcher.calculateSimilarity('TJ Watt', 'T.J. Watt');
      expect(score).toBeGreaterThan(0.9);
    });

    it('should handle apostrophes in names', () => {
      const score = matcher.calculateSimilarity("D'Andre Swift", "DeAndre Swift");
      expect(score).toBeGreaterThan(0.8);
    });

    it('should handle Jr/Sr suffixes', () => {
      const normalized1 = matcher['handleNFLPlayerName']('Odell Beckham Jr');
      const normalized2 = matcher['handleNFLPlayerName']('Odell Beckham');
      expect(normalized1).toBe('odell beckham');
    });

    it('should return low score for completely different names', () => {
      const score = matcher.calculateSimilarity('Tom Brady', 'Aaron Rodgers');
      expect(score).toBeLessThan(0.4);
    });

    it('should handle single letter differences', () => {
      const score = matcher.calculateSimilarity('Mike Evans', 'Mike Evens');
      expect(score).toBeGreaterThan(0.85);
    });

    it('should handle empty or null inputs', () => {
      expect(matcher.calculateSimilarity('', 'Test')).toBe(0);
      expect(matcher.calculateSimilarity('Test', '')).toBe(0);
      expect(matcher.calculateSimilarity(null as any, 'Test')).toBe(0);
    });

    it('should handle hyphenated names', () => {
      const score = matcher.calculateSimilarity('JuJu Smith-Schuster', 'JuJu Smith Schuster');
      expect(score).toBeGreaterThan(0.9);
    });
  });

  describe('areNamesEquivalent', () => {
    it('should recognize common nicknames', () => {
      expect(matcher.areNamesEquivalent('Robert', 'Bob')).toBe(true);
      expect(matcher.areNamesEquivalent('William', 'Bill')).toBe(true);
      expect(matcher.areNamesEquivalent('Michael', 'Mike')).toBe(true);
      expect(matcher.areNamesEquivalent('James', 'Jim')).toBe(true);
      expect(matcher.areNamesEquivalent('Thomas', 'Tom')).toBe(true);
    });

    it('should handle initials', () => {
      expect(matcher.areNamesEquivalent('TJ', 'T.J.')).toBe(true);
      expect(matcher.areNamesEquivalent('AJ', 'A.J.')).toBe(true);
      expect(matcher.areNamesEquivalent('DJ', 'D.J.')).toBe(true);
    });

    it('should handle name containment', () => {
      expect(matcher.areNamesEquivalent('Tom', 'Tom Brady')).toBe(true);
      expect(matcher.areNamesEquivalent('Brady', 'Tom Brady')).toBe(true);
    });

    it('should not match different names', () => {
      expect(matcher.areNamesEquivalent('Tom', 'Jerry')).toBe(false);
      expect(matcher.areNamesEquivalent('Patrick', 'Aaron')).toBe(false);
    });
  });

  describe('findBestMatches', () => {
    const candidates = [
      'Patrick Mahomes',
      'Pat Mahomes',
      'Patrick Mahomes II',
      'Josh Allen',
      'Justin Herbert',
      'Patrick Star',
    ];

    it('should find best matches above threshold', () => {
      const matches = matcher.findBestMatches('Patrick Mahomes', candidates, 0.7);
      
      expect(matches).toHaveLength(3);
      expect(matches[0].name).toBe('Patrick Mahomes');
      expect(matches[0].score).toBe(1.0);
      expect(matches[1].name).toBe('Pat Mahomes');
      expect(matches[2].name).toBe('Patrick Mahomes II');
    });

    it('should limit results to maxResults', () => {
      const matches = matcher.findBestMatches('Patrick', candidates, 0.5, 2);
      expect(matches).toHaveLength(2);
    });

    it('should return empty array for no matches above threshold', () => {
      const matches = matcher.findBestMatches('Tom Brady', candidates, 0.8);
      expect(matches).toHaveLength(0);
    });

    it('should handle empty candidates', () => {
      const matches = matcher.findBestMatches('Test', [], 0.5);
      expect(matches).toHaveLength(0);
    });
  });

  describe('extractNameVariations', () => {
    it('should extract name variations correctly', () => {
      const variations = matcher.extractNameVariations("D'Andre Swift");
      
      expect(variations.original).toBe("D'Andre Swift");
      expect(variations.normalized).toBe('dandre swift');
      expect(variations.tokens).toContain('dandre');
      expect(variations.tokens).toContain('swift');
      expect(variations.phonetic).toBeDefined();
    });

    it('should handle special characters', () => {
      const variations = matcher.extractNameVariations('T.J. Watt Jr.');
      
      expect(variations.normalized).toBe('tj watt jr');
      expect(variations.tokens).toHaveLength(3);
    });
  });

  describe('Jaro-Winkler algorithm', () => {
    it('should calculate Jaro-Winkler similarity correctly', () => {
      // Known test cases for Jaro-Winkler
      const score1 = matcher['jaroWinklerSimilarity']('MARTHA', 'MARHTA');
      expect(score1).toBeCloseTo(0.961, 2);

      const score2 = matcher['jaroWinklerSimilarity']('DIXON', 'DICKSONX');
      expect(score2).toBeCloseTo(0.813, 2);

      const score3 = matcher['jaroWinklerSimilarity']('JELLYFISH', 'SMELLYFISH');
      expect(score3).toBeCloseTo(0.896, 2);
    });

    it('should handle edge cases', () => {
      expect(matcher['jaroWinklerSimilarity']('', '')).toBe(1.0);
      expect(matcher['jaroWinklerSimilarity']('A', '')).toBe(0);
      expect(matcher['jaroWinklerSimilarity']('', 'B')).toBe(0);
      expect(matcher['jaroWinklerSimilarity']('ABC', 'XYZ')).toBe(0);
    });
  });

  describe('Token similarity', () => {
    it('should calculate token similarity correctly', () => {
      const score1 = matcher['tokenSimilarity']('Tom Brady', 'Brady Tom');
      expect(score1).toBe(1.0); // Same tokens, different order

      const score2 = matcher['tokenSimilarity']('Aaron Donald', 'Aaron Rodgers');
      expect(score2).toBeCloseTo(0.333, 2); // 1 common token out of 3 unique

      const score3 = matcher['tokenSimilarity']('Mike Evans Jr', 'Mike Evans');
      expect(score3).toBeCloseTo(0.667, 2); // 2 common tokens out of 3 unique
    });
  });

  describe('Phonetic similarity', () => {
    it('should match phonetically similar names', () => {
      const score1 = matcher['phoneticSimilarity']('Smith', 'Smyth');
      expect(score1).toBeGreaterThan(0.7);

      const score2 = matcher['phoneticSimilarity']('Johnson', 'Jonson');
      expect(score2).toBeGreaterThan(0.7);

      const score3 = matcher['phoneticSimilarity']('Catherine', 'Katherine');
      expect(score3).toBeGreaterThan(0.6);
    });

    it('should handle phonetic edge cases', () => {
      const score = matcher['phoneticSimilarity']('', 'Test');
      expect(score).toBe(0);
    });
  });

  describe('Real NFL player scenarios', () => {
    it('should handle common NFL player name variations', () => {
      const testCases = [
        { name1: 'Stefon Diggs', name2: 'S. Diggs', minScore: 0.7 },
        { name1: 'Calvin Ridley', name2: 'Calvin Ridley Jr', minScore: 0.85 },
        { name1: 'A.J. Brown', name2: 'AJ Brown', minScore: 0.9 },
        { name1: 'DK Metcalf', name2: 'D.K. Metcalf', minScore: 0.9 },
        { name1: 'Travis Etienne', name2: 'Travis Etienne Jr', minScore: 0.85 },
        { name1: 'Leonard Fournette', name2: 'L. Fournette', minScore: 0.7 },
        { name1: "Ja'Marr Chase", name2: 'JaMarr Chase', minScore: 0.85 },
        { name1: 'DeAndre Hopkins', name2: 'D. Hopkins', minScore: 0.65 },
      ];

      testCases.forEach(({ name1, name2, minScore }) => {
        const score = matcher.calculateSimilarity(name1, name2);
        expect(score).toBeGreaterThan(minScore);
      });
    });

    it('should not match different players with similar names', () => {
      const testCases = [
        { name1: 'Mike Williams', name2: 'Mike Evans', maxScore: 0.6 },
        { name1: 'Chris Jones', name2: 'Chris Johnson', maxScore: 0.7 },
        { name1: 'Allen Robinson', name2: 'Allen Lazard', maxScore: 0.5 },
        { name1: 'Brandon Allen', name2: 'Josh Allen', maxScore: 0.6 },
      ];

      testCases.forEach(({ name1, name2, maxScore }) => {
        const score = matcher.calculateSimilarity(name1, name2);
        expect(score).toBeLessThan(maxScore);
      });
    });
  });
});