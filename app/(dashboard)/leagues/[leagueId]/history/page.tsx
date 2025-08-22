'use client';

import { useState } from 'react';
import DashboardPageLayout from '@/components/dashboard/layout';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import { useLeagueContext } from '@/contexts/league-context';
import { useLeagueHistory } from '@/hooks/api/use-league-history';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Medal, TrendingUp, Award } from 'lucide-react';
import { AllTimeRecords } from '@/components/leagues/all-time-records';
import { ChampionshipHistory } from '@/components/leagues/championship-history';
import { SeasonComparison } from '@/components/leagues/season-comparison';
import { RecordBook } from '@/components/leagues/record-book';

export default function LeagueHistoryPage({
  params,
}: {
  params: { leagueId: string };
}) {
  const { currentLeague } = useLeagueContext();
  const { data: history, isLoading } = useLeagueHistory(params.leagueId);

  return (
    <DashboardPageLayout
      header={{
        title: 'League History',
        description: currentLeague ? `${currentLeague.name} • ${history?.seasonsCount || 0} seasons` : 'Historical records and achievements',
        icon: Trophy,
        actions: <LeagueSwitcher />,
      }}
    >
      {!currentLeague ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No League Selected</h3>
            <p className="text-muted-foreground text-center">
              Select a league from the switcher above to view its history.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="records" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
            <TabsTrigger value="records">Records</TabsTrigger>
            <TabsTrigger value="championships">Championships</TabsTrigger>
            <TabsTrigger value="seasons">Seasons</TabsTrigger>
            <TabsTrigger value="achievements">Achievements</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="space-y-4">
            <AllTimeRecords leagueId={params.leagueId} />
            <RecordBook leagueId={params.leagueId} />
          </TabsContent>

          <TabsContent value="championships" className="space-y-4">
            <ChampionshipHistory leagueId={params.leagueId} />
            
            <Card>
              <CardHeader>
                <CardTitle>Playoff Appearances</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { team: 'Dynasty Builders', appearances: 8, percentage: 80 },
                    { team: 'Grid Iron Giants', appearances: 7, percentage: 70 },
                    { team: 'Fantasy Legends', appearances: 6, percentage: 60 },
                  ].map((team) => (
                    <div key={team.team} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Medal className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{team.team}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          {team.appearances} appearances
                        </span>
                        <span className="font-bold">{team.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="seasons" className="space-y-4">
            <SeasonComparison leagueId={params.leagueId} />
            
            <Card>
              <CardHeader>
                <CardTitle>Season Highlights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { season: 2023, highlight: 'Highest scoring season in league history' },
                    { season: 2022, highlight: 'Most competitive season with 5 teams in playoff hunt until Week 14' },
                    { season: 2021, highlight: 'First perfect regular season by Dynasty Builders' },
                  ].map((item) => (
                    <div key={item.season} className="flex items-start gap-3 p-3 rounded-lg border">
                      <Award className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">{item.season} Season</div>
                        <div className="text-sm text-muted-foreground">{item.highlight}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="achievements" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>League Achievements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { title: 'Dynasty Builder', description: 'Win 3+ championships', holders: ['John Smith'] },
                    { title: 'Perfect Season', description: 'Go undefeated in regular season', holders: ['Jane Doe'] },
                    { title: 'Comeback King', description: 'Win championship as lowest seed', holders: ['Mike Johnson'] },
                    { title: 'Trade Master', description: 'Execute 20+ trades in a season', holders: ['Sarah Wilson'] },
                  ].map((achievement) => (
                    <div key={achievement.title} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-start gap-3">
                        <Trophy className="h-5 w-5 text-yellow-500 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-medium">{achievement.title}</div>
                          <div className="text-sm text-muted-foreground mb-2">
                            {achievement.description}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {achievement.holders.map((holder) => (
                              <span key={holder} className="text-xs bg-muted px-2 py-1 rounded">
                                {holder}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </DashboardPageLayout>
  );
}