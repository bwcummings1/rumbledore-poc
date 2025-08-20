import { io, Socket } from 'socket.io-client';

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
  private handlers: WebSocketEventHandlers = {};
  private currentLeagues: Set<string> = new Set();
  private static instance: WebSocketClient;

  private constructor() {}

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  connect(userId: string, handlers?: WebSocketEventHandlers): Promise<void> {
    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return Promise.resolve();
    }

    if (handlers) {
      this.handlers = handlers;
    }

    return new Promise((resolve, reject) => {
      const url = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      
      this.socket = io(url, {
        auth: { userId },
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        
        // Rejoin all leagues
        this.currentLeagues.forEach(leagueId => {
          this.joinLeague(leagueId);
        });
        
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(error);
        }
        this.reconnectAttempts++;
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
      });

      this.setupEventListeners();
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