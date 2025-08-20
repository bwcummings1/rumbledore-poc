import { ESPNClient } from '@/lib/espn/client';
import { RateLimiter } from '@/lib/espn/rate-limiter';

// Mock fetch globally
global.fetch = jest.fn();

describe('ESPNClient', () => {
  let client: ESPNClient;
  const mockConfig = {
    leagueId: 123456,
    seasonId: 2024,
    cookies: {
      swid: 'mock-swid-value',
      espnS2: 'mock-espn-s2-value',
    },
  };

  beforeEach(() => {
    client = new ESPNClient(mockConfig);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct config', () => {
      expect(client).toBeDefined();
      expect(client.getRateLimiterStatus).toBeDefined();
    });
  });

  describe('getLeague', () => {
    it('should fetch league data successfully', async () => {
      const mockLeagueData = {
        id: 123456,
        name: 'Test League',
        seasonId: 2024,
        teams: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockLeagueData,
      });

      const result = await client.getLeague();

      expect(result).toEqual(mockLeagueData);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/seasons/2024/segments/0/leagues/123456'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: expect.stringContaining('SWID={mock-swid-value}'),
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(client.getLeague()).rejects.toThrow();
    });
  });

  describe('getScoreboard', () => {
    it('should fetch scoreboard data with scoring period', async () => {
      const mockScoreboardData = {
        matchupPeriodId: 1,
        scoringPeriodId: 1,
        schedule: [],
        teams: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockScoreboardData,
      });

      const result = await client.getScoreboard(1);

      expect(result).toEqual(mockScoreboardData);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('scoringPeriodId=1'),
        expect.any(Object)
      );
    });
  });

  describe('getPlayers', () => {
    it('should fetch players with filters', async () => {
      const mockPlayersData = {
        players: [
          { id: 1, fullName: 'Player 1' },
          { id: 2, fullName: 'Player 2' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPlayersData,
      });

      const result = await client.getPlayers({
        position: 'QB',
        playerIds: [1, 2],
      });

      expect(result).toEqual(mockPlayersData.players);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('x-fantasy-filter='),
        expect.any(Object)
      );
    });

    it('should return empty array when no players', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await client.getPlayers();
      expect(result).toEqual([]);
    });
  });

  describe('getTransactions', () => {
    it('should fetch transactions with pagination', async () => {
      const mockTransactions = {
        transactions: [
          { id: 1, type: 'TRADE' },
          { id: 2, type: 'WAIVER' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransactions,
      });

      const result = await client.getTransactions(10, 20);

      expect(result).toEqual(mockTransactions.transactions);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=10&limit=20'),
        expect.any(Object)
      );
    });
  });

  describe('testConnection', () => {
    it('should return true when connection is successful', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 123456 }),
      });

      const result = await client.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when connection fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      const result = await client.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('getRateLimiterStatus', () => {
    it('should return rate limiter status', () => {
      const status = client.getRateLimiterStatus();
      
      expect(status).toHaveProperty('remainingRequests');
      expect(status).toHaveProperty('resetTime');
      expect(typeof status.remainingRequests).toBe('number');
      expect(typeof status.resetTime).toBe('number');
    });
  });
});

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      maxRequests: 3,
      windowMs: 1000,
    });
  });

  it('should allow requests under the limit', async () => {
    await expect(rateLimiter.acquire()).resolves.toBeUndefined();
    await expect(rateLimiter.acquire()).resolves.toBeUndefined();
    await expect(rateLimiter.acquire()).resolves.toBeUndefined();
  });

  it('should delay requests over the limit', async () => {
    // Acquire all available requests
    await rateLimiter.acquire();
    await rateLimiter.acquire();
    await rateLimiter.acquire();
    
    // Fourth request should be delayed
    const start = Date.now();
    await rateLimiter.acquire();
    const elapsed = Date.now() - start;
    
    // Should have waited at least some time
    expect(elapsed).toBeGreaterThan(0);
  });

  it('should reset after window expires', async () => {
    await rateLimiter.acquire();
    await rateLimiter.acquire();
    await rateLimiter.acquire();
    
    expect(rateLimiter.getRemainingRequests()).toBe(0);
    
    // Wait for window to reset
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    expect(rateLimiter.getRemainingRequests()).toBe(3);
  });
});