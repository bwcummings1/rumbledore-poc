/**
 * The Odds API Client
 * 
 * Handles fetching real-time betting odds from The Odds API with:
 * - Intelligent caching (5-minute TTL)
 * - Rate limiting (500 requests/month)
 * - Historical snapshot storage
 * - Error handling and retries
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { getRedis } from '../redis';
import { prisma } from '../prisma';
import { 
  OddsApiResponse, 
  GameOdds, 
  OddsRequest,
  CachedOdds,
  RateLimitInfo,
  BettingError,
  BettingErrorCode,
  PlayerPropResponse,
  ProcessedPlayerProp,
  parseMarketType
} from '@/types/betting';
import { MarketType } from '@prisma/client';

export class OddsApiClient {
  private apiKey: string;
  private baseUrl = 'https://api.the-odds-api.com/v4';
  private axiosInstance: AxiosInstance;
  private redis;
  private cacheNamespace = 'odds';
  private cacheTTL = 300; // 5 minutes in seconds
  private rateLimit: RateLimitInfo = {
    limit: 500,
    remaining: 500,
    reset: new Date(),
    period: 'month'
  };

  constructor() {
    const apiKey = process.env.THE_ODDS_API_KEY;
    if (!apiKey || apiKey === 'your_odds_api_key_here') {
      throw new Error('THE_ODDS_API_KEY is not configured in environment variables');
    }
    
    this.apiKey = apiKey;
    this.redis = getRedis();
    
    // Configure axios instance with defaults
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      params: {
        apiKey: this.apiKey
      }
    });

    // Add response interceptor to track rate limits
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.updateRateLimit(response.headers);
        return response;
      },
      (error) => {
        if (error.response) {
          this.updateRateLimit(error.response.headers);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get NFL odds with caching
   */
  async getNFLOdds(markets: MarketType[] = [MarketType.H2H, MarketType.SPREADS, MarketType.TOTALS]): Promise<GameOdds[]> {
    const cacheKey = this.buildCacheKey('nfl', markets);
    
    // Check cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      console.log('Returning cached NFL odds');
      return cached.data;
    }

    // Check rate limit before making request
    this.checkRateLimit();

    try {
      // Fetch from API
      const marketKeys = markets.map(m => m.toLowerCase());
      const response = await this.axiosInstance.get<OddsApiResponse[]>('/sports/americanfootball_nfl/odds', {
        params: {
          regions: 'us',
          markets: marketKeys.join(','),
          oddsFormat: 'american',
          bookmakers: 'draftkings,fanduel,betmgm,caesars,pointsbetus'
        }
      });

      const odds = response.data;
      
      // Transform to internal format
      const transformedOdds = await this.transformOddsResponse(odds);
      
      // Cache the results
      await this.saveToCache(cacheKey, transformedOdds);
      
      // Store historical snapshot
      await this.storeHistoricalSnapshot(odds, 'NFL');
      
      return transformedOdds;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  /**
   * Get player props for a specific game
   */
  async getPlayerProps(gameId: string): Promise<ProcessedPlayerProp[]> {
    const cacheKey = `${this.cacheNamespace}:props:${gameId}`;
    
    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      console.log('Returning cached player props');
      return JSON.parse(cached);
    }

    // Check rate limit
    this.checkRateLimit();

    try {
      const response = await this.axiosInstance.get<PlayerPropResponse>(`/sports/americanfootball_nfl/events/${gameId}/odds`, {
        params: {
          regions: 'us',
          markets: 'player_pass_tds,player_rush_yds,player_receptions',
          oddsFormat: 'american'
        }
      });

      const props = this.transformPlayerProps(response.data);
      
      // Cache for 5 minutes
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(props));
      
      return props;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  /**
   * Get live/upcoming games
   */
  async getLiveGames(): Promise<GameOdds[]> {
    const cacheKey = `${this.cacheNamespace}:live:nfl`;
    
    // Check cache (shorter TTL for live games)
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const response = await this.axiosInstance.get<OddsApiResponse[]>('/sports/americanfootball_nfl/odds', {
        params: {
          regions: 'us',
          markets: 'h2h',
          oddsFormat: 'american'
        }
      });

      const liveGames = response.data.filter(game => {
        const commenceTime = new Date(game.commence_time);
        const now = new Date();
        const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        return commenceTime >= threeHoursAgo && commenceTime <= now;
      });

      const transformed = await this.transformOddsResponse(liveGames);
      
      // Cache for 1 minute for live games
      await this.redis.setex(cacheKey, 60, JSON.stringify(transformed));
      
      return transformed;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  /**
   * Transform API response to internal GameOdds format
   */
  private async transformOddsResponse(apiOdds: OddsApiResponse[]): Promise<GameOdds[]> {
    return apiOdds.map(game => {
      const gameOdds: GameOdds = {
        gameId: game.id,
        sport: 'NFL',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        commenceTime: new Date(game.commence_time),
        bookmakers: [],
        lastUpdate: new Date()
      };

      // Process each bookmaker
      game.bookmakers.forEach(bookmaker => {
        const processed: any = {
          key: bookmaker.key,
          name: bookmaker.title,
          lastUpdate: new Date(bookmaker.last_update)
        };

        bookmaker.markets.forEach(market => {
          switch (market.key) {
            case 'h2h':
              const homeOdds = market.outcomes.find(o => o.name === game.home_team);
              const awayOdds = market.outcomes.find(o => o.name === game.away_team);
              if (homeOdds && awayOdds) {
                processed.moneyline = {
                  home: homeOdds.price,
                  away: awayOdds.price
                };
              }
              break;
            
            case 'spreads':
              const homeSpread = market.outcomes.find(o => o.name === game.home_team);
              const awaySpread = market.outcomes.find(o => o.name === game.away_team);
              if (homeSpread && awaySpread) {
                processed.spread = {
                  home: { line: homeSpread.point || 0, odds: homeSpread.price },
                  away: { line: awaySpread.point || 0, odds: awaySpread.price }
                };
              }
              break;
            
            case 'totals':
              const over = market.outcomes.find(o => o.name === 'Over');
              const under = market.outcomes.find(o => o.name === 'Under');
              if (over && under) {
                processed.total = {
                  line: over.point || 0,
                  over: over.price,
                  under: under.price
                };
              }
              break;
          }
        });

        gameOdds.bookmakers.push(processed);
      });

      return gameOdds;
    });
  }

  /**
   * Transform player props response
   */
  private transformPlayerProps(response: PlayerPropResponse): ProcessedPlayerProp[] {
    const props: ProcessedPlayerProp[] = [];
    
    // This would need more sophisticated parsing based on actual API response
    // For now, returning empty array as placeholder
    return props;
  }

  /**
   * Store historical snapshot of odds
   */
  private async storeHistoricalSnapshot(odds: OddsApiResponse[], sport: string): Promise<void> {
    try {
      // Store each game as a snapshot
      for (const game of odds) {
        await prisma.oddsSnapshot.create({
          data: {
            sport,
            gameId: game.id,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            commenceTime: new Date(game.commence_time),
            data: game as any
          }
        });
      }
    } catch (error) {
      console.error('Failed to store historical snapshot:', error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Build cache key
   */
  private buildCacheKey(sport: string, markets: MarketType[]): string {
    const marketStr = markets.sort().join(',');
    return `${this.cacheNamespace}:${sport}:${marketStr}`;
  }

  /**
   * Get from cache
   */
  private async getFromCache(key: string): Promise<CachedOdds | null> {
    try {
      const cached = await this.redis.get(key);
      if (!cached) return null;
      
      const parsed = JSON.parse(cached);
      return {
        ...parsed,
        source: 'cache' as const
      };
    } catch (error) {
      console.error('Cache retrieval error:', error);
      return null;
    }
  }

  /**
   * Save to cache
   */
  private async saveToCache(key: string, data: GameOdds[]): Promise<void> {
    try {
      const cacheData: CachedOdds = {
        data,
        timestamp: new Date(),
        expires: new Date(Date.now() + this.cacheTTL * 1000),
        source: 'api'
      };
      
      await this.redis.setex(key, this.cacheTTL, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Cache save error:', error);
      // Don't throw - caching is non-critical
    }
  }

  /**
   * Update rate limit from response headers
   */
  private updateRateLimit(headers: any): void {
    if (headers['x-requests-remaining']) {
      this.rateLimit.remaining = parseInt(headers['x-requests-remaining'], 10);
    }
    if (headers['x-requests-used']) {
      const used = parseInt(headers['x-requests-used'], 10);
      this.rateLimit.remaining = this.rateLimit.limit - used;
    }
  }

  /**
   * Check if we're within rate limits
   */
  private checkRateLimit(): void {
    if (this.rateLimit.remaining <= 0) {
      throw new BettingError(
        'Rate limit exceeded. Please wait before making more requests.',
        BettingErrorCode.RATE_LIMIT_EXCEEDED,
        429,
        { rateLimit: this.rateLimit }
      );
    }
    
    // Warn if getting close to limit
    if (this.rateLimit.remaining < 50) {
      console.warn(`Warning: Only ${this.rateLimit.remaining} API requests remaining this month`);
    }
  }

  /**
   * Handle API errors
   */
  private handleApiError(error: any): BettingError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      if (axiosError.response?.status === 429) {
        return new BettingError(
          'Rate limit exceeded',
          BettingErrorCode.RATE_LIMIT_EXCEEDED,
          429
        );
      }
      
      if (axiosError.response?.status === 404) {
        return new BettingError(
          'Game or resource not found',
          BettingErrorCode.INVALID_GAME_ID,
          404
        );
      }
      
      return new BettingError(
        axiosError.message || 'API request failed',
        BettingErrorCode.API_ERROR,
        axiosError.response?.status,
        axiosError.response?.data
      );
    }
    
    return new BettingError(
      'Unexpected error occurred',
      BettingErrorCode.API_ERROR,
      500,
      error
    );
  }

  /**
   * Get current rate limit info
   */
  getRateLimit(): RateLimitInfo {
    return { ...this.rateLimit };
  }

  /**
   * Clear cache for specific key or all odds cache
   */
  async clearCache(key?: string): Promise<void> {
    if (key) {
      await this.redis.del(key);
    } else {
      // Clear all odds cache
      const keys = await this.redis.keys(`${this.cacheNamespace}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * Get historical odds for a specific game
   */
  async getHistoricalOdds(gameId: string): Promise<any[]> {
    const snapshots = await prisma.oddsSnapshot.findMany({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    
    return snapshots.map(s => s.data);
  }

  /**
   * Track odds movement for a game
   */
  async trackOddsMovement(gameId: string): Promise<any> {
    const current = await this.getNFLOdds();
    const currentGame = current.find(g => g.gameId === gameId);
    
    if (!currentGame) {
      throw new BettingError(
        'Game not found',
        BettingErrorCode.INVALID_GAME_ID,
        404
      );
    }
    
    const historical = await this.getHistoricalOdds(gameId);
    
    // Calculate movement (simplified - would need more complex logic)
    return {
      current: currentGame,
      historical: historical.slice(0, 10),
      movements: []
    };
  }
}