// Schedule Trigger API Endpoint
// Sprint 10: Content Pipeline - Manual schedule triggering

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ContentScheduler } from '@/lib/ai/content/content-scheduler';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const scheduler = new ContentScheduler();

/**
 * POST /api/content/schedules/[scheduleId]/trigger
 * Manually trigger schedule execution
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { scheduleId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { scheduleId } = params;

    // Get schedule
    const schedule = await prisma.contentSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      return NextResponse.json(
        { error: 'Schedule not found' },
        { status: 404 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check permissions (allow members to trigger)
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: schedule.leagueId,
        userId: user.id,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Not authorized to trigger this schedule' },
        { status: 403 }
      );
    }

    // Trigger schedule
    await scheduler.triggerSchedule(scheduleId);

    // Update last run time
    await prisma.contentSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Schedule triggered successfully',
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Failed to trigger schedule:', error);
    return NextResponse.json(
      { error: 'Failed to trigger schedule' },
      { status: 500 }
    );
  }
}