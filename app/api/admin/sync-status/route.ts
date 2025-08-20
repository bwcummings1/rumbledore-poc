import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const GET = withAuth(
  async (req: Request) => {
    try {
      const { searchParams } = new URL(req.url);
      const leagueSandbox = searchParams.get('league');

      const where = leagueSandbox ? { leagueSandbox } : {};

      const recent = await prisma.syncStatus.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      });

      const stats = await prisma.syncStatus.groupBy({
        by: ['status'],
        where: {
          ...where,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        _count: true,
      });

      const statusCounts = stats.reduce((acc: any, stat) => {
        acc[stat.status.toLowerCase()] = stat._count;
        return acc;
      }, {});

      return NextResponse.json({
        recent,
        stats: {
          completed: statusCounts.completed || 0,
          inProgress: statusCounts.in_progress || 0,
          failed: statusCounts.failed || 0,
          pending: statusCounts.pending || 0,
        },
      });
    } catch (error) {
      console.error('Error fetching sync status:', error);
      return NextResponse.json(
        { error: 'Failed to fetch sync status' },
        { status: 500 }
      );
    }
  },
  { requireAdmin: true }
);