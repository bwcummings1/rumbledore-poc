# Sprint 18: Core League Features

## Sprint Overview
**Phase**: 6 - Frontend Integration  
**Sprint**: 2 of 4  
**Duration**: 2 weeks  
**Focus**: Build missing core league features including standings, rosters, matchups, and league management  
**Risk Level**: Low - Standard UI components with existing design system

## Objectives
1. Create league dashboard with context switcher
2. Build standings table with sorting and filters
3. Implement roster display with player management
4. Create matchup viewer with live scoring
5. Build team and player detail pages
6. Implement league history with sandboxed data

## Prerequisites
- Sprint 17 complete (Auth, API client, providers) ✅
- League data available via API ✅
- shadcn/ui components available ✅
- Dark theme established ✅

## Technical Tasks

### Task 1: League Context & Switcher (Day 1-2)

#### 1.1 Create League Context Provider
```typescript
// contexts/league-context.tsx
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLeagues } from '@/hooks/api/use-leagues';
import { League } from '@/types/league';

interface LeagueContextType {
  currentLeague: League | null;
  leagues: League[];
  isLoading: boolean;
  switchLeague: (leagueId: string) => void;
  defaultLeagueId: string | null;
  setDefaultLeague: (leagueId: string) => void;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const { data: leagues = [], isLoading } = useLeagues();
  const [currentLeague, setCurrentLeague] = useState<League | null>(null);
  const [defaultLeagueId, setDefaultLeagueId] = useState<string | null>(null);

  // Load default league from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('defaultLeagueId');
    if (stored) {
      setDefaultLeagueId(stored);
    }
  }, []);

  // Set current league when leagues load
  useEffect(() => {
    if (leagues.length > 0 && !currentLeague) {
      const defaultLeague = defaultLeagueId 
        ? leagues.find(l => l.id === defaultLeagueId) 
        : leagues[0];
      
      if (defaultLeague) {
        setCurrentLeague(defaultLeague);
      }
    }
  }, [leagues, defaultLeagueId, currentLeague]);

  const switchLeague = (leagueId: string) => {
    const league = leagues.find(l => l.id === leagueId);
    if (league) {
      setCurrentLeague(league);
    }
  };

  const setDefaultLeague = (leagueId: string) => {
    setDefaultLeagueId(leagueId);
    localStorage.setItem('defaultLeagueId', leagueId);
  };

  return (
    <LeagueContext.Provider value={{
      currentLeague,
      leagues,
      isLoading,
      switchLeague,
      defaultLeagueId,
      setDefaultLeague,
    }}>
      {children}
    </LeagueContext.Provider>
  );
}

export const useLeagueContext = () => {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeagueContext must be used within LeagueProvider');
  }
  return context;
};
```

#### 1.2 Create League Switcher Component
```typescript
// components/leagues/league-switcher.tsx
'use client';

import { Check, ChevronsUpDown, Settings, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLeagueContext } from '@/contexts/league-context';
import { Badge } from '@/components/ui/badge';

export function LeagueSwitcher() {
  const { 
    currentLeague, 
    leagues, 
    switchLeague, 
    defaultLeagueId,
    setDefaultLeague 
  } = useLeagueContext();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[250px] justify-between"
        >
          {currentLeague ? (
            <div className="flex items-center gap-2">
              <span className="truncate">{currentLeague.name}</span>
              {currentLeague.id === defaultLeagueId && (
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              )}
            </div>
          ) : (
            'Select league...'
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder="Search leagues..." />
          <CommandEmpty>No league found.</CommandEmpty>
          <CommandGroup>
            {leagues.map((league) => (
              <CommandItem
                key={league.id}
                onSelect={() => {
                  switchLeague(league.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    currentLeague?.id === league.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span>{league.name}</span>
                    {league.id === defaultLeagueId && (
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {league.season} • {league.teamCount} teams
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup>
            <CommandItem
              onSelect={() => {
                if (currentLeague) {
                  setDefaultLeague(currentLeague.id);
                }
                setOpen(false);
              }}
            >
              <Star className="mr-2 h-4 w-4" />
              Set as default
            </CommandItem>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

### Task 2: League Dashboard Page (Day 3-4)

#### 2.1 Create League Dashboard
```typescript
// app/(dashboard)/leagues/[leagueId]/page.tsx
import { Suspense } from 'react';
import DashboardPageLayout from '@/components/dashboard/layout';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { StandingsCard } from '@/components/leagues/standings-card';
import { UpcomingMatchups } from '@/components/leagues/upcoming-matchups';
import { RecentTransactions } from '@/components/leagues/recent-transactions';
import { LeagueStats } from '@/components/leagues/league-stats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Users, Calendar, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeagueDashboardPage({
  params,
}: {
  params: { leagueId: string };
}) {
  return (
    <DashboardPageLayout
      header={{
        title: 'League Dashboard',
        description: 'Overview of your fantasy league',
        icon: Trophy,
        actions: <LeagueSwitcher />,
      }}
    >
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="matchups">Matchups</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <LeagueStats />
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <Suspense fallback={<Skeleton className="h-[400px]" />}>
              <StandingsCard leagueId={params.leagueId} compact />
            </Suspense>
            
            <Suspense fallback={<Skeleton className="h-[400px]" />}>
              <UpcomingMatchups leagueId={params.leagueId} />
            </Suspense>
          </div>

          <Suspense fallback={<Skeleton className="h-[200px]" />}>
            <RecentTransactions leagueId={params.leagueId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="standings">
          <Suspense fallback={<Skeleton className="h-[600px]" />}>
            <StandingsCard leagueId={params.leagueId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="matchups">
          <Suspense fallback={<Skeleton className="h-[600px]" />}>
            <MatchupsView leagueId={params.leagueId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="stats">
          <Suspense fallback={<Skeleton className="h-[600px]" />}>
            <LeagueStatsView leagueId={params.leagueId} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </DashboardPageLayout>
  );
}
```

### Task 3: Standings Table Component (Day 5-6)

#### 3.1 Create Standings Table
```typescript
// components/leagues/standings-table.tsx
'use client';

import { useState } from 'react';
import { useStandings } from '@/hooks/api/use-leagues';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowUp, ArrowDown, Minus, Trophy, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StandingsTableProps {
  leagueId: string;
  compact?: boolean;
}

export function StandingsTable({ leagueId, compact = false }: StandingsTableProps) {
  const { data: standings, isLoading } = useStandings(leagueId);
  const [sortField, setSortField] = useState<'wins' | 'points'>('wins');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  if (isLoading) {
    return <div>Loading standings...</div>;
  }

  const sortedStandings = [...(standings || [])].sort((a, b) => {
    const field = sortField === 'wins' ? 'wins' : 'pointsFor';
    return sortOrder === 'desc' 
      ? b[field] - a[field]
      : a[field] - b[field];
  });

  const renderTrend = (trend: number) => {
    if (trend > 0) return <ArrowUp className="h-4 w-4 text-green-500" />;
    if (trend < 0) return <ArrowDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const renderStreak = (streak: { type: 'W' | 'L'; count: number }) => {
    const className = streak.type === 'W' ? 'text-green-500' : 'text-red-500';
    return (
      <span className={cn('font-medium', className)}>
        {streak.count}{streak.type}
      </span>
    );
  };

  if (compact) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">Rank</TableHead>
            <TableHead>Team</TableHead>
            <TableHead className="text-right">W-L</TableHead>
            <TableHead className="text-right">PF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedStandings.slice(0, 6).map((team, index) => (
            <TableRow key={team.id}>
              <TableCell>
                <div className="flex items-center gap-1">
                  {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
                  {index + 1}
                </div>
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={team.logo} />
                    <AvatarFallback>{team.abbrev}</AvatarFallback>
                  </Avatar>
                  <span className="truncate max-w-[150px]">{team.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                {team.wins}-{team.losses}
              </TableCell>
              <TableCell className="text-right">{team.pointsFor.toFixed(1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={sortField === 'wins' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortField('wins')}
          >
            By Record
          </Button>
          <Button
            variant={sortField === 'points' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortField('points')}
          >
            By Points
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">Rank</TableHead>
            <TableHead>Team</TableHead>
            <TableHead className="text-center">W-L-T</TableHead>
            <TableHead className="text-center">PCT</TableHead>
            <TableHead className="text-right">PF</TableHead>
            <TableHead className="text-right">PA</TableHead>
            <TableHead className="text-center">Streak</TableHead>
            <TableHead className="text-center">Trend</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedStandings.map((team, index) => (
            <TableRow 
              key={team.id}
              className={cn(
                team.isPlayoffTeam && 'bg-green-500/5',
                team.isEliminated && 'opacity-50'
              )}
            >
              <TableCell>
                <div className="flex items-center gap-1">
                  {index === 0 && <Trophy className="h-4 w-4 text-yellow-500" />}
                  {team.clinched && <Target className="h-4 w-4 text-green-500" />}
                  {index + 1}
                </div>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  className="h-auto p-0 font-medium hover:underline"
                  onClick={() => {/* Navigate to team page */}}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={team.logo} />
                      <AvatarFallback>{team.abbrev}</AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <div>{team.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {team.owner}
                      </div>
                    </div>
                  </div>
                </Button>
              </TableCell>
              <TableCell className="text-center">
                {team.wins}-{team.losses}-{team.ties}
              </TableCell>
              <TableCell className="text-center">
                {((team.wins / (team.wins + team.losses)) * 100).toFixed(1)}%
              </TableCell>
              <TableCell className="text-right font-mono">
                {team.pointsFor.toFixed(2)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {team.pointsAgainst.toFixed(2)}
              </TableCell>
              <TableCell className="text-center">
                {renderStreak(team.streak)}
              </TableCell>
              <TableCell className="text-center">
                {renderTrend(team.trend)}
              </TableCell>
              <TableCell>
                {team.clinched && (
                  <Badge variant="default" className="bg-green-500">
                    Clinched
                  </Badge>
                )}
                {team.isEliminated && (
                  <Badge variant="destructive">
                    Eliminated
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### Task 4: Roster Display Component (Day 7-8)

#### 4.1 Create Roster Display
```typescript
// components/leagues/roster-display.tsx
'use client';

import { useState } from 'react';
import { useRoster } from '@/hooks/api/use-teams';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Plus,
  Minus,
  ArrowUpDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RosterDisplayProps {
  leagueId: string;
  teamId: string;
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K', 'BENCH', 'IR'];

export function RosterDisplay({ leagueId, teamId }: RosterDisplayProps) {
  const { data: roster, isLoading } = useRoster(leagueId, teamId);
  const [view, setView] = useState<'lineup' | 'bench' | 'all'>('lineup');

  if (isLoading) {
    return <div>Loading roster...</div>;
  }

  const groupedPlayers = roster?.players.reduce((acc, player) => {
    const position = player.lineupSlot || 'BENCH';
    if (!acc[position]) acc[position] = [];
    acc[position].push(player);
    return acc;
  }, {} as Record<string, typeof roster.players>);

  const renderPlayerStatus = (player: any) => {
    if (player.injuryStatus === 'OUT') {
      return <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> OUT
      </Badge>;
    }
    if (player.injuryStatus === 'QUESTIONABLE') {
      return <Badge variant="secondary" className="gap-1">Q</Badge>;
    }
    if (player.injuryStatus === 'DOUBTFUL') {
      return <Badge variant="secondary" className="gap-1">D</Badge>;
    }
    return null;
  };

  const renderProjection = (projected: number, actual?: number) => {
    if (actual !== undefined) {
      const diff = actual - projected;
      const color = diff > 0 ? 'text-green-500' : 'text-red-500';
      return (
        <div className="text-right">
          <div className="font-medium">{actual.toFixed(1)}</div>
          <div className={cn('text-xs', color)}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
          </div>
        </div>
      );
    }
    return <div className="text-right text-muted-foreground">{projected.toFixed(1)}</div>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Roster</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Player
            </Button>
            <Button variant="outline" size="sm">
              <ArrowUpDown className="h-4 w-4 mr-1" /> Optimize
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={view} onValueChange={(v) => setView(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="lineup">Starting Lineup</TabsTrigger>
            <TabsTrigger value="bench">Bench</TabsTrigger>
            <TabsTrigger value="all">All Players</TabsTrigger>
          </TabsList>

          <TabsContent value="lineup" className="mt-4">
            <div className="space-y-4">
              {POSITION_ORDER.filter(pos => pos !== 'BENCH' && pos !== 'IR').map(position => (
                <div key={position} className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground">
                    {position}
                  </div>
                  {groupedPlayers?.[position]?.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={player.image} />
                          <AvatarFallback>{player.firstName?.[0]}{player.lastName?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{player.name}</span>
                            {renderPlayerStatus(player)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {player.team} • {player.position} • vs {player.opponent}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {renderProjection(player.projectedPoints, player.actualPoints)}
                        <Button variant="ghost" size="sm">
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(!groupedPlayers?.[position] || groupedPlayers[position].length === 0) && (
                    <div className="p-3 rounded-lg border border-dashed text-center text-muted-foreground">
                      Empty slot
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="bench" className="mt-4">
            <div className="space-y-2">
              {groupedPlayers?.['BENCH']?.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={player.image} />
                      <AvatarFallback>{player.firstName?.[0]}{player.lastName?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{player.name}</span>
                        <Badge variant="outline">{player.position}</Badge>
                        {renderPlayerStatus(player)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {player.team} • vs {player.opponent}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {renderProjection(player.projectedPoints)}
                    <Button variant="ghost" size="sm">
                      <TrendingUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Opponent</TableHead>
                  <TableHead className="text-right">Projected</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster?.players.map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={player.image} />
                          <AvatarFallback>{player.firstName?.[0]}{player.lastName?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{player.name}</div>
                          <div className="text-xs text-muted-foreground">{player.team}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{player.position}</Badge>
                    </TableCell>
                    <TableCell>vs {player.opponent}</TableCell>
                    <TableCell className="text-right">
                      {player.projectedPoints.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right">
                      {player.actualPoints?.toFixed(1) || '-'}
                    </TableCell>
                    <TableCell>{renderPlayerStatus(player)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

### Task 5: Matchup Viewer Component (Day 9-10)

#### 5.1 Create Matchup Display
```typescript
// components/leagues/matchup-display.tsx
'use client';

import { useState, useEffect } from 'react';
import { useMatchups } from '@/hooks/api/use-leagues';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Activity, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWebSocket } from '@/providers/websocket-provider';

interface MatchupDisplayProps {
  leagueId: string;
  week?: number;
}

export function MatchupDisplay({ leagueId, week }: MatchupDisplayProps) {
  const [currentWeek, setCurrentWeek] = useState(week || 1);
  const { data: matchups, isLoading } = useMatchups(leagueId, currentWeek);
  const { subscribe, unsubscribe } = useWebSocket();
  const [liveScores, setLiveScores] = useState<Record<string, number>>({});

  useEffect(() => {
    const handleScoreUpdate = (data: any) => {
      if (data.leagueId === leagueId && data.week === currentWeek) {
        setLiveScores(prev => ({
          ...prev,
          [data.teamId]: data.score,
        }));
      }
    };

    subscribe('score-update', handleScoreUpdate);
    return () => unsubscribe('score-update', handleScoreUpdate);
  }, [leagueId, currentWeek, subscribe, unsubscribe]);

  if (isLoading) {
    return <div>Loading matchups...</div>;
  }

  const renderMatchupCard = (matchup: any) => {
    const homeScore = liveScores[matchup.home.id] || matchup.home.score;
    const awayScore = liveScores[matchup.away.id] || matchup.away.score;
    const isLive = matchup.status === 'IN_PROGRESS';
    const isFinal = matchup.status === 'FINAL';
    const winner = isFinal && homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : null;

    return (
      <Card key={matchup.id} className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Badge variant={isLive ? 'default' : isFinal ? 'secondary' : 'outline'}>
              {isLive && <Activity className="h-3 w-3 mr-1 animate-pulse" />}
              {matchup.status}
            </Badge>
            {matchup.playoff && <Badge variant="destructive">Playoff</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Away Team */}
          <div className={cn(
            "flex items-center justify-between p-3 rounded-lg",
            winner === 'away' && "bg-green-500/10 border-green-500/20"
          )}>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={matchup.away.logo} />
                <AvatarFallback>{matchup.away.abbrev}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{matchup.away.name}</div>
                <div className="text-xs text-muted-foreground">
                  {matchup.away.owner} ({matchup.away.record})
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{awayScore.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                Proj: {matchup.away.projected.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Score Progress */}
          {isLive && (
            <div className="space-y-1">
              <Progress 
                value={(matchup.gamesPlayed / matchup.totalGames) * 100} 
                className="h-2"
              />
              <div className="text-xs text-muted-foreground text-center">
                {matchup.gamesPlayed} of {matchup.totalGames} games played
              </div>
            </div>
          )}

          {/* Home Team */}
          <div className={cn(
            "flex items-center justify-between p-3 rounded-lg",
            winner === 'home' && "bg-green-500/10 border-green-500/20"
          )}>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={matchup.home.logo} />
                <AvatarFallback>{matchup.home.abbrev}</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium">{matchup.home.name}</div>
                <div className="text-xs text-muted-foreground">
                  {matchup.home.owner} ({matchup.home.record})
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{homeScore.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                Proj: {matchup.home.projected.toFixed(2)}
              </div>
            </div>
          </div>

          {/* View Details Button */}
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => {/* Navigate to matchup details */}}
          >
            View Matchup Details
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(prev => Math.max(1, prev - 1))}
            disabled={currentWeek === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-medium">Week {currentWeek}</div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentWeek(prev => Math.min(17, prev + 1))}
            disabled={currentWeek === 17}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm">
          <TrendingUp className="h-4 w-4 mr-1" />
          Live Scoring
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {matchups?.map(renderMatchupCard)}
      </div>
    </div>
  );
}
```

### Task 6: League History Implementation (Day 11-12)

#### 6.1 Create League History Page
```typescript
// app/(dashboard)/leagues/history/page.tsx
'use client';

import { useState } from 'react';
import DashboardPageLayout from '@/components/dashboard/layout';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { useLeagueContext } from '@/contexts/league-context';
import { useLeagueHistory } from '@/hooks/api/use-leagues';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Medal, TrendingUp, Award } from 'lucide-react';
import { AllTimeRecords } from '@/components/leagues/all-time-records';
import { ChampionshipHistory } from '@/components/leagues/championship-history';
import { SeasonComparison } from '@/components/leagues/season-comparison';
import { RecordBook } from '@/components/leagues/record-book';

export default function LeagueHistoryPage() {
  const { currentLeague } = useLeagueContext();
  const { data: history, isLoading } = useLeagueHistory(currentLeague?.id);

  if (!currentLeague) {
    return (
      <DashboardPageLayout
        header={{
          title: 'League History',
          description: 'Select a league to view history',
          icon: Trophy,
          actions: <LeagueSwitcher />,
        }}
      >
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No League Selected</h3>
            <p className="text-muted-foreground text-center">
              Select a league from the switcher above to view its history.
            </p>
          </CardContent>
        </Card>
      </DashboardPageLayout>
    );
  }

  return (
    <DashboardPageLayout
      header={{
        title: 'League History',
        description: `${currentLeague.name} • ${history?.seasonsCount || 0} seasons`,
        icon: Trophy,
        actions: <LeagueSwitcher />,
      }}
    >
      <Tabs defaultValue="records" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="championships">Championships</TabsTrigger>
          <TabsTrigger value="seasons">Seasons</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="space-y-4">
          <AllTimeRecords leagueId={currentLeague.id} />
          <RecordBook leagueId={currentLeague.id} />
        </TabsContent>

        <TabsContent value="championships" className="space-y-4">
          <ChampionshipHistory leagueId={currentLeague.id} />
        </TabsContent>

        <TabsContent value="seasons" className="space-y-4">
          <SeasonComparison leagueId={currentLeague.id} />
        </TabsContent>

        <TabsContent value="achievements" className="space-y-4">
          {/* Achievement tracking component */}
        </TabsContent>
      </Tabs>
    </DashboardPageLayout>
  );
}
```

## Testing Requirements

### Component Tests
```typescript
// __tests__/components/leagues/standings-table.test.tsx
describe('StandingsTable', () => {
  it('should display team standings');
  it('should sort by wins and points');
  it('should show playoff indicators');
  it('should handle compact mode');
});

// __tests__/components/leagues/roster-display.test.tsx
describe('RosterDisplay', () => {
  it('should display starting lineup');
  it('should show bench players');
  it('should indicate player injuries');
  it('should handle empty slots');
});
```

### Integration Tests
```typescript
// __tests__/pages/leagues/dashboard.test.tsx
describe('League Dashboard', () => {
  it('should load league data');
  it('should switch between leagues');
  it('should display all dashboard widgets');
  it('should handle real-time updates');
});
```

## Success Criteria
- [ ] League switcher maintains context across pages
- [ ] Default league preference persists
- [ ] Standings table sortable and filterable
- [ ] Roster shows lineup with live scoring
- [ ] Matchups display with real-time updates
- [ ] League history properly sandboxed
- [ ] All components mobile responsive
- [ ] WebSocket updates reflected in UI
- [ ] Loading states for async data
- [ ] Error handling for failed requests

## Performance Targets
- League switch: < 500ms
- Standings load: < 1 second
- Roster display: < 1 second
- Matchup updates: < 100ms (WebSocket)
- History query: < 2 seconds

## Next Sprint Preview
Sprint 19 will focus on integrating existing features:
- Connect BettingDashboard with real data
- Wire up StatsDashboard
- Integrate Competitions
- Connect AI chat
- Replace all mock data

---

*Sprint 18 delivers the core fantasy football features users expect from the platform.*