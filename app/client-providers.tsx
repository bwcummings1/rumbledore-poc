'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { WebSocketProvider } from '@/providers/websocket-provider';
import { LeagueProvider } from '@/contexts/league-context';
import { Toaster } from '@/components/ui/sonner';
import { useState } from 'react';

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
    <SessionProvider>
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