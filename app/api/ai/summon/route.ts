/**
 * Agent Summoning API Endpoint
 * 
 * Handles agent summoning requests, initializing agents in specific
 * chat rooms and generating introduction messages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';
import { createAgent, ExtendedAgentType } from '@/lib/ai/agent-factory';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { wsServer } from '@/lib/websocket/server';

const prisma = new PrismaClient();

// Request schema for summoning an agent
const SummonRequestSchema = z.object({
  agentType: z.enum([
    'COMMISSIONER',
    'ANALYST',
    'NARRATOR',
    'TRASH_TALKER',
    'BETTING_ADVISOR',
    'HISTORIAN',
    'ORACLE'
  ] as const),
  leagueSandbox: z.string(),
  sessionId: z.string().optional(),
  reason: z.string().optional(),
  persist: z.boolean().optional().default(false),
});

// Response schema
const SummonResponseSchema = z.object({
  success: boolean,
  agentId: z.string(),
  agentType: z.string(),
  introduction: z.string(),
  sessionId: z.string(),
  timestamp: z.string(),
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
    const validated = SummonRequestSchema.parse(body);

    // Generate session ID if not provided
    const sessionId = validated.sessionId || `summon-${Date.now()}-${uuidv4().slice(0, 8)}`;

    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    // Verify user has access to the league
    const league = await prisma.league.findUnique({
      where: { sandboxNamespace: validated.leagueSandbox },
      select: { id: true, name: true }
    });

    if (!league) {
      return NextResponse.json(
        { error: 'League not found' },
        { status: 404 }
      );
    }

    const hasAccess = await prisma.leagueMember.findFirst({
      where: {
        userId: session.user.id,
        leagueId: league.id,
      },
    });

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied to this league' },
        { status: 403 }
      );
    }

    // Check if agent is already summoned in this session
    const existingSummon = await prisma.agentSummon.findFirst({
      where: {
        sessionId,
        agentType: validated.agentType,
        active: true,
      }
    });

    if (existingSummon) {
      return NextResponse.json(
        { error: 'Agent already active in this session' },
        { status: 400 }
      );
    }

    // Create and initialize the agent
    const agentKey = `${validated.agentType}-${validated.leagueSandbox}`;
    const agent = createAgent(validated.agentType, validated.leagueSandbox);
    
    await agent.initialize();

    // Generate introduction message
    const introPrompt = validated.reason 
      ? `You are being summoned to help with: "${validated.reason}". Introduce yourself to the league members and explain how you can help with this specific request.`
      : 'Introduce yourself to the league members and explain your role and capabilities.';
    
    const introResult = await agent.processMessage(
      introPrompt,
      sessionId,
      session.user.id
    );

    // Store the summon in database
    const summon = await prisma.agentSummon.create({
      data: {
        sessionId,
        agentId: agentKey,
        agentType: validated.agentType,
        summonedBy: session.user.id,
        reason: validated.reason,
        introMessage: introResult.response,
        active: true,
        toolsUsed: introResult.toolsUsed || [],
      }
    });

    // Update chat session with active agent
    await prisma.chatSession.upsert({
      where: { sessionId },
      update: {
        activeAgents: {
          push: agentKey
        },
        lastActivityAt: new Date(),
      },
      create: {
        sessionId,
        leagueId: league.id,
        leagueSandbox: validated.leagueSandbox,
        title: `Chat with ${validated.agentType}`,
        participants: [session.user.id],
        activeAgents: [agentKey],
      }
    });

    // Store the introduction message in chat history
    await prisma.chatMessage.create({
      data: {
        leagueId: league.id,
        leagueSandbox: validated.leagueSandbox,
        sessionId,
        senderId: agentKey,
        senderType: 'AGENT',
        content: introResult.response,
        metadata: {
          agentType: validated.agentType,
          toolsUsed: introResult.toolsUsed,
          isIntroduction: true,
        }
      }
    });

    // Emit WebSocket event for real-time notification
    if (wsServer.isInitialized()) {
      wsServer.emitAgentArrived(league.id, {
        agentType: validated.agentType,
        message: introResult.response,
        summonedBy: session.user.id,
        reason: validated.reason,
      });
    }

    // Create response
    const response: z.infer<typeof SummonResponseSchema> = {
      success: true,
      agentId: agentKey,
      agentType: validated.agentType,
      introduction: introResult.response,
      sessionId,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Summon API error:', error);

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
          { error: 'Too many summon requests. Please wait before summoning another agent.' },
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
      { error: 'Failed to summon agent' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve active summons
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
    const leagueSandbox = searchParams.get('leagueSandbox');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    // Build query
    const where: any = {
      summonedBy: session.user.id,
    };

    if (sessionId) {
      where.sessionId = sessionId;
    }

    if (activeOnly) {
      where.active = true;
    }

    // Get summons
    const summons = await prisma.agentSummon.findMany({
      where,
      orderBy: {
        summonedAt: 'desc',
      },
      select: {
        id: true,
        sessionId: true,
        agentId: true,
        agentType: true,
        reason: true,
        introMessage: true,
        active: true,
        messageCount: true,
        toolsUsed: true,
        summonedAt: true,
        dismissedAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
          }
        }
      }
    });

    // Filter by league if specified
    let filteredSummons = summons;
    if (leagueSandbox) {
      filteredSummons = summons.filter(s => 
        s.agentId.includes(leagueSandbox)
      );
    }

    return NextResponse.json({
      summons: filteredSummons,
      total: filteredSummons.length,
    });
  } catch (error) {
    console.error('Get summons error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve summons' },
      { status: 500 }
    );
  }
}

// DELETE endpoint to dismiss an agent
export async function DELETE(request: NextRequest) {
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

    if (!sessionId || !agentType) {
      return NextResponse.json(
        { error: 'sessionId and agentType are required' },
        { status: 400 }
      );
    }

    // Update the summon record
    const updated = await prisma.agentSummon.updateMany({
      where: {
        sessionId,
        agentType: agentType as any,
        summonedBy: session.user.id,
        active: true,
      },
      data: {
        active: false,
        dismissedAt: new Date(),
      }
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: 'No active summon found' },
        { status: 404 }
      );
    }

    // Update chat session to remove agent from active list
    const chatSession = await prisma.chatSession.findUnique({
      where: { sessionId }
    });

    if (chatSession) {
      const activeAgents = (chatSession.activeAgents as string[]) || [];
      const filteredAgents = activeAgents.filter(a => !a.includes(agentType));
      
      await prisma.chatSession.update({
        where: { sessionId },
        data: {
          activeAgents: filteredAgents,
          lastActivityAt: new Date(),
        }
      });
    }

    // Emit WebSocket event
    if (wsServer.isInitialized() && chatSession) {
      wsServer.emitAgentDismissed(chatSession.leagueId, {
        agentType,
        dismissedBy: session.user.id,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${agentType} has been dismissed`,
    });
  } catch (error) {
    console.error('Dismiss agent error:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss agent' },
      { status: 500 }
    );
  }
}