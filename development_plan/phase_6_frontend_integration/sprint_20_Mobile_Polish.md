# Sprint 20: Mobile Optimization & Polish

## Sprint Overview
**Phase**: 6 - Frontend Integration  
**Sprint**: 4 of 4  
**Duration**: 2 weeks  
**Focus**: Mobile-first optimization, responsive design, loading states, error handling, and final polish  
**Risk Level**: Low - UI/UX refinements

## Objectives
1. Implement mobile navigation with bottom tabs
2. Create responsive table designs
3. Add touch-friendly interactions
4. Implement comprehensive loading states
5. Add error boundaries and fallbacks
6. Optimize performance and bundle size

## Prerequisites
- Sprint 17-19 complete (All features integrated) ✅
- All components connected to real data ✅
- WebSocket communication working ✅
- Base UI components available ✅

## Technical Tasks

### Task 1: Mobile Navigation Implementation (Day 1-2)

#### 1.1 Create Mobile Bottom Navigation
```typescript
// components/navigation/mobile-nav.tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, Trophy, DollarSign, BarChart3, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/hooks/use-notifications';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home, path: '/' },
  { id: 'leagues', label: 'Leagues', icon: Trophy, path: '/leagues' },
  { id: 'rumble', label: 'Rumble', icon: DollarSign, path: '/rumble' },
  { id: 'stats', label: 'Stats', icon: BarChart3, path: '/stats' },
  { id: 'more', label: 'More', icon: Menu, path: '#' },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const [showMore, setShowMore] = useState(false);

  const handleNavClick = (item: typeof NAV_ITEMS[0]) => {
    if (item.id === 'more') {
      setShowMore(!showMore);
    } else {
      router.push(item.path);
    }
  };

  return (
    <>
      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t">
          <nav className="flex items-center justify-around h-16">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.path || 
                (item.path !== '/' && pathname.startsWith(item.path));
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 h-full relative",
                    "transition-colors duration-200",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <div className="relative">
                    <Icon className={cn(
                      "h-5 w-5 transition-transform",
                      isActive && "scale-110"
                    )} />
                    {item.id === 'more' && unreadCount > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] mt-1 transition-opacity",
                    isActive ? "opacity-100" : "opacity-70"
                  )}>
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute top-0 left-2 right-2 h-0.5 bg-primary"
                      initial={false}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* More Menu Sheet */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              className="fixed bottom-16 left-0 right-0 z-50 bg-background border-t lg:hidden"
            >
              <div className="p-4 space-y-2">
                <NavLink href="/news" icon="📰" label="Fantasy News" />
                <NavLink href="/wizkit" icon="⚙️" label="Settings" />
                <NavLink href="/profile" icon="👤" label="Profile" />
                <NavLink href="/help" icon="❓" label="Help & Support" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  const router = useRouter();
  
  return (
    <button
      onClick={() => router.push(href)}
      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent transition-colors"
    >
      <span className="text-xl">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
```

#### 1.2 Create Mobile Layout Wrapper
```typescript
// app/(dashboard)/layout.tsx
import { MobileNav } from '@/components/navigation/mobile-nav';
import { DesktopSidebar } from '@/components/dashboard/sidebar';
import { MobileHeader } from '@/components/navigation/mobile-header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <DesktopSidebar />
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden">
        <MobileHeader />
      </div>

      {/* Main Content */}
      <main className={cn(
        "flex-1 transition-all duration-200",
        "lg:pl-72", // Desktop: account for sidebar
        "pb-16 lg:pb-0" // Mobile: account for bottom nav
      )}>
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
}
```

### Task 2: Responsive Table Designs (Day 3-4)

#### 2.1 Create Responsive Table Component
```typescript
// components/ui/responsive-table.tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';

interface ResponsiveTableProps {
  columns: {
    key: string;
    label: string;
    priority?: number; // 1 = always show, 2 = tablet+, 3 = desktop
    align?: 'left' | 'center' | 'right';
    render?: (value: any, row: any) => React.ReactNode;
  }[];
  data: any[];
  mobileCard?: (row: any) => React.ReactNode;
  onRowClick?: (row: any) => void;
}

export function ResponsiveTable({
  columns,
  data,
  mobileCard,
  onRowClick,
}: ResponsiveTableProps) {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const visibleColumns = columns.filter(col => {
    if (isMobile) return col.priority === 1;
    if (isTablet) return col.priority && col.priority <= 2;
    return true;
  });

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Mobile card view
  if (isMobile && mobileCard) {
    return (
      <div className="space-y-2">
        {data.map((row, index) => (
          <Card 
            key={row.id || index}
            className={cn(
              "p-4 transition-colors",
              onRowClick && "cursor-pointer hover:bg-accent"
            )}
            onClick={() => onRowClick?.(row)}
          >
            {mobileCard(row)}
          </Card>
        ))}
      </div>
    );
  }

  // Responsive table view
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            {visibleColumns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 font-medium text-sm",
                  col.align === 'center' && "text-center",
                  col.align === 'right' && "text-right",
                  col.align === 'left' && "text-left"
                )}
              >
                {col.label}
              </th>
            ))}
            {isMobile && <th className="w-10"></th>}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const isExpanded = expandedRows.has(row.id || rowIndex.toString());
            const hiddenColumns = columns.filter(col => !visibleColumns.includes(col));

            return (
              <React.Fragment key={row.id || rowIndex}>
                <tr 
                  className={cn(
                    "border-b transition-colors",
                    onRowClick && "cursor-pointer hover:bg-accent",
                    isExpanded && "bg-accent/50"
                  )}
                  onClick={() => !isMobile && onRowClick?.(row)}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-sm",
                        col.align === 'center' && "text-center",
                        col.align === 'right' && "text-right"
                      )}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                  {isMobile && hiddenColumns.length > 0 && (
                    <td className="px-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(row.id || rowIndex.toString());
                        }}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </td>
                  )}
                </tr>
                {isMobile && isExpanded && hiddenColumns.length > 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="px-4 py-3 bg-accent/30">
                      <div className="space-y-2">
                        {hiddenColumns.map((col) => (
                          <div key={col.key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{col.label}:</span>
                            <span className="font-medium">
                              {col.render ? col.render(row[col.key], row) : row[col.key]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

### Task 3: Touch-Friendly Interactions (Day 5-6)

#### 3.1 Create Swipeable Components
```typescript
// components/ui/swipeable-card.tsx
'use client';

import { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  threshold?: number;
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  threshold = 100,
}: SwipeableCardProps) {
  const constraintsRef = useRef(null);
  const x = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  const leftActionOpacity = useTransform(
    x,
    [-threshold, 0],
    [1, 0]
  );

  const rightActionOpacity = useTransform(
    x,
    [0, threshold],
    [0, 1]
  );

  const handleDragEnd = () => {
    const currentX = x.get();
    
    if (currentX <= -threshold && onSwipeLeft) {
      onSwipeLeft();
    } else if (currentX >= threshold && onSwipeRight) {
      onSwipeRight();
    }
    
    setIsDragging(false);
  };

  return (
    <div className="relative overflow-hidden" ref={constraintsRef}>
      {/* Left Action Background */}
      {leftAction && (
        <motion.div
          style={{ opacity: leftActionOpacity }}
          className="absolute inset-y-0 left-0 flex items-center px-4 pointer-events-none"
        >
          {leftAction}
        </motion.div>
      )}

      {/* Right Action Background */}
      {rightAction && (
        <motion.div
          style={{ opacity: rightActionOpacity }}
          className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none"
        >
          {rightAction}
        </motion.div>
      )}

      {/* Swipeable Card */}
      <motion.div
        drag="x"
        dragConstraints={constraintsRef}
        dragElastic={0.2}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        style={{ x }}
        animate={{ x: isDragging ? x.get() : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn(
          "relative z-10",
          isDragging && "cursor-grabbing"
        )}
      >
        <Card className="bg-background">
          {children}
        </Card>
      </motion.div>
    </div>
  );
}
```

#### 3.2 Create Touch-Friendly Buttons
```typescript
// components/ui/touch-button.tsx
'use client';

import { forwardRef } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TouchButtonProps extends ButtonProps {
  haptic?: boolean;
}

export const TouchButton = forwardRef<HTMLButtonElement, TouchButtonProps>(
  ({ className, children, haptic = true, ...props }, ref) => {
    const handleTap = () => {
      if (haptic && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
    };

    return (
      <motion.div
        whileTap={{ scale: 0.95 }}
        onTap={handleTap}
      >
        <Button
          ref={ref}
          className={cn(
            "touch-manipulation", // Improves touch responsiveness
            "min-h-[44px]", // iOS touch target size
            className
          )}
          {...props}
        >
          {children}
        </Button>
      </motion.div>
    );
  }
);

TouchButton.displayName = 'TouchButton';
```

### Task 4: Loading States & Skeletons (Day 7-8)

#### 4.1 Create Loading Components
```typescript
// components/ui/loading-states.tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 p-3 border-b">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-3">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton 
              key={colIndex} 
              className={cn(
                "h-4",
                colIndex === 0 ? "w-32" : "flex-1"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-20" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>

      {/* Main Content */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <TableSkeleton rows={6} columns={3} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function LoadingSpinner({ size = 'md' }) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div className="flex items-center justify-center">
      <div className={cn(
        "animate-spin rounded-full border-primary border-t-transparent",
        sizeClasses[size]
      )} />
    </div>
  );
}
```

### Task 5: Error Boundaries & Fallbacks (Day 9-10)

#### 5.1 Create Error Boundary Component
```typescript
// components/error-boundary.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Send to error tracking service
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: { react: { componentStack: errorInfo.componentStack } },
      });
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

export function ErrorFallback({ error }: { error?: Error }) {
  const router = useRouter();

  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
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
          
          {process.env.NODE_ENV === 'development' && error && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs font-mono">{error.message}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
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

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  return function WithErrorBoundaryComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
```

#### 5.2 Create Offline Fallback
```typescript
// components/offline-indicator.tsx
'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    // Set initial state
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-50"
        >
          <Alert variant="destructive" className="rounded-none">
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You're offline. Some features may be unavailable.
            </AlertDescription>
          </Alert>
        </motion.div>
      )}

      {showReconnected && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-50"
        >
          <Alert className="rounded-none bg-green-500 text-white border-green-500">
            <Wifi className="h-4 w-4" />
            <AlertDescription>
              Connection restored!
            </AlertDescription>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### Task 6: Performance Optimization (Day 11-12)

#### 6.1 Implement Code Splitting
```typescript
// app/(dashboard)/leagues/[leagueId]/page.tsx
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { DashboardSkeleton } from '@/components/ui/loading-states';

// Lazy load heavy components
const StatsDashboard = dynamic(
  () => import('@/components/statistics/stats-dashboard'),
  { 
    loading: () => <DashboardSkeleton />,
    ssr: false // Disable SSR for client-only features
  }
);

const BettingDashboard = dynamic(
  () => import('@/components/betting/betting-dashboard'),
  { loading: () => <DashboardSkeleton /> }
);

// Use React.lazy for smaller components
const ChartComponent = lazy(() => import('@/components/charts/league-chart'));

export default function LeaguePage() {
  return (
    <div>
      {/* Critical content loads immediately */}
      <LeagueHeader />
      
      {/* Heavy components load on demand */}
      <Suspense fallback={<DashboardSkeleton />}>
        <Tabs>
          <TabsContent value="stats">
            <StatsDashboard />
          </TabsContent>
          <TabsContent value="betting">
            <BettingDashboard />
          </TabsContent>
          <TabsContent value="charts">
            <ChartComponent />
          </TabsContent>
        </Tabs>
      </Suspense>
    </div>
  );
}
```

#### 6.2 Create Performance Monitoring Hook
```typescript
// hooks/use-performance.ts
import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export function usePerformanceMonitoring() {
  const router = useRouter();

  const reportWebVitals = useCallback((metric: any) => {
    // Send to analytics
    if (window.gtag) {
      window.gtag('event', metric.name, {
        value: Math.round(metric.value),
        event_label: metric.id,
        non_interaction: true,
      });
    }

    // Log poor performance
    const thresholds = {
      FCP: 2000,
      LCP: 2500,
      FID: 100,
      CLS: 0.1,
      TTFB: 600,
    };

    if (metric.value > thresholds[metric.name as keyof typeof thresholds]) {
      console.warn(`Poor ${metric.name} performance:`, metric.value);
    }
  }, []);

  useEffect(() => {
    // Measure page load time
    if (typeof window !== 'undefined' && window.performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      if (navigation) {
        const pageLoadTime = navigation.loadEventEnd - navigation.fetchStart;
        console.log(`Page load time: ${pageLoadTime}ms`);
      }
    }

    // Report Web Vitals
    if ('web-vitals' in window) {
      import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
        getCLS(reportWebVitals);
        getFID(reportWebVitals);
        getFCP(reportWebVitals);
        getLCP(reportWebVitals);
        getTTFB(reportWebVitals);
      });
    }
  }, [reportWebVitals]);

  // Track route changes
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      if (window.gtag) {
        window.gtag('config', process.env.NEXT_PUBLIC_GA_ID, {
          page_path: url,
        });
      }
    };

    router.events?.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events?.off('routeChangeComplete', handleRouteChange);
    };
  }, [router]);
}
```

## Testing Requirements

### Mobile Testing
```typescript
// __tests__/mobile/navigation.test.tsx
describe('Mobile Navigation', () => {
  it('should show bottom nav on mobile');
  it('should hide sidebar on mobile');
  it('should handle tab switches');
  it('should show more menu');
});

// __tests__/mobile/responsive-tables.test.tsx
describe('Responsive Tables', () => {
  it('should show card view on mobile');
  it('should hide low-priority columns');
  it('should expand/collapse rows');
});
```

### Performance Tests
```typescript
// __tests__/performance/bundle-size.test.ts
describe('Bundle Size', () => {
  it('should keep main bundle under 500KB');
  it('should lazy load heavy components');
  it('should tree-shake unused code');
});
```

### Error Handling Tests
```typescript
// __tests__/error-handling/error-boundary.test.tsx
describe('Error Boundary', () => {
  it('should catch and display errors');
  it('should allow retry');
  it('should log to error service');
});
```

## Success Criteria
- [ ] Mobile navigation working smoothly
- [ ] Tables responsive on all screen sizes
- [ ] Touch interactions feel native
- [ ] Loading states for all async operations
- [ ] Error boundaries catch failures gracefully
- [ ] Offline indicator shows connection status
- [ ] Performance metrics meet targets
- [ ] Bundle size optimized
- [ ] Smooth animations (60fps)
- [ ] Accessibility standards met (WCAG 2.1 AA)

## Performance Targets
- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Time to Interactive: < 3.5s
- Cumulative Layout Shift: < 0.1
- First Input Delay: < 100ms
- Bundle size: < 500KB (main)
- Lighthouse score: > 90

## Deployment Checklist
- [ ] All features tested on real devices
- [ ] Performance metrics validated
- [ ] Error tracking configured
- [ ] Analytics implemented
- [ ] SEO meta tags added
- [ ] PWA manifest created
- [ ] Service worker registered
- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Redis cache warmed

## Final Deliverables
1. Fully responsive web application
2. Mobile-optimized experience
3. Production-ready error handling
4. Performance monitoring
5. Complete test coverage
6. Deployment documentation

---

*Sprint 20 completes the frontend integration with a polished, performant, mobile-first experience ready for production deployment.*