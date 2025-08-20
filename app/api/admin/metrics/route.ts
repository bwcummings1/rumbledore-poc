import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { systemMonitor } from '@/lib/services/system-monitor';

export const GET = withAuth(
  async (req: Request) => {
    try {
      const { searchParams } = new URL(req.url);
      const leagueSandbox = searchParams.get('league');

      const metrics = await systemMonitor.getMetricsSummary();

      // Add mock performance and activity data for charts
      // In production, this would come from real metrics
      const performanceData = generateMockPerformanceData();
      const activityData = generateMockActivityData();

      return NextResponse.json({
        ...metrics,
        performanceData,
        activityData,
        recentErrors: [], // Would come from error tracking
        userGrowth: 5, // Mock percentage
      });
    } catch (error) {
      console.error('Error fetching metrics:', error);
      return NextResponse.json(
        { error: 'Failed to fetch metrics' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);

function generateMockPerformanceData() {
  const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
  return hours.map(time => ({
    time,
    responseTime: Math.floor(Math.random() * 100) + 100,
    cpuUsage: Math.floor(Math.random() * 50) + 30,
  }));
}

function generateMockActivityData() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map(date => ({
    date,
    activeUsers: Math.floor(Math.random() * 100) + 100,
    apiCalls: Math.floor(Math.random() * 2000) + 3000,
  }));
}