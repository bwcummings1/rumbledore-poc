// Content CRUD API Endpoints
// Sprint 10: Content Pipeline - Individual content management

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { PrismaClient, ContentStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Validation schema for content updates
const UpdateContentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  status: z.nativeEnum(ContentStatus).optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * GET /api/content/[contentId]
 * Retrieve content with review data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { contentId: string } }
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

    const { contentId } = params;

    // Get content
    const content = await prisma.generatedContent.findUnique({
      where: { id: contentId },
      include: {
        league: {
          select: {
            id: true,
            name: true,
            sandboxNamespace: true,
          },
        },
        schedule: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        blogPost: {
          select: {
            id: true,
            slug: true,
            viewCount: true,
            publishedAt: true,
          },
        },
      },
    });

    if (!content) {
      return NextResponse.json(
        { error: 'Content not found' },
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
        leagueId: content.leagueId,
        userId: user.id,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Not authorized to view this content' },
        { status: 403 }
      );
    }

    return NextResponse.json(content);
  } catch (error) {
    console.error('[API] Failed to get content:', error);
    return NextResponse.json(
      { error: 'Failed to get content' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/content/[contentId]
 * Update content (title, body, metadata)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { contentId: string } }
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

    const { contentId } = params;

    // Parse and validate request body
    const body = await request.json();
    const validatedData = UpdateContentSchema.parse(body);

    // Get content
    const content = await prisma.generatedContent.findUnique({
      where: { id: contentId },
    });

    if (!content) {
      return NextResponse.json(
        { error: 'Content not found' },
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
        leagueId: content.leagueId,
        userId: user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Only league owners and admins can update content' },
        { status: 403 }
      );
    }

    // Update content
    const updatedContent = await prisma.generatedContent.update({
      where: { id: contentId },
      data: {
        ...validatedData,
        updatedAt: new Date(),
      },
    });

    // If status changed to APPROVED and was previously not approved, clear review data
    if (validatedData.status === ContentStatus.APPROVED && 
        content.status !== ContentStatus.APPROVED) {
      await prisma.generatedContent.update({
        where: { id: contentId },
        data: {
          reviewData: {
            ...((content.reviewData as any) || {}),
            manuallyApproved: true,
            approvedBy: user.id,
            approvedAt: new Date(),
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      content: updatedContent,
      message: 'Content updated successfully',
    });
  } catch (error) {
    console.error('[API] Failed to update content:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid update data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update content' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content/[contentId]
 * Archive/delete content
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { contentId: string } }
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

    const { contentId } = params;

    // Get query params for hard delete option
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get('hard') === 'true';

    // Get content
    const content = await prisma.generatedContent.findUnique({
      where: { id: contentId },
    });

    if (!content) {
      return NextResponse.json(
        { error: 'Content not found' },
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
        leagueId: content.leagueId,
        userId: user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Only league owners and admins can delete content' },
        { status: 403 }
      );
    }

    if (hardDelete) {
      // Hard delete
      await prisma.generatedContent.delete({
        where: { id: contentId },
      });

      return NextResponse.json({
        success: true,
        message: 'Content permanently deleted',
      });
    } else {
      // Soft delete (archive)
      await prisma.generatedContent.update({
        where: { id: contentId },
        data: {
          status: ContentStatus.ARCHIVED,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Content archived successfully',
      });
    }
  } catch (error) {
    console.error('[API] Failed to delete content:', error);
    return NextResponse.json(
      { error: 'Failed to delete content' },
      { status: 500 }
    );
  }
}