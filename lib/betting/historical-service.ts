/**
 * Historical Odds Service
 * 
 * Manages storage and retrieval of historical odds data with:
 * - Efficient querying of past odds
 * - Trend analysis over time
 * - Data aggregation and compression
 * - Archival strategies for old data
 */

import { prisma } from '../prisma';
import { 
  OddsSnapshot, 
  BettingLine, 
  OddsMovement,
  MarketType 
} from '@prisma/client';
import {
  HistoricalOddsRequest,
  GameOdds,
  OddsMovement as OddsMovementType,
  GameMovementSummary,
  BettingError,
  BettingErrorCode
} from '@/types/betting';
import { OddsTransformer } from './odds-transformer';

export class HistoricalOddsService {
  private transformer: OddsTransformer;

  constructor() {
    this.transformer = new OddsTransformer();
  }

  /**
   * Store historical snapshot
   */
  async storeSnapshot(
    gameId: string,
    sport: string,
    data: any,
    metadata?: {
      homeTeam?: string;
      awayTeam?: string;
      commenceTime?: Date;
    }
  ): Promise<OddsSnapshot> {
    try {
      return await prisma.oddsSnapshot.create({
        data: {
          gameId,
          sport,
          homeTeam: metadata?.homeTeam,
          awayTeam: metadata?.awayTeam,
          commenceTime: metadata?.commenceTime,
          data
        }
      });
    } catch (error) {
      throw new BettingError(
        'Failed to store historical snapshot',
        BettingErrorCode.CACHE_ERROR,
        500,
        error
      );
    }
  }

  /**
   * Get historical odds for a specific game
   */
  async getGameHistory(
    gameId: string,
    options?: {
      limit?: number;
      offset?: number;
      from?: Date;
      to?: Date;
    }
  ): Promise<{
    snapshots: OddsSnapshot[];
    movements: OddsMovement[];
    summary: GameMovementSummary;
  }> {
    // Get snapshots
    const snapshots = await prisma.oddsSnapshot.findMany({
      where: {
        gameId,
        ...(options?.from && { createdAt: { gte: options.from } }),
        ...(options?.to && { createdAt: { lte: options.to } })
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 100,
      skip: options?.offset || 0
    });

    // Get movements
    const movements = await prisma.oddsMovement.findMany({
      where: { gameId },
      orderBy: { lastMovement: 'desc' }
    });

    // Calculate summary
    const summary = await this.transformer.calculateMovementSummary(gameId, movements);

    return { snapshots, movements, summary };
  }

  /**
   * Get historical odds for multiple games
   */
  async getHistoricalOdds(
    request: HistoricalOddsRequest
  ): Promise<{
    data: any[];
    total: number;
    hasMore: boolean;
  }> {
    const where: any = {
      ...(request.gameId && { gameId: request.gameId }),
      ...(request.sport && { sport: request.sport }),
      createdAt: {
        gte: request.dateFrom,
        lte: request.dateTo
      }
    };

    const [data, total] = await Promise.all([
      prisma.oddsSnapshot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: request.limit || 100,
        skip: request.offset || 0
      }),
      prisma.oddsSnapshot.count({ where })
    ]);

    const hasMore = (request.offset || 0) + data.length < total;

    return { data, total, hasMore };
  }

  /**
   * Get line movement history for a specific game and market
   */
  async getLineMovementHistory(
    gameId: string,
    marketType?: MarketType,
    bookmaker?: string
  ): Promise<OddsMovementType[]> {
    const movements = await prisma.oddsMovement.findMany({
      where: {
        gameId,
        ...(marketType && { marketType }),
        ...(bookmaker && { bookmaker })
      },
      orderBy: { lastMovement: 'asc' }
    });

    // Transform to client format
    return movements.map(m => ({
      gameId: m.gameId,
      bookmaker: m.bookmaker,
      marketType: m.marketType,
      team: m.team,
      opening: {
        line: m.openingLine?.toNumber(),
        odds: m.openingOdds || 0,
        timestamp: m.createdAt
      },
      current: {
        line: m.currentLine?.toNumber(),
        odds: m.currentOdds || 0,
        timestamp: m.lastMovement
      },
      movements: [], // Would need to track individual movements
      totalMovement: {
        line: m.lineMovement?.toNumber(),
        odds: m.oddsMovement || 0
      }
    }));
  }

  /**
   * Get opening lines for a game
   */
  async getOpeningLines(gameId: string): Promise<any> {
    const movements = await prisma.oddsMovement.findMany({
      where: { gameId }
    });

    const openingLines: any = {
      gameId,
      spreads: {},
      totals: {},
      moneyline: {}
    };

    for (const movement of movements) {
      const opening = {
        bookmaker: movement.bookmaker,
        line: movement.openingLine?.toNumber(),
        odds: movement.openingOdds,
        timestamp: movement.createdAt
      };

      switch (movement.marketType) {
        case MarketType.SPREADS:
          if (!openingLines.spreads[movement.bookmaker]) {
            openingLines.spreads[movement.bookmaker] = {};
          }
          openingLines.spreads[movement.bookmaker][movement.team || 'unknown'] = opening;
          break;
        
        case MarketType.TOTALS:
          openingLines.totals[movement.bookmaker] = opening;
          break;
        
        case MarketType.H2H:
          if (!openingLines.moneyline[movement.bookmaker]) {
            openingLines.moneyline[movement.bookmaker] = {};
          }
          openingLines.moneyline[movement.bookmaker][movement.team || 'unknown'] = opening;
          break;
      }
    }

    return openingLines;
  }

  /**
   * Get closing lines for a game (most recent)
   */
  async getClosingLines(gameId: string): Promise<any> {
    const currentLines = await prisma.bettingLine.findMany({
      where: { gameId },
      orderBy: { lastUpdate: 'desc' }
    });

    const closingLines: any = {
      gameId,
      spreads: {},
      totals: {},
      moneyline: {}
    };

    for (const line of currentLines) {
      const closing = {
        bookmaker: line.bookmaker,
        line: line.lineValue?.toNumber(),
        odds: line.oddsValue,
        impliedProb: line.impliedProb?.toNumber(),
        timestamp: line.lastUpdate
      };

      switch (line.marketType) {
        case MarketType.SPREADS:
          if (!closingLines.spreads[line.bookmaker]) {
            closingLines.spreads[line.bookmaker] = {};
          }
          closingLines.spreads[line.bookmaker][line.team || 'unknown'] = closing;
          break;
        
        case MarketType.TOTALS:
          closingLines.totals[line.bookmaker] = closing;
          break;
        
        case MarketType.H2H:
          if (!closingLines.moneyline[line.bookmaker]) {
            closingLines.moneyline[line.bookmaker] = {};
          }
          closingLines.moneyline[line.bookmaker][line.team || 'unknown'] = closing;
          break;
      }
    }

    return closingLines;
  }

  /**
   * Analyze betting trends over time
   */
  async analyzeTrends(
    sport: string,
    dateFrom: Date,
    dateTo: Date,
    options?: {
      groupBy?: 'day' | 'week' | 'month';
      marketType?: MarketType;
    }
  ): Promise<any> {
    const snapshots = await prisma.oddsSnapshot.findMany({
      where: {
        sport,
        createdAt: {
          gte: dateFrom,
          lte: dateTo
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Group by time period
    const grouped = this.groupByTimePeriod(snapshots, options?.groupBy || 'day');
    
    // Calculate trends
    const trends: any[] = [];
    for (const [period, data] of Object.entries(grouped)) {
      const avgOdds = this.calculateAverageOdds(data as OddsSnapshot[]);
      trends.push({
        period,
        dataPoints: (data as any[]).length,
        averageOdds: avgOdds,
        timestamp: new Date(period)
      });
    }

    return trends;
  }

  /**
   * Archive old odds data
   */
  async archiveOldData(olderThan: Date): Promise<{
    archived: number;
    deleted: number;
  }> {
    // Get old snapshots
    const oldSnapshots = await prisma.oddsSnapshot.findMany({
      where: {
        createdAt: { lt: olderThan }
      },
      take: 1000 // Process in batches
    });

    let archived = 0;
    let deleted = 0;

    for (const snapshot of oldSnapshots) {
      try {
        // Compress and store summary data
        const summary = this.createSummaryFromSnapshot(snapshot);
        
        // In a real implementation, you might store this in a separate archive table
        // or export to cold storage
        
        // Delete original
        await prisma.oddsSnapshot.delete({
          where: { id: snapshot.id }
        });
        
        archived++;
        deleted++;
      } catch (error) {
        console.error('Failed to archive snapshot:', error);
      }
    }

    // Also clean up old betting lines
    const deletedLines = await prisma.bettingLine.deleteMany({
      where: {
        createdAt: { lt: olderThan }
      }
    });

    deleted += deletedLines.count;

    return { archived, deleted };
  }

  /**
   * Get statistics about stored historical data
   */
  async getStorageStats(): Promise<{
    totalSnapshots: number;
    totalBettingLines: number;
    totalMovements: number;
    oldestSnapshot: Date | null;
    newestSnapshot: Date | null;
    storageByDay: any[];
  }> {
    const [
      totalSnapshots,
      totalBettingLines,
      totalMovements,
      oldestSnapshot,
      newestSnapshot
    ] = await Promise.all([
      prisma.oddsSnapshot.count(),
      prisma.bettingLine.count(),
      prisma.oddsMovement.count(),
      prisma.oddsSnapshot.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      }),
      prisma.oddsSnapshot.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      })
    ]);

    // Get storage by day for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyStats = await prisma.$queryRaw<any[]>`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        pg_size_pretty(SUM(pg_column_size(data))) as size
      FROM odds_snapshots
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    return {
      totalSnapshots,
      totalBettingLines,
      totalMovements,
      oldestSnapshot: oldestSnapshot?.createdAt || null,
      newestSnapshot: newestSnapshot?.createdAt || null,
      storageByDay: dailyStats
    };
  }

  /**
   * Group snapshots by time period
   */
  private groupByTimePeriod(
    snapshots: OddsSnapshot[],
    period: 'day' | 'week' | 'month'
  ): Record<string, OddsSnapshot[]> {
    const grouped: Record<string, OddsSnapshot[]> = {};

    for (const snapshot of snapshots) {
      const key = this.getTimePeriodKey(snapshot.createdAt, period);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(snapshot);
    }

    return grouped;
  }

  /**
   * Get time period key for grouping
   */
  private getTimePeriodKey(date: Date, period: 'day' | 'week' | 'month'): string {
    const d = new Date(date);
    
    switch (period) {
      case 'day':
        return d.toISOString().split('T')[0];
      
      case 'week':
        const week = Math.floor(d.getDate() / 7);
        return `${d.getFullYear()}-W${week}`;
      
      case 'month':
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      
      default:
        return d.toISOString();
    }
  }

  /**
   * Calculate average odds from snapshots
   */
  private calculateAverageOdds(snapshots: OddsSnapshot[]): any {
    // This would parse the JSON data and calculate averages
    // Simplified for now
    return {
      games: snapshots.length,
      timestamp: snapshots[0]?.createdAt
    };
  }

  /**
   * Create summary from snapshot for archival
   */
  private createSummaryFromSnapshot(snapshot: OddsSnapshot): any {
    const data = snapshot.data as any;
    
    return {
      gameId: snapshot.gameId,
      sport: snapshot.sport,
      teams: {
        home: snapshot.homeTeam,
        away: snapshot.awayTeam
      },
      commenceTime: snapshot.commenceTime,
      createdAt: snapshot.createdAt,
      bookmakerCount: data.bookmakers?.length || 0,
      // Add more summary fields as needed
    };
  }

  /**
   * Find games with significant line movement
   */
  async findSignificantMovements(
    threshold: number = 2.5,
    sport: string = 'NFL'
  ): Promise<any[]> {
    const movements = await prisma.oddsMovement.findMany({
      where: {
        OR: [
          { lineMovement: { gte: threshold } },
          { lineMovement: { lte: -threshold } },
          { oddsMovement: { gte: 20 } },
          { oddsMovement: { lte: -20 } }
        ]
      },
      orderBy: { lastMovement: 'desc' },
      take: 50
    });

    // Get game details for each movement
    const gameIds = [...new Set(movements.map(m => m.gameId))];
    const snapshots = await prisma.oddsSnapshot.findMany({
      where: {
        gameId: { in: gameIds },
        sport
      },
      distinct: ['gameId'],
      orderBy: { createdAt: 'desc' }
    });

    const snapshotMap = new Map(snapshots.map(s => [s.gameId, s]));

    return movements.map(movement => {
      const snapshot = snapshotMap.get(movement.gameId);
      const gameData = snapshot?.data as any;
      
      return {
        gameId: movement.gameId,
        homeTeam: gameData?.home_team,
        awayTeam: gameData?.away_team,
        bookmaker: movement.bookmaker,
        marketType: movement.marketType,
        team: movement.team,
        lineMovement: movement.lineMovement?.toNumber(),
        oddsMovement: movement.oddsMovement,
        movementCount: movement.movementCount,
        lastMovement: movement.lastMovement
      };
    });
  }
}