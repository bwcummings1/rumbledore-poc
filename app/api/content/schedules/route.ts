// Schedule Management API Endpoints
// Sprint 10: Content Pipeline - Schedule CRUD operations

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { ContentScheduler } from '@/lib/ai/content/content-scheduler';
import { PrismaClient, ContentType, AgentType } from '@prisma/client';

const prisma = new PrismaClient();
const scheduler = new ContentScheduler();

// Validation schemas
const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.nativeEnum(ContentType),
  agentType: z.nativeEnum(AgentType),
  cronExpression: z.string(),
  templateId: z.string().uuid().optional(),
  enabled: z.boolean().default(true),
  metadata: z.record(z.any()).optional(),
});

const UpdateScheduleSchema = CreateScheduleSchema.partial();

/**
 * GET /api/content/schedules?leagueId=xxx
 * List all schedules for a league
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId');
    const enabled = searchParams.get('enabled');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'League ID required' },
        { status: 400 }
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
        leagueId,
        userId: user.id,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this league' },
        { status: 403 }
      );
    }

    // Build query
    const where: any = { leagueId };
    if (enabled !== null) {
      where.enabled = enabled === 'true';
    }

    // Get schedules
    const schedules = await prisma.contentSchedule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        _count: {
          select: {
            generatedContent: true,
          },
        },
      },
    });

    // Get stats
    const stats = await scheduler.getScheduleStats(leagueId);

    return NextResponse.json({
      schedules,
      stats,
      total: schedules.length,
    });
  } catch (error) {
    console.error('[API] Failed to get schedules:', error);
    return NextResponse.json(
      { error: 'Failed to get schedules' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/content/schedules
 * Create a new schedule
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { leagueId, ...scheduleData } = body;
    
    if (!leagueId) {
      return NextResponse.json(
        { error: 'League ID required' },
        { status: 400 }
      );
    }

    const validatedData = CreateScheduleSchema.parse(scheduleData);

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

    // Check if user has admin/owner role
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId,
        userId: user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Only league owners and admins can create schedules' },
        { status: 403 }
      );
    }

    // Create schedule
    const scheduleId = await scheduler.createSchedule(leagueId, validatedData);

    return NextResponse.json({
      success: true,
      scheduleId,
      message: 'Schedule created successfully',
    });
  } catch (error) {
    console.error('[API] Failed to create schedule:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid schedule data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create schedule' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/content/schedules
 * Bulk update schedules (enable/disable multiple)
 */
export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { scheduleIds, enabled, leagueId } = body;

    if (!scheduleIds || !Array.isArray(scheduleIds)) {
      return NextResponse.json(
        { error: 'Schedule IDs array required' },
        { status: 400 }
      );
    }

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Enabled boolean required' },
        { status: 400 }
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
        leagueId,
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

    // Update schedules
    const results = await Promise.allSettled(
      scheduleIds.map(id => scheduler.toggleSchedule(id, enabled))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({
      success: true,
      message: `Updated ${successful} schedules, ${failed} failed`,
      results: {
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error('[API] Bulk update failed:', error);
    return NextResponse.json(
      { error: 'Failed to update schedules' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content/schedules
 * Bulk delete schedules
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { scheduleIds, leagueId } = body;

    if (!scheduleIds || !Array.isArray(scheduleIds)) {
      return NextResponse.json(
        { error: 'Schedule IDs array required' },
        { status: 400 }
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
        leagueId,
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

    // Delete schedules
    const results = await Promise.allSettled(
      scheduleIds.map(id => scheduler.deleteSchedule(id))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({
      success: true,
      message: `Deleted ${successful} schedules, ${failed} failed`,
      results: {
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error('[API] Bulk delete failed:', error);
    return NextResponse.json(
      { error: 'Failed to delete schedules' },
      { status: 500 }
    );
  }
}