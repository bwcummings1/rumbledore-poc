import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

// Query keys
export const leagueKeys = {
  all: ['leagues'] as const,
  lists: () => [...leagueKeys.all, 'list'] as const,
  list: (filters?: any) => [...leagueKeys.lists(), filters] as const,
  details: () => [...leagueKeys.all, 'detail'] as const,
  detail: (id: string) => [...leagueKeys.details(), id] as const,
  standings: (id: string) => [...leagueKeys.detail(id), 'standings'] as const,
  matchups: (id: string, week?: number) => [...leagueKeys.detail(id), 'matchups', week] as const,
  members: (id: string) => [...leagueKeys.detail(id), 'members'] as const,
  settings: (id: string) => [...leagueKeys.detail(id), 'settings'] as const,
};

// Fetch all leagues for the current user
export function useLeagues() {
  return useQuery({
    queryKey: leagueKeys.lists(),
    queryFn: async () => {
      const { data } = await apiClient.leagues.list();
      return data;
    },
  });
}

// Fetch a specific league
export function useLeague(leagueId: string) {
  return useQuery({
    queryKey: leagueKeys.detail(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.leagues.get(leagueId);
      return data;
    },
    enabled: !!leagueId,
  });
}

// Fetch league standings
export function useStandings(leagueId: string) {
  return useQuery({
    queryKey: leagueKeys.standings(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.leagues.standings(leagueId);
      return data;
    },
    enabled: !!leagueId,
    refetchInterval: 60000, // Refetch every minute during live games
  });
}

// Fetch league matchups
export function useMatchups(leagueId: string, week?: number) {
  return useQuery({
    queryKey: leagueKeys.matchups(leagueId, week),
    queryFn: async () => {
      const { data } = await apiClient.leagues.matchups(leagueId, week);
      return data;
    },
    enabled: !!leagueId,
    refetchInterval: 60000, // Refetch every minute during live games
  });
}

// Fetch league members
export function useLeagueMembers(leagueId: string) {
  return useQuery({
    queryKey: leagueKeys.members(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.leagues.members(leagueId);
      return data;
    },
    enabled: !!leagueId,
  });
}

// Fetch league settings
export function useLeagueSettings(leagueId: string) {
  return useQuery({
    queryKey: leagueKeys.settings(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.leagues.settings(leagueId);
      return data;
    },
    enabled: !!leagueId,
  });
}

// Sync league data from ESPN
export function useSyncLeague() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (leagueId: string) => apiClient.leagues.sync(leagueId),
    onSuccess: (_, leagueId) => {
      // Invalidate all league-related queries after sync
      queryClient.invalidateQueries({ queryKey: leagueKeys.detail(leagueId) });
      toast.success('League data synced successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to sync league data');
    },
  });
}

// Update league settings
export function useUpdateLeagueSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ leagueId, settings }: { leagueId: string; settings: any }) => 
      apiClient.leagues.updateSettings(leagueId, settings),
    onSuccess: (_, { leagueId }) => {
      queryClient.invalidateQueries({ queryKey: leagueKeys.settings(leagueId) });
      toast.success('League settings updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update settings');
    },
  });
}