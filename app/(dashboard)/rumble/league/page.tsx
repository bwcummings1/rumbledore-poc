'use client';

import { useLeagueContext } from '@/contexts/league-context';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import DashboardPageLayout from "@/components/dashboard/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users, TrendingUp, Calendar, DollarSign, Award } from 'lucide-react';
import { useCompetitions } from '@/hooks/api/use-competitions';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeagueCompetitionsPage() {
  const { currentLeague } = useLeagueContext();
  const { data: competitions, isLoading } = useCompetitions(currentLeague?.id);

  const leagueComps = competitions?.filter(c => c.scope === 'LEAGUE') || [];

  return (
    <DashboardPageLayout
      header={{
        title: "League Competitions",
        description: currentLeague ? `${currentLeague.name} competitions` : "Select a league",
        icon: Trophy,
        actions: <LeagueSwitcher />,
      }}
    >
      {!currentLeague ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Please select a league to view competitions</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Competitions */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Active Competitions</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {leagueComps.filter(c => c.status === 'ACTIVE').map((comp) => (
                <Card key={comp.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <Trophy className="h-5 w-5 text-yellow-500" />
                      <Badge className="bg-green-500/20 text-green-500">Active</Badge>
                    </div>
                    <CardTitle className="text-lg">{comp.name}</CardTitle>
                    <CardDescription>
                      {comp.type === 'WEEKLY' ? 'Weekly Competition' : 
                       comp.type === 'SEASON' ? 'Season-long Competition' :
                       'Custom Competition'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Entry Fee</p>
                        <p className="font-medium">{comp.entryFee || 0} units</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Prize Pool</p>
                        <p className="font-medium">{comp.prizePool || 0} units</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Participants</p>
                        <p className="font-medium">{comp.currentEntrants}/{comp.maxEntrants || '∞'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Ends</p>
                        <p className="font-medium text-xs">
                          {new Date(comp.endDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        View Details
                      </Button>
                      <Button size="sm" className="flex-1">
                        Join Competition
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Upcoming Competitions */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Upcoming Competitions</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {leagueComps.filter(c => c.status === 'PENDING').length > 0 ? (
                leagueComps.filter(c => c.status === 'PENDING').map((comp) => (
                  <Card key={comp.id} className="opacity-75">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <Calendar className="h-5 w-5 text-blue-500" />
                        <Badge variant="outline">Upcoming</Badge>
                      </div>
                      <CardTitle className="text-lg">{comp.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Starts {new Date(comp.startDate).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="col-span-full">
                  <CardContent className="p-8 text-center">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No upcoming competitions</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Past Competitions */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Past Competitions</h2>
            <div className="space-y-2">
              {leagueComps.filter(c => c.status === 'COMPLETED').length > 0 ? (
                leagueComps.filter(c => c.status === 'COMPLETED').map((comp) => (
                  <Card key={comp.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <Award className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{comp.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Ended {new Date(comp.endDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">View Results</Button>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Award className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No completed competitions yet</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardPageLayout>
  );
}