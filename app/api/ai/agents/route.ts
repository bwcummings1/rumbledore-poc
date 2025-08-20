/**
 * AI Agents Management API
 * 
 * Endpoints for managing AI agent configurations and personalities.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';
import { PrismaClient, AgentType } from '@prisma/client';

const prisma = new PrismaClient();

// Schema for agent configuration
const AgentConfigSchema = z.object({
  agentId: z.string(),
  agentType: z.nativeEnum(AgentType),
  leagueSandbox: z.string().optional(),
  personality: z.object({
    traits: z.array(z.string()),
    tone: z.string(),
    expertise: z.array(z.string()),
    catchphrases: z.array(z.string()).optional(),
    humor: z.enum(['none', 'light', 'moderate', 'heavy']).optional(),
  }),
  parameters: z.object({
    temperature: z.number().min(0).max(1).optional(),
    maxTokens: z.number().min(100).max(4000).optional(),
    modelName: z.string().optional(),
  }).optional(),
  active: z.boolean().optional(),
});

// GET: List available agents
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
    const leagueSandbox = searchParams.get('leagueSandbox');

    // Get agent configurations
    const agents = await prisma.agentConfig.findMany({
      where: {
        leagueSandbox: leagueSandbox || undefined,
        active: true,
      },
      orderBy: {
        agentType: 'asc',
      },
    });

    // If no custom agents, return default configurations
    if (agents.length === 0) {
      const defaultAgents = [
        {
          agentId: `commissioner-${leagueSandbox || 'global'}`,
          agentType: 'COMMISSIONER',
          leagueSandbox,
          personality: {
            traits: ['authoritative', 'fair', 'knowledgeable'],
            tone: 'professional yet engaging',
            expertise: ['league rules', 'dispute resolution', 'trade evaluation'],
            catchphrases: ['By the power vested in me as Commissioner...'],
            humor: 'light',
          },
          active: true,
        },
        {
          agentId: `analyst-${leagueSandbox || 'global'}`,
          agentType: 'ANALYST',
          leagueSandbox,
          personality: {
            traits: ['analytical', 'precise', 'data-driven'],
            tone: 'professional and informative',
            expertise: ['statistical analysis', 'performance projections'],
            humor: 'none',
          },
          active: true,
        },
        {
          agentId: `narrator-${leagueSandbox || 'global'}`,
          agentType: 'NARRATOR',
          leagueSandbox,
          personality: {
            traits: ['dramatic', 'storytelling', 'engaging'],
            tone: 'epic and entertaining',
            expertise: ['league history', 'rivalry narratives', 'dramatic moments'],
            catchphrases: ['In a league where legends are born...'],
            humor: 'moderate',
          },
          active: true,
        },
        {
          agentId: `trash-talker-${leagueSandbox || 'global'}`,
          agentType: 'TRASH_TALKER',
          leagueSandbox,
          personality: {
            traits: ['provocative', 'humorous', 'competitive'],
            tone: 'playfully antagonistic',
            expertise: ['roasting', 'rivalry insights', 'competitive banter'],
            catchphrases: ['Oh, you thought you had a chance?'],
            humor: 'heavy',
          },
          active: true,
        },
        {
          agentId: `betting-advisor-${leagueSandbox || 'global'}`,
          agentType: 'BETTING_ADVISOR',
          leagueSandbox,
          personality: {
            traits: ['strategic', 'risk-aware', 'opportunistic'],
            tone: 'confident and advisory',
            expertise: ['odds analysis', 'value identification', 'risk management'],
            catchphrases: ['The smart money says...'],
            humor: 'light',
          },
          active: true,
        },
      ];

      return NextResponse.json({
        agents: defaultAgents,
        isDefault: true,
      });
    }

    return NextResponse.json({
      agents,
      isDefault: false,
    });
  } catch (error) {
    console.error('Get agents error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve agents' },
      { status: 500 }
    );
  }
}

// POST: Create or update agent configuration
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has admin permissions
    const isAdmin = await prisma.userRole.findFirst({
      where: {
        userId: session.user.id,
        role: {
          name: {
            in: ['SUPER_ADMIN', 'LEAGUE_OWNER', 'LEAGUE_ADMIN'],
          },
        },
      },
    });

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin permissions required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = AgentConfigSchema.parse(body);

    // Verify league access if specified
    if (validated.leagueSandbox) {
      const hasAccess = await prisma.leagueMember.findFirst({
        where: {
          userId: session.user.id,
          league: {
            sandboxNamespace: validated.leagueSandbox,
          },
          role: {
            in: ['OWNER', 'ADMIN'],
          },
        },
      });

      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Admin access required for this league' },
          { status: 403 }
        );
      }
    }

    // Create or update agent configuration
    const agent = await prisma.agentConfig.upsert({
      where: {
        agentId: validated.agentId,
      },
      update: {
        agentType: validated.agentType,
        personality: validated.personality,
        parameters: validated.parameters || {},
        active: validated.active ?? true,
        updatedAt: new Date(),
      },
      create: {
        agentId: validated.agentId,
        agentType: validated.agentType,
        leagueSandbox: validated.leagueSandbox,
        personality: validated.personality,
        tools: [], // Tools are determined by agent type
        parameters: validated.parameters || {},
        active: validated.active ?? true,
      },
    });

    return NextResponse.json({
      success: true,
      agent,
    });
  } catch (error) {
    console.error('Create/update agent error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid configuration data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to save agent configuration' },
      { status: 500 }
    );
  }
}

// DELETE: Deactivate an agent
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check admin permissions
    const isAdmin = await prisma.userRole.findFirst({
      where: {
        userId: session.user.id,
        role: {
          name: {
            in: ['SUPER_ADMIN', 'LEAGUE_OWNER', 'LEAGUE_ADMIN'],
          },
        },
      },
    });

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin permissions required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID required' },
        { status: 400 }
      );
    }

    // Deactivate the agent (soft delete)
    await prisma.agentConfig.update({
      where: {
        agentId,
      },
      data: {
        active: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Agent deactivated successfully',
    });
  } catch (error) {
    console.error('Delete agent error:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate agent' },
      { status: 500 }
    );
  }
}