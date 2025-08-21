/**
 * AchievementSystem - Manages user achievements and milestones
 * 
 * This service handles:
 * - Achievement tracking and unlocking
 * - Progress monitoring for progressive achievements
 * - Badge and title management
 * - Achievement notifications
 * - Milestone detection
 */

import { PrismaClient, AchievementType, Prisma } from '@prisma/client';
import { Achievement } from '@/types/betting';
import { redis } from '@/lib/redis';
import { EventEmitter } from 'events';

interface AchievementDefinition {
  type: AchievementType;
  name: string;
  description: string;
  icon: string;
  target?: number;
  condition: (stats: any) => boolean | number; // Returns boolean for instant achievements, number for progress
}

export class AchievementSystem extends EventEmitter {
  private prisma: PrismaClient;
  private cachePrefix = 'achievements:';
  private cacheTTL = 3600; // 1 hour

  // Achievement definitions
  private readonly achievements: AchievementDefinition[] = [
    {
      type: 'COMPETITION_WIN',
      name: '🏆 Champion',
      description: 'Win your first competition',
      icon: '🏆',
      condition: (stats) => stats.competitionWins > 0,
    },
    {
      type: 'COMPETITION_PLACE',
      name: '🏅 Podium Finisher',
      description: 'Finish in the top 3 of a competition',
      icon: '🏅',
      condition: (stats) => stats.topThreeFinishes > 0,
    },
    {
      type: 'WEEKLY_BEST',
      name: '🌟 Weekly Champion',
      description: 'Have the best weekly performance in your league',
      icon: '🌟',
      condition: (stats) => stats.weeklyBestCount > 0,
    },
    {
      type: 'PERFECT_WEEK',
      name: '💯 Perfect Week',
      description: 'Win all your bets in a single week',
      icon: '💯',
      condition: (stats) => stats.perfectWeeks > 0,
    },
    {
      type: 'STREAK_MASTER',
      name: '🔥 Hot Streak',
      description: 'Win 10 bets in a row',
      icon: '🔥',
      target: 10,
      condition: (stats) => stats.longestWinStreak,
    },
    {
      type: 'ROI_CHAMPION',
      name: '📈 ROI Master',
      description: 'Achieve 50% ROI in a competition',
      icon: '📈',
      condition: (stats) => stats.bestROI >= 50,
    },
    {
      type: 'PARTICIPATION',
      name: '🎯 Regular Competitor',
      description: 'Participate in 10 competitions',
      icon: '🎯',
      target: 10,
      condition: (stats) => stats.totalCompetitions,
    },
    {
      type: 'BETTING_MILESTONE',
      name: '🎲 High Roller',
      description: 'Place 100 bets',
      icon: '🎲',
      target: 100,
      condition: (stats) => stats.totalBets,
    },
  ];

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
  }

  /**
   * Check and unlock achievements for a user
   */
  async checkAchievements(
    userId: string,
    leagueId?: string
  ): Promise<Achievement[]> {
    const stats = await this.getUserStats(userId, leagueId);
    const currentAchievements = await this.getUserAchievements(userId, leagueId);
    const unlockedTypes = new Set(currentAchievements.map(a => a.type));
    const newAchievements: Achievement[] = [];

    for (const definition of this.achievements) {
      // Skip if already unlocked (unless it's a progressive achievement)
      if (unlockedTypes.has(definition.type) && !definition.target) {
        continue;
      }

      const result = definition.condition(stats);
      
      if (definition.target) {
        // Progressive achievement
        const progress = typeof result === 'number' ? result : 0;
        
        // Check if we need to update progress
        const existing = currentAchievements.find(a => a.type === definition.type);
        
        if (existing) {
          // Update progress if it increased
          if (progress > (existing.progress || 0)) {
            await this.updateAchievementProgress(
              existing.id,
              progress,
              definition.target
            );
            
            // Check if now completed
            if (progress >= definition.target && (existing.progress || 0) < definition.target) {
              newAchievements.push({
                ...existing,
                progress,
                target: definition.target,
              });
              
              this.emit('achievement:unlocked', {
                userId,
                achievement: definition.name,
                type: definition.type,
              });
            }
          }
        } else if (progress > 0) {
          // Create new progressive achievement
          const achievement = await this.createAchievement(
            userId,
            leagueId,
            definition,
            progress
          );
          
          if (progress >= definition.target) {
            newAchievements.push(achievement);
            
            this.emit('achievement:unlocked', {
              userId,
              achievement: definition.name,
              type: definition.type,
            });
          }
        }
      } else {
        // Instant achievement
        if (result === true) {
          const achievement = await this.createAchievement(
            userId,
            leagueId,
            definition
          );
          
          newAchievements.push(achievement);
          
          this.emit('achievement:unlocked', {
            userId,
            achievement: definition.name,
            type: definition.type,
          });
        }
      }
    }

    return newAchievements;
  }

  /**
   * Get user's achievements
   */
  async getUserAchievements(
    userId: string,
    leagueId?: string
  ): Promise<Achievement[]> {
    const where: Prisma.AchievementWhereInput = { userId };
    if (leagueId) {
      where.leagueId = leagueId;
    }

    const achievements = await this.prisma.achievement.findMany({
      where,
      orderBy: { unlockedAt: 'desc' },
    });

    return achievements.map(a => ({
      id: a.id,
      userId: a.userId,
      leagueId: a.leagueId || undefined,
      type: a.type,
      name: a.name,
      description: a.description,
      icon: a.icon || undefined,
      metadata: a.metadata,
      progress: a.progress,
      target: a.target || undefined,
      unlockedAt: a.unlockedAt,
    }));
  }

  /**
   * Get achievement statistics for a user
   */
  async getAchievementStats(userId: string) {
    const [total, byType, recent] = await Promise.all([
      this.prisma.achievement.count({
        where: { userId },
      }),
      this.prisma.achievement.groupBy({
        by: ['type'],
        where: { userId },
        _count: { id: true },
      }),
      this.prisma.achievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'desc' },
        take: 5,
      }),
    ]);

    const completionRate = (total / this.achievements.length) * 100;

    return {
      totalUnlocked: total,
      totalAvailable: this.achievements.length,
      completionRate,
      byType: Object.fromEntries(byType.map(t => [t.type, t._count.id])),
      recentAchievements: recent,
    };
  }

  /**
   * Award special achievement (manual)
   */
  async awardSpecialAchievement(
    userId: string,
    name: string,
    description: string,
    icon: string,
    leagueId?: string
  ): Promise<Achievement> {
    const achievement = await this.prisma.achievement.create({
      data: {
        userId,
        leagueId,
        type: 'PARTICIPATION', // Use a generic type for special achievements
        name,
        description,
        icon,
        metadata: { special: true },
      },
    });

    this.emit('achievement:unlocked', {
      userId,
      achievement: name,
      special: true,
    });

    return {
      id: achievement.id,
      userId: achievement.userId,
      leagueId: achievement.leagueId || undefined,
      type: achievement.type,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon || undefined,
      metadata: achievement.metadata,
      unlockedAt: achievement.unlockedAt,
    };
  }

  /**
   * Check for competition-related achievements
   */
  async checkCompetitionAchievements(
    competitionId: string,
    standings: any[]
  ): Promise<void> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });

    if (!competition) return;

    // Award achievements based on placement
    for (const entry of standings) {
      const achievements: string[] = [];

      if (entry.rank === 1) {
        achievements.push('COMPETITION_WIN');
      }
      
      if (entry.rank <= 3) {
        achievements.push('COMPETITION_PLACE');
      }

      // Check for ROI achievement
      if (entry.roi >= 50) {
        achievements.push('ROI_CHAMPION');
      }

      // Process achievements
      for (const type of achievements) {
        await this.checkSpecificAchievement(
          entry.userId,
          type as AchievementType,
          competition.leagueId || undefined
        );
      }
    }
  }

  /**
   * Get user statistics for achievement checking
   */
  private async getUserStats(userId: string, leagueId?: string) {
    const where: any = { userId };
    if (leagueId) {
      where.leagueId = leagueId;
    }

    const [
      competitionWins,
      topThreeFinishes,
      totalCompetitions,
      bets,
      weeklyPerformance,
    ] = await Promise.all([
      this.prisma.competitionEntry.count({
        where: { ...where, rank: 1 },
      }),
      this.prisma.competitionEntry.count({
        where: { ...where, rank: { lte: 3 } },
      }),
      this.prisma.competitionEntry.count({ where }),
      this.prisma.bet.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100, // Last 100 bets for streak calculation
      }),
      this.getWeeklyPerformance(userId, leagueId),
    ]);

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    
    for (const bet of bets) {
      if (bet.status === 'WON') {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else if (bet.status === 'LOST') {
        currentStreak = 0;
      }
    }

    // Calculate best ROI from competitions
    const competitions = await this.prisma.competitionEntry.findMany({
      where,
      orderBy: { roi: 'desc' },
      take: 1,
    });
    
    const bestROI = competitions[0]?.roi ? Number(competitions[0].roi) : 0;

    return {
      competitionWins,
      topThreeFinishes,
      totalCompetitions,
      totalBets: bets.length,
      longestWinStreak: longestStreak,
      weeklyBestCount: weeklyPerformance.weeklyBests,
      perfectWeeks: weeklyPerformance.perfectWeeks,
      bestROI,
    };
  }

  /**
   * Get weekly performance stats
   */
  private async getWeeklyPerformance(userId: string, leagueId?: string) {
    // This would need more complex logic to properly track weekly performance
    // For now, returning placeholder values
    return {
      weeklyBests: 0,
      perfectWeeks: 0,
    };
  }

  /**
   * Create a new achievement
   */
  private async createAchievement(
    userId: string,
    leagueId: string | undefined,
    definition: AchievementDefinition,
    progress?: number
  ): Promise<Achievement> {
    const achievement = await this.prisma.achievement.create({
      data: {
        userId,
        leagueId,
        type: definition.type,
        name: definition.name,
        description: definition.description,
        icon: definition.icon,
        progress: progress || 0,
        target: definition.target,
      },
    });

    return {
      id: achievement.id,
      userId: achievement.userId,
      leagueId: achievement.leagueId || undefined,
      type: achievement.type,
      name: achievement.name,
      description: achievement.description,
      icon: achievement.icon || undefined,
      metadata: achievement.metadata,
      progress: achievement.progress,
      target: achievement.target || undefined,
      unlockedAt: achievement.unlockedAt,
    };
  }

  /**
   * Update achievement progress
   */
  private async updateAchievementProgress(
    achievementId: string,
    progress: number,
    target: number
  ): Promise<void> {
    await this.prisma.achievement.update({
      where: { id: achievementId },
      data: {
        progress: Math.min(progress, target),
        unlockedAt: progress >= target ? new Date() : undefined,
      },
    });
  }

  /**
   * Check specific achievement type
   */
  private async checkSpecificAchievement(
    userId: string,
    type: AchievementType,
    leagueId?: string
  ): Promise<Achievement | null> {
    const definition = this.achievements.find(a => a.type === type);
    if (!definition) return null;

    const existing = await this.prisma.achievement.findFirst({
      where: {
        userId,
        leagueId,
        type,
      },
    });

    if (existing) return null;

    return this.createAchievement(userId, leagueId, definition);
  }
}