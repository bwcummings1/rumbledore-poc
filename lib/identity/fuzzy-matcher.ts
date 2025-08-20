import { distance as levenshteinDistance } from 'fastest-levenshtein';
import * as natural from 'natural';
import { IFuzzyMatcher, NameVariation } from '@/types/identity';

/**
 * FuzzyMatcher class for calculating name similarity using multiple algorithms
 * Combines Levenshtein, Jaro-Winkler, phonetic, and token-based matching
 */
export class FuzzyMatcher implements IFuzzyMatcher {
  private tokenizer: natural.WordTokenizer;
  private metaphone: typeof natural.Metaphone;
  
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.metaphone = natural.Metaphone;
  }
  
  /**
   * Calculate overall similarity between two names using multiple algorithms
   * @param name1 - First name to compare
   * @param name2 - Second name to compare
   * @returns Similarity score between 0 and 1
   */
  calculateSimilarity(name1: string, name2: string): number {
    // Handle null/undefined cases
    if (!name1 || !name2) return 0;
    
    // Normalize names for comparison
    const normalized1 = this.normalizeName(name1);
    const normalized2 = this.normalizeName(name2);
    
    // If exact match after normalization
    if (normalized1 === normalized2) {
      return 1.0;
    }
    
    // Calculate different similarity metrics with weights
    const scores = [
      this.levenshteinSimilarity(normalized1, normalized2) * 0.3,
      this.jaroWinklerSimilarity(normalized1, normalized2) * 0.3,
      this.phoneticSimilarity(name1, name2) * 0.2,
      this.tokenSimilarity(name1, name2) * 0.2,
    ];
    
    // Sum weighted scores and ensure result is between 0 and 1
    const totalScore = scores.reduce((a, b) => a + b, 0);
    return Math.min(Math.max(totalScore, 0), 1);
  }
  
  /**
   * Normalize name for comparison
   * Removes special characters, converts to lowercase, normalizes whitespace
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/['']/g, '') // Remove apostrophes
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters except spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
  
  /**
   * Calculate Levenshtein distance similarity (0-1)
   * Measures the minimum number of single-character edits required
   */
  private levenshteinSimilarity(s1: string, s2: string): number {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    
    const distance = levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
  }
  
  /**
   * Calculate Jaro-Winkler similarity (0-1)
   * Gives more weight to strings with common prefixes
   */
  private jaroWinklerSimilarity(s1: string, s2: string): number {
    const jaro = this.jaroSimilarity(s1, s2);
    
    // Calculate common prefix length (up to 4 chars)
    let prefixLen = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
      if (s1[i] === s2[i]) {
        prefixLen++;
      } else {
        break;
      }
    }
    
    // Jaro-Winkler formula: jaro + (prefix * p * (1 - jaro))
    // where p is scaling factor (typically 0.1)
    return jaro + (prefixLen * 0.1 * (1 - jaro));
  }
  
  /**
   * Calculate base Jaro similarity
   * Considers matching characters and transpositions
   */
  private jaroSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;
    
    // Maximum allowed distance for matching characters
    const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matching characters
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, s2.length);
      
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0.0;
    
    // Count transpositions
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    
    // Jaro formula
    return (
      matches / s1.length + 
      matches / s2.length + 
      (matches - transpositions / 2) / matches
    ) / 3;
  }
  
  /**
   * Calculate phonetic similarity using Metaphone algorithm
   * Compares how names sound when spoken
   */
  private phoneticSimilarity(name1: string, name2: string): number {
    try {
      const sound1 = this.metaphone.process(name1);
      const sound2 = this.metaphone.process(name2);
      
      if (sound1 === sound2) return 1.0;
      
      // Apply Levenshtein to phonetic representations
      return this.levenshteinSimilarity(sound1, sound2) * 0.8;
    } catch {
      // Fallback if phonetic processing fails
      return 0;
    }
  }
  
  /**
   * Token-based similarity for multi-word names
   * Compares individual words/tokens
   */
  private tokenSimilarity(name1: string, name2: string): number {
    const tokens1 = new Set(this.tokenizer.tokenize(name1.toLowerCase()));
    const tokens2 = new Set(this.tokenizer.tokenize(name2.toLowerCase()));
    
    if (tokens1.size === 0 || tokens2.size === 0) return 0.0;
    
    // Calculate Jaccard similarity (intersection over union)
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Find best matches for a name from a list of candidates
   * @param targetName - Name to match against
   * @param candidates - List of candidate names
   * @param threshold - Minimum similarity score (default: 0.7)
   * @param maxResults - Maximum number of results to return (default: 5)
   */
  findBestMatches(
    targetName: string,
    candidates: string[],
    threshold: number = 0.7,
    maxResults: number = 5
  ): Array<{ name: string; score: number }> {
    if (!targetName || !candidates || candidates.length === 0) {
      return [];
    }
    
    const matches = candidates
      .map(candidate => ({
        name: candidate,
        score: this.calculateSimilarity(targetName, candidate),
      }))
      .filter(match => match.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
    
    return matches;
  }
  
  /**
   * Check if two names are likely the same person
   * Handles common variations like Bob/Robert, Bill/William, etc.
   */
  areNamesEquivalent(name1: string, name2: string): boolean {
    const commonNicknames: Record<string, string[]> = {
      'robert': ['bob', 'rob', 'bobby', 'robbie'],
      'william': ['bill', 'will', 'billy', 'willie'],
      'richard': ['dick', 'rick', 'ricky', 'richie'],
      'michael': ['mike', 'mikey', 'mick'],
      'james': ['jim', 'jimmy', 'jamie'],
      'jonathan': ['jon', 'john', 'johnny'],
      'joseph': ['joe', 'joey'],
      'daniel': ['dan', 'danny'],
      'thomas': ['tom', 'tommy'],
      'charles': ['charlie', 'chuck', 'chas'],
      'christopher': ['chris', 'kit'],
      'alexander': ['alex', 'al'],
      'benjamin': ['ben', 'benny', 'benji'],
      'nicholas': ['nick', 'nicky'],
      'matthew': ['matt', 'matty'],
      'anthony': ['tony', 'ant'],
      'patrick': ['pat', 'paddy'],
      'edward': ['ed', 'eddie', 'ted'],
      'andrew': ['andy', 'drew'],
      'david': ['dave', 'davey'],
    };
    
    const normalized1 = this.normalizeName(name1);
    const normalized2 = this.normalizeName(name2);
    
    // Check if they're exactly the same
    if (normalized1 === normalized2) return true;
    
    // Check nickname relationships
    for (const [fullName, nicknames] of Object.entries(commonNicknames)) {
      const names = [fullName, ...nicknames];
      if (names.includes(normalized1) && names.includes(normalized2)) {
        return true;
      }
    }
    
    // Check if one name contains the other (e.g., "TJ" and "TJ Watt")
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }
    
    // Check for initials (e.g., "T.J." and "TJ")
    const initials1 = normalized1.replace(/[^a-z]/g, '');
    const initials2 = normalized2.replace(/[^a-z]/g, '');
    if (initials1.length <= 3 && initials1 === initials2) {
      return true;
    }
    
    // High similarity threshold for equivalence
    return this.calculateSimilarity(name1, name2) >= 0.9;
  }
  
  /**
   * Extract name variations for indexing and searching
   */
  extractNameVariations(name: string): NameVariation {
    const normalized = this.normalizeName(name);
    const tokens = this.tokenizer.tokenize(normalized);
    
    let phonetic: string | undefined;
    try {
      phonetic = this.metaphone.process(name);
    } catch {
      // Ignore phonetic errors
    }
    
    return {
      original: name,
      normalized,
      tokens,
      phonetic,
    };
  }
  
  /**
   * Special handling for NFL player names with suffixes
   */
  handleNFLPlayerName(name: string): string {
    // Remove common suffixes
    const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', 'v'];
    let cleanName = name.toLowerCase();
    
    for (const suffix of suffixes) {
      const patterns = [
        new RegExp(`\\s+${suffix}\\.?$`, 'i'),
        new RegExp(`\\s+${suffix}\\.?\\s+`, 'i'),
      ];
      
      for (const pattern of patterns) {
        cleanName = cleanName.replace(pattern, ' ');
      }
    }
    
    return cleanName.trim();
  }
}