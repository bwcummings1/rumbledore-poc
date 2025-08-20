// Content Generation API Endpoint
// Sprint 10: Content Pipeline

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { ContentGenerator } from '@/lib/ai/content/content-generator';
import { ContentType, AgentType } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Request validation schema
const GenerateContentSchema = z.object({
  leagueId: z.string().uuid(),
  type: z.nativeEnum(ContentType),
  agentType: z.nativeEnum(AgentType),
  title: z.string().optional(),
  templateId: z.string().uuid().optional(),
  customPrompt: z.string().optional(),
  context: z.record(z.any()).optional(),
  scheduledFor: z.string().datetime().optional(),
  priority: z.number().min(0).max(10).optional(),
  metadata: z.record(z.any()).optional(),
});

const generator = new ContentGenerator();

/**
 * POST /api/content/generate
 * Generate new AI content
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
    const validatedData = GenerateContentSchema.parse(body);

    // Get league and verify access
    const league = await prisma.league.findUnique({
      where: { id: validatedData.leagueId },
    });

    if (!league) {
      return NextResponse.json(
        { error: 'League not found' },
        { status: 404 }
      );
    }

    // Check if user is a member of the league
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: validatedData.leagueId,
        user: { email: session.user.email },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this league' },
        { status: 403 }
      );
    }

    // Schedule content generation
    const jobId = await generator.scheduleContent({
      ...validatedData,
      leagueSandbox: league.sandboxNamespace,
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Content generation scheduled',
    });
  } catch (error) {
    console.error('[API] Content generation failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/content/generate?jobId=xxx
 * Get job status
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

    // Get job ID from query params
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      // Return queue statistics if no job ID provided
      const stats = await generator.getQueueStats();
      return NextResponse.json(stats);
    }

    // Get job status
    const status = await generator.getJobStatus(jobId);
    
    if (!status) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(status);
  } catch (error) {
    console.error('[API] Failed to get job status:', error);
    return NextResponse.json(
      { error: 'Failed to get job status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content/generate?jobId=xxx
 * Cancel a scheduled job
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

    // Get job ID from query params
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID required' },
        { status: 400 }
      );
    }

    // Cancel job
    const cancelled = await generator.cancelJob(jobId);
    
    if (!cancelled) {
      return NextResponse.json(
        { error: 'Job not found or already completed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully',
    });
  } catch (error) {
    console.error('[API] Failed to cancel job:', error);
    return NextResponse.json(
      { error: 'Failed to cancel job' },
      { status: 500 }
    );
  }
}