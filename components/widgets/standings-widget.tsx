'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { useLeagueContext } from '@/contexts/league-context';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function StandingsWidget() {
  const { currentLeague } = useLeagueContext();
  
  const { data: standings, isLoading } = useQuery({
    queryKey: ['standings', currentLeague?.id],
    queryFn: async () => {
      if (!currentLeague) return null;
      const { data } = await apiClient.leagues.standings(currentLeague.id);
      return data;
    },
    enabled: !!currentLeague,
    refetchInterval: 60000, // Refresh every minute
  });

  if (!currentLeague) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Standings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select a league to view standings</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Standings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const topTeams = standings?.slice(0, 5) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Standings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {topTeams.map((team: any, index: number) => (
            <div key={team.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-bold w-6",
                  index === 0 && "text-yellow-500",
                  index === 1 && "text-gray-400",
                  index === 2 && "text-orange-600"
                )}>
                  {index + 1}
                </span>
                <span className="text-sm font-medium truncate max-w-[120px]">
                  {team.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {team.wins}-{team.losses}
                </span>
                {team.streak && (
                  <Badge variant="outline" className="text-xs px-1">
                    {team.streak > 0 ? (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    {Math.abs(team.streak)}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
        {standings && standings.length > 5 && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            +{standings.length - 5} more teams
          </p>
        )}
      </CardContent>
    </Card>
  );
}