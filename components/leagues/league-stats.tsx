'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLeague } from '@/hooks/api/use-leagues';
import { Trophy, Users, TrendingUp, Calendar } from 'lucide-react';

interface LeagueStatsProps {
  leagueId: string;
}

export function LeagueStats({ leagueId }: LeagueStatsProps) {
  const { data: league, isLoading } = useLeague(leagueId);

  if (isLoading) {
    return (
      <>
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </>
    );
  }

  const stats = [
    {
      title: 'Season',
      value: league?.season || 'N/A',
      icon: Calendar,
      description: 'Current season',
    },
    {
      title: 'Teams',
      value: (league?.settings as any)?.teamCount || 0,
      icon: Users,
      description: 'Active teams',
    },
    {
      title: 'Scoring',
      value: (league?.settings as any)?.scoringType || 'Standard',
      icon: TrendingUp,
      description: 'League format',
    },
    {
      title: 'Playoffs',
      value: (league?.settings as any)?.playoffTeams || 0,
      icon: Trophy,
      description: 'Playoff teams',
    },
  ];

  return (
    <>
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </>
  );
}