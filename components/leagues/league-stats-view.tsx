'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLeague } from '@/hooks/api/use-leagues';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, TrendingUp, Users, Target } from 'lucide-react';

interface LeagueStatsViewProps {
  leagueId: string;
}

export function LeagueStatsView({ leagueId }: LeagueStatsViewProps) {
  const { data: league, isLoading } = useLeague(leagueId);

  if (isLoading) {
    return (
      <div className="grid gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="records">Records</TabsTrigger>
        <TabsTrigger value="trends">Trends</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Points</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                Across all teams this season
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0.0</div>
              <p className="text-xs text-muted-foreground">
                Points per team per week
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Teams</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(league?.settings as any)?.teamCount || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Teams in the league
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0%</div>
              <p className="text-xs text-muted-foreground">
                Season progress
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>League Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Scoring Type</dt>
                <dd className="text-sm font-semibold">
                  {(league?.settings as any)?.scoringType || 'Standard'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Playoff Teams</dt>
                <dd className="text-sm font-semibold">
                  {(league?.settings as any)?.playoffTeams || 0}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Waiver Type</dt>
                <dd className="text-sm font-semibold">
                  {(league?.settings as any)?.waiverType || 'Continuous'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Draft Type</dt>
                <dd className="text-sm font-semibold">
                  {(league?.settings as any)?.draftType || 'Snake'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Trade Deadline</dt>
                <dd className="text-sm font-semibold">
                  {(league?.settings as any)?.tradeDeadline 
                    ? new Date((league.settings as any).tradeDeadline).toLocaleDateString()
                    : 'Not Set'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Season</dt>
                <dd className="text-sm font-semibold">{league?.season}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="records" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>League Records</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Records will be displayed here once games are played.</p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="trends" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>League Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Trend analysis will be available as the season progresses.</p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}