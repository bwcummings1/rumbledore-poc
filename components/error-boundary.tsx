'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  showDetails: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  isolate?: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null;
  private resetKeys: Array<string | number>;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false,
      showDetails: false 
    };
    this.resetKeys = props.resetKeys || [];
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { 
      hasError: true, 
      error,
      showDetails: false 
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by boundary:', error, errorInfo);
    }

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Update state with error info
    this.setState({ errorInfo });

    // Send to error tracking service if available
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, {
        contexts: { 
          react: { 
            componentStack: errorInfo.componentStack 
          } 
        },
      });
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    
    // Reset error boundary when resetKeys change
    if (hasError && resetOnPropsChange && resetKeys) {
      const hasResetKeyChanged = resetKeys.some(
        (key, idx) => key !== this.resetKeys[idx]
      );
      
      if (hasResetKeyChanged) {
        this.resetErrorBoundary();
        this.resetKeys = [...resetKeys];
      }
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
    
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      showDetails: false 
    });
  };

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      return (
        <ErrorFallback 
          error={this.state.error} 
          errorInfo={this.state.errorInfo}
          resetErrorBoundary={this.resetErrorBoundary}
          showDetails={this.state.showDetails}
          toggleDetails={this.toggleDetails}
          isolate={this.props.isolate}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error?: Error;
  errorInfo?: React.ErrorInfo;
  resetErrorBoundary: () => void;
  showDetails: boolean;
  toggleDetails: () => void;
  isolate?: boolean;
}

export function ErrorFallback({ 
  error, 
  errorInfo,
  resetErrorBoundary,
  showDetails,
  toggleDetails,
  isolate = false
}: ErrorFallbackProps) {
  const router = useRouter();

  const containerClass = isolate 
    ? "p-4" 
    : "min-h-[400px] flex items-center justify-center p-4";

  return (
    <div className={containerClass}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Something went wrong</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            We encountered an unexpected error. The issue has been logged and we'll look into it.
          </p>
          
          {/* Error details for development */}
          {process.env.NODE_ENV === 'development' && error && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleDetails}
                className="w-full justify-between"
              >
                <span>Error Details</span>
                {showDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              
              {showDetails && (
                <div className="rounded-lg bg-muted p-3 space-y-2">
                  <div>
                    <p className="text-xs font-semibold">Message:</p>
                    <p className="text-xs font-mono">{error.message}</p>
                  </div>
                  {error.stack && (
                    <div>
                      <p className="text-xs font-semibold">Stack:</p>
                      <pre className="text-xs font-mono overflow-x-auto">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  {errorInfo?.componentStack && (
                    <div>
                      <p className="text-xs font-semibold">Component Stack:</p>
                      <pre className="text-xs font-mono overflow-x-auto">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={resetErrorBoundary}
              className="flex-1"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            {!isolate && (
              <Button 
                onClick={() => router.push('/')}
                className="flex-1"
              >
                <Home className="h-4 w-4 mr-2" />
                Go home
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// HOC to wrap components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WithErrorBoundaryComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundaryComponent.displayName = 
    `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

  return WithErrorBoundaryComponent;
}

// Hook to trigger error boundary from within components
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return setError;
}

// Component-level error boundary for isolated error handling
export function IsolatedErrorBoundary({ 
  children,
  fallbackMessage = "This component encountered an error"
}: { 
  children: React.ReactNode;
  fallbackMessage?: string;
}) {
  return (
    <ErrorBoundary
      isolate
      fallback={
        <Card className="p-4 bg-muted">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span>{fallbackMessage}</span>
          </div>
        </Card>
      }
    >
      {children}
    </ErrorBoundary>
  );
}