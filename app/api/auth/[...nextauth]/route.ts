import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/auth-config';
import { NextRequest, NextResponse } from 'next/server';

const handler = NextAuth(authOptions);

// Override for development to always return a session
export async function GET(request: NextRequest) {
  // Check if this is a session request in development
  if (process.env.NODE_ENV === 'development' && request.url.includes('/api/auth/session')) {
    return NextResponse.json({
      user: {
        id: '8a4bfba9-0c6d-47cb-8005-5754b663b425',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['MEMBER'],
        permissions: ['VIEW_LEAGUES']
      },
      expires: '2026-01-01T00:00:00.000Z'
    });
  }
  
  // Otherwise use normal NextAuth handler
  return handler(request);
}

export { handler as POST };