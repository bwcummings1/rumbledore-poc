'use client';

import { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  threshold?: number;
  className?: string;
  disabled?: boolean;
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  leftAction,
  rightAction,
  threshold = 100,
  className,
  disabled = false,
}: SwipeableCardProps) {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  // Opacity transforms for action indicators
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

  // Background color transform based on swipe direction
  const backgroundColor = useTransform(
    x,
    [-threshold, 0, threshold],
    ['rgba(239, 68, 68, 0.1)', 'transparent', 'rgba(34, 197, 94, 0.1)']
  );

  const handleDragEnd = (_: any, info: PanInfo) => {
    const { offset, velocity } = info;
    
    // Check for swipe with velocity consideration
    const swipeThreshold = threshold / 2;
    const swipeVelocity = 500;
    
    // Horizontal swipes
    if (Math.abs(offset.x) > swipeThreshold || Math.abs(velocity.x) > swipeVelocity) {
      if (offset.x < -swipeThreshold && onSwipeLeft) {
        onSwipeLeft();
      } else if (offset.x > swipeThreshold && onSwipeRight) {
        onSwipeRight();
      }
    }
    
    // Vertical swipes
    if (Math.abs(offset.y) > swipeThreshold || Math.abs(velocity.y) > swipeVelocity) {
      if (offset.y < -swipeThreshold && onSwipeUp) {
        onSwipeUp();
      } else if (offset.y > swipeThreshold && onSwipeDown) {
        onSwipeDown();
      }
    }
    
    setIsDragging(false);
  };

  if (disabled) {
    return (
      <Card className={className}>
        {children}
      </Card>
    );
  }

  return (
    <div className="relative overflow-hidden" ref={constraintsRef}>
      {/* Background with color change on swipe */}
      <motion.div
        style={{ backgroundColor }}
        className="absolute inset-0 pointer-events-none"
      />

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
        drag={!disabled}
        dragConstraints={constraintsRef}
        dragElastic={0.2}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        style={{ x, y }}
        animate={{ 
          x: isDragging ? x.get() : 0,
          y: isDragging ? y.get() : 0 
        }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "relative z-10 touch-pan-y",
          isDragging && "cursor-grabbing"
        )}
      >
        <Card className={cn("bg-background", className)}>
          {children}
        </Card>
      </motion.div>
    </div>
  );
}

// Preset swipeable cards for common use cases
export function SwipeableListItem({
  children,
  onDelete,
  onArchive,
  onEdit,
  className,
}: {
  children: React.ReactNode;
  onDelete?: () => void;
  onArchive?: () => void;
  onEdit?: () => void;
  className?: string;
}) {
  return (
    <SwipeableCard
      onSwipeLeft={onDelete}
      onSwipeRight={onArchive}
      leftAction={
        <div className="flex items-center gap-2 text-destructive">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 6a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zM6 8a1 1 0 00-1 1v6a2 2 0 002 2h6a2 2 0 002-2V9a1 1 0 00-1-1H6zm1 2h2v4H7v-4zm4 0h2v4h-2v-4z"/>
          </svg>
          <span className="font-medium">Delete</span>
        </div>
      }
      rightAction={
        onArchive ? (
          <div className="flex items-center gap-2 text-green-500">
            <span className="font-medium">Archive</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm5 6a1 1 0 011-1h0a1 1 0 011 1v2a1 1 0 01-1 1h0a1 1 0 01-1-1v-2z"/>
            </svg>
          </div>
        ) : onEdit ? (
          <div className="flex items-center gap-2 text-blue-500">
            <span className="font-medium">Edit</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-9.192 9.192a1 1 0 01-.455.253l-3 1a1 1 0 01-1.265-1.265l1-3a1 1 0 01.253-.455l9.192-9.192z"/>
            </svg>
          </div>
        ) : null
      }
      className={className}
    >
      {children}
    </SwipeableCard>
  );
}