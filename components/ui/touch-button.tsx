'use client';

import { forwardRef } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TouchButtonProps extends ButtonProps {
  haptic?: boolean;
  ripple?: boolean;
  pressScale?: number;
}

export const TouchButton = forwardRef<HTMLButtonElement, TouchButtonProps>(
  ({ 
    className, 
    children, 
    haptic = true, 
    ripple = true,
    pressScale = 0.95,
    disabled,
    onClick,
    ...props 
  }, ref) => {
    const handleTap = () => {
      // Haptic feedback for mobile devices
      if (haptic && !disabled && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      handleTap();
      onClick?.(e);
    };

    return (
      <motion.div
        whileTap={!disabled ? { scale: pressScale } : undefined}
        className="inline-block"
      >
        <Button
          ref={ref}
          className={cn(
            "touch-manipulation", // Improves touch responsiveness on mobile
            "min-h-[44px]", // iOS minimum touch target size
            "relative overflow-hidden", // For ripple effect
            "select-none", // Prevent text selection on long press
            className
          )}
          onClick={handleClick}
          disabled={disabled}
          {...props}
        >
          {/* Ripple effect overlay */}
          {ripple && !disabled && (
            <motion.span
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              whileTap={{ opacity: 0.1 }}
              transition={{ duration: 0.3 }}
              style={{
                background: 'radial-gradient(circle, currentColor 10%, transparent 10%)',
                backgroundSize: '1000% 1000%',
                backgroundPosition: 'center',
              }}
            />
          )}
          
          {/* Button content */}
          <span className="relative z-10">
            {children}
          </span>
        </Button>
      </motion.div>
    );
  }
);

TouchButton.displayName = 'TouchButton';

// Floating Action Button for mobile
interface FloatingActionButtonProps extends TouchButtonProps {
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  offset?: number;
}

export const FloatingActionButton = forwardRef<HTMLButtonElement, FloatingActionButtonProps>(
  ({ 
    position = 'bottom-right',
    offset = 20,
    className,
    children,
    ...props
  }, ref) => {
    const positionClasses = {
      'bottom-right': `bottom-[${offset}px] right-[${offset}px]`,
      'bottom-left': `bottom-[${offset}px] left-[${offset}px]`,
      'bottom-center': `bottom-[${offset}px] left-1/2 -translate-x-1/2`,
    };

    return (
      <div className={cn(
        "fixed z-50",
        position === 'bottom-right' && `bottom-20 right-4`,
        position === 'bottom-left' && `bottom-20 left-4`,
        position === 'bottom-center' && `bottom-20 left-1/2 -translate-x-1/2`,
        "lg:hidden" // Only show on mobile
      )}>
        <TouchButton
          ref={ref}
          className={cn(
            "h-14 w-14 rounded-full shadow-lg",
            "hover:shadow-xl transition-shadow",
            className
          )}
          size="icon"
          {...props}
        >
          {children}
        </TouchButton>
      </div>
    );
  }
);

FloatingActionButton.displayName = 'FloatingActionButton';

// Icon button optimized for mobile
export const TouchIconButton = forwardRef<HTMLButtonElement, TouchButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <TouchButton
        ref={ref}
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10",
          "hover:bg-accent/50",
          "active:bg-accent",
          className
        )}
        {...props}
      >
        {children}
      </TouchButton>
    );
  }
);

TouchIconButton.displayName = 'TouchIconButton';

// Large touch target button for mobile forms
export const TouchFormButton = forwardRef<HTMLButtonElement, TouchButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <TouchButton
        ref={ref}
        className={cn(
          "w-full",
          "h-12 md:h-10", // Larger on mobile
          "text-base md:text-sm", // Larger text on mobile
          className
        )}
        {...props}
      >
        {children}
      </TouchButton>
    );
  }
);

TouchFormButton.displayName = 'TouchFormButton';