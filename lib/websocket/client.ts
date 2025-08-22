import type { Socket } from 'socket.io-client';

// Only import io if WebSocket is enabled
const io = process.env.NEXT_PUBLIC_ENABLE_WEBSOCKET === 'true' 
  ? require('socket.io-client').io 
  : null;

export interface WebSocketEventHandlers {
  onScoreUpdate?: (data: any) => void;
  onTransactionNew?: (data: any) => void;
  onSyncStatus?: (data: { status: string; progress?: number }) => void;
  onMatchupUpdate?: (data: any) => void;
  onRosterUpdate?: (data: any) => void;
  onNewsUpdate?: (data: any) => void;
  onError?: (error: any) => void;
}

export class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private handlers: WebSocketEventHandlers = {};
  private currentLeagues: Set<string> = new Set();
  private connectionStartTime = 0;
  private lastPingTime = 0;
  private latency = 0;
  private static instance: WebSocketClient;

  private constructor() {}

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  connect(userId: string, handlers?: WebSocketEventHandlers): Promise<void> {
    // Check if WebSocket is enabled
    if (process.env.NEXT_PUBLIC_ENABLE_WEBSOCKET !== 'true') {
      console.log('WebSocket disabled in WebSocketClient. Set NEXT_PUBLIC_ENABLE_WEBSOCKET=true to enable.');
      return Promise.resolve();
    }

    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return Promise.resolve();
    }

    if (handlers) {
      this.handlers = handlers;
    }

    return new Promise((resolve, reject) => {
      // Double-check io is available
      if (!io) {
        console.warn('Socket.io client not loaded - WebSocket is disabled in client.ts');
        resolve();
        return;
      }

      const url = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      
      this.connectionStartTime = Date.now();
      
      this.socket = io(url, {
        auth: { userId },
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling'],
        // Performance optimizations
        upgrade: true, // Start with polling and upgrade to websocket
        rememberUpgrade: true, // Remember the upgrade
        perMessageDeflate: {
          threshold: 1024, // Compress messages > 1KB
        },
        // Timeout configurations
        timeout: 20000,
        ackTimeout: 10000,
      });

      this.socket.on('connect', () => {
        const connectionTime = Date.now() - this.connectionStartTime;
        console.log(`WebSocket connected in ${connectionTime}ms`);
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay on successful connection
        
        // Setup ping/pong for latency tracking
        this.setupPingPong();
        
        // Rejoin all leagues with optimized batch join
        if (this.currentLeagues.size > 0) {
          this.batchJoinLeagues(Array.from(this.currentLeagues));
        }
        
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.reconnectAttempts++;
        
        // Exponential backoff for reconnection
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('Max reconnection attempts reached');
          reject(error);
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        
        // Handle different disconnect reasons
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, attempt reconnection
          console.log('Server disconnected, attempting to reconnect...');
          this.socket?.connect();
        } else if (reason === 'ping timeout') {
          // Connection lost, exponential backoff
          console.log('Connection lost (ping timeout), will reconnect with backoff');
        }
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        this.reconnectDelay = 1000; // Reset delay after successful reconnection
      });

      this.socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`Reconnection attempt ${attemptNumber}`);
      });

      this.socket.on('reconnect_error', (error) => {
        console.error('Reconnection error:', error);
      });

      this.socket.on('reconnect_failed', () => {
        console.error('Failed to reconnect after maximum attempts');
        this.handlers.onError?.({ 
          type: 'reconnect_failed', 
          message: 'Unable to reconnect to server' 
        });
      });

      this.setupEventListeners();
    });
  }

  private setupPingPong() {
    if (!this.socket) return;

    // Handle ping from server
    this.socket.on('ping', (timestamp: number) => {
      this.lastPingTime = timestamp;
      this.socket?.emit('pong', timestamp);
      this.latency = Date.now() - timestamp;
      
      if (this.latency > 100) {
        console.warn(`High latency detected: ${this.latency}ms`);
      }
    });
  }

  private batchJoinLeagues(leagueIds: string[]) {
    if (!this.socket?.connected) return;
    
    // Join all leagues in a single batch if server supports it
    leagueIds.forEach(leagueId => {
      this.socket?.emit('join:league', leagueId);
    });
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connected', (data) => {
      console.log('Connected with socket ID:', data.socketId);
    });

    this.socket.on('joined:league', (data) => {
      console.log('Joined league:', data.leagueId);
      this.currentLeagues.add(data.leagueId);
    });

    this.socket.on('left:league', (data) => {
      console.log('Left league:', data.leagueId);
      this.currentLeagues.delete(data.leagueId);
    });

    // Data events
    this.socket.on('score:update', (data) => {
      console.log('Score update:', data);
      this.handlers.onScoreUpdate?.(data);
    });

    this.socket.on('transaction:new', (data) => {
      console.log('New transaction:', data);
      this.handlers.onTransactionNew?.(data);
    });

    this.socket.on('sync:status', (data) => {
      console.log('Sync status:', data);
      this.handlers.onSyncStatus?.(data);
    });

    this.socket.on('matchup:update', (data) => {
      console.log('Matchup update:', data);
      this.handlers.onMatchupUpdate?.(data);
    });

    this.socket.on('roster:update', (data) => {
      console.log('Roster update:', data);
      this.handlers.onRosterUpdate?.(data);
    });

    this.socket.on('news:update', (data) => {
      console.log('News update:', data);
      this.handlers.onNewsUpdate?.(data);
    });

    // Error events
    this.socket.on('error:unauthorized', (data) => {
      console.error('Unauthorized:', data);
      this.handlers.onError?.(data);
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.handlers.onError?.(error);
    });
  }

  updateHandlers(handlers: Partial<WebSocketEventHandlers>) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  joinLeague(leagueId: string) {
    if (!this.socket?.connected) {
      console.warn('Socket not connected');
      return;
    }
    
    this.socket.emit('join:league', leagueId);
    this.currentLeagues.add(leagueId);
  }

  leaveLeague(leagueId: string) {
    if (!this.socket?.connected) {
      console.warn('Socket not connected');
      return;
    }
    
    this.socket.emit('leave:league', leagueId);
    this.currentLeagues.delete(leagueId);
  }

  requestSync(leagueId: string) {
    if (!this.socket?.connected) {
      console.warn('Socket not connected');
      return;
    }
    
    this.socket.emit('request:sync', leagueId);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentLeagues.clear();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  getCurrentLeagues(): string[] {
    return Array.from(this.currentLeagues);
  }

  getLatency(): number {
    return this.latency;
  }

  getConnectionState(): string {
    if (!this.socket) return 'disconnected';
    return this.socket.connected ? 'connected' : 'connecting';
  }

  // Force reconnect with fresh connection
  forceReconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.connect();
    }
  }

  // Convenience method for React hooks
  onMount(userId: string, leagueId: string, handlers: WebSocketEventHandlers): () => void {
    this.connect(userId, handlers).then(() => {
      this.joinLeague(leagueId);
    }).catch(error => {
      console.error('Failed to connect WebSocket:', error);
    });

    // Return cleanup function
    return () => {
      this.leaveLeague(leagueId);
      if (this.currentLeagues.size === 0) {
        this.disconnect();
      }
    };
  }
}

export const wsClient = WebSocketClient.getInstance();