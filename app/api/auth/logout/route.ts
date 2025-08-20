import { NextRequest } from 'next/server';
import { createApiHandler, createSuccessResponse } from '@/lib/api/handler';

export const POST = createApiHandler(async (request: NextRequest) => {
  // In a real app, you'd invalidate the session/token here
  // For now, we'll just return success
  
  return createSuccessResponse({
    success: true,
    message: 'Logged out successfully'
  });
});