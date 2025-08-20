import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { prisma } from '@/lib/prisma';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface StorageStats {
  totalSize: number;
  byTable: Record<string, number>;
  bySeason: Record<number, number>;
  compressionRatio?: number;
}

export interface ArchiveResult {
  season: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  recordsArchived: number;
}

export class StorageOptimizer {
  /**
   * Compress large JSON data before storage
   */
  async compressData(data: any): Promise<Buffer> {
    const json = JSON.stringify(data);
    return gzipAsync(json);
  }

  /**
   * Decompress data when retrieving
   */
  async decompressData(compressed: Buffer): Promise<any> {
    const json = await gunzipAsync(compressed);
    return JSON.parse(json.toString());
  }

  /**
   * Archive old season data
   */
  async archiveSeason(leagueId: string, season: number): Promise<ArchiveResult> {
    console.log(`Archiving season ${season} for league ${leagueId}`);
    
    // Get all data for the season
    const [matchups, transactions, playerStats] = await prisma.$transaction([
      prisma.leagueMatchup.findMany({
        where: { 
          leagueId,
          // Add season filtering if your matchup table has season field
          // For now, we'll archive based on historical data
        },
      }),
      prisma.leagueTransaction.findMany({
        where: { leagueId, season },
      }),
      prisma.leaguePlayerStats.findMany({
        where: { leagueId, season },
      }),
    ]);

    const seasonData = {
      matchups,
      transactions,
      playerStats,
      archivedAt: new Date(),
    };

    // Calculate original size
    const originalJson = JSON.stringify(seasonData);
    const originalSize = Buffer.byteLength(originalJson);

    // Compress the data
    const compressed = await this.compressData(seasonData);
    const compressedSize = compressed.length;
    const compressionRatio = 1 - (compressedSize / originalSize);

    // Store in archive table
    await prisma.leagueArchive.upsert({
      where: {
        leagueId_season_dataType: {
          leagueId,
          season,
          dataType: 'full_season',
        },
      },
      update: {
        compressedData: compressed,
        originalSize,
        compressedSize,
        compressionRatio,
      },
      create: {
        leagueId,
        season,
        dataType: 'full_season',
        compressedData: compressed,
        originalSize,
        compressedSize,
        compressionRatio,
      },
    });

    // Optionally delete original data to save space (only for very old seasons)
    const currentYear = new Date().getFullYear();
    if (season < currentYear - 5) {
      await this.deleteOriginalData(leagueId, season);
    }

    console.log(`Archived season ${season}: ${(compressionRatio * 100).toFixed(1)}% compression`);

    return {
      season,
      originalSize,
      compressedSize,
      compressionRatio,
      recordsArchived: matchups.length + transactions.length + playerStats.length,
    };
  }

  /**
   * Archive multiple seasons
   */
  async archiveHistoricalData(
    leagueId: string,
    olderThanYears: number = 5
  ): Promise<ArchiveResult[]> {
    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - olderThanYears;
    
    // Get seasons to archive
    const historicalData = await prisma.leagueHistoricalData.findMany({
      where: {
        leagueId,
        season: {
          lt: cutoffYear,
        },
      },
      select: {
        season: true,
      },
      distinct: ['season'],
    });

    const results: ArchiveResult[] = [];
    
    for (const data of historicalData) {
      try {
        const result = await this.archiveSeason(leagueId, data.season);
        results.push(result);
      } catch (error: any) {
        console.error(`Failed to archive season ${data.season}:`, error);
      }
    }

    return results;
  }

  /**
   * Retrieve archived data
   */
  async retrieveArchivedSeason(
    leagueId: string,
    season: number
  ): Promise<any | null> {
    const archive = await prisma.leagueArchive.findUnique({
      where: {
        leagueId_season_dataType: {
          leagueId,
          season,
          dataType: 'full_season',
        },
      },
    });

    if (!archive) {
      return null;
    }

    return this.decompressData(archive.compressedData);
  }

  /**
   * Delete original data after archiving
   */
  private async deleteOriginalData(leagueId: string, season: number): Promise<void> {
    console.log(`Deleting original data for season ${season}`);
    
    await prisma.$transaction([
      prisma.leagueTransaction.deleteMany({
        where: { leagueId, season },
      }),
      prisma.leaguePlayerStats.deleteMany({
        where: { leagueId, season },
      }),
    ]);
  }

  /**
   * Create optimized indexes for common queries
   */
  async createIndexes(): Promise<void> {
    console.log('Creating optimized indexes...');
    
    try {
      // Create database indexes for common queries
      await prisma.$executeRawUnsafe(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_historical_league_season 
        ON league_historical_data(league_id, season);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_historical_data_type 
        ON league_historical_data(data_type);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matchups_league_week 
        ON league_matchups(league_id, week);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_players_league_name 
        ON league_players(league_id, name);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_league_date 
        ON league_transactions(league_id, transaction_date);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stats_player_season 
        ON league_player_stats(player_id, season);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkpoints_import_id 
        ON import_checkpoints(import_id);
        
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_archives_league_season 
        ON league_archives(league_id, season);
      `);
      
      console.log('Indexes created successfully');
    } catch (error: any) {
      console.error('Error creating indexes:', error);
      // Don't throw - indexes might already exist
    }
  }

  /**
   * Optimize storage with table partitioning
   */
  async setupPartitioning(leagueId: string): Promise<void> {
    console.log(`Setting up partitioning for league ${leagueId}`);
    
    try {
      // This is a simplified example - actual partitioning would require more complex setup
      // and might need to be done at table creation time
      await prisma.$executeRawUnsafe(`
        -- Example: Create a view that unions partitioned tables
        CREATE OR REPLACE VIEW league_matchups_partitioned AS
        SELECT * FROM league_matchups
        WHERE league_id = $1::uuid;
      `, leagueId);
      
      console.log('Partitioning setup complete');
    } catch (error: any) {
      console.error('Error setting up partitioning:', error);
    }
  }

  /**
   * Calculate storage statistics
   */
  async getStorageStats(leagueId: string): Promise<StorageStats> {
    // Get table sizes
    const tableSizes = await prisma.$queryRaw<any[]>`
      SELECT 
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size_pretty,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      AND (
        tablename LIKE 'league_%'
        OR tablename LIKE 'import_%'
        OR tablename LIKE 'sync_%'
      )
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
    `;

    // Calculate by season
    const seasonStats = await prisma.leagueHistoricalData.groupBy({
      by: ['season'],
      where: { leagueId },
      _sum: {
        recordCount: true,
      },
    });

    // Get archive stats
    const archiveStats = await prisma.leagueArchive.aggregate({
      where: { leagueId },
      _sum: {
        originalSize: true,
        compressedSize: true,
      },
    });

    const totalSize = tableSizes.reduce((sum, row) => sum + Number(row.size_bytes), 0);
    const byTable = Object.fromEntries(
      tableSizes.map(row => [row.tablename, Number(row.size_bytes)])
    );
    const bySeason = Object.fromEntries(
      seasonStats.map(stat => [stat.season, stat._sum.recordCount || 0])
    );

    let compressionRatio = 0;
    if (archiveStats._sum.originalSize && archiveStats._sum.compressedSize) {
      compressionRatio = 1 - (archiveStats._sum.compressedSize / archiveStats._sum.originalSize);
    }

    return {
      totalSize,
      byTable,
      bySeason,
      compressionRatio,
    };
  }

  /**
   * Vacuum and analyze tables for better performance
   */
  async optimizeTables(): Promise<void> {
    console.log('Running VACUUM ANALYZE on tables...');
    
    const tables = [
      'league_historical_data',
      'league_matchups',
      'league_transactions',
      'league_player_stats',
      'import_checkpoints',
      'sync_metadata',
    ];

    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(`VACUUM ANALYZE ${table};`);
        console.log(`Optimized table: ${table}`);
      } catch (error: any) {
        console.error(`Failed to optimize ${table}:`, error);
      }
    }
  }

  /**
   * Clean up orphaned records
   */
  async cleanupOrphanedData(leagueId: string): Promise<{
    orphanedMatchups: number;
    orphanedTransactions: number;
    orphanedStats: number;
  }> {
    // Find and delete matchups without valid teams
    const orphanedMatchups = await prisma.leagueMatchup.deleteMany({
      where: {
        leagueId,
        OR: [
          {
            homeTeam: {
              is: null,
            },
          },
          {
            awayTeam: {
              is: null,
            },
          },
        ],
      },
    });

    // Find and delete transactions without valid leagues
    const orphanedTransactions = await prisma.leagueTransaction.deleteMany({
      where: {
        leagueId,
        league: {
          is: null,
        },
      },
    });

    // Find and delete player stats without valid leagues
    const orphanedStats = await prisma.leaguePlayerStats.deleteMany({
      where: {
        leagueId,
        league: {
          is: null,
        },
      },
    });

    return {
      orphanedMatchups: orphanedMatchups.count,
      orphanedTransactions: orphanedTransactions.count,
      orphanedStats: orphanedStats.count,
    };
  }

  /**
   * Estimate storage savings from optimization
   */
  async estimateOptimizationSavings(leagueId: string): Promise<{
    currentSize: number;
    estimatedSizeAfterOptimization: number;
    potentialSavings: number;
    potentialSavingsPercent: number;
  }> {
    const stats = await this.getStorageStats(leagueId);
    
    // Estimate compression ratio based on typical JSON compression
    const estimatedCompressionRatio = 0.7; // 70% compression typical for JSON
    
    // Calculate which data can be archived
    const currentYear = new Date().getFullYear();
    const archivableSeasons = Object.entries(stats.bySeason)
      .filter(([season]) => Number(season) < currentYear - 5)
      .reduce((sum, [, size]) => sum + size, 0);
    
    const estimatedSavings = archivableSeasons * estimatedCompressionRatio;
    const estimatedSizeAfterOptimization = stats.totalSize - estimatedSavings;
    const potentialSavingsPercent = (estimatedSavings / stats.totalSize) * 100;

    return {
      currentSize: stats.totalSize,
      estimatedSizeAfterOptimization,
      potentialSavings: estimatedSavings,
      potentialSavingsPercent,
    };
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// Export singleton instance
export const storageOptimizer = new StorageOptimizer();