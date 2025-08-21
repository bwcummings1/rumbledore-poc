/**
 * Individual competition API endpoints
 * 
 * GET /api/competitions/[competitionId] - Get competition details
 * PUT /api/competitions/[competitionId] - Update competition
 * DELETE /api/competitions/[competitionId] - Cancel competition
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { CompetitionManager } from '@/lib/betting/competition-manager';

const prisma = new PrismaClient();
const competitionManager = new CompetitionManager(prisma);

interface RouteParams {
  params: {
    competitionId: string;
  };
}

/**
 * Get competition details
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const competition = await competitionManager.getCompetition(params.competitionId);
    
    if (!competition) {
      return NextResponse.json(
        {
          success: false,
          error: 'Competition not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: competition,
    });
  } catch (error: any) {
    console.error('Error getting competition:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get competition',
      },
      { status: 500 }
    );
  }
}

/**
 * Update competition (only for pending competitions)
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const body = await request.json();
    
    // Get current competition
    const competition = await prisma.competition.findUnique({
      where: { id: params.competitionId },
    });
    
    if (!competition) {
      return NextResponse.json(
        {
          success: false,
          error: 'Competition not found',
        },
        { status: 404 }
      );
    }
    
    // Only allow updates to pending competitions
    if (competition.status !== 'PENDING') {
      return NextResponse.json(
        {
          success: false,
          error: 'Can only update pending competitions',
        },
        { status: 400 }
      );
    }
    
    // Update allowed fields
    const updateData: any = {};
    
    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.startDate) updateData.startDate = new Date(body.startDate);
    if (body.endDate) updateData.endDate = new Date(body.endDate);
    if (body.maxEntrants !== undefined) updateData.maxEntrants = body.maxEntrants;
    if (body.scoringRules) updateData.scoringRules = body.scoringRules;
    
    const updated = await prisma.competition.update({
      where: { id: params.competitionId },
      data: updateData,
      include: {
        _count: {
          select: { entries: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    console.error('Error updating competition:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update competition',
      },
      { status: 500 }
    );
  }
}

/**
 * Cancel competition
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    await competitionManager.cancelCompetition(params.competitionId);

    return NextResponse.json({
      success: true,
      message: 'Competition cancelled successfully',
    });
  } catch (error: any) {
    console.error('Error cancelling competition:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to cancel competition',
      },
      { status: 500 }
    );
  }
}