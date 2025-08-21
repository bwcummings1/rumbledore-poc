/**
 * Competition Queue Processor
 * 
 * Handles background jobs for competition-related tasks:
 * - Leaderboard updates
 * - Achievement checking
 * - Competition status transitions
 * - Reward distribution
 */

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { LeaderboardService } from '@/lib/betting/leaderboard-service';
import { AchievementSystem } from '@/lib/betting/achievement-system';
import { CompetitionManager } from '@/lib/betting/competition-manager';
import { RewardDistributor } from '@/lib/betting/reward-distributor';
import { logger } from '@/lib/logger';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const leaderboardService = new LeaderboardService(prisma);
const achievementSystem = new AchievementSystem(prisma);
const competitionManager = new CompetitionManager(prisma);
const rewardDistributor = new RewardDistributor(prisma);

export interface CompetitionJobData {
  type: 'UPDATE_LEADERBOARD' | 'CHECK_ACHIEVEMENTS' | 'TRANSITION_STATUS' | 'DISTRIBUTE_REWARDS' | 'SYNC_ALL';
  competitionId?: string;
  userId?: string;
  leagueId?: string;
  force?: boolean;
}

/**
 * Main processor for competition queue jobs
 */
export async function processCompetitionJob(job: Job<CompetitionJobData>) {
  const { type, competitionId, userId, leagueId, force } = job.data;
  const startTime = Date.now();

  try {
    logger.info(`Processing competition job: ${type}`, {
      jobId: job.id,
      competitionId,
      userId,
      leagueId,
    });

    switch (type) {
      case 'UPDATE_LEADERBOARD':
        await processLeaderboardUpdate(competitionId!, force);
        break;

      case 'CHECK_ACHIEVEMENTS':
        await processAchievementCheck(userId!, leagueId);
        break;

      case 'TRANSITION_STATUS':
        await processStatusTransition(competitionId!);
        break;

      case 'DISTRIBUTE_REWARDS':
        await processRewardDistribution(competitionId!);
        break;

      case 'SYNC_ALL':
        await processSyncAll(leagueId);
        break;

      default:
        throw new Error(`Unknown job type: ${type}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`Competition job completed: ${type}`, {
      jobId: job.id,
      duration,
      competitionId,
    });

    return {
      success: true,
      type,
      duration,
      timestamp: new Date(),
    };
  } catch (error: any) {
    logger.error(`Competition job failed: ${type}`, {
      jobId: job.id,
      error: error.message,
      competitionId,
    });

    throw error;
  }
}

/**
 * Update competition leaderboard
 */
async function processLeaderboardUpdate(competitionId: string, force = false) {
  try {
    // Check cache first if not forcing
    if (!force) {
      const cacheKey = `leaderboard:${competitionId}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        const parsedCache = JSON.parse(cached);
        const cacheAge = Date.now() - new Date(parsedCache.lastCalculated).getTime();
        
        // Skip if cache is less than 1 minute old
        if (cacheAge < 60000) {
          logger.info('Skipping leaderboard update - cache is fresh', {
            competitionId,
            cacheAge,
          });
          return;
        }
      }
    }

    // Update the leaderboard
    const leaderboard = await leaderboardService.updateLeaderboard(competitionId);

    // Cache the results
    const cacheKey = `leaderboard:${competitionId}`;
    await redis.setex(
      cacheKey,
      300, // 5 minute TTL
      JSON.stringify(leaderboard)
    );

    // Check for position changes and trigger notifications
    if (leaderboard.standings.length > 0) {
      const significantMoves = leaderboard.standings.filter(
        entry => Math.abs(entry.previousRank - entry.rank) >= 3
      );

      if (significantMoves.length > 0) {
        // Emit WebSocket events for significant position changes
        await emitLeaderboardUpdate(competitionId, significantMoves);
      }
    }

    logger.info('Leaderboard updated', {
      competitionId,
      entryCount: leaderboard.standings.length,
      version: leaderboard.version,
    });
  } catch (error: any) {
    logger.error('Failed to update leaderboard', {
      competitionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Check and unlock achievements for a user
 */
async function processAchievementCheck(userId: string, leagueId?: string) {
  try {
    const newAchievements = await achievementSystem.checkAchievements(userId, leagueId);

    if (newAchievements.length > 0) {
      logger.info('New achievements unlocked', {
        userId,
        leagueId,
        count: newAchievements.length,
        achievements: newAchievements.map(a => a.name),
      });

      // Emit WebSocket events for new achievements
      await emitAchievementUnlocked(userId, newAchievements);
    }
  } catch (error: any) {
    logger.error('Failed to check achievements', {
      userId,
      leagueId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Handle competition status transitions
 */
async function processStatusTransition(competitionId: string) {
  try {
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new Error('Competition not found');
    }

    const now = new Date();
    let newStatus = competition.status;
    let statusChanged = false;

    // Check for status transitions
    if (competition.status === 'PENDING' && now >= competition.startDate) {
      newStatus = 'ACTIVE';
      statusChanged = true;
    } else if (competition.status === 'ACTIVE' && now >= competition.endDate) {
      newStatus = 'SETTLING';
      statusChanged = true;
    }

    if (statusChanged) {
      await competitionManager.updateCompetitionStatus(competitionId, newStatus);

      logger.info('Competition status transitioned', {
        competitionId,
        oldStatus: competition.status,
        newStatus,
      });

      // If transitioning to SETTLING, trigger reward distribution
      if (newStatus === 'SETTLING') {
        await queueRewardDistribution(competitionId);
      }
    }
  } catch (error: any) {
    logger.error('Failed to transition competition status', {
      competitionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Distribute rewards for a completed competition
 */
async function processRewardDistribution(competitionId: string) {
  try {
    // Get final leaderboard
    const leaderboard = await leaderboardService.getLeaderboard(competitionId);
    
    if (!leaderboard || leaderboard.standings.length === 0) {
      logger.warn('No leaderboard data for reward distribution', { competitionId });
      return;
    }

    // Distribute rewards
    const rewards = await rewardDistributor.distributeRewards(
      competitionId,
      leaderboard.standings
    );

    // Update competition status to COMPLETED
    await competitionManager.updateCompetitionStatus(competitionId, 'COMPLETED');

    logger.info('Rewards distributed', {
      competitionId,
      rewardCount: rewards.length,
      totalDistributed: rewards.reduce((sum, r) => sum + r.amount, 0),
    });

    // Emit WebSocket events for reward distribution
    await emitRewardsDistributed(competitionId, rewards);
  } catch (error: any) {
    logger.error('Failed to distribute rewards', {
      competitionId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Sync all active competitions for a league
 */
async function processSyncAll(leagueId?: string) {
  try {
    const where: any = {
      status: { in: ['ACTIVE', 'SETTLING'] },
    };

    if (leagueId) {
      where.leagueId = leagueId;
    }

    const competitions = await prisma.competition.findMany({ where });

    logger.info('Syncing all active competitions', {
      leagueId,
      count: competitions.length,
    });

    // Queue leaderboard updates for all competitions
    for (const competition of competitions) {
      await queueLeaderboardUpdate(competition.id);
    }

    // Check for status transitions
    for (const competition of competitions) {
      await queueStatusTransition(competition.id);
    }
  } catch (error: any) {
    logger.error('Failed to sync all competitions', {
      leagueId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Queue helper functions
 */
async function queueLeaderboardUpdate(competitionId: string) {
  // This would normally add to Bull queue, but we're calling directly for now
  await processLeaderboardUpdate(competitionId, false);
}

async function queueStatusTransition(competitionId: string) {
  // This would normally add to Bull queue, but we're calling directly for now
  await processStatusTransition(competitionId);
}

async function queueRewardDistribution(competitionId: string) {
  // This would normally add to Bull queue, but we're calling directly for now
  await processRewardDistribution(competitionId);
}

/**
 * WebSocket event emitters (placeholders)
 */
async function emitLeaderboardUpdate(
  competitionId: string,
  significantMoves: any[]
) {
  // WebSocket implementation will be added in Task 14
  logger.info('WebSocket event: leaderboard-update', {
    competitionId,
    moveCount: significantMoves.length,
  });
}

async function emitAchievementUnlocked(
  userId: string,
  achievements: any[]
) {
  // WebSocket implementation will be added in Task 14
  logger.info('WebSocket event: achievement-unlocked', {
    userId,
    achievementCount: achievements.length,
  });
}

async function emitRewardsDistributed(
  competitionId: string,
  rewards: any[]
) {
  // WebSocket implementation will be added in Task 14
  logger.info('WebSocket event: rewards-distributed', {
    competitionId,
    rewardCount: rewards.length,
  });
}

export default processCompetitionJob;