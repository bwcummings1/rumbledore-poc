import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useLeagueContext } from '@/contexts/league-context';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

// Query keys
export const competitionKeys = {
  all: ['competitions'] as const,
  list: (scope?: 'league' | 'platform') => [...competitionKeys.all, 'list', scope] as const,
  detail: (id: string) => [...competitionKeys.all, 'detail', id] as const,
  leaderboard: (id: string) => [...competitionKeys.all, 'leaderboard', id] as const,
  userEntries: (userId?: string) => [...competitionKeys.all, 'entries', userId] as const,
  achievements: (userId?: string) => [...competitionKeys.all, 'achievements', userId] as const,
  stats: (competitionId: string) => [...competitionKeys.all, 'stats', competitionId] as const,
};

export type CompetitionScope = 'league' | 'platform';

export function useCompetitions(scope: CompetitionScope = 'league') {
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: competitionKeys.list(scope),
    queryFn: async () => {
      const params = scope === 'league' && currentLeague
        ? { leagueId: currentLeague.id, status: 'active' }
        : { scope: 'platform', status: 'active' };
      
      const { data } = await apiClient.competitions.list(params);
      return data;
    },
    enabled: scope === 'platform' || !!currentLeague,
    refetchInterval: 30000, // Refresh every 30 seconds for live updates
    staleTime: 15000, // 15 seconds
  });
}

export function useCompetition(competitionId: string) {
  return useQuery({
    queryKey: competitionKeys.detail(competitionId),
    queryFn: async () => {
      const { data } = await apiClient.competitions.get(competitionId);
      return data;
    },
    enabled: !!competitionId,
    staleTime: 30000, // 30 seconds
  });
}

export function useCompetitionLeaderboard(competitionId: string) {
  return useQuery({
    queryKey: competitionKeys.leaderboard(competitionId),
    queryFn: async () => {
      const { data } = await apiClient.competitions.leaderboard(competitionId);
      return data;
    },
    enabled: !!competitionId,
    refetchInterval: 10000, // Refresh every 10 seconds for real-time updates
    staleTime: 5000, // 5 seconds
  });
}

export function useUserCompetitions() {
  const { data: session } = useSession();
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: competitionKeys.userEntries(session?.user?.id),
    queryFn: async () => {
      if (!session?.user?.id) return [];
      
      const params = {
        userId: session.user.id,
        leagueId: currentLeague?.id,
        status: 'active',
      };
      
      const { data } = await apiClient.competitions.userEntries(params);
      return data;
    },
    enabled: !!session?.user?.id,
    staleTime: 60000, // 1 minute
  });
}

export function useUserAchievements() {
  const { data: session } = useSession();
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: competitionKeys.achievements(session?.user?.id),
    queryFn: async () => {
      if (!session?.user?.id) return [];
      
      const params = {
        userId: session.user.id,
        leagueId: currentLeague?.id,
      };
      
      const { data } = await apiClient.competitions.achievements(params);
      return data;
    },
    enabled: !!session?.user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useJoinCompetition() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { currentLeague } = useLeagueContext();
  
  return useMutation({
    mutationFn: (competitionId: string) => {
      return apiClient.competitions.join(competitionId, {
        userId: session?.user?.id,
        leagueId: currentLeague?.id,
      });
    },
    onSuccess: (_, competitionId) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: competitionKeys.detail(competitionId) });
      queryClient.invalidateQueries({ queryKey: competitionKeys.leaderboard(competitionId) });
      queryClient.invalidateQueries({ queryKey: competitionKeys.userEntries() });
      if (currentLeague) {
        queryClient.invalidateQueries({ queryKey: ['betting', 'bankroll', currentLeague.id] });
      }
      toast.success('Successfully joined competition!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to join competition');
    },
  });
}

export function useLeaveCompetition() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (competitionId: string) => {
      return apiClient.competitions.leave(competitionId);
    },
    onSuccess: (_, competitionId) => {
      queryClient.invalidateQueries({ queryKey: competitionKeys.detail(competitionId) });
      queryClient.invalidateQueries({ queryKey: competitionKeys.userEntries() });
      toast.success('Left competition');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to leave competition');
    },
  });
}

export function useCompetitionStats(competitionId: string) {
  return useQuery({
    queryKey: competitionKeys.stats(competitionId),
    queryFn: async () => {
      const { data } = await apiClient.competitions.stats(competitionId);
      return data;
    },
    enabled: !!competitionId,
    staleTime: 60000, // 1 minute
  });
}

export function useCreateCompetition() {
  const queryClient = useQueryClient();
  const { currentLeague } = useLeagueContext();
  const { data: session } = useSession();
  
  return useMutation({
    mutationFn: (params: {
      name: string;
      type: string;
      entryFee: number;
      maxEntrants?: number;
      startDate: Date;
      endDate: Date;
      prizeStructure: any;
      scoringRules: any;
    }) => {
      return apiClient.competitions.create({
        ...params,
        leagueId: currentLeague?.id,
        createdBy: session?.user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: competitionKeys.list() });
      toast.success('Competition created successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create competition');
    },
  });
}