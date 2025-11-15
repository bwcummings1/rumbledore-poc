import { withRetry, ESPN_RETRY_CONFIG } from '@/lib/retry';
import { getCookieManager } from '@/lib/crypto/cookie-manager';
import { ESPNError, handleESPNError } from './error-handler';
import { RateLimiter } from './rate-limiter';
import {
  ESPNLeague,
  ESPNPlayer,
  ESPNMatchup,
  ESPNTeam
} from '@/types/espn';

export interface ESPNConfig {
  leagueId: number;
  seasonId: number;
  cookies: {
    swid: string;
    espnS2: string;
  };
}

export interface PlayerFilters {
  playerIds?: number[];
  position?: string;
  teamId?: number;
  scoringPeriodId?: number;
  seasonId?: number;
}

export interface ESPNScoreboard {
  matchupPeriodId: number;
  scoringPeriodId: number;
  schedule: ESPNMatchup[];
  teams: ESPNTeam[];
}

export interface ESPNBoxScore {
  schedule: ESPNMatchup[];
  teams: ESPNTeam[];
}

export interface ESPNTransaction {
  id: number;
  bidAmount: number;
  executionType: string;
  isActingAsOwner: boolean;
  isLeagueManager: boolean;
  isPending: boolean;
  items: Array<{
    playerId: number;
    type: string;
    fromTeamId?: number;
    toTeamId?: number;
  }>;
  proposedDate: number;
  rating: number;
  status: string;
  subOrder: number;
  teamId: number;
  type: string;
}

/**
 * ESPN Fantasy Football API Client
 *
 * Provides methods to interact with ESPN's Fantasy Football API.
 * Includes rate limiting (30 requests/minute) and automatic retries.
 *
 * @example
 * ```typescript
 * const client = new ESPNClient({
 *   leagueId: 123456,
 *   seasonId: 2024,
 *   cookies: { swid: '...', espnS2: '...' }
 * });
 *
 * const league = await client.getLeague();
 * ```
 */
export class ESPNClient {
  private baseUrl = 'https://fantasy.espn.com/apis/v3/games/ffl';
  private rateLimiter: RateLimiter;
  private config: ESPNConfig;

  constructor(config: ESPNConfig) {
    // Validate configuration
    if (!config.leagueId || config.leagueId <= 0) {
      throw new Error('Invalid leagueId: must be a positive number');
    }
    if (!config.seasonId || config.seasonId < 2000 || config.seasonId > 2100) {
      throw new Error('Invalid seasonId: must be between 2000 and 2100');
    }
    if (!config.cookies?.swid || !config.cookies?.espnS2) {
      throw new Error('Invalid cookies: both swid and espnS2 are required');
    }

    this.config = config;
    this.rateLimiter = new RateLimiter({
      maxRequests: 30,
      windowMs: 60000, // 30 requests per minute
    });
  }

  /**
   * Make an authenticated request to the ESPN API
   * @private
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.rateLimiter.acquire();

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Cookie': `SWID={${this.config.cookies.swid}}; espn_s2=${this.config.cookies.espnS2}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; Rumbledore/1.0)',
      ...options.headers,
    };

    try {
      const response = await withRetry(
        async () => {
          const res = await fetch(url, { ...options, headers });
          if (!res.ok) {
            const error = new Error(`ESPN API error: ${res.status} ${res.statusText}`);
            (error as any).response = res;
            (error as any).statusCode = res.status;
            throw error;
          }
          return res;
        },
        {
          ...ESPN_RETRY_CONFIG,
          shouldRetry: (error) => {
            const status = (error as any).statusCode || (error as any).response?.status;
            return status === 429 || status >= 500;
          },
        }
      );

      return await response.json();
    } catch (error) {
      throw handleESPNError(error);
    }
  }

  /**
   * Fetch complete league data including teams, rosters, settings, and schedule
   * @returns Promise<ESPNLeague> Complete league data
   */
  async getLeague(): Promise<ESPNLeague> {
    const { seasonId, leagueId } = this.config;
    return this.makeRequest<ESPNLeague>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mTeam&view=mRoster&view=mSettings&view=mSchedule&view=mStandings`
    );
  }

  /**
   * Fetch scoreboard for a specific scoring period
   * @param scoringPeriodId - Optional scoring period (week number)
   * @returns Promise<ESPNScoreboard> Scoreboard with matchups and scores
   */
  async getScoreboard(scoringPeriodId?: number): Promise<ESPNScoreboard> {
    const { seasonId, leagueId } = this.config;
    const params = scoringPeriodId ? `&scoringPeriodId=${scoringPeriodId}` : '';
    return this.makeRequest<ESPNScoreboard>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mScoreboard&view=mMatchupScore${params}`
    );
  }

  /**
   * Fetch players with optional filters
   * @param filters - Optional filters (position, playerIds, etc.)
   * @returns Promise<ESPNPlayer[]> Array of players
   */
  async getPlayers(filters?: PlayerFilters): Promise<ESPNPlayer[]> {
    const { seasonId, leagueId } = this.config;
    const filterParam = filters ? this.buildFilterParam(filters) : '';
    const response = await this.makeRequest<{ players: ESPNPlayer[] }>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}/players?view=players_wl${filterParam}`
    );
    return response.players || [];
  }

  /**
   * Fetch detailed box score for a specific matchup
   * @param matchupId - Matchup period ID
   * @param scoringPeriodId - Scoring period (week number)
   * @returns Promise<ESPNBoxScore> Detailed matchup data
   */
  async getBoxScore(matchupId: number, scoringPeriodId: number): Promise<ESPNBoxScore> {
    const { seasonId, leagueId } = this.config;
    return this.makeRequest<ESPNBoxScore>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mBoxscore&view=mMatchupScore&matchupPeriodId=${matchupId}&scoringPeriodId=${scoringPeriodId}`
    );
  }

  /**
   * Fetch league transactions with pagination
   * @param offset - Starting offset for pagination
   * @param limit - Maximum number of transactions to return
   * @returns Promise<ESPNTransaction[]> Array of transactions
   */
  async getTransactions(offset = 0, limit = 25): Promise<ESPNTransaction[]> {
    const { seasonId, leagueId } = this.config;

    // Validate pagination parameters
    if (offset < 0) offset = 0;
    if (limit < 1 || limit > 100) limit = 25;

    const response = await this.makeRequest<{ transactions?: ESPNTransaction[] }>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}/transactions?offset=${offset}&limit=${limit}`
    );
    return response.transactions || [];
  }

  /**
   * Fetch roster for a specific team
   * @param teamId - ESPN team ID
   * @param scoringPeriodId - Optional scoring period (week number)
   * @returns Promise<ESPNTeam | null> Team data with roster
   */
  async getRoster(teamId: number, scoringPeriodId?: number): Promise<ESPNTeam | null> {
    const { seasonId, leagueId } = this.config;
    const params = scoringPeriodId ? `&scoringPeriodId=${scoringPeriodId}` : '';
    const response = await this.makeRequest<{ teams: ESPNTeam[] }>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mRoster&view=mTeam&teamId=${teamId}${params}`
    );
    return response.teams?.[0] || null;
  }

  /**
   * Fetch recent league activity and communications
   * @param scoringPeriodId - Optional scoring period (week number)
   * @returns Promise<any> Recent activity data
   */
  async getRecentActivity(scoringPeriodId?: number): Promise<any> {
    const { seasonId, leagueId } = this.config;
    const params = scoringPeriodId ? `&scoringPeriodId=${scoringPeriodId}` : '';
    return this.makeRequest(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=kona_league_communication${params}`
    );
  }

  /**
   * Fetch news for a specific player
   * @param playerId - ESPN player ID
   * @returns Promise<any> Player news data
   */
  async getPlayerNews(playerId: number): Promise<any> {
    return this.makeRequest(
      `/players/${playerId}/news`
    );
  }

  /**
   * Build ESPN API filter parameter from filters object
   * @private
   */
  private buildFilterParam(filters: PlayerFilters): string {
    const filterObj: any = {};

    if (filters.playerIds && filters.playerIds.length > 0) {
      filterObj.players = {
        filterIds: {
          value: filters.playerIds
        }
      };
    }

    if (filters.position) {
      const positionMap: Record<string, number> = {
        'QB': 0,
        'RB': 2,
        'WR': 4,
        'TE': 6,
        'D/ST': 16,
        'K': 17,
        'FLEX': 23,
      };

      const slotId = positionMap[filters.position.toUpperCase()];
      if (slotId !== undefined) {
        filterObj.players = {
          ...filterObj.players,
          filterSlotIds: {
            value: [slotId]
          }
        };
      }
    }

    if (filters.scoringPeriodId) {
      const seasonId = filters.seasonId || this.config.seasonId;
      filterObj.players = {
        ...filterObj.players,
        filterStatsForCurrentScoringPeriod: {
          value: true,
          additionalValue: [`00${seasonId}`, `10${filters.scoringPeriodId}`]
        }
      };
    }

    return filterObj.players ? `&x-fantasy-filter=${encodeURIComponent(JSON.stringify(filterObj))}` : '';
  }

  /**
   * Get current rate limiter status
   * @returns Rate limiter status with remaining requests and reset time
   */
  getRateLimiterStatus(): {
    remainingRequests: number;
    resetTime: number;
  } {
    return {
      remainingRequests: this.rateLimiter.getRemainingRequests(),
      resetTime: this.rateLimiter.getResetTime(),
    };
  }

  /**
   * Test connection to ESPN API
   * @returns Promise<boolean> True if connection successful
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getLeague();
      return true;
    } catch (error) {
      console.error('ESPN connection test failed:', error);
      return false;
    }
  }
}
