import { prisma } from '@/lib/prisma';
import { FuzzyMatcher } from './fuzzy-matcher';
import { ConfidenceScorer } from './confidence-scorer';
import {
  IIdentityResolver,
  ResolveIdentityRequest,
  ResolveIdentityResponse,
  ResolutionOptions,
  MergeIdentityRequest,
  SplitIdentityRequest,
  IdentityMatchResult,
  MatchStatus,
  PlayerComparisonData,
  ConfidenceFactors,
  MappingMethod,
} from '@/types/identity';

/**
 * PlayerIdentityResolver class for resolving player identities across seasons
 * Matches players based on name, position, team, and statistical profiles
 */
export class PlayerIdentityResolver implements IIdentityResolver {
  private matcher: FuzzyMatcher;
  private scorer: ConfidenceScorer;
  
  constructor() {
    this.matcher = new FuzzyMatcher();
    this.scorer = new ConfidenceScorer();
  }
  
  /**
   * Resolve player identities across seasons for a league
   */
  async resolveIdentities(
    leagueId: string,
    options: ResolutionOptions = {}
  ): Promise<ResolveIdentityResponse> {
    const startTime = Date.now();
    const {
      seasons,
      minConfidence = 0.7,
      autoApprove = true,
      skipExisting = true,
      dryRun = false,
    } = options;
    
    try {
      // Get all players from specified seasons or all seasons
      const players = await this.getAllPlayers(leagueId, seasons);
      
      if (players.length === 0) {
        return {
          success: true,
          totalProcessed: 0,
          autoMatched: 0,
          manualReviewRequired: 0,
          errors: 0,
          matches: [],
          executionTime: Date.now() - startTime,
        };
      }
      
      // Skip players that already have identity mappings if requested
      const playersToProcess = skipExisting 
        ? await this.filterUnmappedPlayers(players)
        : players;
      
      // Group players by potential matches
      const identityGroups = await this.groupByIdentity(playersToProcess, minConfidence);
      
      // Process each group and create matches
      const matches: IdentityMatchResult[] = [];
      let autoMatched = 0;
      let manualReviewRequired = 0;
      
      for (const group of identityGroups.values()) {
        if (group.length < 2) continue;
        
        // Create pairwise matches within the group
        const groupMatches = await this.createGroupMatches(group, minConfidence);
        
        for (const match of groupMatches) {
          // Determine if match should be auto-approved
          if (autoApprove && match.confidence >= 0.85) {
            match.status = 'approved';
            autoMatched++;
            
            // Apply the match if not a dry run
            if (!dryRun) {
              await this.applyPlayerMatch(match);
            }
          } else {
            match.status = 'pending';
            manualReviewRequired++;
            
            // Store pending match for manual review
            if (!dryRun) {
              await this.storePendingMatch(match);
            }
          }
          
          matches.push(match);
        }
      }
      
      return {
        success: true,
        totalProcessed: playersToProcess.length,
        autoMatched,
        manualReviewRequired,
        errors: 0,
        matches,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Error resolving player identities:', error);
      return {
        success: false,
        totalProcessed: 0,
        autoMatched: 0,
        manualReviewRequired: 0,
        errors: 1,
        matches: [],
        executionTime: Date.now() - startTime,
      };
    }
  }
  
  /**
   * Get all players from specified seasons
   */
  private async getAllPlayers(leagueId: string, seasons?: number[]) {
    const whereClause: any = { leagueId };
    
    if (seasons && seasons.length > 0) {
      // Get players from historical data for specific seasons
      const historicalData = await prisma.leagueHistoricalData.findMany({
        where: {
          leagueId,
          season: { in: seasons },
          dataType: 'players',
        },
      });
      
      const allPlayers = [];
      for (const data of historicalData) {
        const players = data.data as any[];
        for (const player of players) {
          allPlayers.push({
            ...player,
            season: data.season,
            leagueId,
          });
        }
      }
      
      return allPlayers;
    }
    
    // Get all players from current season
    const currentPlayers = await prisma.leaguePlayer.findMany({
      where: whereClause,
    });
    
    // Get all historical players
    const historicalData = await prisma.leagueHistoricalData.findMany({
      where: {
        leagueId,
        dataType: 'players',
      },
    });
    
    const allPlayers = [...currentPlayers];
    for (const data of historicalData) {
      const players = data.data as any[];
      for (const player of players) {
        allPlayers.push({
          ...player,
          season: data.season,
          leagueId,
        });
      }
    }
    
    return allPlayers;
  }
  
  /**
   * Filter out players that already have identity mappings
   */
  private async filterUnmappedPlayers(players: any[]) {
    const existingMappings = await prisma.playerIdentityMapping.findMany({
      select: {
        espnPlayerId: true,
        season: true,
      },
    });
    
    const mappedKeys = new Set(
      existingMappings.map(m => `${m.espnPlayerId}_${m.season}`)
    );
    
    return players.filter(p => {
      const key = `${p.espnPlayerId}_${p.season || new Date().getFullYear()}`;
      return !mappedKeys.has(key);
    });
  }
  
  /**
   * Group players by potential identity matches
   */
  private async groupByIdentity(
    players: any[],
    minConfidence: number
  ): Promise<Map<string, any[]>> {
    const groups = new Map<string, any[]>();
    const processed = new Set<string>();
    
    for (const player of players) {
      const playerKey = this.getPlayerKey(player);
      
      if (processed.has(playerKey)) continue;
      
      // Find all potential matches for this player
      const matches = await this.findPotentialMatches(player, players, minConfidence);
      
      if (matches.length > 0) {
        // Create or add to group
        const groupKey = this.generateGroupKey(player);
        const group = groups.get(groupKey) || [];
        
        // Add player and all matches to group
        group.push(player);
        for (const match of matches) {
          const matchKey = this.getPlayerKey(match);
          if (!processed.has(matchKey)) {
            group.push(match);
            processed.add(matchKey);
          }
        }
        
        groups.set(groupKey, group);
      }
      
      processed.add(playerKey);
    }
    
    return groups;
  }
  
  /**
   * Find potential matches for a player
   */
  private async findPotentialMatches(
    target: any,
    candidates: any[],
    minConfidence: number
  ): Promise<any[]> {
    const matches = [];
    
    for (const candidate of candidates) {
      // Skip same player in same season
      if (this.isSamePlayerSeason(target, candidate)) {
        continue;
      }
      
      // Calculate similarity
      const similarity = await this.calculatePlayerSimilarity(target, candidate);
      
      if (similarity.confidence >= minConfidence) {
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
  private async calculatePlayerSimilarity(
    player1: any,
    player2: any
  ): Promise<{ confidence: number; reasons: string[] }> {
    const reasons: string[] = [];
    
    // Calculate individual factors
    const nameSimilarity = this.matcher.calculateSimilarity(
      player1.name || '',
      player2.name || ''
    );
    
    const positionMatch = this.scorer.calculatePositionCompatibility(
      player1.position || '',
      player2.position || ''
    );
    
    const teamContinuity = this.calculateTeamContinuity(player1, player2);
    
    const statSimilarity = this.scorer.calculateStatisticalSimilarity(
      this.extractStats(player1),
      this.extractStats(player2)
    );
    
    // Build confidence factors
    const factors: ConfidenceFactors = {
      nameSimilarity,
      positionMatch,
      teamContinuity,
      statSimilarity,
    };
    
    // Calculate overall confidence
    const confidence = this.scorer.calculateConfidence(factors);
    
    // Generate reasons
    if (nameSimilarity > 0.9) {
      reasons.push('Name match');
    } else if (nameSimilarity > 0.7) {
      reasons.push('Similar name');
    }
    
    if (positionMatch === 1.0) {
      reasons.push('Same position');
    } else if (positionMatch > 0.5) {
      reasons.push('Compatible positions');
    }
    
    if (teamContinuity > 0.5) {
      reasons.push('Team continuity');
    }
    
    if (statSimilarity > 0.8) {
      reasons.push('Similar statistics');
    }
    
    return { confidence, reasons };
  }
  
  /**
   * Create matches for a group of related players
   */
  private async createGroupMatches(
    group: any[],
    minConfidence: number
  ): Promise<IdentityMatchResult[]> {
    const matches: IdentityMatchResult[] = [];
    
    // Sort group by season to prioritize consecutive season matches
    group.sort((a, b) => (a.season || 2024) - (b.season || 2024));
    
    // Create pairwise matches
    for (let i = 0; i < group.length - 1; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const player1 = group[i];
        const player2 = group[j];
        
        // Skip if same season
        if ((player1.season || 2024) === (player2.season || 2024)) {
          continue;
        }
        
        const similarity = await this.calculatePlayerSimilarity(player1, player2);
        
        if (similarity.confidence >= minConfidence) {
          matches.push({
            id: `${player1.espnPlayerId}_${player2.espnPlayerId}_${Date.now()}`,
            player1: this.formatPlayerData(player1),
            player2: this.formatPlayerData(player2),
            confidence: similarity.confidence,
            method: similarity.confidence >= 0.9 ? 'AUTOMATIC' : 'FUZZY_MATCH',
            reasons: similarity.reasons,
            status: 'pending',
            createdAt: new Date(),
          });
        }
      }
    }
    
    return matches;
  }
  
  /**
   * Apply an approved player match
   */
  private async applyPlayerMatch(match: IdentityMatchResult): Promise<void> {
    // Check if master identity exists for either player
    let masterPlayerId: string | undefined;
    
    const existing1 = await prisma.playerIdentityMapping.findUnique({
      where: {
        espnPlayerId_season: {
          espnPlayerId: BigInt(match.player1.espnPlayerId),
          season: match.player1.season,
        },
      },
    });
    
    const existing2 = await prisma.playerIdentityMapping.findUnique({
      where: {
        espnPlayerId_season: {
          espnPlayerId: BigInt(match.player2.espnPlayerId),
          season: match.player2.season,
        },
      },
    });
    
    masterPlayerId = existing1?.masterPlayerId || existing2?.masterPlayerId;
    
    // Create new master identity if needed
    if (!masterPlayerId) {
      const identity = await prisma.playerIdentity.create({
        data: {
          masterPlayerId: `player_${match.player1.espnPlayerId}`,
          canonicalName: match.player1.name,
          confidenceScore: match.confidence,
          metadata: {
            positions: [match.player1.position, match.player2.position].filter(Boolean),
            teams: [match.player1.team, match.player2.team].filter(Boolean),
          },
        },
      });
      masterPlayerId = identity.masterPlayerId;
    }
    
    // Create mappings for both players
    const mappings = [
      {
        masterPlayerId,
        espnPlayerId: BigInt(match.player1.espnPlayerId),
        season: match.player1.season,
        nameVariation: match.player1.name,
        confidenceScore: match.confidence,
        mappingMethod: match.method as MappingMethod,
      },
      {
        masterPlayerId,
        espnPlayerId: BigInt(match.player2.espnPlayerId),
        season: match.player2.season,
        nameVariation: match.player2.name,
        confidenceScore: match.confidence,
        mappingMethod: match.method as MappingMethod,
      },
    ];
    
    // Insert mappings (skip if they already exist)
    for (const mapping of mappings) {
      await prisma.playerIdentityMapping.upsert({
        where: {
          espnPlayerId_season: {
            espnPlayerId: mapping.espnPlayerId,
            season: mapping.season,
          },
        },
        update: {
          confidenceScore: Math.max(mapping.confidenceScore, match.confidence),
        },
        create: mapping,
      });
    }
  }
  
  /**
   * Store a pending match for manual review
   */
  private async storePendingMatch(match: IdentityMatchResult): Promise<void> {
    // Store in a cache or database table for UI retrieval
    // For now, we'll store in Redis cache
    const redis = (await import('@/lib/redis')).redis;
    const key = `pending_match:${match.id}`;
    await redis.set(key, JSON.stringify(match), 'EX', 86400 * 7); // 7 days TTL
    
    // Add to league's pending matches set
    const leagueKey = `league_pending_matches:${match.player1.id.split('_')[0]}`;
    await redis.sadd(leagueKey, key);
  }
  
  /**
   * Merge two player identities
   */
  async mergeIdentities(request: MergeIdentityRequest): Promise<void> {
    const { primaryId, secondaryId, reason } = request;
    
    await prisma.$transaction(async (tx) => {
      // Get both identities
      const primary = await tx.playerIdentity.findUnique({
        where: { id: primaryId },
      });
      
      const secondary = await tx.playerIdentity.findUnique({
        where: { id: secondaryId },
      });
      
      if (!primary || !secondary) {
        throw new Error('One or both player identities not found');
      }
      
      // Update all mappings from secondary to primary
      await tx.playerIdentityMapping.updateMany({
        where: { masterPlayerId: secondary.masterPlayerId },
        data: { masterPlayerId: primary.masterPlayerId },
      });
      
      // Update primary identity metadata
      const metadata = primary.metadata as any || {};
      const secondaryMeta = secondary.metadata as any || {};
      
      await tx.playerIdentity.update({
        where: { id: primaryId },
        data: {
          metadata: {
            ...metadata,
            alternateNames: [
              ...(metadata.alternateNames || []),
              secondary.canonicalName,
              ...(secondaryMeta.alternateNames || []),
            ],
            positions: [
              ...new Set([
                ...(metadata.positions || []),
                ...(secondaryMeta.positions || []),
              ]),
            ],
            teams: [
              ...new Set([
                ...(metadata.teams || []),
                ...(secondaryMeta.teams || []),
              ]),
            ],
          },
        },
      });
      
      // Delete secondary identity
      await tx.playerIdentity.delete({
        where: { id: secondaryId },
      });
      
      // Log the merge in audit log
      await tx.identityAuditLog.create({
        data: {
          entityType: 'PLAYER',
          entityId: primaryId,
          action: 'MERGE',
          beforeState: { primary, secondary },
          afterState: { merged: primaryId },
          reason,
        },
      });
    });
  }
  
  /**
   * Split a player identity
   */
  async splitIdentity(request: SplitIdentityRequest): Promise<void> {
    const { identityId, mappingIds, reason } = request;
    
    await prisma.$transaction(async (tx) => {
      // Get the identity to split
      const identity = await tx.playerIdentity.findUnique({
        where: { id: identityId },
        include: { mappings: true },
      });
      
      if (!identity) {
        throw new Error('Player identity not found');
      }
      
      // Get mappings to split off
      const mappingsToSplit = identity.mappings.filter(m =>
        mappingIds.includes(m.id)
      );
      
      if (mappingsToSplit.length === 0) {
        throw new Error('No valid mappings to split');
      }
      
      // Create new identity for split mappings
      const newIdentity = await tx.playerIdentity.create({
        data: {
          masterPlayerId: `player_split_${Date.now()}`,
          canonicalName: mappingsToSplit[0].nameVariation,
          confidenceScore: 1.0,
          metadata: {},
        },
      });
      
      // Update mappings to point to new identity
      await tx.playerIdentityMapping.updateMany({
        where: { id: { in: mappingIds } },
        data: { masterPlayerId: newIdentity.masterPlayerId },
      });
      
      // Log the split in audit log
      await tx.identityAuditLog.create({
        data: {
          entityType: 'PLAYER',
          entityId: identityId,
          action: 'SPLIT',
          beforeState: { original: identity },
          afterState: { 
            original: identityId,
            split: newIdentity.id,
            mappingsSplit: mappingIds,
          },
          reason,
        },
      });
    });
  }
  
  /**
   * Get identity matches for a league
   */
  async getIdentityMatches(
    leagueId: string,
    status?: MatchStatus
  ): Promise<IdentityMatchResult[]> {
    // Retrieve from Redis cache
    const redis = (await import('@/lib/redis')).redis;
    const leagueKey = `league_pending_matches:${leagueId}`;
    const matchKeys = await redis.smembers(leagueKey);
    
    const matches: IdentityMatchResult[] = [];
    
    for (const key of matchKeys) {
      const matchData = await redis.get(key);
      if (matchData) {
        const match = JSON.parse(matchData) as IdentityMatchResult;
        
        if (!status || match.status === status) {
          matches.push(match);
        }
      }
    }
    
    return matches;
  }
  
  // Helper methods
  
  private getPlayerKey(player: any): string {
    return `${player.espnPlayerId}_${player.season || new Date().getFullYear()}`;
  }
  
  private generateGroupKey(player: any): string {
    return `group_${player.name?.toLowerCase().replace(/[^a-z]/g, '') || 'unknown'}`;
  }
  
  private isSamePlayerSeason(player1: any, player2: any): boolean {
    return player1.espnPlayerId === player2.espnPlayerId &&
           (player1.season || 2024) === (player2.season || 2024);
  }
  
  private calculateTeamContinuity(player1: any, player2: any): number {
    if (!player1.nflTeam || !player2.nflTeam) return 0;
    
    // Same team
    if (player1.nflTeam === player2.nflTeam) return 1.0;
    
    // Check if seasons are consecutive
    const season1 = player1.season || 2024;
    const season2 = player2.season || 2024;
    
    if (Math.abs(season1 - season2) === 1) {
      // Adjacent seasons, different teams = possible trade
      return 0.3;
    }
    
    return 0;
  }
  
  private extractStats(player: any) {
    const stats = player.stats || {};
    return {
      averagePoints: stats.averagePoints || 0,
      games: stats.gamesPlayed || 0,
      totalPoints: stats.totalPoints || 0,
    };
  }
  
  private formatPlayerData(player: any): PlayerComparisonData {
    return {
      id: player.id || `${player.espnPlayerId}_${player.season || 2024}`,
      espnPlayerId: Number(player.espnPlayerId),
      name: player.name || 'Unknown',
      season: player.season || new Date().getFullYear(),
      team: player.nflTeam || 'FA',
      position: player.position || 'Unknown',
      stats: {
        games: player.stats?.gamesPlayed || 0,
        points: player.stats?.totalPoints || 0,
        averagePoints: player.stats?.averagePoints || 0,
      },
    };
  }
}