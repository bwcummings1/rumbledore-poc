'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  Database,
  Activity,
  Settings,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Shield,
  BarChart3,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DashboardProps {
  leagueSandbox?: string;
}

export function AdminDashboard({ leagueSandbox }: DashboardProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [leagueSandbox]);

  const fetchDashboardData = async () => {
    try {
      const [metricsRes, syncRes, healthRes] = await Promise.all([
        fetch(`/api/admin/metrics${leagueSandbox ? `?league=${leagueSandbox}` : ''}`),
        fetch(`/api/admin/sync-status${leagueSandbox ? `?league=${leagueSandbox}` : ''}`),
        fetch('/api/admin/health'),
      ]);

      const [metricsData, syncData, healthData] = await Promise.all([
        metricsRes.json(),
        syncRes.json(),
        healthRes.json(),
      ]);

      setMetrics(metricsData);
      setSyncStatus(syncData.recent || []);
      setSystemHealth(healthData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'IN_PROGRESS':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'FAILED':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mock data for charts (replace with real data from metrics)
  const performanceData = metrics?.performanceData || [
    { time: '00:00', responseTime: 120, cpuUsage: 45 },
    { time: '04:00', responseTime: 135, cpuUsage: 52 },
    { time: '08:00', responseTime: 180, cpuUsage: 68 },
    { time: '12:00', responseTime: 165, cpuUsage: 61 },
    { time: '16:00', responseTime: 190, cpuUsage: 75 },
    { time: '20:00', responseTime: 145, cpuUsage: 58 },
  ];

  const activityData = metrics?.activityData || [
    { date: 'Mon', activeUsers: 120, apiCalls: 3200 },
    { date: 'Tue', activeUsers: 145, apiCalls: 4100 },
    { date: 'Wed', activeUsers: 139, apiCalls: 3800 },
    { date: 'Thu', activeUsers: 167, apiCalls: 4500 },
    { date: 'Fri', activeUsers: 182, apiCalls: 5200 },
    { date: 'Sat', activeUsers: 156, apiCalls: 4300 },
    { date: 'Sun', activeUsers: 143, apiCalls: 3700 },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor system health, manage leagues, and track platform metrics
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* System Health Alert */}
      {systemHealth?.score < 70 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            System health is degraded ({systemHealth.score}%). 
            {systemHealth.details?.issues?.join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalUsers || 0}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              {getTrendIcon(metrics?.userGrowth || 0)}
              <span className="ml-1">
                +{metrics?.newUsersThisWeek || 0} this week
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leagues</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.activeLeagues || 0}</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.totalLeagues || 0} total leagues
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Points</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.totalDataPoints ? 
                (metrics.totalDataPoints / 1000000).toFixed(1) + 'M' : '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all leagues
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getHealthColor(systemHealth?.score || 0)}`}>
              {systemHealth?.score || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {systemHealth?.status || 'Unknown'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="sync" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sync">Data Sync</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Sync Operations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {syncStatus.length > 0 ? syncStatus.map((sync) => (
                  <div
                    key={sync.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(sync.status)}
                      <div>
                        <p className="font-medium">{sync.syncType}</p>
                        <p className="text-sm text-muted-foreground">
                          {sync.leagueSandbox}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {sync.recordsProcessed || 0} records
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(sync.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-muted-foreground py-8">
                    No recent sync operations
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="time" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="responseTime"
                      stroke="hsl(var(--primary))"
                      name="Response Time (ms)"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="cpuUsage"
                      stroke="hsl(var(--destructive))"
                      name="CPU Usage (%)"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="activeUsers"
                      stackId="1"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.6}
                      name="Active Users"
                    />
                    <Area
                      type="monotone"
                      dataKey="apiCalls"
                      stackId="2"
                      stroke="hsl(var(--secondary))"
                      fill="hsl(var(--secondary))"
                      fillOpacity={0.6}
                      name="API Calls"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {metrics?.recentErrors?.length > 0 ? metrics.recentErrors.map((error: any) => (
                  <div
                    key={error.id}
                    className="p-3 border border-destructive/20 rounded-lg bg-destructive/5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-destructive">{error.type}</p>
                        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {error.context}
                        </p>
                      </div>
                      <Badge variant="destructive">{error.count}x</Badge>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-muted-foreground py-8">
                    No recent errors
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}