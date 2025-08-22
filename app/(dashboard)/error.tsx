'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Oops! Something went wrong</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            We encountered an error while loading this page. This could be a temporary issue,
            please try refreshing the page or return to the homepage.
          </p>

          {process.env.NODE_ENV === 'development' && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs font-semibold mb-1">Error details:</p>
              <p className="text-xs font-mono">{error.message}</p>
              {error.digest && (
                <p className="text-xs text-muted-foreground mt-1">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={reset}
              className="flex-1"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            <Button 
              onClick={() => router.push('/')}
              className="flex-1"
            >
              <Home className="h-4 w-4 mr-2" />
              Go home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}