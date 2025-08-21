/**
 * Lighthouse Optimizations
 * Configurations and utilities to achieve Lighthouse score > 95
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Critical CSS for above-the-fold content
 */
export const criticalCSS = `
  /* Critical CSS for immediate render */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
  .header { height: 60px; background: #fff; border-bottom: 1px solid #e5e5e5; }
  .main { min-height: calc(100vh - 60px); }
  .skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); 
              background-size: 200% 100%; animation: loading 1.5s infinite; }
  @keyframes loading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @media (prefers-color-scheme: dark) { 
    body { background: #0a0a0a; color: #fafafa; }
    .header { background: #1a1a1a; border-color: #2a2a2a; }
  }
`;

/**
 * Resource hints for optimal loading
 */
export function generateResourceHints(): string[] {
  const hints = [
    // DNS Prefetch for external domains
    '<link rel="dns-prefetch" href="https://fonts.googleapis.com">',
    '<link rel="dns-prefetch" href="https://cdn.jsdelivr.net">',
    
    // Preconnect to critical origins
    '<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    
    // Preload critical resources
    '<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>',
    
    // Prefetch next likely navigation
    '<link rel="prefetch" href="/dashboard">',
    
    // Modulepreload for ES modules
    '<link rel="modulepreload" href="/_next/static/chunks/main.js">',
  ];
  
  return hints;
}

/**
 * Performance budget configuration
 */
export const performanceBudget = {
  // Resource type budgets
  resourceTypes: [
    { type: 'script', budget: 300 }, // 300KB for JS
    { type: 'style', budget: 150 },  // 150KB for CSS
    { type: 'image', budget: 500 },  // 500KB for images
    { type: 'font', budget: 100 },   // 100KB for fonts
    { type: 'total', budget: 1500 }, // 1.5MB total
  ],
  
  // Timing budgets
  timings: [
    { metric: 'first-contentful-paint', budget: 1800 },
    { metric: 'largest-contentful-paint', budget: 2500 },
    { metric: 'first-input-delay', budget: 100 },
    { metric: 'cumulative-layout-shift', budget: 0.1 },
    { metric: 'time-to-interactive', budget: 3800 },
    { metric: 'total-blocking-time', budget: 200 },
  ],
};

/**
 * Accessibility improvements
 */
export const accessibilityConfig = {
  // ARIA labels for interactive elements
  ariaLabels: {
    navigation: 'Main navigation',
    search: 'Search',
    menu: 'Menu',
    close: 'Close',
    loading: 'Loading',
    error: 'Error',
    success: 'Success',
  },
  
  // Focus management
  focusConfig: {
    skipLinks: true,
    focusVisible: true,
    keyboardNavigation: true,
    trapFocus: true,
  },
  
  // Color contrast requirements
  contrastRatios: {
    normal: 4.5,
    large: 3,
    nonText: 3,
  },
};

/**
 * SEO optimizations
 */
export const seoConfig = {
  // Meta tags
  defaultMeta: {
    viewport: 'width=device-width, initial-scale=1',
    description: 'Rumbledore - Fantasy Football Platform',
    keywords: 'fantasy football, ESPN, league management',
    author: 'Rumbledore Team',
    robots: 'index, follow',
    ogType: 'website',
    twitterCard: 'summary_large_image',
  },
  
  // Structured data
  structuredData: {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Rumbledore',
    description: 'Comprehensive fantasy football platform',
    applicationCategory: 'SportsApplication',
    operatingSystem: 'Any',
  },
};

/**
 * Font optimization strategy
 */
export const fontOptimization = {
  // Font display strategy
  display: 'swap', // Show fallback immediately
  
  // Subset fonts for critical characters
  subset: 'latin',
  
  // Variable fonts for size reduction
  useVariable: true,
  
  // Preload critical fonts
  preload: [
    '/fonts/inter-var-latin.woff2',
  ],
  
  // Font face declarations
  fontFace: `
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url('/fonts/inter-var-latin.woff2') format('woff2-variations');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC;
    }
  `,
};

/**
 * Script optimization utilities
 */
export class ScriptOptimizer {
  /**
   * Defer non-critical scripts
   */
  static deferScript(src: string): string {
    return `<script defer src="${src}"></script>`;
  }
  
  /**
   * Async load for independent scripts
   */
  static asyncScript(src: string): string {
    return `<script async src="${src}"></script>`;
  }
  
  /**
   * Lazy load scripts on interaction
   */
  static lazyLoadScript(src: string, trigger: string = 'click'): string {
    return `
      <script>
        let loaded = false;
        document.addEventListener('${trigger}', () => {
          if (!loaded) {
            const script = document.createElement('script');
            script.src = '${src}';
            document.head.appendChild(script);
            loaded = true;
          }
        }, { once: true });
      </script>
    `;
  }
  
  /**
   * Inline critical JavaScript
   */
  static inlineCriticalJS(): string {
    return `
      <script>
        // Check for dark mode preference
        if (localStorage.theme === 'dark' || 
            (!('theme' in localStorage) && 
             window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        }
        
        // Add no-js fallback class
        document.documentElement.classList.remove('no-js');
        document.documentElement.classList.add('js');
        
        // Performance mark
        performance.mark('head-end');
      </script>
    `;
  }
}

/**
 * Image optimization for Lighthouse
 */
export class ImageLighthouseOptimizer {
  /**
   * Generate responsive image sizes
   */
  static generateSizes(): string {
    return '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
  }
  
  /**
   * Add lazy loading to images
   */
  static addLazyLoading(html: string): string {
    return html.replace(
      /<img([^>]+)>/g,
      (match, attrs) => {
        if (!attrs.includes('loading=')) {
          return `<img${attrs} loading="lazy">`;
        }
        return match;
      }
    );
  }
  
  /**
   * Add width and height to prevent CLS
   */
  static addDimensions(html: string): string {
    return html.replace(
      /<img([^>]+)src="([^"]+)"([^>]*)>/g,
      (match, before, src, after) => {
        if (!before.includes('width=') && !after.includes('width=')) {
          // Add default dimensions to prevent layout shift
          return `<img${before}src="${src}" width="16" height="9" style="aspect-ratio: 16/9"${after}>`;
        }
        return match;
      }
    );
  }
}

/**
 * Middleware for Lighthouse optimizations
 */
export function lighthouseMiddleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  
  // Security headers for best practices score
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // CSP for security
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
  );
  
  // Cache headers for static assets
  const isStaticAsset = /\.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico)$/i.test(request.nextUrl.pathname);
  if (isStaticAsset) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  
  return response;
}

/**
 * Generate inline performance monitoring
 */
export function generatePerfMonitoring(): string {
  return `
    <script>
      // Performance monitoring
      window.addEventListener('load', () => {
        // Log performance metrics
        const perfData = performance.getEntriesByType('navigation')[0];
        const paintData = performance.getEntriesByType('paint');
        
        // Send to analytics
        if (window.gtag) {
          // First Contentful Paint
          const fcp = paintData.find(p => p.name === 'first-contentful-paint');
          if (fcp) {
            gtag('event', 'timing_complete', {
              name: 'first_contentful_paint',
              value: Math.round(fcp.startTime),
            });
          }
          
          // Page Load Time
          if (perfData.loadEventEnd) {
            gtag('event', 'timing_complete', {
              name: 'page_load_time',
              value: Math.round(perfData.loadEventEnd),
            });
          }
        }
      });
      
      // Track Web Vitals
      if ('PerformanceObserver' in window) {
        // Largest Contentful Paint
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          console.log('LCP:', lastEntry.renderTime || lastEntry.loadTime);
        }).observe({ entryTypes: ['largest-contentful-paint'] });
        
        // First Input Delay
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            console.log('FID:', entry.processingStart - entry.startTime);
          });
        }).observe({ entryTypes: ['first-input'] });
        
        // Cumulative Layout Shift
        let cls = 0;
        new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (!entry.hadRecentInput) {
              cls += entry.value;
              console.log('CLS:', cls);
            }
          });
        }).observe({ entryTypes: ['layout-shift'] });
      }
    </script>
  `;
}

/**
 * Service Worker for offline and caching
 */
export const serviceWorkerConfig = {
  // Workbox configuration
  workbox: {
    // Runtime caching
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      {
        urlPattern: /\/_next\/static\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          },
        },
      },
      {
        urlPattern: /\/api\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 5, // 5 minutes
          },
        },
      },
    ],
  },
};

/**
 * Bundle size optimization config
 */
export const bundleOptimization = {
  // Tree shaking
  treeShaking: true,
  
  // Dead code elimination
  deadCodeElimination: true,
  
  // Minification
  minify: true,
  
  // Code splitting
  splitChunks: {
    chunks: 'all',
    cacheGroups: {
      vendor: {
        test: /[\\/]node_modules[\\/]/,
        priority: 10,
        reuseExistingChunk: true,
      },
      common: {
        minChunks: 2,
        priority: 5,
        reuseExistingChunk: true,
      },
    },
  },
  
  // Dynamic imports for code splitting
  dynamicImports: [
    'recharts',
    'framer-motion',
    '@radix-ui',
    'react-hook-form',
  ],
};

export default {
  criticalCSS,
  generateResourceHints,
  performanceBudget,
  accessibilityConfig,
  seoConfig,
  fontOptimization,
  ScriptOptimizer,
  ImageLighthouseOptimizer,
  lighthouseMiddleware,
  generatePerfMonitoring,
  serviceWorkerConfig,
  bundleOptimization,
};