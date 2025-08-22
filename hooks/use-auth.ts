import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useAuth() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const isLoading = status === 'loading';
  const isAuthenticated = !!session?.user;
  const user = session?.user || null;

  // Check if user has any of the specified roles
  const hasRole = useCallback((roles: string | string[]) => {
    if (!user?.roles) return false;
    const rolesToCheck = Array.isArray(roles) ? roles : [roles];
    return rolesToCheck.some(role => user.roles?.includes(role));
  }, [user]);

  // Check if user has any of the specified permissions
  const hasPermission = useCallback((permissions: string | string[]) => {
    if (!user?.permissions) return false;
    const permissionsToCheck = Array.isArray(permissions) ? permissions : [permissions];
    return permissionsToCheck.some(permission => user.permissions?.includes(permission));
  }, [user]);

  // Check if user is any type of admin
  const isAdmin = useCallback(() => {
    return hasRole(['SUPER_ADMIN', 'LEAGUE_OWNER', 'LEAGUE_ADMIN']);
  }, [hasRole]);

  // Check if user is a super admin
  const isSuperAdmin = useCallback(() => {
    return hasRole('SUPER_ADMIN');
  }, [hasRole]);

  // Check if user is a league owner
  const isLeagueOwner = useCallback(() => {
    return hasRole('LEAGUE_OWNER');
  }, [hasRole]);

  // Check if user is a league admin
  const isLeagueAdmin = useCallback(() => {
    return hasRole('LEAGUE_ADMIN');
  }, [hasRole]);

  // Require authentication - redirects to login if not authenticated
  const requireAuth = useCallback(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
      return false;
    }
    return isAuthenticated;
  }, [isLoading, isAuthenticated, router]);

  // Require specific role - redirects to unauthorized if missing
  const requireRole = useCallback((roles: string | string[]) => {
    if (!requireAuth()) return false;
    
    if (!hasRole(roles)) {
      router.push('/unauthorized');
      return false;
    }
    return true;
  }, [requireAuth, hasRole, router]);

  // Require admin access
  const requireAdmin = useCallback(() => {
    if (!requireAuth()) return false;
    
    if (!isAdmin()) {
      router.push('/unauthorized');
      return false;
    }
    return true;
  }, [requireAuth, isAdmin, router]);

  return {
    user,
    session,
    status,
    isLoading,
    isAuthenticated,
    hasRole,
    hasPermission,
    isAdmin,
    isSuperAdmin,
    isLeagueOwner,
    isLeagueAdmin,
    requireAuth,
    requireRole,
    requireAdmin,
    updateSession: update,
  };
}