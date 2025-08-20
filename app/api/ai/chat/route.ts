/**
 * AI Chat API Endpoint
 * 
 * Main endpoint for interacting with AI agents in the Rumbledore platform.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';
import { createAgent, ExtendedAgentType } from '@/lib/ai/agent-factory';
import { SSEHandler } from '@/lib/ai/streaming/sse-handler';
import { getAIResponseCache } from '@/lib/ai/cache/response-cache';
import { withAgentRateLimit } from '@/lib/middleware/rate-limiter';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Request schema - now supports all agent types
const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  agentType: z.enum([
    'COMMISSIONER',
    'ANALYST',
    'NARRATOR',
    'TRASH_TALKER',
    'BETTING_ADVISOR',
    'HISTORIAN',
    'ORACLE'
  ] as const),
  sessionId: z.string().optional(),
  leagueSandbox: z.string().optional(),
  context: z.record(z.any()).optional(),
  streaming: z.boolean().optional().default(false),
});

// Response schema
const ChatResponseSchema = z.object({
  response: z.string(),
  sessionId: z.string(),
  agentType: z.string(),
  toolsUsed: z.array(z.string()),
  processingTime: z.number(),
  timestamp: z.string(),
  cached: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const validated = ChatRequestSchema.parse(body);

    // Generate or use session ID
    const sessionId = validated.sessionId || uuidv4();

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Verify user has access to the league if specified
    if (validated.leagueSandbox) {
      const hasAccess = await prisma.leagueMember.findFirst({
        where: {
          userId: session.user.id,
          league: {
            sandboxNamespace: validated.leagueSandbox,
          },
        },
      });

      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Access denied to this league' },
          { status: 403 }
        );
      }
    }

    // Create the appropriate agent
    const agent = createAgent(validated.agentType, validated.leagueSandbox);

    // Initialize the agent
    await agent.initialize();

    // Add context about the current user and league
    const enrichedContext = {
      ...validated.context,
      userId: session.user.id,
      userName: session.user.name || session.user.email,
      timestamp: new Date().toISOString(),
    };

    // Process the message
    const result = await agent.processMessage(
      validated.message,
      sessionId,
      session.user.id,
      enrichedContext
    );

    // Create response
    const response: z.infer<typeof ChatResponseSchema> = {
      response: result.response,
      sessionId,
      agentType: validated.agentType,
      toolsUsed: result.toolsUsed,
      processingTime: result.processingTime || 0,
      timestamp: new Date().toISOString(),
    };

    // Log the interaction for analytics
    await prisma.agentConversation.updateMany({
      where: {
        sessionId,
        agentId: agent.getConfig().id,
      },
      data: {
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Chat API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes('rate limit')) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      if (error.message.includes('OpenAI')) {
        return NextResponse.json(
          { error: 'AI service temporarily unavailable' },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve conversation history
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const agentType = searchParams.get('agentType');
    const limit = parseInt(searchParams.get('limit') || '10');

    // Build query
    const where: any = {
      userId: session.user.id,
    };

    if (sessionId) {
      where.sessionId = sessionId;
    }

    if (agentType) {
      where.agentId = {
        contains: agentType.toLowerCase(),
      };
    }

    // Get conversations
    const conversations = await prisma.agentConversation.findMany({
      where,
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        sessionId: true,
        agentId: true,
        messages: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      conversations,
      total: conversations.length,
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve conversations' },
      { status: 500 }
    );
  }
}