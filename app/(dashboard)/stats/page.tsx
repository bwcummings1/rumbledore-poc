'use client';

import DashboardPageLayout from '@/components/dashboard/layout';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { StatsDashboard } from '@/components/statistics/stats-dashboard';
import { HeadToHead } from '@/components/statistics/head-to-head';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Users, TrendingUp, Award, History } from 'lucide-react';
import { useLeagueContext } from '@/contexts/league-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AllTimeRecords } from '@/components/leagues/all-time-records';
import { useLeagueHistory } from '@/hooks/api/use-league-history';
import { Skeleton } from '@/components/ui/skeleton';

export default function StatisticsPage() {
  const { currentLeague } = useLeagueContext();
  const { data: history, isLoading } = useLeagueHistory();

  if (!currentLeague) {
    return (
      <DashboardPageLayout
        header={{
          title: 'Statistics',
          description: 'Select a league to view statistics',
          icon: BarChart3,
          actions: <LeagueSwitcher />,
        }}
      >
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No League Selected</h3>
            <p className="text-muted-foreground text-center mb-4">
              Select a league from the switcher above to view detailed statistics.
            </p>
            <LeagueSwitcher />
          </CardContent>
        </Card>
      </DashboardPageLayout>
    );
  }

  return (
    <DashboardPageLayout
      header={{
        title: 'Statistics',
        description: `${currentLeague.name} • All-time stats and analytics`,
        icon: BarChart3,
        actions: <LeagueSwitcher />,
      }}
    >
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="h2h">
            <Users className="h-4 w-4 mr-2" />
            Head to Head
          </TabsTrigger>
          <TabsTrigger value="records">
            <Award className="h-4 w-4 mr-2" />
            Records
          </TabsTrigger>
          <TabsTrigger value="trends">
            <TrendingUp className="h-4 w-4 mr-2" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <StatsDashboard leagueId={currentLeague.id} />
        </TabsContent>

        <TabsContent value="h2h">
          <HeadToHead leagueId={currentLeague.id} />
        </TabsContent>

        <TabsContent value="records">
          {isLoading ? (
            <Skeleton className="h-96" />
          ) : (
            <AllTimeRecords data={history?.records} />
          )}
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Trend charts will go here */}
                <div className="text-center py-8 text-muted-foreground">
                  Performance trend analysis coming soon
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>League History</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>
              ) : (
                <div className="space-y-4">
                  {history?.seasons?.map((season: any, index: number) => (
                    <div key={index} className="p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{season.year} Season</h4>
                        <Award className="h-4 w-4 text-yellow-500" />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Champion</p>
                          <p className="font-medium">{season.champion}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Runner-up</p>
                          <p className="font-medium">{season.runnerUp}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total Points</p>
                          <p className="font-medium">{season.totalPoints}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Games Played</p>
                          <p className="font-medium">{season.gamesPlayed}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardPageLayout>
  );
}