/**
 * CDN Middleware
 * Handles asset routing, optimization, and CDN integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCDNConfig, cdnCacheManager } from '@/lib/cdn/cdn-config';

// Asset patterns that should be served through CDN
const CDN_ASSET_PATTERNS = [
  /^\/_next\/static\//,
  /^\/images\//,
  /^\/fonts\//,
  /^\/videos\//,
  /^\/downloads\//,
  /\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico)$/i,
  /\.(?:woff|woff2|ttf|otf|eot)$/i,
  /\.(?:css|js)$/i,
];

// Patterns that should bypass CDN
const CDN_BYPASS_PATTERNS = [
  /^\/api\//,
  /^\/admin\//,
  /^\/_next\/data\//,
  /^\/sw\.js$/,
  /^\/manifest\.json$/,
];

export function cdnMiddleware(request: NextRequest): NextResponse | null {
  const config = getCDNConfig();
  
  // Skip if CDN is not enabled
  if (!config.enabled) {
    return null;
  }

  const { pathname } = request.nextUrl;

  // Check if request should bypass CDN
  if (shouldBypassCDN(pathname)) {
    return null;
  }

  // Check if request is for a CDN asset
  if (shouldUseCDN(pathname)) {
    return handleCDNAsset(request, config);
  }

  // Add CDN headers to HTML responses
  if (pathname === '/' || pathname.endsWith('.html')) {
    return addCDNHeaders(request);
  }

  return null;
}

/**
 * Check if path should bypass CDN
 */
function shouldBypassCDN(pathname: string): boolean {
  return CDN_BYPASS_PATTERNS.some(pattern => pattern.test(pathname));
}

/**
 * Check if path should use CDN
 */
function shouldUseCDN(pathname: string): boolean {
  return CDN_ASSET_PATTERNS.some(pattern => pattern.test(pathname));
}

/**
 * Handle CDN asset request
 */
function handleCDNAsset(request: NextRequest, config: any): NextResponse {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // Determine asset type
  const assetType = getAssetType(pathname);
  
  // Add cache headers
  const cacheHeaders = cdnCacheManager.getCacheHeaders(assetType);
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Add CORS headers for CDN assets
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  response.headers.set('Access-Control-Max-Age', '86400');

  // Add timing headers
  response.headers.set('Timing-Allow-Origin', '*');

  // Add compression hints
  if (config.features.compression) {
    response.headers.set('Accept-Encoding', 'gzip, deflate, br');
  }

  // Add server push hints for critical resources
  if (config.features.http2Push && isCriticalResource(pathname)) {
    response.headers.append('Link', `<${pathname}>; rel=preload; as=${getResourceType(pathname)}`);
  }

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');

  return response;
}

/**
 * Add CDN-related headers to HTML responses
 */
function addCDNHeaders(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  
  // Add resource hints for CDN
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (cdnUrl) {
    // DNS prefetch
    response.headers.append('Link', `<${cdnUrl}>; rel=dns-prefetch`);
    
    // Preconnect
    response.headers.append('Link', `<${cdnUrl}>; rel=preconnect; crossorigin`);
  }

  // Add Content Security Policy for CDN
  const csp = response.headers.get('Content-Security-Policy') || '';
  const updatedCsp = updateCSPForCDN(csp, cdnUrl);
  response.headers.set('Content-Security-Policy', updatedCsp);

  return response;
}

/**
 * Determine asset type from pathname
 */
function getAssetType(pathname: string): 'static' | 'dynamic' | 'api' {
  if (pathname.startsWith('/_next/static/') || pathname.match(/\.(js|css|woff2?|ttf|otf)$/)) {
    return 'static';
  }
  if (pathname.startsWith('/api/')) {
    return 'api';
  }
  return 'dynamic';
}

/**
 * Check if resource is critical (should be pushed)
 */
function isCriticalResource(pathname: string): boolean {
  return pathname.includes('main') || 
         pathname.includes('app') || 
         pathname.includes('vendor') || 
         pathname.includes('framework');
}

/**
 * Get resource type for server push
 */
function getResourceType(pathname: string): string {
  if (pathname.endsWith('.js')) return 'script';
  if (pathname.endsWith('.css')) return 'style';
  if (pathname.match(/\.(woff2?|ttf|otf)$/)) return 'font';
  if (pathname.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/)) return 'image';
  return 'fetch';
}

/**
 * Update Content Security Policy for CDN
 */
function updateCSPForCDN(csp: string, cdnUrl?: string): string {
  if (!cdnUrl) return csp;

  const cdnDomain = new URL(cdnUrl).hostname;
  
  // Parse existing CSP
  const directives = csp.split(';').reduce((acc, directive) => {
    const [key, ...values] = directive.trim().split(' ');
    if (key) {
      acc[key] = values;
    }
    return acc;
  }, {} as Record<string, string[]>);

  // Update directives for CDN
  const directivesToUpdate = [
    'default-src',
    'script-src',
    'style-src',
    'img-src',
    'font-src',
    'connect-src',
  ];

  directivesToUpdate.forEach(directive => {
    if (!directives[directive]) {
      directives[directive] = ["'self'"];
    }
    if (!directives[directive].includes(cdnDomain)) {
      directives[directive].push(cdnDomain);
    }
  });

  // Rebuild CSP string
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Edge function for CDN routing
 */
export async function cdnEdgeFunction(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const config = getCDNConfig();

  // Skip if CDN is not enabled
  if (!config.enabled) {
    return fetch(request);
  }

  // Check if request should be routed through CDN
  if (shouldUseCDN(url.pathname)) {
    const cdnUrl = `${config.baseUrl}${url.pathname}${url.search}`;
    
    // Create new request with CDN URL
    const cdnRequest = new Request(cdnUrl, {
      method: request.method,
      headers: request.headers,
    });

    // Fetch from CDN
    const response = await fetch(cdnRequest);

    // Clone response and add custom headers
    const modifiedResponse = new Response(response.body, response);
    modifiedResponse.headers.set('X-CDN-Cache', response.headers.get('CF-Cache-Status') || 'UNKNOWN');
    modifiedResponse.headers.set('X-CDN-Provider', config.provider);

    return modifiedResponse;
  }

  // Pass through for non-CDN requests
  return fetch(request);
}

/**
 * Optimize asset URLs in HTML
 */
export function optimizeAssetUrls(html: string, cdnUrl: string): string {
  // Replace local asset URLs with CDN URLs
  const patterns = [
    // Static assets
    { pattern: /href="(\/_next\/static\/[^"]+)"/g, replacement: `href="${cdnUrl}$1"` },
    { pattern: /src="(\/_next\/static\/[^"]+)"/g, replacement: `src="${cdnUrl}$1"` },
    
    // Images
    { pattern: /src="(\/images\/[^"]+)"/g, replacement: `src="${cdnUrl}$1"` },
    { pattern: /srcset="([^"]+)"/g, replacement: (match: string, srcset: string) => {
      const optimized = srcset.split(',').map(src => {
        const [url, size] = src.trim().split(' ');
        if (url.startsWith('/')) {
          return `${cdnUrl}${url} ${size || ''}`.trim();
        }
        return src;
      }).join(', ');
      return `srcset="${optimized}"`;
    }},
    
    // Fonts
    { pattern: /url\(["']?(\/fonts\/[^"')]+)["']?\)/g, replacement: `url('${cdnUrl}$1')` },
  ];

  let optimizedHtml = html;
  patterns.forEach(({ pattern, replacement }) => {
    if (typeof replacement === 'string') {
      optimizedHtml = optimizedHtml.replace(pattern, replacement);
    } else {
      optimizedHtml = optimizedHtml.replace(pattern, replacement);
    }
  });

  return optimizedHtml;
}

/**
 * Generate CDN purge list for deployment
 */
export function generatePurgeList(changedFiles: string[]): string[] {
  const purgeList: string[] = [];
  
  changedFiles.forEach(file => {
    // Add the file itself
    purgeList.push(file);
    
    // Add related assets
    if (file.endsWith('.js')) {
      purgeList.push(file.replace('.js', '.js.map'));
    }
    if (file.endsWith('.css')) {
      purgeList.push(file.replace('.css', '.css.map'));
    }
    
    // Add HTML pages that might reference this asset
    if (file.includes('/_next/static/')) {
      purgeList.push('/');
      purgeList.push('/*');
    }
  });

  // Remove duplicates
  return Array.from(new Set(purgeList));
}

export default cdnMiddleware;