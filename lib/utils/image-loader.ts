/**
 * Image Loader Utilities
 * Handles image optimization, CDN integration, and responsive loading
 */

import { ImageLoaderProps } from 'next/image';

export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  blur?: number;
  sharpen?: boolean;
  grayscale?: boolean;
}

/**
 * Cloudinary image loader
 */
export function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  const cloudinaryUrl = process.env.NEXT_PUBLIC_CLOUDINARY_URL;
  if (!cloudinaryUrl) {
    return src; // Fallback to original source
  }

  // Extract public ID from URL if it's already a Cloudinary URL
  const publicId = extractCloudinaryPublicId(src);
  
  // Build transformation string
  const transformations = [
    `w_${width}`,
    `q_${quality || 75}`,
    'f_auto', // Auto format selection
    'c_fill', // Crop mode
    'g_auto', // Auto gravity
    'dpr_auto', // Auto DPR for retina displays
  ].join(',');

  return `${cloudinaryUrl}/${transformations}/${publicId}`;
}

/**
 * Imgix image loader
 */
export function imgixLoader({ src, width, quality }: ImageLoaderProps): string {
  const imgixDomain = process.env.NEXT_PUBLIC_IMGIX_DOMAIN;
  if (!imgixDomain) {
    return src;
  }

  const params = new URLSearchParams({
    w: width.toString(),
    q: (quality || 75).toString(),
    auto: 'format,compress',
    fit: 'crop',
    crop: 'faces,entropy',
  });

  return `https://${imgixDomain}${src}?${params}`;
}

/**
 * Custom optimization loader for local images
 */
export function optimizedLoader({ src, width, quality }: ImageLoaderProps): string {
  // Use Next.js built-in image optimization API
  const params = new URLSearchParams({
    url: src,
    w: width.toString(),
    q: (quality || 75).toString(),
  });

  return `/_next/image?${params}`;
}

/**
 * ESPN image loader with optimization
 */
export function espnImageLoader({ src, width }: ImageLoaderProps): string {
  // ESPN images often have specific size parameters
  if (src.includes('espncdn.com')) {
    // Replace existing size parameters
    const baseUrl = src.replace(/&w=\d+/, '').replace(/&h=\d+/, '');
    return `${baseUrl}&w=${width}&h=${width}`;
  }
  return src;
}

/**
 * Generate srcSet for responsive images
 */
export function generateSrcSet(
  src: string,
  sizes: number[],
  loader: (props: ImageLoaderProps) => string = optimizedLoader
): string {
  return sizes
    .map((size) => {
      const url = loader({ src, width: size, quality: 75 });
      return `${url} ${size}w`;
    })
    .join(', ');
}

/**
 * Generate LQIP (Low Quality Image Placeholder) data URL
 */
export async function generateLQIP(src: string, width = 40, height = 40): Promise<string> {
  if (typeof window === 'undefined') {
    return ''; // Can't generate on server-side
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }
      
      // Draw and blur the image
      ctx.filter = 'blur(5px)';
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to data URL with low quality
      const dataUrl = canvas.toDataURL('image/jpeg', 0.1);
      resolve(dataUrl);
    };
    
    img.onerror = () => {
      resolve('');
    };
    
    img.src = src;
  });
}

/**
 * Preload images for better performance
 */
export function preloadImages(urls: string[]): void {
  if (typeof window === 'undefined') return;

  urls.forEach((url) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    document.head.appendChild(link);
  });
}

/**
 * Lazy load images with Intersection Observer
 */
export class ImageLazyLoader {
  private observer: IntersectionObserver | null = null;
  private loadedImages = new Set<string>();

  constructor(options: IntersectionObserverInit = {}) {
    if (typeof window === 'undefined') return;

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          this.loadImage(img);
        }
      });
    }, {
      rootMargin: '50px',
      threshold: 0.01,
      ...options,
    });
  }

  observe(img: HTMLImageElement): void {
    if (!this.observer || !img.dataset.src) return;
    this.observer.observe(img);
  }

  unobserve(img: HTMLImageElement): void {
    if (!this.observer) return;
    this.observer.unobserve(img);
  }

  private loadImage(img: HTMLImageElement): void {
    const src = img.dataset.src;
    if (!src || this.loadedImages.has(src)) return;

    // Load the image
    const tempImg = new window.Image();
    tempImg.src = src;
    
    tempImg.onload = () => {
      img.src = src;
      img.classList.add('loaded');
      this.loadedImages.add(src);
      
      if (this.observer) {
        this.observer.unobserve(img);
      }
    };

    tempImg.onerror = () => {
      const fallback = img.dataset.fallback;
      if (fallback) {
        img.src = fallback;
      }
    };
  }

  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.loadedImages.clear();
  }
}

/**
 * Extract Cloudinary public ID from URL
 */
function extractCloudinaryPublicId(url: string): string {
  // If it's already a public ID (no http/https)
  if (!url.startsWith('http')) {
    return url;
  }

  // Extract from Cloudinary URL
  const match = url.match(/upload\/(?:v\d+\/)?(.+)$/);
  return match ? match[1] : url;
}

/**
 * Get optimal image format based on browser support
 */
export function getOptimalFormat(): 'avif' | 'webp' | 'jpeg' {
  if (typeof window === 'undefined') {
    return 'jpeg';
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  // Check AVIF support
  if (canvas.toDataURL('image/avif').startsWith('data:image/avif')) {
    return 'avif';
  }

  // Check WebP support
  if (canvas.toDataURL('image/webp').startsWith('data:image/webp')) {
    return 'webp';
  }

  return 'jpeg';
}

/**
 * Calculate responsive breakpoints for an image
 */
export function calculateBreakpoints(
  maxWidth: number,
  minWidth = 320,
  steps = 5
): number[] {
  const breakpoints: number[] = [];
  const increment = (maxWidth - minWidth) / (steps - 1);

  for (let i = 0; i < steps; i++) {
    breakpoints.push(Math.round(minWidth + increment * i));
  }

  return breakpoints;
}

/**
 * Generate blur data URL for placeholder
 */
export function generateBlurDataURL(color: string = '#f0f0f0'): string {
  const svg = `
    <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="${color}"/>
    </svg>
  `;
  
  const base64 = typeof window !== 'undefined' 
    ? window.btoa(svg)
    : Buffer.from(svg).toString('base64');
    
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Image optimization helper
 */
export class ImageOptimizer {
  private static instance: ImageOptimizer;
  private loadedImages = new Map<string, boolean>();
  private pendingImages = new Map<string, Promise<void>>();

  static getInstance(): ImageOptimizer {
    if (!ImageOptimizer.instance) {
      ImageOptimizer.instance = new ImageOptimizer();
    }
    return ImageOptimizer.instance;
  }

  async optimizeAndLoad(src: string, options?: ImageOptimizationOptions): Promise<string> {
    // Check if already loaded
    if (this.loadedImages.has(src)) {
      return src;
    }

    // Check if already pending
    if (this.pendingImages.has(src)) {
      await this.pendingImages.get(src);
      return src;
    }

    // Start loading
    const loadPromise = this.loadImage(src, options);
    this.pendingImages.set(src, loadPromise);

    try {
      await loadPromise;
      this.loadedImages.set(src, true);
      return src;
    } finally {
      this.pendingImages.delete(src);
    }
  }

  private loadImage(src: string, options?: ImageOptimizationOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      
      // Apply optimization parameters if using a CDN
      const optimizedSrc = this.applyOptimizations(src, options);
      
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = optimizedSrc;
    });
  }

  private applyOptimizations(src: string, options?: ImageOptimizationOptions): string {
    if (!options) return src;

    // If using Cloudinary
    if (src.includes('cloudinary.com')) {
      const transformations = [];
      
      if (options.width) transformations.push(`w_${options.width}`);
      if (options.height) transformations.push(`h_${options.height}`);
      if (options.quality) transformations.push(`q_${options.quality}`);
      if (options.format) transformations.push(`f_${options.format}`);
      if (options.fit) transformations.push(`c_${options.fit}`);
      if (options.blur) transformations.push(`e_blur:${options.blur}`);
      if (options.sharpen) transformations.push('e_sharpen');
      if (options.grayscale) transformations.push('e_grayscale');
      
      const transformString = transformations.join(',');
      return src.replace('/upload/', `/upload/${transformString}/`);
    }

    return src;
  }

  clearCache(): void {
    this.loadedImages.clear();
    this.pendingImages.clear();
  }
}

export const imageOptimizer = ImageOptimizer.getInstance();