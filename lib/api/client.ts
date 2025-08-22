import axios, { AxiosError, AxiosInstance } from 'axios';
import { getSession } from 'next-auth/react';
import { toast } from 'sonner';

export interface ApiError {
  message: string;
  code: number;
  details?: any;
}

export interface BetPayload {
  leagueId: string;
  gameId: string;
  betType: string;
  marketType: string;
  selection: string;
  odds: number;
  stake: number;
  line?: number;
}

export interface League {
  id: string;
  name: string;
  espnLeagueId: string;
  season: number;
  memberCount: number;
  currentWeek: number;
  isActive: boolean;
}

export interface Bankroll {
  id: string;
  leagueId: string;
  userId: string;
  week: number;
  initialBalance: number;
  currentBalance: number;
  profitLoss: number;
  roi: number;
  totalBets: number;
  wonBets: number;
  lostBets: number;
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for auth
    this.client.interceptors.request.use(
      async (config) => {
        // Only add auth header for client-side requests
        if (typeof window !== 'undefined') {
          const session = await getSession();
          if (session?.user) {
            config.headers.Authorization = `Bearer ${session.user.id}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<any>) => {
        if (error.response?.status === 401) {
          // Handle token refresh or redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        
        // Show error toast for user-friendly feedback
        if (typeof window !== 'undefined' && error.response?.data?.message) {
          toast.error(error.response.data.message);
        }
        
        return Promise.reject(this.formatError(error));
      }
    );
  }

  private formatError(error: AxiosError<any>): ApiError {
    return {
      message: error.response?.data?.message || error.message || 'An error occurred',
      code: error.response?.status || 500,
      details: error.response?.data,
    };
  }

  // Auth endpoints
  auth = {
    login: (email: string, password: string) => 
      this.client.post('/auth/login', { email, password }),
    logout: () => 
      this.client.post('/auth/logout'),
    session: () => 
      this.client.get('/auth/session'),
  };

  // League endpoints
  leagues = {
    list: () => 
      this.client.get<League[]>('/leagues'),
    get: (id: string) => 
      this.client.get<League>(`/leagues/${id}`),
    sync: (id: string) => 
      this.client.post(`/leagues/${id}/sync`),
    standings: (id: string) => 
      this.client.get(`/leagues/${id}/standings`),
    roster: (id: string, teamId: string) => 
      this.client.get(`/leagues/${id}/teams/${teamId}/roster`),
    matchups: (id: string, week?: number) => 
      this.client.get(`/leagues/${id}/matchups`, { params: { week } }),
    members: (id: string) =>
      this.client.get(`/leagues/${id}/members`),
    settings: (id: string) =>
      this.client.get(`/leagues/${id}/settings`),
    updateSettings: (id: string, settings: any) =>
      this.client.put(`/leagues/${id}/settings`, settings),
    // History endpoints
    history: (id: string) =>
      this.client.get(`/leagues/${id}/history`),
    records: (id: string) =>
      this.client.get(`/leagues/${id}/records`),
    championships: (id: string) =>
      this.client.get(`/leagues/${id}/championships`),
    seasons: (id: string) =>
      this.client.get(`/leagues/${id}/seasons`),
    transactions: (id: string, limit?: number) =>
      this.client.get(`/leagues/${id}/transactions`, { params: { limit } }),
    // Team endpoints
    teams: (id: string) =>
      this.client.get(`/leagues/${id}/teams`),
    team: (leagueId: string, teamId: string) =>
      this.client.get(`/leagues/${leagueId}/teams/${teamId}`),
    optimizeLineup: (leagueId: string, teamId: string) =>
      this.client.post(`/leagues/${leagueId}/teams/${teamId}/optimize`),
    updateRoster: (leagueId: string, teamId: string, changes: any) =>
      this.client.put(`/leagues/${leagueId}/teams/${teamId}/roster`, changes),
  };

  // Betting endpoints
  betting = {
    bankroll: (leagueId: string) => 
      this.client.get<Bankroll>('/betting/bankroll', { params: { leagueId } }),
    bankrollHistory: (leagueId: string) =>
      this.client.get('/betting/bankroll/history', { params: { leagueId } }),
    placeBet: (data: BetPayload) => 
      this.client.post('/betting/bets', data),
    placeParlayBet: (data: any) =>
      this.client.post('/betting/bets/parlay', data),
    activeBets: (leagueId: string) => 
      this.client.get('/betting/bets', { params: { leagueId, status: 'PENDING' } }),
    history: (leagueId: string) => 
      this.client.get('/betting/bets', { params: { leagueId } }),
    betSlip: () =>
      this.client.get('/betting/slip'),
    updateBetSlip: (selections: any[]) =>
      this.client.put('/betting/slip', { selections }),
  };

  // Statistics endpoints
  stats = {
    league: (leagueId: string) => 
      this.client.get(`/statistics`, { params: { leagueId } }),
    h2h: (leagueId: string, team1: string, team2: string) => 
      this.client.get('/statistics/h2h', { params: { leagueId, team1, team2 } }),
    progress: (leagueId: string) =>
      this.client.get('/statistics/progress', { params: { leagueId } }),
  };

  // AI endpoints
  ai = {
    chat: (message: string, agentType: string, leagueId?: string) => 
      this.client.post('/ai/chat', { message, agentType, leagueId }),
    agents: () => 
      this.client.get('/ai/agents'),
    collaborate: (agents: string[], message: string, leagueId?: string) =>
      this.client.post('/ai/collaborate', { agents, message, leagueId }),
    summon: (agentType: string, leagueId: string) =>
      this.client.post('/ai/summon', { agentType, leagueId }),
  };

  // Content endpoints
  content = {
    generate: (type: string, leagueId: string) =>
      this.client.post('/content/generate', { type, leagueId }),
    list: (leagueId: string) =>
      this.client.get('/content', { params: { leagueId } }),
    get: (contentId: string) =>
      this.client.get(`/content/${contentId}`),
    publish: (contentId: string) =>
      this.client.post('/content/publish', { contentId }),
    schedules: (leagueId: string) =>
      this.client.get('/content/schedules', { params: { leagueId } }),
  };

  // Competition endpoints
  competitions = {
    list: (leagueId?: string) =>
      this.client.get('/competitions', { params: { leagueId } }),
    get: (competitionId: string) =>
      this.client.get(`/competitions/${competitionId}`),
    join: (competitionId: string) =>
      this.client.post(`/competitions/${competitionId}/join`),
    leaderboard: (competitionId: string) =>
      this.client.get(`/competitions/${competitionId}/leaderboard`),
  };

  // Odds endpoints
  odds = {
    nfl: () =>
      this.client.get('/odds/nfl'),
    history: (gameId: string) =>
      this.client.get('/odds/history', { params: { gameId } }),
    movement: (gameId: string) =>
      this.client.get('/odds/movement', { params: { gameId } }),
  };

  // Admin endpoints
  admin = {
    health: () =>
      this.client.get('/admin/health'),
    metrics: () =>
      this.client.get('/admin/metrics'),
    users: () =>
      this.client.get('/admin/users'),
    syncStatus: () =>
      this.client.get('/admin/sync-status'),
  };
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export types for use in components
export type { ApiClient };