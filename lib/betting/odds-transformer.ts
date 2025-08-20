/**
 * Odds Data Transformer
 * 
 * Transforms odds data between different formats:
 * - API format to database format
 * - Database format to client format
 * - Calculations for implied probability, vig, etc.
 */

import { prisma } from '../prisma';
import { 
  BettingLine, 
  MarketType, 
  OddsSnapshot,
  OddsMovement as PrismaOddsMovement 
} from '@prisma/client';
import {
  OddsApiResponse,
  GameOdds,
  Bookmaker,
  Market,
  ProcessedBookmaker,
  MoneylineOdds,
  SpreadOdds,
  TotalOdds,
  OddsMovement,
  MovementEntry,
  GameMovementSummary,
  americanToImpliedProbability,
  calculateVig,
  BettingError,
  BettingErrorCode
} from '@/types/betting';

export class OddsTransformer {
  /**
   * Transform API response to database betting lines
   */
  async apiToDatabase(
    apiResponse: OddsApiResponse[]
  ): Promise<{ bettingLines: any[], movements: any[] }> {
    const bettingLines: any[] = [];
    const movements: any[] = [];
    const processedGames = new Set<string>();

    for (const game of apiResponse) {
      // Skip if already processed
      if (processedGames.has(game.id)) continue;
      processedGames.add(game.id);

      for (const bookmaker of game.bookmakers) {
        for (const market of bookmaker.markets) {
          const marketType = this.mapMarketType(market.key);
          
          // Process each outcome
          for (const outcome of market.outcomes) {
            const existingLine = await this.findExistingLine(
              game.id,
              bookmaker.key,
              marketType,
              outcome.name
            );

            const bettingLine = {
              gameId: game.id,
              bookmaker: bookmaker.key,
              marketType,
              team: outcome.name === 'Over' || outcome.name === 'Under' ? null : outcome.name,
              lineValue: outcome.point || null,
              oddsValue: Math.round(outcome.price),
              isHome: outcome.name === game.home_team,
              impliedProb: americanToImpliedProbability(outcome.price),
              lastUpdate: new Date(bookmaker.last_update || Date.now())
            };

            bettingLines.push(bettingLine);

            // Track movement if line exists
            if (existingLine) {
              const movement = await this.trackMovement(existingLine, bettingLine);
              if (movement) {
                movements.push(movement);
              }
            }
          }
        }
      }
    }

    return { bettingLines, movements };
  }

  /**
   * Transform database records to GameOdds format
   */
  async databaseToGameOdds(
    bettingLines: BettingLine[],
    snapshots?: OddsSnapshot[]
  ): Promise<GameOdds[]> {
    const gamesMap = new Map<string, GameOdds>();

    for (const line of bettingLines) {
      if (!gamesMap.has(line.gameId)) {
        // Get game info from snapshot if available
        const snapshot = snapshots?.find(s => s.gameId === line.gameId);
        const gameData = snapshot?.data as any;

        gamesMap.set(line.gameId, {
          gameId: line.gameId,
          sport: snapshot?.sport || 'NFL',
          homeTeam: gameData?.home_team || '',
          awayTeam: gameData?.away_team || '',
          commenceTime: snapshot?.commenceTime || new Date(),
          bookmakers: [],
          lastUpdate: line.lastUpdate
        });
      }

      const game = gamesMap.get(line.gameId)!;
      
      // Find or create bookmaker
      let bookmaker = game.bookmakers.find(b => b.key === line.bookmaker);
      if (!bookmaker) {
        bookmaker = {
          key: line.bookmaker,
          name: this.formatBookmakerName(line.bookmaker),
          lastUpdate: line.lastUpdate
        } as ProcessedBookmaker;
        game.bookmakers.push(bookmaker);
      }

      // Add line data to appropriate market
      this.addLineToBookmaker(bookmaker, line);
    }

    // Calculate best lines for each game
    for (const game of gamesMap.values()) {
      this.calculateBestLines(game);
    }

    return Array.from(gamesMap.values());
  }

  /**
   * Calculate movement summary for a game
   */
  async calculateMovementSummary(
    gameId: string,
    movements: PrismaOddsMovement[]
  ): Promise<GameMovementSummary> {
    // Get game info
    const snapshot = await prisma.oddsSnapshot.findFirst({
      where: { gameId },
      orderBy: { createdAt: 'desc' }
    });

    const gameData = snapshot?.data as any;

    const summary: GameMovementSummary = {
      gameId,
      homeTeam: gameData?.home_team || '',
      awayTeam: gameData?.away_team || '',
      commenceTime: snapshot?.commenceTime || new Date(),
      lineMovements: {
        spread: {
          home: 0,
          away: 0,
          direction: 'unchanged'
        },
        total: {
          movement: 0,
          direction: 'unchanged'
        },
        moneyline: {
          home: 0,
          away: 0,
          direction: 'unchanged'
        }
      }
    };

    // Calculate movements for each market type
    for (const movement of movements) {
      switch (movement.marketType) {
        case MarketType.SPREADS:
          if (movement.team === summary.homeTeam) {
            summary.lineMovements.spread.home = movement.lineMovement?.toNumber() || 0;
          } else {
            summary.lineMovements.spread.away = movement.lineMovement?.toNumber() || 0;
          }
          break;
        
        case MarketType.TOTALS:
          summary.lineMovements.total.movement = movement.lineMovement?.toNumber() || 0;
          summary.lineMovements.total.direction = 
            movement.lineMovement?.toNumber() || 0 > 0 ? 'over' : 'under';
          break;
        
        case MarketType.H2H:
          if (movement.team === summary.homeTeam) {
            summary.lineMovements.moneyline.home = movement.oddsMovement || 0;
          } else {
            summary.lineMovements.moneyline.away = movement.oddsMovement || 0;
          }
          break;
      }
    }

    // Determine overall direction
    summary.lineMovements.spread.direction = this.determineDirection(
      summary.lineMovements.spread.home,
      summary.lineMovements.spread.away
    );
    
    summary.lineMovements.moneyline.direction = this.determineDirection(
      summary.lineMovements.moneyline.home,
      summary.lineMovements.moneyline.away
    );

    return summary;
  }

  /**
   * Store betting lines in database
   */
  async storeBettingLines(lines: any[]): Promise<void> {
    for (const line of lines) {
      await prisma.bettingLine.upsert({
        where: {
          gameId_bookmaker_marketType_team: {
            gameId: line.gameId,
            bookmaker: line.bookmaker,
            marketType: line.marketType,
            team: line.team || ''
          }
        },
        update: {
          lineValue: line.lineValue,
          oddsValue: line.oddsValue,
          impliedProb: line.impliedProb,
          lastUpdate: line.lastUpdate
        },
        create: line
      });
    }
  }

  /**
   * Store odds movements in database
   */
  async storeMovements(movements: any[]): Promise<void> {
    for (const movement of movements) {
      await prisma.oddsMovement.upsert({
        where: {
          gameId_bookmaker_marketType_team: {
            gameId: movement.gameId,
            bookmaker: movement.bookmaker,
            marketType: movement.marketType,
            team: movement.team || ''
          }
        },
        update: {
          currentLine: movement.currentLine,
          currentOdds: movement.currentOdds,
          lineMovement: movement.lineMovement,
          oddsMovement: movement.oddsMovement,
          movementCount: { increment: 1 },
          lastMovement: new Date()
        },
        create: movement
      });
    }
  }

  /**
   * Map API market type to database enum
   */
  private mapMarketType(apiKey: string): MarketType {
    switch (apiKey) {
      case 'h2h':
        return MarketType.H2H;
      case 'spreads':
        return MarketType.SPREADS;
      case 'totals':
        return MarketType.TOTALS;
      default:
        throw new BettingError(
          `Unknown market type: ${apiKey}`,
          BettingErrorCode.TRANSFORMATION_ERROR
        );
    }
  }

  /**
   * Find existing betting line
   */
  private async findExistingLine(
    gameId: string,
    bookmaker: string,
    marketType: MarketType,
    team: string
  ): Promise<BettingLine | null> {
    return await prisma.bettingLine.findUnique({
      where: {
        gameId_bookmaker_marketType_team: {
          gameId,
          bookmaker,
          marketType,
          team: team || ''
        }
      }
    });
  }

  /**
   * Track movement between old and new line
   */
  private async trackMovement(
    existingLine: BettingLine,
    newLine: any
  ): Promise<any | null> {
    const lineMovement = newLine.lineValue && existingLine.lineValue
      ? newLine.lineValue - existingLine.lineValue.toNumber()
      : null;
    
    const oddsMovement = newLine.oddsValue && existingLine.oddsValue
      ? newLine.oddsValue - existingLine.oddsValue
      : null;

    // Only track if there's actual movement
    if (!lineMovement && !oddsMovement) return null;

    // Get existing movement record
    const existingMovement = await prisma.oddsMovement.findUnique({
      where: {
        gameId_bookmaker_marketType_team: {
          gameId: existingLine.gameId,
          bookmaker: existingLine.bookmaker,
          marketType: existingLine.marketType,
          team: existingLine.team || ''
        }
      }
    });

    return {
      gameId: existingLine.gameId,
      bookmaker: existingLine.bookmaker,
      marketType: existingLine.marketType,
      team: existingLine.team,
      openingLine: existingMovement?.openingLine || existingLine.lineValue,
      openingOdds: existingMovement?.openingOdds || existingLine.oddsValue,
      currentLine: newLine.lineValue,
      currentOdds: newLine.oddsValue,
      lineMovement,
      oddsMovement
    };
  }

  /**
   * Format bookmaker name for display
   */
  private formatBookmakerName(key: string): string {
    const names: Record<string, string> = {
      draftkings: 'DraftKings',
      fanduel: 'FanDuel',
      betmgm: 'BetMGM',
      caesars: 'Caesars',
      pointsbetus: 'PointsBet'
    };
    return names[key] || key;
  }

  /**
   * Add line data to bookmaker object
   */
  private addLineToBookmaker(bookmaker: ProcessedBookmaker, line: BettingLine): void {
    switch (line.marketType) {
      case MarketType.H2H:
        if (!bookmaker.moneyline) {
          bookmaker.moneyline = { home: 0, away: 0 };
        }
        if (line.isHome) {
          bookmaker.moneyline.home = line.oddsValue || 0;
        } else {
          bookmaker.moneyline.away = line.oddsValue || 0;
        }
        break;
      
      case MarketType.SPREADS:
        if (!bookmaker.spread) {
          bookmaker.spread = {
            home: { line: 0, odds: 0 },
            away: { line: 0, odds: 0 }
          };
        }
        if (line.isHome) {
          bookmaker.spread.home = {
            line: line.lineValue?.toNumber() || 0,
            odds: line.oddsValue || 0
          };
        } else {
          bookmaker.spread.away = {
            line: line.lineValue?.toNumber() || 0,
            odds: line.oddsValue || 0
          };
        }
        break;
      
      case MarketType.TOTALS:
        if (!bookmaker.total) {
          bookmaker.total = { line: 0, over: 0, under: 0 };
        }
        bookmaker.total.line = line.lineValue?.toNumber() || 0;
        if (line.team === null || line.team === 'Over') {
          bookmaker.total.over = line.oddsValue || 0;
        } else {
          bookmaker.total.under = line.oddsValue || 0;
        }
        break;
    }
  }

  /**
   * Calculate best lines across all bookmakers
   */
  private calculateBestLines(game: GameOdds): void {
    let bestHomeMoneyline = -999999;
    let bestAwayMoneyline = -999999;
    let bestHomeSpread = { line: 0, odds: -999999 };
    let bestAwaySpread = { line: 0, odds: -999999 };
    let bestOver = -999999;
    let bestUnder = -999999;
    let totalLine = 0;

    for (const bookmaker of game.bookmakers) {
      // Moneyline
      if (bookmaker.moneyline) {
        if (bookmaker.moneyline.home > bestHomeMoneyline) {
          bestHomeMoneyline = bookmaker.moneyline.home;
        }
        if (bookmaker.moneyline.away > bestAwayMoneyline) {
          bestAwayMoneyline = bookmaker.moneyline.away;
        }
      }

      // Spread
      if (bookmaker.spread) {
        if (bookmaker.spread.home.odds > bestHomeSpread.odds) {
          bestHomeSpread = bookmaker.spread.home;
        }
        if (bookmaker.spread.away.odds > bestAwaySpread.odds) {
          bestAwaySpread = bookmaker.spread.away;
        }
      }

      // Total
      if (bookmaker.total) {
        totalLine = bookmaker.total.line;
        if (bookmaker.total.over > bestOver) {
          bestOver = bookmaker.total.over;
        }
        if (bookmaker.total.under > bestUnder) {
          bestUnder = bookmaker.total.under;
        }
      }
    }

    // Set best lines if found
    if (bestHomeMoneyline > -999999) {
      game.moneyline = {
        home: {
          odds: bestHomeMoneyline,
          impliedProbability: americanToImpliedProbability(bestHomeMoneyline)
        },
        away: {
          odds: bestAwayMoneyline,
          impliedProbability: americanToImpliedProbability(bestAwayMoneyline)
        }
      };
    }

    if (bestHomeSpread.odds > -999999) {
      game.spread = {
        home: {
          line: bestHomeSpread.line,
          odds: bestHomeSpread.odds,
          impliedProbability: americanToImpliedProbability(bestHomeSpread.odds)
        },
        away: {
          line: bestAwaySpread.line,
          odds: bestAwaySpread.odds,
          impliedProbability: americanToImpliedProbability(bestAwaySpread.odds)
        }
      };
    }

    if (bestOver > -999999) {
      game.total = {
        line: totalLine,
        over: {
          odds: bestOver,
          impliedProbability: americanToImpliedProbability(bestOver)
        },
        under: {
          odds: bestUnder,
          impliedProbability: americanToImpliedProbability(bestUnder)
        }
      };
    }
  }

  /**
   * Determine movement direction
   */
  private determineDirection(home: number, away: number): 'home' | 'away' | 'unchanged' {
    if (Math.abs(home) > Math.abs(away)) return 'home';
    if (Math.abs(away) > Math.abs(home)) return 'away';
    return 'unchanged';
  }

  /**
   * Calculate juice/vig for a market
   */
  calculateMarketVig(odds1: number, odds2: number): number {
    return calculateVig(odds1, odds2);
  }

  /**
   * Find value bets (positive expected value)
   */
  findValueBets(games: GameOdds[], threshold: number = 0.05): any[] {
    const valueBets: any[] = [];

    for (const game of games) {
      // Check moneyline
      if (game.moneyline) {
        const totalProb = game.moneyline.home.impliedProbability + 
                         game.moneyline.away.impliedProbability;
        const vig = totalProb - 1;
        
        if (vig < threshold) {
          valueBets.push({
            gameId: game.gameId,
            type: 'moneyline',
            team: 'both',
            vig,
            value: threshold - vig
          });
        }
      }

      // Check spreads and totals similarly...
    }

    return valueBets;
  }
}