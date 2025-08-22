import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Admin route protection
    if (path.startsWith('/admin')) {
      const isAdmin = token?.roles?.includes('SUPER_ADMIN') || 
                      token?.roles?.includes('LEAGUE_OWNER') ||
                      token?.roles?.includes('LEAGUE_ADMIN');
      
      if (!isAdmin) {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }

    // League-specific route protection
    if (path.match(/^\/leagues\/[\w-]+/)) {
      // Additional checks can be added here for league membership
      // For now, just ensure user is authenticated (handled by withAuth)
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        
        // Public routes that don't require authentication
        const publicPaths = [
          '/login',
          '/signup',
          '/auth/forgot-password',
          '/auth/reset-password',
          '/auth/error',
          '/terms',
          '/privacy',
          '/api/auth',
        ];
        
        // Check if the current path is public
        const isPublicPath = publicPaths.some(publicPath => 
          path.startsWith(publicPath)
        );
        
        // Public paths are always authorized
        if (isPublicPath) {
          return true;
        }
        
        // API routes (except auth) require authentication
        if (path.startsWith('/api') && !path.startsWith('/api/auth')) {
          return !!token;
        }
        
        // All other routes require authentication
        return !!token;
      },
    },
    pages: {
      signIn: '/login',
      error: '/auth/error',
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - opengraph images
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$|.*\\.gif$|.*\\.webp$).*)',
  ],
};