/**
 * CDN Configuration and Integration
 * Manages static asset delivery through CDN
 */

export interface CDNConfig {
  provider: 'cloudflare' | 'cloudfront' | 'fastly' | 'custom';
  baseUrl: string;
  enabled: boolean;
  customDomain?: string;
  apiKey?: string;
  zoneId?: string;
  distributionId?: string;
  purgeEndpoint?: string;
  features: {
    autoWebP: boolean;
    autoAvif: boolean;
    lazyLoading: boolean;
    responsiveImages: boolean;
    imageOptimization: boolean;
    caching: boolean;
    compression: boolean;
    http2Push: boolean;
  };
  cacheSettings: {
    maxAge: number;
    sMaxAge: number;
    staleWhileRevalidate: number;
    immutable: boolean;
  };
}

/**
 * Get CDN configuration based on environment
 */
export function getCDNConfig(): CDNConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const cdnEnabled = process.env.NEXT_PUBLIC_CDN_ENABLED === 'true';
  
  return {
    provider: (process.env.NEXT_PUBLIC_CDN_PROVIDER as CDNConfig['provider']) || 'cloudflare',
    baseUrl: process.env.NEXT_PUBLIC_CDN_URL || '',
    enabled: isProduction && cdnEnabled,
    customDomain: process.env.NEXT_PUBLIC_CDN_CUSTOM_DOMAIN,
    apiKey: process.env.CDN_API_KEY,
    zoneId: process.env.CDN_ZONE_ID,
    distributionId: process.env.CDN_DISTRIBUTION_ID,
    purgeEndpoint: process.env.CDN_PURGE_ENDPOINT,
    features: {
      autoWebP: true,
      autoAvif: true,
      lazyLoading: true,
      responsiveImages: true,
      imageOptimization: true,
      caching: true,
      compression: true,
      http2Push: true,
    },
    cacheSettings: {
      maxAge: 31536000, // 1 year for immutable assets
      sMaxAge: 86400, // 1 day for CDN cache
      staleWhileRevalidate: 604800, // 1 week
      immutable: true,
    },
  };
}

/**
 * CDN URL builder
 */
export class CDNUrlBuilder {
  private config: CDNConfig;

  constructor(config?: CDNConfig) {
    this.config = config || getCDNConfig();
  }

  /**
   * Build CDN URL for an asset
   */
  buildUrl(path: string, options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  }): string {
    if (!this.config.enabled) {
      return path; // Return original path if CDN is disabled
    }

    // Handle absolute URLs
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    // Build base CDN URL
    const baseUrl = this.config.customDomain || this.config.baseUrl;
    const cdnUrl = new URL(path, baseUrl);

    // Add optimization parameters based on provider
    if (options && this.config.features.imageOptimization) {
      this.addOptimizationParams(cdnUrl, options);
    }

    return cdnUrl.toString();
  }

  /**
   * Add optimization parameters based on CDN provider
   */
  private addOptimizationParams(url: URL, options: any): void {
    switch (this.config.provider) {
      case 'cloudflare':
        this.addCloudflareParams(url, options);
        break;
      case 'cloudfront':
        this.addCloudFrontParams(url, options);
        break;
      case 'fastly':
        this.addFastlyParams(url, options);
        break;
      case 'custom':
        this.addCustomParams(url, options);
        break;
    }
  }

  /**
   * Cloudflare-specific parameters
   */
  private addCloudflareParams(url: URL, options: any): void {
    const params: Record<string, string> = {};
    
    if (options.width) params.w = options.width.toString();
    if (options.height) params.h = options.height.toString();
    if (options.quality) params.q = options.quality.toString();
    if (options.format) params.f = options.format;
    if (options.fit) params.fit = options.fit;
    
    // Add Cloudflare-specific optimizations
    params.sharpen = '1';
    params.metadata = 'none';
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  /**
   * CloudFront-specific parameters
   */
  private addCloudFrontParams(url: URL, options: any): void {
    // CloudFront uses different parameter names
    if (options.width) url.searchParams.set('width', options.width.toString());
    if (options.height) url.searchParams.set('height', options.height.toString());
    if (options.quality) url.searchParams.set('quality', options.quality.toString());
    if (options.format) url.searchParams.set('format', options.format);
  }

  /**
   * Fastly-specific parameters
   */
  private addFastlyParams(url: URL, options: any): void {
    const params: string[] = [];
    
    if (options.width) params.push(`width=${options.width}`);
    if (options.height) params.push(`height=${options.height}`);
    if (options.quality) params.push(`quality=${options.quality}`);
    if (options.format) params.push(`format=${options.format}`);
    if (options.fit) params.push(`fit=${options.fit}`);
    
    if (params.length > 0) {
      url.pathname = `/optimize?${params.join('&')}&url=${encodeURIComponent(url.pathname)}`;
    }
  }

  /**
   * Custom CDN parameters
   */
  private addCustomParams(url: URL, options: any): void {
    // Generic parameter addition for custom CDNs
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, value.toString());
      }
    });
  }

  /**
   * Get asset URL with version/hash for cache busting
   */
  getVersionedUrl(path: string, version?: string): string {
    const url = this.buildUrl(path);
    
    if (version) {
      const urlObj = new URL(url);
      urlObj.searchParams.set('v', version);
      return urlObj.toString();
    }
    
    // Use timestamp as fallback version
    const timestamp = Date.now().toString(36);
    const urlObj = new URL(url);
    urlObj.searchParams.set('v', timestamp);
    return urlObj.toString();
  }

  /**
   * Generate srcset for responsive images
   */
  generateSrcSet(path: string, widths: number[]): string {
    return widths
      .map(width => {
        const url = this.buildUrl(path, { width });
        return `${url} ${width}w`;
      })
      .join(', ');
  }
}

/**
 * CDN cache manager
 */
export class CDNCacheManager {
  private config: CDNConfig;

  constructor(config?: CDNConfig) {
    this.config = config || getCDNConfig();
  }

  /**
   * Purge CDN cache for specific paths
   */
  async purgePaths(paths: string[]): Promise<boolean> {
    if (!this.config.enabled || !this.config.purgeEndpoint) {
      console.warn('CDN purge not configured');
      return false;
    }

    try {
      const response = await fetch(this.config.purgeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          paths,
          zoneId: this.config.zoneId,
          distributionId: this.config.distributionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Purge failed: ${response.statusText}`);
      }

      console.log(`Successfully purged ${paths.length} paths from CDN`);
      return true;
    } catch (error) {
      console.error('CDN purge error:', error);
      return false;
    }
  }

  /**
   * Purge entire CDN cache
   */
  async purgeAll(): Promise<boolean> {
    if (!this.config.enabled || !this.config.purgeEndpoint) {
      console.warn('CDN purge not configured');
      return false;
    }

    try {
      const response = await fetch(this.config.purgeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          purgeAll: true,
          zoneId: this.config.zoneId,
          distributionId: this.config.distributionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Purge all failed: ${response.statusText}`);
      }

      console.log('Successfully purged entire CDN cache');
      return true;
    } catch (error) {
      console.error('CDN purge all error:', error);
      return false;
    }
  }

  /**
   * Warm CDN cache by pre-fetching assets
   */
  async warmCache(urls: string[]): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const promises = urls.map(url => 
      fetch(url, { method: 'HEAD' }).catch(err => 
        console.error(`Failed to warm cache for ${url}:`, err)
      )
    );

    await Promise.all(promises);
    console.log(`Warmed CDN cache for ${urls.length} URLs`);
  }

  /**
   * Get cache headers for response
   */
  getCacheHeaders(assetType: 'static' | 'dynamic' | 'api'): Record<string, string> {
    const headers: Record<string, string> = {};
    const { cacheSettings } = this.config;

    switch (assetType) {
      case 'static':
        // Immutable static assets (JS, CSS, images)
        headers['Cache-Control'] = [
          'public',
          cacheSettings.immutable && 'immutable',
          `max-age=${cacheSettings.maxAge}`,
          `s-maxage=${cacheSettings.sMaxAge}`,
        ].filter(Boolean).join(', ');
        headers['CDN-Cache-Control'] = `max-age=${cacheSettings.sMaxAge}`;
        break;

      case 'dynamic':
        // Dynamic content with revalidation
        headers['Cache-Control'] = [
          'public',
          'max-age=0',
          'must-revalidate',
          `s-maxage=${cacheSettings.sMaxAge}`,
          `stale-while-revalidate=${cacheSettings.staleWhileRevalidate}`,
        ].join(', ');
        break;

      case 'api':
        // API responses with shorter cache
        headers['Cache-Control'] = [
          'public',
          'max-age=0',
          'must-revalidate',
          's-maxage=60',
          'stale-while-revalidate=300',
        ].join(', ');
        break;
    }

    // Add surrogate keys for targeted purging
    headers['Surrogate-Key'] = assetType;
    
    return headers;
  }
}

/**
 * CDN preload manager for critical assets
 */
export class CDNPreloadManager {
  private criticalAssets: Set<string> = new Set();
  private urlBuilder: CDNUrlBuilder;

  constructor() {
    this.urlBuilder = new CDNUrlBuilder();
  }

  /**
   * Add critical asset for preloading
   */
  addCriticalAsset(path: string, options?: any): void {
    const url = this.urlBuilder.buildUrl(path, options);
    this.criticalAssets.add(url);
  }

  /**
   * Generate preload link tags for critical assets
   */
  generatePreloadTags(): string[] {
    const tags: string[] = [];

    this.criticalAssets.forEach(url => {
      const asType = this.getAssetType(url);
      tags.push(`<link rel="preload" href="${url}" as="${asType}">`);
    });

    return tags;
  }

  /**
   * Inject preload tags into document head
   */
  injectPreloadTags(): void {
    if (typeof document === 'undefined') return;

    this.criticalAssets.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = url;
      link.as = this.getAssetType(url);
      
      // Add crossorigin for fonts and scripts
      if (link.as === 'font' || link.as === 'script') {
        link.crossOrigin = 'anonymous';
      }
      
      document.head.appendChild(link);
    });
  }

  /**
   * Determine asset type from URL
   */
  private getAssetType(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'js':
        return 'script';
      case 'css':
        return 'style';
      case 'woff':
      case 'woff2':
      case 'ttf':
      case 'otf':
        return 'font';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'webp':
      case 'avif':
      case 'gif':
        return 'image';
      case 'mp4':
      case 'webm':
        return 'video';
      default:
        return 'fetch';
    }
  }

  /**
   * Clear critical assets
   */
  clear(): void {
    this.criticalAssets.clear();
  }
}

// Export singleton instances
export const cdnUrlBuilder = new CDNUrlBuilder();
export const cdnCacheManager = new CDNCacheManager();
export const cdnPreloadManager = new CDNPreloadManager();

// Helper functions
export function getCDNUrl(path: string, options?: any): string {
  return cdnUrlBuilder.buildUrl(path, options);
}

export function preloadCriticalAsset(path: string, options?: any): void {
  cdnPreloadManager.addCriticalAsset(path, options);
}

export default {
  config: getCDNConfig(),
  urlBuilder: cdnUrlBuilder,
  cacheManager: cdnCacheManager,
  preloadManager: cdnPreloadManager,
};