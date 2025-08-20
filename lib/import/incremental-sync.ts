import { prisma } from '@/lib/prisma';
import { historicalImportManager } from './historical-import';
import { ESPNClient } from '@/lib/espn/client';
import { getCookieManager } from '@/lib/crypto/cookie-manager';

export interface SyncRequirements {
  seasons: number[];
  currentSeasonWeeks: number[];
  lastSyncedAt?: Date;
  totalMissingRecords: number;
}

export interface IncrementalSyncOptions {
  forceRefresh?: boolean;
  maxSeasons?: number;
  includeCurrentSeason?: boolean;
}

export class IncrementalSyncManager {
  /**
   * Determine what needs to be synced
   */
  async getSyncRequirements(
    leagueId: string,
    espnLeagueId: number,
    options: IncrementalSyncOptions = {}
  ): Promise<SyncRequirements> {
    // Get last sync metadata
    const lastSync = await prisma.syncMetadata.findUnique({
      where: { leagueId },
    });
    
    // Get current season and week
    const currentYear = new Date().getFullYear();
    const currentWeek = this.getCurrentNFLWeek();
    
    // Determine missing seasons
    const existingSeasons = await prisma.leagueHistoricalData.findMany({
      where: { leagueId },
      select: { season: true },
      distinct: ['season'],
    });
    
    const existingSeasonNumbers = new Set(existingSeasons.map(s => s.season));
    const missingSeasons: number[] = [];
    
    // Check last 10 years by default (or specified max)
    const maxSeasons = options.maxSeasons || 10;
    const startYear = currentYear - maxSeasons + 1;
    
    for (let year = startYear; year < currentYear; year++) {
      if (!existingSeasonNumbers.has(year) || options.forceRefresh) {
        missingSeasons.push(year);
      }
    }
    
    // Determine missing weeks for current season
    const missingWeeks: number[] = [];
    if (options.includeCurrentSeason !== false) {
      const currentSeasonData = await prisma.leagueMatchup.findMany({
        where: {
          leagueId,
          // Assuming current season matchups are stored with the League's season field
          league: {
            season: currentYear,
          },
        },
        select: { week: true },
        distinct: ['week'],
      });
      
      const existingWeeks = new Set(currentSeasonData.map(m => m.week));
      
      for (let week = 1; week <= currentWeek; week++) {
        if (!existingWeeks.has(week)) {
          missingWeeks.push(week);
        }
      }
    }
    
    // Calculate total missing records estimate
    const totalMissingRecords = 
      missingSeasons.length * 200 + // Estimate 200 records per season
      missingWeeks.length * 20; // Estimate 20 records per week
    
    return {
      seasons: missingSeasons,
      currentSeasonWeeks: missingWeeks,
      lastSyncedAt: lastSync?.lastSyncedAt,
      totalMissingRecords,
    };
  }

  /**
   * Perform incremental sync
   */
  async syncIncremental(
    leagueId: string,
    espnLeagueId: number,
    userId: string,
    requirements: SyncRequirements
  ): Promise<void> {
    console.log(`Starting incremental sync for league ${leagueId}`);
    console.log(`Missing seasons: ${requirements.seasons.length}`);
    console.log(`Missing weeks: ${requirements.currentSeasonWeeks.length}`);
    
    // Sync missing historical seasons
    if (requirements.seasons.length > 0) {
      const startYear = Math.min(...requirements.seasons);
      const endYear = Math.max(...requirements.seasons);
      
      await historicalImportManager.startImport({
        leagueId,
        espnLeagueId,
        startYear,
        endYear,
        userId,
      });
    }
    
    // Sync missing weeks from current season
    if (requirements.currentSeasonWeeks.length > 0) {
      await this.syncCurrentSeasonWeeks(
        leagueId,
        espnLeagueId,
        userId,
        requirements.currentSeasonWeeks
      );
    }
    
    // Update sync metadata
    await this.updateSyncMetadata(leagueId);
  }

  /**
   * Sync specific weeks from current season
   */
  private async syncCurrentSeasonWeeks(
    leagueId: string,
    espnLeagueId: number,
    userId: string,
    weeks: number[]
  ): Promise<void> {
    const cookieManager = getCookieManager();
    const credentials = await cookieManager.getCookies(userId, leagueId);
    
    if (!credentials) {
      throw new Error('No ESPN credentials found');
    }
    
    const currentYear = new Date().getFullYear();
    const client = new ESPNClient({
      leagueId: espnLeagueId,
      seasonId: currentYear,
      cookies: credentials,
    });
    
    for (const week of weeks) {
      try {
        console.log(`Syncing week ${week} of current season`);
        
        // Fetch week data
        const weekData = await client.getScoreboard(week);
        
        // Store in database
        await this.storeWeekData(leagueId, currentYear, week, weekData);
        
        // Rate limiting
        await this.delay(1000);
      } catch (error: any) {
        console.error(`Failed to sync week ${week}:`, error);
      }
    }
  }

  /**
   * Store week data in database
   */
  private async storeWeekData(
    leagueId: string,
    season: number,
    week: number,
    data: any
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Store matchups
      for (const matchup of data.schedule || []) {
        if (matchup.home && matchup.away) {
          // Find or create team records
          const homeTeam = await tx.leagueTeam.findFirst({
            where: {
              leagueId,
              espnTeamId: matchup.home.teamId,
            },
          });
          
          const awayTeam = await tx.leagueTeam.findFirst({
            where: {
              leagueId,
              espnTeamId: matchup.away.teamId,
            },
          });
          
          if (homeTeam && awayTeam) {
            await tx.leagueMatchup.upsert({
              where: {
                leagueId_week_homeTeamId_awayTeamId: {
                  leagueId,
                  week,
                  homeTeamId: homeTeam.id,
                  awayTeamId: awayTeam.id,
                },
              },
              update: {
                homeScore: matchup.home.totalPoints,
                awayScore: matchup.away.totalPoints,
                isComplete: matchup.winner !== 'UNDECIDED',
                matchupPeriod: matchup.matchupPeriodId,
              },
              create: {
                leagueId,
                week,
                matchupPeriod: matchup.matchupPeriodId,
                homeTeamId: homeTeam.id,
                awayTeamId: awayTeam.id,
                homeScore: matchup.home.totalPoints,
                awayScore: matchup.away.totalPoints,
                isComplete: matchup.winner !== 'UNDECIDED',
                isPlayoffs: matchup.playoffTierType === 'WINNERS_BRACKET',
              },
            });
          }
        }
      }
    });
  }

  /**
   * Get current NFL week
   */
  private getCurrentNFLWeek(): number {
    const seasonStart = new Date('2024-09-05'); // NFL season start
    const now = new Date();
    const diff = now.getTime() - seasonStart.getTime();
    const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
    return Math.min(Math.max(1, weeks + 1), 18); // NFL regular season is 18 weeks
  }

  /**
   * Update sync metadata
   */
  private async updateSyncMetadata(leagueId: string): Promise<void> {
    const stats = await prisma.$transaction(async (tx) => {
      const seasonCount = await tx.leagueHistoricalData.count({
        where: { leagueId },
        distinct: ['season'],
      });
      
      const matchupCount = await tx.leagueMatchup.count({
        where: { leagueId },
      });
      
      const playerCount = await tx.leaguePlayer.count({
        where: { leagueId },
      });
      
      return { seasonCount, matchupCount, playerCount };
    });
    
    await prisma.syncMetadata.upsert({
      where: { leagueId },
      update: {
        lastSyncedAt: new Date(),
        lastSyncedWeek: this.getCurrentNFLWeek(),
        lastSyncedSeason: new Date().getFullYear(),
        totalSeasons: stats.seasonCount,
        totalMatchups: stats.matchupCount,
        totalPlayers: stats.playerCount,
      },
      create: {
        leagueId,
        lastSyncedAt: new Date(),
        lastSyncedWeek: this.getCurrentNFLWeek(),
        lastSyncedSeason: new Date().getFullYear(),
        totalSeasons: stats.seasonCount,
        totalMatchups: stats.matchupCount,
        totalPlayers: stats.playerCount,
      },
    });
  }

  /**
   * Check if sync is needed
   */
  async isSyncNeeded(leagueId: string): Promise<boolean> {
    const metadata = await prisma.syncMetadata.findUnique({
      where: { leagueId },
    });
    
    if (!metadata) {
      return true; // Never synced
    }
    
    const hoursSinceLastSync = 
      (Date.now() - metadata.lastSyncedAt.getTime()) / (1000 * 60 * 60);
    
    // Sync if:
    // - Never synced
    // - Last sync was more than 24 hours ago
    // - Current week is newer than last synced week
    const currentWeek = this.getCurrentNFLWeek();
    
    return (
      hoursSinceLastSync > 24 ||
      (metadata.lastSyncedWeek && metadata.lastSyncedWeek < currentWeek)
    );
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(leagueId: string): Promise<{
    totalSeasons: number;
    totalMatchups: number;
    totalPlayers: number;
    totalTransactions: number;
    oldestSeason?: number;
    newestSeason?: number;
    lastSyncedAt?: Date;
    dataSize: number;
  }> {
    const metadata = await prisma.syncMetadata.findUnique({
      where: { leagueId },
    });
    
    const seasons = await prisma.leagueHistoricalData.findMany({
      where: { leagueId },
      select: { season: true },
      distinct: ['season'],
      orderBy: { season: 'asc' },
    });
    
    const transactionCount = await prisma.leagueTransaction.count({
      where: { leagueId },
    });
    
    // Calculate approximate data size
    const historicalData = await prisma.leagueHistoricalData.findMany({
      where: { leagueId },
      select: { data: true },
    });
    
    const dataSize = historicalData.reduce((total, record) => {
      return total + JSON.stringify(record.data).length;
    }, 0);
    
    return {
      totalSeasons: metadata?.totalSeasons || 0,
      totalMatchups: metadata?.totalMatchups || 0,
      totalPlayers: metadata?.totalPlayers || 0,
      totalTransactions: transactionCount,
      oldestSeason: seasons[0]?.season,
      newestSeason: seasons[seasons.length - 1]?.season,
      lastSyncedAt: metadata?.lastSyncedAt,
      dataSize,
    };
  }

  /**
   * Clear all historical data for a league
   */
  async clearHistoricalData(leagueId: string): Promise<void> {
    await prisma.$transaction([
      prisma.leagueHistoricalData.deleteMany({ where: { leagueId } }),
      prisma.leagueTransaction.deleteMany({ where: { leagueId } }),
      prisma.leaguePlayerStats.deleteMany({ where: { leagueId } }),
      prisma.leagueArchive.deleteMany({ where: { leagueId } }),
      prisma.importCheckpoint.deleteMany({ where: { leagueId } }),
      prisma.syncMetadata.deleteMany({ where: { leagueId } }),
    ]);
    
    console.log(`Cleared all historical data for league ${leagueId}`);
  }

  /**
   * Delay helper
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const incrementalSyncManager = new IncrementalSyncManager();