import { prisma } from '@/lib/prisma';

export interface IntegrityCheckResult {
  valid: boolean;
  issues: IntegrityIssue[];
  stats: ImportStatistics;
  recommendations: string[];
}

export interface IntegrityIssue {
  type: 'error' | 'warning';
  category: string;
  description: string;
  affectedRecords?: number;
  details?: any;
}

export interface ImportStatistics {
  totalSeasons: number;
  totalMatchups: number;
  totalPlayers: number;
  totalTransactions: number;
  totalTeams: number;
  yearRange?: string;
  averageMatchupsPerSeason: number;
  averagePlayersPerSeason: number;
  dataCompleteness: number;
}

export class DataIntegrityChecker {
  /**
   * Validate imported data integrity
   */
  async validateImport(leagueId: string): Promise<IntegrityCheckResult> {
    const issues: IntegrityIssue[] = [];
    const recommendations: string[] = [];
    
    console.log(`Running integrity check for league ${leagueId}`);
    
    // Run all checks in parallel
    const [
      matchupCheck,
      playerCheck,
      scoreCheck,
      seasonCheck,
      teamCheck,
      transactionCheck,
    ] = await Promise.all([
      this.checkMatchupIntegrity(leagueId),
      this.checkPlayerIntegrity(leagueId),
      this.checkScoreIntegrity(leagueId),
      this.checkSeasonContinuity(leagueId),
      this.checkTeamIntegrity(leagueId),
      this.checkTransactionIntegrity(leagueId),
    ]);
    
    // Collect issues from all checks
    issues.push(...matchupCheck.issues);
    issues.push(...playerCheck.issues);
    issues.push(...scoreCheck.issues);
    issues.push(...seasonCheck.issues);
    issues.push(...teamCheck.issues);
    issues.push(...transactionCheck.issues);
    
    // Get import statistics
    const stats = await this.getImportStats(leagueId);
    
    // Generate recommendations based on issues
    if (issues.filter(i => i.type === 'error').length > 0) {
      recommendations.push('Critical issues found - consider re-importing affected seasons');
    }
    
    if (stats.dataCompleteness < 0.8) {
      recommendations.push('Data completeness below 80% - check for missing seasons or incomplete imports');
    }
    
    const duplicateIssues = issues.filter(i => i.category === 'duplicates');
    if (duplicateIssues.length > 0) {
      recommendations.push('Run deduplication service to clean up duplicate records');
    }
    
    const missingDataIssues = issues.filter(i => i.category === 'missing_data');
    if (missingDataIssues.length > 0) {
      recommendations.push('Use incremental sync to fill in missing data');
    }
    
    return {
      valid: issues.filter(i => i.type === 'error').length === 0,
      issues,
      stats,
      recommendations,
    };
  }

  /**
   * Check matchup data integrity
   */
  private async checkMatchupIntegrity(leagueId: string): Promise<{ issues: IntegrityIssue[] }> {
    const issues: IntegrityIssue[] = [];
    
    // Check for duplicate matchups
    const duplicates = await prisma.$queryRaw<any[]>`
      SELECT week, home_team_id, away_team_id, COUNT(*) as count
      FROM league_matchups
      WHERE league_id = ${leagueId}::uuid
      GROUP BY week, home_team_id, away_team_id
      HAVING COUNT(*) > 1;
    `;
    
    if (duplicates.length > 0) {
      issues.push({
        type: 'error',
        category: 'duplicates',
        description: `Found ${duplicates.length} duplicate matchups`,
        affectedRecords: duplicates.reduce((sum, d) => sum + d.count - 1, 0),
        details: duplicates,
      });
    }
    
    // Check for matchups without scores
    const incompleteMatchups = await prisma.leagueMatchup.count({
      where: {
        leagueId,
        isComplete: true,
        OR: [
          { homeScore: null },
          { awayScore: null },
        ],
      },
    });
    
    if (incompleteMatchups > 0) {
      issues.push({
        type: 'warning',
        category: 'incomplete_data',
        description: `${incompleteMatchups} completed matchups missing scores`,
        affectedRecords: incompleteMatchups,
      });
    }
    
    // Check for orphaned matchups (teams that don't exist)
    const orphanedMatchups = await prisma.leagueMatchup.count({
      where: {
        leagueId,
        OR: [
          { homeTeam: { is: null } },
          { awayTeam: { is: null } },
        ],
      },
    });
    
    if (orphanedMatchups > 0) {
      issues.push({
        type: 'error',
        category: 'orphaned_data',
        description: `${orphanedMatchups} matchups reference non-existent teams`,
        affectedRecords: orphanedMatchups,
      });
    }
    
    return { issues };
  }

  /**
   * Check player data integrity
   */
  private async checkPlayerIntegrity(leagueId: string): Promise<{ issues: IntegrityIssue[] }> {
    const issues: IntegrityIssue[] = [];
    
    // Check for players without names
    const namelessPlayers = await prisma.leaguePlayer.count({
      where: {
        leagueId,
        OR: [
          { name: null },
          { name: '' },
        ],
      },
    });
    
    if (namelessPlayers > 0) {
      issues.push({
        type: 'error',
        category: 'missing_data',
        description: `${namelessPlayers} players without names`,
        affectedRecords: namelessPlayers,
      });
    }
    
    // Check for invalid positions
    const validPositions = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST', 'DEF', 'FLEX', 'BENCH', 'IR'];
    const invalidPositions = await prisma.leaguePlayer.count({
      where: {
        leagueId,
        NOT: {
          position: {
            in: validPositions,
          },
        },
        position: {
          not: null,
        },
      },
    });
    
    if (invalidPositions > 0) {
      issues.push({
        type: 'warning',
        category: 'invalid_data',
        description: `${invalidPositions} players with invalid positions`,
        affectedRecords: invalidPositions,
      });
    }
    
    // Check for duplicate players
    const duplicatePlayers = await prisma.$queryRaw<any[]>`
      SELECT espn_player_id, COUNT(*) as count
      FROM league_players
      WHERE league_id = ${leagueId}::uuid
      GROUP BY espn_player_id
      HAVING COUNT(*) > 1;
    `;
    
    if (duplicatePlayers.length > 0) {
      issues.push({
        type: 'error',
        category: 'duplicates',
        description: `${duplicatePlayers.length} duplicate player records`,
        affectedRecords: duplicatePlayers.reduce((sum, d) => sum + d.count - 1, 0),
      });
    }
    
    return { issues };
  }

  /**
   * Check score data integrity
   */
  private async checkScoreIntegrity(leagueId: string): Promise<{ issues: IntegrityIssue[] }> {
    const issues: IntegrityIssue[] = [];
    
    // Check for negative scores
    const negativeScores = await prisma.leagueMatchup.count({
      where: {
        leagueId,
        OR: [
          { homeScore: { lt: 0 } },
          { awayScore: { lt: 0 } },
        ],
      },
    });
    
    if (negativeScores > 0) {
      issues.push({
        type: 'error',
        category: 'invalid_data',
        description: `${negativeScores} matchups with negative scores`,
        affectedRecords: negativeScores,
      });
    }
    
    // Check for unrealistic scores
    const unrealisticScores = await prisma.leagueMatchup.count({
      where: {
        leagueId,
        OR: [
          { homeScore: { gt: 300 } },
          { awayScore: { gt: 300 } },
        ],
      },
    });
    
    if (unrealisticScores > 0) {
      issues.push({
        type: 'warning',
        category: 'suspicious_data',
        description: `${unrealisticScores} matchups with unusually high scores (>300)`,
        affectedRecords: unrealisticScores,
      });
    }
    
    // Check player stats for anomalies
    const anomalousStats = await prisma.leaguePlayerStats.count({
      where: {
        leagueId,
        OR: [
          { points: { lt: -50 } },
          { points: { gt: 100 } },
        ],
      },
    });
    
    if (anomalousStats > 0) {
      issues.push({
        type: 'warning',
        category: 'suspicious_data',
        description: `${anomalousStats} player performances with unusual point totals`,
        affectedRecords: anomalousStats,
      });
    }
    
    return { issues };
  }

  /**
   * Check season continuity
   */
  private async checkSeasonContinuity(leagueId: string): Promise<{ issues: IntegrityIssue[] }> {
    const issues: IntegrityIssue[] = [];
    
    // Get all seasons
    const seasons = await prisma.leagueHistoricalData.findMany({
      where: { leagueId },
      select: { season: true },
      distinct: ['season'],
      orderBy: { season: 'asc' },
    });
    
    if (seasons.length === 0) {
      issues.push({
        type: 'error',
        category: 'missing_data',
        description: 'No historical data found',
        affectedRecords: 0,
      });
      return { issues };
    }
    
    // Check for gaps in seasons
    const seasonYears = seasons.map(s => s.season);
    const gaps: number[] = [];
    
    for (let i = 1; i < seasonYears.length; i++) {
      const gap = seasonYears[i] - seasonYears[i - 1];
      if (gap > 1) {
        for (let year = seasonYears[i - 1] + 1; year < seasonYears[i]; year++) {
          gaps.push(year);
        }
      }
    }
    
    if (gaps.length > 0) {
      issues.push({
        type: 'warning',
        category: 'missing_data',
        description: `Missing ${gaps.length} seasons: ${gaps.join(', ')}`,
        affectedRecords: gaps.length,
        details: { missingSeasons: gaps },
      });
    }
    
    // Check for incomplete seasons (missing weeks)
    for (const season of seasons) {
      const weeks = await prisma.$queryRaw<any[]>`
        SELECT DISTINCT week
        FROM league_matchups m
        JOIN leagues l ON m.league_id = l.id
        WHERE l.id = ${leagueId}::uuid
        ORDER BY week;
      `;
      
      const weekNumbers = weeks.map(w => w.week);
      const expectedWeeks = 17; // Standard NFL season (adjust as needed)
      const missingWeeks = [];
      
      for (let week = 1; week <= expectedWeeks; week++) {
        if (!weekNumbers.includes(week)) {
          missingWeeks.push(week);
        }
      }
      
      if (missingWeeks.length > 0) {
        issues.push({
          type: 'warning',
          category: 'incomplete_data',
          description: `Season ${season.season} missing weeks: ${missingWeeks.join(', ')}`,
          affectedRecords: missingWeeks.length,
          details: { season: season.season, missingWeeks },
        });
      }
    }
    
    return { issues };
  }

  /**
   * Check team data integrity
   */
  private async checkTeamIntegrity(leagueId: string): Promise<{ issues: IntegrityIssue[] }> {
    const issues: IntegrityIssue[] = [];
    
    // Check for teams without names
    const namelessTeams = await prisma.leagueTeam.count({
      where: {
        leagueId,
        OR: [
          { name: null },
          { name: '' },
        ],
      },
    });
    
    if (namelessTeams > 0) {
      issues.push({
        type: 'error',
        category: 'missing_data',
        description: `${namelessTeams} teams without names`,
        affectedRecords: namelessTeams,
      });
    }
    
    // Check for invalid win/loss records
    const invalidRecords = await prisma.leagueTeam.count({
      where: {
        leagueId,
        OR: [
          { wins: { lt: 0 } },
          { losses: { lt: 0 } },
          { ties: { lt: 0 } },
        ],
      },
    });
    
    if (invalidRecords > 0) {
      issues.push({
        type: 'error',
        category: 'invalid_data',
        description: `${invalidRecords} teams with invalid win/loss records`,
        affectedRecords: invalidRecords,
      });
    }
    
    // Check for duplicate ESPN team IDs
    const duplicateTeams = await prisma.$queryRaw<any[]>`
      SELECT espn_team_id, COUNT(*) as count
      FROM league_teams
      WHERE league_id = ${leagueId}::uuid
      GROUP BY espn_team_id
      HAVING COUNT(*) > 1;
    `;
    
    if (duplicateTeams.length > 0) {
      issues.push({
        type: 'error',
        category: 'duplicates',
        description: `${duplicateTeams.length} duplicate team records`,
        affectedRecords: duplicateTeams.reduce((sum, d) => sum + d.count - 1, 0),
      });
    }
    
    return { issues };
  }

  /**
   * Check transaction data integrity
   */
  private async checkTransactionIntegrity(leagueId: string): Promise<{ issues: IntegrityIssue[] }> {
    const issues: IntegrityIssue[] = [];
    
    // Check for transactions with invalid dates
    const invalidDates = await prisma.leagueTransaction.count({
      where: {
        leagueId,
        OR: [
          { transactionDate: { lt: new Date('2000-01-01') } },
          { transactionDate: { gt: new Date() } },
        ],
      },
    });
    
    if (invalidDates > 0) {
      issues.push({
        type: 'warning',
        category: 'invalid_data',
        description: `${invalidDates} transactions with suspicious dates`,
        affectedRecords: invalidDates,
      });
    }
    
    // Check for duplicate transactions
    const duplicateTransactions = await prisma.$queryRaw<any[]>`
      SELECT transaction_id, season, COUNT(*) as count
      FROM league_transactions
      WHERE league_id = ${leagueId}::uuid
      GROUP BY transaction_id, season
      HAVING COUNT(*) > 1;
    `;
    
    if (duplicateTransactions.length > 0) {
      issues.push({
        type: 'error',
        category: 'duplicates',
        description: `${duplicateTransactions.length} duplicate transaction records`,
        affectedRecords: duplicateTransactions.reduce((sum, d) => sum + d.count - 1, 0),
      });
    }
    
    return { issues };
  }

  /**
   * Get import statistics
   */
  private async getImportStats(leagueId: string): Promise<ImportStatistics> {
    const [
      seasons,
      totalMatchups,
      totalPlayers,
      totalTransactions,
      totalTeams,
      dateRange,
    ] = await Promise.all([
      prisma.leagueHistoricalData.findMany({
        where: { leagueId },
        select: { season: true },
        distinct: ['season'],
      }),
      prisma.leagueMatchup.count({
        where: { leagueId },
      }),
      prisma.leaguePlayer.count({
        where: { leagueId },
      }),
      prisma.leagueTransaction.count({
        where: { leagueId },
      }),
      prisma.leagueTeam.count({
        where: { leagueId },
      }),
      prisma.leagueHistoricalData.aggregate({
        where: { leagueId },
        _min: { season: true },
        _max: { season: true },
      }),
    ]);
    
    const totalSeasons = seasons.length;
    const averageMatchupsPerSeason = totalSeasons > 0 ? Math.round(totalMatchups / totalSeasons) : 0;
    const averagePlayersPerSeason = totalSeasons > 0 ? Math.round(totalPlayers / totalSeasons) : 0;
    
    // Calculate data completeness (simple heuristic)
    const expectedMatchupsPerSeason = 13 * totalTeams / 2; // Rough estimate
    const expectedTotalMatchups = expectedMatchupsPerSeason * totalSeasons;
    const dataCompleteness = expectedTotalMatchups > 0 
      ? Math.min(1, totalMatchups / expectedTotalMatchups)
      : 0;
    
    return {
      totalSeasons,
      totalMatchups,
      totalPlayers,
      totalTransactions,
      totalTeams,
      yearRange: dateRange._min?.season && dateRange._max?.season
        ? `${dateRange._min.season}-${dateRange._max.season}`
        : undefined,
      averageMatchupsPerSeason,
      averagePlayersPerSeason,
      dataCompleteness,
    };
  }

  /**
   * Fix common integrity issues
   */
  async fixCommonIssues(leagueId: string): Promise<{
    duplicatesRemoved: number;
    orphansRemoved: number;
    invalidDataFixed: number;
  }> {
    let duplicatesRemoved = 0;
    let orphansRemoved = 0;
    let invalidDataFixed = 0;
    
    // Remove duplicate matchups
    const duplicateMatchups = await prisma.$queryRaw<any[]>`
      SELECT id, week, home_team_id, away_team_id,
             ROW_NUMBER() OVER (PARTITION BY week, home_team_id, away_team_id ORDER BY id) as rn
      FROM league_matchups
      WHERE league_id = ${leagueId}::uuid;
    `;
    
    const toDelete = duplicateMatchups.filter(m => m.rn > 1).map(m => m.id);
    if (toDelete.length > 0) {
      const deleted = await prisma.leagueMatchup.deleteMany({
        where: { id: { in: toDelete } },
      });
      duplicatesRemoved += deleted.count;
    }
    
    // Remove orphaned matchups
    const orphanedDeleted = await prisma.leagueMatchup.deleteMany({
      where: {
        leagueId,
        OR: [
          { homeTeam: { is: null } },
          { awayTeam: { is: null } },
        ],
      },
    });
    orphansRemoved += orphanedDeleted.count;
    
    // Fix negative scores by setting to 0
    const fixedScores = await prisma.leagueMatchup.updateMany({
      where: {
        leagueId,
        OR: [
          { homeScore: { lt: 0 } },
          { awayScore: { lt: 0 } },
        ],
      },
      data: {
        homeScore: 0,
        awayScore: 0,
      },
    });
    invalidDataFixed += fixedScores.count;
    
    return {
      duplicatesRemoved,
      orphansRemoved,
      invalidDataFixed,
    };
  }
}

// Export singleton instance
export const dataIntegrityChecker = new DataIntegrityChecker();