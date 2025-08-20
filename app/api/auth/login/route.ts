import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createApiHandler, validateRequest, parseRequestBody, createSuccessResponse, ApiError } from '@/lib/api/handler';
import prisma from '@/lib/prisma';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const POST = createApiHandler(async (request: NextRequest) => {
  const body = await parseRequestBody(request);
  const { email, password } = validateRequest(loginSchema, body);
  
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true
    }
  });
  
  if (!user) {
    throw new ApiError('Invalid credentials', 401);
  }
  
  // In a real app, you'd verify the password hash here
  // For now, we'll just return the user for development
  // const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  
  // Create session (in a real app, you'd use JWT or session management)
  const session = {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl
    },
    token: 'dev-token-' + user.id, // In production, use proper JWT
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  
  return createSuccessResponse(session);
});