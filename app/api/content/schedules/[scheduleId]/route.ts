// Individual Schedule Management API
// Sprint 10: Content Pipeline - Single schedule operations

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { ContentScheduler } from '@/lib/ai/content/content-scheduler';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const scheduler = new ContentScheduler();

// Validation schema for updates
const UpdateScheduleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  agentType: z.string().optional(),
  cronExpression: z.string().optional(),
  templateId: z.string().uuid().optional(),
  enabled: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * GET /api/content/schedules/[scheduleId]
 * Get specific schedule details
 */
export async function GET(
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
      include: {
        league: {
          select: {
            id: true,
            name: true,
            sandboxNamespace: true,
          },
        },
        template: true,
        generatedContent: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            publishedAt: true,
          },
        },
        _count: {
          select: {
            generatedContent: true,
          },
        },
      },
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

    // Check membership
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: schedule.leagueId,
        userId: user.id,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Not authorized to view this schedule' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      schedule,
      totalGenerated: schedule._count.generatedContent,
      recentContent: schedule.generatedContent,
    });
  } catch (error) {
    console.error('[API] Failed to get schedule:', error);
    return NextResponse.json(
      { error: 'Failed to get schedule' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/content/schedules/[scheduleId]
 * Update schedule (including enable/disable)
 */
export async function PUT(
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

    // Parse and validate request body
    const body = await request.json();
    const validatedData = UpdateScheduleSchema.parse(body);

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

    // Check permissions
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: schedule.leagueId,
        userId: user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Only league owners and admins can update schedules' },
        { status: 403 }
      );
    }

    // Update schedule
    await scheduler.updateSchedule(scheduleId, validatedData);

    return NextResponse.json({
      success: true,
      message: 'Schedule updated successfully',
    });
  } catch (error) {
    console.error('[API] Failed to update schedule:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid update data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update schedule' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content/schedules/[scheduleId]
 * Delete specific schedule
 */
export async function DELETE(
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

    // Check permissions
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: schedule.leagueId,
        userId: user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Only league owners and admins can delete schedules' },
        { status: 403 }
      );
    }

    // Delete schedule
    await scheduler.deleteSchedule(scheduleId);

    return NextResponse.json({
      success: true,
      message: 'Schedule deleted successfully',
    });
  } catch (error) {
    console.error('[API] Failed to delete schedule:', error);
    return NextResponse.json(
      { error: 'Failed to delete schedule' },
      { status: 500 }
    );
  }
}

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

    // Check if this is the trigger endpoint
    const url = new URL(request.url);
    if (!url.pathname.endsWith('/trigger')) {
      return NextResponse.json(
        { error: 'Invalid endpoint' },
        { status: 404 }
      );
    }

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

    return NextResponse.json({
      success: true,
      message: 'Schedule triggered successfully',
    });
  } catch (error) {
    console.error('[API] Failed to trigger schedule:', error);
    return NextResponse.json(
      { error: 'Failed to trigger schedule' },
      { status: 500 }
    );
  }
}