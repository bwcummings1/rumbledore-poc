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

interface Matchup {
  id: string;
  week: number;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'FINAL';
  isPlayoffs: boolean;
  home: {
    id: string;
    name: string;
    owner: string;
    logo?: string;
    abbrev?: string;
    score: number;
    projected: number;
    record: string;
  };
  away: {
    id: string;
    name: string;
    owner: string;
    logo?: string;
    abbrev?: string;
    score: number;
    projected: number;
    record: string;
  };
  gamesPlayed?: number;
  totalGames?: number;
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
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const renderMatchupCard = (matchup: Matchup) => {
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
            {matchup.isPlayoffs && <Badge variant="destructive">Playoff</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Away Team */}
          <div className={cn(
            "flex items-center justify-between p-3 rounded-lg border",
            winner === 'away' && "bg-green-500/10 border-green-500/20"
          )}>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={matchup.away.logo} />
                <AvatarFallback>{matchup.away.abbrev || matchup.away.name.substring(0, 2)}</AvatarFallback>
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
          {isLive && matchup.gamesPlayed !== undefined && matchup.totalGames !== undefined && (
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
            "flex items-center justify-between p-3 rounded-lg border",
            winner === 'home' && "bg-green-500/10 border-green-500/20"
          )}>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={matchup.home.logo} />
                <AvatarFallback>{matchup.home.abbrev || matchup.home.name.substring(0, 2)}</AvatarFallback>
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
            onClick={() => {
              // Navigate to matchup details
              window.location.href = `/leagues/${leagueId}/matchups/${matchup.id}`;
            }}
          >
            View Matchup Details
          </Button>
        </CardContent>
      </Card>
    );
  };

  // Transform matchups data to match the expected format
  const transformedMatchups: Matchup[] = (matchups || []).map((m: any) => ({
    id: m.id,
    week: m.week || currentWeek,
    status: m.isComplete ? 'FINAL' : 'SCHEDULED',
    isPlayoffs: m.isPlayoffs || false,
    home: {
      id: m.homeTeamId,
      name: m.homeTeam?.name || 'Home Team',
      owner: m.homeTeam?.owner || 'Owner',
      logo: m.homeTeam?.logo,
      abbrev: m.homeTeam?.abbrev,
      score: m.homeScore || 0,
      projected: m.homeProjected || 0,
      record: `${m.homeTeam?.wins || 0}-${m.homeTeam?.losses || 0}`,
    },
    away: {
      id: m.awayTeamId,
      name: m.awayTeam?.name || 'Away Team',
      owner: m.awayTeam?.owner || 'Owner',
      logo: m.awayTeam?.logo,
      abbrev: m.awayTeam?.abbrev,
      score: m.awayScore || 0,
      projected: m.awayProjected || 0,
      record: `${m.awayTeam?.wins || 0}-${m.awayTeam?.losses || 0}`,
    },
    gamesPlayed: m.gamesPlayed,
    totalGames: m.totalGames,
  }));

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
        {transformedMatchups.map(renderMatchupCard)}
      </div>
    </div>
  );
}