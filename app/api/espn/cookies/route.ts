import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCookieManager } from '@/lib/crypto/cookie-manager';
import { getESPNValidator } from '@/lib/espn/validator';
import { createApiHandler, validateRequest, ApiError } from '@/lib/api/handler';
import { prisma } from '@/lib/prisma';

// Schema for POST request
const StoreCookiesSchema = z.object({
  swid: z.string().min(1, 'SWID cookie is required'),
  espnS2: z.string().min(1, 'ESPN_S2 cookie is required'),
  leagueId: z.string().uuid('Invalid league ID format'),
  capturedAt: z.string().optional()
});

// Schema for GET request query params
const GetCookiesSchema = z.object({
  leagueId: z.string().uuid('Invalid league ID format')
});

/**
 * POST /api/espn/cookies
 * Store encrypted ESPN cookies for a league
 */
export const POST = createApiHandler(async (request, context) => {
  try {
    // Parse and validate request body
    const body = await request.json();
    const { swid, espnS2, leagueId } = validateRequest(StoreCookiesSchema, body);
    
    // For now, we'll use a mock user ID - in production this would come from session
    // TODO: Implement proper authentication in Sprint 2 completion
    const userId = context.user?.id || 'mock-user-id';
    
    // Verify the league exists and user has access
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        members: {
          where: { userId }
        }
      }
    });

    if (!league) {
      throw new ApiError('League not found', 404);
    }

    // For development, allow any user to store cookies
    // TODO: In production, check if user is a member of the league
    // if (league.members.length === 0) {
    //   throw new ApiError('You do not have access to this league', 403);
    // }

    // Get services
    const cookieManager = getCookieManager();
    const validator = getESPNValidator();

    // Validate cookies against ESPN API
    const validationResult = await validator.validateCookies(
      { swid, espnS2 },
      Number(league.espnLeagueId),
      league.season
    );

    if (!validationResult.isValid) {
      throw new ApiError(
        validationResult.error || 'Invalid ESPN credentials',
        400
      );
    }

    // Store encrypted cookies
    await cookieManager.storeCookies(userId, leagueId, { swid, espnS2 });

    // Update league last sync timestamp
    await prisma.league.update({
      where: { id: leagueId },
      data: { lastSyncAt: new Date() }
    });

    return NextResponse.json({
      success: true,
      message: 'ESPN credentials stored successfully',
      leagueName: league.name,
      validationData: validationResult.leagueData
    });
  } catch (error) {
    console.error('Failed to store ESPN cookies:', error);
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError('Failed to store ESPN credentials', 500);
  }
});

/**
 * GET /api/espn/cookies
 * Get credential status for a league
 */
export const GET = createApiHandler(async (request, context) => {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId');

    if (!leagueId) {
      throw new ApiError('League ID is required', 400);
    }

    // Validate league ID format
    validateRequest(GetCookiesSchema, { leagueId });

    // For now, use mock user ID
    const userId = context.user?.id || 'mock-user-id';

    // Get cookie manager
    const cookieManager = getCookieManager();

    // Get cookie status
    const status = await cookieManager.getCookieStatus(userId, leagueId);

    // Get league info for context
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        name: true,
        espnLeagueId: true,
        season: true,
        lastSyncAt: true
      }
    });

    if (!league) {
      throw new ApiError('League not found', 404);
    }

    return NextResponse.json({
      ...status,
      league: {
        name: league.name,
        espnLeagueId: league.espnLeagueId.toString(),
        season: league.season,
        lastSyncAt: league.lastSyncAt
      }
    });
  } catch (error) {
    console.error('Failed to get cookie status:', error);
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError('Failed to retrieve credential status', 500);
  }
});

/**
 * DELETE /api/espn/cookies
 * Delete stored cookies for a league
 */
export const DELETE = createApiHandler(async (request, context) => {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId');

    if (!leagueId) {
      throw new ApiError('League ID is required', 400);
    }

    // Validate league ID format
    validateRequest(GetCookiesSchema, { leagueId });

    // For now, use mock user ID
    const userId = context.user?.id || 'mock-user-id';

    // Get cookie manager
    const cookieManager = getCookieManager();

    // Delete cookies
    await cookieManager.deleteCookies(userId, leagueId);

    return NextResponse.json({
      success: true,
      message: 'ESPN credentials deleted successfully'
    });
  } catch (error) {
    console.error('Failed to delete cookies:', error);
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError('Failed to delete credentials', 500);
  }
});