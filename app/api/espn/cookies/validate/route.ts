import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCookieRefreshService } from '@/lib/espn/cookie-refresh';
import { createApiHandler, validateRequest, ApiError } from '@/lib/api/handler';

// Schema for validation request
const ValidateSchema = z.object({
  leagueId: z.string().uuid('Invalid league ID format')
});

/**
 * POST /api/espn/cookies/validate
 * Validate stored ESPN cookies for a league
 */
export const POST = createApiHandler(async (request, context) => {
  try {
    // Parse and validate request body
    const body = await request.json();
    const { leagueId } = validateRequest(ValidateSchema, body);
    
    // For now, use mock user ID
    const userId = context.user?.id || 'mock-user-id';
    
    // Get refresh service
    const refreshService = getCookieRefreshService();
    
    // Validate and refresh cookies
    const result = await refreshService.validateAndRefresh(userId, leagueId);
    
    return NextResponse.json({
      valid: result.success,
      needsUserAction: result.needsUserAction,
      message: result.message,
      validUntil: result.validUntil
    });
  } catch (error) {
    console.error('Failed to validate cookies:', error);
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError('Failed to validate credentials', 500);
  }
});

/**
 * GET /api/espn/cookies/validate
 * Check ESPN API status
 */
export const GET = createApiHandler(async (request, context) => {
  try {
    // Get refresh service
    const refreshService = getCookieRefreshService();
    
    // Check ESPN API status
    const isAvailable = await refreshService.checkESPNStatus();
    
    return NextResponse.json({
      espnApiAvailable: isAvailable,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to check ESPN status:', error);
    
    return NextResponse.json({
      espnApiAvailable: false,
      timestamp: new Date().toISOString(),
      error: 'Unable to reach ESPN API'
    });
  }
});