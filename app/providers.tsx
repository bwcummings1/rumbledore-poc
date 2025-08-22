'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from '@/components/theme-provider';
import { WebSocketProvider } from '@/providers/websocket-provider';
import { LeagueProvider } from '@/contexts/league-context';
import { useState } from 'react';
import { Toaster } from '@/components/ui/sonner';

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
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
    <SessionProvider session={session}>
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
              <ReactQueryDevtools initialIsOpen={false} />
            </WebSocketProvider>
          </LeagueProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}