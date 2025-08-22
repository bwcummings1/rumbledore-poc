'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTable, ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { LeaderboardStandings, LeaderboardEntry } from '@/types/betting';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Medal,
  Crown,
  Award,
  DollarSign,
  Target,
  ChevronUp,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

interface LeaderboardProps {
  competitionId: string;
  showPrizes?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  maxEntries?: number;
}

export function Leaderboard({
  competitionId,
  showPrizes = true,
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  maxEntries = 100,
}: LeaderboardProps) {
  const [standings, setStandings] = useState<LeaderboardStandings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overall');

  const fetchLeaderboard = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await fetch(
        `/api/competitions/${competitionId}/leaderboard?limit=${maxEntries}`
      );
      const data = await res.json();
      
      if (data.success) {
        setStandings(data.data);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchLeaderboard(true);
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [competitionId, autoRefresh, refreshInterval]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-orange-600" />;
      default:
        return <span className="text-sm font-medium text-muted-foreground">#{rank}</span>;
    }
  };

  const getMovementIcon = (movement: number) => {
    if (movement > 0) {
      return (
        <div className="flex items-center text-green-500">
          <ChevronUp className="h-4 w-4" />
          <span className="text-xs">{movement}</span>
        </div>
      );
    } else if (movement < 0) {
      return (
        <div className="flex items-center text-red-500">
          <ChevronDown className="h-4 w-4" />
          <span className="text-xs">{Math.abs(movement)}</span>
        </div>
      );
    } else {
      return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatScore = (score: number) => {
    return score.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  const formatROI = (roi: number) => {
    const isPositive = roi >= 0;
    return (
      <span className={cn('font-medium', isPositive ? 'text-green-500' : 'text-red-500')}>
        {isPositive ? '+' : ''}{roi.toFixed(1)}%
      </span>
    );
  };

  const LeaderboardRow = ({ entry, index }: { entry: LeaderboardEntry; index: number }) => {
    const isExpanded = expandedUserId === entry.userId;
    const isTop3 = entry.rank <= 3;

    return (
      <div
        className={cn(
          'border-b last:border-0 transition-colors',
          isTop3 && 'bg-muted/50',
          'hover:bg-muted/30'
        )}
      >
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => setExpandedUserId(isExpanded ? null : entry.userId)}
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 flex justify-center">
              {getRankIcon(entry.rank)}
            </div>
            <div className="w-12">
              {getMovementIcon(entry.previousRank - entry.rank)}
            </div>
            <div>
              <p className="font-medium">{entry.userName}</p>
              <p className="text-sm text-muted-foreground">
                {entry.teamName || 'No team name'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="text-right">
              <p className="font-semibold text-lg">{formatScore(entry.score)}</p>
              <p className="text-xs text-muted-foreground">points</p>
            </div>
            <div className="text-right">
              <p className="font-medium">{entry.wins}W-{entry.losses}L</p>
              <p className="text-xs text-muted-foreground">{formatROI(entry.roi)}</p>
            </div>
            {showPrizes && entry.potentialPrize && (
              <div className="text-right">
                <p className="font-medium text-green-500">
                  {entry.potentialPrize} units
                </p>
                <p className="text-xs text-muted-foreground">potential</p>
              </div>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                isExpanded && 'rotate-180'
              )}
            />
          </div>
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 ml-16">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Bets</p>
                <p className="font-medium">{entry.totalBets}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Win Rate</p>
                <p className="font-medium">
                  {entry.totalBets > 0
                    ? ((entry.wins / entry.totalBets) * 100).toFixed(1)
                    : 0}%
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Avg Stake</p>
                <p className="font-medium">
                  {entry.totalBets > 0
                    ? (entry.totalWagered / entry.totalBets).toFixed(1)
                    : 0} units
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Best Streak</p>
                <p className="font-medium">{entry.bestStreak || 0} wins</p>
              </div>
            </div>
            {entry.breakdown && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">Score Breakdown</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(entry.breakdown).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground">{key}:</span>
                      <span className="font-medium">{value as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!standings || standings.standings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Trophy className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No entries yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Be the first to join this competition!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>
              Last updated: {new Date(standings.lastCalculated).toLocaleString()}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchLeaderboard(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full rounded-none">
            <TabsTrigger value="overall" className="flex-1">Overall</TabsTrigger>
            <TabsTrigger value="weekly" className="flex-1">This Week</TabsTrigger>
            <TabsTrigger value="movers" className="flex-1">Big Movers</TabsTrigger>
          </TabsList>

          <TabsContent value="overall" className="m-0">
            <ScrollArea className="h-[600px]">
              {standings.standings.map((entry, index) => (
                <LeaderboardRow key={entry.userId} entry={entry} index={index} />
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="weekly" className="m-0">
            <ScrollArea className="h-[600px]">
              {standings.standings
                .filter((entry) => entry.weeklyScore && entry.weeklyScore > 0)
                .sort((a, b) => (b.weeklyScore || 0) - (a.weeklyScore || 0))
                .map((entry, index) => (
                  <LeaderboardRow key={entry.userId} entry={entry} index={index} />
                ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="movers" className="m-0">
            <ScrollArea className="h-[600px]">
              {standings.standings
                .filter((entry) => Math.abs(entry.previousRank - entry.rank) >= 3)
                .sort((a, b) => {
                  const aMovement = Math.abs(a.previousRank - a.rank);
                  const bMovement = Math.abs(b.previousRank - b.rank);
                  return bMovement - aMovement;
                })
                .map((entry, index) => (
                  <LeaderboardRow key={entry.userId} entry={entry} index={index} />
                ))}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}