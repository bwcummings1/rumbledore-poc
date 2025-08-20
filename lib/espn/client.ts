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

export class ESPNClient {
  private baseUrl = 'https://fantasy.espn.com/apis/v3/games/ffl';
  private rateLimiter: RateLimiter;
  private config: ESPNConfig;

  constructor(config: ESPNConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter({
      maxRequests: 30,
      windowMs: 60000, // 30 requests per minute
    });
  }

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
            const status = error.statusCode || error.response?.status;
            return status === 429 || status >= 500;
          },
        }
      );

      return await response.json();
    } catch (error) {
      handleESPNError(error);
    }
  }

  async getLeague(): Promise<ESPNLeague> {
    const { seasonId, leagueId } = this.config;
    return this.makeRequest<ESPNLeague>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mTeam&view=mRoster&view=mSettings&view=mSchedule&view=mStandings`
    );
  }

  async getScoreboard(scoringPeriodId?: number): Promise<ESPNScoreboard> {
    const { seasonId, leagueId } = this.config;
    const params = scoringPeriodId ? `&scoringPeriodId=${scoringPeriodId}` : '';
    return this.makeRequest<ESPNScoreboard>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mScoreboard&view=mMatchupScore${params}`
    );
  }

  async getPlayers(filters?: PlayerFilters): Promise<ESPNPlayer[]> {
    const { seasonId, leagueId } = this.config;
    const filterParam = filters ? this.buildFilterParam(filters) : '';
    const response = await this.makeRequest<{ players: ESPNPlayer[] }>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}/players?view=players_wl${filterParam}`
    );
    return response.players || [];
  }

  async getBoxScore(matchupId: number, scoringPeriodId: number): Promise<ESPNBoxScore> {
    const { seasonId, leagueId } = this.config;
    return this.makeRequest<ESPNBoxScore>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mBoxscore&view=mMatchupScore&matchupPeriodId=${matchupId}&scoringPeriodId=${scoringPeriodId}`
    );
  }

  async getTransactions(offset = 0, limit = 25): Promise<ESPNTransaction[]> {
    const { seasonId, leagueId } = this.config;
    const response = await this.makeRequest<{ transactions?: ESPNTransaction[] }>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}/transactions?offset=${offset}&limit=${limit}`
    );
    return response.transactions || [];
  }

  async getRoster(teamId: number, scoringPeriodId?: number): Promise<ESPNTeam | null> {
    const { seasonId, leagueId } = this.config;
    const params = scoringPeriodId ? `&scoringPeriodId=${scoringPeriodId}` : '';
    const response = await this.makeRequest<{ teams: ESPNTeam[] }>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mRoster&view=mTeam&teamId=${teamId}${params}`
    );
    return response.teams?.[0] || null;
  }

  async getRecentActivity(scoringPeriodId?: number): Promise<any> {
    const { seasonId, leagueId } = this.config;
    const params = scoringPeriodId ? `&scoringPeriodId=${scoringPeriodId}` : '';
    return this.makeRequest(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=kona_league_communication${params}`
    );
  }

  async getPlayerNews(playerId: number): Promise<any> {
    return this.makeRequest(
      `/players/${playerId}/news`
    );
  }

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
      
      const slotId = positionMap[filters.position];
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
      filterObj.players = {
        ...filterObj.players,
        filterStatsForCurrentScoringPeriod: {
          value: true,
          additionalValue: [`00${filters.seasonId || 2024}`, `10${filters.scoringPeriodId}`]
        }
      };
    }
    
    return filterObj.players ? `&x-fantasy-filter=${encodeURIComponent(JSON.stringify(filterObj))}` : '';
  }

  getRateLimiterStatus(): {
    remainingRequests: number;
    resetTime: number;
  } {
    return {
      remainingRequests: this.rateLimiter.getRemainingRequests(),
      resetTime: this.rateLimiter.getResetTime(),
    };
  }

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