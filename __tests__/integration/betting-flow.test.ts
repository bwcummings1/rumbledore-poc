/**
 * Integration tests for the complete betting flow
 * Tests the entire lifecycle from bankroll initialization to bet settlement
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { prisma } from '@/lib/prisma';
import { BankrollManager } from '@/lib/betting/bankroll-manager';
import { BetValidator } from '@/lib/betting/bet-validator';
import { BetPlacementEngine } from '@/lib/betting/bet-placement';
import { SettlementEngine } from '@/lib/betting/settlement-engine';
import { PayoutCalculator } from '@/lib/betting/payout-calculator';
import Redis from 'ioredis';
import { 
  BetType, 
  BetStatus, 
  BetResult, 
  MarketType,
  BankrollStatus 
} from '@prisma/client';

// Mock Redis
jest.mock('ioredis', () => {
  const RedisMock = require('ioredis-mock');
  return RedisMock;
});

describe('Betting Flow Integration Tests', () => {
  let bankrollManager: BankrollManager;
  let betValidator: BetValidator;
  let betPlacement: BetPlacementEngine;
  let settlementEngine: SettlementEngine;
  let payoutCalculator: PayoutCalculator;
  let redis: Redis;
  
  const testLeagueId = 'test-league-123';
  const testUserId = 'test-user-456';
  const testWeek = 10;
  
  beforeAll(async () => {
    // Initialize services
    redis = new Redis();
    bankrollManager = new BankrollManager();
    betValidator = new BetValidator();
    betPlacement = new BetPlacementEngine(redis);
    settlementEngine = new SettlementEngine();
    payoutCalculator = new PayoutCalculator();
    
    // Create test data
    await prisma.user.create({
      data: {
        id: testUserId,
        email: 'test@example.com',
        name: 'Test User',
      },
    });
    
    await prisma.league.create({
      data: {
        id: testLeagueId,
        espnLeagueId: 123456,
        name: 'Test League',
        season: 2024,
        isActive: true,
        lastSyncedAt: new Date(),
      },
    });
  });
  
  afterAll(async () => {
    // Cleanup
    await prisma.bet.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.bankroll.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.settlement.deleteMany({ where: { leagueId: testLeagueId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.league.delete({ where: { id: testLeagueId } });
    await redis.quit();
  });
  
  beforeEach(async () => {
    // Clear Redis cache
    await redis.flushall();
  });
  
  describe('Bankroll Management', () => {
    it('should initialize weekly bankroll with 1000 units', async () => {
      const bankroll = await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        testWeek
      );
      
      expect(bankroll).toBeDefined();
      expect(bankroll.initialBalance).toBe(1000);
      expect(bankroll.currentBalance).toBe(1000);
      expect(bankroll.week).toBe(testWeek);
      expect(bankroll.status).toBe(BankrollStatus.ACTIVE);
    });
    
    it('should prevent duplicate bankroll initialization', async () => {
      // First initialization
      await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        testWeek
      );
      
      // Second attempt should return existing
      const duplicate = await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        testWeek
      );
      
      expect(duplicate.currentBalance).toBe(1000);
      
      // Verify only one bankroll exists
      const count = await prisma.bankroll.count({
        where: {
          leagueId: testLeagueId,
          userId: testUserId,
          week: testWeek,
        },
      });
      expect(count).toBe(1);
    });
    
    it('should track betting statistics correctly', async () => {
      const bankroll = await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        testWeek
      );
      
      // Record some bets
      await bankrollManager.recordBetPlacement(
        bankroll.id,
        50,
        BetType.STRAIGHT
      );
      
      await bankrollManager.recordBetPlacement(
        bankroll.id,
        100,
        BetType.PARLAY
      );
      
      const updated = await prisma.bankroll.findUnique({
        where: { id: bankroll.id },
      });
      
      expect(updated?.currentBalance).toBe(850); // 1000 - 50 - 100
      expect(updated?.totalBets).toBe(2);
      expect(updated?.totalWagered).toBe(150);
    });
  });
  
  describe('Bet Validation', () => {
    let bankrollId: string;
    
    beforeEach(async () => {
      const bankroll = await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        testWeek
      );
      bankrollId = bankroll.id;
    });
    
    it('should validate stake limits', async () => {
      const validationResult = await betValidator.validateBet({
        leagueId: testLeagueId,
        userId: testUserId,
        gameId: 'game-123',
        eventDate: new Date(Date.now() + 86400000), // Tomorrow
        betType: BetType.STRAIGHT,
        marketType: MarketType.H2H,
        selection: 'Home Team',
        odds: -110,
        stake: 0.5, // Below minimum
        potentialPayout: 0.45,
      });
      
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors).toContain('INVALID_STAKE_AMOUNT');
    });
    
    it('should prevent betting on past games', async () => {
      const validationResult = await betValidator.validateBet({
        leagueId: testLeagueId,
        userId: testUserId,
        gameId: 'game-123',
        eventDate: new Date(Date.now() - 86400000), // Yesterday
        betType: BetType.STRAIGHT,
        marketType: MarketType.H2H,
        selection: 'Home Team',
        odds: -110,
        stake: 10,
        potentialPayout: 9.09,
      });
      
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors).toContain('GAME_ALREADY_STARTED');
    });
    
    it('should check for sufficient funds', async () => {
      const validationResult = await betValidator.validateBet({
        leagueId: testLeagueId,
        userId: testUserId,
        gameId: 'game-123',
        eventDate: new Date(Date.now() + 86400000),
        betType: BetType.STRAIGHT,
        marketType: MarketType.H2H,
        selection: 'Home Team',
        odds: -110,
        stake: 1500, // More than bankroll
        potentialPayout: 1363.64,
      });
      
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors).toContain('INSUFFICIENT_FUNDS');
    });
    
    it('should validate parlay bets', async () => {
      const parlayLegs = [
        {
          gameId: 'game-1',
          eventDate: new Date(Date.now() + 86400000),
          marketType: MarketType.H2H,
          selection: 'Team A',
          odds: -110,
        },
        {
          gameId: 'game-2',
          eventDate: new Date(Date.now() + 86400000),
          marketType: MarketType.SPREADS,
          selection: 'Team B -3.5',
          line: -3.5,
          odds: -110,
        },
      ];
      
      const validationResult = await betValidator.validateParlay({
        leagueId: testLeagueId,
        userId: testUserId,
        legs: parlayLegs,
        stake: 50,
      });
      
      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });
  });
  
  describe('Bet Placement', () => {
    let bankrollId: string;
    
    beforeEach(async () => {
      const bankroll = await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        testWeek
      );
      bankrollId = bankroll.id;
    });
    
    it('should place a single bet successfully', async () => {
      const betRequest = {
        leagueId: testLeagueId,
        userId: testUserId,
        gameId: 'game-123',
        eventDate: new Date(Date.now() + 86400000),
        betType: BetType.STRAIGHT,
        marketType: MarketType.H2H,
        selection: 'Buffalo Bills',
        odds: -150,
        stake: 75,
        potentialPayout: 125,
      };
      
      const bet = await betPlacement.placeBet(betRequest);
      
      expect(bet).toBeDefined();
      expect(bet.status).toBe(BetStatus.PENDING);
      expect(bet.stake).toBe(75);
      expect(bet.odds).toBe(-150);
      
      // Verify bankroll was updated
      const updatedBankroll = await prisma.bankroll.findUnique({
        where: { id: bankrollId },
      });
      expect(updatedBankroll?.currentBalance).toBe(925); // 1000 - 75
    });
    
    it('should place a parlay bet with multiple legs', async () => {
      const parlayRequest = {
        leagueId: testLeagueId,
        userId: testUserId,
        stake: 25,
        legs: [
          {
            gameId: 'game-1',
            eventDate: new Date(Date.now() + 86400000),
            marketType: MarketType.H2H,
            selection: 'Team A',
            odds: 150,
          },
          {
            gameId: 'game-2',
            eventDate: new Date(Date.now() + 86400000),
            marketType: MarketType.TOTALS,
            selection: 'Over 45.5',
            line: 45.5,
            odds: -110,
          },
          {
            gameId: 'game-3',
            eventDate: new Date(Date.now() + 86400000),
            marketType: MarketType.SPREADS,
            selection: 'Team C +7',
            line: 7,
            odds: -110,
          },
        ],
      };
      
      const parlay = await betPlacement.placeParlay(parlayRequest);
      
      expect(parlay).toBeDefined();
      expect(parlay.betType).toBe(BetType.PARLAY);
      expect(parlay.status).toBe(BetStatus.PENDING);
      expect(parlay.stake).toBe(25);
      expect(parlay.parlayLegs).toHaveLength(3);
      
      // Calculate expected payout
      const decimalOdds = [2.5, 1.909, 1.909]; // +150, -110, -110
      const parlayOdds = decimalOdds.reduce((acc, odd) => acc * odd, 1);
      const expectedPayout = 25 * parlayOdds;
      expect(parlay.potentialPayout).toBeCloseTo(expectedPayout, 2);
    });
    
    it('should manage bet slip correctly', async () => {
      const slipId = `slip-${testUserId}-${testLeagueId}`;
      
      // Add selections to slip
      await betPlacement.addToSlip(slipId, {
        gameId: 'game-1',
        eventDate: new Date(Date.now() + 86400000),
        marketType: MarketType.H2H,
        selection: 'Team A',
        odds: -120,
        homeTeam: 'Team A',
        awayTeam: 'Team B',
      });
      
      await betPlacement.addToSlip(slipId, {
        gameId: 'game-2',
        eventDate: new Date(Date.now() + 86400000),
        marketType: MarketType.SPREADS,
        selection: 'Team C -3.5',
        line: -3.5,
        odds: -110,
        homeTeam: 'Team C',
        awayTeam: 'Team D',
      });
      
      // Get slip
      const slip = await betPlacement.getSlip(slipId);
      expect(slip?.selections).toHaveLength(2);
      
      // Remove one selection
      await betPlacement.removeFromSlip(slipId, 'game-1', MarketType.H2H);
      
      const updatedSlip = await betPlacement.getSlip(slipId);
      expect(updatedSlip?.selections).toHaveLength(1);
      expect(updatedSlip?.selections[0].gameId).toBe('game-2');
      
      // Clear slip
      await betPlacement.clearSlip(slipId);
      const clearedSlip = await betPlacement.getSlip(slipId);
      expect(clearedSlip?.selections).toHaveLength(0);
    });
  });
  
  describe('Bet Settlement', () => {
    let bankrollId: string;
    let betId: string;
    let parlayId: string;
    
    beforeEach(async () => {
      const bankroll = await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        testWeek
      );
      bankrollId = bankroll.id;
      
      // Place a single bet
      const singleBet = await betPlacement.placeBet({
        leagueId: testLeagueId,
        userId: testUserId,
        gameId: 'game-123',
        eventDate: new Date(),
        betType: BetType.STRAIGHT,
        marketType: MarketType.H2H,
        selection: 'Home Team',
        odds: -110,
        stake: 55,
        potentialPayout: 105,
      });
      betId = singleBet.id;
      
      // Place a parlay
      const parlay = await betPlacement.placeParlay({
        leagueId: testLeagueId,
        userId: testUserId,
        stake: 20,
        legs: [
          {
            gameId: 'game-1',
            eventDate: new Date(),
            marketType: MarketType.H2H,
            selection: 'Team A',
            odds: -150,
          },
          {
            gameId: 'game-2',
            eventDate: new Date(),
            marketType: MarketType.TOTALS,
            selection: 'Over 45.5',
            line: 45.5,
            odds: 110,
          },
        ],
      });
      parlayId = parlay.id;
    });
    
    it('should settle a winning single bet', async () => {
      const gameResult = {
        gameId: 'game-123',
        homeScore: 24,
        awayScore: 17,
        status: 'COMPLETED' as const,
      };
      
      const settlement = await settlementEngine.settleBet(betId, gameResult);
      
      expect(settlement).toBeDefined();
      expect(settlement.result).toBe(BetResult.WIN);
      expect(settlement.actualPayout).toBeCloseTo(105, 2);
      
      // Verify bankroll was updated
      const updatedBankroll = await prisma.bankroll.findUnique({
        where: { id: bankrollId },
      });
      expect(updatedBankroll?.currentBalance).toBeCloseTo(1050, 2); // 945 (after bets) + 105
      expect(updatedBankroll?.wonBets).toBe(1);
    });
    
    it('should settle a losing single bet', async () => {
      const gameResult = {
        gameId: 'game-123',
        homeScore: 17,
        awayScore: 24,
        status: 'COMPLETED' as const,
      };
      
      const settlement = await settlementEngine.settleBet(betId, gameResult);
      
      expect(settlement).toBeDefined();
      expect(settlement.result).toBe(BetResult.LOSS);
      expect(settlement.actualPayout).toBe(0);
      
      // Verify bankroll wasn't changed (already deducted stake)
      const updatedBankroll = await prisma.bankroll.findUnique({
        where: { id: bankrollId },
      });
      expect(updatedBankroll?.lostBets).toBe(1);
    });
    
    it('should settle a parlay with mixed results', async () => {
      const gameResults = [
        {
          gameId: 'game-1',
          homeScore: 21,
          awayScore: 14,
          status: 'COMPLETED' as const,
        },
        {
          gameId: 'game-2',
          homeScore: 24,
          awayScore: 20, // Total: 44, Under 45.5
          status: 'COMPLETED' as const,
        },
      ];
      
      // Settle the parlay with all game results
      const settlement = await settlementEngine.settleParlayBet(parlayId, gameResults);
      
      expect(settlement).toBeDefined();
      expect(settlement.result).toBe(BetResult.LOSS); // One leg lost
      expect(settlement.actualPayout).toBe(0);
    });
    
    it('should handle push in parlay correctly', async () => {
      // Create a new parlay with a potential push
      const pushParlay = await betPlacement.placeParlay({
        leagueId: testLeagueId,
        userId: testUserId,
        stake: 30,
        legs: [
          {
            gameId: 'game-push-1',
            eventDate: new Date(),
            marketType: MarketType.SPREADS,
            selection: 'Team X -3',
            line: -3,
            odds: -110,
          },
          {
            gameId: 'game-push-2',
            eventDate: new Date(),
            marketType: MarketType.H2H,
            selection: 'Team Y',
            odds: 150,
          },
        ],
      });
      
      const gameResults = [
        {
          gameId: 'game-push-1',
          homeScore: 24,
          awayScore: 21, // Exactly 3 point difference - PUSH
          status: 'COMPLETED' as const,
        },
        {
          gameId: 'game-push-2',
          homeScore: 28,
          awayScore: 21, // Team Y wins
          status: 'COMPLETED' as const,
        },
      ];
      
      const settlement = await settlementEngine.settleParlayBet(pushParlay.id, gameResults);
      
      expect(settlement).toBeDefined();
      expect(settlement.result).toBe(BetResult.WIN); // Push reduces parlay, other leg wins
      // Payout should be calculated with only the winning leg
      const expectedPayout = 30 * 2.5; // Only the +150 leg
      expect(settlement.actualPayout).toBeCloseTo(expectedPayout, 2);
    });
  });
  
  describe('Payout Calculations', () => {
    it('should calculate single bet payouts correctly', () => {
      // American odds: -150
      const payout1 = payoutCalculator.calculateSinglePayout(100, -150);
      expect(payout1).toBeCloseTo(166.67, 2);
      
      // American odds: +200
      const payout2 = payoutCalculator.calculateSinglePayout(50, 200);
      expect(payout2).toBeCloseTo(150, 2);
      
      // American odds: -110 (standard)
      const payout3 = payoutCalculator.calculateSinglePayout(110, -110);
      expect(payout3).toBeCloseTo(210, 2);
    });
    
    it('should calculate parlay payouts correctly', () => {
      const legs = [
        { odds: -110 }, // 1.909
        { odds: 150 },  // 2.5
        { odds: -200 }, // 1.5
      ];
      
      const payout = payoutCalculator.calculateParlayPayout(25, legs);
      const expectedPayout = 25 * 1.909 * 2.5 * 1.5;
      expect(payout).toBeCloseTo(expectedPayout, 2);
    });
    
    it('should handle push in parlay calculations', () => {
      const legs = [
        { odds: -110, result: BetResult.WIN },
        { odds: 150, result: BetResult.PUSH }, // This leg is removed
        { odds: -130, result: BetResult.WIN },
      ];
      
      const payout = payoutCalculator.calculateParlayPayoutWithResults(50, legs);
      const expectedPayout = 50 * 1.909 * 1.769; // Only winning legs
      expect(payout).toBeCloseTo(expectedPayout, 2);
    });
    
    it('should calculate expected value correctly', () => {
      const ev = payoutCalculator.calculateExpectedValue(100, 150, 0.45);
      // EV = (0.45 * 150) - (0.55 * 100) = 67.5 - 55 = 12.5
      expect(ev).toBeCloseTo(12.5, 2);
    });
    
    it('should calculate Kelly Criterion correctly', () => {
      const kelly = payoutCalculator.calculateKellyCriterion(2.5, 0.45);
      // f = (bp - q) / b = (1.5 * 0.45 - 0.55) / 1.5 = 0.125 / 1.5 = 0.0833
      expect(kelly).toBeCloseTo(0.0833, 4);
    });
  });
  
  describe('Weekly Reset Flow', () => {
    it('should reset bankroll weekly and archive previous week', async () => {
      // Initialize week 10
      const week10 = await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        10
      );
      
      // Place some bets and update balance
      await bankrollManager.recordBetPlacement(week10.id, 100, BetType.STRAIGHT);
      await bankrollManager.updateBalance(week10.id, 1150, BetResult.WIN);
      
      // Initialize week 11 (should archive week 10)
      const week11 = await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        11
      );
      
      expect(week11.initialBalance).toBe(1000); // Reset to 1000
      expect(week11.week).toBe(11);
      
      // Verify week 10 was archived
      const archivedWeek10 = await prisma.bankroll.findFirst({
        where: {
          leagueId: testLeagueId,
          userId: testUserId,
          week: 10,
        },
      });
      expect(archivedWeek10?.status).toBe(BankrollStatus.ARCHIVED);
      
      // Verify stats were carried over
      const stats = await bankrollManager.getUserBettingStats(testLeagueId, testUserId);
      expect(stats.allTimeStats.totalBets).toBeGreaterThan(0);
    });
  });
  
  describe('End-to-End Betting Flow', () => {
    it('should complete full betting lifecycle', async () => {
      // 1. Initialize bankroll
      const bankroll = await bankrollManager.initializeWeeklyBankroll(
        testLeagueId,
        testUserId,
        15
      );
      expect(bankroll.currentBalance).toBe(1000);
      
      // 2. Add selections to bet slip
      const slipId = `e2e-slip-${Date.now()}`;
      await betPlacement.addToSlip(slipId, {
        gameId: 'e2e-game-1',
        eventDate: new Date(Date.now() + 86400000),
        marketType: MarketType.H2H,
        selection: 'Chiefs',
        odds: -180,
        homeTeam: 'Chiefs',
        awayTeam: 'Raiders',
      });
      
      // 3. Validate bet
      const validation = await betValidator.validateBet({
        leagueId: testLeagueId,
        userId: testUserId,
        gameId: 'e2e-game-1',
        eventDate: new Date(Date.now() + 86400000),
        betType: BetType.STRAIGHT,
        marketType: MarketType.H2H,
        selection: 'Chiefs',
        odds: -180,
        stake: 90,
        potentialPayout: 140,
      });
      expect(validation.valid).toBe(true);
      
      // 4. Place bet
      const bet = await betPlacement.placeBet({
        leagueId: testLeagueId,
        userId: testUserId,
        gameId: 'e2e-game-1',
        eventDate: new Date(),
        betType: BetType.STRAIGHT,
        marketType: MarketType.H2H,
        selection: 'Chiefs',
        odds: -180,
        stake: 90,
        potentialPayout: 140,
      });
      expect(bet.status).toBe(BetStatus.PENDING);
      
      // 5. Clear bet slip
      await betPlacement.clearSlip(slipId);
      
      // 6. Simulate game completion and settle bet
      const gameResult = {
        gameId: 'e2e-game-1',
        homeScore: 31,
        awayScore: 17,
        status: 'COMPLETED' as const,
      };
      
      const settlement = await settlementEngine.settleBet(bet.id, gameResult);
      expect(settlement.result).toBe(BetResult.WIN);
      expect(settlement.actualPayout).toBeCloseTo(140, 2);
      
      // 7. Verify final bankroll state
      const finalBankroll = await prisma.bankroll.findUnique({
        where: { id: bankroll.id },
      });
      expect(finalBankroll?.currentBalance).toBeCloseTo(1050, 2); // 1000 - 90 + 140
      expect(finalBankroll?.wonBets).toBe(1);
      expect(finalBankroll?.profitLoss).toBeCloseTo(50, 2);
      
      // 8. Get user stats
      const stats = await bankrollManager.getUserBettingStats(testLeagueId, testUserId);
      expect(stats.currentWeek.winRate).toBe(100);
      expect(stats.currentWeek.roi).toBeCloseTo(55.56, 1); // 50/90 * 100
    });
  });
});