/**
 * WebSocket Connection Pool Manager
 * Optimizes WebSocket connections with pooling, compression, and monitoring
 */

import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedis } from '../redis';
import performanceMonitor from '../monitoring/performance-monitor';

export interface PoolConfig {
  maxConnectionsPerLeague: number;
  maxIdleTime: number;
  compressionThreshold: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  enableCompression: boolean;
  enableBinary: boolean;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  poolUtilization: number;
  averageLatency: number;
  packetsPerSecond: number;
  bytesPerSecond: number;
  reconnections: number;
  disconnections: number;
}

interface ConnectionInfo {
  socketId: string;
  userId: string;
  leagueId: string;
  connectedAt: Date;
  lastActivity: Date;
  latency: number;
  packetsReceived: number;
  packetsSent: number;
  bytesReceived: number;
  bytesSent: number;
}

class WebSocketConnectionPool {
  private static instance: WebSocketConnectionPool;
  private config: PoolConfig;
  private connections: Map<string, ConnectionInfo>;
  private leagueConnections: Map<string, Set<string>>;
  private userConnections: Map<string, Set<string>>;
  private metrics: ConnectionMetrics;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    this.config = this.getOptimalConfig();
    this.connections = new Map();
    this.leagueConnections = new Map();
    this.userConnections = new Map();
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      poolUtilization: 0,
      averageLatency: 0,
      packetsPerSecond: 0,
      bytesPerSecond: 0,
      reconnections: 0,
      disconnections: 0,
    };
  }

  static getInstance(): WebSocketConnectionPool {
    if (!WebSocketConnectionPool.instance) {
      WebSocketConnectionPool.instance = new WebSocketConnectionPool();
    }
    return WebSocketConnectionPool.instance;
  }

  /**
   * Get optimal pool configuration based on environment
   */
  private getOptimalConfig(): PoolConfig {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
      maxConnectionsPerLeague: isProduction ? 100 : 50,
      maxIdleTime: 300000, // 5 minutes
      compressionThreshold: 1024, // Compress messages > 1KB
      heartbeatInterval: 25000, // 25 seconds
      heartbeatTimeout: 60000, // 60 seconds
      enableCompression: true,
      enableBinary: true, // Enable binary frames for better performance
    };
  }

  /**
   * Configure Socket.io server with optimizations
   */
  configureServer(io: Server): Server {
    // Enable Redis adapter for horizontal scaling
    if (process.env.REDIS_URL) {
      const pubClient = getRedis();
      const subClient = pubClient.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      console.log('WebSocket: Redis adapter enabled for horizontal scaling');
    }

    // Configure compression and performance optimizations
    io.engine.opts = {
      ...io.engine.opts,
      // @ts-ignore - These options exist but types might be outdated
      perMessageDeflate: this.config.enableCompression && {
        threshold: this.config.compressionThreshold,
        zlibDeflateOptions: {
          level: 6, // Balanced compression level
          memLevel: 8,
        },
        zlibInflateOptions: {
          windowBits: 15,
          memLevel: 8,
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 15,
        clientMaxWindowBits: 15,
      },
      httpCompression: this.config.enableCompression && {
        threshold: 1024,
      },
      pingTimeout: this.config.heartbeatTimeout,
      pingInterval: this.config.heartbeatInterval,
      upgradeTimeout: 10000,
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: true, // Allow Engine.IO v3 clients
    };

    // Start monitoring
    this.startMonitoring();

    return io;
  }

  /**
   * Register a new connection
   */
  registerConnection(socket: Socket, userId: string, leagueId?: string): void {
    const connectionInfo: ConnectionInfo = {
      socketId: socket.id,
      userId,
      leagueId: leagueId || '',
      connectedAt: new Date(),
      lastActivity: new Date(),
      latency: 0,
      packetsReceived: 0,
      packetsSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
    };

    // Store connection info
    this.connections.set(socket.id, connectionInfo);

    // Track user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socket.id);

    // Track league connections
    if (leagueId) {
      if (!this.leagueConnections.has(leagueId)) {
        this.leagueConnections.set(leagueId, new Set());
      }
      this.leagueConnections.get(leagueId)!.add(socket.id);

      // Check connection limit
      this.enforceConnectionLimit(leagueId);
    }

    // Setup heartbeat monitoring
    this.setupHeartbeat(socket);

    // Track packet metrics
    this.trackPacketMetrics(socket);

    // Update metrics
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    
    // Record metric
    performanceMonitor.recordMetric({
      name: 'websocket.connection.new',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      tags: {
        userId,
        leagueId: leagueId || 'none',
      },
    });
  }

  /**
   * Unregister a connection
   */
  unregisterConnection(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (!connection) return;

    // Remove from user connections
    this.userConnections.get(connection.userId)?.delete(socketId);
    if (this.userConnections.get(connection.userId)?.size === 0) {
      this.userConnections.delete(connection.userId);
    }

    // Remove from league connections
    if (connection.leagueId) {
      this.leagueConnections.get(connection.leagueId)?.delete(socketId);
      if (this.leagueConnections.get(connection.leagueId)?.size === 0) {
        this.leagueConnections.delete(connection.leagueId);
      }
    }

    // Clear heartbeat
    const heartbeatInterval = this.heartbeatIntervals.get(socketId);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      this.heartbeatIntervals.delete(socketId);
    }

    // Remove connection
    this.connections.delete(socketId);

    // Update metrics
    this.metrics.activeConnections--;
    this.metrics.disconnections++;

    performanceMonitor.recordMetric({
      name: 'websocket.connection.closed',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
    });
  }

  /**
   * Update connection league
   */
  updateConnectionLeague(socketId: string, leagueId: string): void {
    const connection = this.connections.get(socketId);
    if (!connection) return;

    // Remove from old league
    if (connection.leagueId) {
      this.leagueConnections.get(connection.leagueId)?.delete(socketId);
    }

    // Add to new league
    connection.leagueId = leagueId;
    if (!this.leagueConnections.has(leagueId)) {
      this.leagueConnections.set(leagueId, new Set());
    }
    this.leagueConnections.get(leagueId)!.add(socketId);

    // Check connection limit
    this.enforceConnectionLimit(leagueId);

    connection.lastActivity = new Date();
  }

  /**
   * Setup heartbeat monitoring for a socket
   */
  private setupHeartbeat(socket: Socket): void {
    let missedHeartbeats = 0;
    
    const interval = setInterval(() => {
      if (missedHeartbeats >= 3) {
        console.warn(`Socket ${socket.id} missed too many heartbeats, disconnecting`);
        clearInterval(interval);
        socket.disconnect();
        return;
      }

      socket.emit('ping', Date.now());
      missedHeartbeats++;
    }, this.config.heartbeatInterval);

    this.heartbeatIntervals.set(socket.id, interval);

    // Handle pong response
    socket.on('pong', (timestamp: number) => {
      missedHeartbeats = 0;
      const latency = Date.now() - timestamp;
      
      const connection = this.connections.get(socket.id);
      if (connection) {
        connection.latency = latency;
        connection.lastActivity = new Date();
      }

      // Record latency metric
      if (latency > 100) {
        performanceMonitor.recordMetric({
          name: 'websocket.latency.high',
          value: latency,
          unit: 'ms',
          timestamp: Date.now(),
          tags: {
            socketId: socket.id,
          },
        });
      }
    });
  }

  /**
   * Track packet metrics for monitoring
   */
  private trackPacketMetrics(socket: Socket): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    // Track outgoing packets
    const originalEmit = socket.emit.bind(socket);
    socket.emit = function(...args: any[]) {
      connection.packetsSent++;
      const data = JSON.stringify(args[1] || {});
      connection.bytesSent += Buffer.byteLength(data);
      connection.lastActivity = new Date();
      return originalEmit.apply(socket, args);
    };

    // Track incoming packets
    const originalOnevent = (socket as any).onevent?.bind(socket);
    if (originalOnevent) {
      (socket as any).onevent = function(packet: any) {
        connection.packetsReceived++;
        const data = JSON.stringify(packet.data || []);
        connection.bytesReceived += Buffer.byteLength(data);
        connection.lastActivity = new Date();
        return originalOnevent.apply(socket, [packet]);
      };
    }
  }

  /**
   * Enforce connection limit per league
   */
  private enforceConnectionLimit(leagueId: string): void {
    const connections = this.leagueConnections.get(leagueId);
    if (!connections) return;

    if (connections.size > this.config.maxConnectionsPerLeague) {
      console.warn(`League ${leagueId} exceeded connection limit (${connections.size}/${this.config.maxConnectionsPerLeague})`);
      
      // Find and disconnect oldest idle connections
      const connectionArray = Array.from(connections)
        .map(socketId => this.connections.get(socketId)!)
        .filter(conn => conn)
        .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime());

      const toDisconnect = connectionArray.slice(0, connections.size - this.config.maxConnectionsPerLeague);
      
      toDisconnect.forEach(conn => {
        console.log(`Disconnecting idle connection ${conn.socketId} to maintain pool limit`);
        // Note: Actual disconnection would be handled by the WebSocket server
        this.unregisterConnection(conn.socketId);
      });
    }
  }

  /**
   * Start monitoring connections
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) return;

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.cleanupIdleConnections();
      this.reportMetrics();
    }, 30000); // Every 30 seconds
  }

  /**
   * Collect current metrics
   */
  private collectMetrics(): void {
    const now = Date.now();
    let totalLatency = 0;
    let totalPackets = 0;
    let totalBytes = 0;
    let activeCount = 0;
    let idleCount = 0;

    this.connections.forEach(conn => {
      totalLatency += conn.latency;
      totalPackets += conn.packetsReceived + conn.packetsSent;
      totalBytes += conn.bytesReceived + conn.bytesSent;

      const idleTime = now - conn.lastActivity.getTime();
      if (idleTime < 60000) { // Active if used in last minute
        activeCount++;
      } else {
        idleCount++;
      }
    });

    const connectionCount = this.connections.size;
    this.metrics.activeConnections = activeCount;
    this.metrics.idleConnections = idleCount;
    this.metrics.averageLatency = connectionCount > 0 ? totalLatency / connectionCount : 0;
    this.metrics.packetsPerSecond = totalPackets / 30; // Over 30 second interval
    this.metrics.bytesPerSecond = totalBytes / 30;
    this.metrics.poolUtilization = connectionCount > 0 
      ? (activeCount / connectionCount) * 100 
      : 0;
  }

  /**
   * Cleanup idle connections
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    this.connections.forEach((conn, socketId) => {
      const idleTime = now - conn.lastActivity.getTime();
      if (idleTime > this.config.maxIdleTime) {
        toRemove.push(socketId);
      }
    });

    toRemove.forEach(socketId => {
      console.log(`Removing idle connection ${socketId}`);
      this.unregisterConnection(socketId);
    });
  }

  /**
   * Report metrics to performance monitor
   */
  private reportMetrics(): void {
    performanceMonitor.recordMetric({
      name: 'websocket.connections.active',
      value: this.metrics.activeConnections,
      unit: 'count',
      timestamp: Date.now(),
    });

    performanceMonitor.recordMetric({
      name: 'websocket.connections.idle',
      value: this.metrics.idleConnections,
      unit: 'count',
      timestamp: Date.now(),
    });

    performanceMonitor.recordMetric({
      name: 'websocket.latency.average',
      value: this.metrics.averageLatency,
      unit: 'ms',
      timestamp: Date.now(),
    });

    performanceMonitor.recordMetric({
      name: 'websocket.throughput.packets',
      value: this.metrics.packetsPerSecond,
      unit: 'packets/s',
      timestamp: Date.now(),
    });

    performanceMonitor.recordMetric({
      name: 'websocket.throughput.bytes',
      value: this.metrics.bytesPerSecond,
      unit: 'bytes/s',
      timestamp: Date.now(),
    });

    if (this.metrics.poolUtilization > 80) {
      console.warn(`WebSocket pool under stress: ${this.metrics.poolUtilization.toFixed(1)}% utilization`);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get connection info
   */
  getConnectionInfo(socketId: string): ConnectionInfo | undefined {
    return this.connections.get(socketId);
  }

  /**
   * Get league connections
   */
  getLeagueConnections(leagueId: string): string[] {
    return Array.from(this.leagueConnections.get(leagueId) || []);
  }

  /**
   * Get user connections
   */
  getUserConnections(userId: string): string[] {
    return Array.from(this.userConnections.get(userId) || []);
  }

  /**
   * Optimize message for transmission
   */
  optimizeMessage(message: any): any {
    // Remove null/undefined values to reduce payload size
    if (typeof message === 'object' && message !== null) {
      const optimized: any = Array.isArray(message) ? [] : {};
      
      for (const key in message) {
        const value = message[key];
        if (value !== null && value !== undefined) {
          if (typeof value === 'object') {
            optimized[key] = this.optimizeMessage(value);
          } else {
            optimized[key] = value;
          }
        }
      }
      
      return optimized;
    }
    
    return message;
  }

  /**
   * Check if message should be compressed
   */
  shouldCompress(message: any): boolean {
    const size = Buffer.byteLength(JSON.stringify(message));
    return size > this.config.compressionThreshold;
  }

  /**
   * Shutdown connection pool
   */
  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Clear all heartbeat intervals
    this.heartbeatIntervals.forEach(interval => clearInterval(interval));
    this.heartbeatIntervals.clear();

    // Clear connections
    this.connections.clear();
    this.leagueConnections.clear();
    this.userConnections.clear();

    console.log('WebSocket connection pool shut down');
  }
}

// Export singleton instance
export const wsConnectionPool = WebSocketConnectionPool.getInstance();

// Export helper functions
export function optimizeWebSocketMessage(message: any): any {
  return wsConnectionPool.optimizeMessage(message);
}

export function getWebSocketMetrics(): ConnectionMetrics {
  return wsConnectionPool.getMetrics();
}

export default wsConnectionPool;