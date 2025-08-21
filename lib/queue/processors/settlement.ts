/**
 * Settlement Queue Processor
 * 
 * Handles automated bet settlement jobs via Bull queue
 * Processes completed games and settles associated bets
 */

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { SettlementEngine } from '@/lib/betting/settlement-engine';
import { BankrollManager } from '@/lib/betting/bankroll-manager';
import { GameResult } from '@/types/betting';
import axios from 'axios';
import { redis } from '@/lib/redis';

export interface SettlementJobData {
  type: 'SETTLE_GAME' | 'SETTLE_ALL' | 'WEEKLY_RESET';
  gameId?: string;
  leagueId?: string;
  week?: number;
  season?: number;
}

export interface GameScoreData {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: 'completed' | 'cancelled' | 'postponed';
  completedAt: Date;
}

/**
 * Process settlement jobs
 */
export async function processSettlementJob(job: Job<SettlementJobData>) {
  const prisma = new PrismaClient();
  const bankrollManager = new BankrollManager(prisma);
  const settlementEngine = new SettlementEngine(prisma, bankrollManager);

  try {
    console.log(`Processing settlement job ${job.id}: ${job.data.type}`);

    switch (job.data.type) {
      case 'SETTLE_GAME':
        return await settleSpecificGame(job, settlementEngine);
      
      case 'SETTLE_ALL':
        return await settleAllPendingGames(job, settlementEngine);
      
      case 'WEEKLY_RESET':
        return await performWeeklyReset(job, bankrollManager);
      
      default:
        throw new Error(`Unknown settlement job type: ${job.data.type}`);
    }
  } catch (error) {
    console.error('Settlement job failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Settle a specific game
 */
async function settleSpecificGame(
  job: Job<SettlementJobData>,
  settlementEngine: SettlementEngine
) {
  if (!job.data.gameId) {
    throw new Error('Game ID required for SETTLE_GAME job');
  }

  // Fetch game result
  const gameResult = await fetchGameResult(job.data.gameId);
  if (!gameResult) {
    throw new Error(`Game result not found for ${job.data.gameId}`);
  }

  // Settle bets for this game
  const result = await settlementEngine.settleCompletedGames([gameResult]);
  
  console.log(`Settled ${result.settledCount} bets for game ${job.data.gameId}`);
  
  if (result.errors.length > 0) {
    console.error('Settlement errors:', result.errors);
  }

  // Update job progress
  await job.progress(100);

  return {
    success: true,
    settledCount: result.settledCount,
    errors: result.errors,
  };
}

/**
 * Settle all pending games
 */
async function settleAllPendingGames(
  job: Job<SettlementJobData>,
  settlementEngine: SettlementEngine
) {
  // Fetch all completed games with pending bets
  const completedGames = await fetchCompletedGamesWithPendingBets();
  
  if (completedGames.length === 0) {
    console.log('No completed games with pending bets found');
    return {
      success: true,
      settledCount: 0,
      gamesProcessed: 0,
    };
  }

  console.log(`Found ${completedGames.length} completed games to settle`);

  // Process games in batches
  const batchSize = 10;
  let totalSettled = 0;
  const allErrors: any[] = [];

  for (let i = 0; i < completedGames.length; i += batchSize) {
    const batch = completedGames.slice(i, i + batchSize);
    const result = await settlementEngine.settleCompletedGames(batch);
    
    totalSettled += result.settledCount;
    allErrors.push(...result.errors);

    // Update job progress
    const progress = Math.round(((i + batch.length) / completedGames.length) * 100);
    await job.progress(progress);
  }

  console.log(`Settlement complete: ${totalSettled} bets settled across ${completedGames.length} games`);

  if (allErrors.length > 0) {
    console.error(`${allErrors.length} settlement errors occurred`);
  }

  return {
    success: true,
    settledCount: totalSettled,
    gamesProcessed: completedGames.length,
    errors: allErrors,
  };
}

/**
 * Perform weekly bankroll reset
 */
async function performWeeklyReset(
  job: Job<SettlementJobData>,
  bankrollManager: BankrollManager
) {
  console.log('Performing weekly bankroll reset');

  // Mark previous week's bankrolls as completed
  const resetCount = await bankrollManager.resetWeeklyBankrolls();
  
  // Archive old bankrolls (older than 12 weeks)
  const archivedCount = await bankrollManager.archiveOldBankrolls();

  console.log(`Reset ${resetCount} bankrolls, archived ${archivedCount} old bankrolls`);

  await job.progress(100);

  return {
    success: true,
    resetCount,
    archivedCount,
  };
}

/**
 * Fetch game result from external source or database
 */
async function fetchGameResult(gameId: string): Promise<GameResult | null> {
  // Check cache first
  const cacheKey = `game:result:${gameId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  try {
    // In production, this would fetch from ESPN API or sports data provider
    // For now, we'll check if we have the data in our odds snapshots
    const prisma = new PrismaClient();
    const snapshot = await prisma.oddsSnapshot.findFirst({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
    });

    if (!snapshot) {
      return null;
    }

    // Parse the snapshot data for game result
    // This is simplified - in production you'd have a proper game results API
    const data = snapshot.data as any;
    
    // Mock implementation - in production, fetch real scores
    const gameResult: GameResult = {
      gameId,
      homeTeam: snapshot.homeTeam || data.home_team || '',
      awayTeam: snapshot.awayTeam || data.away_team || '',
      homeScore: 0, // Would be fetched from actual game data
      awayScore: 0, // Would be fetched from actual game data
      status: 'completed',
      completedAt: new Date(),
    };

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(gameResult));

    await prisma.$disconnect();
    return gameResult;
  } catch (error) {
    console.error('Error fetching game result:', error);
    return null;
  }
}

/**
 * Fetch all completed games that have pending bets
 */
async function fetchCompletedGamesWithPendingBets(): Promise<GameResult[]> {
  const prisma = new PrismaClient();
  
  try {
    // Get unique game IDs with pending bets
    const pendingBets = await prisma.bet.findMany({
      where: {
        status: { in: ['PENDING', 'LIVE'] },
        eventDate: { lt: new Date() }, // Game should have started
      },
      select: {
        gameId: true,
      },
      distinct: ['gameId'],
    });

    const gameIds = pendingBets.map(b => b.gameId);
    
    if (gameIds.length === 0) {
      return [];
    }

    // Fetch results for these games
    const gameResults: GameResult[] = [];
    
    for (const gameId of gameIds) {
      const result = await fetchGameResult(gameId);
      if (result && result.status === 'completed') {
        gameResults.push(result);
      }
    }

    return gameResults;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Schedule settlement for a specific game
 */
export function scheduleGameSettlement(gameId: string, delayMs = 300000) {
  // This would be called from the main queue manager
  // Schedules settlement 5 minutes after game completion
  return {
    name: 'settlement',
    data: {
      type: 'SETTLE_GAME',
      gameId,
    },
    opts: {
      delay: delayMs,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30000, // 30 seconds
      },
    },
  };
}

/**
 * Schedule daily settlement check
 */
export function scheduleDailySettlement() {
  return {
    name: 'settlement',
    data: {
      type: 'SETTLE_ALL',
    },
    opts: {
      repeat: {
        cron: '0 6 * * *', // Run at 6 AM daily
      },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute
      },
    },
  };
}

/**
 * Schedule weekly bankroll reset
 */
export function scheduleWeeklyReset() {
  return {
    name: 'settlement',
    data: {
      type: 'WEEKLY_RESET',
    },
    opts: {
      repeat: {
        cron: '0 3 * * 2', // Run at 3 AM every Tuesday (NFL week starts)
      },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute
      },
    },
  };
}