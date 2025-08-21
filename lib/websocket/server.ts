import { Server } from 'socket.io';
import { prisma } from '@/lib/prisma';
import { ChatAgentManager } from '@/lib/ai/chat/chat-agent-manager';
import { wsConnectionPool } from './connection-pool';
import performanceMonitor from '../monitoring/performance-monitor';

export class WebSocketServer {
  private io: Server | null = null;
  private connections: Map<string, Set<string>> = new Map();
  private chatAgentManager: ChatAgentManager | null = null;
  private static instance: WebSocketServer;

  private constructor() {}

  public static getInstance(): WebSocketServer {
    if (!WebSocketServer.instance) {
      WebSocketServer.instance = new WebSocketServer();
    }
    return WebSocketServer.instance;
  }

  initialize(server: any) {
    if (this.io) {
      console.warn('WebSocket server already initialized');
      return;
    }

    this.io = new Server(server, {
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      // Performance optimizations
      perMessageDeflate: {
        threshold: 1024, // Compress messages > 1KB
      },
      httpCompression: {
        threshold: 1024,
      },
      connectTimeout: 45000,
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 10000,
      maxHttpBufferSize: 1e6, // 1MB
    });

    // Configure with connection pool optimizations
    wsConnectionPool.configureServer(this.io);

    // Initialize ChatAgentManager with the Socket.io server
    this.chatAgentManager = new ChatAgentManager(this.io);
    
    this.setupEventHandlers();
    console.log('WebSocket server initialized with AI chat integration');
  }

  private setupEventHandlers() {
    if (!this.io) return;

    this.io.on('connection', async (socket) => {
      const startTime = Date.now();
      console.log('Client connected:', socket.id);

      // Get user and league info from socket handshake
      const userId = socket.handshake.auth.userId as string;
      const leagueId = socket.handshake.auth.leagueId as string;
      
      if (!userId) {
        console.error('No userId provided in socket auth');
        socket.disconnect();
        return;
      }

      // Register with connection pool
      wsConnectionPool.registerConnection(socket, userId, leagueId);

      // Join user's personal room
      socket.join(`user:${userId}`);
      
      // Store auth info for ChatAgentManager
      socket.data.userId = userId;
      socket.data.leagueId = leagueId;

      // Track connection time
      const connectionTime = Date.now() - startTime;
      performanceMonitor.recordMetric({
        name: 'websocket.connection.time',
        value: connectionTime,
        unit: 'ms',
        timestamp: Date.now(),
      });

      // Handle joining league rooms
      socket.on('join:league', async (leagueId: string) => {
        const startTime = Date.now();
        const hasAccess = await this.verifyLeagueAccess(userId, leagueId);
        if (hasAccess) {
          socket.join(`league:${leagueId}`);
          this.trackConnection(leagueId, socket.id);
          wsConnectionPool.updateConnectionLeague(socket.id, leagueId);
          socket.emit('joined:league', { leagueId });
          console.log(`Socket ${socket.id} joined league ${leagueId}`);
          
          // Track join time
          performanceMonitor.recordMetric({
            name: 'websocket.league.join',
            value: Date.now() - startTime,
            unit: 'ms',
            timestamp: Date.now(),
          });
        } else {
          socket.emit('error:unauthorized', { 
            message: 'You do not have access to this league' 
          });
        }
      });

      // Handle leaving league rooms
      socket.on('leave:league', (leagueId: string) => {
        socket.leave(`league:${leagueId}`);
        this.untrackConnection(leagueId, socket.id);
        socket.emit('left:league', { leagueId });
        console.log(`Socket ${socket.id} left league ${leagueId}`);
      });

      // Handle sync requests
      socket.on('request:sync', async (leagueId: string) => {
        const hasAccess = await this.verifyLeagueAccess(userId, leagueId);
        if (hasAccess) {
          socket.emit('sync:requested', { leagueId });
          // Sync request would be handled by API endpoint
        }
      });

      // Handle ping/pong for latency tracking
      socket.on('pong', (timestamp: number) => {
        // Handled by connection pool
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.removeAllConnections(socket.id);
        wsConnectionPool.unregisterConnection(socket.id);
      });

      // Send initial connection confirmation
      socket.emit('connected', { 
        socketId: socket.id,
        userId,
      });
    });
  }

  private async verifyLeagueAccess(userId: string, leagueId: string): Promise<boolean> {
    try {
      const member = await prisma.leagueMember.findUnique({
        where: {
          leagueId_userId: { leagueId, userId },
        },
      });
      return !!member;
    } catch (error) {
      console.error('Error verifying league access:', error);
      return false;
    }
  }

  private trackConnection(leagueId: string, socketId: string) {
    if (!this.connections.has(leagueId)) {
      this.connections.set(leagueId, new Set());
    }
    this.connections.get(leagueId)!.add(socketId);
  }

  private untrackConnection(leagueId: string, socketId: string) {
    this.connections.get(leagueId)?.delete(socketId);
    if (this.connections.get(leagueId)?.size === 0) {
      this.connections.delete(leagueId);
    }
  }

  private removeAllConnections(socketId: string) {
    this.connections.forEach(socketIds => {
      socketIds.delete(socketId);
    });
  }

  // Public methods for emitting events

  emitToLeague(leagueId: string, event: string, data: any) {
    if (!this.io) {
      console.warn('WebSocket server not initialized');
      return;
    }
    
    // Optimize message before sending
    const optimizedData = wsConnectionPool.optimizeMessage(data);
    
    // Use compression for large messages
    if (wsConnectionPool.shouldCompress(optimizedData)) {
      this.io.to(`league:${leagueId}`).compress(true).emit(event, optimizedData);
    } else {
      this.io.to(`league:${leagueId}`).emit(event, optimizedData);
    }
  }

  emitToUser(userId: string, event: string, data: any) {
    if (!this.io) {
      console.warn('WebSocket server not initialized');
      return;
    }
    
    // Optimize message before sending
    const optimizedData = wsConnectionPool.optimizeMessage(data);
    
    // Use compression for large messages
    if (wsConnectionPool.shouldCompress(optimizedData)) {
      this.io.to(`user:${userId}`).compress(true).emit(event, optimizedData);
    } else {
      this.io.to(`user:${userId}`).emit(event, optimizedData);
    }
  }

  emitScoreUpdate(leagueId: string, data: any) {
    this.emitToLeague(leagueId, 'score:update', data);
  }

  emitTransaction(leagueId: string, data: any) {
    this.emitToLeague(leagueId, 'transaction:new', data);
  }

  emitSyncStatus(leagueId: string, status: 'started' | 'progress' | 'completed' | 'failed', progress?: number) {
    this.emitToLeague(leagueId, 'sync:status', { status, progress });
  }

  emitMatchupUpdate(leagueId: string, data: any) {
    this.emitToLeague(leagueId, 'matchup:update', data);
  }

  emitRosterUpdate(leagueId: string, teamId: string, data: any) {
    this.emitToLeague(leagueId, 'roster:update', { teamId, ...data });
  }

  emitNewsUpdate(leagueId: string, data: any) {
    this.emitToLeague(leagueId, 'news:update', data);
  }

  // Agent-specific event emitters
  
  emitAgentMessage(leagueId: string, data: {
    agentType: string;
    message: string;
    sessionId: string;
    userId?: string;
    metadata?: any;
  }) {
    this.emitToLeague(leagueId, 'agent:message', data);
  }

  emitAgentTyping(leagueId: string, data: {
    agentType: string;
    sessionId: string;
    isTyping: boolean;
  }) {
    this.emitToLeague(leagueId, 'agent:typing', data);
  }

  emitAgentArrived(leagueId: string, data: {
    agentType: string;
    message: string;
    summonedBy: string;
    reason?: string;
  }) {
    this.emitToLeague(leagueId, 'agent:arrived', data);
  }

  emitAgentDismissed(leagueId: string, data: {
    agentType: string;
    dismissedBy: string;
  }) {
    this.emitToLeague(leagueId, 'agent:dismissed', data);
  }

  emitAgentStreamChunk(socketId: string, data: {
    agentType: string;
    chunk: string;
    sessionId: string;
  }) {
    if (!this.io) {
      console.warn('WebSocket server not initialized');
      return;
    }
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('agent:stream:chunk', data);
    }
  }

  emitAgentStreamEnd(socketId: string, data: {
    agentType: string;
    sessionId: string;
    toolsUsed?: string[];
  }) {
    if (!this.io) {
      console.warn('WebSocket server not initialized');
      return;
    }
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('agent:stream:end', data);
    }
  }

  emitAgentError(socketId: string, error: {
    error: string;
    code: string;
    details?: any;
  }) {
    if (!this.io) {
      console.warn('WebSocket server not initialized');
      return;
    }
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('agent:error', error);
    }
  }

  emitAgentCommandResult(socketId: string, data: {
    command: string;
    result: any;
    sessionId: string;
  }) {
    if (!this.io) {
      console.warn('WebSocket server not initialized');
      return;
    }
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('agent:command:result', data);
    }
  }

  // Get the ChatAgentManager instance
  getChatAgentManager(): ChatAgentManager | null {
    return this.chatAgentManager;
  }

  getConnectionCount(leagueId: string): number {
    return this.connections.get(leagueId)?.size || 0;
  }

  getAllConnections(): Map<string, number> {
    const result = new Map<string, number>();
    this.connections.forEach((socketIds, leagueId) => {
      result.set(leagueId, socketIds.size);
    });
    return result;
  }

  getPoolMetrics() {
    return wsConnectionPool.getMetrics();
  }

  isInitialized(): boolean {
    return this.io !== null;
  }
}

export const wsServer = WebSocketServer.getInstance();