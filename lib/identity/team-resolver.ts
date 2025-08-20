import { prisma } from '@/lib/prisma';
import { FuzzyMatcher } from './fuzzy-matcher';
import {
  TeamIdentity,
  TeamMapping,
  TeamOwner,
} from '@/types/identity';

/**
 * TeamIdentityResolver class for tracking team continuity across seasons
 * Handles ownership changes, team name changes, and maintains team history
 */
export class TeamIdentityResolver {
  private matcher: FuzzyMatcher;
  
  constructor() {
    this.matcher = new FuzzyMatcher();
  }
  
  /**
   * Resolve team identities across seasons for a league
   */
  async resolveTeamIdentities(
    leagueId: string,
    options: {
      seasons?: number[];
      autoResolve?: boolean;
    } = {}
  ): Promise<{ resolved: number; errors: number }> {
    const { seasons, autoResolve = true } = options;
    
    try {
      // Get all teams from specified seasons or all seasons
      const teams = await this.getAllTeams(leagueId, seasons);
      
      if (teams.length === 0) {
        return { resolved: 0, errors: 0 };
      }
      
      // Group teams by ESPN team ID (teams usually keep the same ID)
      const teamGroups = this.groupByEspnId(teams);
      
      let resolved = 0;
      
      for (const [espnTeamId, teamSeasons] of teamGroups.entries()) {
        // Check if master identity exists
        let teamIdentity = await this.findExistingIdentity(leagueId, espnTeamId);
        
        if (!teamIdentity) {
          // Create new master identity
          teamIdentity = await this.createTeamIdentity(leagueId, teamSeasons[0]);
        }
        
        // Create mappings for all seasons
        for (const team of teamSeasons) {
          await this.createTeamMapping(teamIdentity, team, autoResolve);
          resolved++;
        }
        
        // Update owner history
        await this.updateOwnerHistory(teamIdentity.id, teamSeasons);
      }
      
      // Handle teams that might have changed IDs (name/owner matching)
      if (autoResolve) {
        await this.resolveChangedTeamIds(leagueId, teamGroups);
      }
      
      return { resolved, errors: 0 };
    } catch (error) {
      console.error('Error resolving team identities:', error);
      return { resolved: 0, errors: 1 };
    }
  }
  
  /**
   * Get all teams from specified seasons
   */
  private async getAllTeams(leagueId: string, seasons?: number[]) {
    const teams = [];
    
    // Get current season teams
    const currentTeams = await prisma.leagueTeam.findMany({
      where: { leagueId },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });
    
    for (const team of currentTeams) {
      teams.push({
        leagueId,
        espnTeamId: team.espnTeamId,
        season: new Date().getFullYear(),
        teamName: team.name,
        ownerName: team.members[0]?.user?.displayName || team.members[0]?.user?.username,
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        standing: team.standing,
      });
    }
    
    // Get historical teams
    const whereClause: any = { leagueId, dataType: 'teams' };
    if (seasons && seasons.length > 0) {
      whereClause.season = { in: seasons };
    }
    
    const historicalData = await prisma.leagueHistoricalData.findMany({
      where: whereClause,
    });
    
    for (const data of historicalData) {
      const historicalTeams = data.data as any[];
      for (const team of historicalTeams) {
        teams.push({
          ...team,
          season: data.season,
          leagueId,
        });
      }
    }
    
    return teams;
  }
  
  /**
   * Group teams by ESPN team ID
   */
  private groupByEspnId(teams: any[]): Map<number, any[]> {
    const groups = new Map<number, any[]>();
    
    for (const team of teams) {
      const espnId = team.espnTeamId;
      const group = groups.get(espnId) || [];
      group.push(team);
      groups.set(espnId, group);
    }
    
    // Sort each group by season
    for (const group of groups.values()) {
      group.sort((a, b) => (a.season || 2024) - (b.season || 2024));
    }
    
    return groups;
  }
  
  /**
   * Find existing team identity
   */
  private async findExistingIdentity(
    leagueId: string,
    espnTeamId: number
  ): Promise<TeamIdentity | null> {
    const mapping = await prisma.teamIdentityMapping.findFirst({
      where: {
        leagueId,
        espnTeamId,
      },
      include: {
        teamIdentity: true,
      },
    });
    
    return mapping?.teamIdentity as TeamIdentity | null;
  }
  
  /**
   * Create new team identity
   */
  private async createTeamIdentity(
    leagueId: string,
    team: any
  ): Promise<TeamIdentity> {
    const identity = await prisma.teamIdentity.create({
      data: {
        masterTeamId: `team_${leagueId}_${team.espnTeamId}`,
        leagueId,
        canonicalName: team.teamName || `Team ${team.espnTeamId}`,
        ownerHistory: [],
      },
    });
    
    return identity as TeamIdentity;
  }
  
  /**
   * Create team mapping for a season
   */
  private async createTeamMapping(
    identity: TeamIdentity,
    team: any,
    autoResolve: boolean
  ): Promise<void> {
    const confidence = autoResolve ? 1.0 : 0.8;
    
    await prisma.teamIdentityMapping.upsert({
      where: {
        leagueId_espnTeamId_season: {
          leagueId: team.leagueId,
          espnTeamId: team.espnTeamId,
          season: team.season || new Date().getFullYear(),
        },
      },
      update: {
        teamName: team.teamName,
        ownerName: team.ownerName,
        confidenceScore: Math.max(confidence, 0.8),
      },
      create: {
        masterTeamId: identity.masterTeamId,
        leagueId: team.leagueId,
        espnTeamId: team.espnTeamId,
        season: team.season || new Date().getFullYear(),
        teamName: team.teamName || `Team ${team.espnTeamId}`,
        ownerName: team.ownerName,
        confidenceScore: confidence,
      },
    });
  }
  
  /**
   * Update owner history for a team
   */
  private async updateOwnerHistory(
    teamIdentityId: string,
    teamSeasons: any[]
  ): Promise<void> {
    const ownerHistory: TeamOwner[] = [];
    let currentOwner: TeamOwner | null = null;
    
    // Process seasons chronologically
    teamSeasons.sort((a, b) => (a.season || 2024) - (b.season || 2024));
    
    for (const team of teamSeasons) {
      const ownerName = team.ownerName || 'Unknown';
      const season = team.season || new Date().getFullYear();
      
      if (!currentOwner || currentOwner.name !== ownerName) {
        // Owner changed
        if (currentOwner) {
          currentOwner.endSeason = season - 1;
          ownerHistory.push(currentOwner);
        }
        
        currentOwner = {
          name: ownerName,
          startSeason: season,
          email: team.ownerEmail,
        };
      }
    }
    
    // Add the last owner
    if (currentOwner) {
      ownerHistory.push(currentOwner);
    }
    
    // Update team identity with owner history
    await prisma.teamIdentity.update({
      where: { id: teamIdentityId },
      data: {
        ownerHistory: ownerHistory as any,
      },
    });
  }
  
  /**
   * Resolve teams that might have changed ESPN IDs
   * Uses name and owner matching to identify continuity
   */
  private async resolveChangedTeamIds(
    leagueId: string,
    existingGroups: Map<number, any[]>
  ): Promise<void> {
    // Get all unmapped teams
    const allMappings = await prisma.teamIdentityMapping.findMany({
      where: { leagueId },
      select: {
        espnTeamId: true,
        season: true,
      },
    });
    
    const mappedKeys = new Set(
      allMappings.map(m => `${m.espnTeamId}_${m.season}`)
    );
    
    const teams = await this.getAllTeams(leagueId);
    const unmappedTeams = teams.filter(t => {
      const key = `${t.espnTeamId}_${t.season || new Date().getFullYear()}`;
      return !mappedKeys.has(key);
    });
    
    if (unmappedTeams.length === 0) return;
    
    // Try to match unmapped teams with existing identities
    for (const unmapped of unmappedTeams) {
      let bestMatch: { identity: TeamIdentity; score: number } | null = null;
      
      // Get all existing identities for the league
      const existingIdentities = await prisma.teamIdentity.findMany({
        where: { leagueId },
        include: {
          mappings: true,
        },
      });
      
      for (const identity of existingIdentities) {
        // Calculate similarity based on team name and owner
        const lastMapping = identity.mappings
          .sort((a, b) => b.season - a.season)[0];
        
        if (!lastMapping) continue;
        
        // Check if seasons are adjacent (team might have changed ID)
        const seasonDiff = Math.abs(
          (unmapped.season || 2024) - lastMapping.season
        );
        
        if (seasonDiff > 2) continue; // Too far apart
        
        // Calculate name similarity
        const nameSimilarity = this.matcher.calculateSimilarity(
          unmapped.teamName || '',
          lastMapping.teamName || ''
        );
        
        // Calculate owner similarity
        const ownerSimilarity = this.matcher.calculateSimilarity(
          unmapped.ownerName || '',
          lastMapping.ownerName || ''
        );
        
        // Combined score (owner matters more for continuity)
        const score = nameSimilarity * 0.3 + ownerSimilarity * 0.7;
        
        if (score > 0.7 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = {
            identity: identity as TeamIdentity,
            score,
          };
        }
      }
      
      // Apply best match if found
      if (bestMatch) {
        await this.createTeamMapping(
          bestMatch.identity,
          unmapped,
          bestMatch.score > 0.85
        );
        
        // Log potential ID change
        console.log(
          `Potential team ID change detected: Team "${unmapped.teamName}" ` +
          `(ID: ${unmapped.espnTeamId}) matched to existing identity with ` +
          `${(bestMatch.score * 100).toFixed(1)}% confidence`
        );
      }
    }
  }
  
  /**
   * Merge two team identities
   */
  async mergeTeamIdentities(
    primaryId: string,
    secondaryId: string,
    reason?: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Get both identities
      const primary = await tx.teamIdentity.findUnique({
        where: { id: primaryId },
        include: { mappings: true },
      });
      
      const secondary = await tx.teamIdentity.findUnique({
        where: { id: secondaryId },
        include: { mappings: true },
      });
      
      if (!primary || !secondary) {
        throw new Error('One or both team identities not found');
      }
      
      // Update all mappings from secondary to primary
      await tx.teamIdentityMapping.updateMany({
        where: { masterTeamId: secondary.masterTeamId },
        data: { masterTeamId: primary.masterTeamId },
      });
      
      // Merge owner histories
      const primaryHistory = primary.ownerHistory as TeamOwner[];
      const secondaryHistory = secondary.ownerHistory as TeamOwner[];
      const mergedHistory = this.mergeOwnerHistories(primaryHistory, secondaryHistory);
      
      // Update primary identity
      await tx.teamIdentity.update({
        where: { id: primaryId },
        data: {
          ownerHistory: mergedHistory as any,
        },
      });
      
      // Delete secondary identity
      await tx.teamIdentity.delete({
        where: { id: secondaryId },
      });
      
      // Log the merge
      await tx.identityAuditLog.create({
        data: {
          entityType: 'TEAM',
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
   * Merge two owner histories chronologically
   */
  private mergeOwnerHistories(
    history1: TeamOwner[],
    history2: TeamOwner[]
  ): TeamOwner[] {
    const allOwners = [...history1, ...history2];
    
    // Sort by start season
    allOwners.sort((a, b) => a.startSeason - b.startSeason);
    
    // Remove duplicates and fix overlaps
    const merged: TeamOwner[] = [];
    let current: TeamOwner | null = null;
    
    for (const owner of allOwners) {
      if (!current) {
        current = { ...owner };
      } else if (current.name === owner.name) {
        // Same owner, extend the range
        if (owner.endSeason) {
          current.endSeason = Math.max(
            current.endSeason || current.startSeason,
            owner.endSeason
          );
        }
      } else {
        // Different owner
        if (!current.endSeason) {
          current.endSeason = owner.startSeason - 1;
        }
        merged.push(current);
        current = { ...owner };
      }
    }
    
    if (current) {
      merged.push(current);
    }
    
    return merged;
  }
  
  /**
   * Get team identity by ESPN team ID and season
   */
  async getTeamIdentity(
    leagueId: string,
    espnTeamId: number,
    season: number
  ): Promise<TeamIdentity | null> {
    const mapping = await prisma.teamIdentityMapping.findUnique({
      where: {
        leagueId_espnTeamId_season: {
          leagueId,
          espnTeamId,
          season,
        },
      },
      include: {
        teamIdentity: {
          include: {
            mappings: true,
          },
        },
      },
    });
    
    return mapping?.teamIdentity as TeamIdentity | null;
  }
  
  /**
   * Get team's complete history
   */
  async getTeamHistory(
    leagueId: string,
    masterTeamId: string
  ): Promise<{
    identity: TeamIdentity;
    seasons: TeamMapping[];
    stats: {
      totalSeasons: number;
      totalWins: number;
      totalLosses: number;
      bestFinish: number;
      championships: number;
    };
  }> {
    const identity = await prisma.teamIdentity.findUnique({
      where: { masterTeamId },
      include: {
        mappings: {
          orderBy: { season: 'asc' },
        },
      },
    });
    
    if (!identity) {
      throw new Error('Team identity not found');
    }
    
    // Calculate statistics
    let totalWins = 0;
    let totalLosses = 0;
    let bestFinish = 999;
    let championships = 0;
    
    // Get detailed season data
    const seasonData = [];
    for (const mapping of identity.mappings) {
      const historicalData = await prisma.leagueHistoricalData.findFirst({
        where: {
          leagueId,
          season: mapping.season,
          dataType: 'teams',
        },
      });
      
      if (historicalData) {
        const teams = historicalData.data as any[];
        const team = teams.find(t => t.espnTeamId === mapping.espnTeamId);
        
        if (team) {
          totalWins += team.wins || 0;
          totalLosses += team.losses || 0;
          
          if (team.standing) {
            bestFinish = Math.min(bestFinish, team.standing);
            if (team.standing === 1) {
              championships++;
            }
          }
          
          seasonData.push({
            ...mapping,
            wins: team.wins,
            losses: team.losses,
            standing: team.standing,
          });
        }
      }
    }
    
    return {
      identity: identity as TeamIdentity,
      seasons: seasonData as TeamMapping[],
      stats: {
        totalSeasons: identity.mappings.length,
        totalWins,
        totalLosses,
        bestFinish: bestFinish === 999 ? 0 : bestFinish,
        championships,
      },
    };
  }
}