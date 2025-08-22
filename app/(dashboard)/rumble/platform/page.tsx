'use client';

import DashboardPageLayout from "@/components/dashboard/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Trophy, Users, TrendingUp, Award, Shield, Zap } from 'lucide-react';
import { useCompetitions } from '@/hooks/api/use-competitions';
import { Skeleton } from '@/components/ui/skeleton';

export default function PlatformCompetitionsPage() {
  const { data: competitions, isLoading } = useCompetitions();
  
  const platformComps = competitions?.filter(c => c.scope === 'PLATFORM' || c.scope === 'GLOBAL') || [];

  return (
    <DashboardPageLayout
      header={{
        title: "Platform Competitions",
        description: "Cross-league competitions and tournaments",
        icon: Globe,
      }}
    >
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="tournaments">Tournaments</TabsTrigger>
          <TabsTrigger value="leaderboards">Global Rankings</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Featured Competition */}
              <Card className="md:col-span-2 lg:col-span-3 border-primary/50 bg-primary/5">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-6 w-6 text-yellow-500" />
                      <Badge className="bg-yellow-500/20 text-yellow-500">Featured</Badge>
                    </div>
                    <Badge className="bg-green-500/20 text-green-500">Active</Badge>
                  </div>
                  <CardTitle className="text-xl">Weekly Platform Championship</CardTitle>
                  <CardDescription>
                    Compete against players from all leagues for the ultimate weekly prize
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Prize Pool</p>
                      <p className="text-2xl font-bold">10,000</p>
                      <p className="text-xs text-muted-foreground">units</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Participants</p>
                      <p className="text-2xl font-bold">247</p>
                      <p className="text-xs text-muted-foreground">players</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Leagues</p>
                      <p className="text-2xl font-bold">32</p>
                      <p className="text-xs text-muted-foreground">represented</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Time Left</p>
                      <p className="text-2xl font-bold">2d 14h</p>
                      <p className="text-xs text-muted-foreground">to enter</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1">Join Competition</Button>
                    <Button variant="outline">View Leaderboard</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Other Active Competitions */}
              {platformComps.filter(c => c.status === 'ACTIVE').map((comp) => (
                <Card key={comp.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <Trophy className="h-5 w-5 text-primary" />
                      <Badge className="bg-green-500/20 text-green-500">Active</Badge>
                    </div>
                    <CardTitle className="text-lg">{comp.name}</CardTitle>
                    <CardDescription>
                      Cross-league competition
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Entry</p>
                        <p className="font-medium">{comp.entryFee || 'Free'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Prize</p>
                        <p className="font-medium">{comp.prizePool || 0} units</p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full">View Details</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tournaments">
          <div className="grid gap-4">
            {/* Season Championship */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Shield className="h-8 w-8 text-yellow-500" />
                  <div>
                    <CardTitle>Season Championship Tournament</CardTitle>
                    <CardDescription>
                      The ultimate cross-league tournament for the best of the best
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <Trophy className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                      <p className="text-sm text-muted-foreground">1st Place</p>
                      <p className="font-bold">50,000 units</p>
                    </div>
                    <div className="text-center">
                      <Trophy className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm text-muted-foreground">2nd Place</p>
                      <p className="font-bold">25,000 units</p>
                    </div>
                    <div className="text-center">
                      <Trophy className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                      <p className="text-sm text-muted-foreground">3rd Place</p>
                      <p className="font-bold">10,000 units</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-t">
                    <div>
                      <p className="font-medium">Qualification Period</p>
                      <p className="text-sm text-muted-foreground">Top 3 from each league qualify</p>
                    </div>
                    <Button>Learn More</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bracket Tournaments */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">March Madness Bracket</CardTitle>
                  <CardDescription>64-team elimination tournament</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="outline">Registration Open</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Teams</span>
                      <span>48/64</span>
                    </div>
                    <Button variant="outline" className="w-full mt-4">View Bracket</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Survivor Pool</CardTitle>
                  <CardDescription>Last team standing wins</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className="bg-green-500/20 text-green-500">Week 10</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Remaining</span>
                      <span>127/500</span>
                    </div>
                    <Button variant="outline" className="w-full mt-4">Make Pick</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="leaderboards">
          <div className="grid gap-4">
            {/* Global Rankings */}
            <Card>
              <CardHeader>
                <CardTitle>Global Player Rankings</CardTitle>
                <CardDescription>Top performers across all leagues</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { rank: 1, name: 'AlphaGamer', league: 'Elite League', points: 1847.3, trend: 'up' },
                    { rank: 2, name: 'FantasyKing', league: 'Champions League', points: 1823.7, trend: 'up' },
                    { rank: 3, name: 'GridironGuru', league: 'Pro League', points: 1798.2, trend: 'down' },
                    { rank: 4, name: 'TouchdownTitan', league: 'Elite League', points: 1776.5, trend: 'up' },
                    { rank: 5, name: 'RedZoneMaster', league: 'Dynasty League', points: 1745.9, trend: 'same' },
                  ].map((player) => (
                    <div key={player.rank} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`font-bold text-lg w-8 ${player.rank <= 3 ? 'text-yellow-500' : ''}`}>
                          #{player.rank}
                        </div>
                        <div>
                          <p className="font-medium">{player.name}</p>
                          <p className="text-xs text-muted-foreground">{player.league}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{player.points}</span>
                        {player.trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
                        {player.trend === 'down' && <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />}
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full mt-4">View Full Rankings</Button>
              </CardContent>
            </Card>

            {/* League vs League */}
            <Card>
              <CardHeader>
                <CardTitle>League Rankings</CardTitle>
                <CardDescription>Best performing leagues on the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { rank: 1, name: 'Elite League', members: 12, avgPoints: 1423.5 },
                    { rank: 2, name: 'Champions League', members: 10, avgPoints: 1398.2 },
                    { rank: 3, name: 'Pro League', members: 14, avgPoints: 1387.9 },
                  ].map((league) => (
                    <div key={league.rank} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <Award className={`h-5 w-5 ${league.rank === 1 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="font-medium">{league.name}</p>
                          <p className="text-xs text-muted-foreground">{league.members} members</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold">{league.avgPoints}</p>
                        <p className="text-xs text-muted-foreground">avg points</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardPageLayout>
  );
}