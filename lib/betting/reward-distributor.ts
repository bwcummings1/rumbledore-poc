/**
 * RewardDistributor - Manages competition rewards and prize distribution
 * 
 * This service handles:
 * - Prize pool distribution
 * - Bonus unit allocation
 * - Badge and title rewards
 * - Reward claiming and expiration
 * - Distribution strategies
 */

import { PrismaClient, RewardType, CompetitionStatus } from '@prisma/client';
import {
  CompetitionReward,
  RewardValue,
  LeaderboardEntry,
  calculateRewardDistribution,
} from '@/types/betting';
import { BankrollManager } from './bankroll-manager';
import { AchievementSystem } from './achievement-system';
import { EventEmitter } from 'events';

interface DistributionStrategy {
  name: string;
  calculateDistribution: (prizePool: number, participantCount: number) => RewardAllocation[];
}

interface RewardAllocation {
  placement: number;
  units?: number;
  badge?: string;
  title?: string;
  multiplier?: number;
}

export class RewardDistributor extends EventEmitter {
  private prisma: PrismaClient;
  private bankrollManager: BankrollManager;
  private achievementSystem: AchievementSystem;

  // Distribution strategies
  private strategies: Map<string, DistributionStrategy> = new Map([
    ['WINNER_TAKE_ALL', {
      name: 'Winner Take All',
      calculateDistribution: (prizePool, participantCount) => {
        if (participantCount === 0) return [];
        return [
          { placement: 1, units: prizePool, badge: '🏆 Champion' },
        ];
      },
    }],
    ['TOP_THREE', {
      name: 'Top Three',
      calculateDistribution: (prizePool, participantCount) => {
        if (participantCount === 0) return [];
        const allocations: RewardAllocation[] = [];
        
        if (participantCount >= 1) {
          allocations.push({
            placement: 1,
            units: Math.floor(prizePool * 0.5),
            badge: '🏆 Champion',
          });
        }
        if (participantCount >= 2) {
          allocations.push({
            placement: 2,
            units: Math.floor(prizePool * 0.3),
            badge: '🥈 Runner-up',
          });
        }
        if (participantCount >= 3) {
          allocations.push({
            placement: 3,
            units: Math.floor(prizePool * 0.2),
            badge: '🥉 Third Place',
          });
        }
        
        return allocations;
      },
    }],
    ['GRADUATED', {
      name: 'Graduated Payouts',
      calculateDistribution: (prizePool, participantCount) => {
        if (participantCount === 0) return [];
        
        const allocations: RewardAllocation[] = [];
        const payoutPercentages = [0.35, 0.25, 0.15, 0.1, 0.05, 0.05, 0.025, 0.025];
        const maxPayouts = Math.min(8, Math.floor(participantCount * 0.3));
        
        for (let i = 0; i < maxPayouts && i < payoutPercentages.length; i++) {
          allocations.push({
            placement: i + 1,
            units: Math.floor(prizePool * payoutPercentages[i]),
            badge: i === 0 ? '🏆 Champion' : 
                   i === 1 ? '🥈 Runner-up' : 
                   i === 2 ? '🥉 Third Place' : 
                   `🏅 Top ${i + 1}`,
          });
        }
        
        return allocations;
      },
    }],
  ]);

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.bankrollManager = new BankrollManager(prisma);
    this.achievementSystem = new AchievementSystem(prisma);
  }

  /**
   * Distribute rewards for a completed competition
   */
  async distributeRewards(
    competitionId: string,
    standings: LeaderboardEntry[]
  ): Promise<CompetitionReward[]> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) {
      throw new Error('Competition not found');
    }

    if (competition.status !== 'SETTLING') {
      throw new Error('Competition must be in SETTLING status to distribute rewards');
    }

    // Get distribution strategy (default to TOP_THREE)
    const strategyName = (competition.scoringRules as any)?.distributionStrategy || 'TOP_THREE';
    const strategy = this.strategies.get(strategyName) || this.strategies.get('TOP_THREE')!;

    // Calculate reward allocations
    const allocations = strategy.calculateDistribution(
      Number(competition.prizePool),
      standings.length
    );

    // Create reward records
    const rewards: CompetitionReward[] = [];
    
    for (const allocation of allocations) {
      const recipient = standings.find(s => s.rank === allocation.placement);
      if (!recipient) continue;

      const rewardValue: RewardValue = {};
      const rewardPromises = [];

      // Process unit rewards
      if (allocation.units && allocation.units > 0) {
        rewardValue.units = allocation.units;
        
        // Add units to user's bankroll
        const bankroll = await this.bankrollManager.getCurrentBankroll(
          recipient.userId,
          competition.leagueId!
        );
        
        if (bankroll) {
          await this.bankrollManager.updateBalance(
            bankroll.id,
            allocation.units,
            'credit'
          );
        }

        rewardPromises.push(
          this.createReward(
            competitionId,
            recipient.userId,
            allocation.placement,
            'UNITS',
            rewardValue
          )
        );
      }

      // Process badge rewards
      if (allocation.badge) {
        const badgeValue: RewardValue = {
          badgeName: allocation.badge,
          badgeIcon: this.getBadgeIcon(allocation.badge),
        };

        rewardPromises.push(
          this.createReward(
            competitionId,
            recipient.userId,
            allocation.placement,
            'BADGE',
            badgeValue
          )
        );

        // Also create an achievement
        await this.achievementSystem.awardSpecialAchievement(
          recipient.userId,
          allocation.badge,
          `Placed #${allocation.placement} in ${competition.name}`,
          this.getBadgeIcon(allocation.badge),
          competition.leagueId || undefined
        );
      }

      // Process title rewards
      if (allocation.title) {
        const titleValue: RewardValue = {
          title: allocation.title,
          duration: 30, // 30 days
        };

        rewardPromises.push(
          this.createReward(
            competitionId,
            recipient.userId,
            allocation.placement,
            'TITLE',
            titleValue
          )
        );
      }

      // Process multiplier rewards
      if (allocation.multiplier) {
        const multiplierValue: RewardValue = {
          multiplier: allocation.multiplier,
          duration: 7, // 7 days
        };

        rewardPromises.push(
          this.createReward(
            competitionId,
            recipient.userId,
            allocation.placement,
            'MULTIPLIER',
            multiplierValue
          )
        );
      }

      const createdRewards = await Promise.all(rewardPromises);
      rewards.push(...createdRewards);

      // Emit reward event
      this.emit('reward:distributed', {
        competitionId,
        userId: recipient.userId,
        placement: allocation.placement,
        rewards: rewardValue,
      });
    }

    // Update competition status to COMPLETED
    await this.prisma.competition.update({
      where: { id: competitionId },
      data: { status: 'COMPLETED' },
    });

    // Check for achievement unlocks
    await this.achievementSystem.checkCompetitionAchievements(
      competitionId,
      standings
    );

    return rewards;
  }

  /**
   * Claim a reward
   */
  async claimReward(rewardId: string, userId: string): Promise<void> {
    const reward = await this.prisma.competitionReward.findUnique({
      where: { id: rewardId },
    });

    if (!reward) {
      throw new Error('Reward not found');
    }

    if (reward.userId !== userId) {
      throw new Error('Unauthorized to claim this reward');
    }

    if (reward.claimedAt) {
      throw new Error('Reward already claimed');
    }

    if (reward.expiresAt && new Date() > reward.expiresAt) {
      throw new Error('Reward has expired');
    }

    // Mark as claimed
    await this.prisma.competitionReward.update({
      where: { id: rewardId },
      data: { claimedAt: new Date() },
    });

    this.emit('reward:claimed', {
      rewardId,
      userId,
      rewardType: reward.rewardType,
    });
  }

  /**
   * Get user's rewards
   */
  async getUserRewards(
    userId: string,
    includeExpired: boolean = false
  ): Promise<CompetitionReward[]> {
    const where: any = { userId };
    
    if (!includeExpired) {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gte: new Date() } },
      ];
    }

    const rewards = await this.prisma.competitionReward.findMany({
      where,
      include: {
        competition: {
          select: {
            name: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rewards.map(r => ({
      id: r.id,
      competitionId: r.competitionId,
      userId: r.userId,
      placement: r.placement,
      rewardType: r.rewardType,
      rewardValue: r.rewardValue as RewardValue,
      claimedAt: r.claimedAt || undefined,
      expiresAt: r.expiresAt || undefined,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Get unclaimed rewards for a user
   */
  async getUnclaimedRewards(userId: string): Promise<CompetitionReward[]> {
    const rewards = await this.prisma.competitionReward.findMany({
      where: {
        userId,
        claimedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return rewards.map(r => ({
      id: r.id,
      competitionId: r.competitionId,
      userId: r.userId,
      placement: r.placement,
      rewardType: r.rewardType,
      rewardValue: r.rewardValue as RewardValue,
      claimedAt: undefined,
      expiresAt: r.expiresAt || undefined,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Calculate total earnings for a user
   */
  async getUserTotalEarnings(userId: string): Promise<number> {
    const rewards = await this.prisma.competitionReward.findMany({
      where: {
        userId,
        rewardType: 'UNITS',
      },
    });

    return rewards.reduce((total, reward) => {
      const value = reward.rewardValue as any;
      return total + (value?.units || 0);
    }, 0);
  }

  /**
   * Process expired rewards
   */
  async processExpiredRewards(): Promise<void> {
    const expiredRewards = await this.prisma.competitionReward.findMany({
      where: {
        claimedAt: null,
        expiresAt: { lte: new Date() },
      },
    });

    for (const reward of expiredRewards) {
      // Could either delete or mark as expired
      await this.prisma.competitionReward.delete({
        where: { id: reward.id },
      });

      this.emit('reward:expired', {
        rewardId: reward.id,
        userId: reward.userId,
        rewardType: reward.rewardType,
      });
    }
  }

  /**
   * Create a reward record
   */
  private async createReward(
    competitionId: string,
    userId: string,
    placement: number,
    rewardType: RewardType,
    rewardValue: RewardValue
  ): Promise<CompetitionReward> {
    // Set expiration based on reward type
    let expiresAt: Date | null = null;
    
    if (rewardType === 'MULTIPLIER' || rewardType === 'TITLE') {
      const duration = rewardValue.duration || 7;
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + duration);
    }

    const reward = await this.prisma.competitionReward.create({
      data: {
        competitionId,
        userId,
        placement,
        rewardType,
        rewardValue: rewardValue as any,
        expiresAt,
      },
    });

    return {
      id: reward.id,
      competitionId: reward.competitionId,
      userId: reward.userId,
      placement: reward.placement,
      rewardType: reward.rewardType,
      rewardValue: reward.rewardValue as RewardValue,
      claimedAt: reward.claimedAt || undefined,
      expiresAt: reward.expiresAt || undefined,
      createdAt: reward.createdAt,
    };
  }

  /**
   * Get badge icon for a badge name
   */
  private getBadgeIcon(badgeName: string): string {
    const iconMap: Record<string, string> = {
      '🏆 Champion': '🏆',
      '🥈 Runner-up': '🥈',
      '🥉 Third Place': '🥉',
      '🏅 Top 5': '🏅',
      '🏅 Top 10': '🏅',
    };

    // Extract icon from badge name or use default
    const match = badgeName.match(/^([\u{1F300}-\u{1F9FF}])/u);
    return match ? match[1] : iconMap[badgeName] || '🏅';
  }
}