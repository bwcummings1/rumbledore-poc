import { NextRequest } from 'next/server';
import { createApiHandler, createSuccessResponse, ApiError } from '@/lib/api/handler';
import prisma from '@/lib/prisma';

export const GET = createApiHandler(async (request: NextRequest) => {
  // In a real app, you'd verify the session token from cookies/headers
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError('Unauthorized', 401);
  }
  
  const token = authHeader.substring(7);
  
  // For development, extract user ID from dev token
  if (token.startsWith('dev-token-')) {
    const userId = token.replace('dev-token-', '');
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true
      }
    });
    
    if (!user) {
      throw new ApiError('Session expired', 401);
    }
    
    return createSuccessResponse({
      user,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
  }
  
  throw new ApiError('Invalid session', 401);
});