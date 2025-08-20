/**
 * Odds Movement Tracker
 * 
 * Tracks and analyzes line movements with:
 * - Real-time movement detection
 * - Steam move identification
 * - Reverse line movement detection
 * - Public betting percentage estimation
 * - Sharp money indicators
 */

import { prisma } from '../prisma';
import { 
  OddsMovement as PrismaOddsMovement,
  BettingLine,
  MarketType 
} from '@prisma/client';
import {
  OddsMovement,
  MovementEntry,
  GameMovementSummary,
  isSignificantMovement,
  BettingError,
  BettingErrorCode
} from '@/types/betting';
import { getRedis } from '../redis';
import { EventEmitter } from 'events';

export interface MovementAlert {
  type: 'steam' | 'reverse' | 'significant' | 'sharp';
  gameId: string;
  marketType: MarketType;
  bookmaker?: string;
  details: {
    previousLine?: number;
    currentLine?: number;
    previousOdds?: number;
    currentOdds?: number;
    direction: 'home' | 'away' | 'over' | 'under';
    magnitude: number;
    timestamp: Date;
  };
}

export class MovementTracker extends EventEmitter {
  private redis;
  private trackingInterval: NodeJS.Timer | null = null;
  private trackedGames: Set<string> = new Set();

  constructor() {
    super();
    this.redis = getRedis();
  }

  /**
   * Start tracking movements for a game
   */
  async startTracking(gameId: string, intervalMs: number = 60000): Promise<void> {
    this.trackedGames.add(gameId);
    
    if (!this.trackingInterval) {
      this.trackingInterval = setInterval(() => {
        this.checkAllTrackedGames();
      }, intervalMs);
    }

    // Do initial check
    await this.checkMovement(gameId);
  }

  /**
   * Stop tracking movements for a game
   */
  stopTracking(gameId: string): void {
    this.trackedGames.delete(gameId);
    
    if (this.trackedGames.size === 0 && this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  /**
   * Stop all tracking
   */
  stopAllTracking(): void {
    this.trackedGames.clear();
    
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  /**
   * Check all tracked games for movements
   */
  private async checkAllTrackedGames(): Promise<void> {
    for (const gameId of this.trackedGames) {
      try {
        await this.checkMovement(gameId);
      } catch (error) {
        console.error(`Error checking movement for game ${gameId}:`, error);
      }
    }
  }

  /**
   * Check for line movement on a specific game
   */
  async checkMovement(gameId: string): Promise<MovementAlert[]> {
    const alerts: MovementAlert[] = [];

    // Get current lines
    const currentLines = await prisma.bettingLine.findMany({
      where: { gameId },
      orderBy: { lastUpdate: 'desc' }
    });

    // Get previous movements
    const movements = await prisma.oddsMovement.findMany({
      where: { gameId }
    });

    // Group lines by market and bookmaker
    const linesByMarket = this.groupLinesByMarket(currentLines);

    for (const [key, lines] of linesByMarket.entries()) {
      const [marketType, bookmaker] = key.split(':');
      const movement = movements.find(
        m => m.marketType === marketType && m.bookmaker === bookmaker
      );

      if (movement) {
        // Check for significant movement
        const alert = await this.analyzeMovement(
          lines,
          movement,
          marketType as MarketType
        );
        
        if (alert) {
          alerts.push(alert);
          this.emit('movement', alert);
        }
      }

      // Store/update movement
      await this.updateMovement(lines, movement);
    }

    // Check for steam moves (multiple books moving same direction)
    const steamAlert = this.detectSteamMove(currentLines, movements);
    if (steamAlert) {
      alerts.push(steamAlert);
      this.emit('steam', steamAlert);
    }

    // Check for reverse line movement
    const reverseAlert = await this.detectReverseLineMovement(gameId, currentLines);
    if (reverseAlert) {
      alerts.push(reverseAlert);
      this.emit('reverse', reverseAlert);
    }

    return alerts;
  }

  /**
   * Analyze movement and determine if alert needed
   */
  private async analyzeMovement(
    lines: BettingLine[],
    previousMovement: PrismaOddsMovement,
    marketType: MarketType
  ): Promise<MovementAlert | null> {
    // Get the most recent line
    const currentLine = lines[0];
    if (!currentLine) return null;

    const lineMovement = currentLine.lineValue && previousMovement.currentLine
      ? currentLine.lineValue.toNumber() - previousMovement.currentLine.toNumber()
      : 0;

    const oddsMovement = currentLine.oddsValue && previousMovement.currentOdds
      ? currentLine.oddsValue - previousMovement.currentOdds
      : 0;

    // Check if movement is significant
    const significantLine = Math.abs(lineMovement) >= 1; // 1 point for spreads/totals
    const significantOdds = Math.abs(oddsMovement) >= 15; // 15 cents in odds

    if (!significantLine && !significantOdds) return null;

    // Determine direction
    let direction: 'home' | 'away' | 'over' | 'under';
    if (marketType === MarketType.TOTALS) {
      direction = lineMovement > 0 ? 'over' : 'under';
    } else {
      direction = currentLine.isHome ? 'home' : 'away';
    }

    return {
      type: 'significant',
      gameId: currentLine.gameId,
      marketType: marketType as MarketType,
      bookmaker: currentLine.bookmaker,
      details: {
        previousLine: previousMovement.currentLine?.toNumber(),
        currentLine: currentLine.lineValue?.toNumber(),
        previousOdds: previousMovement.currentOdds || undefined,
        currentOdds: currentLine.oddsValue || undefined,
        direction,
        magnitude: Math.abs(lineMovement || oddsMovement),
        timestamp: new Date()
      }
    };
  }

  /**
   * Detect steam moves (synchronized movement across books)
   */
  private detectSteamMove(
    currentLines: BettingLine[],
    movements: PrismaOddsMovement[]
  ): MovementAlert | null {
    // Group by market type
    const marketGroups = new Map<MarketType, BettingLine[]>();
    
    for (const line of currentLines) {
      if (!marketGroups.has(line.marketType)) {
        marketGroups.set(line.marketType, []);
      }
      marketGroups.get(line.marketType)!.push(line);
    }

    // Check each market for synchronized movement
    for (const [marketType, lines] of marketGroups.entries()) {
      const bookmakers = new Set(lines.map(l => l.bookmaker));
      if (bookmakers.size < 3) continue; // Need at least 3 books

      // Get movements for this market
      const marketMovements = movements.filter(m => m.marketType === marketType);
      
      // Count books moving in same direction
      let upCount = 0;
      let downCount = 0;
      let totalMovement = 0;

      for (const movement of marketMovements) {
        const lineMove = movement.lineMovement?.toNumber() || 0;
        const oddsMove = movement.oddsMovement || 0;
        
        if (lineMove > 0 || oddsMove > 10) {
          upCount++;
          totalMovement += Math.abs(lineMove || oddsMove);
        } else if (lineMove < 0 || oddsMove < -10) {
          downCount++;
          totalMovement += Math.abs(lineMove || oddsMove);
        }
      }

      // Steam move if 70%+ books move same direction
      const threshold = bookmakers.size * 0.7;
      if (upCount >= threshold || downCount >= threshold) {
        const direction = upCount > downCount ? 
          (marketType === MarketType.TOTALS ? 'over' : 'home') :
          (marketType === MarketType.TOTALS ? 'under' : 'away');

        return {
          type: 'steam',
          gameId: lines[0].gameId,
          marketType,
          details: {
            direction: direction as any,
            magnitude: totalMovement / marketMovements.length,
            timestamp: new Date()
          }
        };
      }
    }

    return null;
  }

  /**
   * Detect reverse line movement (line moves against public betting)
   */
  private async detectReverseLineMovement(
    gameId: string,
    currentLines: BettingLine[]
  ): Promise<MovementAlert | null> {
    // Get public betting percentages (would come from another source)
    // For now, we'll estimate based on odds movement
    
    const spreadLines = currentLines.filter(l => l.marketType === MarketType.SPREADS);
    if (spreadLines.length < 2) return null;

    // Get movements
    const movements = await prisma.oddsMovement.findMany({
      where: {
        gameId,
        marketType: MarketType.SPREADS
      }
    });

    // Simple heuristic: if line moves one way but odds move the other way
    // it might indicate reverse line movement (sharp money vs public)
    for (const movement of movements) {
      const lineMove = movement.lineMovement?.toNumber() || 0;
      const oddsMove = movement.oddsMovement || 0;

      // Line gets worse but odds get better = reverse movement
      if ((lineMove > 0 && oddsMove > 0) || (lineMove < 0 && oddsMove < 0)) {
        return {
          type: 'reverse',
          gameId,
          marketType: MarketType.SPREADS,
          bookmaker: movement.bookmaker,
          details: {
            previousLine: movement.openingLine?.toNumber(),
            currentLine: movement.currentLine?.toNumber(),
            previousOdds: movement.openingOdds || undefined,
            currentOdds: movement.currentOdds || undefined,
            direction: lineMove > 0 ? 'home' : 'away',
            magnitude: Math.abs(lineMove),
            timestamp: new Date()
          }
        };
      }
    }

    return null;
  }

  /**
   * Update movement record in database
   */
  private async updateMovement(
    lines: BettingLine[],
    existingMovement: PrismaOddsMovement | undefined
  ): Promise<void> {
    const currentLine = lines[0];
    if (!currentLine) return;

    const data: any = {
      gameId: currentLine.gameId,
      bookmaker: currentLine.bookmaker,
      marketType: currentLine.marketType,
      team: currentLine.team,
      currentLine: currentLine.lineValue,
      currentOdds: currentLine.oddsValue,
      lastMovement: new Date()
    };

    if (!existingMovement) {
      // Create new movement record
      data.openingLine = currentLine.lineValue;
      data.openingOdds = currentLine.oddsValue;
      data.lineMovement = 0;
      data.oddsMovement = 0;
      data.movementCount = 0;

      await prisma.oddsMovement.create({ data });
    } else {
      // Update existing
      const lineMovement = currentLine.lineValue && existingMovement.currentLine
        ? currentLine.lineValue.toNumber() - existingMovement.currentLine.toNumber()
        : 0;

      const oddsMovement = currentLine.oddsValue && existingMovement.currentOdds
        ? currentLine.oddsValue - existingMovement.currentOdds
        : 0;

      if (lineMovement !== 0 || oddsMovement !== 0) {
        await prisma.oddsMovement.update({
          where: {
            gameId_bookmaker_marketType_team: {
              gameId: currentLine.gameId,
              bookmaker: currentLine.bookmaker,
              marketType: currentLine.marketType,
              team: currentLine.team || ''
            }
          },
          data: {
            currentLine: currentLine.lineValue,
            currentOdds: currentLine.oddsValue,
            lineMovement: existingMovement.openingLine && currentLine.lineValue
              ? currentLine.lineValue.toNumber() - existingMovement.openingLine.toNumber()
              : 0,
            oddsMovement: existingMovement.openingOdds && currentLine.oddsValue
              ? currentLine.oddsValue - existingMovement.openingOdds
              : 0,
            movementCount: { increment: 1 },
            lastMovement: new Date()
          }
        });
      }
    }
  }

  /**
   * Group lines by market and bookmaker
   */
  private groupLinesByMarket(lines: BettingLine[]): Map<string, BettingLine[]> {
    const grouped = new Map<string, BettingLine[]>();

    for (const line of lines) {
      const key = `${line.marketType}:${line.bookmaker}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(line);
    }

    return grouped;
  }

  /**
   * Get movement history for a game
   */
  async getMovementHistory(
    gameId: string,
    marketType?: MarketType
  ): Promise<OddsMovement[]> {
    const movements = await prisma.oddsMovement.findMany({
      where: {
        gameId,
        ...(marketType && { marketType })
      },
      orderBy: { lastMovement: 'desc' }
    });

    return movements.map(m => this.formatMovement(m));
  }

  /**
   * Format movement for client
   */
  private formatMovement(movement: PrismaOddsMovement): OddsMovement {
    return {
      gameId: movement.gameId,
      bookmaker: movement.bookmaker,
      marketType: movement.marketType,
      team: movement.team,
      opening: {
        line: movement.openingLine?.toNumber(),
        odds: movement.openingOdds || 0,
        timestamp: movement.createdAt
      },
      current: {
        line: movement.currentLine?.toNumber(),
        odds: movement.currentOdds || 0,
        timestamp: movement.lastMovement
      },
      movements: [], // Would need separate tracking for individual movements
      totalMovement: {
        line: movement.lineMovement?.toNumber(),
        odds: movement.oddsMovement || 0
      }
    };
  }

  /**
   * Find sharp action indicators
   */
  async findSharpAction(gameId: string): Promise<any> {
    // Sharp action indicators:
    // 1. Reverse line movement
    // 2. Steam moves
    // 3. Line moves with better odds
    // 4. Early week line movement

    const movements = await prisma.oddsMovement.findMany({
      where: { gameId },
      orderBy: { movementCount: 'desc' }
    });

    const indicators: any[] = [];

    for (const movement of movements) {
      // Large movement with few updates = sharp action
      if (movement.movementCount < 3 && Math.abs(movement.lineMovement?.toNumber() || 0) > 1) {
        indicators.push({
          type: 'sharp',
          bookmaker: movement.bookmaker,
          marketType: movement.marketType,
          evidence: 'Large movement with few updates',
          confidence: 0.8
        });
      }

      // Line moves but odds improve = sharp action
      if (movement.lineMovement && movement.oddsMovement) {
        const lineMove = movement.lineMovement.toNumber();
        const oddsMove = movement.oddsMovement;
        
        if ((lineMove > 0 && oddsMove > 0) || (lineMove < 0 && oddsMove > 0)) {
          indicators.push({
            type: 'sharp',
            bookmaker: movement.bookmaker,
            marketType: movement.marketType,
            evidence: 'Line moves with improving odds',
            confidence: 0.7
          });
        }
      }
    }

    return {
      gameId,
      sharpIndicators: indicators,
      confidence: indicators.length > 0 ? 
        indicators.reduce((sum, i) => sum + i.confidence, 0) / indicators.length : 0
    };
  }

  /**
   * Subscribe to movement alerts via Redis pub/sub
   */
  async subscribeToAlerts(callback: (alert: MovementAlert) => void): Promise<void> {
    const subscriber = getRedis();
    await subscriber.subscribe('odds:movements');
    
    subscriber.on('message', (channel, message) => {
      if (channel === 'odds:movements') {
        const alert = JSON.parse(message) as MovementAlert;
        callback(alert);
      }
    });
  }

  /**
   * Publish movement alert
   */
  private async publishAlert(alert: MovementAlert): Promise<void> {
    await this.redis.publish('odds:movements', JSON.stringify(alert));
  }
}