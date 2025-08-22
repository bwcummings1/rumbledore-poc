import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

// Query keys
export const aiKeys = {
  all: ['ai'] as const,
  agents: () => [...aiKeys.all, 'agents'] as const,
  chat: (leagueId?: string) => [...aiKeys.all, 'chat', leagueId] as const,
  sessions: (leagueId?: string) => [...aiKeys.all, 'sessions', leagueId] as const,
};

// Fetch available AI agents
export function useAIAgents() {
  return useQuery({
    queryKey: aiKeys.agents(),
    queryFn: async () => {
      const { data } = await apiClient.ai.agents();
      return data;
    },
    staleTime: 60 * 60 * 1000, // Cache for 1 hour (agents don't change often)
  });
}

// Send a chat message to an AI agent
export function useChatWithAgent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      message, 
      agentType, 
      leagueId 
    }: { 
      message: string; 
      agentType: string; 
      leagueId?: string;
    }) => apiClient.ai.chat(message, agentType, leagueId),
    onSuccess: (_, variables) => {
      // Invalidate chat history if needed
      if (variables.leagueId) {
        queryClient.invalidateQueries({ queryKey: aiKeys.chat(variables.leagueId) });
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send message');
    },
  });
}

// Multi-agent collaboration
export function useAgentCollaboration() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      agents, 
      message, 
      leagueId 
    }: { 
      agents: string[]; 
      message: string; 
      leagueId?: string;
    }) => apiClient.ai.collaborate(agents, message, leagueId),
    onSuccess: (_, variables) => {
      if (variables.leagueId) {
        queryClient.invalidateQueries({ queryKey: aiKeys.chat(variables.leagueId) });
      }
      toast.success('Agents are collaborating on your request');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to initiate collaboration');
    },
  });
}

// Summon an agent to the chat
export function useSummonAgent() {
  return useMutation({
    mutationFn: ({ 
      agentType, 
      leagueId 
    }: { 
      agentType: string; 
      leagueId: string;
    }) => apiClient.ai.summon(agentType, leagueId),
    onSuccess: (_, variables) => {
      toast.success(`${variables.agentType} agent has joined the chat`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to summon agent');
    },
  });
}