// Content Publishing API Endpoint
// Sprint 10: Content Pipeline

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { ContentPublisher } from '@/lib/ai/content/content-publisher';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const publisher = new ContentPublisher();

// Request validation schemas
const PublishContentSchema = z.object({
  contentId: z.string().uuid(),
  options: z.object({
    immediate: z.boolean().optional(),
    scheduledFor: z.string().datetime().optional(),
    notify: z.boolean().optional(),
    featured: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    excerpt: z.string().optional(),
  }).optional(),
});

const UnpublishContentSchema = z.object({
  blogPostId: z.string().uuid(),
});

const UpdatePublishedSchema = z.object({
  blogPostId: z.string().uuid(),
  updates: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    excerpt: z.string().optional(),
    tags: z.array(z.string()).optional(),
    featured: z.boolean().optional(),
  }),
});

/**
 * POST /api/content/publish
 * Publish approved content
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
    const { contentId, options } = PublishContentSchema.parse(body);

    // Get content and verify it's approved
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

    if (content.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Content must be approved before publishing' },
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

    // Check if user has permission to publish
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: content.leagueId,
        userId: user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Only league owners and admins can publish content' },
        { status: 403 }
      );
    }

    // Publish content
    const blogPostId = await publisher.publishContent(contentId, options);

    return NextResponse.json({
      success: true,
      blogPostId,
      message: blogPostId === 'scheduled' 
        ? 'Content scheduled for future publishing'
        : 'Content published successfully',
    });
  } catch (error) {
    console.error('[API] Content publishing failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to publish content' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content/publish
 * Unpublish content
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

    // Parse and validate request body
    const body = await request.json();
    const { blogPostId } = UnpublishContentSchema.parse(body);

    // Get blog post
    const blogPost = await prisma.blogPost.findUnique({
      where: { id: blogPostId },
    });

    if (!blogPost) {
      return NextResponse.json(
        { error: 'Blog post not found' },
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

    // Check if user has permission to unpublish
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: blogPost.leagueId,
        userId: user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Only league owners and admins can unpublish content' },
        { status: 403 }
      );
    }

    // Unpublish content
    await publisher.unpublishContent(blogPostId);

    return NextResponse.json({
      success: true,
      message: 'Content unpublished successfully',
    });
  } catch (error) {
    console.error('[API] Content unpublishing failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to unpublish content' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/content/publish
 * Update published content
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
    const { blogPostId, updates } = UpdatePublishedSchema.parse(body);

    // Get blog post
    const blogPost = await prisma.blogPost.findUnique({
      where: { id: blogPostId },
    });

    if (!blogPost) {
      return NextResponse.json(
        { error: 'Blog post not found' },
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

    // Check if user has permission to update
    const membership = await prisma.leagueMember.findFirst({
      where: {
        leagueId: blogPost.leagueId,
        userId: user.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Only league owners and admins can update published content' },
        { status: 403 }
      );
    }

    // Update published content
    await publisher.updatePublishedContent(blogPostId, updates);

    return NextResponse.json({
      success: true,
      message: 'Published content updated successfully',
    });
  } catch (error) {
    console.error('[API] Content update failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update published content' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/content/publish?leagueId=xxx&limit=10
 * Get published content
 */
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId');
    const slug = searchParams.get('slug');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');
    const featured = searchParams.get('featured') === 'true';
    const tags = searchParams.get('tags')?.split(',');

    if (!leagueId) {
      return NextResponse.json(
        { error: 'League ID required' },
        { status: 400 }
      );
    }

    // Get specific post by slug
    if (slug) {
      const post = await publisher.getPublishedContent(slug, leagueId);
      if (!post) {
        return NextResponse.json(
          { error: 'Post not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(post);
    }

    // Get featured content
    if (featured) {
      const posts = await publisher.getFeaturedContent(leagueId);
      return NextResponse.json({ posts });
    }

    // Get content by tags
    if (tags && tags.length > 0) {
      const posts = await publisher.getContentByTags(leagueId, tags);
      return NextResponse.json({ posts });
    }

    // Get recent content
    const posts = await publisher.getRecentContent(leagueId, limit, offset);
    
    // Get total count for pagination
    const total = await prisma.blogPost.count({
      where: { leagueId },
    });

    return NextResponse.json({
      posts,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error('[API] Failed to get published content:', error);
    return NextResponse.json(
      { error: 'Failed to get published content' },
      { status: 500 }
    );
  }
}