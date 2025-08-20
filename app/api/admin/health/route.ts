import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { systemMonitor } from '@/lib/services/system-monitor';

export const GET = withAuth(
  async (req: Request) => {
    try {
      const health = await systemMonitor.getHealthScore();
      
      return NextResponse.json(health);
    } catch (error) {
      console.error('Error fetching health status:', error);
      return NextResponse.json(
        { 
          score: 0,
          status: 'Error',
          details: { error: 'Failed to fetch health status' }
        },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);