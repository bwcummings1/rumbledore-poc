import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useLeagueContext } from '@/contexts/league-context';

// Query keys
export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: (leagueId?: string) => [...dashboardKeys.all, 'stats', leagueId] as const,
  metrics: (leagueId?: string) => [...dashboardKeys.all, 'metrics', leagueId] as const,
  activity: (leagueId?: string) => [...dashboardKeys.all, 'activity', leagueId] as const,
  overview: (leagueId?: string) => [...dashboardKeys.all, 'overview', leagueId] as const,
};

export function useDashboardStats() {
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: dashboardKeys.stats(currentLeague?.id),
    queryFn: async () => {
      if (!currentLeague) return null;
      
      const [standings, recentGames, upcomingGames, transactions] = await Promise.all([
        apiClient.leagues.standings(currentLeague.id),
        apiClient.leagues.recentGames(currentLeague.id),
        apiClient.leagues.upcomingGames(currentLeague.id),
        apiClient.leagues.transactions(currentLeague.id, { limit: 5 }),
      ]);

      return {
        standings: standings.data,
        recentGames: recentGames.data,
        upcomingGames: upcomingGames.data,
        transactions: transactions.data,
      };
    },
    enabled: !!currentLeague,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000, // Consider data stale after 30 seconds
  });
}

export function useLeagueMetrics() {
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: dashboardKeys.metrics(currentLeague?.id),
    queryFn: async () => {
      if (!currentLeague) return null;
      
      const { data } = await apiClient.stats.league(currentLeague.id);
      
      return {
        totalGames: data.totalGames || 0,
        averageScore: data.averageScore || 0,
        highestScore: data.highestScore || { score: 0, team: 'N/A', week: 0 },
        closestGame: data.closestGame || { margin: 0, teams: [], week: 0 },
        biggestBlowout: data.biggestBlowout || { margin: 0, teams: [], week: 0 },
        currentWeek: data.currentWeek || 1,
        totalTeams: data.totalTeams || 0,
        activePlayers: data.activePlayers || 0,
      };
    },
    enabled: !!currentLeague,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRecentActivity() {
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: dashboardKeys.activity(currentLeague?.id),
    queryFn: async () => {
      if (!currentLeague) return null;
      
      const [transactions, trades, messages] = await Promise.all([
        apiClient.leagues.transactions(currentLeague.id, { limit: 10 }),
        apiClient.leagues.trades(currentLeague.id, { limit: 5 }),
        apiClient.leagues.messages(currentLeague.id, { limit: 5 }),
      ]);

      // Combine and sort by timestamp
      const activities = [
        ...transactions.data.map((t: any) => ({ ...t, type: 'transaction' })),
        ...trades.data.map((t: any) => ({ ...t, type: 'trade' })),
        ...messages.data.map((m: any) => ({ ...m, type: 'message' })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return activities.slice(0, 15); // Return top 15 most recent
    },
    enabled: !!currentLeague,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useDashboardOverview() {
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: dashboardKeys.overview(currentLeague?.id),
    queryFn: async () => {
      if (!currentLeague) return null;
      
      // Fetch all dashboard data in parallel
      const [stats, betting, competitions, content] = await Promise.all([
        apiClient.stats.summary(currentLeague.id),
        apiClient.betting.summary(currentLeague.id),
        apiClient.competitions.active(currentLeague.id),
        apiClient.content.recent(currentLeague.id, { limit: 3 }),
      ]);

      return {
        stats: stats.data,
        betting: betting.data,
        competitions: competitions.data,
        content: content.data,
        leagueInfo: {
          id: currentLeague.id,
          name: currentLeague.name,
          currentWeek: stats.data.currentWeek,
          totalTeams: stats.data.totalTeams,
        },
      };
    },
    enabled: !!currentLeague,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}