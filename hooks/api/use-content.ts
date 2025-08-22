import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useLeagueContext } from '@/contexts/league-context';
import { toast } from 'sonner';

// Query keys
export const contentKeys = {
  all: ['content'] as const,
  articles: () => [...contentKeys.all, 'articles'] as const,
  article: (id: string) => [...contentKeys.articles(), id] as const,
  leagueContent: (leagueId: string) => [...contentKeys.articles(), 'league', leagueId] as const,
  platformContent: () => [...contentKeys.articles(), 'platform'] as const,
  schedule: (leagueId?: string) => [...contentKeys.all, 'schedule', leagueId] as const,
  trending: () => [...contentKeys.all, 'trending'] as const,
  categories: () => [...contentKeys.all, 'categories'] as const,
};

export type ContentType = 'platform' | 'league';

export function useContent(type: ContentType = 'platform', options?: { limit?: number; category?: string }) {
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: type === 'league' 
      ? contentKeys.leagueContent(currentLeague?.id || '') 
      : contentKeys.platformContent(),
    queryFn: async () => {
      if (type === 'league' && !currentLeague) return [];
      
      const params = {
        scope: type,
        leagueId: type === 'league' ? currentLeague?.id : undefined,
        limit: options?.limit || 20,
        category: options?.category,
      };
      
      const { data } = await apiClient.content.list(params);
      return data;
    },
    enabled: type === 'platform' || !!currentLeague,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useArticle(articleId: string) {
  return useQuery({
    queryKey: contentKeys.article(articleId),
    queryFn: async () => {
      const { data } = await apiClient.content.get(articleId);
      return data;
    },
    enabled: !!articleId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useContentSchedule() {
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: contentKeys.schedule(currentLeague?.id),
    queryFn: async () => {
      const params = currentLeague 
        ? { leagueId: currentLeague.id }
        : { scope: 'platform' };
      
      const { data } = await apiClient.content.schedule(params);
      return data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useTrendingTopics() {
  return useQuery({
    queryKey: contentKeys.trending(),
    queryFn: async () => {
      const { data } = await apiClient.content.trending();
      return data;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

export function useContentCategories() {
  return useQuery({
    queryKey: contentKeys.categories(),
    queryFn: async () => {
      const { data } = await apiClient.content.categories();
      return data;
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useGenerateContent() {
  const queryClient = useQueryClient();
  const { currentLeague } = useLeagueContext();
  
  return useMutation({
    mutationFn: (params: { 
      type: string; 
      prompt?: string; 
      agentType?: string;
    }) => {
      return apiClient.content.generate({
        ...params,
        leagueId: currentLeague?.id,
      });
    },
    onSuccess: () => {
      // Invalidate content queries to show new content
      queryClient.invalidateQueries({ queryKey: contentKeys.articles() });
      if (currentLeague) {
        queryClient.invalidateQueries({ 
          queryKey: contentKeys.leagueContent(currentLeague.id) 
        });
      }
      toast.success('Content generated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to generate content');
    },
  });
}

export function useScheduleContent() {
  const queryClient = useQueryClient();
  const { currentLeague } = useLeagueContext();
  
  return useMutation({
    mutationFn: (params: { 
      contentType: string;
      frequency: string;
      time: string;
      enabled: boolean;
    }) => {
      return apiClient.content.createSchedule({
        ...params,
        leagueId: currentLeague?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contentKeys.schedule() });
      toast.success('Content scheduled successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to schedule content');
    },
  });
}

export function useLikeContent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (articleId: string) => apiClient.content.like(articleId),
    onSuccess: (_, articleId) => {
      queryClient.invalidateQueries({ queryKey: contentKeys.article(articleId) });
    },
  });
}

export function useShareContent() {
  return useMutation({
    mutationFn: (params: { articleId: string; platform: string }) => 
      apiClient.content.share(params.articleId, params.platform),
    onSuccess: (_, { platform }) => {
      toast.success(`Shared to ${platform}!`);
    },
    onError: () => {
      toast.error('Failed to share content');
    },
  });
}