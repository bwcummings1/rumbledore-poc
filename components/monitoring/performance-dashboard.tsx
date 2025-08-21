/**
 * Performance Dashboard Component
 * Real-time monitoring of application performance metrics
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { 
  Activity, Zap, Database, Globe, Cpu, HardDrive, 
  AlertTriangle, CheckCircle, XCircle, TrendingUp,
  TrendingDown, Server, Wifi, Clock, Package
} from 'lucide-react';

interface PerformanceMetrics {
  timestamp: number;
  api: {
    responseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    activeRequests: number;
  };
  database: {
    queryTime: number;
    activeConnections: number;
    poolUtilization: number;
    cacheHitRate: number;
  };
  websocket: {
    connections: number;
    latency: number;
    messagesPerSecond: number;
  };
  cache: {
    hitRate: number;
    size: number;
    evictions: number;
  };
  system: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
  };
  webVitals: {
    fcp: number; // First Contentful Paint
    lcp: number; // Largest Contentful Paint
    fid: number; // First Input Delay
    cls: number; // Cumulative Layout Shift
    ttfb: number; // Time to First Byte
  };
}

interface HealthScore {
  overall: number;
  api: number;
  database: number;
  cache: number;
  system: number;
}

export function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<PerformanceMetrics | null>(null);
  const [healthScore, setHealthScore] = useState<HealthScore>({
    overall: 100,
    api: 100,
    database: 100,
    cache: 100,
    system: 100,
  });
  const [alerts, setAlerts] = useState<Array<{
    id: string;
    type: 'error' | 'warning' | 'info';
    message: string;
    timestamp: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/monitoring/metrics');
      const data = await response.json();
      
      if (data.success) {
        const newMetric = data.data;
        setCurrentMetrics(newMetric);
        setMetrics(prev => {
          const updated = [...prev, newMetric];
          // Keep only last 30 data points
          return updated.slice(-30);
        });
        
        // Calculate health score
        calculateHealthScore(newMetric);
        
        // Check for alerts
        checkAlerts(newMetric);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate health score
  const calculateHealthScore = (metric: PerformanceMetrics) => {
    const apiScore = Math.max(0, 100 - (metric.api.responseTime / 10) - (metric.api.errorRate * 100));
    const dbScore = Math.max(0, metric.database.cacheHitRate + (100 - metric.database.queryTime / 10));
    const cacheScore = metric.cache.hitRate;
    const systemScore = Math.max(0, 100 - metric.system.cpuUsage - metric.system.memoryUsage);
    
    setHealthScore({
      api: Math.round(apiScore),
      database: Math.round(dbScore / 2),
      cache: Math.round(cacheScore),
      system: Math.round(systemScore),
      overall: Math.round((apiScore + dbScore / 2 + cacheScore + systemScore) / 4),
    });
  };

  // Check for alerts
  const checkAlerts = (metric: PerformanceMetrics) => {
    const newAlerts = [];
    
    if (metric.api.responseTime > 1000) {
      newAlerts.push({
        id: `api-slow-${Date.now()}`,
        type: 'warning' as const,
        message: `API response time is high: ${metric.api.responseTime}ms`,
        timestamp: Date.now(),
      });
    }
    
    if (metric.api.errorRate > 0.05) {
      newAlerts.push({
        id: `api-errors-${Date.now()}`,
        type: 'error' as const,
        message: `High API error rate: ${(metric.api.errorRate * 100).toFixed(2)}%`,
        timestamp: Date.now(),
      });
    }
    
    if (metric.database.poolUtilization > 80) {
      newAlerts.push({
        id: `db-pool-${Date.now()}`,
        type: 'warning' as const,
        message: `Database pool utilization high: ${metric.database.poolUtilization}%`,
        timestamp: Date.now(),
      });
    }
    
    if (metric.cache.hitRate < 60) {
      newAlerts.push({
        id: `cache-low-${Date.now()}`,
        type: 'info' as const,
        message: `Cache hit rate is low: ${metric.cache.hitRate}%`,
        timestamp: Date.now(),
      });
    }
    
    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 10)); // Keep last 10 alerts
    }
  };

  // Auto refresh
  useEffect(() => {
    fetchMetrics();
    
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchMetrics]);

  // Format number
  const formatNumber = (num: number, decimals = 2) => {
    return num.toFixed(decimals);
  };

  // Get status color
  const getStatusColor = (score: number) => {
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-red-500';
  };

  // Get status icon
  const getStatusIcon = (score: number) => {
    if (score >= 90) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (score >= 70) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Performance Dashboard</h2>
          <p className="text-muted-foreground">Real-time application metrics and monitoring</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant={healthScore.overall >= 70 ? 'default' : 'destructive'}>
            Health: {healthScore.overall}%
          </Badge>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              {alerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="flex items-center gap-2">
                  <Badge variant={alert.type === 'error' ? 'destructive' : 'secondary'}>
                    {alert.type}
                  </Badge>
                  <span className="text-sm">{alert.message}</span>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Health Overview */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthScore.overall}%</div>
            <Progress value={healthScore.overall} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getStatusColor(healthScore.api)}`}>
                {healthScore.api}%
              </span>
              {getStatusIcon(healthScore.api)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getStatusColor(healthScore.database)}`}>
                {healthScore.database}%
              </span>
              {getStatusIcon(healthScore.database)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getStatusColor(healthScore.cache)}`}>
                {healthScore.cache}%
              </span>
              {getStatusIcon(healthScore.cache)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getStatusColor(healthScore.system)}`}>
                {healthScore.system}%
              </span>
              {getStatusIcon(healthScore.system)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <Tabs defaultValue="api" className="space-y-4">
        <TabsList>
          <TabsTrigger value="api">API Performance</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
          <TabsTrigger value="websocket">WebSocket</TabsTrigger>
          <TabsTrigger value="webvitals">Web Vitals</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Response Time</CardTitle>
                <CardDescription>API endpoint response times (ms)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="api.responseTime" stroke="#8884d8" name="Response Time" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Request Rate</CardTitle>
                <CardDescription>Requests per second</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="api.requestsPerSecond" stroke="#82ca9d" fill="#82ca9d" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {currentMetrics && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Avg Response Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.api.responseTime)}ms</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Requests/sec</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.api.requestsPerSecond)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Error Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.api.errorRate * 100)}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{currentMetrics.api.activeRequests}</div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Query Performance</CardTitle>
                <CardDescription>Average query execution time (ms)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="database.queryTime" stroke="#ffc658" name="Query Time" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Connection Pool</CardTitle>
                <CardDescription>Database connection utilization</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="database.poolUtilization" stroke="#ff7c7c" fill="#ff7c7c" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {currentMetrics && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Query Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.database.queryTime)}ms</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Connections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{currentMetrics.database.activeConnections}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pool Utilization</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.database.poolUtilization)}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Cache Hit Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.database.cacheHitRate)}%</div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="cache" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cache Hit Rate</CardTitle>
                <CardDescription>Percentage of requests served from cache</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="cache.hitRate" stroke="#8dd1e1" name="Hit Rate %" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cache Size</CardTitle>
                <CardDescription>Current cache memory usage (MB)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date(ts).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="cache.size" stroke="#d084d0" fill="#d084d0" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="websocket" className="space-y-4">
          {currentMetrics && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Active Connections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{currentMetrics.websocket.connections}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Average Latency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.websocket.latency)}ms</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Messages/sec</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.websocket.messagesPerSecond)}</div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="webvitals" className="space-y-4">
          {currentMetrics && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">FCP</CardTitle>
                  <CardDescription>First Contentful Paint</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.webVitals.fcp)}ms</div>
                  <Badge variant={currentMetrics.webVitals.fcp < 1800 ? 'default' : 'destructive'}>
                    {currentMetrics.webVitals.fcp < 1800 ? 'Good' : 'Poor'}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">LCP</CardTitle>
                  <CardDescription>Largest Contentful Paint</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.webVitals.lcp)}ms</div>
                  <Badge variant={currentMetrics.webVitals.lcp < 2500 ? 'default' : 'destructive'}>
                    {currentMetrics.webVitals.lcp < 2500 ? 'Good' : 'Poor'}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">FID</CardTitle>
                  <CardDescription>First Input Delay</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.webVitals.fid)}ms</div>
                  <Badge variant={currentMetrics.webVitals.fid < 100 ? 'default' : 'destructive'}>
                    {currentMetrics.webVitals.fid < 100 ? 'Good' : 'Poor'}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">CLS</CardTitle>
                  <CardDescription>Cumulative Layout Shift</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.webVitals.cls, 3)}</div>
                  <Badge variant={currentMetrics.webVitals.cls < 0.1 ? 'default' : 'destructive'}>
                    {currentMetrics.webVitals.cls < 0.1 ? 'Good' : 'Poor'}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">TTFB</CardTitle>
                  <CardDescription>Time to First Byte</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.webVitals.ttfb)}ms</div>
                  <Badge variant={currentMetrics.webVitals.ttfb < 800 ? 'default' : 'destructive'}>
                    {currentMetrics.webVitals.ttfb < 800 ? 'Good' : 'Poor'}
                  </Badge>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          {currentMetrics && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">CPU Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.system.cpuUsage)}%</div>
                  <Progress value={currentMetrics.system.cpuUsage} className="mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Memory Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.system.memoryUsage)}%</div>
                  <Progress value={currentMetrics.system.memoryUsage} className="mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Disk Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(currentMetrics.system.diskUsage)}%</div>
                  <Progress value={currentMetrics.system.diskUsage} className="mt-2" />
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}