# Sprint 17: Foundation & Infrastructure

## Sprint Overview
**Phase**: 6 - Frontend Integration  
**Sprint**: 1 of 4  
**Duration**: 2 weeks  
**Focus**: Establish frontend infrastructure with authentication, API client, data providers, and core integrations  
**Risk Level**: Low - Well-established patterns

## Objectives
1. Implement NextAuth session provider and authentication flow
2. Create type-safe API client with error handling
3. Set up React Query for server state management
4. Establish WebSocket provider for real-time updates
5. Build login/signup forms using existing UI components
6. Create user session management and navigation

## Prerequisites
- Backend APIs operational (✅ Complete)
- Database with test users (✅ Complete)
- NextAuth configuration ready (✅ Complete)
- WebSocket server running (✅ Complete)

## Technical Tasks

### Task 1: Authentication Provider Setup (Day 1-2)

#### 1.1 Create Root Providers Component
```typescript
// app/providers.tsx
'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from '@/components/theme-provider';
import { WebSocketProvider } from '@/providers/websocket-provider';
import { useState } from 'react';

export function Providers({ 
  children,
  session 
}: { 
  children: React.ReactNode;
  session?: any;
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        cacheTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark">
          <WebSocketProvider>
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
          </WebSocketProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

#### 1.2 Update Root Layout
```typescript
// app/layout.tsx
import { Providers } from './providers';
import { auth } from '@/lib/auth';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers session={session}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

### Task 2: API Client Implementation (Day 3-4)

#### 2.1 Create Type-Safe API Client
```typescript
// lib/api/client.ts
import axios, { AxiosError, AxiosInstance } from 'axios';
import { getSession } from 'next-auth/react';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for auth
    this.client.interceptors.request.use(
      async (config) => {
        const session = await getSession();
        if (session?.accessToken) {
          config.headers.Authorization = `Bearer ${session.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Handle token refresh or redirect to login
          window.location.href = '/auth/login';
        }
        return Promise.reject(this.formatError(error));
      }
    );
  }

  private formatError(error: AxiosError): ApiError {
    return {
      message: error.response?.data?.message || error.message,
      code: error.response?.status || 500,
      details: error.response?.data,
    };
  }

  // League endpoints
  leagues = {
    list: () => this.client.get('/leagues'),
    get: (id: string) => this.client.get(`/leagues/${id}`),
    sync: (id: string) => this.client.post(`/leagues/${id}/sync`),
    standings: (id: string) => this.client.get(`/leagues/${id}/standings`),
    roster: (id: string, teamId: string) => 
      this.client.get(`/leagues/${id}/teams/${teamId}/roster`),
    matchups: (id: string, week?: number) => 
      this.client.get(`/leagues/${id}/matchups`, { params: { week } }),
  };

  // Betting endpoints
  betting = {
    bankroll: (leagueId: string) => 
      this.client.get('/betting/bankroll', { params: { leagueId } }),
    placeBet: (data: BetPayload) => 
      this.client.post('/betting/bets', data),
    activeBets: (leagueId: string) => 
      this.client.get('/betting/bets', { params: { leagueId, status: 'PENDING' } }),
    history: (leagueId: string) => 
      this.client.get('/betting/bets/history', { params: { leagueId } }),
  };

  // Statistics endpoints
  stats = {
    league: (leagueId: string) => 
      this.client.get(`/statistics`, { params: { leagueId } }),
    h2h: (leagueId: string, team1: string, team2: string) => 
      this.client.get('/statistics/h2h', { params: { leagueId, team1, team2 } }),
  };

  // AI endpoints
  ai = {
    chat: (message: string, agentType: string, leagueId?: string) => 
      this.client.post('/ai/chat', { message, agentType, leagueId }),
    agents: () => this.client.get('/ai/agents'),
  };
}

export const apiClient = new ApiClient();
```

### Task 3: React Query Hooks (Day 5-6)

#### 3.1 Create Data Hooks
```typescript
// hooks/api/use-leagues.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export function useLeagues() {
  return useQuery({
    queryKey: ['leagues'],
    queryFn: async () => {
      const { data } = await apiClient.leagues.list();
      return data;
    },
  });
}

export function useLeague(leagueId: string) {
  return useQuery({
    queryKey: ['leagues', leagueId],
    queryFn: async () => {
      const { data } = await apiClient.leagues.get(leagueId);
      return data;
    },
    enabled: !!leagueId,
  });
}

export function useStandings(leagueId: string) {
  return useQuery({
    queryKey: ['leagues', leagueId, 'standings'],
    queryFn: async () => {
      const { data } = await apiClient.leagues.standings(leagueId);
      return data;
    },
    enabled: !!leagueId,
    refetchInterval: 60000, // Refetch every minute
  });
}

export function useSyncLeague() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (leagueId: string) => apiClient.leagues.sync(leagueId),
    onSuccess: (_, leagueId) => {
      // Invalidate league data after sync
      queryClient.invalidateQueries(['leagues', leagueId]);
    },
  });
}
```

### Task 4: WebSocket Provider (Day 7-8)

#### 4.1 Create WebSocket Provider
```typescript
// providers/websocket-provider.tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

interface WebSocketContextType {
  socket: Socket | null;
  connected: boolean;
  subscribe: (event: string, handler: Function) => void;
  unsubscribe: (event: string, handler: Function) => void;
  emit: (event: string, data: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  socket: null,
  connected: false,
  subscribe: () => {},
  unsubscribe: () => {},
  emit: () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;

    const newSocket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
      auth: {
        token: session.accessToken,
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      setConnected(true);
      console.log('WebSocket connected');
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('WebSocket disconnected');
    });

    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
      toast.error('Connection error. Retrying...');
    });

    // Global event handlers
    newSocket.on('notification', (data) => {
      toast(data.message, { 
        description: data.description,
        duration: 5000,
      });
    });

    newSocket.on('score-update', (data) => {
      // Handle live score updates
      console.log('Score update:', data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [session]);

  const subscribe = (event: string, handler: Function) => {
    socket?.on(event, handler);
  };

  const unsubscribe = (event: string, handler: Function) => {
    socket?.off(event, handler);
  };

  const emit = (event: string, data: any) => {
    socket?.emit(event, data);
  };

  return (
    <WebSocketContext.Provider value={{ socket, connected, subscribe, unsubscribe, emit }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => useContext(WebSocketContext);
```

### Task 5: Authentication Forms (Day 9-10)

#### 5.1 Create Login Form
```typescript
// app/(auth)/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
          <CardDescription>
            Enter your credentials to access your leagues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input 
                        type="email" 
                        placeholder="john@example.com" 
                        {...field} 
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-4 text-center text-sm">
            Don't have an account?{' '}
            <Link href="/auth/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

#### 5.2 Create User Menu Component
```typescript
// components/layout/user-menu.tsx
'use client';

import { useSession, signOut } from 'next-auth/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { User, Settings, LogOut, Trophy, BarChart3 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function UserMenu() {
  const { data: session } = useSession();
  const router = useRouter();

  if (!session?.user) return null;

  const initials = session.user.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarImage src={session.user.image || ''} alt={session.user.name || ''} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{session.user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {session.user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/leagues')}>
          <Trophy className="mr-2 h-4 w-4" />
          My Leagues
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/stats')}>
          <BarChart3 className="mr-2 h-4 w-4" />
          Statistics
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/wizkit')}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          className="text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Task 6: Protected Routes & Middleware (Day 11-12)

#### 6.1 Create Auth Middleware
```typescript
// middleware.ts
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // Add custom middleware logic here if needed
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Public routes that don't require auth
        const publicPaths = ['/auth/login', '/auth/signup', '/auth/forgot-password'];
        const isPublicPath = publicPaths.some(path => req.nextUrl.pathname.startsWith(path));
        
        if (isPublicPath) {
          return true;
        }
        
        // All other routes require authentication
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    // Match all routes except static files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

## Testing Requirements

### Unit Tests
```typescript
// __tests__/api/client.test.ts
describe('API Client', () => {
  it('should add auth header to requests');
  it('should handle 401 errors');
  it('should format errors correctly');
});

// __tests__/hooks/use-leagues.test.ts
describe('useLeagues Hook', () => {
  it('should fetch leagues data');
  it('should handle loading state');
  it('should handle error state');
});
```

### Integration Tests
```typescript
// __tests__/auth/login.test.tsx
describe('Login Flow', () => {
  it('should validate form inputs');
  it('should handle successful login');
  it('should display error on invalid credentials');
  it('should redirect after login');
});
```

## Dependencies to Install
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-query-devtools": "^5.0.0",
    "next-auth": "^4.24.0",
    "axios": "^1.6.0",
    "socket.io-client": "^4.6.0",
    "react-hook-form": "^7.48.0",
    "@hookform/resolvers": "^3.3.0",
    "zod": "^3.22.0",
    "sonner": "^1.2.0"
  }
}
```

## Success Criteria
- [ ] Users can log in and log out
- [ ] Session persists across page refreshes
- [ ] API client properly authenticates requests
- [ ] WebSocket connects with authentication
- [ ] React Query caches and manages server state
- [ ] Protected routes redirect to login
- [ ] User menu shows session info
- [ ] Loading states display during async operations
- [ ] Error messages display appropriately
- [ ] Mobile responsive authentication forms

## Performance Targets
- Login response time: < 1 second
- Session check: < 100ms
- API call response: < 500ms
- WebSocket connection: < 2 seconds
- Page load with auth: < 2 seconds

## Next Sprint Preview
Sprint 18 will focus on building core league features:
- League dashboard with switcher
- Standings table component
- Roster display
- Matchup viewer
- Team and player pages

---

*Sprint 17 establishes the critical infrastructure that enables all subsequent frontend development.*