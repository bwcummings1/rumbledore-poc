import { RedisCache } from './redis-cache';

export enum CacheNamespace {
  LEAGUE = 'league',
  TEAM = 'team',
  PLAYER = 'player',
  MATCHUP = 'matchup',
  TRANSACTION = 'transaction',
  SCORES = 'scores',
  STANDINGS = 'standings',
  ROSTER = 'roster',
  NEWS = 'news',
}

export class CacheManager {
  private cache: RedisCache;
  private ttlConfig: Record<CacheNamespace, number>;
  private static instance: CacheManager;

  private constructor() {
    this.cache = new RedisCache();
    
    // Configure TTLs for different data types (in seconds)
    this.ttlConfig = {
      [CacheNamespace.LEAGUE]: 600,      // 10 minutes
      [CacheNamespace.TEAM]: 300,        // 5 minutes
      [CacheNamespace.PLAYER]: 1800,     // 30 minutes
      [CacheNamespace.MATCHUP]: 60,      // 1 minute (live data)
      [CacheNamespace.TRANSACTION]: 300, // 5 minutes
      [CacheNamespace.SCORES]: 30,       // 30 seconds (very live)
      [CacheNamespace.STANDINGS]: 300,   // 5 minutes
      [CacheNamespace.ROSTER]: 600,      // 10 minutes
      [CacheNamespace.NEWS]: 3600,       // 1 hour
    };
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  async getLeague(leagueId: string): Promise<any> {
    return this.cache.get(CacheNamespace.LEAGUE, leagueId);
  }

  async setLeague(leagueId: string, data: any): Promise<void> {
    return this.cache.set(
      CacheNamespace.LEAGUE,
      leagueId,
      data,
      this.ttlConfig[CacheNamespace.LEAGUE]
    );
  }

  async getTeam(leagueId: string, teamId: string): Promise<any> {
    return this.cache.get(CacheNamespace.TEAM, `${leagueId}:${teamId}`);
  }

  async setTeam(leagueId: string, teamId: string, data: any): Promise<void> {
    return this.cache.set(
      CacheNamespace.TEAM,
      `${leagueId}:${teamId}`,
      data,
      this.ttlConfig[CacheNamespace.TEAM]
    );
  }

  async getPlayer(leagueId: string, playerId: string): Promise<any> {
    return this.cache.get(CacheNamespace.PLAYER, `${leagueId}:${playerId}`);
  }

  async setPlayer(leagueId: string, playerId: string, data: any): Promise<void> {
    return this.cache.set(
      CacheNamespace.PLAYER,
      `${leagueId}:${playerId}`,
      data,
      this.ttlConfig[CacheNamespace.PLAYER]
    );
  }

  async getScores(leagueId: string, week: number): Promise<any> {
    return this.cache.get(CacheNamespace.SCORES, `${leagueId}:${week}`);
  }

  async setScores(leagueId: string, week: number, data: any): Promise<void> {
    return this.cache.set(
      CacheNamespace.SCORES,
      `${leagueId}:${week}`,
      data,
      this.ttlConfig[CacheNamespace.SCORES]
    );
  }

  async getMatchup(leagueId: string, week: number, matchupId: string): Promise<any> {
    return this.cache.get(CacheNamespace.MATCHUP, `${leagueId}:${week}:${matchupId}`);
  }

  async setMatchup(leagueId: string, week: number, matchupId: string, data: any): Promise<void> {
    return this.cache.set(
      CacheNamespace.MATCHUP,
      `${leagueId}:${week}:${matchupId}`,
      data,
      this.ttlConfig[CacheNamespace.MATCHUP]
    );
  }

  async getTransactions(leagueId: string, offset = 0): Promise<any> {
    return this.cache.get(CacheNamespace.TRANSACTION, `${leagueId}:${offset}`);
  }

  async setTransactions(leagueId: string, offset: number, data: any): Promise<void> {
    return this.cache.set(
      CacheNamespace.TRANSACTION,
      `${leagueId}:${offset}`,
      data,
      this.ttlConfig[CacheNamespace.TRANSACTION]
    );
  }

  async getStandings(leagueId: string): Promise<any> {
    return this.cache.get(CacheNamespace.STANDINGS, leagueId);
  }

  async setStandings(leagueId: string, data: any): Promise<void> {
    return this.cache.set(
      CacheNamespace.STANDINGS,
      leagueId,
      data,
      this.ttlConfig[CacheNamespace.STANDINGS]
    );
  }

  async getRoster(leagueId: string, teamId: string, week?: number): Promise<any> {
    const key = week ? `${leagueId}:${teamId}:${week}` : `${leagueId}:${teamId}`;
    return this.cache.get(CacheNamespace.ROSTER, key);
  }

  async setRoster(leagueId: string, teamId: string, data: any, week?: number): Promise<void> {
    const key = week ? `${leagueId}:${teamId}:${week}` : `${leagueId}:${teamId}`;
    return this.cache.set(
      CacheNamespace.ROSTER,
      key,
      data,
      this.ttlConfig[CacheNamespace.ROSTER]
    );
  }

  async getPlayerNews(playerId: string): Promise<any> {
    return this.cache.get(CacheNamespace.NEWS, playerId);
  }

  async setPlayerNews(playerId: string, data: any): Promise<void> {
    return this.cache.set(
      CacheNamespace.NEWS,
      playerId,
      data,
      this.ttlConfig[CacheNamespace.NEWS]
    );
  }

  async invalidateLeague(leagueId: string): Promise<void> {
    // Clear all league-related caches
    await Promise.all([
      this.cache.delete(CacheNamespace.LEAGUE, leagueId),
      this.cache.delete(CacheNamespace.STANDINGS, leagueId),
      this.clearLeagueNamespace(CacheNamespace.TEAM, leagueId),
      this.clearLeagueNamespace(CacheNamespace.MATCHUP, leagueId),
      this.clearLeagueNamespace(CacheNamespace.SCORES, leagueId),
      this.clearLeagueNamespace(CacheNamespace.TRANSACTION, leagueId),
      this.clearLeagueNamespace(CacheNamespace.ROSTER, leagueId),
    ]);
  }

  private async clearLeagueNamespace(namespace: CacheNamespace, leagueId: string): Promise<void> {
    // This would need to scan and delete all keys with the leagueId prefix
    // For now, we'll just clear the namespace (not ideal in production)
    // In production, you'd want to track keys or use Redis patterns
    await this.cache.clearNamespace(`${namespace}:${leagueId}`);
  }

  async warmCache(leagueId: string): Promise<void> {
    // Pre-populate cache with frequently accessed data
    console.log(`Warming cache for league ${leagueId}`);
    // Implementation depends on specific needs
    // Could fetch and cache:
    // - Current week scores
    // - Team standings
    // - Active rosters
    // - Recent transactions
  }

  async getCacheStats(): Promise<{
    namespace: CacheNamespace;
    ttl: number;
    description: string;
  }[]> {
    return Object.entries(this.ttlConfig).map(([namespace, ttl]) => ({
      namespace: namespace as CacheNamespace,
      ttl,
      description: this.getNamespaceDescription(namespace as CacheNamespace),
    }));
  }

  private getNamespaceDescription(namespace: CacheNamespace): string {
    const descriptions: Record<CacheNamespace, string> = {
      [CacheNamespace.LEAGUE]: 'League settings and metadata',
      [CacheNamespace.TEAM]: 'Team information and records',
      [CacheNamespace.PLAYER]: 'Player stats and projections',
      [CacheNamespace.MATCHUP]: 'Live matchup data',
      [CacheNamespace.TRANSACTION]: 'Recent league transactions',
      [CacheNamespace.SCORES]: 'Live scoring data',
      [CacheNamespace.STANDINGS]: 'League standings',
      [CacheNamespace.ROSTER]: 'Team rosters',
      [CacheNamespace.NEWS]: 'Player news and updates',
    };
    return descriptions[namespace];
  }

  async flushAll(): Promise<void> {
    await this.cache.flush();
  }
}

export const cacheManager = CacheManager.getInstance();