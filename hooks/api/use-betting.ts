import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, BetPayload } from '@/lib/api/client';
import { toast } from 'sonner';

// Query keys
export const bettingKeys = {
  all: ['betting'] as const,
  bankrolls: () => [...bettingKeys.all, 'bankroll'] as const,
  bankroll: (leagueId: string) => [...bettingKeys.bankrolls(), leagueId] as const,
  bankrollHistory: (leagueId: string) => [...bettingKeys.bankroll(leagueId), 'history'] as const,
  bets: () => [...bettingKeys.all, 'bets'] as const,
  activeBets: (leagueId: string) => [...bettingKeys.bets(), 'active', leagueId] as const,
  betHistory: (leagueId: string) => [...bettingKeys.bets(), 'history', leagueId] as const,
  betSlip: () => [...bettingKeys.all, 'slip'] as const,
};

// Fetch user's bankroll for a league
export function useBankroll(leagueId: string) {
  return useQuery({
    queryKey: bettingKeys.bankroll(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.betting.bankroll(leagueId);
      return data;
    },
    enabled: !!leagueId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

// Fetch bankroll history
export function useBankrollHistory(leagueId: string) {
  return useQuery({
    queryKey: bettingKeys.bankrollHistory(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.betting.bankrollHistory(leagueId);
      return data;
    },
    enabled: !!leagueId,
  });
}

// Fetch active bets
export function useActiveBets(leagueId: string) {
  return useQuery({
    queryKey: bettingKeys.activeBets(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.betting.activeBets(leagueId);
      return data;
    },
    enabled: !!leagueId,
    refetchInterval: 30000, // Refetch every 30 seconds during live games
  });
}

// Fetch betting history
export function useBetHistory(leagueId: string) {
  return useQuery({
    queryKey: bettingKeys.betHistory(leagueId),
    queryFn: async () => {
      const { data } = await apiClient.betting.history(leagueId);
      return data;
    },
    enabled: !!leagueId,
  });
}

// Fetch bet slip
export function useBetSlip() {
  return useQuery({
    queryKey: bettingKeys.betSlip(),
    queryFn: async () => {
      const { data } = await apiClient.betting.betSlip();
      return data;
    },
  });
}

// Place a bet
export function usePlaceBet() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: BetPayload) => apiClient.betting.placeBet(data),
    onSuccess: (_, variables) => {
      // Invalidate relevant queries after placing bet
      queryClient.invalidateQueries({ queryKey: bettingKeys.bankroll(variables.leagueId) });
      queryClient.invalidateQueries({ queryKey: bettingKeys.activeBets(variables.leagueId) });
      queryClient.invalidateQueries({ queryKey: bettingKeys.betSlip() });
      toast.success('Bet placed successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to place bet');
    },
  });
}

// Place a parlay bet
export function usePlaceParlayBet() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: any) => apiClient.betting.placeParlayBet(data),
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: bettingKeys.bankroll(variables.leagueId) });
      queryClient.invalidateQueries({ queryKey: bettingKeys.activeBets(variables.leagueId) });
      queryClient.invalidateQueries({ queryKey: bettingKeys.betSlip() });
      toast.success('Parlay bet placed successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to place parlay bet');
    },
  });
}

// Update bet slip
export function useUpdateBetSlip() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (selections: any[]) => apiClient.betting.updateBetSlip(selections),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bettingKeys.betSlip() });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update bet slip');
    },
  });
}