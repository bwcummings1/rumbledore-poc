/**
 * Compression Middleware
 * Handles request/response compression for optimal bandwidth usage
 */

import { NextRequest, NextResponse } from 'next/server';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);
const gunzip = promisify(zlib.gunzip);
const brotliDecompress = promisify(zlib.brotliDecompress);

export interface CompressionOptions {
  threshold: number; // Minimum size in bytes to compress
  level: number; // Compression level (1-9 for gzip, 0-11 for brotli)
  preferBrotli: boolean; // Prefer Brotli over gzip when available
  excludePatterns: RegExp[]; // Patterns to exclude from compression
  includePatterns: RegExp[]; // Patterns to always compress
  cacheCompressed: boolean; // Cache compressed responses
}

const defaultOptions: CompressionOptions = {
  threshold: 1024, // 1KB
  level: 6, // Balanced compression
  preferBrotli: true,
  excludePatterns: [
    /\.(jpg|jpeg|png|gif|webp|avif|svg|woff|woff2|ttf|otf)$/i, // Already compressed formats
    /^\/api\/stream/, // Streaming endpoints
    /^\/api\/ws/, // WebSocket endpoints
  ],
  includePatterns: [
    /^\/api\//, // All API routes
    /\.json$/, // JSON responses
    /\.xml$/, // XML responses
    /\.csv$/, // CSV data
  ],
  cacheCompressed: true,
};

// Compression cache for frequently accessed responses
const compressionCache = new Map<string, Buffer>();
const CACHE_MAX_SIZE = 100; // Maximum number of cached responses
const CACHE_TTL = 60000; // 1 minute TTL

interface CachedCompression {
  data: Buffer;
  encoding: string;
  timestamp: number;
}

/**
 * Compression middleware for Next.js
 */
export function compressionMiddleware(options: Partial<CompressionOptions> = {}) {
  const config = { ...defaultOptions, ...options };

  return async function middleware(
    req: NextRequest,
    res: NextResponse
  ): Promise<NextResponse> {
    // Check if compression should be applied
    if (!shouldCompress(req, config)) {
      return res;
    }

    // Get accepted encodings
    const acceptEncoding = req.headers.get('accept-encoding') || '';
    const supportsBrotli = acceptEncoding.includes('br');
    const supportsGzip = acceptEncoding.includes('gzip');

    if (!supportsBrotli && !supportsGzip) {
      return res; // Client doesn't support compression
    }

    // Determine compression method
    const encoding = config.preferBrotli && supportsBrotli ? 'br' : 
                     supportsGzip ? 'gzip' : null;

    if (!encoding) {
      return res;
    }

    // Compress response body
    const compressedBody = await compressResponse(res, encoding, config);
    
    if (!compressedBody) {
      return res; // Compression failed or not needed
    }

    // Create new response with compressed body
    const compressedResponse = new NextResponse(compressedBody, {
      status: res.status,
      statusText: res.statusText,
      headers: new Headers(res.headers),
    });

    // Set compression headers
    compressedResponse.headers.set('Content-Encoding', encoding);
    compressedResponse.headers.set('Vary', 'Accept-Encoding');
    compressedResponse.headers.delete('Content-Length'); // Remove as it changes
    
    // Add compression stats
    const originalSize = res.headers.get('content-length');
    if (originalSize) {
      const compressionRatio = (compressedBody.length / parseInt(originalSize)) * 100;
      compressedResponse.headers.set('X-Compression-Ratio', compressionRatio.toFixed(2));
    }

    return compressedResponse;
  };
}

/**
 * Check if request should be compressed
 */
function shouldCompress(req: NextRequest, config: CompressionOptions): boolean {
  const { pathname } = req.nextUrl;

  // Check exclude patterns
  if (config.excludePatterns.some(pattern => pattern.test(pathname))) {
    return false;
  }

  // Check include patterns (override excludes)
  if (config.includePatterns.some(pattern => pattern.test(pathname))) {
    return true;
  }

  // Check if it's an API route
  if (pathname.startsWith('/api/')) {
    return true;
  }

  return false;
}

/**
 * Compress response body
 */
async function compressResponse(
  res: NextResponse,
  encoding: string,
  config: CompressionOptions
): Promise<Buffer | null> {
  try {
    // Get response body
    const body = await res.text();
    
    // Check threshold
    if (Buffer.byteLength(body) < config.threshold) {
      return null;
    }

    // Check cache
    if (config.cacheCompressed) {
      const cacheKey = `${encoding}:${body.substring(0, 100)}`; // Use first 100 chars as key
      const cached = compressionCache.get(cacheKey) as CachedCompression;
      
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
    }

    // Compress based on encoding
    let compressed: Buffer;
    if (encoding === 'br') {
      compressed = await brotli(body, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: config.level,
        },
      });
    } else {
      compressed = await gzip(body, { level: config.level });
    }

    // Cache if enabled
    if (config.cacheCompressed) {
      const cacheKey = `${encoding}:${body.substring(0, 100)}`;
      
      // Manage cache size
      if (compressionCache.size >= CACHE_MAX_SIZE) {
        const firstKey = compressionCache.keys().next().value;
        compressionCache.delete(firstKey);
      }
      
      compressionCache.set(cacheKey, {
        data: compressed,
        encoding,
        timestamp: Date.now(),
      } as CachedCompression);
    }

    return compressed;
  } catch (error) {
    console.error('Compression error:', error);
    return null;
  }
}

/**
 * Decompress request body middleware
 */
export async function decompressRequest(req: NextRequest): Promise<any> {
  const contentEncoding = req.headers.get('content-encoding');
  
  if (!contentEncoding) {
    return req.body;
  }

  try {
    const body = await req.arrayBuffer();
    const buffer = Buffer.from(body);

    switch (contentEncoding) {
      case 'gzip':
        return await gunzip(buffer);
      case 'br':
        return await brotliDecompress(buffer);
      case 'deflate':
        return await promisify(zlib.inflate)(buffer);
      default:
        return buffer;
    }
  } catch (error) {
    console.error('Decompression error:', error);
    throw new Error('Failed to decompress request body');
  }
}

/**
 * Express/Connect-style compression middleware
 */
export function createCompressionMiddleware(options: Partial<CompressionOptions> = {}) {
  const config = { ...defaultOptions, ...options };

  return async (req: any, res: any, next: any) => {
    // Skip if already compressed
    if (res.headersSent || res.getHeader('content-encoding')) {
      return next();
    }

    // Check if should compress
    const shouldCompressPath = !config.excludePatterns.some(
      pattern => pattern.test(req.path)
    );

    if (!shouldCompressPath) {
      return next();
    }

    // Get accepted encodings
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const supportsBrotli = acceptEncoding.includes('br');
    const supportsGzip = acceptEncoding.includes('gzip');

    if (!supportsBrotli && !supportsGzip) {
      return next();
    }

    // Store original methods
    const originalWrite = res.write;
    const originalEnd = res.end;
    const originalJson = res.json;
    const originalSend = res.send;

    let chunks: Buffer[] = [];
    let encoding: string | null = null;

    // Override write method
    res.write = function(chunk: any, ...args: any[]) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return true;
    };

    // Override end method
    res.end = async function(chunk: any, ...args: any[]) {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const body = Buffer.concat(chunks);

      // Check threshold
      if (body.length < config.threshold) {
        originalWrite.call(res, body);
        return originalEnd.call(res);
      }

      // Determine encoding
      encoding = config.preferBrotli && supportsBrotli ? 'br' : 
                supportsGzip ? 'gzip' : null;

      if (!encoding) {
        originalWrite.call(res, body);
        return originalEnd.call(res);
      }

      try {
        // Compress
        let compressed: Buffer;
        if (encoding === 'br') {
          compressed = await brotli(body, {
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: config.level,
            },
          });
        } else {
          compressed = await gzip(body, { level: config.level });
        }

        // Set headers
        res.setHeader('Content-Encoding', encoding);
        res.setHeader('Vary', 'Accept-Encoding');
        res.removeHeader('Content-Length');

        // Add compression stats
        const compressionRatio = (compressed.length / body.length) * 100;
        res.setHeader('X-Compression-Ratio', compressionRatio.toFixed(2));

        // Send compressed
        originalWrite.call(res, compressed);
        originalEnd.call(res);
      } catch (error) {
        console.error('Compression error:', error);
        originalWrite.call(res, body);
        originalEnd.call(res);
      }
    };

    // Override json method
    res.json = function(obj: any) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(obj));
    };

    // Override send method
    res.send = function(data: any) {
      if (typeof data === 'object') {
        return res.json(data);
      }
      return res.end(data);
    };

    next();
  };
}

/**
 * Streaming compression for large responses
 */
export class StreamingCompressor {
  private stream: zlib.Gzip | zlib.BrotliCompress;
  private encoding: string;

  constructor(encoding: 'gzip' | 'br' = 'gzip', options: any = {}) {
    this.encoding = encoding;
    
    if (encoding === 'br') {
      this.stream = zlib.createBrotliCompress({
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: options.level || 6,
        },
      });
    } else {
      this.stream = zlib.createGzip({ level: options.level || 6 });
    }
  }

  write(chunk: Buffer | string): void {
    this.stream.write(chunk);
  }

  end(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      
      this.stream.on('data', (chunk) => chunks.push(chunk));
      this.stream.on('end', () => resolve(Buffer.concat(chunks)));
      this.stream.on('error', reject);
      
      this.stream.end();
    });
  }

  pipe(destination: any): void {
    this.stream.pipe(destination);
  }

  getEncoding(): string {
    return this.encoding;
  }
}

/**
 * Compress data utility
 */
export async function compressData(
  data: string | Buffer,
  encoding: 'gzip' | 'br' = 'gzip',
  level?: number
): Promise<Buffer> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

  if (encoding === 'br') {
    return await brotli(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: level || 6,
      },
    });
  } else {
    return await gzip(buffer, { level: level || 6 });
  }
}

/**
 * Decompress data utility
 */
export async function decompressData(
  data: Buffer,
  encoding: string
): Promise<Buffer> {
  switch (encoding) {
    case 'gzip':
      return await gunzip(data);
    case 'br':
      return await brotliDecompress(data);
    case 'deflate':
      return await promisify(zlib.inflate)(data);
    default:
      throw new Error(`Unsupported encoding: ${encoding}`);
  }
}

/**
 * Calculate compression ratio
 */
export function calculateCompressionRatio(
  originalSize: number,
  compressedSize: number
): number {
  return ((originalSize - compressedSize) / originalSize) * 100;
}

/**
 * Get optimal compression level based on content type
 */
export function getOptimalCompressionLevel(
  contentType: string,
  size: number
): number {
  // JSON and text benefit from higher compression
  if (contentType.includes('json') || contentType.includes('text')) {
    return size > 10000 ? 8 : 6; // Higher for larger files
  }
  
  // Binary data uses lower compression
  if (contentType.includes('octet-stream')) {
    return 4;
  }
  
  // Default balanced compression
  return 6;
}

export default compressionMiddleware;