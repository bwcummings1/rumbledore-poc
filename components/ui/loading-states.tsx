'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Table skeleton for loading tables
export function TableSkeleton({ 
  rows = 5, 
  columns = 4,
  className 
}: { 
  rows?: number; 
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
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

// Card skeleton for loading cards
export function CardSkeleton({ 
  showHeader = true,
  lines = 3,
  className 
}: { 
  showHeader?: boolean;
  lines?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </CardHeader>
      )}
      <CardContent className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn(
            "h-4",
            i === lines - 1 ? "w-4/5" : "w-full"
          )} />
        ))}
      </CardContent>
    </Card>
  );
}

// Dashboard skeleton for loading the main dashboard
export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} lines={2} />
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

// List skeleton for loading lists
export function ListSkeleton({ 
  items = 5,
  showAvatar = false,
  className 
}: { 
  items?: number;
  showAvatar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {showAvatar && (
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
          )}
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

// Stat card skeleton
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-12 w-12 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

// Chart skeleton
export function ChartSkeleton({ 
  height = 300,
  className 
}: { 
  height?: number;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)} style={{ height }}>
      <div className="absolute inset-0 flex items-end justify-between gap-1 p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton 
            key={i} 
            className="flex-1" 
            style={{ 
              height: `${Math.random() * 80 + 20}%` 
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Loading spinner component
export function LoadingSpinner({ 
  size = 'md',
  className 
}: { 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className={cn(
        "animate-spin rounded-full border-primary border-t-transparent",
        sizeClasses[size]
      )} />
    </div>
  );
}

// Full page loading state
export function FullPageLoader({ 
  message = "Loading...",
  showSpinner = true 
}: { 
  message?: string;
  showSpinner?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        {showSpinner && <LoadingSpinner size="lg" />}
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

// Pulse animation skeleton for text
export function TextSkeleton({ 
  lines = 1,
  className 
}: { 
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className={cn(
            "h-4",
            i === 0 && "w-3/4",
            i === 1 && "w-full",
            i === 2 && "w-5/6",
            i > 2 && "w-full"
          )}
        />
      ))}
    </div>
  );
}

// Mobile-optimized card skeleton
export function MobileCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-6 w-12" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </Card>
  );
}

// Grid skeleton for loading grids
export function GridSkeleton({ 
  items = 6,
  columns = 3,
  className 
}: { 
  items?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn(
      "grid gap-4",
      columns === 2 && "grid-cols-1 sm:grid-cols-2",
      columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
      className
    )}>
      {Array.from({ length: items }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}