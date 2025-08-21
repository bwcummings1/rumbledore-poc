/**
 * Competition Flow Integration Tests
 * 
 * Tests the complete competition lifecycle:
 * - Competition creation
 * - User entry
 * - Leaderboard updates
 * - Achievement unlocking
 * - Reward distribution
 */

import { PrismaClient } from '@prisma/client';
import { CompetitionManager } from '@/lib/betting/competition-manager';
import { LeaderboardService } from '@/lib/betting/leaderboard-service';
import { AchievementSystem } from '@/lib/betting/achievement-system';
import { RewardDistributor } from '@/lib/betting/reward-distributor';
import { BankrollManager } from '@/lib/betting/bankroll-manager';
import { CompetitionCacheManager } from '@/lib/cache/competition-cache';
import Redis from 'ioredis';

describe('Competition Flow Integration Tests', () => {
  let prisma: PrismaClient;
  let competitionManager: CompetitionManager;
  let leaderboardService: LeaderboardService;
  let achievementSystem: AchievementSystem;
  let rewardDistributor: RewardDistributor;
  let bankrollManager: BankrollManager;
  let cacheManager: CompetitionCacheManager;
  let redis: Redis;

  let testLeagueId: string;
  let testUserId1: string;
  let testUserId2: string;
  let testUserId3: string;
  let testCompetitionId: string;

  beforeAll(async () => {
    // Initialize services
    prisma = new PrismaClient();
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    competitionManager = new CompetitionManager(prisma);
    leaderboardService = new LeaderboardService(prisma);
    achievementSystem = new AchievementSystem(prisma);
    rewardDistributor = new RewardDistributor(prisma);
    bankrollManager = new BankrollManager(prisma);
    cacheManager = new CompetitionCacheManager();

    // Setup test data
    const league = await prisma.league.create({
      data: {
        espnLeagueId: 'test-league-' + Date.now(),
        name: 'Test Competition League',
        year: 2024,
        platform: 'ESPN',
      },
    });
    testLeagueId = league.id;

    // Create test users
    const user1 = await prisma.user.create({
      data: {
        email: `test1-${Date.now()}@example.com`,
        name: 'Test User 1',
      },
    });
    testUserId1 = user1.id;

    const user2 = await prisma.user.create({
      data: {
        email: `test2-${Date.now()}@example.com`,
        name: 'Test User 2',
      },
    });
    testUserId2 = user2.id;

    const user3 = await prisma.user.create({
      data: {
        email: `test3-${Date.now()}@example.com`,
        name: 'Test User 3',
      },
    });
    testUserId3 = user3.id;

    // Initialize bankrolls
    await bankrollManager.initializeBankroll(testLeagueId, testUserId1, 1);
    await bankrollManager.initializeBankroll(testLeagueId, testUserId2, 1);
    await bankrollManager.initializeBankroll(testLeagueId, testUserId3, 1);
  });

  afterAll(async () => {
    // Cleanup
    await prisma.competitionReward.deleteMany({ where: { competitionId: testCompetitionId } });
    await prisma.competitionEntry.deleteMany({ where: { competitionId: testCompetitionId } });
    await prisma.leaderboard.deleteMany({ where: { competitionId: testCompetitionId } });
    await prisma.competition.deleteMany({ where: { id: testCompetitionId } });
    await prisma.bankroll.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.user.deleteMany({ where: { id: { in: [testUserId1, testUserId2, testUserId3] } } });
    await prisma.league.deleteMany({ where: { id: testLeagueId } });
    
    await cacheManager.disconnect();
    await redis.quit();
    await prisma.$disconnect();
  });

  describe('Competition Creation', () => {
    it('should create a new competition', async () => {
      const competition = await competitionManager.createCompetition({
        name: 'Test Weekly Competition',
        description: 'Integration test competition',
        type: 'WEEKLY',
        scope: 'LEAGUE',
        leagueId: testLeagueId,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
        entryFee: 100,
        maxEntrants: 10,
        prizePool: 1000,
        prizeStructure: {
          '1': '500',
          '2': '300',
          '3': '200',
        },
        scoringRules: {
          winPoints: 10,
          roiMultiplier: 5,
          streakBonus: 2,
        },
      });

      expect(competition).toBeDefined();
      expect(competition.id).toBeDefined();
      expect(competition.status).toBe('PENDING');
      expect(competition.prizePool).toBe(1000);
      testCompetitionId = competition.id;
    });

    it('should transition competition to ACTIVE status', async () => {
      await competitionManager.updateCompetitionStatus(testCompetitionId, 'ACTIVE');
      
      const competition = await competitionManager.getCompetition(testCompetitionId);
      expect(competition?.status).toBe('ACTIVE');
    });
  });

  describe('User Entry', () => {
    it('should allow users to join competition', async () => {
      // User 1 joins
      const entry1 = await competitionManager.joinCompetition(
        testCompetitionId,
        testUserId1,
        testLeagueId
      );
      expect(entry1).toBeDefined();
      expect(entry1.userId).toBe(testUserId1);

      // User 2 joins
      const entry2 = await competitionManager.joinCompetition(
        testCompetitionId,
        testUserId2,
        testLeagueId
      );
      expect(entry2).toBeDefined();
      expect(entry2.userId).toBe(testUserId2);

      // User 3 joins
      const entry3 = await competitionManager.joinCompetition(
        testCompetitionId,
        testUserId3,
        testLeagueId
      );
      expect(entry3).toBeDefined();
      expect(entry3.userId).toBe(testUserId3);
    });

    it('should deduct entry fee from bankroll', async () => {
      const bankroll1 = await bankrollManager.getCurrentBankroll(testLeagueId, testUserId1);
      expect(bankroll1?.currentBalance).toBe(900); // 1000 - 100 entry fee
    });

    it('should prevent duplicate entries', async () => {
      await expect(
        competitionManager.joinCompetition(testCompetitionId, testUserId1, testLeagueId)
      ).rejects.toThrow('Already entered');
    });

    it('should update competition entry count', async () => {
      const competition = await competitionManager.getCompetition(testCompetitionId);
      expect(competition?.currentEntrants).toBe(3);
    });
  });

  describe('Leaderboard Updates', () => {
    beforeEach(async () => {
      // Simulate some bets and wins for scoring
      await prisma.bet.createMany({
        data: [
          {
            leagueId: testLeagueId,
            userId: testUserId1,
            bankrollId: 'dummy-1',
            gameId: 'game-1',
            eventDate: new Date(),
            betType: 'SINGLE',
            marketType: 'SPREAD',
            selection: 'HOME',
            odds: -110,
            stake: 50,
            potentialPayout: 95.45,
            actualPayout: 95.45,
            status: 'WON',
            result: 'WIN',
          },
          {
            leagueId: testLeagueId,
            userId: testUserId1,
            bankrollId: 'dummy-1',
            gameId: 'game-2',
            eventDate: new Date(),
            betType: 'SINGLE',
            marketType: 'MONEYLINE',
            selection: 'AWAY',
            odds: 150,
            stake: 40,
            potentialPayout: 100,
            actualPayout: 100,
            status: 'WON',
            result: 'WIN',
          },
          {
            leagueId: testLeagueId,
            userId: testUserId2,
            bankrollId: 'dummy-2',
            gameId: 'game-1',
            eventDate: new Date(),
            betType: 'SINGLE',
            marketType: 'TOTAL',
            selection: 'OVER',
            odds: -105,
            stake: 100,
            potentialPayout: 195.24,
            actualPayout: 0,
            status: 'SETTLED',
            result: 'LOSS',
          },
          {
            leagueId: testLeagueId,
            userId: testUserId3,
            bankrollId: 'dummy-3',
            gameId: 'game-3',
            eventDate: new Date(),
            betType: 'SINGLE',
            marketType: 'SPREAD',
            selection: 'HOME',
            odds: -110,
            stake: 80,
            potentialPayout: 152.73,
            actualPayout: 152.73,
            status: 'WON',
            result: 'WIN',
          },
        ],
      });
    });

    it('should calculate and update leaderboard', async () => {
      const leaderboard = await leaderboardService.updateLeaderboard(testCompetitionId);
      
      expect(leaderboard).toBeDefined();
      expect(leaderboard.standings).toHaveLength(3);
      expect(leaderboard.competitionId).toBe(testCompetitionId);
    });

    it('should rank users correctly', async () => {
      const leaderboard = await leaderboardService.getLeaderboard(testCompetitionId);
      
      expect(leaderboard).toBeDefined();
      const standings = leaderboard!.standings;
      
      // User 1 should be first (2 wins)
      expect(standings[0].userId).toBe(testUserId1);
      expect(standings[0].rank).toBe(1);
      expect(standings[0].wins).toBe(2);
      
      // User 3 should be second (1 win)
      expect(standings[1].userId).toBe(testUserId3);
      expect(standings[1].rank).toBe(2);
      expect(standings[1].wins).toBe(1);
      
      // User 2 should be third (0 wins)
      expect(standings[2].userId).toBe(testUserId2);
      expect(standings[2].rank).toBe(3);
      expect(standings[2].wins).toBe(0);
    });

    it('should cache leaderboard', async () => {
      const cachedLeaderboard = await cacheManager.getLeaderboard(testCompetitionId);
      expect(cachedLeaderboard).toBeDefined();
      expect(cachedLeaderboard?.standings).toHaveLength(3);
    });
  });

  describe('Achievement System', () => {
    it('should check and unlock achievements', async () => {
      // Check achievements for user 1 (who has 2 wins)
      const achievements = await achievementSystem.checkAchievements(
        testUserId1,
        testLeagueId
      );
      
      // Should have unlocked some achievements
      expect(achievements).toBeDefined();
      expect(achievements.length).toBeGreaterThan(0);
    });

    it('should track progressive achievements', async () => {
      const progress = await achievementSystem.getAchievementProgress(
        testUserId1,
        'total-bets-100' // Example progressive achievement
      );
      
      expect(progress).toBeDefined();
      expect(progress).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Reward Distribution', () => {
    it('should distribute rewards when competition ends', async () => {
      // First, mark competition as SETTLING
      await competitionManager.updateCompetitionStatus(testCompetitionId, 'SETTLING');
      
      // Get final leaderboard
      const leaderboard = await leaderboardService.getLeaderboard(testCompetitionId);
      expect(leaderboard).toBeDefined();
      
      // Distribute rewards
      const rewards = await rewardDistributor.distributeRewards(
        testCompetitionId,
        leaderboard!.standings
      );
      
      expect(rewards).toBeDefined();
      expect(rewards.length).toBeGreaterThan(0);
      
      // Check that top 3 users received rewards
      const user1Reward = rewards.find(r => r.userId === testUserId1);
      const user3Reward = rewards.find(r => r.userId === testUserId3);
      const user2Reward = rewards.find(r => r.userId === testUserId2);
      
      expect(user1Reward).toBeDefined();
      expect(user1Reward?.amount).toBe(500); // 1st place prize
      expect(user1Reward?.rank).toBe(1);
      
      expect(user3Reward).toBeDefined();
      expect(user3Reward?.amount).toBe(300); // 2nd place prize
      expect(user3Reward?.rank).toBe(2);
      
      expect(user2Reward).toBeDefined();
      expect(user2Reward?.amount).toBe(200); // 3rd place prize
      expect(user2Reward?.rank).toBe(3);
    });

    it('should update bankrolls with rewards', async () => {
      const bankroll1 = await bankrollManager.getCurrentBankroll(testLeagueId, testUserId1);
      expect(bankroll1?.currentBalance).toBeGreaterThan(900); // Should have entry fee back + winnings
    });

    it('should mark competition as COMPLETED', async () => {
      await competitionManager.updateCompetitionStatus(testCompetitionId, 'COMPLETED');
      
      const competition = await competitionManager.getCompetition(testCompetitionId);
      expect(competition?.status).toBe('COMPLETED');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache when competition updates', async () => {
      // Cache should exist
      let cached = await cacheManager.getCompetition(testCompetitionId);
      expect(cached).toBeDefined();
      
      // Invalidate
      await cacheManager.invalidateCompetition(testCompetitionId);
      
      // Cache should be empty
      cached = await cacheManager.getCompetition(testCompetitionId);
      expect(cached).toBeNull();
    });

    it('should invalidate leaderboard cache', async () => {
      // Re-cache leaderboard
      const leaderboard = await leaderboardService.getLeaderboard(testCompetitionId);
      await cacheManager.cacheLeaderboard(testCompetitionId, leaderboard!);
      
      // Verify cached
      let cached = await cacheManager.getLeaderboard(testCompetitionId);
      expect(cached).toBeDefined();
      
      // Invalidate
      await cacheManager.invalidateLeaderboard(testCompetitionId);
      
      // Should be empty
      cached = await cacheManager.getLeaderboard(testCompetitionId);
      expect(cached).toBeNull();
    });
  });
});

describe('Competition Edge Cases', () => {
  let prisma: PrismaClient;
  let competitionManager: CompetitionManager;

  beforeAll(() => {
    prisma = new PrismaClient();
    competitionManager = new CompetitionManager(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should handle competition with no entrants', async () => {
    const emptyCompetition = await competitionManager.createCompetition({
      name: 'Empty Competition',
      type: 'WEEKLY',
      scope: 'GLOBAL',
      startDate: new Date(),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      entryFee: 0,
      prizePool: 0,
    });
    
    expect(emptyCompetition).toBeDefined();
    expect(emptyCompetition.currentEntrants).toBe(0);
    
    // Cleanup
    await prisma.competition.delete({ where: { id: emptyCompetition.id } });
  });

  it('should enforce maximum entrants', async () => {
    const limitedCompetition = await competitionManager.createCompetition({
      name: 'Limited Competition',
      type: 'TOURNAMENT',
      scope: 'GLOBAL',
      startDate: new Date(),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      entryFee: 0,
      maxEntrants: 1,
      prizePool: 0,
    });
    
    // Create test users
    const user1 = await prisma.user.create({
      data: { email: `limited1-${Date.now()}@test.com`, name: 'Limited 1' },
    });
    const user2 = await prisma.user.create({
      data: { email: `limited2-${Date.now()}@test.com`, name: 'Limited 2' },
    });
    
    // First user should join successfully
    await competitionManager.joinCompetition(limitedCompetition.id, user1.id);
    
    // Second user should be rejected
    await expect(
      competitionManager.joinCompetition(limitedCompetition.id, user2.id)
    ).rejects.toThrow('Competition is full');
    
    // Cleanup
    await prisma.competitionEntry.deleteMany({ where: { competitionId: limitedCompetition.id } });
    await prisma.competition.delete({ where: { id: limitedCompetition.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
  });
});