'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Swords, Clock, Calendar } from 'lucide-react';
import { useLeagueContext } from '@/contexts/league-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from 'next-auth/react';

export function MatchupWidget() {
  const { currentLeague } = useLeagueContext();
  const { data: session } = useSession();
  
  const { data: matchup, isLoading } = useQuery({
    queryKey: ['matchup', currentLeague?.id, session?.user?.id],
    queryFn: async () => {
      if (!currentLeague || !session?.user) return null;
      // Fetch current week's matchup for the user
      const { data } = await apiClient.leagues.matchups(currentLeague.id, {
        week: 'current',
        userId: session.user.id,
      });
      return data?.[0]; // Return first matchup
    },
    enabled: !!currentLeague && !!session?.user,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (!currentLeague || !session?.user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Current Matchup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Login and select a league to view your matchup
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Current Matchup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-4" />
            <Skeleton className="h-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!matchup) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Current Matchup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No active matchup this week</p>
        </CardContent>
      </Card>
    );
  }

  const homeScore = matchup.homeScore || 0;
  const awayScore = matchup.awayScore || 0;
  const totalPossibleScore = 200; // Estimate max possible score
  const scoreProgress = ((homeScore + awayScore) / totalPossibleScore) * 100;
  const isUserHome = matchup.homeTeam?.userId === session.user.id;
  const userScore = isUserHome ? homeScore : awayScore;
  const opponentScore = isUserHome ? awayScore : homeScore;
  const isWinning = userScore > opponentScore;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5" />
          Current Matchup
          <Badge variant="outline" className="ml-auto">
            Week {matchup.week}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Teams */}
          <div className="grid grid-cols-2 gap-4">
            <div className={isUserHome ? 'order-1' : 'order-2'}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">
                    {matchup.homeTeam?.name || 'Home Team'}
                  </span>
                  {isUserHome && (
                    <Badge variant="secondary" className="text-xs">You</Badge>
                  )}
                </div>
                <div className="text-3xl font-bold">{homeScore.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">
                  {matchup.homeTeam?.record || '0-0'}
                </div>
              </div>
            </div>
            
            <div className={isUserHome ? 'order-2' : 'order-1'}>
              <div className="space-y-2 text-right">
                <div className="flex items-center justify-between">
                  {!isUserHome && (
                    <Badge variant="secondary" className="text-xs">You</Badge>
                  )}
                  <span className="text-sm font-medium truncate">
                    {matchup.awayTeam?.name || 'Away Team'}
                  </span>
                </div>
                <div className="text-3xl font-bold">{awayScore.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">
                  {matchup.awayTeam?.record || '0-0'}
                </div>
              </div>
            </div>
          </div>

          {/* Score Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Game Progress</span>
              <span>{scoreProgress.toFixed(0)}%</span>
            </div>
            <Progress value={scoreProgress} className="h-2" />
          </div>

          {/* Status */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{matchup.status || 'In Progress'}</span>
            </div>
            {isWinning ? (
              <Badge variant="default" className="text-xs">
                Winning by {(userScore - opponentScore).toFixed(1)}
              </Badge>
            ) : userScore === opponentScore ? (
              <Badge variant="secondary" className="text-xs">
                Tied
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">
                Losing by {(opponentScore - userScore).toFixed(1)}
              </Badge>
            )}
          </div>

          {/* Players Remaining */}
          {matchup.playersRemaining && (
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium">{matchup.homePlayersRemaining || 0}</span> players left
              </div>
              <div className="text-right">
                <span className="font-medium">{matchup.awayPlayersRemaining || 0}</span> players left
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}