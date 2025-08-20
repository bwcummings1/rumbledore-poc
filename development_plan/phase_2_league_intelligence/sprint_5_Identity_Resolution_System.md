# Sprint 5: Identity Resolution System

## Sprint Overview
**Phase**: 2 - League Intelligence & Analytics  
**Sprint**: 5 of 16 (First sprint of Phase 2)  
**Duration**: 2 weeks  
**Focus**: Build system to track player and team identities across seasons  
**Risk Level**: Medium (Complex matching algorithms, data quality critical)

## Objectives
1. Implement player identity resolution across seasons
2. Track team continuity through ownership changes
3. Build fuzzy matching algorithms for name variations
4. Create manual override interface for corrections
5. Develop confidence scoring system
6. Establish comprehensive audit trail

## Prerequisites
- Phase 1 completed (ESPN data foundation)
- Historical data imported (multiple seasons)
- Database populated with player/team data
- Admin authentication system ready

## Technical Tasks

### Task 1: Database Schema for Identity Mapping (Day 1-2)

#### 1.1 Identity Resolution Tables
```sql
-- migrations/add_Identity_Resolution_System.sql

-- Master player identity table
CREATE TABLE player_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    master_player_id UUID NOT NULL UNIQUE,
    canonical_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    confidence_score DECIMAL(3,2) DEFAULT 1.00,
    verified BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'
);

-- Player identity mappings
CREATE TABLE player_identity_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    master_player_id UUID REFERENCES player_identities(master_player_id),
    espn_player_id BIGINT NOT NULL,
    season INTEGER NOT NULL,
    name_variation VARCHAR(255) NOT NULL,
    confidence_score DECIMAL(3,2) NOT NULL,
    mapping_method VARCHAR(50) NOT NULL, -- 'automatic', 'manual', 'fuzzy_match'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(espn_player_id, season)
);

-- Team identity continuity
CREATE TABLE team_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    master_team_id UUID NOT NULL UNIQUE,
    league_id UUID REFERENCES leagues(id),
    canonical_name VARCHAR(255) NOT NULL,
    owner_history JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team identity mappings
CREATE TABLE team_identity_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    master_team_id UUID REFERENCES team_identities(master_team_id),
    espn_team_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    team_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255),
    confidence_score DECIMAL(3,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, espn_team_id, season)
);

-- Audit trail for all identity changes
CREATE TABLE identity_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- 'player' or 'team'
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'create', 'merge', 'split', 'update', 'delete'
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    performed_by UUID REFERENCES users(id),
    performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_player_mappings_master ON player_identity_mappings(master_player_id);
CREATE INDEX idx_player_mappings_espn ON player_identity_mappings(espn_player_id);
CREATE INDEX idx_team_mappings_master ON team_identity_mappings(master_team_id);
CREATE INDEX idx_team_mappings_league ON team_identity_mappings(league_id);
CREATE INDEX idx_audit_log_entity ON identity_audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user ON identity_audit_log(performed_by);
```

#### 1.2 TypeScript Types
```typescript
// types/identity.ts
export interface PlayerIdentity {
  id: string;
  masterPlayerId: string;
  canonicalName: string;
  confidenceScore: number;
  verified: boolean;
  metadata: {
    positions?: string[];
    teams?: string[];
    alternateNames?: string[];
  };
  mappings: PlayerMapping[];
}

export interface PlayerMapping {
  id: string;
  masterPlayerId: string;
  espnPlayerId: number;
  season: number;
  nameVariation: string;
  confidenceScore: number;
  mappingMethod: 'automatic' | 'manual' | 'fuzzy_match';
  createdBy?: string;
  createdAt: Date;
}

export interface TeamIdentity {
  id: string;
  masterTeamId: string;
  leagueId: string;
  canonicalName: string;
  ownerHistory: TeamOwner[];
  mappings: TeamMapping[];
}

export interface TeamOwner {
  name: string;
  startSeason: number;
  endSeason?: number;
  email?: string;
}

export interface IdentityMatch {
  sourceId: string | number;
  targetId: string;
  confidence: number;
  method: string;
  reasons: string[];
  suggestedAction: 'auto_merge' | 'manual_review' | 'skip';
}
```

### Task 2: Fuzzy Matching Algorithm (Day 3-4)

#### 2.1 Name Matching Service
```typescript
// lib/identity/fuzzy-matcher.ts
import { distance as levenshteinDistance } from 'fastest-levenshtein';
import * as natural from 'natural';

export class FuzzyMatcher {
  private tokenizer = new natural.WordTokenizer();
  private metaphone = natural.Metaphone;
  
  /**
   * Calculate similarity between two names
   */
  calculateSimilarity(name1: string, name2: string): number {
    // Normalize names
    const normalized1 = this.normalizeName(name1);
    const normalized2 = this.normalizeName(name2);
    
    // If exact match after normalization
    if (normalized1 === normalized2) {
      return 1.0;
    }
    
    // Calculate different similarity metrics
    const scores = [
      this.levenshteinSimilarity(normalized1, normalized2) * 0.3,
      this.jaroWinklerSimilarity(normalized1, normalized2) * 0.3,
      this.phoneticSimilarity(name1, name2) * 0.2,
      this.tokenSimilarity(name1, name2) * 0.2,
    ];
    
    return Math.min(scores.reduce((a, b) => a + b, 0), 1.0);
  }
  
  /**
   * Normalize name for comparison
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
  
  /**
   * Levenshtein distance similarity (0-1)
   */
  private levenshteinSimilarity(s1: string, s2: string): number {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    
    const distance = levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
  }
  
  /**
   * Jaro-Winkler similarity (0-1)
   */
  private jaroWinklerSimilarity(s1: string, s2: string): number {
    // Implementation of Jaro-Winkler algorithm
    const jaro = this.jaroSimilarity(s1, s2);
    
    // Calculate common prefix (up to 4 chars)
    let prefixLen = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
      if (s1[i] === s2[i]) {
        prefixLen++;
      } else {
        break;
      }
    }
    
    return jaro + (prefixLen * 0.1 * (1 - jaro));
  }
  
  /**
   * Base Jaro similarity
   */
  private jaroSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;
    
    const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
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
    
    return (matches / s1.length + 
            matches / s2.length + 
            (matches - transpositions / 2) / matches) / 3;
  }
  
  /**
   * Phonetic similarity using Metaphone
   */
  private phoneticSimilarity(name1: string, name2: string): number {
    const sound1 = this.metaphone.process(name1);
    const sound2 = this.metaphone.process(name2);
    
    if (sound1 === sound2) return 1.0;
    
    return this.levenshteinSimilarity(sound1, sound2) * 0.8;
  }
  
  /**
   * Token-based similarity (for multi-word names)
   */
  private tokenSimilarity(name1: string, name2: string): number {
    const tokens1 = new Set(this.tokenizer.tokenize(name1.toLowerCase()));
    const tokens2 = new Set(this.tokenizer.tokenize(name2.toLowerCase()));
    
    if (tokens1.size === 0 || tokens2.size === 0) return 0.0;
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Find best matches for a name
   */
  findBestMatches(
    targetName: string,
    candidates: string[],
    threshold: number = 0.7,
    maxResults: number = 5
  ): Array<{ name: string; score: number }> {
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
}

// lib/identity/player-resolver.ts
export class PlayerIdentityResolver {
  private matcher: FuzzyMatcher;
  
  constructor() {
    this.matcher = new FuzzyMatcher();
  }
  
  /**
   * Resolve player identities across seasons
   */
  async resolvePlayerIdentities(leagueId: string): Promise<void> {
    // Get all unique players across seasons
    const allPlayers = await this.getAllPlayers(leagueId);
    
    // Group by potential matches
    const identityGroups = await this.groupByIdentity(allPlayers);
    
    // Process each group
    for (const group of identityGroups) {
      await this.processIdentityGroup(group);
    }
  }
  
  /**
   * Group players by potential identity matches
   */
  private async groupByIdentity(
    players: any[]
  ): Promise<Map<string, any[]>> {
    const groups = new Map<string, any[]>();
    const processed = new Set<string>();
    
    for (const player of players) {
      const key = `${player.espnPlayerId}_${player.season}`;
      if (processed.has(key)) continue;
      
      // Find all potential matches
      const matches = this.findPotentialMatches(player, players);
      
      if (matches.length > 0) {
        const groupKey = this.generateGroupKey(player, matches);
        const group = groups.get(groupKey) || [];
        group.push(player, ...matches);
        groups.set(groupKey, group);
        
        // Mark all as processed
        matches.forEach(m => {
          processed.add(`${m.espnPlayerId}_${m.season}`);
        });
      }
      
      processed.add(key);
    }
    
    return groups;
  }
  
  /**
   * Find potential matches for a player
   */
  private findPotentialMatches(
    target: any,
    candidates: any[]
  ): any[] {
    const matches = [];
    
    for (const candidate of candidates) {
      // Skip same player in same season
      if (target.espnPlayerId === candidate.espnPlayerId && 
          target.season === candidate.season) {
        continue;
      }
      
      // Calculate similarity
      const similarity = this.calculatePlayerSimilarity(target, candidate);
      
      if (similarity.confidence >= 0.7) {
        matches.push({
          ...candidate,
          matchConfidence: similarity.confidence,
          matchReasons: similarity.reasons,
        });
      }
    }
    
    return matches;
  }
  
  /**
   * Calculate similarity between two players
   */
  private calculatePlayerSimilarity(
    player1: any,
    player2: any
  ): { confidence: number; reasons: string[] } {
    const reasons = [];
    let score = 0;
    
    // Name similarity (40% weight)
    const nameSimilarity = this.matcher.calculateSimilarity(
      player1.name,
      player2.name
    );
    score += nameSimilarity * 0.4;
    
    if (nameSimilarity > 0.9) {
      reasons.push('Name match');
    } else if (nameSimilarity > 0.7) {
      reasons.push('Similar name');
    }
    
    // Position match (20% weight)
    if (player1.position === player2.position) {
      score += 0.2;
      reasons.push('Same position');
    } else if (this.arePositionsCompatible(player1.position, player2.position)) {
      score += 0.1;
      reasons.push('Compatible positions');
    }
    
    // Team continuity (20% weight)
    if (this.hasTeamContinuity(player1, player2)) {
      score += 0.2;
      reasons.push('Team continuity');
    }
    
    // Statistical similarity (20% weight)
    const statSimilarity = this.calculateStatSimilarity(player1, player2);
    score += statSimilarity * 0.2;
    
    if (statSimilarity > 0.8) {
      reasons.push('Similar statistics');
    }
    
    return {
      confidence: Math.min(score, 1.0),
      reasons,
    };
  }
  
  private arePositionsCompatible(pos1: string, pos2: string): boolean {
    const compatiblePositions = {
      'RB': ['RB', 'FLEX'],
      'WR': ['WR', 'FLEX'],
      'TE': ['TE', 'FLEX'],
      'FLEX': ['RB', 'WR', 'TE', 'FLEX'],
    };
    
    return compatiblePositions[pos1]?.includes(pos2) || false;
  }
  
  private hasTeamContinuity(player1: any, player2: any): boolean {
    // Check if players were on same NFL team in consecutive seasons
    return player1.nflTeam === player2.nflTeam && 
           Math.abs(player1.season - player2.season) === 1;
  }
  
  private calculateStatSimilarity(player1: any, player2: any): number {
    if (!player1.stats || !player2.stats) return 0;
    
    // Compare average points per game
    const avg1 = player1.stats.averagePoints || 0;
    const avg2 = player2.stats.averagePoints || 0;
    
    if (avg1 === 0 || avg2 === 0) return 0;
    
    const diff = Math.abs(avg1 - avg2);
    const avg = (avg1 + avg2) / 2;
    
    // If difference is less than 20% of average, consider similar
    return Math.max(0, 1 - (diff / avg));
  }
}
```

### Task 3: Manual Override Interface (Day 5-6)

#### 3.1 Admin UI Components
```tsx
// components/admin/identity-resolution.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, Merge, Split, Check, X, AlertCircle } from 'lucide-react';

interface IdentityMatch {
  id: string;
  player1: {
    id: string;
    name: string;
    season: number;
    team: string;
    position: string;
    stats: {
      games: number;
      points: number;
    };
  };
  player2: {
    id: string;
    name: string;
    season: number;
    team: string;
    position: string;
    stats: {
      games: number;
      points: number;
    };
  };
  confidence: number;
  method: string;
  reasons: string[];
  status: 'pending' | 'approved' | 'rejected';
}

export function IdentityResolutionManager({ leagueId }: { leagueId: string }) {
  const [matches, setMatches] = useState<IdentityMatch[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<IdentityMatch | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMatches();
  }, [leagueId, filter]);

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/leagues/${leagueId}/identity/matches?status=${filter}`);
      const data = await response.json();
      setMatches(data);
    } catch (error) {
      console.error('Failed to fetch matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (matchId: string) => {
    try {
      await fetch(`/api/leagues/${leagueId}/identity/matches/${matchId}/approve`, {
        method: 'POST',
      });
      fetchMatches();
    } catch (error) {
      console.error('Failed to approve match:', error);
    }
  };

  const handleReject = async (matchId: string) => {
    try {
      await fetch(`/api/leagues/${leagueId}/identity/matches/${matchId}/reject`, {
        method: 'POST',
      });
      fetchMatches();
    } catch (error) {
      console.error('Failed to reject match:', error);
    }
  };

  const handleMerge = async (player1Id: string, player2Id: string) => {
    try {
      await fetch(`/api/leagues/${leagueId}/identity/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player1Id, player2Id }),
      });
      fetchMatches();
    } catch (error) {
      console.error('Failed to merge players:', error);
    }
  };

  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-500';
    if (confidence >= 0.7) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const filteredMatches = matches.filter(match => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        match.player1.name.toLowerCase().includes(term) ||
        match.player2.name.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Player Identity Resolution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Button onClick={fetchMatches} variant="outline">
              Refresh
            </Button>
            <Button onClick={() => runAutoMatch()}>
              Run Auto-Match
            </Button>
          </div>

          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({matches.filter(m => m.status === 'pending').length})
              </TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>

            <TabsContent value={filter} className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player 1</TableHead>
                    <TableHead>Player 2</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reasons</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMatches.map((match) => (
                    <TableRow key={match.id}>
                      <TableCell>
                        <div>
                          <p className="font-semibold">{match.player1.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {match.player1.season} • {match.player1.position} • {match.player1.team}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {match.player1.stats.games}G, {match.player1.stats.points.toFixed(1)}pts
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold">{match.player2.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {match.player2.season} • {match.player2.position} • {match.player2.team}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {match.player2.stats.games}G, {match.player2.stats.points.toFixed(1)}pts
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={getConfidenceBadgeColor(match.confidence)}
                        >
                          {(match.confidence * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{match.method}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {match.reasons.map((reason, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {reason}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {match.status === 'pending' ? (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleApprove(match.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleReject(match.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedMatch(match)}
                            >
                              <Merge className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Badge variant={match.status === 'approved' ? 'default' : 'destructive'}>
                            {match.status}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Merge Dialog */}
      {selectedMatch && (
        <AlertDialog open={!!selectedMatch} onOpenChange={() => setSelectedMatch(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Player Merge</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to merge these players? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-4 space-y-4">
              <div className="p-4 border rounded">
                <p className="font-semibold">{selectedMatch.player1.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedMatch.player1.season} • {selectedMatch.player1.position}
                </p>
              </div>
              <div className="flex justify-center">
                <Merge className="h-6 w-6" />
              </div>
              <div className="p-4 border rounded">
                <p className="font-semibold">{selectedMatch.player2.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedMatch.player2.season} • {selectedMatch.player2.position}
                </p>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  handleMerge(selectedMatch.player1.id, selectedMatch.player2.id);
                  setSelectedMatch(null);
                }}
              >
                Merge Players
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
```

### Task 4: Confidence Scoring System (Day 7-8)

#### 4.1 Confidence Calculator
```typescript
// lib/identity/confidence-scorer.ts
export class ConfidenceScorer {
  /**
   * Calculate overall confidence score for identity match
   */
  calculateConfidence(factors: ConfidenceFactors): number {
    const weights = {
      nameSimilarity: 0.35,
      positionMatch: 0.15,
      teamContinuity: 0.15,
      statSimilarity: 0.20,
      draftPosition: 0.10,
      ownership: 0.05,
    };
    
    let score = 0;
    let totalWeight = 0;
    
    for (const [factor, weight] of Object.entries(weights)) {
      if (factors[factor] !== undefined) {
        score += factors[factor] * weight;
        totalWeight += weight;
      }
    }
    
    // Normalize if not all factors present
    return totalWeight > 0 ? score / totalWeight : 0;
  }
  
  /**
   * Determine action based on confidence
   */
  determineAction(confidence: number): string {
    if (confidence >= 0.95) return 'auto_approve_high';
    if (confidence >= 0.85) return 'auto_approve';
    if (confidence >= 0.70) return 'manual_review';
    if (confidence >= 0.50) return 'manual_review_low';
    return 'skip';
  }
  
  /**
   * Generate explanation for confidence score
   */
  explainConfidence(
    factors: ConfidenceFactors,
    score: number
  ): ConfidenceExplanation {
    const strengths = [];
    const weaknesses = [];
    const suggestions = [];
    
    // Analyze name similarity
    if (factors.nameSimilarity >= 0.9) {
      strengths.push('Names are nearly identical');
    } else if (factors.nameSimilarity >= 0.7) {
      strengths.push('Names are similar');
    } else if (factors.nameSimilarity < 0.5) {
      weaknesses.push('Names are quite different');
      suggestions.push('Verify this is the same player despite name difference');
    }
    
    // Analyze position
    if (factors.positionMatch === 1.0) {
      strengths.push('Same position');
    } else if (factors.positionMatch === 0) {
      weaknesses.push('Different positions');
      suggestions.push('Check if player changed positions');
    }
    
    // Analyze team continuity
    if (factors.teamContinuity >= 0.8) {
      strengths.push('Strong team continuity');
    } else if (factors.teamContinuity < 0.3) {
      weaknesses.push('No team continuity');
    }
    
    // Analyze statistics
    if (factors.statSimilarity >= 0.8) {
      strengths.push('Very similar performance statistics');
    } else if (factors.statSimilarity < 0.4) {
      weaknesses.push('Different statistical profiles');
      suggestions.push('Review if player had injury or role change');
    }
    
    return {
      score,
      level: this.getConfidenceLevel(score),
      strengths,
      weaknesses,
      suggestions,
      action: this.determineAction(score),
    };
  }
  
  private getConfidenceLevel(score: number): string {
    if (score >= 0.9) return 'Very High';
    if (score >= 0.75) return 'High';
    if (score >= 0.6) return 'Medium';
    if (score >= 0.4) return 'Low';
    return 'Very Low';
  }
}

interface ConfidenceFactors {
  nameSimilarity: number;
  positionMatch: number;
  teamContinuity: number;
  statSimilarity: number;
  draftPosition?: number;
  ownership?: number;
}

interface ConfidenceExplanation {
  score: number;
  level: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  action: string;
}
```

### Task 5: Audit Trail System (Day 9-10)

#### 5.1 Audit Logger
```typescript
// lib/identity/audit-logger.ts
export class IdentityAuditLogger {
  /**
   * Log identity resolution action
   */
  async logAction(
    action: AuditAction,
    userId: string
  ): Promise<void> {
    await prisma.identityAuditLog.create({
      data: {
        entityType: action.entityType,
        entityId: action.entityId,
        action: action.type,
        beforeState: action.beforeState,
        afterState: action.afterState,
        reason: action.reason,
        performedBy: userId,
        metadata: {
          confidence: action.confidence,
          method: action.method,
          timestamp: new Date().toISOString(),
        },
      },
    });
    
    // Emit event for real-time monitoring
    this.emitAuditEvent(action);
  }
  
  /**
   * Get audit trail for entity
   */
  async getAuditTrail(
    entityType: 'player' | 'team',
    entityId: string
  ): Promise<AuditEntry[]> {
    const logs = await prisma.identityAuditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      include: {
        performedBy: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
      orderBy: {
        performedAt: 'desc',
      },
    });
    
    return logs.map(this.formatAuditEntry);
  }
  
  /**
   * Rollback identity change
   */
  async rollbackChange(auditLogId: string): Promise<void> {
    const log = await prisma.identityAuditLog.findUnique({
      where: { id: auditLogId },
    });
    
    if (!log) {
      throw new Error('Audit log entry not found');
    }
    
    // Restore previous state
    if (log.entityType === 'player') {
      await this.rollbackPlayerChange(log);
    } else {
      await this.rollbackTeamChange(log);
    }
    
    // Log the rollback
    await this.logAction({
      entityType: log.entityType,
      entityId: log.entityId,
      type: 'rollback',
      beforeState: log.afterState,
      afterState: log.beforeState,
      reason: `Rollback of action ${log.id}`,
    });
  }
}

interface AuditAction {
  entityType: 'player' | 'team';
  entityId: string;
  type: 'create' | 'merge' | 'split' | 'update' | 'delete' | 'rollback';
  beforeState?: any;
  afterState?: any;
  reason?: string;
  confidence?: number;
  method?: string;
}
```

### Task 6: Integration & Testing (Day 11-12)

#### 6.1 API Endpoints
```typescript
// app/api/leagues/[leagueId]/identity/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PlayerIdentityResolver } from '@/lib/identity/player-resolver';
import { IdentityAuditLogger } from '@/lib/identity/audit-logger';

export async function POST(
  request: NextRequest,
  { params }: { params: { leagueId: string } }
) {
  const { action } = await request.json();
  
  switch (action) {
    case 'resolve':
      return handleResolve(params.leagueId);
    case 'merge':
      return handleMerge(request, params.leagueId);
    case 'split':
      return handleSplit(request, params.leagueId);
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

async function handleResolve(leagueId: string) {
  const resolver = new PlayerIdentityResolver();
  
  try {
    await resolver.resolvePlayerIdentities(leagueId);
    
    return NextResponse.json({
      success: true,
      message: 'Identity resolution completed',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Resolution failed', details: error.message },
      { status: 500 }
    );
  }
}

async function handleMerge(request: NextRequest, leagueId: string) {
  const { player1Id, player2Id, reason } = await request.json();
  const userId = await getUserId(request);
  
  const logger = new IdentityAuditLogger();
  
  try {
    // Get current states
    const player1 = await prisma.playerIdentity.findUnique({
      where: { id: player1Id },
    });
    const player2 = await prisma.playerIdentity.findUnique({
      where: { id: player2Id },
    });
    
    // Perform merge
    const merged = await prisma.$transaction(async (tx) => {
      // Update all mappings to point to player1
      await tx.playerIdentityMapping.updateMany({
        where: { masterPlayerId: player2Id },
        data: { masterPlayerId: player1Id },
      });
      
      // Delete player2 identity
      await tx.playerIdentity.delete({
        where: { id: player2Id },
      });
      
      return player1;
    });
    
    // Log the action
    await logger.logAction({
      entityType: 'player',
      entityId: player1Id,
      type: 'merge',
      beforeState: { player1, player2 },
      afterState: merged,
      reason,
    }, userId);
    
    return NextResponse.json({
      success: true,
      mergedPlayer: merged,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Merge failed', details: error.message },
      { status: 500 }
    );
  }
}
```

## Validation Criteria

### Functionality Checklist
- [ ] Player identity resolution working across seasons
- [ ] Team continuity tracked correctly
- [ ] Fuzzy matching algorithm accurate
- [ ] Manual override interface functional
- [ ] Confidence scoring appropriate
- [ ] Audit trail complete and searchable

### Performance Checklist
- [ ] Identity resolution < 5 seconds per season
- [ ] Fuzzy matching < 100ms per comparison
- [ ] Admin UI responsive < 2 seconds
- [ ] Audit queries < 500ms

### Quality Checklist
- [ ] > 95% accuracy in automatic matching
- [ ] All manual overrides logged
- [ ] Rollback capability tested
- [ ] No data corruption during merges

## Testing Instructions

### Unit Tests
```typescript
describe('FuzzyMatcher', () => {
  it('should match similar names', () => {
    const matcher = new FuzzyMatcher();
    const score = matcher.calculateSimilarity('Patrick Mahomes', 'Pat Mahomes');
    expect(score).toBeGreaterThan(0.8);
  });
  
  it('should handle name variations', () => {
    const matcher = new FuzzyMatcher();
    const score = matcher.calculateSimilarity('TJ Watt', 'T.J. Watt');
    expect(score).toBeGreaterThan(0.9);
  });
});
```

### Manual Testing
1. Import multiple seasons of data
2. Run automatic identity resolution
3. Review matches in admin UI
4. Test manual merge/split operations
5. Verify audit trail
6. Test rollback functionality

## Deliverables

### Code Deliverables
- ✅ Database schema for identity mapping
- ✅ Fuzzy matching algorithm
- ✅ Confidence scoring system
- ✅ Manual override UI
- ✅ Audit trail system
- ✅ API endpoints

### Documentation Deliverables
- ✅ Algorithm documentation
- ✅ Admin UI guide
- ✅ API documentation
- ✅ Troubleshooting guide

## Success Metrics
- Identity resolution accuracy: > 95%
- Manual intervention rate: < 5%
- Processing speed: < 5 seconds/season
- User satisfaction: > 4.5/5

---

*Sprint 5 establishes the critical identity resolution system that ensures data consistency across seasons.*