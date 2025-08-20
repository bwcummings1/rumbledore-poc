// Bulk Content Operations API
// Sprint 10: Content Pipeline - Bulk content management

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { PrismaClient, ContentStatus, ContentType, AgentType } from '@prisma/client';
import { ContentPublisher } from '@/lib/ai/content/content-publisher';
import { ContentFilterOptions } from '@/types/content';

const prisma = new PrismaClient();
const publisher = new ContentPublisher();

// Validation schemas
const BulkOperationSchema = z.object({
  action: z.enum(['publish', 'archive', 'delete', 'approve', 'reject']),
  contentIds: z.array(z.string().uuid()),
  options: z.record(z.any()).optional(),
});

const FilterSchema = z.object({
  leagueId: z.string().uuid(),
  type: z.nativeEnum(ContentType).optional(),
  status: z.nativeEnum(ContentStatus).optional(),
  agentType: z.nativeEnum(AgentType).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().optional(),
  featured: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['createdAt', 'publishedAt', 'viewCount', 'qualityScore']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * POST /api/content/bulk
 * Bulk operations (publish, archive, delete)
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
    const { action, contentIds, options } = BulkOperationSchema.parse(body);

    if (contentIds.length === 0) {
      return NextResponse.json(
        { error: 'No content IDs provided' },
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

    // Get all content to check permissions
    const contents = await prisma.generatedContent.findMany({
      where: {
        id: { in: contentIds },
      },
      select: {
        id: true,
        leagueId: true,
        status: true,
      },
    });

    // Check if user has permissions for all content
    const leagueIds = [...new Set(contents.map(c => c.leagueId))];
    
    for (const leagueId of leagueIds) {
      const membership = await prisma.leagueMember.findFirst({
        where: {
          leagueId,
          userId: user.id,
          role: { in: ['OWNER', 'ADMIN'] },
        },
      });

      if (!membership) {
        return NextResponse.json(
          { error: `No permission for league ${leagueId}` },
          { status: 403 }
        );
      }
    }

    // Perform bulk operation
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const contentId of contentIds) {
      try {
        switch (action) {
          case 'publish':
            const content = contents.find(c => c.id === contentId);
            if (content?.status === ContentStatus.APPROVED) {
              await publisher.publishContent(contentId, options);
              results.successful++;
            } else {
              results.failed++;
              results.errors.push(`Content ${contentId} not approved`);
            }
            break;

          case 'archive':
            await prisma.generatedContent.update({
              where: { id: contentId },
              data: { status: ContentStatus.ARCHIVED },
            });
            results.successful++;
            break;

          case 'delete':
            await prisma.generatedContent.delete({
              where: { id: contentId },
            });
            results.successful++;
            break;

          case 'approve':
            await prisma.generatedContent.update({
              where: { id: contentId },
              data: {
                status: ContentStatus.APPROVED,
                reviewData: {
                  manuallyApproved: true,
                  approvedBy: user.id,
                  approvedAt: new Date(),
                },
              },
            });
            results.successful++;
            break;

          case 'reject':
            await prisma.generatedContent.update({
              where: { id: contentId },
              data: {
                status: ContentStatus.REJECTED,
                reviewData: {
                  rejected: true,
                  rejectedBy: user.id,
                  rejectedAt: new Date(),
                  reason: options?.reason || 'Bulk rejection',
                },
              },
            });
            results.successful++;
            break;
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Failed to ${action} content ${contentId}`);
      }
    }

    return NextResponse.json({
      success: true,
      action,
      results,
      message: `Bulk operation completed: ${results.successful} successful, ${results.failed} failed`,
    });
  } catch (error) {
    console.error('[API] Bulk operation failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Bulk operation failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/content/bulk?leagueId=xxx&status=xxx...
 * Advanced filtering with pagination
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    
    // Parse tags if present
    if (queryParams.tags) {
      queryParams.tags = queryParams.tags.split(',');
    }

    // Parse numbers
    if (queryParams.limit) queryParams.limit = parseInt(queryParams.limit);
    if (queryParams.offset) queryParams.offset = parseInt(queryParams.offset);

    // Validate filters
    const filters = FilterSchema.parse(queryParams);

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
        leagueId: filters.leagueId,
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
    const where: any = {
      leagueId: filters.leagueId,
    };

    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.agentType) where.agentType = filters.agentType;
    
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get content
    const [content, total] = await Promise.all([
      prisma.generatedContent.findMany({
        where,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        take: filters.limit,
        skip: filters.offset,
        include: {
          blogPost: {
            select: {
              id: true,
              slug: true,
              viewCount: true,
              tags: true,
              featured: true,
            },
          },
        },
      }),
      prisma.generatedContent.count({ where }),
    ]);

    // Filter by tags if requested (after fetching due to relation)
    let filteredContent = content;
    if (filters.tags && filters.tags.length > 0) {
      filteredContent = content.filter(c => 
        c.blogPost?.tags.some(tag => filters.tags?.includes(tag))
      );
    }

    if (filters.featured !== undefined) {
      filteredContent = filteredContent.filter(c => 
        c.blogPost?.featured === filters.featured
      );
    }

    return NextResponse.json({
      content: filteredContent,
      total,
      limit: filters.limit,
      offset: filters.offset,
      hasMore: filters.offset + filters.limit < total,
    });
  } catch (error) {
    console.error('[API] Failed to filter content:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid filter parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to filter content' },
      { status: 500 }
    );
  }
}