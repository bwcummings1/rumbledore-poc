'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { leagueKeys } from '@/hooks/api/use-leagues';
import { bettingKeys } from '@/hooks/api/use-betting';
import { statsKeys } from '@/hooks/api/use-statistics';

// Only import io if WebSocket is enabled
const io = process.env.NEXT_PUBLIC_ENABLE_WEBSOCKET === 'true' 
  ? require('socket.io-client').io 
  : null;

interface WebSocketContextType {
  socket: Socket | null;
  connected: boolean;
  subscribe: (event: string, handler: Function) => void;
  unsubscribe: (event: string, handler: Function) => void;
  emit: (event: string, data: any) => void;
  joinLeague: (leagueId: string) => void;
  leaveLeague: (leagueId: string) => void;
  latency: number;
}

const WebSocketContext = createContext<WebSocketContextType>({
  socket: null,
  connected: false,
  subscribe: () => {},
  unsubscribe: () => {},
  emit: () => {},
  joinLeague: () => {},
  leaveLeague: () => {},
  latency: 0,
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [latency, setLatency] = useState(0);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = useRef(1000);
  
  // Check if WebSocket is enabled at module level
  const isWebSocketEnabled = process.env.NEXT_PUBLIC_ENABLE_WEBSOCKET === 'true';

  useEffect(() => {
    // Check if WebSocket is enabled
    if (!isWebSocketEnabled) {
      console.log('WebSocket disabled. Set NEXT_PUBLIC_ENABLE_WEBSOCKET=true to enable.');
      return;
    }
    
    if (!session?.user) {
      // Disconnect socket if user logs out
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    // Double-check io is available
    if (!io) {
      console.warn('Socket.io client not loaded - WebSocket is disabled');
      return;
    }

    // Initialize socket connection
    const newSocket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
      auth: {
        userId: session.user.id,
        email: session.user.email,
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: maxReconnectAttempts,
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      setConnected(true);
      reconnectAttempts.current = 0;
      reconnectDelay.current = 1000;
      console.log('WebSocket connected');
      
      // Measure latency
      const startTime = Date.now();
      newSocket.emit('ping');
      newSocket.once('pong', () => {
        setLatency(Date.now() - startTime);
      });
    });

    newSocket.on('disconnect', (reason) => {
      setConnected(false);
      console.log('WebSocket disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        setTimeout(() => {
          newSocket.connect();
        }, reconnectDelay.current);
        
        // Exponential backoff
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
      }
    });

    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
      toast.error('Connection error. Retrying...');
    });

    // Global event handlers for real-time updates
    newSocket.on('notification', (data) => {
      toast(data.title || 'Notification', { 
        description: data.message,
        duration: 5000,
      });
    });

    newSocket.on('score-update', (data) => {
      // Invalidate relevant queries to refetch latest data
      if (data.leagueId) {
        queryClient.invalidateQueries({ queryKey: leagueKeys.standings(data.leagueId) });
        queryClient.invalidateQueries({ queryKey: leagueKeys.matchups(data.leagueId) });
      }
    });

    newSocket.on('bet-settled', (data) => {
      // Update betting-related queries
      if (data.leagueId) {
        queryClient.invalidateQueries({ queryKey: bettingKeys.bankroll(data.leagueId) });
        queryClient.invalidateQueries({ queryKey: bettingKeys.activeBets(data.leagueId) });
        toast.success(`Bet settled: ${data.result}`, {
          description: `Payout: $${data.payout}`,
        });
      }
    });

    newSocket.on('competition-update', (data) => {
      // Handle competition updates
      toast.info('Competition Updated', {
        description: data.message,
      });
    });

    newSocket.on('achievement-unlocked', (data) => {
      // Show achievement notification
      toast.success('Achievement Unlocked!', {
        description: data.achievement,
        duration: 7000,
      });
    });

    newSocket.on('sync-progress', (data) => {
      // Update sync progress in UI
      if (data.leagueId) {
        queryClient.setQueryData(['sync-progress', data.leagueId], data);
      }
    });

    // Periodic latency check
    const latencyInterval = setInterval(() => {
      if (connected && newSocket.connected) {
        const startTime = Date.now();
        newSocket.emit('ping');
        newSocket.once('pong', () => {
          setLatency(Date.now() - startTime);
        });
      }
    }, 30000); // Check every 30 seconds

    setSocket(newSocket);

    return () => {
      clearInterval(latencyInterval);
      newSocket.close();
    };
  }, [session, queryClient]);

  const subscribe = useCallback((event: string, handler: Function) => {
    socket?.on(event, handler as any);
  }, [socket]);

  const unsubscribe = useCallback((event: string, handler: Function) => {
    socket?.off(event, handler as any);
  }, [socket]);

  const emit = useCallback((event: string, data: any) => {
    socket?.emit(event, data);
  }, [socket]);

  const joinLeague = useCallback((leagueId: string) => {
    socket?.emit('join-league', { leagueId });
  }, [socket]);

  const leaveLeague = useCallback((leagueId: string) => {
    socket?.emit('leave-league', { leagueId });
  }, [socket]);

  return (
    <WebSocketContext.Provider 
      value={{ 
        socket, 
        connected, 
        subscribe, 
        unsubscribe, 
        emit,
        joinLeague,
        leaveLeague,
        latency,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => useContext(WebSocketContext);