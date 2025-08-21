/**
 * Optimized Image Component
 * Implements lazy loading, responsive images, and performance optimizations
 */

'use client';

import { useState, useEffect, useRef, CSSProperties } from 'react';
import Image, { ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

interface OptimizedImageProps extends Omit<ImageProps, 'onLoad' | 'onError'> {
  fallbackSrc?: string;
  lazyBoundary?: string;
  fadeIn?: boolean;
  aspectRatio?: number;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  lowQualitySrc?: string;
  enableLQIP?: boolean; // Low Quality Image Placeholder
  onLoad?: () => void;
  onError?: () => void;
  critical?: boolean; // For above-the-fold images
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  fallbackSrc = '/images/placeholder.jpg',
  lazyBoundary = '200px',
  fadeIn = true,
  aspectRatio,
  objectFit = 'cover',
  lowQualitySrc,
  enableLQIP = true,
  onLoad,
  onError,
  critical = false,
  priority = false,
  quality = 75,
  sizes,
  ...props
}: OptimizedImageProps) {
  const [imageSrc, setImageSrc] = useState<string | typeof src>(src);
  const [isLoading, setIsLoading] = useState(true);
  const [isInView, setIsInView] = useState(critical || priority);
  const [showLQIP, setShowLQIP] = useState(enableLQIP && !critical && !priority);
  const imgRef = useRef<HTMLDivElement>(null);

  // Generate responsive sizes if not provided
  const responsiveSizes = sizes || generateResponsiveSizes();

  // Setup Intersection Observer for lazy loading
  useEffect(() => {
    if (critical || priority || !imgRef.current) {
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
        rootMargin: lazyBoundary,
        threshold: 0.01,
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [critical, priority, lazyBoundary]);

  // Handle image load
  const handleLoad = () => {
    setIsLoading(false);
    setShowLQIP(false);
    onLoad?.();
  };

  // Handle image error
  const handleError = () => {
    console.error(`Failed to load image: ${src}`);
    if (fallbackSrc && imageSrc !== fallbackSrc) {
      setImageSrc(fallbackSrc);
    }
    setIsLoading(false);
    onError?.();
  };

  // Calculate dimensions for aspect ratio
  const getDimensions = () => {
    if (aspectRatio && width && !height) {
      return {
        width,
        height: Number(width) / aspectRatio,
      };
    }
    if (aspectRatio && height && !width) {
      return {
        width: Number(height) * aspectRatio,
        height,
      };
    }
    return { width, height };
  };

  const dimensions = getDimensions();

  // Container styles for aspect ratio
  const containerStyle: CSSProperties = aspectRatio
    ? {
        position: 'relative',
        width: '100%',
        paddingBottom: `${(1 / aspectRatio) * 100}%`,
      }
    : {};

  // Image wrapper styles
  const imageWrapperStyle: CSSProperties = aspectRatio
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }
    : {};

  return (
    <div
      ref={imgRef}
      className={cn('relative overflow-hidden', className)}
      style={containerStyle}
    >
      <div style={imageWrapperStyle} className="relative w-full h-full">
        {/* Low Quality Image Placeholder */}
        {showLQIP && lowQualitySrc && (
          <Image
            src={lowQualitySrc}
            alt={alt}
            {...dimensions}
            className={cn(
              'absolute inset-0 w-full h-full filter blur-sm',
              objectFit === 'contain' && 'object-contain',
              objectFit === 'cover' && 'object-cover',
              objectFit === 'fill' && 'object-fill',
              objectFit === 'none' && 'object-none',
              objectFit === 'scale-down' && 'object-scale-down'
            )}
            quality={10}
            priority
            unoptimized
          />
        )}

        {/* Main Image */}
        {isInView && (
          <Image
            src={imageSrc}
            alt={alt}
            {...dimensions}
            className={cn(
              'w-full h-full',
              objectFit === 'contain' && 'object-contain',
              objectFit === 'cover' && 'object-cover',
              objectFit === 'fill' && 'object-fill',
              objectFit === 'none' && 'object-none',
              objectFit === 'scale-down' && 'object-scale-down',
              fadeIn && 'transition-opacity duration-300',
              isLoading ? 'opacity-0' : 'opacity-100'
            )}
            onLoad={handleLoad}
            onError={handleError}
            priority={priority || critical}
            quality={quality}
            sizes={responsiveSizes}
            {...props}
          />
        )}

        {/* Loading skeleton */}
        {isLoading && !showLQIP && (
          <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 animate-pulse" />
        )}
      </div>
    </div>
  );
}

/**
 * Generate responsive sizes string based on common breakpoints
 */
function generateResponsiveSizes(): string {
  return [
    '(max-width: 640px) 100vw',
    '(max-width: 768px) 80vw',
    '(max-width: 1024px) 60vw',
    '(max-width: 1280px) 40vw',
    '33vw',
  ].join(', ');
}

/**
 * Preload critical images for better performance
 */
export function preloadImage(src: string): void {
  if (typeof window === 'undefined') return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  document.head.appendChild(link);
}

/**
 * Picture component for art direction
 */
interface PictureSource {
  srcSet: string;
  media?: string;
  type?: string;
}

interface OptimizedPictureProps {
  sources: PictureSource[];
  fallback: OptimizedImageProps;
  className?: string;
}

export function OptimizedPicture({
  sources,
  fallback,
  className,
}: OptimizedPictureProps) {
  return (
    <picture className={className}>
      {sources.map((source, index) => (
        <source
          key={index}
          srcSet={source.srcSet}
          media={source.media}
          type={source.type}
        />
      ))}
      <OptimizedImage {...fallback} />
    </picture>
  );
}

/**
 * Background image component with lazy loading
 */
interface OptimizedBackgroundProps {
  src: string;
  fallbackSrc?: string;
  className?: string;
  children?: React.ReactNode;
  lazyBoundary?: string;
  overlay?: boolean;
  overlayOpacity?: number;
}

export function OptimizedBackground({
  src,
  fallbackSrc = '/images/placeholder.jpg',
  className,
  children,
  lazyBoundary = '200px',
  overlay = false,
  overlayOpacity = 0.5,
}: OptimizedBackgroundProps) {
  const [backgroundSrc, setBackgroundSrc] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadBackgroundImage();
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: lazyBoundary,
        threshold: 0.01,
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [src, lazyBoundary]);

  const loadBackgroundImage = () => {
    const img = new window.Image();
    img.src = src;
    
    img.onload = () => {
      setBackgroundSrc(src);
      setIsLoaded(true);
    };
    
    img.onerror = () => {
      if (fallbackSrc) {
        setBackgroundSrc(fallbackSrc);
        setIsLoaded(true);
      }
    };
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      style={{
        backgroundImage: backgroundSrc ? `url(${backgroundSrc})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        transition: isLoaded ? 'opacity 0.3s ease-in-out' : undefined,
      }}
    >
      {overlay && (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: overlayOpacity }}
        />
      )}
      {children}
    </div>
  );
}

/**
 * Image gallery with optimized loading
 */
interface GalleryImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
}

interface OptimizedGalleryProps {
  images: GalleryImage[];
  columns?: number;
  gap?: number;
  className?: string;
  onImageClick?: (index: number) => void;
}

export function OptimizedGallery({
  images,
  columns = 3,
  gap = 16,
  className,
  onImageClick,
}: OptimizedGalleryProps) {
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());

  const handleImageLoad = (index: number) => {
    setLoadedImages((prev) => new Set(prev).add(index));
  };

  return (
    <div
      className={cn('grid', className)}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`,
      }}
    >
      {images.map((image, index) => (
        <div
          key={index}
          className="relative cursor-pointer group"
          onClick={() => onImageClick?.(index)}
        >
          <OptimizedImage
            src={image.src}
            alt={image.alt}
            width={image.width || 400}
            height={image.height || 300}
            className="w-full h-full"
            onLoad={() => handleImageLoad(index)}
            fadeIn
          />
          {image.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
              {image.caption}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Avatar component with optimized loading
 */
interface OptimizedAvatarProps {
  src?: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
  className?: string;
}

const avatarSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

export function OptimizedAvatar({
  src,
  alt,
  size = 'md',
  fallback = '/images/default-avatar.png',
  className,
}: OptimizedAvatarProps) {
  const dimension = avatarSizes[size];

  return (
    <OptimizedImage
      src={src || fallback}
      alt={alt}
      width={dimension}
      height={dimension}
      className={cn('rounded-full', className)}
      fallbackSrc={fallback}
      priority // Avatars are usually above the fold
      quality={90} // Higher quality for avatars
    />
  );
}

export default OptimizedImage;