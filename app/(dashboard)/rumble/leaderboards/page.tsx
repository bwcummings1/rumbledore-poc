'use client';

import DashboardPageLayout from "@/components/dashboard/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, Trophy, TrendingUp, Users, Medal, Crown, Target, Flame } from 'lucide-react';
import { useState } from 'react';

export default function GlobalLeaderboardsPage() {
  const [timeframe, setTimeframe] = useState('week');
  const [category, setCategory] = useState('overall');

  return (
    <DashboardPageLayout
      header={{
        title: "Global Leaderboards",
        description: "Top performers across the entire platform",
        icon: BarChart3,
      }}
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="season">This Season</SelectItem>
              <SelectItem value="alltime">All Time</SelectItem>
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overall">Overall Points</SelectItem>
              <SelectItem value="betting">Betting Performance</SelectItem>
              <SelectItem value="accuracy">Prediction Accuracy</SelectItem>
              <SelectItem value="consistency">Consistency Score</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Top 3 Showcase */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardHeader className="text-center">
              <Crown className="h-12 w-12 mx-auto text-yellow-500 mb-2" />
              <Badge className="bg-yellow-500/20 text-yellow-500 mb-2">1st Place</Badge>
              <CardTitle>AlphaGamer</CardTitle>
              <CardDescription>Elite League</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-2">
                <p className="text-3xl font-bold">2,147.8</p>
                <p className="text-sm text-muted-foreground">Total Points</p>
                <div className="flex justify-center gap-2 pt-2">
                  <Badge variant="outline" className="text-xs">
                    <Flame className="h-3 w-3 mr-1" />
                    12W Streak
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Target className="h-3 w-3 mr-1" />
                    87% Accuracy
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-400/50 bg-gray-400/5">
            <CardHeader className="text-center">
              <Medal className="h-10 w-10 mx-auto text-gray-400 mb-2" />
              <Badge className="bg-gray-400/20 text-gray-400 mb-2">2nd Place</Badge>
              <CardTitle>FantasyKing</CardTitle>
              <CardDescription>Champions League</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-2">
                <p className="text-3xl font-bold">2,098.3</p>
                <p className="text-sm text-muted-foreground">Total Points</p>
                <div className="flex justify-center gap-2 pt-2">
                  <Badge variant="outline" className="text-xs">
                    <Flame className="h-3 w-3 mr-1" />
                    8W Streak
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Target className="h-3 w-3 mr-1" />
                    82% Accuracy
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-600/50 bg-orange-600/5">
            <CardHeader className="text-center">
              <Medal className="h-10 w-10 mx-auto text-orange-600 mb-2" />
              <Badge className="bg-orange-600/20 text-orange-600 mb-2">3rd Place</Badge>
              <CardTitle>GridironGuru</CardTitle>
              <CardDescription>Pro League</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-2">
                <p className="text-3xl font-bold">2,045.7</p>
                <p className="text-sm text-muted-foreground">Total Points</p>
                <div className="flex justify-center gap-2 pt-2">
                  <Badge variant="outline" className="text-xs">
                    <Flame className="h-3 w-3 mr-1" />
                    6W Streak
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Target className="h-3 w-3 mr-1" />
                    79% Accuracy
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Leaderboards */}
        <Tabs defaultValue="players" className="space-y-4">
          <TabsList>
            <TabsTrigger value="players">Top Players</TabsTrigger>
            <TabsTrigger value="leagues">Top Leagues</TabsTrigger>
            <TabsTrigger value="risers">Rising Stars</TabsTrigger>
            <TabsTrigger value="achievements">Achievements</TabsTrigger>
          </TabsList>

          <TabsContent value="players">
            <Card>
              <CardHeader>
                <CardTitle>Global Player Rankings</CardTitle>
                <CardDescription>Top 100 players across all leagues</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Array.from({ length: 10 }, (_, i) => i + 4).map((rank) => (
                    <div key={rank} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-lg w-8 text-center">#{rank}</span>
                        <div>
                          <p className="font-medium">Player{rank}</p>
                          <p className="text-xs text-muted-foreground">League Name</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-mono font-bold">{(2050 - rank * 10).toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">points</p>
                        </div>
                        <TrendingUp className={`h-4 w-4 ${rank % 3 === 0 ? 'text-red-500 rotate-180' : 'text-green-500'}`} />
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full mt-4">Load More</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leagues">
            <Card>
              <CardHeader>
                <CardTitle>League Performance Rankings</CardTitle>
                <CardDescription>Average performance by league</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { name: 'Elite League', avgPoints: 1587.3, members: 12, topPlayer: 'AlphaGamer' },
                    { name: 'Champions League', avgPoints: 1543.8, members: 10, topPlayer: 'FantasyKing' },
                    { name: 'Pro League', avgPoints: 1498.2, members: 14, topPlayer: 'GridironGuru' },
                    { name: 'Dynasty League', avgPoints: 1467.5, members: 8, topPlayer: 'DynastyDon' },
                    { name: 'Legends League', avgPoints: 1445.9, members: 12, topPlayer: 'LegendLarry' },
                  ].map((league, i) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div className="flex items-center gap-4">
                        <Trophy className={`h-5 w-5 ${i === 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="font-medium">{league.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {league.members} members • Top: {league.topPlayer}
                          </p>
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
          </TabsContent>

          <TabsContent value="risers">
            <Card>
              <CardHeader>
                <CardTitle>Rising Stars</CardTitle>
                <CardDescription>Biggest gainers this week</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { name: 'RookieRocket', change: '+47', previousRank: 89, currentRank: 42 },
                    { name: 'Underdog2024', change: '+35', previousRank: 71, currentRank: 36 },
                    { name: 'DarkHorse', change: '+28', previousRank: 55, currentRank: 27 },
                    { name: 'NewChallenger', change: '+24', previousRank: 103, currentRank: 79 },
                    { name: 'FastRiser', change: '+19', previousRank: 66, currentRank: 47 },
                  ].map((player, i) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div className="flex items-center gap-4">
                        <Flame className="h-5 w-5 text-orange-500" />
                        <div>
                          <p className="font-medium">{player.name}</p>
                          <p className="text-xs text-muted-foreground">
                            #{player.previousRank} → #{player.currentRank}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-green-500/20 text-green-500">
                        {player.change} ranks
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="achievements">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Achievements</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { player: 'AlphaGamer', achievement: 'Perfect Week', icon: Target },
                      { player: 'FantasyKing', achievement: '10 Win Streak', icon: Flame },
                      { player: 'GridironGuru', achievement: 'Top Scorer', icon: Trophy },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <item.icon className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.player}</p>
                          <p className="text-xs text-muted-foreground">{item.achievement}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Rare Achievements</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { achievement: 'Undefeated Season', holders: 2, rarity: 'Legendary' },
                      { achievement: '200+ Point Week', holders: 7, rarity: 'Epic' },
                      { achievement: '15 Win Streak', holders: 12, rarity: 'Rare' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{item.achievement}</p>
                          <p className="text-xs text-muted-foreground">{item.holders} holders</p>
                        </div>
                        <Badge variant="outline">{item.rarity}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardPageLayout>
  );
}