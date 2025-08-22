'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAllTimeRecords } from '@/hooks/api/use-league-history';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Target, TrendingUp, Award } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface AllTimeRecordsProps {
  leagueId: string;
}

export function AllTimeRecords({ leagueId }: AllTimeRecordsProps) {
  const { data: records, isLoading } = useAllTimeRecords(leagueId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>All-Time Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const mockTeamRecords = [
    { rank: 1, team: 'Dynasty Builders', owner: 'John Smith', wins: 145, losses: 42, pct: 77.5, championships: 3 },
    { rank: 2, team: 'Grid Iron Giants', owner: 'Jane Doe', wins: 132, losses: 55, pct: 70.6, championships: 2 },
    { rank: 3, team: 'Fantasy Legends', owner: 'Mike Johnson', wins: 128, losses: 59, pct: 68.4, championships: 2 },
    { rank: 4, team: 'Touchdown Titans', owner: 'Sarah Wilson', wins: 115, losses: 72, pct: 61.5, championships: 1 },
    { rank: 5, team: 'End Zone Elite', owner: 'Tom Brown', wins: 108, losses: 79, pct: 57.8, championships: 0 },
  ];

  const mockIndividualRecords = [
    { category: 'Most Championships', value: '3', holder: 'John Smith' },
    { category: 'Best Win %', value: '82.4%', holder: 'Jane Doe (2023)' },
    { category: 'Most Wins (Season)', value: '14', holder: 'Mike Johnson (2022)' },
    { category: 'Highest Avg Score', value: '128.5', holder: 'Sarah Wilson (2023)' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>All-Time Records</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="teams" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="teams">Team Records</TabsTrigger>
            <TabsTrigger value="individual">Individual Records</TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="space-y-4">
            <div className="rounded-lg border">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Rank</th>
                    <th className="text-left p-3">Team</th>
                    <th className="text-center p-3">W-L</th>
                    <th className="text-center p-3">Win %</th>
                    <th className="text-center p-3">
                      <Trophy className="h-4 w-4 inline" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mockTeamRecords.map((record) => (
                    <tr key={record.rank} className="border-b">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {record.rank === 1 && <Trophy className="h-4 w-4 text-yellow-500" />}
                          {record.rank}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{record.team.substring(0, 2)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{record.team}</div>
                            <div className="text-xs text-muted-foreground">{record.owner}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-center p-3">
                        {record.wins}-{record.losses}
                      </td>
                      <td className="text-center p-3">{record.pct}%</td>
                      <td className="text-center p-3 font-bold">
                        {record.championships > 0 ? record.championships : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="individual" className="space-y-4">
            <div className="grid gap-3">
              {mockIndividualRecords.map((record, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <Award className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">{record.category}</div>
                      <div className="font-medium">{record.holder}</div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold">{record.value}</div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}