// Content Review API Endpoint
// Sprint 10: Content Pipeline

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { ContentReviewer } from '@/lib/ai/content/content-reviewer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const reviewer = new ContentReviewer();

// Request validation schemas
const ReviewContentSchema = z.object({
  contentId: z.string().uuid(),
});

const ManualReviewSchema = z.object({
  contentId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
});

/**
 * POST /api/content/review
 * Trigger content review
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
    const { contentId } = ReviewContentSchema.parse(body);

    // Get content and verify access
    const content = await prisma.generatedContent.findUnique({
      where: { id: contentId },
      include: { league: true },
    });

    if (!content) {
      return NextResponse.json(
        { error: 'Content not found' },
        { status: 404 }
      );
    }

    // Check if user is a member of the league
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: content.leagueId,
        user: { email: session.user.email },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Not authorized to review this content' },
        { status: 403 }
      );
    }

    // Perform review
    const reviewResult = await reviewer.reviewContent(contentId);

    return NextResponse.json({
      success: true,
      result: reviewResult,
      message: reviewResult.approved 
        ? 'Content approved for publishing' 
        : reviewResult.requiresManualReview 
          ? 'Content requires manual review'
          : 'Content needs improvements',
    });
  } catch (error) {
    console.error('[API] Content review failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to review content' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/content/review
 * Manual review action (approve/reject)
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

    // Parse and validate request body
    const body = await request.json();
    const { contentId, action, reason } = ManualReviewSchema.parse(body);

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

    // Get content and verify access
    const content = await prisma.generatedContent.findUnique({
      where: { id: contentId },
    });

    if (!content) {
      return NextResponse.json(
        { error: 'Content not found' },
        { status: 404 }
      );
    }

    // Check if user has admin/owner role in the league
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: content.leagueId,
        userId: user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Only league owners and admins can manually review content' },
        { status: 403 }
      );
    }

    // Perform manual review action
    if (action === 'approve') {
      await reviewer.manuallyApproveContent(contentId, user.id);
    } else {
      await reviewer.rejectContent(contentId, reason || 'Manual rejection', user.id);
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' 
        ? 'Content manually approved' 
        : 'Content rejected',
    });
  } catch (error) {
    console.error('[API] Manual review failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process manual review' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/content/review?leagueId=xxx&status=xxx
 * Get content awaiting review
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
    const status = searchParams.get('status') || 'NEEDS_REVIEW';

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

    // Get content for review
    const content = await prisma.generatedContent.findMany({
      where: {
        leagueId,
        status: status as any,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        type: true,
        agentType: true,
        status: true,
        reviewData: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      content,
      total: content.length,
    });
  } catch (error) {
    console.error('[API] Failed to get review queue:', error);
    return NextResponse.json(
      { error: 'Failed to get review queue' },
      { status: 500 }
    );
  }
}