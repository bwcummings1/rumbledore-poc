# Sprint 19: Feature Integration

## Sprint Overview
**Phase**: 6 - Frontend Integration  
**Sprint**: 3 of 4  
**Duration**: 2 weeks  
**Focus**: Connect all existing advanced features (betting, stats, competitions, AI, content) with real data  
**Risk Level**: Low - Components exist, just need wiring

## Objectives
1. Wire up BettingDashboard with real league/user context
2. Integrate StatsDashboard and HeadToHead components
3. Connect CompetitionDashboard and leaderboards
4. Integrate ContentDashboard for league news
5. Connect AI chat with WebSocket and league context
6. Replace all mock data on main dashboard

## Prerequisites
- Sprint 17-18 complete (Auth, API, Core features) ✅
- All backend APIs operational ✅
- WebSocket provider established ✅
- League context available ✅

## Technical Tasks

### Task 1: Dashboard Real Data Integration (Day 1-2)

#### 1.1 Create Dashboard Data Hooks
```typescript
// hooks/api/use-dashboard.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useLeagueContext } from '@/contexts/league-context';

export function useDashboardStats() {
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: ['dashboard', 'stats', currentLeague?.id],
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
  });
}

export function useLeagueMetrics() {
  const { currentLeague } = useLeagueContext();
  
  return useQuery({
    queryKey: ['dashboard', 'metrics', currentLeague?.id],
    queryFn: async () => {
      if (!currentLeague) return null;
      
      const { data } = await apiClient.stats.league(currentLeague.id);
      
      return {
        totalGames: data.totalGames,
        averageScore: data.averageScore,
        highestScore: data.highestScore,
        closestGame: data.closestGame,
        biggestBlowout: data.biggestBlowout,
        currentWeek: data.currentWeek,
      };
    },
    enabled: !!currentLeague,
  });
}
```

#### 1.2 Update Main Dashboard Page
```typescript
// app/(dashboard)/page.tsx
'use client';

import { LeagueProvider } from '@/contexts/league-context';
import DashboardPageLayout from '@/components/dashboard/layout';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { DashboardStats } from '@/components/dashboard/dashboard-stats';
import { DashboardChart } from '@/components/dashboard/dashboard-chart';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { UpcomingGames } from '@/components/dashboard/upcoming-games';
import { BettingSummary } from '@/components/dashboard/betting-summary';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, TrendingUp, DollarSign, MessageSquare } from 'lucide-react';
import { useDashboardStats, useLeagueMetrics } from '@/hooks/api/use-dashboard';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardOverview() {
  return (
    <LeagueProvider>
      <DashboardContent />
    </LeagueProvider>
  );
}

function DashboardContent() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: metrics, isLoading: metricsLoading } = useLeagueMetrics();

  return (
    <DashboardPageLayout
      header={{
        title: 'Overview',
        description: `Week ${metrics?.currentWeek || '—'} • Last updated ${new Date().toLocaleTimeString()}`,
        icon: Home,
        actions: <LeagueSwitcher />,
      }}
    >
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <DashboardStats stats={stats} metrics={metrics} />
        )}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="betting">Betting</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="chat">AI Assistant</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DashboardChart data={stats?.standings} />
            <UpcomingGames games={stats?.upcomingGames} />
          </div>
          <RecentActivity transactions={stats?.transactions} />
        </TabsContent>

        <TabsContent value="betting">
          <BettingSummary />
        </TabsContent>

        <TabsContent value="stats">
          {/* Statistics integration */}
        </TabsContent>

        <TabsContent value="chat">
          {/* AI chat integration */}
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <QuickActions />
    </DashboardPageLayout>
  );
}
```

### Task 2: Betting System Integration (Day 3-4)

#### 2.1 Connect BettingDashboard to Real Data
```typescript
// app/(dashboard)/rumble/betting/page.tsx
'use client';

import { LeagueProvider } from '@/contexts/league-context';
import DashboardPageLayout from '@/components/dashboard/layout';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { BettingDashboard } from '@/components/betting/betting-dashboard';
import { DollarSign } from 'lucide-react';
import { useLeagueContext } from '@/contexts/league-context';
import { useSession } from 'next-auth/react';

export default function BettingPage() {
  return (
    <LeagueProvider>
      <BettingContent />
    </LeagueProvider>
  );
}

function BettingContent() {
  const { currentLeague } = useLeagueContext();
  const { data: session } = useSession();

  if (!currentLeague) {
    return (
      <DashboardPageLayout
        header={{
          title: 'Paper Betting',
          description: 'Select a league to start betting',
          icon: DollarSign,
          actions: <LeagueSwitcher />,
        }}
      >
        <div className="flex flex-col items-center justify-center py-12">
          <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No League Selected</h3>
          <p className="text-muted-foreground">
            Select a league from the switcher to access betting features.
          </p>
        </div>
      </DashboardPageLayout>
    );
  }

  return (
    <DashboardPageLayout
      header={{
        title: 'Paper Betting',
        description: `${currentLeague.name} • Week ${currentLeague.currentWeek}`,
        icon: DollarSign,
        actions: <LeagueSwitcher />,
      }}
    >
      <BettingDashboard 
        leagueId={currentLeague.id}
        leagueSandbox={currentLeague.sandbox}
        userId={session?.user?.id}
      />
    </DashboardPageLayout>
  );
}
```

#### 2.2 Update Betting Hooks for Real Data
```typescript
// hooks/api/use-betting.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

export function useBankroll(leagueId?: string) {
  return useQuery({
    queryKey: ['bankroll', leagueId],
    queryFn: async () => {
      if (!leagueId) return null;
      const { data } = await apiClient.betting.bankroll(leagueId);
      return data;
    },
    enabled: !!leagueId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function usePlaceBet() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (betData: any) => apiClient.betting.placeBet(betData),
    onSuccess: (data, variables) => {
      toast.success('Bet placed successfully!');
      // Invalidate related queries
      queryClient.invalidateQueries(['bankroll', variables.leagueId]);
      queryClient.invalidateQueries(['bets', variables.leagueId]);
      queryClient.invalidateQueries(['betslip', variables.leagueId]);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to place bet');
    },
  });
}

export function useOdds(sport: string = 'americanfootball_nfl') {
  return useQuery({
    queryKey: ['odds', sport],
    queryFn: async () => {
      const { data } = await apiClient.odds.getNFL();
      return data;
    },
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}
```

### Task 3: Statistics Integration (Day 5-6)

#### 3.1 Create Statistics Page
```typescript
// app/(dashboard)/stats/page.tsx
'use client';

import { LeagueProvider } from '@/contexts/league-context';
import DashboardPageLayout from '@/components/dashboard/layout';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { StatsDashboard } from '@/components/statistics/stats-dashboard';
import { HeadToHead } from '@/components/statistics/head-to-head';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Users, TrendingUp, Award } from 'lucide-react';
import { useLeagueContext } from '@/contexts/league-context';

export default function StatisticsPage() {
  return (
    <LeagueProvider>
      <StatisticsContent />
    </LeagueProvider>
  );
}

function StatisticsContent() {
  const { currentLeague } = useLeagueContext();

  if (!currentLeague) {
    return (
      <DashboardPageLayout
        header={{
          title: 'Statistics',
          description: 'Select a league to view statistics',
          icon: BarChart3,
          actions: <LeagueSwitcher />,
        }}
      >
        <div className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No League Selected</h3>
          <p className="text-muted-foreground">
            Select a league to view detailed statistics.
          </p>
        </div>
      </DashboardPageLayout>
    );
  }

  return (
    <DashboardPageLayout
      header={{
        title: 'Statistics',
        description: `${currentLeague.name} • All-time stats`,
        icon: BarChart3,
        actions: <LeagueSwitcher />,
      }}
    >
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="h2h">Head to Head</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <StatsDashboard leagueId={currentLeague.id} />
        </TabsContent>

        <TabsContent value="h2h">
          <HeadToHead leagueId={currentLeague.id} />
        </TabsContent>

        <TabsContent value="records">
          {/* Records component */}
        </TabsContent>

        <TabsContent value="trends">
          {/* Trends component */}
        </TabsContent>
      </Tabs>
    </DashboardPageLayout>
  );
}
```

### Task 4: Competition System Integration (Day 7-8)

#### 4.1 Create Competitions Page
```typescript
// app/(dashboard)/rumble/competitions/page.tsx
'use client';

import { useState } from 'react';
import DashboardPageLayout from '@/components/dashboard/layout';
import { CompetitionDashboard } from '@/components/competitions/competition-dashboard';
import { CompetitionBrowser } from '@/components/competitions/competition-browser';
import { Leaderboard } from '@/components/competitions/leaderboard';
import { AchievementDisplay } from '@/components/competitions/achievement-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Target, Users, Award } from 'lucide-react';
import { useCompetitions } from '@/hooks/api/use-competitions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function CompetitionsPage() {
  const [scope, setScope] = useState<'league' | 'platform'>('league');
  const { data: competitions, isLoading } = useCompetitions(scope);

  return (
    <DashboardPageLayout
      header={{
        title: 'Competitions',
        description: 'Multi-tier betting competitions',
        icon: Trophy,
        actions: (
          <div className="flex gap-2">
            <Button
              variant={scope === 'league' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScope('league')}
            >
              League
            </Button>
            <Button
              variant={scope === 'platform' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setScope('platform')}
            >
              Platform
            </Button>
          </div>
        ),
      }}
    >
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="leaderboards">Leaderboards</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <CompetitionDashboard scope={scope} />
        </TabsContent>

        <TabsContent value="browse">
          <CompetitionBrowser scope={scope} />
        </TabsContent>

        <TabsContent value="leaderboards">
          <div className="space-y-4">
            {competitions?.map((comp) => (
              <Leaderboard 
                key={comp.id} 
                competitionId={comp.id}
                title={comp.name}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="achievements">
          <AchievementDisplay />
        </TabsContent>
      </Tabs>
    </DashboardPageLayout>
  );
}
```

### Task 5: AI Chat Integration (Day 9-10)

#### 5.1 Connect AI Chat with WebSocket
```typescript
// components/chat/agent-chat-enhanced.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '@/providers/websocket-provider';
import { useLeagueContext } from '@/contexts/league-context';
import { AgentSelector } from '@/components/ai/agent-selector';
import { ChatMessage } from '@/components/chat/chat-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Send, Bot, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

export function AgentChatEnhanced() {
  const { currentLeague } = useLeagueContext();
  const { socket, subscribe, unsubscribe } = useWebSocket();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('commissioner');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to chat events
    const handleMessage = (data: any) => {
      setMessages(prev => [...prev, data]);
      setIsTyping(false);
    };

    const handleTyping = (data: any) => {
      setIsTyping(data.isTyping);
    };

    const handleError = (error: any) => {
      toast.error(error.message || 'Chat error occurred');
      setIsTyping(false);
    };

    subscribe('chat:message', handleMessage);
    subscribe('chat:typing', handleTyping);
    subscribe('chat:error', handleError);

    // Join league room
    if (currentLeague && socket) {
      socket.emit('join:league', { leagueId: currentLeague.id });
    }

    return () => {
      unsubscribe('chat:message', handleMessage);
      unsubscribe('chat:typing', handleTyping);
      unsubscribe('chat:error', handleError);
      
      if (currentLeague && socket) {
        socket.emit('leave:league', { leagueId: currentLeague.id });
      }
    };
  }, [currentLeague, socket, subscribe, unsubscribe]);

  useEffect(() => {
    // Auto-scroll to bottom
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !currentLeague) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      // Send via WebSocket for real-time
      if (socket) {
        socket.emit('chat:send', {
          message: input,
          agentType: selectedAgent,
          leagueId: currentLeague.id,
        });
      } else {
        // Fallback to API
        const { data } = await apiClient.ai.chat(
          input,
          selectedAgent,
          currentLeague.id
        );
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.response,
          agent: selectedAgent,
          timestamp: new Date(),
        }]);
      }
    } catch (error) {
      toast.error('Failed to send message');
      setIsTyping(false);
    }
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <span className="font-medium">AI Assistant</span>
          </div>
          <AgentSelector
            value={selectedAgent}
            onValueChange={setSelectedAgent}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              isUser={message.role === 'user'}
            />
          ))}
          
          {isTyping && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Agent is typing...</span>
            </div>
          )}
          
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask ${selectedAgent} anything...`}
            disabled={isTyping}
          />
          <Button type="submit" disabled={!input.trim() || isTyping}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
```

### Task 6: Content Dashboard Integration (Day 11-12)

#### 6.1 Create Fantasy News Section
```typescript
// app/(dashboard)/news/page.tsx
'use client';

import { useState } from 'react';
import DashboardPageLayout from '@/components/dashboard/layout';
import { ContentDashboard } from '@/components/content/content-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Newspaper, TrendingUp, Users, Trophy } from 'lucide-react';
import { useContent } from '@/hooks/api/use-content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArticleCard } from '@/components/content/article-card';
import { ContentFilters } from '@/components/content/content-filters';

export default function FantasyNewsPage() {
  const [contentType, setContentType] = useState<'platform' | 'league'>('platform');
  const { data: articles, isLoading } = useContent(contentType);

  return (
    <DashboardPageLayout
      header={{
        title: 'Fantasy News',
        description: 'Latest updates and AI-generated content',
        icon: Newspaper,
        actions: (
          <div className="flex gap-2">
            <Button
              variant={contentType === 'platform' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setContentType('platform')}
            >
              Platform News
            </Button>
            <Button
              variant={contentType === 'league' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setContentType('league')}
            >
              League News
            </Button>
          </div>
        ),
      }}
    >
      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content Area */}
        <div className="md:col-span-2 space-y-4">
          <ContentFilters />
          
          {isLoading ? (
            <div>Loading articles...</div>
          ) : (
            <div className="space-y-4">
              {articles?.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trending Topics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {['Injuries', 'Trades', 'Waivers', 'DFS', 'Dynasty'].map((topic) => (
                  <Badge 
                    key={topic} 
                    variant="outline" 
                    className="mr-2 cursor-pointer hover:bg-accent"
                  >
                    {topic}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Weekly Recap</span>
                  <span className="text-muted-foreground">Monday</span>
                </div>
                <div className="flex justify-between">
                  <span>Power Rankings</span>
                  <span className="text-muted-foreground">Tuesday</span>
                </div>
                <div className="flex justify-between">
                  <span>Matchup Preview</span>
                  <span className="text-muted-foreground">Thursday</span>
                </div>
                <div className="flex justify-between">
                  <span>Start/Sit</span>
                  <span className="text-muted-foreground">Saturday</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {contentType === 'league' && (
            <ContentDashboard />
          )}
        </div>
      </div>
    </DashboardPageLayout>
  );
}
```

#### 6.2 Create Overview Widget Dashboard
```typescript
// components/dashboard/widget-dashboard.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings2, Plus, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Widget components
import { StandingsWidget } from '@/components/widgets/standings-widget';
import { BankrollWidget } from '@/components/widgets/bankroll-widget';
import { MatchupWidget } from '@/components/widgets/matchup-widget';
import { TransactionsWidget } from '@/components/widgets/transactions-widget';
import { ChatWidget } from '@/components/widgets/chat-widget';
import { NewsWidget } from '@/components/widgets/news-widget';

const AVAILABLE_WIDGETS = [
  { id: 'standings', name: 'Standings', component: StandingsWidget },
  { id: 'bankroll', name: 'Bankroll', component: BankrollWidget },
  { id: 'matchup', name: 'Current Matchup', component: MatchupWidget },
  { id: 'transactions', name: 'Recent Transactions', component: TransactionsWidget },
  { id: 'chat', name: 'AI Chat', component: ChatWidget },
  { id: 'news', name: 'Latest News', component: NewsWidget },
];

export function WidgetDashboard() {
  const [widgets, setWidgets] = useState(() => {
    // Load saved widget configuration
    const saved = localStorage.getItem('dashboardWidgets');
    return saved ? JSON.parse(saved) : ['standings', 'bankroll', 'matchup'];
  });
  
  const [editMode, setEditMode] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setWidgets((items: string[]) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        
        // Save to localStorage
        localStorage.setItem('dashboardWidgets', JSON.stringify(newOrder));
        
        return newOrder;
      });
    }
  };

  const addWidget = (widgetId: string) => {
    if (!widgets.includes(widgetId)) {
      const newWidgets = [...widgets, widgetId];
      setWidgets(newWidgets);
      localStorage.setItem('dashboardWidgets', JSON.stringify(newWidgets));
    }
  };

  const removeWidget = (widgetId: string) => {
    const newWidgets = widgets.filter((id: string) => id !== widgetId);
    setWidgets(newWidgets);
    localStorage.setItem('dashboardWidgets', JSON.stringify(newWidgets));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Your Dashboard</h2>
        <Button
          variant={editMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setEditMode(!editMode)}
        >
          <Settings2 className="h-4 w-4 mr-1" />
          {editMode ? 'Done' : 'Customize'}
        </Button>
      </div>

      {editMode && (
        <Card>
          <CardHeader>
            <CardTitle>Add Widgets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_WIDGETS.filter(w => !widgets.includes(w.id)).map((widget) => (
                <Button
                  key={widget.id}
                  variant="outline"
                  size="sm"
                  onClick={() => addWidget(widget.id)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {widget.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={widgets}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {widgets.map((widgetId: string) => {
              const widget = AVAILABLE_WIDGETS.find(w => w.id === widgetId);
              if (!widget) return null;

              return (
                <SortableWidget
                  key={widgetId}
                  id={widgetId}
                  widget={widget}
                  editMode={editMode}
                  onRemove={removeWidget}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableWidget({ id, widget, editMode, onRemove }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Component = widget.component;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className="relative">
        {editMode && (
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onRemove(id)}
            >
              ×
            </Button>
          </div>
        )}
        <Component />
      </Card>
    </div>
  );
}
```

## Testing Requirements

### Integration Tests
```typescript
// __tests__/integration/dashboard-data.test.tsx
describe('Dashboard Data Integration', () => {
  it('should load real league data');
  it('should update on league switch');
  it('should refresh data periodically');
});

// __tests__/integration/betting-integration.test.tsx
describe('Betting Integration', () => {
  it('should display correct bankroll');
  it('should place bets successfully');
  it('should update after bet settlement');
});

// __tests__/integration/chat-websocket.test.tsx
describe('AI Chat WebSocket', () => {
  it('should connect to WebSocket');
  it('should send and receive messages');
  it('should handle disconnections');
});
```

## Success Criteria
- [ ] Main dashboard uses real data
- [ ] BettingDashboard fully functional
- [ ] StatsDashboard displays real stats
- [ ] Competitions accessible and working
- [ ] AI chat connected via WebSocket
- [ ] Content dashboard shows articles
- [ ] All mock data removed
- [ ] Widget dashboard customizable
- [ ] Real-time updates working
- [ ] League context maintained

## Performance Targets
- Dashboard load: < 2 seconds
- Widget render: < 500ms
- Chat response: < 3 seconds
- Competition load: < 1 second
- Content fetch: < 1 second

## Next Sprint Preview
Sprint 20 will focus on mobile optimization and polish:
- Mobile navigation
- Responsive tables
- Touch interactions
- Loading states
- Error boundaries
- Performance optimization

---

*Sprint 19 brings all the advanced features to life by connecting them with real data and WebSocket communication.*