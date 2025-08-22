'use client';

import { useState } from 'react';
import { useMatchups } from '@/hooks/api/use-leagues';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Activity } from 'lucide-react';

interface MatchupsViewProps {
  leagueId: string;
}

export function MatchupsView({ leagueId }: MatchupsViewProps) {
  const [currentWeek, setCurrentWeek] = useState(1);
  const { data: matchups, isLoading } = useMatchups(leagueId, currentWeek);

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
          <Activity className="h-4 w-4 mr-1" />
          Live Scoring
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-24 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {matchups?.map((matchup: any) => (
            <Card key={matchup.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">
                    {matchup.isComplete ? 'Final' : 'Scheduled'}
                  </Badge>
                  {matchup.isPlayoffs && <Badge variant="destructive">Playoff</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="font-medium">{matchup.awayTeam?.name || 'Away Team'}</div>
                    <div className="text-xs text-muted-foreground">
                      {matchup.awayTeam?.owner || 'Owner'}
                    </div>
                  </div>
                  <div className="text-2xl font-bold">
                    {matchup.awayScore?.toFixed(2) || '0.00'}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <div className="font-medium">{matchup.homeTeam?.name || 'Home Team'}</div>
                    <div className="text-xs text-muted-foreground">
                      {matchup.homeTeam?.owner || 'Owner'}
                    </div>
                  </div>
                  <div className="text-2xl font-bold">
                    {matchup.homeScore?.toFixed(2) || '0.00'}
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  className="w-full"
                  size="sm"
                >
                  View Matchup Details
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}