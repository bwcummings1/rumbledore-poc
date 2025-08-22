'use client';

import { Suspense } from 'react';
import DashboardPageLayout from '@/components/dashboard/layout';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { StandingsCard } from '@/components/leagues/standings-card';
import { UpcomingMatchups } from '@/components/leagues/upcoming-matchups';
import { RecentTransactions } from '@/components/leagues/recent-transactions';
import { LeagueStats } from '@/components/leagues/league-stats';
import { MatchupsView } from '@/components/leagues/matchups-view';
import { LeagueStatsView } from '@/components/leagues/league-stats-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Users, Calendar, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeagueDashboardPage({
  params,
}: {
  params: { leagueId: string };
}) {
  return (
    <DashboardPageLayout
      header={{
        title: 'League Dashboard',
        description: 'Overview of your fantasy league',
        icon: Trophy,
        actions: <LeagueSwitcher />,
      }}
    >
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          <TabsTrigger value="matchups">Matchups</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Suspense fallback={
              <>
                {[...Array(4)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="space-y-0 pb-2">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-16 mb-1" />
                      <Skeleton className="h-3 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </>
            }>
              <LeagueStats leagueId={params.leagueId} />
            </Suspense>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <Suspense fallback={<Skeleton className="h-[400px]" />}>
              <StandingsCard leagueId={params.leagueId} compact />
            </Suspense>
            
            <Suspense fallback={<Skeleton className="h-[400px]" />}>
              <UpcomingMatchups leagueId={params.leagueId} />
            </Suspense>
          </div>

          <Suspense fallback={<Skeleton className="h-[200px]" />}>
            <RecentTransactions leagueId={params.leagueId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="standings">
          <Suspense fallback={<Skeleton className="h-[600px]" />}>
            <StandingsCard leagueId={params.leagueId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="matchups">
          <Suspense fallback={<Skeleton className="h-[600px]" />}>
            <MatchupsView leagueId={params.leagueId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="stats">
          <Suspense fallback={<Skeleton className="h-[600px]" />}>
            <LeagueStatsView leagueId={params.leagueId} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </DashboardPageLayout>
  );
}