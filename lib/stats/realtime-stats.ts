// Real-time Statistics Service
// Sprint 6: Statistics Engine - WebSocket updates for live statistics

import { Server, Socket } from 'socket.io';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { StatisticsEngine } from './statistics-engine';
import {
  StatsUpdateEvent,
  RecordBrokenEvent,
  CalculationProgressEvent,
  RecordType,
  CalculationType,
  AllTimeRecord,
  HeadToHeadRecord,
  PerformanceTrend,
} from '@/types/statistics';

const prisma = new PrismaClient();

export class RealtimeStatsService {
  private io: Server;
  private statsEngine: StatisticsEngine;
  private redis: Redis;
  private subClient: Redis;
  private pubClient: Redis;
  private leagueRooms: Map<string, Set<string>> = new Map(); // leagueId -> Set of socketIds

  constructor(io: Server, redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.io = io;
    this.redis = new Redis(redisUrl);
    this.subClient = this.redis.duplicate();
    this.pubClient = this.redis.duplicate();
    this.statsEngine = new StatisticsEngine(redisUrl);
    
    this.initializeSubscriptions();
    this.setupSocketHandlers();
  }

  private initializeSubscriptions() {
    // Subscribe to Redis channels for stats updates
    this.subClient.subscribe(
      'matchup:update',
      'stats:calculate',
      'stats:complete',
      'stats:failed',
      'stats:progress',
      'record:broken'
    );

    this.subClient.on('message', async (channel, message) => {
      try {
        const data = JSON.parse(message);
        
        switch (channel) {
          case 'matchup:update':
            await this.handleMatchupUpdate(data);
            break;
          case 'stats:calculate':
            await this.handleStatsCalculation(data);
            break;
          case 'stats:complete':
            await this.handleStatsComplete(data);
            break;
          case 'stats:failed':
            await this.handleStatsFailed(data);
            break;
          case 'stats:progress':
            await this.handleStatsProgress(data);
            break;
          case 'record:broken':
            await this.handleRecordBroken(data);
            break;
        }
      } catch (error) {
        console.error(`[RealtimeStats] Error handling ${channel} message:`, error);
      }
    });
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[RealtimeStats] Client connected: ${socket.id}`);

      // Handle league subscription
      socket.on('subscribe:league', async (leagueId: string) => {
        await this.subscribeToLeague(socket.id, leagueId);
      });

      // Handle league unsubscription
      socket.on('unsubscribe:league', async (leagueId: string) => {
        await this.unsubscribeFromLeague(socket.id, leagueId);
      });

      // Handle stats calculation request
      socket.on('calculate:stats', async (data: any) => {
        await this.handleCalculateRequest(socket, data);
      });

      // Handle stats query
      socket.on('query:stats', async (data: any) => {
        await this.handleStatsQuery(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`[RealtimeStats] Client disconnected: ${socket.id}`);
        this.removeSocketFromAllRooms(socket.id);
      });
    });
  }

  private async handleMatchupUpdate(data: any) {
    const { leagueId, season, week, teamId, score } = data;
    console.log(`[RealtimeStats] Matchup update for league ${leagueId}, week ${week}`);

    // Trigger incremental stats update
    await this.statsEngine.queueCalculation({
      leagueId,
      calculationType: CalculationType.SEASON,
      seasonId: season,
      priority: 5, // Higher priority for live updates
    });

    // Get updated stats from cache
    const cacheKey = `stats:${leagueId}:season:${season}`;
    const cachedStats = await this.redis.get(cacheKey);

    if (cachedStats) {
      const updateEvent: StatsUpdateEvent = {
        type: 'SEASON',
        leagueId,
        seasonId: season,
        week,
        teamId,
        data: JSON.parse(cachedStats),
        timestamp: new Date(),
      };

      // Emit to all clients in the league room
      this.emitToLeague(leagueId, 'stats:update', updateEvent);
    }

    // Check for new records
    await this.checkForNewRecords(leagueId, data);
  }

  private async checkForNewRecords(leagueId: string, matchupData: any) {
    // Get current records
    const currentRecords = await prisma.allTimeRecord.findMany({
      where: { leagueId },
    });

    const recordChecks = [
      {
        type: RecordType.HIGHEST_SINGLE_GAME_SCORE,
        value: matchupData.score,
        check: (record: AllTimeRecord) => 
          matchupData.score > Number(record.recordValue),
      },
      // Add more record checks as needed
    ];

    for (const check of recordChecks) {
      const record = currentRecords.find(r => r.recordType === check.type);
      
      if (record && check.check(record)) {
        // New record broken!
        const recordBrokenEvent: RecordBrokenEvent = {
          type: check.type,
          oldRecord: record,
          newValue: check.value,
          achievedBy: matchupData.teamId,
          achievedByName: matchupData.teamName,
          date: new Date(),
          metadata: {
            week: matchupData.week,
            season: matchupData.season,
          },
        };

        // Emit record broken event
        this.emitToLeague(leagueId, 'record:broken', recordBrokenEvent);

        // Publish to Redis for other services
        await this.pubClient.publish('record:broken', JSON.stringify(recordBrokenEvent));

        // Queue record recalculation
        await this.statsEngine.queueCalculation({
          leagueId,
          calculationType: CalculationType.RECORDS,
        });
      }
    }
  }

  private async handleStatsCalculation(data: any) {
    const event: CalculationProgressEvent = {
      jobId: data.jobId,
      leagueId: data.leagueId,
      calculationType: data.calculationType,
      status: 'IN_PROGRESS' as any,
      message: 'Calculation started',
    };

    this.emitToLeague(data.leagueId, 'stats:calculating', event);
  }

  private async handleStatsComplete(data: any) {
    const { leagueId, calculationType, executionTime } = data;
    
    const event: CalculationProgressEvent = {
      jobId: data.jobId,
      leagueId,
      calculationType,
      status: 'COMPLETED' as any,
      executionTime,
      message: 'Calculation completed successfully',
    };

    this.emitToLeague(leagueId, 'stats:ready', event);

    // Send updated data based on calculation type
    await this.broadcastUpdatedStats(leagueId, calculationType);
  }

  private async handleStatsFailed(data: any) {
    const event: CalculationProgressEvent = {
      jobId: data.jobId,
      leagueId: data.leagueId,
      calculationType: data.calculationType,
      status: 'FAILED' as any,
      message: `Calculation failed: ${data.error}`,
    };

    this.emitToLeague(data.leagueId, 'stats:error', event);
  }

  private async handleStatsProgress(data: any) {
    const event: CalculationProgressEvent = {
      jobId: data.jobId,
      leagueId: data.leagueId,
      calculationType: data.calculationType,
      status: 'IN_PROGRESS' as any,
      progress: data.progress,
      message: `Processing: ${data.progress}% complete`,
    };

    this.emitToLeague(data.leagueId, 'stats:progress', event);
  }

  private async handleRecordBroken(data: RecordBrokenEvent) {
    // This is already a RecordBrokenEvent, just broadcast it
    const leagueId = data.oldRecord?.leagueId;
    if (leagueId) {
      this.emitToLeague(leagueId, 'record:broken', data);
    }
  }

  private async broadcastUpdatedStats(leagueId: string, calculationType: CalculationType) {
    switch (calculationType) {
      case CalculationType.HEAD_TO_HEAD:
        const h2h = await prisma.headToHeadRecord.findMany({
          where: { leagueId },
          take: 50,
        });
        this.emitToLeague(leagueId, 'h2h:update', h2h);
        break;

      case CalculationType.RECORDS:
        const records = await prisma.allTimeRecord.findMany({
          where: { leagueId },
        });
        this.emitToLeague(leagueId, 'records:update', records);
        break;

      case CalculationType.TRENDS:
        const trends = await prisma.performanceTrend.findMany({
          where: { leagueId },
          orderBy: { calculatedAt: 'desc' },
          take: 50,
        });
        this.emitToLeague(leagueId, 'trends:update', trends);
        break;

      case CalculationType.CHAMPIONSHIPS:
        const championships = await prisma.championshipRecord.findMany({
          where: { leagueId },
          orderBy: { season: 'desc' },
        });
        this.emitToLeague(leagueId, 'championships:update', championships);
        break;

      case CalculationType.SEASON:
        const seasonStats = await prisma.seasonStatistics.findMany({
          where: { leagueId },
          orderBy: { wins: 'desc' },
        });
        this.emitToLeague(leagueId, 'season:update', seasonStats);
        break;

      case CalculationType.ALL:
        // Send all updated stats
        const allStats = {
          seasonStats: await prisma.seasonStatistics.findMany({
            where: { leagueId },
            orderBy: { wins: 'desc' },
            take: 20,
          }),
          records: await prisma.allTimeRecord.findMany({
            where: { leagueId },
          }),
          trends: await prisma.performanceTrend.findMany({
            where: { leagueId },
            orderBy: { calculatedAt: 'desc' },
            take: 20,
          }),
        };
        this.emitToLeague(leagueId, 'all:update', allStats);
        break;
    }
  }

  private async handleCalculateRequest(socket: Socket, data: any) {
    try {
      const { leagueId, calculationType, seasonId, forceRecalculate } = data;

      // Validate request
      if (!leagueId || !calculationType) {
        socket.emit('error', { message: 'Missing required parameters' });
        return;
      }

      // Queue calculation
      const jobId = await this.statsEngine.queueCalculation({
        leagueId,
        calculationType,
        seasonId,
        forceRecalculate,
      });

      socket.emit('calculation:queued', { 
        jobId, 
        message: 'Calculation queued successfully' 
      });
    } catch (error) {
      console.error('[RealtimeStats] Error queueing calculation:', error);
      socket.emit('error', { 
        message: 'Failed to queue calculation',
        error: (error as Error).message 
      });
    }
  }

  private async handleStatsQuery(socket: Socket, data: any) {
    try {
      const { leagueId, type, teamId, seasonId } = data;

      let result: any;

      switch (type) {
        case 'season':
          result = await prisma.seasonStatistics.findMany({
            where: { 
              leagueId,
              ...(seasonId && { season: seasonId }),
              ...(teamId && { teamId }),
            },
            orderBy: { wins: 'desc' },
          });
          break;

        case 'records':
          result = await prisma.allTimeRecord.findMany({
            where: { leagueId },
          });
          break;

        case 'h2h':
          if (teamId) {
            result = await prisma.headToHeadRecord.findMany({
              where: {
                leagueId,
                OR: [
                  { team1Id: teamId },
                  { team2Id: teamId },
                ],
              },
            });
          } else {
            result = await prisma.headToHeadRecord.findMany({
              where: { leagueId },
              take: 50,
            });
          }
          break;

        case 'trends':
          result = await prisma.performanceTrend.findMany({
            where: {
              leagueId,
              ...(teamId && { entityId: teamId }),
            },
            orderBy: { calculatedAt: 'desc' },
            take: 20,
          });
          break;

        case 'championships':
          result = await prisma.championshipRecord.findMany({
            where: { leagueId },
            orderBy: { season: 'desc' },
          });
          break;

        default:
          socket.emit('error', { message: 'Invalid query type' });
          return;
      }

      socket.emit('stats:response', {
        type,
        data: result,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('[RealtimeStats] Error querying stats:', error);
      socket.emit('error', { 
        message: 'Failed to query statistics',
        error: (error as Error).message 
      });
    }
  }

  async subscribeToLeague(socketId: string, leagueId: string) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) return;

    // Join Socket.IO room
    await socket.join(`league:${leagueId}`);

    // Track subscription
    if (!this.leagueRooms.has(leagueId)) {
      this.leagueRooms.set(leagueId, new Set());
    }
    this.leagueRooms.get(leagueId)!.add(socketId);

    console.log(`[RealtimeStats] Socket ${socketId} subscribed to league ${leagueId}`);

    // Send initial stats from cache
    const cacheKey = `stats:${leagueId}:current`;
    const cachedStats = await this.redis.get(cacheKey);
    
    if (cachedStats) {
      socket.emit('stats:initial', JSON.parse(cachedStats));
    } else {
      // Send basic stats if no cache
      const seasonStats = await prisma.seasonStatistics.findMany({
        where: { leagueId },
        orderBy: { wins: 'desc' },
        take: 10,
      });
      
      const records = await prisma.allTimeRecord.findMany({
        where: { leagueId },
        take: 10,
      });

      socket.emit('stats:initial', {
        seasonStats,
        records,
        timestamp: new Date(),
      });
    }
  }

  async unsubscribeFromLeague(socketId: string, leagueId: string) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) return;

    // Leave Socket.IO room
    await socket.leave(`league:${leagueId}`);

    // Remove from tracking
    const roomSockets = this.leagueRooms.get(leagueId);
    if (roomSockets) {
      roomSockets.delete(socketId);
      if (roomSockets.size === 0) {
        this.leagueRooms.delete(leagueId);
      }
    }

    console.log(`[RealtimeStats] Socket ${socketId} unsubscribed from league ${leagueId}`);
  }

  private removeSocketFromAllRooms(socketId: string) {
    for (const [leagueId, sockets] of this.leagueRooms) {
      if (sockets.has(socketId)) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          this.leagueRooms.delete(leagueId);
        }
      }
    }
  }

  private emitToLeague(leagueId: string, event: string, data: any) {
    this.io.to(`league:${leagueId}`).emit(event, data);
  }

  async publishUpdate(channel: string, data: any) {
    await this.pubClient.publish(channel, JSON.stringify(data));
  }

  async shutdown() {
    await this.statsEngine.shutdown();
    this.subClient.disconnect();
    this.pubClient.disconnect();
    this.redis.disconnect();
  }
}