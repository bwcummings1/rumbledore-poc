import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions, checkPermission } from './auth-config';

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    throw new Error('Unauthorized');
  }
  
  return session;
}

export async function requirePermission(permission: string) {
  const session = await requireAuth();
  
  const hasPermission = await checkPermission(session.user.id, permission);
  
  if (!hasPermission) {
    throw new Error('Forbidden');
  }
  
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  
  const isAdmin = session.user.roles?.some((role: string) => 
    ['SUPER_ADMIN', 'LEAGUE_OWNER', 'LEAGUE_ADMIN'].includes(role)
  );
  
  if (!isAdmin) {
    throw new Error('Forbidden');
  }
  
  return session;
}

// API route wrapper with auth
export function withAuth(
  handler: (req: Request, context: any) => Promise<Response>,
  options?: {
    requireAdmin?: boolean;
    permission?: string;
  }
) {
  return async (req: Request, context: any) => {
    try {
      if (options?.requireAdmin) {
        await requireAdmin();
      } else if (options?.permission) {
        await requirePermission(options.permission);
      } else {
        await requireAuth();
      }
      
      return await handler(req, context);
    } catch (error: any) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
      throw error;
    }
  };
}