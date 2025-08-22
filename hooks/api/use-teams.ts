import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

// Query keys
export const teamKeys = {
  all: ['teams'] as const,
  lists: () => [...teamKeys.all, 'list'] as const,
  list: (leagueId: string) => [...teamKeys.lists(), leagueId] as const,
  details: () => [...teamKeys.all, 'detail'] as const,
  detail: (leagueId: string, teamId: string) => [...teamKeys.details(), leagueId, teamId] as const,
  roster: (leagueId: string, teamId: string) => [...teamKeys.detail(leagueId, teamId), 'roster'] as const,
};

// Fetch team details
export function useTeam(leagueId: string, teamId: string) {
  return useQuery({
    queryKey: teamKeys.detail(leagueId, teamId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/leagues/${leagueId}/teams/${teamId}`);
      return data;
    },
    enabled: !!leagueId && !!teamId,
  });
}

// Fetch team roster
export function useRoster(leagueId: string, teamId: string) {
  return useQuery({
    queryKey: teamKeys.roster(leagueId, teamId),
    queryFn: async () => {
      const { data } = await apiClient.leagues.roster(leagueId, teamId);
      return data;
    },
    enabled: !!leagueId && !!teamId,
    refetchInterval: 60000, // Refetch every minute during games
  });
}

// Fetch all teams in a league
export function useTeams(leagueId: string) {
  return useQuery({
    queryKey: teamKeys.list(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.get(`/leagues/${leagueId}/teams`);
      return data;
    },
    enabled: !!leagueId,
  });
}

// Update roster (for lineup changes)
export function useUpdateRoster() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ leagueId, teamId, changes }: { 
      leagueId: string; 
      teamId: string; 
      changes: any;
    }) => apiClient.put(`/leagues/${leagueId}/teams/${teamId}/roster`, changes),
    onSuccess: (_, { leagueId, teamId }) => {
      queryClient.invalidateQueries({ queryKey: teamKeys.roster(leagueId, teamId) });
      toast.success('Roster updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update roster');
    },
  });
}

// Optimize lineup
export function useOptimizeLineup() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ leagueId, teamId }: { leagueId: string; teamId: string }) => 
      apiClient.post(`/leagues/${leagueId}/teams/${teamId}/optimize`),
    onSuccess: (_, { leagueId, teamId }) => {
      queryClient.invalidateQueries({ queryKey: teamKeys.roster(leagueId, teamId) });
      toast.success('Lineup optimized');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to optimize lineup');
    },
  });
}