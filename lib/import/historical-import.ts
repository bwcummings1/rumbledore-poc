import { ESPNClient } from '@/lib/espn/client';
import { QueueManager, QueueName } from '@/lib/queue/queue';
import { prisma } from '@/lib/prisma';
import { DataTransformer } from '@/lib/transform/transformer';
import { getCookieManager } from '@/lib/crypto/cookie-manager';
import { WebSocketServer } from '@/lib/websocket/server';
import { ImportStatus } from '@prisma/client';
import crypto from 'crypto';

export interface ImportConfig {
  leagueId: string;
  espnLeagueId: number;
  startYear: number;
  endYear: number;
  userId: string;
}

export interface ImportProgress {
  id: string;
  leagueId: string;
  totalSeasons: number;
  completedSeasons: number;
  currentSeason?: number;
  status: ImportStatus;
  startedAt: Date;
  completedAt?: Date;
  errors: ImportError[];
  checkpoints: SeasonCheckpoint[];
}

export interface SeasonCheckpoint {
  season: number;
  status: 'pending' | 'fetching' | 'processing' | 'completed' | 'failed';
  matchupsImported: number;
  playersImported: number;
  transactionsImported: number;
  error?: string;
  completedAt?: Date;
}

export interface ImportError {
  season: number;
  error: string;
  timestamp: Date;
}

export class HistoricalImportManager {
  private queue: QueueManager;
  private transformer: DataTransformer;
  private importProgress: Map<string, ImportProgress> = new Map();
  private wsServer: WebSocketServer;

  constructor() {
    this.queue = QueueManager.getInstance();
    this.transformer = new DataTransformer();
    this.wsServer = WebSocketServer.getInstance();
  }

  /**
   * Start historical import for a league
   */
  async startImport(config: ImportConfig): Promise<string> {
    const importId = `import_${config.leagueId}_${Date.now()}`;
    
    // Initialize progress tracking
    const progress: ImportProgress = {
      id: importId,
      leagueId: config.leagueId,
      totalSeasons: config.endYear - config.startYear + 1,
      completedSeasons: 0,
      status: ImportStatus.PENDING,
      startedAt: new Date(),
      errors: [],
      checkpoints: this.initializeCheckpoints(config.startYear, config.endYear),
    };

    this.importProgress.set(importId, progress);
    await this.saveProgress(progress);

    // Queue import job
    await this.queue.addJob(
      QueueName.HISTORICAL_DATA_IMPORT,
      {
        importId,
        config,
      },
      {
        attempts: 1, // Don't auto-retry the entire import
        timeout: 3600000, // 1 hour timeout
      }
    );

    // Start processing
    this.processImport(importId, config);

    return importId;
  }

  /**
   * Process historical import with resume capability
   */
  async processImport(importId: string, config: ImportConfig) {
    const progress = this.importProgress.get(importId)!;
    progress.status = ImportStatus.RUNNING;
    await this.saveProgress(progress);

    try {
      // Get ESPN credentials
      const cookieManager = getCookieManager();
      const credentials = await cookieManager.getCookies(config.userId, config.leagueId);
      
      if (!credentials) {
        throw new Error('No ESPN credentials found for user/league');
      }

      // Process each season
      for (let season = config.startYear; season <= config.endYear; season++) {
        const checkpoint = progress.checkpoints.find(c => c.season === season);
        
        if (checkpoint?.status === 'completed') {
          console.log(`Season ${season} already imported, skipping`);
          continue;
        }

        console.log(`Importing season ${season}`);
        progress.currentSeason = season;
        
        // Emit progress update
        await this.emitProgress(progress);
        
        try {
          await this.importSeason(
            config.espnLeagueId,
            season,
            credentials,
            checkpoint!,
            config.leagueId
          );
          
          checkpoint!.status = 'completed';
          checkpoint!.completedAt = new Date();
          progress.completedSeasons++;
          
        } catch (error: any) {
          console.error(`Failed to import season ${season}:`, error);
          checkpoint!.status = 'failed';
          checkpoint!.error = error.message;
          progress.errors.push({
            season,
            error: error.message,
            timestamp: new Date(),
          });
          
          // Continue with next season despite error
        }

        await this.saveProgress(progress);
        
        // Add delay between seasons to respect rate limits
        await this.delay(2000);
      }

      progress.status = ImportStatus.COMPLETED;
      progress.completedAt = new Date();
      await this.saveProgress(progress);
      
      // Update sync metadata
      await this.updateSyncMetadata(config.leagueId);
      
      console.log(`Import completed for ${importId}`);
      await this.emitProgress(progress);
      
    } catch (error: any) {
      console.error(`Import failed for ${importId}:`, error);
      progress.status = ImportStatus.FAILED;
      await this.saveProgress(progress);
      await this.emitProgress(progress);
      throw error;
    }
  }

  /**
   * Import a single season's data
   */
  private async importSeason(
    espnLeagueId: number,
    season: number,
    credentials: { swid: string; espnS2: string },
    checkpoint: SeasonCheckpoint,
    leagueId: string
  ) {
    checkpoint.status = 'fetching';
    
    // Create ESPN client for this season
    const client = new ESPNClient({
      leagueId: espnLeagueId,
      seasonId: season,
      cookies: credentials,
    });

    // Fetch season data
    console.log(`Fetching data for season ${season}`);
    
    // 1. Fetch league settings and teams
    const leagueData = await client.getLeague();
    await this.delay(1000); // Rate limiting
    
    // 2. Fetch all matchups for the season
    const matchups = await this.fetchAllMatchups(client, leagueData);
    checkpoint.matchupsImported = matchups.length;
    await this.delay(1000);
    
    // 3. Fetch all players who played that season
    const players = await this.fetchSeasonPlayers(client, leagueData);
    checkpoint.playersImported = players.length;
    await this.delay(1000);
    
    // 4. Fetch transactions
    const transactions = await this.fetchSeasonTransactions(client);
    checkpoint.transactionsImported = transactions.length;
    
    checkpoint.status = 'processing';
    
    // Store in database
    await this.storeSeasonData(
      leagueId,
      season,
      {
        league: leagueData,
        matchups,
        players,
        transactions,
      }
    );
  }

  /**
   * Fetch all matchups for a season
   */
  private async fetchAllMatchups(
    client: ESPNClient,
    leagueData: any
  ): Promise<any[]> {
    const matchups = [];
    const totalWeeks = leagueData.settings?.scheduleSettings?.matchupPeriodCount || 17;
    
    for (let week = 1; week <= totalWeeks; week++) {
      try {
        const weekData = await client.getScoreboard(week);
        matchups.push(...(weekData.schedule || []));
        await this.delay(500); // Rate limiting between weeks
      } catch (error: any) {
        console.error(`Failed to fetch week ${week}:`, error);
      }
    }
    
    return matchups;
  }

  /**
   * Fetch all players who participated in the season
   */
  private async fetchSeasonPlayers(
    client: ESPNClient,
    leagueData: any
  ): Promise<any[]> {
    const allPlayers = new Map();
    
    // Extract players from all teams
    leagueData.teams?.forEach((team: any) => {
      team.roster?.entries?.forEach((entry: any) => {
        const player = entry.playerPoolEntry?.player;
        if (player && !allPlayers.has(player.id)) {
          allPlayers.set(player.id, player);
        }
      });
    });
    
    return Array.from(allPlayers.values());
  }

  /**
   * Fetch all transactions for a season
   */
  private async fetchSeasonTransactions(client: ESPNClient): Promise<any[]> {
    const allTransactions = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const transactions = await client.getTransactions(offset, limit);
        allTransactions.push(...transactions);
        
        hasMore = transactions.length === limit;
        offset += limit;
        
        await this.delay(500); // Rate limiting
      } catch (error: any) {
        console.error(`Failed to fetch transactions at offset ${offset}:`, error);
        hasMore = false;
      }
    }
    
    return allTransactions;
  }

  /**
   * Store season data in database
   */
  private async storeSeasonData(
    leagueId: string,
    season: number,
    data: {
      league: any;
      matchups: any[];
      players: any[];
      transactions: any[];
    }
  ) {
    // Generate hash for deduplication
    const dataHash = this.generateDataHash(data);
    
    // Check if data already exists
    const existing = await prisma.leagueHistoricalData.findUnique({
      where: {
        leagueId_season_dataType: {
          leagueId,
          season,
          dataType: 'full_season',
        },
      },
    });

    if (existing && existing.dataHash === dataHash) {
      console.log(`Season ${season} data unchanged, skipping storage`);
      return;
    }

    // Store in database using transaction
    await prisma.$transaction(async (tx) => {
      // Store historical data
      await tx.leagueHistoricalData.upsert({
        where: {
          leagueId_season_dataType: {
            leagueId,
            season,
            dataType: 'full_season',
          },
        },
        update: {
          data: JSON.stringify(data),
          dataHash,
          recordCount: data.matchups.length + data.players.length + data.transactions.length,
          importedAt: new Date(),
        },
        create: {
          leagueId,
          season,
          dataType: 'full_season',
          data: JSON.stringify(data),
          dataHash,
          recordCount: data.matchups.length + data.players.length + data.transactions.length,
        },
      });

      // Transform and store matchups
      const transformedMatchups = this.transformer.transformMatchups(data.matchups);
      for (const matchup of transformedMatchups) {
        await tx.leagueMatchup.upsert({
          where: {
            leagueId_week_homeTeamId_awayTeamId: {
              leagueId,
              week: matchup.week,
              homeTeamId: matchup.homeTeamId,
              awayTeamId: matchup.awayTeamId,
            },
          },
          update: matchup,
          create: {
            ...matchup,
            leagueId,
          },
        });
      }

      // Store player stats
      for (const player of data.players) {
        if (player.stats) {
          await tx.leaguePlayerStats.upsert({
            where: {
              leagueId_playerId_season_week: {
                leagueId,
                playerId: player.id,
                season,
                week: null,
              },
            },
            update: {
              points: player.stats.appliedTotal || 0,
              projectedPoints: player.stats.projectedTotal || 0,
              stats: player.stats,
            },
            create: {
              leagueId,
              playerId: player.id,
              season,
              points: player.stats.appliedTotal || 0,
              projectedPoints: player.stats.projectedTotal || 0,
              stats: player.stats,
            },
          });
        }
      }

      // Store transactions
      for (const transaction of data.transactions) {
        await tx.leagueTransaction.upsert({
          where: {
            leagueId_transactionId_season: {
              leagueId,
              transactionId: transaction.id,
              season,
            },
          },
          update: {
            type: transaction.type,
            status: transaction.status,
            teamId: transaction.teamId,
            bidAmount: transaction.bidAmount,
            transactionDate: new Date(transaction.proposedDate),
            metadata: transaction,
          },
          create: {
            leagueId,
            transactionId: transaction.id,
            season,
            type: transaction.type,
            status: transaction.status,
            teamId: transaction.teamId,
            bidAmount: transaction.bidAmount,
            transactionDate: new Date(transaction.proposedDate),
            metadata: transaction,
          },
        });
      }
    });

    console.log(`Stored data for season ${season}`);
  }

  /**
   * Save progress to database
   */
  private async saveProgress(progress: ImportProgress) {
    await prisma.importCheckpoint.upsert({
      where: {
        importId: progress.id,
      },
      update: {
        processedItems: progress.completedSeasons,
        totalItems: progress.totalSeasons,
        currentSeason: progress.currentSeason,
        status: progress.status,
        metadata: {
          checkpoints: progress.checkpoints,
          errors: progress.errors,
        },
      },
      create: {
        importId: progress.id,
        leagueId: progress.leagueId,
        processedItems: progress.completedSeasons,
        totalItems: progress.totalSeasons,
        currentSeason: progress.currentSeason,
        status: progress.status,
        metadata: {
          checkpoints: progress.checkpoints,
          errors: progress.errors,
        },
      },
    });
  }

  /**
   * Resume import from checkpoint
   */
  async resumeImport(importId: string): Promise<ImportProgress | null> {
    const checkpoint = await prisma.importCheckpoint.findFirst({
      where: { importId },
      orderBy: { createdAt: 'desc' },
    });

    if (!checkpoint) {
      return null;
    }

    const progress: ImportProgress = {
      id: importId,
      leagueId: checkpoint.leagueId,
      totalSeasons: checkpoint.totalItems,
      completedSeasons: checkpoint.processedItems,
      currentSeason: checkpoint.currentSeason || undefined,
      status: checkpoint.status,
      startedAt: checkpoint.createdAt,
      errors: (checkpoint.metadata as any).errors || [],
      checkpoints: (checkpoint.metadata as any).checkpoints || [],
    };

    this.importProgress.set(importId, progress);
    return progress;
  }

  /**
   * Get import progress
   */
  getProgress(importId: string): ImportProgress | undefined {
    return this.importProgress.get(importId);
  }

  /**
   * Cancel import
   */
  async cancelImport(importId: string): Promise<void> {
    const progress = this.importProgress.get(importId);
    if (progress) {
      progress.status = ImportStatus.PAUSED;
      await this.saveProgress(progress);
      this.importProgress.delete(importId);
    }
  }

  /**
   * Initialize checkpoints for each season
   */
  private initializeCheckpoints(startYear: number, endYear: number): SeasonCheckpoint[] {
    const checkpoints = [];
    for (let year = startYear; year <= endYear; year++) {
      checkpoints.push({
        season: year,
        status: 'pending' as const,
        matchupsImported: 0,
        playersImported: 0,
        transactionsImported: 0,
      });
    }
    return checkpoints;
  }

  /**
   * Generate hash for data deduplication
   */
  private generateDataHash(data: any): string {
    const normalized = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Update sync metadata after import
   */
  private async updateSyncMetadata(leagueId: string) {
    const stats = await prisma.leagueHistoricalData.aggregate({
      where: { leagueId },
      _count: { season: true },
      _sum: { recordCount: true },
    });

    await prisma.syncMetadata.upsert({
      where: { leagueId },
      update: {
        lastSyncedAt: new Date(),
        totalSeasons: stats._count.season,
        totalMatchups: stats._sum.recordCount || 0,
      },
      create: {
        leagueId,
        lastSyncedAt: new Date(),
        totalSeasons: stats._count.season,
        totalMatchups: stats._sum.recordCount || 0,
      },
    });
  }

  /**
   * Emit progress update via WebSocket
   */
  private async emitProgress(progress: ImportProgress) {
    const percentage = Math.round((progress.completedSeasons / progress.totalSeasons) * 100);
    
    await this.wsServer.emitToLeague(progress.leagueId, 'import:progress', {
      importId: progress.id,
      percentage,
      currentSeason: progress.currentSeason,
      completedSeasons: progress.completedSeasons,
      totalSeasons: progress.totalSeasons,
      status: progress.status,
      checkpoints: progress.checkpoints,
      errors: progress.errors,
    });
  }

  /**
   * Delay helper for rate limiting
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const historicalImportManager = new HistoricalImportManager();