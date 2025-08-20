# Sprint 3: Data Ingestion Pipeline

## Sprint Overview
**Phase**: 1 - ESPN Foundation & Core Infrastructure  
**Sprint**: 3 of 4  
**Duration**: 2 weeks  
**Focus**: Build robust data ingestion pipeline for real-time ESPN data synchronization  
**Risk Level**: Medium (External API dependency, rate limiting concerns)

## Objectives
1. Implement ESPN API client with intelligent rate limiting
2. Build queue system for asynchronous data processing
3. Create data transformation and normalization layer
4. Set up WebSocket infrastructure for live updates
5. Implement comprehensive caching strategy with Redis
6. Establish error recovery and retry mechanisms

## Prerequisites
- Sprint 2 completed (ESPN authentication working)
- ESPN cookies stored and validated
- Redis running and accessible
- PostgreSQL schema from Sprint 1
- Basic API structure established

## Technical Tasks

### Task 1: ESPN API Client Implementation (Day 1-3)

#### 1.1 Core API Client
```typescript
// lib/espn/client.ts
import { withRetry } from '@/lib/utils/retry';
import { CookieManager } from '@/lib/crypto/cookie-manager';
import { ESPNError, handleESPNError } from './error-handler';
import { RateLimiter } from './rate-limiter';

export interface ESPNConfig {
  leagueId: number;
  seasonId: number;
  cookies: {
    swid: string;
    espnS2: string;
  };
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
            throw { response: res };
          }
          return res;
        },
        {
          maxAttempts: 3,
          shouldRetry: (error) => {
            const status = error.response?.status;
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
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mTeam&view=mRoster&view=mSettings`
    );
  }

  async getScoreboard(scoringPeriodId?: number): Promise<ESPNScoreboard> {
    const { seasonId, leagueId } = this.config;
    const params = scoringPeriodId ? `&scoringPeriodId=${scoringPeriodId}` : '';
    return this.makeRequest<ESPNScoreboard>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mScoreboard${params}`
    );
  }

  async getPlayers(filters?: PlayerFilters): Promise<ESPNPlayer[]> {
    const { seasonId, leagueId } = this.config;
    const filterParam = filters ? this.buildFilterParam(filters) : '';
    return this.makeRequest<{ players: ESPNPlayer[] }>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}/players?view=players_wl${filterParam}`
    ).then(data => data.players);
  }

  async getBoxScore(matchupId: number, scoringPeriodId: number): Promise<ESPNBoxScore> {
    const { seasonId, leagueId } = this.config;
    return this.makeRequest<ESPNBoxScore>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}?view=mBoxscore&matchupPeriodId=${matchupId}&scoringPeriodId=${scoringPeriodId}`
    );
  }

  async getTransactions(offset = 0, limit = 25): Promise<ESPNTransaction[]> {
    const { seasonId, leagueId } = this.config;
    return this.makeRequest<{ transactions: ESPNTransaction[] }>(
      `/seasons/${seasonId}/segments/0/leagues/${leagueId}/transactions?offset=${offset}&limit=${limit}`
    ).then(data => data.transactions);
  }

  private buildFilterParam(filters: PlayerFilters): string {
    const filterObj: any = {};
    if (filters.playerIds) {
      filterObj.players = { filterIds: { value: filters.playerIds } };
    }
    if (filters.position) {
      filterObj.players = { 
        ...filterObj.players,
        filterSlotIds: { value: [filters.position] }
      };
    }
    return `&x-fantasy-filter=${encodeURIComponent(JSON.stringify(filterObj))}`;
  }
}

// lib/espn/rate-limiter.ts
export class RateLimiter {
  private queue: Array<() => void> = [];
  private requestCount = 0;
  private windowStart = Date.now();

  constructor(
    private config: {
      maxRequests: number;
      windowMs: number;
    }
  ) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    
    // Reset window if expired
    if (now - this.windowStart >= this.config.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // If under limit, proceed immediately
    if (this.requestCount < this.config.maxRequests) {
      this.requestCount++;
      return;
    }

    // Otherwise, wait for next window
    const waitTime = this.config.windowMs - (now - this.windowStart);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Reset and proceed
    this.requestCount = 1;
    this.windowStart = Date.now();
  }
}
```

#### 1.2 Type Definitions
```typescript
// types/espn.ts
export interface ESPNLeague {
  id: number;
  name: string;
  seasonId: number;
  scoringPeriodId: number;
  currentMatchupPeriod: number;
  settings: ESPNSettings;
  teams: ESPNTeam[];
  schedule: ESPNMatchup[];
  members: ESPNMember[];
}

export interface ESPNSettings {
  name: string;
  scoringSettings: {
    scoringItems: Array<{
      pointsOverrides?: Record<string, number>;
      statId: number;
    }>;
  };
  rosterSettings: {
    lineupSlotCounts: Record<string, number>;
    positionLimits: Record<string, number>;
  };
  scheduleSettings: {
    numberOfRegularSeasonMatchups: number;
    playoffTeamCount: number;
    matchupPeriodCount: number;
  };
}

export interface ESPNTeam {
  id: number;
  abbrev: string;
  name: string;
  logo?: string;
  primaryOwner: string;
  record: {
    overall: { wins: number; losses: number; ties: number };
    home: { wins: number; losses: number; ties: number };
    away: { wins: number; losses: number; ties: number };
  };
  roster: {
    entries: ESPNRosterEntry[];
  };
  points: number;
  pointsAgainst: number;
}

export interface ESPNRosterEntry {
  playerId: number;
  playerPoolEntry: {
    player: ESPNPlayer;
  };
  lineupSlotId: number;
  acquisitionType: string;
  acquisitionDate: number;
}

export interface ESPNPlayer {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  proTeamId: number;
  defaultPositionId: number;
  eligibleSlots: number[];
  stats: ESPNPlayerStats[];
  ownership: {
    percentOwned: number;
    percentStarted: number;
  };
  injured: boolean;
  injuryStatus: string;
}

export interface ESPNPlayerStats {
  id: string;
  seasonId: number;
  scoringPeriodId: number;
  statSourceId: number;
  statSplitTypeId: number;
  stats: Record<string, number>;
  appliedTotal?: number;
}
```

### Task 2: Queue System Implementation (Day 4-5)

#### 2.1 Bull Queue Setup
```typescript
// lib/queue/queue.ts
import Bull from 'bull';
import { redis } from '@/lib/redis';

export enum QueueName {
  LEAGUE_SYNC = 'league-sync',
  PLAYER_SYNC = 'player-sync',
  SCORE_UPDATE = 'score-update',
  TRANSACTION_SYNC = 'transaction-sync',
}

export interface QueueJob<T = any> {
  id: string;
  data: T;
  timestamp: number;
  attempts?: number;
}

export class QueueManager {
  private queues: Map<QueueName, Bull.Queue> = new Map();

  constructor() {
    this.initializeQueues();
  }

  private initializeQueues() {
    Object.values(QueueName).forEach(name => {
      const queue = new Bull(name, {
        redis: {
          port: 6379,
          host: 'localhost',
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      this.queues.set(name as QueueName, queue);
    });
  }

  getQueue(name: QueueName): Bull.Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue ${name} not found`);
    }
    return queue;
  }

  async addJob<T>(
    queueName: QueueName,
    data: T,
    options?: Bull.JobOptions
  ): Promise<Bull.Job<T>> {
    const queue = this.getQueue(queueName);
    return queue.add(data, options);
  }

  async processQueue<T>(
    queueName: QueueName,
    processor: (job: Bull.Job<T>) => Promise<void>
  ) {
    const queue = this.getQueue(queueName);
    queue.process(processor);
  }

  async getJobCounts(queueName: QueueName) {
    const queue = this.getQueue(queueName);
    return queue.getJobCounts();
  }

  async cleanQueue(queueName: QueueName) {
    const queue = this.getQueue(queueName);
    await queue.clean(0, 'completed');
    await queue.clean(0, 'failed');
  }
}

// lib/queue/processors/league-sync.ts
import { Job } from 'bull';
import { ESPNClient } from '@/lib/espn/client';
import { DataTransformer } from '@/lib/transform/transformer';
import { prisma } from '@/lib/prisma';

export interface LeagueSyncJob {
  leagueId: string;
  userId: string;
  fullSync?: boolean;
}

export async function processLeagueSync(job: Job<LeagueSyncJob>) {
  const { leagueId, userId, fullSync } = job.data;
  
  console.log(`Processing league sync for ${leagueId}`);
  
  try {
    // Get credentials
    const credentials = await prisma.espnCredential.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
      include: { league: true },
    });

    if (!credentials) {
      throw new Error('No credentials found');
    }

    // Initialize ESPN client
    const client = new ESPNClient({
      leagueId: Number(credentials.league.espnLeagueId),
      seasonId: credentials.league.season,
      cookies: {
        swid: await decrypt(credentials.encryptedSwid),
        espnS2: await decrypt(credentials.encryptedEspnS2),
      },
    });

    // Fetch league data
    const leagueData = await client.getLeague();
    
    // Transform data
    const transformer = new DataTransformer();
    const transformed = await transformer.transformLeague(leagueData);
    
    // Store in database
    await prisma.$transaction(async (tx) => {
      // Update league settings
      await tx.league.update({
        where: { id: leagueId },
        data: {
          settings: transformed.settings,
          updatedAt: new Date(),
        },
      });

      // Update teams
      for (const team of transformed.teams) {
        await tx.leagueTeam.upsert({
          where: {
            leagueId_espnTeamId: {
              leagueId,
              espnTeamId: team.espnTeamId,
            },
          },
          update: team,
          create: {
            ...team,
            leagueId,
          },
        });
      }

      // Update players if full sync
      if (fullSync) {
        for (const player of transformed.players) {
          await tx.leaguePlayer.upsert({
            where: {
              leagueId_espnPlayerId: {
                leagueId,
                espnPlayerId: player.espnPlayerId,
              },
            },
            update: player,
            create: {
              ...player,
              leagueId,
            },
          });
        }
      }
    });

    // Update job progress
    await job.progress(100);
    
    console.log(`League sync completed for ${leagueId}`);
  } catch (error) {
    console.error(`League sync failed for ${leagueId}:`, error);
    throw error;
  }
}
```

### Task 3: Data Transformation Layer (Day 6-7)

#### 3.1 Data Transformer
```typescript
// lib/transform/transformer.ts
import { 
  ESPNLeague, 
  ESPNTeam, 
  ESPNPlayer,
  ESPNMatchup,
  ESPNTransaction 
} from '@/types/espn';
import { 
  LeagueData,
  TeamData,
  PlayerData,
  MatchupData 
} from '@/types/database';

export class DataTransformer {
  /**
   * Transform ESPN league data to database format
   */
  async transformLeague(espnLeague: ESPNLeague): Promise<LeagueData> {
    return {
      settings: this.transformSettings(espnLeague.settings),
      teams: espnLeague.teams.map(team => this.transformTeam(team)),
      players: this.extractPlayers(espnLeague.teams),
      currentWeek: espnLeague.scoringPeriodId,
      lastSync: new Date(),
    };
  }

  /**
   * Transform league settings
   */
  private transformSettings(settings: ESPNSettings): any {
    return {
      name: settings.name,
      scoring: this.transformScoringSettings(settings.scoringSettings),
      roster: this.transformRosterSettings(settings.rosterSettings),
      schedule: {
        regularSeasonLength: settings.scheduleSettings.numberOfRegularSeasonMatchups,
        playoffTeams: settings.scheduleSettings.playoffTeamCount,
        totalWeeks: settings.scheduleSettings.matchupPeriodCount,
      },
    };
  }

  /**
   * Transform scoring settings to readable format
   */
  private transformScoringSettings(scoring: any): Record<string, number> {
    const scoringMap: Record<string, number> = {};
    
    const statIdToName: Record<number, string> = {
      3: 'passingYards',
      4: 'passingTouchdowns',
      19: 'passing2PtConversions',
      20: 'passingInterceptions',
      24: 'rushingYards',
      25: 'rushingTouchdowns',
      26: 'rushing2PtConversions',
      42: 'receivingYards',
      43: 'receivingTouchdowns',
      44: 'receiving2PtConversions',
      53: 'receivingReceptions',
      // Add more mappings as needed
    };

    scoring.scoringItems?.forEach((item: any) => {
      const statName = statIdToName[item.statId];
      if (statName && item.pointsOverrides) {
        Object.entries(item.pointsOverrides).forEach(([key, value]) => {
          scoringMap[statName] = value as number;
        });
      }
    });

    return scoringMap;
  }

  /**
   * Transform roster settings
   */
  private transformRosterSettings(roster: any): any {
    const positionMap: Record<string, string> = {
      '0': 'QB',
      '2': 'RB',
      '4': 'WR',
      '6': 'TE',
      '16': 'D/ST',
      '17': 'K',
      '20': 'BENCH',
      '23': 'FLEX',
      // Add more mappings
    };

    const positions: Record<string, number> = {};
    
    Object.entries(roster.lineupSlotCounts || {}).forEach(([slotId, count]) => {
      const position = positionMap[slotId];
      if (position && count > 0) {
        positions[position] = count as number;
      }
    });

    return {
      positions,
      rosterSize: Object.values(positions).reduce((sum, count) => sum + count, 0),
    };
  }

  /**
   * Transform team data
   */
  private transformTeam(team: ESPNTeam): TeamData {
    return {
      espnTeamId: team.id,
      name: team.name,
      abbrev: team.abbrev,
      logo: team.logo,
      wins: team.record.overall.wins,
      losses: team.record.overall.losses,
      ties: team.record.overall.ties,
      pointsFor: team.points,
      pointsAgainst: team.pointsAgainst,
      roster: team.roster.entries.map(entry => ({
        playerId: entry.playerId,
        lineupSlotId: entry.lineupSlotId,
        acquisitionType: entry.acquisitionType,
        acquisitionDate: new Date(entry.acquisitionDate),
      })),
    };
  }

  /**
   * Extract all unique players from teams
   */
  private extractPlayers(teams: ESPNTeam[]): PlayerData[] {
    const playerMap = new Map<number, PlayerData>();

    teams.forEach(team => {
      team.roster.entries.forEach(entry => {
        const player = entry.playerPoolEntry.player;
        if (!playerMap.has(player.id)) {
          playerMap.set(player.id, this.transformPlayer(player));
        }
      });
    });

    return Array.from(playerMap.values());
  }

  /**
   * Transform player data
   */
  private transformPlayer(player: ESPNPlayer): PlayerData {
    const positionMap: Record<number, string> = {
      1: 'QB',
      2: 'RB',
      3: 'WR',
      4: 'TE',
      5: 'K',
      16: 'D/ST',
    };

    return {
      espnPlayerId: player.id,
      name: player.fullName,
      firstName: player.firstName,
      lastName: player.lastName,
      position: positionMap[player.defaultPositionId] || 'UNKNOWN',
      nflTeam: this.getNFLTeamAbbrev(player.proTeamId),
      injured: player.injured,
      injuryStatus: player.injuryStatus,
      percentOwned: player.ownership?.percentOwned || 0,
      percentStarted: player.ownership?.percentStarted || 0,
      stats: this.transformPlayerStats(player.stats),
    };
  }

  /**
   * Transform player statistics
   */
  private transformPlayerStats(stats: ESPNPlayerStats[]): any {
    if (!stats || stats.length === 0) return {};

    // Get most recent stats
    const currentStats = stats[stats.length - 1];
    
    return {
      points: currentStats.appliedTotal || 0,
      projectedPoints: this.getProjectedPoints(stats),
      seasonTotal: this.getSeasonTotal(stats),
      averagePoints: this.getAveragePoints(stats),
    };
  }

  /**
   * Get NFL team abbreviation from ID
   */
  private getNFLTeamAbbrev(proTeamId: number): string {
    const teamMap: Record<number, string> = {
      1: 'ATL',
      2: 'BUF',
      3: 'CHI',
      4: 'CIN',
      5: 'CLE',
      6: 'DAL',
      7: 'DEN',
      8: 'DET',
      9: 'GB',
      10: 'TEN',
      11: 'IND',
      12: 'KC',
      13: 'LV',
      14: 'LAR',
      15: 'MIA',
      16: 'MIN',
      17: 'NE',
      18: 'NO',
      19: 'NYG',
      20: 'NYJ',
      21: 'PHI',
      22: 'ARI',
      23: 'PIT',
      24: 'LAC',
      25: 'SF',
      26: 'SEA',
      27: 'TB',
      28: 'WSH',
      29: 'CAR',
      30: 'JAX',
      33: 'BAL',
      34: 'HOU',
      // Add more as needed
    };

    return teamMap[proTeamId] || 'FA';
  }

  private getProjectedPoints(stats: ESPNPlayerStats[]): number {
    const projected = stats.find(s => s.statSourceId === 1);
    return projected?.appliedTotal || 0;
  }

  private getSeasonTotal(stats: ESPNPlayerStats[]): number {
    return stats
      .filter(s => s.statSourceId === 0)
      .reduce((sum, s) => sum + (s.appliedTotal || 0), 0);
  }

  private getAveragePoints(stats: ESPNPlayerStats[]): number {
    const actualStats = stats.filter(s => s.statSourceId === 0 && s.appliedTotal);
    if (actualStats.length === 0) return 0;
    
    const total = actualStats.reduce((sum, s) => sum + (s.appliedTotal || 0), 0);
    return Math.round((total / actualStats.length) * 10) / 10;
  }
}
```

### Task 4: WebSocket Infrastructure (Day 8-9)

#### 4.1 WebSocket Server
```typescript
// lib/websocket/server.ts
import { Server } from 'socket.io';
import { createServer } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';
import { verifyAuth } from '@/lib/auth';

export class WebSocketServer {
  private io: Server;
  private connections: Map<string, Set<string>> = new Map();

  constructor(server: any) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL,
        credentials: true,
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', async (socket) => {
      console.log('Client connected:', socket.id);

      // Authenticate
      const token = socket.handshake.auth.token;
      const user = await verifyAuth(token);
      
      if (!user) {
        socket.disconnect();
        return;
      }

      // Join user's leagues
      socket.on('join:league', async (leagueId: string) => {
        const hasAccess = await this.verifyLeagueAccess(user.id, leagueId);
        if (hasAccess) {
          socket.join(`league:${leagueId}`);
          this.trackConnection(leagueId, socket.id);
          socket.emit('joined:league', { leagueId });
        }
      });

      // Leave league
      socket.on('leave:league', (leagueId: string) => {
        socket.leave(`league:${leagueId}`);
        this.untrackConnection(leagueId, socket.id);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.removeAllConnections(socket.id);
      });
    });
  }

  private async verifyLeagueAccess(userId: string, leagueId: string): Promise<boolean> {
    const member = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: { leagueId, userId },
      },
    });
    return !!member;
  }

  private trackConnection(leagueId: string, socketId: string) {
    if (!this.connections.has(leagueId)) {
      this.connections.set(leagueId, new Set());
    }
    this.connections.get(leagueId)!.add(socketId);
  }

  private untrackConnection(leagueId: string, socketId: string) {
    this.connections.get(leagueId)?.delete(socketId);
  }

  private removeAllConnections(socketId: string) {
    this.connections.forEach(socketIds => {
      socketIds.delete(socketId);
    });
  }

  /**
   * Emit score update to league members
   */
  emitScoreUpdate(leagueId: string, data: any) {
    this.io.to(`league:${leagueId}`).emit('score:update', data);
  }

  /**
   * Emit transaction notification
   */
  emitTransaction(leagueId: string, data: any) {
    this.io.to(`league:${leagueId}`).emit('transaction:new', data);
  }

  /**
   * Emit sync status
   */
  emitSyncStatus(leagueId: string, status: 'started' | 'completed' | 'failed', progress?: number) {
    this.io.to(`league:${leagueId}`).emit('sync:status', { status, progress });
  }
}

// lib/websocket/client.ts
import { io, Socket } from 'socket.io-client';

export class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(process.env.NEXT_PUBLIC_APP_URL!, {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(error);
        }
        this.reconnectAttempts++;
      });

      this.setupEventListeners();
    });
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('score:update', (data) => {
      console.log('Score update:', data);
      // Update UI with new scores
      this.handleScoreUpdate(data);
    });

    this.socket.on('transaction:new', (data) => {
      console.log('New transaction:', data);
      // Show notification
      this.handleTransaction(data);
    });

    this.socket.on('sync:status', (data) => {
      console.log('Sync status:', data);
      // Update sync indicator
      this.handleSyncStatus(data);
    });
  }

  joinLeague(leagueId: string) {
    this.socket?.emit('join:league', leagueId);
  }

  leaveLeague(leagueId: string) {
    this.socket?.emit('leave:league', leagueId);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  private handleScoreUpdate(data: any) {
    // Dispatch to state management
    // Update React components
  }

  private handleTransaction(data: any) {
    // Show toast notification
    // Update transaction list
  }

  private handleSyncStatus(data: any) {
    // Update loading indicators
    // Show progress bars
  }
}
```

### Task 5: Caching Strategy (Day 10-11)

#### 5.1 Redis Cache Implementation
```typescript
// lib/cache/redis-cache.ts
import Redis from 'ioredis';
import { compress, decompress } from '@/lib/utils/compression';

export class RedisCache {
  private client: Redis;
  private defaultTTL = 300; // 5 minutes

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
    });

    this.client.on('error', (error) => {
      console.error('Redis error:', error);
    });
  }

  /**
   * Generate cache key with namespace
   */
  private generateKey(namespace: string, id: string): string {
    return `rumbledore:${namespace}:${id}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(namespace: string, id: string): Promise<T | null> {
    try {
      const key = this.generateKey(namespace, id);
      const compressed = await this.client.get(key);
      
      if (!compressed) {
        return null;
      }

      const decompressed = await decompress(compressed);
      return JSON.parse(decompressed);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(
    namespace: string,
    id: string,
    value: T,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    try {
      const key = this.generateKey(namespace, id);
      const json = JSON.stringify(value);
      const compressed = await compress(json);
      
      await this.client.setex(key, ttl, compressed);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(namespace: string, id: string): Promise<void> {
    try {
      const key = this.generateKey(namespace, id);
      await this.client.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Clear entire namespace
   */
  async clearNamespace(namespace: string): Promise<void> {
    try {
      const pattern = `rumbledore:${namespace}:*`;
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  /**
   * Get or set with callback
   */
  async getOrSet<T>(
    namespace: string,
    id: string,
    fetcher: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(namespace, id);
    if (cached) {
      return cached;
    }

    // Fetch fresh data
    const fresh = await fetcher();
    
    // Store in cache
    await this.set(namespace, id, fresh, ttl);
    
    return fresh;
  }

  /**
   * Batch get multiple values
   */
  async mget<T>(namespace: string, ids: string[]): Promise<(T | null)[]> {
    try {
      const keys = ids.map(id => this.generateKey(namespace, id));
      const values = await this.client.mget(...keys);
      
      return Promise.all(
        values.map(async (compressed) => {
          if (!compressed) return null;
          
          try {
            const decompressed = await decompress(compressed);
            return JSON.parse(decompressed);
          } catch {
            return null;
          }
        })
      );
    } catch (error) {
      console.error('Cache mget error:', error);
      return ids.map(() => null);
    }
  }

  /**
   * Check if key exists
   */
  async exists(namespace: string, id: string): Promise<boolean> {
    try {
      const key = this.generateKey(namespace, id);
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Get remaining TTL
   */
  async ttl(namespace: string, id: string): Promise<number> {
    try {
      const key = this.generateKey(namespace, id);
      return await this.client.ttl(key);
    } catch (error) {
      console.error('Cache ttl error:', error);
      return -1;
    }
  }
}

// lib/cache/cache-manager.ts
import { RedisCache } from './redis-cache';

export enum CacheNamespace {
  LEAGUE = 'league',
  TEAM = 'team',
  PLAYER = 'player',
  MATCHUP = 'matchup',
  TRANSACTION = 'transaction',
  SCORES = 'scores',
}

export class CacheManager {
  private cache: RedisCache;
  private ttlConfig: Record<CacheNamespace, number>;

  constructor() {
    this.cache = new RedisCache();
    
    // Configure TTLs for different data types
    this.ttlConfig = {
      [CacheNamespace.LEAGUE]: 600,      // 10 minutes
      [CacheNamespace.TEAM]: 300,        // 5 minutes
      [CacheNamespace.PLAYER]: 1800,     // 30 minutes
      [CacheNamespace.MATCHUP]: 60,      // 1 minute (live data)
      [CacheNamespace.TRANSACTION]: 300, // 5 minutes
      [CacheNamespace.SCORES]: 30,       // 30 seconds (very live)
    };
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

  async invalidateLeague(leagueId: string): Promise<void> {
    // Clear all league-related caches
    await Promise.all([
      this.cache.delete(CacheNamespace.LEAGUE, leagueId),
      this.cache.clearNamespace(`${CacheNamespace.TEAM}:${leagueId}`),
      this.cache.clearNamespace(`${CacheNamespace.MATCHUP}:${leagueId}`),
    ]);
  }

  async warmCache(leagueId: string): Promise<void> {
    // Pre-populate cache with frequently accessed data
    console.log(`Warming cache for league ${leagueId}`);
    // Implementation depends on specific needs
  }
}
```

### Task 6: Error Recovery & Monitoring (Day 12)

#### 6.1 Error Recovery System
```typescript
// lib/sync/sync-manager.ts
import { ESPNClient } from '@/lib/espn/client';
import { QueueManager } from '@/lib/queue/queue';
import { CacheManager } from '@/lib/cache/cache-manager';
import { WebSocketServer } from '@/lib/websocket/server';

export class SyncManager {
  private client: ESPNClient;
  private queue: QueueManager;
  private cache: CacheManager;
  private ws: WebSocketServer;
  private syncInProgress: Set<string> = new Set();

  constructor(ws: WebSocketServer) {
    this.queue = new QueueManager();
    this.cache = new CacheManager();
    this.ws = ws;
  }

  /**
   * Sync league data with error recovery
   */
  async syncLeague(leagueId: string, userId: string): Promise<void> {
    // Prevent duplicate syncs
    if (this.syncInProgress.has(leagueId)) {
      console.log(`Sync already in progress for league ${leagueId}`);
      return;
    }

    this.syncInProgress.add(leagueId);
    this.ws.emitSyncStatus(leagueId, 'started', 0);

    try {
      // Add to queue
      const job = await this.queue.addJob(
        QueueName.LEAGUE_SYNC,
        { leagueId, userId, fullSync: false },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );

      // Monitor progress
      job.on('progress', (progress) => {
        this.ws.emitSyncStatus(leagueId, 'started', progress);
      });

      job.on('completed', () => {
        this.syncInProgress.delete(leagueId);
        this.ws.emitSyncStatus(leagueId, 'completed', 100);
        console.log(`Sync completed for league ${leagueId}`);
      });

      job.on('failed', (error) => {
        this.syncInProgress.delete(leagueId);
        this.ws.emitSyncStatus(leagueId, 'failed');
        console.error(`Sync failed for league ${leagueId}:`, error);
        
        // Schedule retry
        this.scheduleRetry(leagueId, userId);
      });
    } catch (error) {
      this.syncInProgress.delete(leagueId);
      this.ws.emitSyncStatus(leagueId, 'failed');
      throw error;
    }
  }

  /**
   * Schedule automatic retry with backoff
   */
  private async scheduleRetry(leagueId: string, userId: string, attempt = 1) {
    const maxAttempts = 5;
    const baseDelay = 60000; // 1 minute
    
    if (attempt > maxAttempts) {
      console.error(`Max retry attempts reached for league ${leagueId}`);
      await this.notifyFailure(leagueId, userId);
      return;
    }

    const delay = baseDelay * Math.pow(2, attempt - 1);
    console.log(`Scheduling retry ${attempt} for league ${leagueId} in ${delay}ms`);

    setTimeout(() => {
      this.syncLeague(leagueId, userId).catch(() => {
        this.scheduleRetry(leagueId, userId, attempt + 1);
      });
    }, delay);
  }

  /**
   * Notify user of sync failure
   */
  private async notifyFailure(leagueId: string, userId: string) {
    // Send email or in-app notification
    console.error(`Notifying user ${userId} of sync failure for league ${leagueId}`);
  }

  /**
   * Health check for sync system
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    queues: Record<string, any>;
    cache: boolean;
  }> {
    const queueCounts = await Promise.all(
      Object.values(QueueName).map(async (name) => ({
        name,
        counts: await this.queue.getJobCounts(name),
      }))
    );

    const cacheHealthy = await this.cache.cache.exists('health', 'check');

    return {
      healthy: true,
      queues: Object.fromEntries(
        queueCounts.map(({ name, counts }) => [name, counts])
      ),
      cache: cacheHealthy,
    };
  }
}
```

## Validation Criteria

### Functionality Checklist
- [ ] ESPN API client successfully fetches data
- [ ] Rate limiting prevents API throttling
- [ ] Queue system processes jobs reliably
- [ ] Data transformation maintains accuracy
- [ ] WebSocket delivers real-time updates
- [ ] Cache improves response times
- [ ] Error recovery handles failures gracefully

### Performance Checklist
- [ ] API requests stay under rate limits (30/min)
- [ ] Data sync completes in < 5 minutes
- [ ] Cache hit ratio > 80%
- [ ] WebSocket latency < 100ms
- [ ] Queue processing < 10 seconds per job

### Quality Checklist
- [ ] All data transformations tested
- [ ] Error scenarios handled
- [ ] Monitoring in place
- [ ] Documentation complete
- [ ] Integration tests passing

## Testing Instructions

### Unit Tests
```typescript
// __tests__/lib/espn/client.test.ts
describe('ESPNClient', () => {
  it('should fetch league data', async () => {
    const client = new ESPNClient(mockConfig);
    const league = await client.getLeague();
    expect(league.id).toBe(123456);
  });

  it('should handle rate limiting', async () => {
    // Test multiple rapid requests
  });
});

// __tests__/lib/transform/transformer.test.ts
describe('DataTransformer', () => {
  it('should transform ESPN data correctly', () => {
    const transformer = new DataTransformer();
    const result = transformer.transformLeague(mockESPNData);
    expect(result.teams).toHaveLength(12);
  });
});
```

### Integration Tests
```bash
# Test full sync flow
npm run test:integration -- sync

# Test WebSocket connections
npm run test:integration -- websocket

# Test caching
npm run test:integration -- cache
```

### Manual Testing
1. Start all services: `npm run docker:up && npm run dev`
2. Trigger league sync from UI
3. Monitor WebSocket updates in browser console
4. Check Redis cache: `redis-cli KEYS "rumbledore:*"`
5. Verify queue processing: `npm run queue:monitor`

## Deliverables

### Code Deliverables
- ✅ ESPN API client with rate limiting
- ✅ Queue system with Bull
- ✅ Data transformation layer
- ✅ WebSocket server and client
- ✅ Redis caching implementation
- ✅ Error recovery system
- ✅ Monitoring and health checks

### Documentation Deliverables
- ✅ API client usage guide
- ✅ Data transformation mappings
- ✅ WebSocket event documentation
- ✅ Cache strategy documentation
- ✅ Queue processing guide

## Success Metrics
- ESPN API integration working: ✅
- Real-time updates via WebSocket: ✅
- Queue processing reliable: ✅
- Cache improving performance: ✅
- Error recovery functional: ✅
- Monitoring in place: ✅

## Handoff to Sprint 4

### What's Ready
- Complete data ingestion pipeline
- Real-time synchronization
- Robust error handling
- Performance optimization through caching

### What's Needed Next
- Historical data import capabilities
- Batch processing for large datasets
- Data deduplication
- Storage optimization

### Key Files for Next Sprint
- `/lib/espn/client.ts` - ESPN API client
- `/lib/transform/transformer.ts` - Data transformation
- `/lib/queue/queue.ts` - Queue system
- `/lib/cache/cache-manager.ts` - Caching layer

---

*Sprint 3 establishes the real-time data pipeline. This is critical for keeping league data current and responsive.*