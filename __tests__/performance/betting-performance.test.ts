/**
 * Performance tests for the betting engine
 * Tests scalability, response times, and resource usage
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { performance } from 'perf_hooks';
import { prisma } from '@/lib/prisma';
import { BankrollManager } from '@/lib/betting/bankroll-manager';
import { BetPlacementEngine } from '@/lib/betting/bet-placement';
import { SettlementEngine } from '@/lib/betting/settlement-engine';
import { PayoutCalculator } from '@/lib/betting/payout-calculator';
import Redis from 'ioredis';
import { BetType, BetStatus, MarketType } from '@prisma/client';

// Mock Redis
jest.mock('ioredis', () => {
  const RedisMock = require('ioredis-mock');
  return RedisMock;
});

describe('Betting Engine Performance Tests', () => {
  let bankrollManager: BankrollManager;
  let betPlacement: BetPlacementEngine;
  let settlementEngine: SettlementEngine;
  let payoutCalculator: PayoutCalculator;
  let redis: Redis;
  
  const testLeagueId = 'perf-league-123';
  const testUserIds: string[] = [];
  const NUM_USERS = 100;
  const NUM_BETS_PER_USER = 50;
  
  beforeAll(async () => {
    redis = new Redis();
    bankrollManager = new BankrollManager();
    betPlacement = new BetPlacementEngine(redis);
    settlementEngine = new SettlementEngine();
    payoutCalculator = new PayoutCalculator();
    
    // Create test league
    await prisma.league.create({
      data: {
        id: testLeagueId,
        espnLeagueId: 999999,
        name: 'Performance Test League',
        season: 2024,
        isActive: true,
        lastSyncedAt: new Date(),
      },
    });
    
    // Create test users
    for (let i = 0; i < NUM_USERS; i++) {
      const userId = `perf-user-${i}`;
      testUserIds.push(userId);
      await prisma.user.create({
        data: {
          id: userId,
          email: `perf${i}@test.com`,
          name: `Perf User ${i}`,
        },
      });
    }
  });
  
  afterAll(async () => {
    // Cleanup
    await prisma.bet.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.bankroll.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.settlement.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
    await prisma.league.delete({ where: { id: testLeagueId } });
    await redis.quit();
  });
  
  describe('Bankroll Operations Performance', () => {
    it('should initialize 100 bankrolls in under 5 seconds', async () => {
      const startTime = performance.now();
      
      const promises = testUserIds.map(userId =>
        bankrollManager.initializeWeeklyBankroll(testLeagueId, userId, 1)
      );
      
      await Promise.all(promises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000);
      console.log(`Initialized ${NUM_USERS} bankrolls in ${duration.toFixed(2)}ms`);
    });
    
    it('should retrieve user stats quickly with large history', async () => {
      const userId = testUserIds[0];
      
      // Create historical data
      for (let week = 2; week <= 10; week++) {
        const bankroll = await bankrollManager.initializeWeeklyBankroll(
          testLeagueId,
          userId,
          week
        );
        
        // Simulate betting activity
        await prisma.bankroll.update({
          where: { id: bankroll.id },
          data: {
            totalBets: Math.floor(Math.random() * 20) + 5,
            wonBets: Math.floor(Math.random() * 10) + 2,
            lostBets: Math.floor(Math.random() * 10) + 2,
            totalWagered: Math.random() * 500 + 100,
            currentBalance: Math.random() * 500 + 500,
          },
        });
      }
      
      const startTime = performance.now();
      const stats = await bankrollManager.getUserBettingStats(testLeagueId, userId);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(200);
      expect(stats).toBeDefined();
      console.log(`Retrieved user stats in ${(endTime - startTime).toFixed(2)}ms`);
    });
  });
  
  describe('Bet Placement Performance', () => {
    beforeAll(async () => {
      // Initialize bankrolls for all users
      await Promise.all(
        testUserIds.map(userId =>
          bankrollManager.initializeWeeklyBankroll(testLeagueId, userId, 11)
        )
      );
    });
    
    it('should place 1000 single bets in under 10 seconds', async () => {
      const startTime = performance.now();
      const betPromises: Promise<any>[] = [];
      
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 100; j++) {
          const userId = testUserIds[j % NUM_USERS];
          betPromises.push(
            betPlacement.placeBet({
              leagueId: testLeagueId,
              userId,
              gameId: `perf-game-${i}-${j}`,
              eventDate: new Date(Date.now() + 86400000),
              betType: BetType.STRAIGHT,
              marketType: MarketType.H2H,
              selection: `Team ${j % 2 === 0 ? 'A' : 'B'}`,
              odds: j % 2 === 0 ? -110 : 120,
              stake: 10 + (j % 5) * 5,
              potentialPayout: 20,
            })
          );
        }
      }
      
      await Promise.all(betPromises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(10000);
      console.log(`Placed 1000 bets in ${duration.toFixed(2)}ms`);
      console.log(`Average: ${(duration / 1000).toFixed(2)}ms per bet`);
    });
    
    it('should place 100 parlay bets efficiently', async () => {
      const startTime = performance.now();
      const parlayPromises: Promise<any>[] = [];
      
      for (let i = 0; i < 100; i++) {
        const userId = testUserIds[i % NUM_USERS];
        parlayPromises.push(
          betPlacement.placeParlay({
            leagueId: testLeagueId,
            userId,
            stake: 25,
            legs: [
              {
                gameId: `parlay-game-${i}-1`,
                eventDate: new Date(Date.now() + 86400000),
                marketType: MarketType.H2H,
                selection: 'Team A',
                odds: -150,
              },
              {
                gameId: `parlay-game-${i}-2`,
                eventDate: new Date(Date.now() + 86400000),
                marketType: MarketType.SPREADS,
                selection: 'Team B -3.5',
                line: -3.5,
                odds: -110,
              },
              {
                gameId: `parlay-game-${i}-3`,
                eventDate: new Date(Date.now() + 86400000),
                marketType: MarketType.TOTALS,
                selection: 'Over 45.5',
                line: 45.5,
                odds: -110,
              },
            ],
          })
        );
      }
      
      await Promise.all(parlayPromises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000);
      console.log(`Placed 100 parlays in ${duration.toFixed(2)}ms`);
    });
    
    it('should handle concurrent bet slip operations efficiently', async () => {
      const startTime = performance.now();
      const slipOperations: Promise<any>[] = [];
      
      // Simulate 50 users managing bet slips concurrently
      for (let i = 0; i < 50; i++) {
        const userId = testUserIds[i];
        const slipId = `perf-slip-${userId}`;
        
        // Add items
        for (let j = 0; j < 5; j++) {
          slipOperations.push(
            betPlacement.addToSlip(slipId, {
              gameId: `slip-game-${j}`,
              eventDate: new Date(Date.now() + 86400000),
              marketType: MarketType.H2H,
              selection: `Team ${j}`,
              odds: -110 + j * 10,
            })
          );
        }
        
        // Get slip
        slipOperations.push(betPlacement.getSlip(slipId));
        
        // Remove an item
        slipOperations.push(
          betPlacement.removeFromSlip(slipId, 'slip-game-2', MarketType.H2H)
        );
        
        // Clear slip
        slipOperations.push(betPlacement.clearSlip(slipId));
      }
      
      await Promise.all(slipOperations);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(3000);
      console.log(`Handled ${slipOperations.length} slip operations in ${duration.toFixed(2)}ms`);
    });
  });
  
  describe('Settlement Performance', () => {
    let betIds: string[] = [];
    
    beforeAll(async () => {
      // Create bets to settle
      const promises = [];
      for (let i = 0; i < 500; i++) {
        const userId = testUserIds[i % NUM_USERS];
        promises.push(
          betPlacement.placeBet({
            leagueId: testLeagueId,
            userId,
            gameId: `settle-game-${i}`,
            eventDate: new Date(),
            betType: BetType.STRAIGHT,
            marketType: MarketType.H2H,
            selection: i % 2 === 0 ? 'Home' : 'Away',
            odds: -110,
            stake: 20,
            potentialPayout: 38.18,
          })
        );
      }
      
      const bets = await Promise.all(promises);
      betIds = bets.map(b => b.id);
    });
    
    it('should settle 500 bets in under 10 seconds', async () => {
      const startTime = performance.now();
      const settlementPromises: Promise<any>[] = [];
      
      for (let i = 0; i < betIds.length; i++) {
        const gameResult = {
          gameId: `settle-game-${i}`,
          homeScore: Math.floor(Math.random() * 30) + 10,
          awayScore: Math.floor(Math.random() * 30) + 10,
          status: 'COMPLETED' as const,
        };
        
        settlementPromises.push(
          settlementEngine.settleBet(betIds[i], gameResult)
        );
      }
      
      await Promise.all(settlementPromises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(10000);
      console.log(`Settled 500 bets in ${duration.toFixed(2)}ms`);
      console.log(`Average: ${(duration / 500).toFixed(2)}ms per settlement`);
    });
    
    it('should batch settle bets for a week efficiently', async () => {
      // Create more bets for batch settlement
      const batchBetIds: string[] = [];
      for (let i = 0; i < 200; i++) {
        const userId = testUserIds[i % NUM_USERS];
        const bet = await betPlacement.placeBet({
          leagueId: testLeagueId,
          userId,
          gameId: `batch-game-${i}`,
          eventDate: new Date(),
          betType: BetType.STRAIGHT,
          marketType: MarketType.H2H,
          selection: 'Team',
          odds: -110,
          stake: 15,
          potentialPayout: 28.64,
        });
        batchBetIds.push(bet.id);
      }
      
      const startTime = performance.now();
      
      // Simulate batch settlement
      const gameResults = batchBetIds.map((_, i) => ({
        gameId: `batch-game-${i}`,
        homeScore: 24,
        awayScore: 21,
        status: 'COMPLETED' as const,
      }));
      
      await settlementEngine.batchSettleBets(testLeagueId, 11, gameResults);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000);
      console.log(`Batch settled 200 bets in ${duration.toFixed(2)}ms`);
    });
  });
  
  describe('Payout Calculation Performance', () => {
    it('should calculate 10000 single payouts in under 100ms', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 10000; i++) {
        const stake = 10 + (i % 50);
        const odds = i % 2 === 0 ? -(100 + i % 100) : (100 + i % 150);
        payoutCalculator.calculateSinglePayout(stake, odds);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100);
      console.log(`Calculated 10000 payouts in ${duration.toFixed(2)}ms`);
    });
    
    it('should calculate complex parlays efficiently', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        const numLegs = 2 + (i % 8); // 2-9 legs
        const legs = [];
        
        for (let j = 0; j < numLegs; j++) {
          legs.push({
            odds: j % 2 === 0 ? -(110 + j * 10) : (120 + j * 15),
          });
        }
        
        payoutCalculator.calculateParlayPayout(25, legs);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(200);
      console.log(`Calculated 1000 complex parlays in ${duration.toFixed(2)}ms`);
    });
    
    it('should calculate Kelly Criterion for 5000 bets quickly', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 5000; i++) {
        const decimalOdds = 1.5 + (i % 30) / 10;
        const probability = 0.3 + (i % 40) / 100;
        payoutCalculator.calculateKellyCriterion(decimalOdds, probability);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(50);
      console.log(`Calculated 5000 Kelly values in ${duration.toFixed(2)}ms`);
    });
  });
  
  describe('Cache Performance', () => {
    it('should handle high-frequency cache operations', async () => {
      const startTime = performance.now();
      const cacheOps: Promise<any>[] = [];
      
      // Simulate 1000 cache operations
      for (let i = 0; i < 1000; i++) {
        const key = `cache-test-${i % 100}`; // Reuse some keys
        const value = { data: `value-${i}`, timestamp: Date.now() };
        
        if (i % 3 === 0) {
          // Set
          cacheOps.push(redis.set(key, JSON.stringify(value), 'EX', 300));
        } else if (i % 3 === 1) {
          // Get
          cacheOps.push(redis.get(key));
        } else {
          // Delete
          cacheOps.push(redis.del(key));
        }
      }
      
      await Promise.all(cacheOps);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000);
      console.log(`Completed 1000 cache operations in ${duration.toFixed(2)}ms`);
    });
  });
  
  describe('Database Query Performance', () => {
    it('should retrieve betting history efficiently with pagination', async () => {
      const userId = testUserIds[0];
      
      // Create historical bets
      const betPromises = [];
      for (let i = 0; i < 200; i++) {
        betPromises.push(
          prisma.bet.create({
            data: {
              leagueId: testLeagueId,
              userId,
              gameId: `hist-game-${i}`,
              eventDate: new Date(Date.now() - i * 86400000), // Past dates
              betType: BetType.STRAIGHT,
              marketType: MarketType.H2H,
              selection: 'Team',
              odds: -110,
              stake: 20,
              potentialPayout: 38.18,
              status: BetStatus.SETTLED,
              result: i % 3 === 0 ? 'WIN' : i % 3 === 1 ? 'LOSS' : 'PUSH',
              actualPayout: i % 3 === 0 ? 38.18 : 0,
              settledAt: new Date(),
            },
          })
        );
      }
      await Promise.all(betPromises);
      
      const startTime = performance.now();
      
      // Paginated queries
      for (let page = 0; page < 5; page++) {
        await prisma.bet.findMany({
          where: {
            leagueId: testLeagueId,
            userId,
            status: BetStatus.SETTLED,
          },
          orderBy: { settledAt: 'desc' },
          skip: page * 20,
          take: 20,
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(500);
      console.log(`Retrieved 5 pages of history in ${duration.toFixed(2)}ms`);
    });
    
    it('should aggregate statistics efficiently', async () => {
      const startTime = performance.now();
      
      // Complex aggregation query
      const stats = await prisma.bet.groupBy({
        by: ['marketType', 'result'],
        where: {
          leagueId: testLeagueId,
          status: BetStatus.SETTLED,
        },
        _count: true,
        _sum: {
          stake: true,
          actualPayout: true,
        },
        _avg: {
          odds: true,
        },
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(200);
      expect(stats).toBeDefined();
      console.log(`Aggregated statistics in ${duration.toFixed(2)}ms`);
    });
  });
  
  describe('Memory Usage', () => {
    it('should handle large datasets without memory leaks', async () => {
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      
      // Process large batch of bets
      for (let batch = 0; batch < 5; batch++) {
        const bets = [];
        for (let i = 0; i < 1000; i++) {
          bets.push({
            leagueId: testLeagueId,
            userId: testUserIds[i % NUM_USERS],
            gameId: `mem-game-${batch}-${i}`,
            eventDate: new Date(),
            betType: BetType.STRAIGHT,
            marketType: MarketType.H2H,
            selection: 'Team',
            odds: -110,
            stake: 20,
            potentialPayout: 38.18,
          });
        }
        
        // Process and clear
        await Promise.all(bets.map(bet => betPlacement.placeBet(bet)));
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = finalMemory - initialMemory;
      
      console.log(`Memory usage: Initial=${initialMemory.toFixed(2)}MB, Final=${finalMemory.toFixed(2)}MB`);
      console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB`);
      
      // Memory increase should be reasonable (less than 100MB for this test)
      expect(memoryIncrease).toBeLessThan(100);
    });
  });
  
  describe('Concurrent User Load', () => {
    it('should handle 50 concurrent users placing bets', async () => {
      const startTime = performance.now();
      
      // Simulate 50 users each placing 5 bets concurrently
      const userPromises = testUserIds.slice(0, 50).map(async (userId, userIndex) => {
        const betPromises = [];
        for (let i = 0; i < 5; i++) {
          betPromises.push(
            betPlacement.placeBet({
              leagueId: testLeagueId,
              userId,
              gameId: `concurrent-${userIndex}-${i}`,
              eventDate: new Date(Date.now() + 86400000),
              betType: BetType.STRAIGHT,
              marketType: MarketType.H2H,
              selection: 'Team',
              odds: -110,
              stake: 25,
              potentialPayout: 47.73,
            })
          );
        }
        return Promise.all(betPromises);
      });
      
      await Promise.all(userPromises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000);
      console.log(`50 concurrent users placed 250 total bets in ${duration.toFixed(2)}ms`);
      console.log(`Average per user: ${(duration / 50).toFixed(2)}ms`);
    });
  });
});