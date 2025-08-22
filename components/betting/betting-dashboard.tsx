'use client';

/**
 * BettingDashboard Component - Main betting dashboard with statistics and overview
 */

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Activity,
  Target,
  Award,
  AlertCircle,
  BarChart3,
  PieChartIcon
} from 'lucide-react';
// import { BankrollDisplay } from './bankroll-display'; // Component not yet created
import { BetSlip } from './bet-slip';
import { ActiveBets } from './active-bets';
import { BettingHistory } from './betting-history';
import { BankrollInfo, BettingStats } from '@/types/betting';

interface BettingDashboardProps {
  leagueId: string;
  leagueSandbox: string;
}

export function BettingDashboard({ 
  leagueId,
  leagueSandbox
}: BettingDashboardProps) {
  const [bankroll, setBankroll] = useState<BankrollInfo | null>(null);
  const [stats, setStats] = useState<BettingStats | null>(null);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [leagueId]);

  const fetchDashboardData = async () => {
    setLoading(true);
    
    try {
      // Fetch bankroll and stats
      const [bankrollRes, historyRes] = await Promise.all([
        fetch(`/api/betting/bankroll?leagueId=${leagueId}`),
        fetch(`/api/betting/bankroll/history?leagueId=${leagueId}`)
      ]);

      if (bankrollRes.ok) {
        const bankrollData = await bankrollRes.json();
        setBankroll(bankrollData);
      }

      if (historyRes.ok) {
        const { history, stats: statsData } = await historyRes.json();
        setStats(statsData);
        
        // Transform history for charts
        const chartData = history.map((h: BankrollInfo) => ({
          week: `Week ${h.week}`,
          balance: h.currentBalance,
          profit: h.profitLoss,
          bets: h.totalBets,
          winRate: h.totalBets > 0 ? (h.wonBets / h.totalBets) * 100 : 0,
        }));
        setWeeklyData(chartData);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBetPlaced = () => {
    // Refresh dashboard data after bet placement
    fetchDashboardData();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px]" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[60px]" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Wagered',
      value: `$${stats?.totalWagered.toFixed(2) || '0.00'}`,
      icon: DollarSign,
      description: 'Season total',
    },
    {
      title: 'Net Profit',
      value: `${stats?.netProfit >= 0 ? '+' : ''}$${Math.abs(stats?.netProfit || 0).toFixed(2)}`,
      icon: stats?.netProfit >= 0 ? TrendingUp : TrendingDown,
      description: `${stats?.roi.toFixed(1) || '0.0'}% ROI`,
      valueColor: stats?.netProfit >= 0 ? 'text-green-600' : 'text-red-600',
    },
    {
      title: 'Win Rate',
      value: `${stats?.winRate.toFixed(1) || '0.0'}%`,
      icon: Target,
      description: `${stats?.wonBets || 0}/${stats?.totalBets || 0} bets won`,
    },
    {
      title: 'Current Streak',
      value: `${stats?.currentStreak.count || 0}`,
      icon: Activity,
      description: `${stats?.currentStreak.type || 'No'} streak`,
      valueColor: stats?.currentStreak.type === 'winning' ? 'text-green-600' : 'text-red-600',
    },
  ];

  const pieData = [
    { name: 'Won', value: stats?.wonBets || 0, color: '#10b981' },
    { name: 'Lost', value: stats?.lostBets || 0, color: '#ef4444' },
    { name: 'Push', value: stats?.pushBets || 0, color: '#6b7280' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stat.valueColor || ''}`}>
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="betting">Place Bets</TabsTrigger>
          <TabsTrigger value="active">Active Bets</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* <BankrollDisplay 
              leagueId={leagueId}
              onRefresh={fetchDashboardData}
            /> */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Weekly Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="balance" 
                      stroke="#8884d8" 
                      name="Balance"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="profit" 
                      stroke="#82ca9d" 
                      name="Profit"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="betting" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  View available odds and add selections to your bet slip
                </AlertDescription>
              </Alert>
              {/* This would integrate with OddsDisplay component */}
            </div>
            <BetSlip
              leagueId={leagueId}
              leagueSandbox={leagueSandbox}
              bankrollBalance={bankroll?.currentBalance}
              onBetPlaced={handleBetPlaced}
            />
          </div>
        </TabsContent>

        <TabsContent value="active">
          <ActiveBets 
            leagueId={leagueId}
            onBetCancelled={fetchDashboardData}
          />
        </TabsContent>

        <TabsContent value="history">
          <BettingHistory leagueId={leagueId} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Win/Loss Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5" />
                  Bet Outcomes
                </CardTitle>
                <CardDescription>
                  Distribution of bet results
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Weekly Bets Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Weekly Bet Volume</CardTitle>
                <CardDescription>
                  Number of bets placed per week
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="bets" fill="#8884d8" name="Bets" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Performance Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>
                Detailed betting performance analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Win Rate</span>
                    <span className="text-sm text-muted-foreground">
                      {stats?.winRate.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={stats?.winRate || 0} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">ROI</span>
                    <span className="text-sm text-muted-foreground">
                      {stats?.roi.toFixed(1)}%
                    </span>
                  </div>
                  <Progress 
                    value={Math.min(100, Math.max(0, (stats?.roi || 0) + 50))} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Average Stake</p>
                    <p className="text-xl font-semibold">
                      ${stats?.averageStake.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Best Win</p>
                    <p className="text-xl font-semibold text-green-600">
                      ${stats?.bestWin?.actualPayout?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Longest Win Streak</p>
                    <p className="text-xl font-semibold">
                      {stats?.longestWinStreak || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Bets</p>
                    <p className="text-xl font-semibold">
                      {stats?.totalBets || 0}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}