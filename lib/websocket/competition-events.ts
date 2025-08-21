/**
 * Competition WebSocket Events
 * 
 * Handles real-time events for competitions:
 * - Leaderboard updates
 * - Achievement unlocks
 * - Competition status changes
 * - Reward distributions
 * - Live participant updates
 */

import { Server as SocketIOServer } from 'socket.io';
import { LeaderboardEntry, Achievement, CompetitionReward } from '@/types/betting';
import { logger } from '@/lib/logger';

export interface CompetitionEventHandlers {
  onLeaderboardUpdate: (competitionId: string, standings: LeaderboardEntry[]) => void;
  onAchievementUnlocked: (userId: string, achievements: Achievement[]) => void;
  onCompetitionStatusChange: (competitionId: string, status: string) => void;
  onRewardsDistributed: (competitionId: string, rewards: CompetitionReward[]) => void;
  onParticipantJoined: (competitionId: string, participant: any) => void;
  onParticipantLeft: (competitionId: string, userId: string) => void;
  onRecordBroken: (competitionId: string, record: any) => void;
}

export class CompetitionWebSocketService {
  private io: SocketIOServer;
  private competitionRooms: Map<string, Set<string>> = new Map();
  private userSockets: Map<string, string> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupEventHandlers();
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Competition WebSocket client connected', { socketId: socket.id });

      // Handle joining competition rooms
      socket.on('join-competition', async (data: { competitionId: string; userId: string }) => {
        const { competitionId, userId } = data;
        
        // Join the competition room
        socket.join(`competition:${competitionId}`);
        
        // Track user socket
        this.userSockets.set(userId, socket.id);
        
        // Track competition participants
        if (!this.competitionRooms.has(competitionId)) {
          this.competitionRooms.set(competitionId, new Set());
        }
        this.competitionRooms.get(competitionId)!.add(userId);
        
        logger.info('User joined competition room', {
          socketId: socket.id,
          competitionId,
          userId,
        });
        
        // Send current participant count
        const participantCount = this.competitionRooms.get(competitionId)!.size;
        socket.emit('competition-participants', {
          competitionId,
          count: participantCount,
        });
      });

      // Handle leaving competition rooms
      socket.on('leave-competition', (data: { competitionId: string; userId: string }) => {
        const { competitionId, userId } = data;
        
        socket.leave(`competition:${competitionId}`);
        
        // Remove from tracking
        if (this.competitionRooms.has(competitionId)) {
          this.competitionRooms.get(competitionId)!.delete(userId);
        }
        
        logger.info('User left competition room', {
          socketId: socket.id,
          competitionId,
          userId,
        });
      });

      // Handle subscribing to leaderboard updates
      socket.on('subscribe-leaderboard', (competitionId: string) => {
        socket.join(`leaderboard:${competitionId}`);
        logger.info('Socket subscribed to leaderboard', {
          socketId: socket.id,
          competitionId,
        });
      });

      // Handle unsubscribing from leaderboard updates
      socket.on('unsubscribe-leaderboard', (competitionId: string) => {
        socket.leave(`leaderboard:${competitionId}`);
        logger.info('Socket unsubscribed from leaderboard', {
          socketId: socket.id,
          competitionId,
        });
      });

      // Handle subscribing to achievement updates
      socket.on('subscribe-achievements', (userId: string) => {
        socket.join(`achievements:${userId}`);
        logger.info('Socket subscribed to achievements', {
          socketId: socket.id,
          userId,
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        // Clean up user socket tracking
        for (const [userId, socketId] of this.userSockets.entries()) {
          if (socketId === socket.id) {
            this.userSockets.delete(userId);
            
            // Remove from all competition rooms
            for (const [competitionId, participants] of this.competitionRooms.entries()) {
              participants.delete(userId);
            }
            break;
          }
        }
        
        logger.info('Competition WebSocket client disconnected', { socketId: socket.id });
      });
    });
  }

  /**
   * Emit leaderboard update to all subscribers
   */
  emitLeaderboardUpdate(
    competitionId: string,
    standings: LeaderboardEntry[],
    significantMoves?: LeaderboardEntry[]
  ) {
    const room = `leaderboard:${competitionId}`;
    
    this.io.to(room).emit('leaderboard-update', {
      competitionId,
      standings: standings.slice(0, 100), // Send top 100
      significantMoves,
      timestamp: new Date(),
    });
    
    logger.info('Emitted leaderboard update', {
      competitionId,
      room,
      standingsCount: standings.length,
    });
  }

  /**
   * Emit achievement unlocked event to user
   */
  emitAchievementUnlocked(userId: string, achievements: Achievement[]) {
    const room = `achievements:${userId}`;
    
    this.io.to(room).emit('achievement-unlocked', {
      userId,
      achievements,
      timestamp: new Date(),
    });
    
    // Also emit to user's direct socket if connected
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('achievement-notification', {
        achievements,
        message: `You unlocked ${achievements.length} new achievement${achievements.length > 1 ? 's' : ''}!`,
      });
    }
    
    logger.info('Emitted achievement unlocked', {
      userId,
      achievementCount: achievements.length,
    });
  }

  /**
   * Emit competition status change
   */
  emitCompetitionStatusChange(
    competitionId: string,
    oldStatus: string,
    newStatus: string
  ) {
    const room = `competition:${competitionId}`;
    
    this.io.to(room).emit('competition-status-change', {
      competitionId,
      oldStatus,
      newStatus,
      timestamp: new Date(),
    });
    
    logger.info('Emitted competition status change', {
      competitionId,
      oldStatus,
      newStatus,
    });
  }

  /**
   * Emit rewards distributed event
   */
  emitRewardsDistributed(
    competitionId: string,
    rewards: CompetitionReward[]
  ) {
    const room = `competition:${competitionId}`;
    
    this.io.to(room).emit('rewards-distributed', {
      competitionId,
      rewards,
      timestamp: new Date(),
    });
    
    // Send individual notifications to reward recipients
    for (const reward of rewards) {
      const socketId = this.userSockets.get(reward.userId);
      if (socketId) {
        this.io.to(socketId).emit('reward-received', {
          competitionId,
          reward,
          message: `You received ${reward.amount} ${reward.type} for placing #${reward.rank}!`,
        });
      }
    }
    
    logger.info('Emitted rewards distributed', {
      competitionId,
      rewardCount: rewards.length,
    });
  }

  /**
   * Emit participant joined event
   */
  emitParticipantJoined(
    competitionId: string,
    participant: {
      userId: string;
      userName: string;
      teamName?: string;
    }
  ) {
    const room = `competition:${competitionId}`;
    
    this.io.to(room).emit('participant-joined', {
      competitionId,
      participant,
      participantCount: this.competitionRooms.get(competitionId)?.size || 0,
      timestamp: new Date(),
    });
    
    logger.info('Emitted participant joined', {
      competitionId,
      userId: participant.userId,
    });
  }

  /**
   * Emit participant left event
   */
  emitParticipantLeft(competitionId: string, userId: string) {
    const room = `competition:${competitionId}`;
    
    this.io.to(room).emit('participant-left', {
      competitionId,
      userId,
      participantCount: this.competitionRooms.get(competitionId)?.size || 0,
      timestamp: new Date(),
    });
    
    logger.info('Emitted participant left', {
      competitionId,
      userId,
    });
  }

  /**
   * Emit record broken event
   */
  emitRecordBroken(
    competitionId: string,
    record: {
      type: string;
      oldValue: number;
      newValue: number;
      userId: string;
      userName: string;
    }
  ) {
    const room = `competition:${competitionId}`;
    
    this.io.to(room).emit('record-broken', {
      competitionId,
      record,
      timestamp: new Date(),
    });
    
    // Special notification for record breaker
    const socketId = this.userSockets.get(record.userId);
    if (socketId) {
      this.io.to(socketId).emit('record-notification', {
        message: `Congratulations! You broke the ${record.type} record!`,
        oldValue: record.oldValue,
        newValue: record.newValue,
      });
    }
    
    logger.info('Emitted record broken', {
      competitionId,
      recordType: record.type,
      userId: record.userId,
    });
  }

  /**
   * Broadcast live update to competition room
   */
  broadcastToCompetition(
    competitionId: string,
    event: string,
    data: any
  ) {
    const room = `competition:${competitionId}`;
    this.io.to(room).emit(event, {
      ...data,
      competitionId,
      timestamp: new Date(),
    });
  }

  /**
   * Get active participant count for a competition
   */
  getActiveParticipants(competitionId: string): number {
    return this.competitionRooms.get(competitionId)?.size || 0;
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  /**
   * Get all active competitions
   */
  getActiveCompetitions(): string[] {
    return Array.from(this.competitionRooms.keys());
  }
}

// Singleton instance
let competitionWebSocketService: CompetitionWebSocketService | null = null;

/**
 * Initialize the competition WebSocket service
 */
export function initializeCompetitionWebSocket(io: SocketIOServer): CompetitionWebSocketService {
  if (!competitionWebSocketService) {
    competitionWebSocketService = new CompetitionWebSocketService(io);
  }
  return competitionWebSocketService;
}

/**
 * Get the competition WebSocket service instance
 */
export function getCompetitionWebSocket(): CompetitionWebSocketService {
  if (!competitionWebSocketService) {
    throw new Error('Competition WebSocket service not initialized');
  }
  return competitionWebSocketService;
}