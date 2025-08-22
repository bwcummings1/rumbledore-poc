'use client';

import { useLeagueContext } from '@/contexts/league-context';
import { LeagueSwitcher } from '@/components/leagues/league-switcher';
import DashboardPageLayout from "@/components/dashboard/layout";
import BracketsIcon from "@/components/icons/brackets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Users, TrendingUp, Calendar, Target, Shield } from 'lucide-react';

export default function MyLeaguesPage() {
  const { currentLeague, leagues, isLoading, switchLeague } = useLeagueContext();

  // Set the first league as current if none selected
  useEffect(() => {
    if (!currentLeague && leagues.length > 0) {
      switchLeague(leagues[0].id);
    }
  }, [currentLeague, leagues, switchLeague]);

  if (isLoading) {
    return (
      <DashboardPageLayout
        header={{
          title: "My Leagues",
          description: "Loading leagues...",
          icon: BracketsIcon,
        }}
      >
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </DashboardPageLayout>
    );
  }

  return (
    <DashboardPageLayout
      header={{
        title: "My Leagues",
        description: currentLeague ? `Viewing ${currentLeague.name}` : "Select a league",
        icon: BracketsIcon,
        actions: <LeagueSwitcher />,
      }}
    >
      {leagues.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BracketsIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Leagues Yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Join or create a league to get started with your fantasy football journey.
            </p>
            <div className="flex gap-2">
              <Button variant="outline">Browse Leagues</Button>
              <Button>Connect ESPN League</Button>
            </div>
          </CardContent>
        </Card>
      ) : currentLeague ? (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
            <TabsTrigger value="roster">My Roster</TabsTrigger>
            <TabsTrigger value="matchups">Matchups</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* League Info Card */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{currentLeague.name}</CardTitle>
                    <CardDescription>
                      Season {currentLeague.season} • ESPN League #{currentLeague.espnLeagueId?.toString() || 'N/A'}
                    </CardDescription>
                  </div>
                  {currentLeague.isActive && (
                    <Badge className="bg-green-500/20 text-green-500">Active</Badge>
                  )}
                </div>
              </CardHeader>
            </Card>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">League Rank</CardTitle>
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">3rd</div>
                  <p className="text-xs text-muted-foreground">of 12 teams</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Record</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">7-3</div>
                  <p className="text-xs text-muted-foreground">70% win rate</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Points For</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">1,245.6</div>
                  <p className="text-xs text-muted-foreground">124.6 avg/week</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Playoff Status</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Clinched</div>
                  <p className="text-xs text-muted-foreground">3 weeks remaining</p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest updates in your league</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <div className="flex-1">
                      <p className="text-sm">You won your matchup against Team Alpha</p>
                      <p className="text-xs text-muted-foreground">2 hours ago</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    <div className="flex-1">
                      <p className="text-sm">Trade accepted: You received Justin Jefferson</p>
                      <p className="text-xs text-muted-foreground">1 day ago</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                    <div className="flex-1">
                      <p className="text-sm">Waiver claim processed: Added Puka Nacua</p>
                      <p className="text-xs text-muted-foreground">3 days ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="standings">
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Standings component coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roster">
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Roster management coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="matchups">
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Matchups view coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardContent className="p-8 text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Transactions history coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Please select a league</p>
          </CardContent>
        </Card>
      )}
    </DashboardPageLayout>
  );
}