import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingId?: string;
  hash: string;
}

export class DeduplicationService {
  /**
   * Generate unique hash for a data record
   */
  generateHash(data: any): string {
    const normalized = this.normalizeData(data);
    const json = JSON.stringify(normalized);
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Normalize data for consistent hashing
   */
  private normalizeData(data: any): any {
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeData(item)).sort();
    }
    
    if (data && typeof data === 'object') {
      const normalized: any = {};
      const keys = Object.keys(data).sort();
      
      for (const key of keys) {
        // Skip timestamp fields for deduplication
        if (!['createdAt', 'updatedAt', 'timestamp', 'importedAt'].includes(key)) {
          normalized[key] = this.normalizeData(data[key]);
        }
      }
      
      return normalized;
    }
    
    return data;
  }

  /**
   * Check if matchup already exists
   */
  async matchupExists(
    leagueId: string,
    season: number,
    week: number,
    homeTeamId: string,
    awayTeamId: string
  ): Promise<boolean> {
    const existing = await prisma.leagueMatchup.findFirst({
      where: {
        leagueId,
        week,
        OR: [
          { homeTeamId, awayTeamId },
          { homeTeamId: awayTeamId, awayTeamId: homeTeamId },
        ],
      },
    });
    
    return !!existing;
  }

  /**
   * Check if player already exists in league
   */
  async playerExists(
    leagueId: string,
    espnPlayerId: bigint
  ): Promise<boolean> {
    const existing = await prisma.leaguePlayer.findUnique({
      where: {
        leagueId_espnPlayerId: {
          leagueId,
          espnPlayerId,
        },
      },
    });
    
    return !!existing;
  }

  /**
   * Check if transaction already exists
   */
  async transactionExists(
    leagueId: string,
    transactionId: bigint,
    season: number
  ): Promise<boolean> {
    const existing = await prisma.leagueTransaction.findUnique({
      where: {
        leagueId_transactionId_season: {
          leagueId,
          transactionId,
          season,
        },
      },
    });
    
    return !!existing;
  }

  /**
   * Check if season data already imported
   */
  async seasonDataExists(
    leagueId: string,
    season: number,
    dataType: string
  ): Promise<DeduplicationResult> {
    const existing = await prisma.leagueHistoricalData.findUnique({
      where: {
        leagueId_season_dataType: {
          leagueId,
          season,
          dataType,
        },
      },
    });
    
    return {
      isDuplicate: !!existing,
      existingId: existing?.id,
      hash: existing?.dataHash || '',
    };
  }

  /**
   * Deduplicate player list by ESPN ID
   */
  deduplicatePlayers(players: any[]): any[] {
    const seen = new Map();
    
    return players.filter(player => {
      const key = `${player.id}_${player.seasonId || ''}`;
      if (seen.has(key)) {
        const existing = seen.get(key);
        // Keep the record with more data
        if (this.hasMoreData(player, existing)) {
          seen.set(key, player);
        }
        return false;
      }
      seen.set(key, player);
      return true;
    });
  }

  /**
   * Deduplicate matchups
   */
  deduplicateMatchups(matchups: any[]): any[] {
    const seen = new Map();
    
    return matchups.filter(matchup => {
      // Create unique key for matchup
      const teams = [matchup.home?.teamId, matchup.away?.teamId].sort();
      const key = `${matchup.matchupPeriodId}_${teams.join('_')}`;
      
      if (seen.has(key)) {
        const existing = seen.get(key);
        // Keep the record with more complete data
        if (this.hasMoreData(matchup, existing)) {
          seen.set(key, matchup);
        }
        return false;
      }
      seen.set(key, matchup);
      return true;
    });
  }

  /**
   * Deduplicate transactions
   */
  deduplicateTransactions(transactions: any[]): any[] {
    const seen = new Set();
    
    return transactions.filter(transaction => {
      const key = `${transaction.id}_${transaction.proposedDate}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Check if one record has more data than another
   */
  private hasMoreData(record1: any, record2: any): boolean {
    const json1 = JSON.stringify(record1);
    const json2 = JSON.stringify(record2);
    return json1.length > json2.length;
  }

  /**
   * Validate data integrity before storage
   */
  async validateSeasonData(data: any): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check league data
    if (!data.league?.id) {
      errors.push('Missing league ID');
    }
    
    if (!data.league?.seasonId) {
      errors.push('Missing season ID');
    }
    
    // Check teams
    if (!data.league?.teams || data.league.teams.length === 0) {
      errors.push('No teams found');
    } else if (data.league.teams.length < 4) {
      warnings.push(`Only ${data.league.teams.length} teams found`);
    }
    
    // Check matchups
    if (!data.matchups || data.matchups.length === 0) {
      errors.push('No matchups found');
    } else {
      // Validate matchup data
      data.matchups?.forEach((matchup: any, index: number) => {
        if (!matchup.home?.teamId || !matchup.away?.teamId) {
          errors.push(`Matchup ${index} missing team IDs`);
        }
        
        if (matchup.home?.totalPoints < 0 || matchup.away?.totalPoints < 0) {
          warnings.push(`Matchup ${index} has negative points`);
        }
        
        if (matchup.home?.totalPoints > 300 || matchup.away?.totalPoints > 300) {
          warnings.push(`Matchup ${index} has unusually high points (>300)`);
        }
      });
    }
    
    // Check players
    if (!data.players || data.players.length === 0) {
      warnings.push('No players found');
    } else {
      // Validate player data
      let invalidPlayers = 0;
      data.players?.forEach((player: any) => {
        if (!player.id || !player.fullName) {
          invalidPlayers++;
        }
      });
      
      if (invalidPlayers > 0) {
        warnings.push(`${invalidPlayers} players missing required fields`);
      }
    }
    
    // Check transactions
    if (!data.transactions || data.transactions.length === 0) {
      warnings.push('No transactions found (this may be normal for some leagues)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Batch check for existing records
   */
  async batchCheckExistence(
    leagueId: string,
    season: number,
    playerIds: bigint[],
    transactionIds: bigint[]
  ): Promise<{
    existingPlayers: Set<string>;
    existingTransactions: Set<string>;
  }> {
    // Check existing players
    const existingPlayers = await prisma.leaguePlayer.findMany({
      where: {
        leagueId,
        espnPlayerId: {
          in: playerIds,
        },
      },
      select: {
        espnPlayerId: true,
      },
    });
    
    // Check existing transactions
    const existingTransactions = await prisma.leagueTransaction.findMany({
      where: {
        leagueId,
        season,
        transactionId: {
          in: transactionIds,
        },
      },
      select: {
        transactionId: true,
      },
    });
    
    return {
      existingPlayers: new Set(existingPlayers.map(p => p.espnPlayerId.toString())),
      existingTransactions: new Set(existingTransactions.map(t => t.transactionId.toString())),
    };
  }

  /**
   * Clean duplicate records from database
   */
  async cleanDuplicates(leagueId: string): Promise<{
    playersRemoved: number;
    matchupsRemoved: number;
    transactionsRemoved: number;
  }> {
    let playersRemoved = 0;
    let matchupsRemoved = 0;
    let transactionsRemoved = 0;

    // Clean duplicate matchups (keep the most recent)
    const duplicateMatchups = await prisma.$queryRaw<any[]>`
      SELECT league_id, week, home_team_id, away_team_id, COUNT(*) as count
      FROM league_matchups
      WHERE league_id = ${leagueId}::uuid
      GROUP BY league_id, week, home_team_id, away_team_id
      HAVING COUNT(*) > 1
    `;

    for (const dup of duplicateMatchups) {
      const duplicates = await prisma.leagueMatchup.findMany({
        where: {
          leagueId: dup.league_id,
          week: dup.week,
          homeTeamId: dup.home_team_id,
          awayTeamId: dup.away_team_id,
        },
        orderBy: {
          id: 'desc',
        },
      });

      // Keep the first (most recent) and delete the rest
      if (duplicates.length > 1) {
        const toDelete = duplicates.slice(1).map(d => d.id);
        const deleted = await prisma.leagueMatchup.deleteMany({
          where: {
            id: {
              in: toDelete,
            },
          },
        });
        matchupsRemoved += deleted.count;
      }
    }

    return {
      playersRemoved,
      matchupsRemoved,
      transactionsRemoved,
    };
  }
}

// Export singleton instance
export const deduplicationService = new DeduplicationService();