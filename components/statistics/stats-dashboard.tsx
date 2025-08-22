'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, Trophy, Award, Target } from 'lucide-react';
import type { Socket } from 'socket.io-client';

// Only import io if WebSocket is enabled
const io = process.env.NEXT_PUBLIC_ENABLE_WEBSOCKET === 'true' 
  ? require('socket.io-client').io 
  : null;
import {
  SeasonStatistics,
  AllTimeRecord,
  PerformanceTrend,
  ChampionshipRecord,
  TrendDirection,
  RecordType,
} from '@/types/statistics';

interface StatsDashboardProps {
  leagueId: string;
  seasonId?: string;
}

export function StatsDashboard({ leagueId, seasonId }: StatsDashboardProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [seasonStats, setSeasonStats] = useState<SeasonStatistics[]>([]);
  const [allTimeRecords, setAllTimeRecords] = useState<AllTimeRecord[]>([]);
  const [trends, setTrends] = useState<PerformanceTrend[]>([]);
  const [championships, setChampionships] = useState<ChampionshipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [activeTab, setActiveTab] = useState('season');

  useEffect(() => {
    // Check if WebSocket is enabled
    if (process.env.NEXT_PUBLIC_ENABLE_WEBSOCKET !== 'true') {
      // Just fetch data without WebSocket
      fetchAllStats();
      return;
    }

    // Double-check io is available
    if (!io) {
      console.warn('Socket.io client not loaded - WebSocket is disabled');
      fetchAllStats();
      return;
    }

    const newSocket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001');
    setSocket(newSocket);

    newSocket.emit('subscribe:league', leagueId);

    // Set up event listeners
    newSocket.on('stats:update', (data) => {
      if (data.type === 'SEASON') {
        fetchSeasonStats();
      }
    });

    newSocket.on('records:update', (data) => {
      setAllTimeRecords(data);
    });

    newSocket.on('trends:update', (data) => {
      setTrends(data);
    });

    newSocket.on('championships:update', (data) => {
      setChampionships(data);
    });

    newSocket.on('stats:calculating', () => {
      setCalculating(true);
    });

    newSocket.on('stats:ready', () => {
      setCalculating(false);
      fetchAllStats();
    });

    newSocket.on('record:broken', (data) => {
      // Show notification for broken record
      console.log('New record!', data);
      // You could add a toast notification here
    });

    // Initial data fetch
    fetchAllStats();

    return () => {
      newSocket.emit('unsubscribe:league', leagueId);
      newSocket.close();
    };
  }, [leagueId]);

  const fetchAllStats = async () => {
    setLoading(true);
    await Promise.all([
      fetchSeasonStats(),
      fetchAllTimeRecords(),
      fetchTrends(),
      fetchChampionships(),
    ]);
    setLoading(false);
  };

  const fetchSeasonStats = async () => {
    try {
      const response = await fetch(
        `/api/statistics?leagueId=${leagueId}&type=season${
          seasonId ? `&seasonId=${seasonId}` : ''
        }`
      );
      const data = await response.json();
      if (data.success) {
        setSeasonStats(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch season stats:', error);
    }
  };

  const fetchAllTimeRecords = async () => {
    try {
      const response = await fetch(
        `/api/statistics?leagueId=${leagueId}&type=alltime`
      );
      const data = await response.json();
      if (data.success) {
        setAllTimeRecords(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch all-time records:', error);
    }
  };

  const fetchTrends = async () => {
    try {
      const response = await fetch(
        `/api/statistics?leagueId=${leagueId}&type=trends`
      );
      const data = await response.json();
      if (data.success) {
        setTrends(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch trends:', error);
    }
  };

  const fetchChampionships = async () => {
    try {
      const response = await fetch(
        `/api/statistics?leagueId=${leagueId}&type=championships`
      );
      const data = await response.json();
      if (data.success) {
        setChampionships(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch championships:', error);
    }
  };

  const triggerRecalculation = async () => {
    try {
      const response = await fetch('/api/statistics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leagueId,
          calculationType: 'ALL',
          forceRecalculate: true,
        }),
      });

      const data = await response.json();
      if (data.success) {
        console.log('Calculation queued:', data.data.jobId);
        setCalculating(true);
      }
    } catch (error) {
      console.error('Failed to trigger recalculation:', error);
    }
  };

  const getTrendIcon = (direction?: TrendDirection | string) => {
    switch (direction) {
      case TrendDirection.UP:
      case 'UP':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case TrendDirection.DOWN:
      case 'DOWN':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatRecordType = (type: string) => {
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  const getRecordIcon = (type: string) => {
    if (type.includes('CHAMPIONSHIP')) return <Trophy className="h-4 w-4" />;
    if (type.includes('WIN')) return <Award className="h-4 w-4" />;
    return <Target className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {calculating && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            <span className="text-sm text-blue-800 dark:text-blue-200">
              Recalculating statistics...
            </span>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="season">Season Stats</TabsTrigger>
          <TabsTrigger value="records">All-Time Records</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="championships">Championships</TabsTrigger>
        </TabsList>

        <TabsContent value="season" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Season Standings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {seasonStats.map((stat: SeasonStatistics, index: number) => (
                  <div
                    key={stat.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-lg font-semibold text-muted-foreground">
                        #{index + 1}
                      </span>
                      <div>
                        <p className="font-medium">Team {stat.teamId.slice(0, 8)}</p>
                        <p className="text-sm text-muted-foreground">
                          {stat.wins}-{stat.losses}
                          {stat.ties > 0 && `-${stat.ties}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {Number(stat.avgPointsFor || 0).toFixed(1)} PPG
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {Number(stat.pointsFor).toFixed(0)} total
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="records" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>League Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {allTimeRecords.map((record: AllTimeRecord) => (
                  <div
                    key={record.id}
                    className="p-4 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getRecordIcon(record.recordType)}
                        <Badge variant="outline">
                          {formatRecordType(record.recordType)}
                        </Badge>
                      </div>
                      {record.season && (
                        <span className="text-xs text-muted-foreground">
                          {record.season}
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-bold">
                      {Number(record.recordValue).toFixed(1)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {record.recordHolderId.slice(0, 8)}
                    </p>
                    {record.week && (
                      <p className="text-xs text-muted-foreground">Week {record.week}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trends.map((trend: PerformanceTrend) => (
                  <div
                    key={trend.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {getTrendIcon(trend.trendDirection)}
                      <div>
                        <p className="font-medium">{trend.entityId.slice(0, 8)}</p>
                        <p className="text-sm text-muted-foreground">
                          {trend.periodType} - {trend.periodValue}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        Number(trend.trendStrength) > 0 ? 'text-green-600 dark:text-green-400' : 
                        Number(trend.trendStrength) < 0 ? 'text-red-600 dark:text-red-400' : 
                        'text-muted-foreground'
                      }`}>
                        {Number(trend.trendStrength) > 0 ? '+' : ''}
                        {Number(trend.trendStrength || 0).toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {trend.metrics?.recentAverage?.toFixed(1)} PPG
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="championships" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Championship History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {championships.map((championship: ChampionshipRecord) => (
                  <div
                    key={championship.id}
                    className="p-4 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-yellow-500" />
                        <span className="font-semibold">{championship.season}</span>
                      </div>
                      {championship.championshipScore && (
                        <Badge>{Number(championship.championshipScore).toFixed(1)} pts</Badge>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm">
                        <span className="text-muted-foreground">Champion:</span>{' '}
                        {championship.championId.slice(0, 8)}
                      </p>
                      {championship.runnerUpId && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Runner-up:</span>{' '}
                          {championship.runnerUpId.slice(0, 8)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button
          onClick={triggerRecalculation}
          disabled={calculating}
        >
          Recalculate All Statistics
        </Button>
      </div>
    </div>
  );
}