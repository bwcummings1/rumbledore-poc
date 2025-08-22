import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// Query keys
export const statsKeys = {
  all: ['statistics'] as const,
  league: (leagueId: string) => [...statsKeys.all, 'league', leagueId] as const,
  h2h: (leagueId: string, team1: string, team2: string) => 
    [...statsKeys.all, 'h2h', leagueId, team1, team2] as const,
  progress: (leagueId: string) => [...statsKeys.all, 'progress', leagueId] as const,
};

// Fetch league statistics
export function useLeagueStatistics(leagueId: string) {
  return useQuery({
    queryKey: statsKeys.league(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.stats.league(leagueId);
      return data;
    },
    enabled: !!leagueId,
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
  });
}

// Fetch head-to-head statistics
export function useHeadToHead(leagueId: string, team1: string, team2: string) {
  return useQuery({
    queryKey: statsKeys.h2h(leagueId, team1, team2),
    queryFn: async () => {
      const { data } = await apiClient.stats.h2h(leagueId, team1, team2);
      return data;
    },
    enabled: !!leagueId && !!team1 && !!team2,
    staleTime: 10 * 60 * 1000, // Consider data stale after 10 minutes
  });
}

// Fetch statistics calculation progress
export function useStatisticsProgress(leagueId: string) {
  return useQuery({
    queryKey: statsKeys.progress(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.stats.progress(leagueId);
      return data;
    },
    enabled: !!leagueId,
    refetchInterval: (data: any) => {
      // Only refetch if calculation is in progress
      return data?.status === 'IN_PROGRESS' ? 2000 : false;
    },
  });
}