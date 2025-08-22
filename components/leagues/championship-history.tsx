'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChampionshipHistory } from '@/hooks/api/use-league-history';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ChampionshipHistoryProps {
  leagueId: string;
}

export function ChampionshipHistory({ leagueId }: ChampionshipHistoryProps) {
  const { data: championships, isLoading } = useChampionshipHistory(leagueId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Championship History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const mockChampionships = [
    {
      season: 2023,
      champion: {
        name: 'Dynasty Builders',
        owner: 'John Smith',
        record: '12-2',
        logo: '',
      },
      runnerUp: {
        name: 'Grid Iron Giants',
        owner: 'Jane Doe',
        record: '10-4',
      },
      finalScore: '142.5 - 118.3',
    },
    {
      season: 2022,
      champion: {
        name: 'Fantasy Legends',
        owner: 'Mike Johnson',
        record: '11-3',
        logo: '',
      },
      runnerUp: {
        name: 'Dynasty Builders',
        owner: 'John Smith',
        record: '10-4',
      },
      finalScore: '156.2 - 149.8',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Championship History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {mockChampionships.map((championship, index) => (
            <div
              key={championship.season}
              className="p-4 rounded-lg border bg-card"
            >
              <div className="flex items-center justify-between mb-3">
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {championship.season} Season
                </Badge>
                <div className="flex items-center gap-1">
                  {index === 0 && <Trophy className="h-5 w-5 text-yellow-500" />}
                  {index === 1 && <Medal className="h-5 w-5 text-gray-400" />}
                  {index === 2 && <Award className="h-5 w-5 text-orange-600" />}
                </div>
              </div>

              <div className="grid gap-3">
                {/* Champion */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-yellow-500/20 text-yellow-500">Champion</Badge>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={championship.champion.logo} />
                      <AvatarFallback>
                        {championship.champion.name.substring(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{championship.champion.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {championship.champion.owner} • {championship.champion.record}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Runner Up */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">Runner-up</Badge>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={championship.runnerUp.logo} />
                      <AvatarFallback>
                        {championship.runnerUp.name.substring(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{championship.runnerUp.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {championship.runnerUp.owner} • {championship.runnerUp.record}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Final Score */}
                <div className="text-center pt-2 border-t">
                  <div className="text-sm text-muted-foreground">Final Score</div>
                  <div className="font-bold">{championship.finalScore}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}