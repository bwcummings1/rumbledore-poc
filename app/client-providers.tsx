'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { WebSocketProvider } from '@/providers/websocket-provider';
import { LeagueProvider } from '@/contexts/league-context';
import { Toaster } from '@/components/ui/sonner';
import { useState } from 'react';

// Create a mock session for development with stable expiry date
// Always use mock session for now to bypass authentication
const mockSession = {
  user: {
    id: '8a4bfba9-0c6d-47cb-8005-5754b663b425',
    email: 'test@example.com',
    name: 'Test User',
    roles: ['MEMBER'],
    permissions: ['VIEW_LEAGUES']
  },
  expires: '2026-01-01T00:00:00.000Z' // Fixed date to avoid hydration mismatch
};

export function ClientProviders({ 
  children 
}: { 
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
    <SessionProvider 
      session={mockSession}
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider 
          attribute="class" 
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <LeagueProvider>
            <WebSocketProvider>
              {children}
              <Toaster position="top-right" />
            </WebSocketProvider>
          </LeagueProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}