'use client';

import { useLeagueContext } from '@/contexts/league-context';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import DashboardPageLayout from "@/components/dashboard/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Award, TrendingUp, History, Medal, Target } from 'lucide-react';

export default function LeagueHistoryPage() {
  const { currentLeague, leagues, isLoading } = useLeagueContext();

  if (isLoading) {
    return (
      <DashboardPageLayout
        header={{
          title: "League History",
          description: "Loading history...",
          icon: History,
        }}
      >
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </DashboardPageLayout>
    );
  }

  return (
    <DashboardPageLayout
      header={{
        title: "League History",
        description: currentLeague ? `${currentLeague.name} historical records` : "Select a league",
        icon: History,
        actions: <LeagueSwitcher />,
      }}
    >
      {!currentLeague ? (
        <Card>
          <CardContent className="p-8 text-center">
            <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Please select a league to view its history</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="records" className="space-y-4">
          <TabsList>
            <TabsTrigger value="records">All-Time Records</TabsTrigger>
            <TabsTrigger value="championships">Championships</TabsTrigger>
            <TabsTrigger value="seasons">Past Seasons</TabsTrigger>
            <TabsTrigger value="achievements">Achievements</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="space-y-4">
            {/* All-Time Records */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Highest Single Game Score
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-bold">185.4</div>
                  <p className="text-sm text-muted-foreground">Team Alpha • Week 7, 2023</p>
                  <Badge variant="outline">League Record</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Best Season Record
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-bold">13-1</div>
                  <p className="text-sm text-muted-foreground">Team Bravo • 2022 Season</p>
                  <Badge variant="outline">92.9% Win Rate</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Medal className="h-5 w-5 text-blue-500" />
                    Most Championships
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-bold">3</div>
                  <p className="text-sm text-muted-foreground">Team Charlie</p>
                  <Badge variant="outline">2019, 2021, 2023</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-purple-500" />
                    Longest Win Streak
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-bold">11 Games</div>
                  <p className="text-sm text-muted-foreground">Team Delta • 2022-2023</p>
                  <Badge variant="outline">Across 2 Seasons</Badge>
                </CardContent>
              </Card>
            </div>

            {/* Additional Records Table */}
            <Card>
              <CardHeader>
                <CardTitle>More League Records</CardTitle>
                <CardDescription>Notable achievements and milestones</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <div>
                      <p className="font-medium">Most Points in a Season</p>
                      <p className="text-sm text-muted-foreground">Team Echo • 2023</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">1,847.3</p>
                      <p className="text-xs text-muted-foreground">142.1 avg</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <div>
                      <p className="font-medium">Biggest Comeback Win</p>
                      <p className="text-sm text-muted-foreground">Team Foxtrot • Week 10, 2022</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">42.7 pts</p>
                      <p className="text-xs text-muted-foreground">Monday Night</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <div>
                      <p className="font-medium">Most Transactions in a Season</p>
                      <p className="text-sm text-muted-foreground">Team Golf • 2021</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">47</p>
                      <p className="text-xs text-muted-foreground">3.6 per week</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="championships">
            <Card>
              <CardHeader>
                <CardTitle>Championship History</CardTitle>
                <CardDescription>Past league champions and playoff results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {[2023, 2022, 2021, 2020, 2019].map((year) => (
                    <div key={year} className="flex items-center justify-between py-4 border-b last:border-0">
                      <div className="flex items-center gap-4">
                        <Trophy className="h-8 w-8 text-yellow-500" />
                        <div>
                          <p className="font-semibold">{year} Champion</p>
                          <p className="text-sm text-muted-foreground">Team {String.fromCharCode(65 + (2023 - year))}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">12-2</p>
                        <p className="text-xs text-muted-foreground">Championship Score: 145.2 - 132.8</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="seasons">
            <div className="grid gap-4">
              {[2023, 2022, 2021].map((year) => (
                <Card key={year}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{year} Season</CardTitle>
                      <Badge>{year === 2023 ? 'Current' : 'Completed'}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Champion</p>
                        <p className="font-medium">Team {String.fromCharCode(65 + (2023 - year))}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Runner-Up</p>
                        <p className="font-medium">Team {String.fromCharCode(66 + (2023 - year))}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Top Scorer</p>
                        <p className="font-medium">Team {String.fromCharCode(67 + (2023 - year))}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Most Improved</p>
                        <p className="font-medium">Team {String.fromCharCode(68 + (2023 - year))}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="achievements">
            <Card>
              <CardContent className="p-8 text-center">
                <Award className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Achievements tracking coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </DashboardPageLayout>
  );
}