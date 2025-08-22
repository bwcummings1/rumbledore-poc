'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  position?: 'top' | 'bottom';
  showReconnectButton?: boolean;
  autoHide?: boolean;
  autoHideDelay?: number;
}

export function OfflineIndicator({ 
  position = 'top',
  showReconnectButton = true,
  autoHide = true,
  autoHideDelay = 3000
}: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsRetrying(false);
      setShowReconnected(true);
      
      if (autoHide) {
        setTimeout(() => setShowReconnected(false), autoHideDelay);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    // Set initial state
    setIsOnline(navigator.onLine);

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic connectivity check
    const intervalId = setInterval(() => {
      fetch('/api/health', { method: 'HEAD' })
        .then(() => {
          if (!isOnline) handleOnline();
        })
        .catch(() => {
          if (isOnline) handleOffline();
        });
    }, 30000); // Check every 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, [isOnline, autoHide, autoHideDelay]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetch('/api/health', { method: 'HEAD' });
      handleOnline();
    } catch {
      // Still offline
      setIsRetrying(false);
    }
  };

  const handleOnline = () => {
    setIsOnline(true);
    setIsRetrying(false);
    setShowReconnected(true);
    
    if (autoHide) {
      setTimeout(() => setShowReconnected(false), autoHideDelay);
    }
  };

  const handleOffline = () => {
    setIsOnline(false);
    setShowReconnected(false);
  };

  const positionClasses = {
    top: 'top-0',
    bottom: 'bottom-0'
  };

  return (
    <>
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: position === 'top' ? -100 : 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: position === 'top' ? -100 : 100, opacity: 0 }}
            className={cn(
              "fixed left-0 right-0 z-50",
              positionClasses[position]
            )}
          >
            <Alert 
              variant="destructive" 
              className="rounded-none border-x-0 border-t-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4" />
                  <AlertDescription>
                    You're offline. Some features may be unavailable.
                  </AlertDescription>
                </div>
                {showReconnectButton && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    disabled={isRetrying}
                    className="ml-4"
                  >
                    {isRetrying ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </>
                    )}
                  </Button>
                )}
              </div>
            </Alert>
          </motion.div>
        )}

        {showReconnected && (
          <motion.div
            initial={{ y: position === 'top' ? -100 : 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: position === 'top' ? -100 : 100, opacity: 0 }}
            className={cn(
              "fixed left-0 right-0 z-50",
              positionClasses[position]
            )}
          >
            <Alert className="rounded-none border-x-0 border-t-0 bg-green-500 text-white border-green-500">
              <div className="flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                <AlertDescription className="text-white">
                  Connection restored!
                </AlertDescription>
              </div>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Simplified offline detector for specific components
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleStatusChange = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);

    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  return isOnline;
}

// Component wrapper that shows placeholder when offline
export function OfflineAware({ 
  children,
  fallback,
  showIndicator = true
}: { 
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showIndicator?: boolean;
}) {
  const isOnline = useOnlineStatus();

  if (!isOnline) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <WifiOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-semibold mb-2">You're offline</h3>
        <p className="text-sm text-muted-foreground">
          This content requires an internet connection
        </p>
      </div>
    );
  }

  return (
    <>
      {showIndicator && <OfflineIndicator />}
      {children}
    </>
  );
}

// Mobile-specific offline banner
export function MobileOfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="lg:hidden fixed bottom-16 left-0 right-0 z-40 bg-destructive text-destructive-foreground p-2">
      <div className="flex items-center justify-center gap-2 text-sm">
        <WifiOff className="h-4 w-4" />
        <span>No internet connection</span>
      </div>
    </div>
  );
}