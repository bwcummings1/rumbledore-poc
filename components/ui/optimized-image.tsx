'use client';

import { useState, useEffect, useRef } from 'react';
import Image, { ImageProps } from 'next/image';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface OptimizedImageProps extends Omit<ImageProps, 'onLoad' | 'onError'> {
  fallback?: string;
  showSkeleton?: boolean;
  aspectRatio?: number;
  lazyLoad?: boolean;
  fadeIn?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export function OptimizedImage({
  src,
  alt,
  fallback = '/images/placeholder.png',
  showSkeleton = true,
  aspectRatio,
  lazyLoad = true,
  fadeIn = true,
  className,
  onLoad,
  onError,
  priority = false,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isInView, setIsInView] = useState(!lazyLoad);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lazyLoad || priority) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.01,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [lazyLoad, priority]);

  const handleLoad = () => {
    setIsLoading(false);
    onLoad?.();
  };

  const handleError = () => {
    setError(true);
    setIsLoading(false);
    onError?.();
  };

  const wrapperStyle = aspectRatio
    ? { aspectRatio: aspectRatio.toString() }
    : undefined;

  return (
    <div 
      ref={imgRef}
      className={cn("relative overflow-hidden", className)}
      style={wrapperStyle}
    >
      {/* Skeleton loader */}
      {showSkeleton && isLoading && (
        <Skeleton className="absolute inset-0" />
      )}

      {/* Image */}
      {isInView && (
        <Image
          src={error ? fallback : src}
          alt={alt}
          className={cn(
            "object-cover",
            fadeIn && "transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100",
            className
          )}
          onLoad={handleLoad}
          onError={handleError}
          priority={priority}
          {...props}
        />
      )}

      {/* Low quality image placeholder for blur effect */}
      {!isInView && showSkeleton && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
    </div>
  );
}

// Responsive image component with srcset support
interface ResponsiveImageProps extends OptimizedImageProps {
  sizes?: string;
  mobileSrc?: string;
  tabletSrc?: string;
  desktopSrc?: string;
}

export function ResponsiveImage({
  mobileSrc,
  tabletSrc,
  desktopSrc,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  ...props
}: ResponsiveImageProps) {
  const [currentSrc, setCurrentSrc] = useState(props.src);

  useEffect(() => {
    const updateSrc = () => {
      const width = window.innerWidth;
      if (width <= 640 && mobileSrc) {
        setCurrentSrc(mobileSrc);
      } else if (width <= 1024 && tabletSrc) {
        setCurrentSrc(tabletSrc);
      } else if (desktopSrc) {
        setCurrentSrc(desktopSrc);
      } else {
        setCurrentSrc(props.src);
      }
    };

    updateSrc();
    window.addEventListener('resize', updateSrc);
    return () => window.removeEventListener('resize', updateSrc);
  }, [mobileSrc, tabletSrc, desktopSrc, props.src]);

  return (
    <OptimizedImage
      {...props}
      src={currentSrc}
      sizes={sizes}
    />
  );
}

// Avatar image component with fallback
interface AvatarImageProps {
  src?: string | null;
  alt: string;
  fallbackText?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function AvatarImage({
  src,
  alt,
  fallbackText,
  size = 'md',
  className,
}: AvatarImageProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
  };

  if (!src) {
    const initials = fallbackText
      ? fallbackText
          .split(' ')
          .map((word) => word[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : '?';

    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted",
          sizeClasses[size],
          textSizeClasses[size],
          "font-medium",
          className
        )}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className={cn("relative rounded-full overflow-hidden", sizeClasses[size], className)}>
      <OptimizedImage
        src={src}
        alt={alt}
        fill
        className="object-cover"
        showSkeleton={false}
      />
    </div>
  );
}

// Background image component with parallax effect
interface BackgroundImageProps {
  src: string;
  alt: string;
  parallax?: boolean;
  overlay?: boolean;
  overlayOpacity?: number;
  children?: React.ReactNode;
  className?: string;
}

export function BackgroundImage({
  src,
  alt,
  parallax = false,
  overlay = true,
  overlayOpacity = 0.5,
  children,
  className,
}: BackgroundImageProps) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!parallax) return;

    const handleScroll = () => {
      setOffset(window.pageYOffset * 0.5);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [parallax]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className="absolute inset-0"
        style={{
          transform: parallax ? `translateY(${offset}px)` : undefined,
        }}
      >
        <OptimizedImage
          src={src}
          alt={alt}
          fill
          className="object-cover"
          priority
        />
      </div>
      
      {overlay && (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: overlayOpacity }}
        />
      )}
      
      {children && (
        <div className="relative z-10">
          {children}
        </div>
      )}
    </div>
  );
}