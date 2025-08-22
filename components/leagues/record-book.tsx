'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAllTimeRecords } from '@/hooks/api/use-league-history';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Users, Award } from 'lucide-react';

interface RecordBookProps {
  leagueId: string;
}

export function RecordBook({ leagueId }: RecordBookProps) {
  const { data: records, isLoading } = useAllTimeRecords(leagueId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Record Book</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const mockRecords = [
    {
      category: 'Highest Single Week Score',
      value: '185.42',
      holder: 'Team Alpha',
      date: '2023 Week 7',
      icon: TrendingUp,
    },
    {
      category: 'Lowest Single Week Score',
      value: '42.18',
      holder: 'Team Beta',
      date: '2022 Week 14',
      icon: TrendingUp,
    },
    {
      category: 'Most Points in a Season',
      value: '1,892.45',
      holder: 'Team Gamma',
      date: '2023 Season',
      icon: Trophy,
    },
    {
      category: 'Longest Win Streak',
      value: '11 games',
      holder: 'Team Delta',
      date: '2022-2023',
      icon: Award,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>League Record Book</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {mockRecords.map((record, index) => (
            <div
              key={index}
              className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <record.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    {record.category}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold">{record.value}</div>
                <div className="text-sm">
                  <span className="font-medium">{record.holder}</span>
                  <span className="text-muted-foreground"> • {record.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}