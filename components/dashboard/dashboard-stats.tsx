'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Trophy, Users, Target, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashboardStatsProps {
  stats: any;
  metrics: any;
}

export function DashboardStats({ stats, metrics }: DashboardStatsProps) {
  if (!stats || !metrics) {
    return (
      <>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-24" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16 mb-2" />
              <div className="h-3 bg-muted rounded w-32" />
            </CardContent>
          </Card>
        ))}
      </>
    );
  }

  const statCards = [
    {
      title: 'Current Week',
      value: metrics.currentWeek,
      description: `${metrics.totalGames || 0} games played`,
      icon: Trophy,
      trend: null,
    },
    {
      title: 'League Average',
      value: metrics.averageScore?.toFixed(1) || '0',
      description: 'Points per team',
      icon: Activity,
      trend: metrics.averageScore > 100 ? 'up' : 'down',
    },
    {
      title: 'Active Teams',
      value: metrics.totalTeams || '0',
      description: `${metrics.activePlayers || 0} active players`,
      icon: Users,
      trend: null,
    },
    {
      title: 'Highest Score',
      value: metrics.highestScore?.score?.toFixed(1) || '0',
      description: metrics.highestScore?.team || 'N/A',
      icon: Target,
      trend: 'up',
    },
  ];

  return (
    <>
      {statCards.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                {stat.title}
                <Icon className="h-4 w-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.description}
                  </p>
                </div>
                {stat.trend && (
                  <Badge
                    variant={stat.trend === 'up' ? 'default' : 'secondary'}
                    className={cn(
                      'ml-2',
                      stat.trend === 'up' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    )}
                  >
                    {stat.trend === 'up' ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}