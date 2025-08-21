'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Competition, CompetitionSummary } from '@/types/betting';
import { Trophy, Users, DollarSign, TrendingUp, Calendar, AlertCircle } from 'lucide-react';

interface CompetitionDashboardProps {
  leagueId?: string;
  userId: string;
}

export function CompetitionDashboard({ leagueId, userId }: CompetitionDashboardProps) {
  const [activeCompetitions, setActiveCompetitions] = useState<Competition[]>([]);
  const [myCompetitions, setMyCompetitions] = useState<Competition[]>([]);
  const [summary, setSummary] = useState<CompetitionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchCompetitions();
    fetchSummary();
  }, [leagueId, userId]);

  const fetchCompetitions = async () => {
    try {
      // Fetch active competitions
      const activeRes = await fetch(
        `/api/competitions?status=ACTIVE${leagueId ? `&leagueId=${leagueId}` : ''}`
      );
      const activeData = await activeRes.json();
      if (activeData.success) {
        setActiveCompetitions(activeData.data);
      }

      // Fetch user's competitions
      const myRes = await fetch(`/api/competitions?userId=${userId}`);
      const myData = await myRes.json();
      if (myData.success) {
        setMyCompetitions(myData.data);
      }
    } catch (error) {
      console.error('Error fetching competitions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch(`/api/competitions/summary${leagueId ? `?leagueId=${leagueId}` : ''}`);
      const data = await res.json();
      if (data.success) {
        setSummary(data.data);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-500';
      case 'ACTIVE':
        return 'bg-green-500';
      case 'SETTLING':
        return 'bg-blue-500';
      case 'COMPLETED':
        return 'bg-gray-500';
      case 'CANCELLED':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'WEEKLY':
        return '📅';
      case 'SEASON':
        return '🏆';
      case 'TOURNAMENT':
        return '🎯';
      case 'CUSTOM':
        return '⚡';
      default:
        return '🎮';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Competitions</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalCompetitions || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary?.activeCompetitions || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Participants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalParticipants || 0}</div>
            <p className="text-xs text-muted-foreground">
              Avg {summary?.averageEntrants?.toFixed(1) || 0} per competition
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Prize Pool</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalPrizePool || 0} units</div>
            <p className="text-xs text-muted-foreground">Across all competitions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Competitor</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.topCompetitor?.userName || 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.topCompetitor?.wins || 0} wins
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="active">Active Competitions</TabsTrigger>
          <TabsTrigger value="my-competitions">My Competitions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Competition Overview</CardTitle>
              <CardDescription>
                Your competition statistics and recent activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">
                      Competitions Entered
                    </p>
                    <p className="text-2xl font-bold">{myCompetitions.length}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">
                      Active Competitions
                    </p>
                    <p className="text-2xl font-bold">
                      {myCompetitions.filter((c) => c.status === 'ACTIVE').length}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">
                      Competitions Won
                    </p>
                    <p className="text-2xl font-bold">
                      {myCompetitions.filter((c) => c.status === 'COMPLETED').length}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          {activeCompetitions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No active competitions</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {activeCompetitions.map((competition) => (
                <Card key={competition.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">{getTypeIcon(competition.type)}</span>
                        <div>
                          <CardTitle>{competition.name}</CardTitle>
                          <CardDescription>{competition.description}</CardDescription>
                        </div>
                      </div>
                      <Badge className={getStatusColor(competition.status)}>
                        {competition.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 md:grid-cols-4">
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {competition.currentEntrants}/{competition.maxEntrants || '∞'} entrants
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {competition.prizePool} units prize pool
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Ends {new Date(competition.endDate).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm">View Details</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="my-competitions" className="space-y-4">
          {myCompetitions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">You haven't entered any competitions yet</p>
                <Button className="mt-4">Browse Competitions</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {myCompetitions.map((competition) => (
                <Card key={competition.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">{getTypeIcon(competition.type)}</span>
                        <div>
                          <CardTitle>{competition.name}</CardTitle>
                          <CardDescription>{competition.description}</CardDescription>
                        </div>
                      </div>
                      <Badge className={getStatusColor(competition.status)}>
                        {competition.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <span className="text-sm text-muted-foreground">
                          Your Rank: #-- {/* Would need to fetch from leaderboard */}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Prize Pool: {competition.prizePool} units
                        </span>
                      </div>
                      <Button size="sm" variant="outline">
                        View Leaderboard
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}