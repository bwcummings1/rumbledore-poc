'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMatchups } from '@/hooks/api/use-leagues';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface UpcomingMatchupsProps {
  leagueId: string;
}

export function UpcomingMatchups({ leagueId }: UpcomingMatchupsProps) {
  const { data: matchups, isLoading } = useMatchups(leagueId);

  return (
    <Card className="h-[400px] flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Upcoming Matchups</CardTitle>
          <Badge variant="outline">Week {matchups?.[0]?.week || 1}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : matchups?.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No matchups scheduled
          </div>
        ) : (
          <div className="space-y-2">
            {matchups?.slice(0, 4).map((matchup: any) => (
              <div
                key={matchup.id}
                className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {matchup.homeTeam?.name || 'Home Team'}
                    </div>
                    <div className="text-xs text-muted-foreground">vs</div>
                    <div className="text-sm font-medium">
                      {matchup.awayTeam?.name || 'Away Team'}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <div className="p-4 pt-0">
        <Link href={`/leagues/${leagueId}/matchups`}>
          <Button variant="outline" className="w-full" size="sm">
            View All Matchups
          </Button>
        </Link>
      </div>
    </Card>
  );
}