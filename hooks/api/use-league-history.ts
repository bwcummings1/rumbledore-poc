import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// Query keys
export const historyKeys = {
  all: ['history'] as const,
  league: (leagueId: string) => [...historyKeys.all, 'league', leagueId] as const,
  records: (leagueId: string) => [...historyKeys.league(leagueId), 'records'] as const,
  championships: (leagueId: string) => [...historyKeys.league(leagueId), 'championships'] as const,
  seasons: (leagueId: string) => [...historyKeys.league(leagueId), 'seasons'] as const,
};

// Fetch league history overview
export function useLeagueHistory(leagueId?: string) {
  return useQuery({
    queryKey: historyKeys.league(leagueId || ''),
    queryFn: async () => {
      if (!leagueId) return null;
      const { data } = await apiClient.get(`/leagues/${leagueId}/history`);
      return data;
    },
    enabled: !!leagueId,
  });
}

// Fetch all-time records
export function useAllTimeRecords(leagueId: string) {
  return useQuery({
    queryKey: historyKeys.records(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/leagues/${leagueId}/records`);
      return data;
    },
    enabled: !!leagueId,
  });
}

// Fetch championship history
export function useChampionshipHistory(leagueId: string) {
  return useQuery({
    queryKey: historyKeys.championships(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/leagues/${leagueId}/championships`);
      return data;
    },
    enabled: !!leagueId,
  });
}

// Fetch season comparisons
export function useSeasonComparison(leagueId: string) {
  return useQuery({
    queryKey: historyKeys.seasons(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/leagues/${leagueId}/seasons`);
      return data;
    },
    enabled: !!leagueId,
  });
}