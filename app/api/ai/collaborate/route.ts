/**
 * Multi-Agent Collaboration API Endpoint
 * 
 * Enables multiple AI agents to work together on complex analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';
import { MultiAgentOrchestrator } from '@/lib/ai/multi-agent-orchestrator';
import { withRateLimit, MULTI_AGENT_RATE_LIMIT } from '@/lib/middleware/rate-limiter';
import { AgentType } from '@prisma/client';

// Request schema for collaborative analysis
const CollaborateRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  agentTypes: z.array(z.enum([
    'COMMISSIONER',
    'ANALYST',
    'NARRATOR',
    'TRASH_TALKER',
    'BETTING_ADVISOR',
    'HISTORIAN',
    'ORACLE'
  ] as const)).optional(),
  topic: z.string().optional(),
  leagueSandbox: z.string().optional(),
  analysisType: z.enum(['standard', 'roundtable', 'expert_panel']).optional().default('standard'),
});

// Roundtable request schema
const RoundtableRequestSchema = z.object({
  topic: z.string().min(1).max(500),
  rounds: z.number().min(1).max(5).optional().default(3),
  participants: z.array(z.string()).optional(),
  leagueSandbox: z.string().optional(),
});

// Expert panel request schema
const ExpertPanelRequestSchema = z.object({
  decision: z.string().min(1).max(1000),
  context: z.record(z.any()),
  leagueSandbox: z.string().optional(),
});

/**
 * POST /api/ai/collaborate
 * Collaborative analysis with multiple agents
 */
async function handleCollaboration(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = CollaborateRequestSchema.parse(body);

    // Create orchestrator
    const orchestrator = new MultiAgentOrchestrator({
      leagueSandbox: validatedData.leagueSandbox,
    });

    let result;

    switch (validatedData.analysisType) {
      case 'roundtable':
        // Roundtable discussion
        const roundtableData = RoundtableRequestSchema.parse(body);
        result = await orchestrator.roundtableDiscussion(
          roundtableData.topic,
          roundtableData.rounds
        );
        break;

      case 'expert_panel':
        // Expert panel for critical decisions
        const expertData = ExpertPanelRequestSchema.parse(body);
        result = await orchestrator.expertPanel(
          expertData.decision,
          expertData.context
        );
        break;

      default:
        // Standard collaborative analysis
        result = await orchestrator.collaborativeAnalysis(
          validatedData.question,
          validatedData.agentTypes as any[],
          validatedData.topic
        );
    }

    // Clean up resources
    await orchestrator.cleanup();

    return NextResponse.json({
      success: true,
      analysisType: validatedData.analysisType,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Collaboration error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Apply rate limiting
export const POST = withRateLimit(handleCollaboration, MULTI_AGENT_RATE_LIMIT);

/**
 * GET /api/ai/collaborate/status
 * Get collaboration capabilities
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    available: true,
    analysisTypes: ['standard', 'roundtable', 'expert_panel'],
    agents: [
      {
        type: 'COMMISSIONER',
        name: 'The Commissioner',
        description: 'Authoritative league management and rulings',
      },
      {
        type: 'ANALYST',
        name: 'The Analyst',
        description: 'Data-driven insights and statistical analysis',
      },
      {
        type: 'NARRATOR',
        name: 'The Narrator',
        description: 'Epic storytelling and dramatic commentary',
      },
      {
        type: 'TRASH_TALKER',
        name: 'The Trash Talker',
        description: 'Humor and playful banter',
      },
      {
        type: 'BETTING_ADVISOR',
        name: 'The Betting Advisor',
        description: 'Strategic betting analysis and recommendations',
      },
      {
        type: 'HISTORIAN',
        name: 'The Historian',
        description: 'Historical context and record keeping',
      },
      {
        type: 'ORACLE',
        name: 'The Oracle',
        description: 'Predictions and future forecasting',
      },
    ],
    limits: {
      maxAgents: 5,
      maxRounds: 5,
      requestsPerMinute: 10,
    },
  });
}