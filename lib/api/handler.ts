import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import performanceMonitor from '../monitoring/performance-monitor';
import { apiMetrics } from '../monitoring/api-metrics';
import { withCache, CacheOptions } from '../cache/response-cache';
import { compressData, calculateCompressionRatio } from '../middleware/compression';

export interface ApiContext {
  params?: Record<string, string>;
  user?: { id: string; email: string; username: string };
  league?: { id: string; sandboxNamespace: string };
}

export type ApiHandler<T = any> = (
  request: NextRequest,
  context: ApiContext
) => Promise<NextResponse<T>>;

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiHandlerOptions {
  cache?: CacheOptions | boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  compress?: boolean;
}

export function createApiHandler<T>(
  handler: ApiHandler<T>,
  options: ApiHandlerOptions = {}
): ApiHandler<T> {
  return async (request, context) => {
    const startTime = Date.now();
    const endpoint = request.nextUrl.pathname;
    const method = request.method;
    
    try {
      // Log incoming request in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] ${method} ${endpoint}`);
      }
      
      // Apply caching if configured
      let wrappedHandler = handler;
      if (options.cache && method === 'GET') {
        const cacheOptions = typeof options.cache === 'boolean' 
          ? {} 
          : options.cache;
        wrappedHandler = withCache(handler, cacheOptions);
      }
      
      let response = await wrappedHandler(request, context);
      const duration = Date.now() - startTime;
      
      // Add performance headers
      response.headers.set('X-Response-Time', `${duration}ms`);
      response.headers.set('X-Request-Id', generateRequestId());
      
      // Apply compression if configured and supported
      if (options.compress !== false && method !== 'HEAD') {
        const acceptEncoding = request.headers.get('accept-encoding') || '';
        const supportsBrotli = acceptEncoding.includes('br');
        const supportsGzip = acceptEncoding.includes('gzip');
        
        if (supportsBrotli || supportsGzip) {
          try {
            const body = await response.text();
            
            // Only compress if body is large enough (> 1KB)
            if (body.length > 1024) {
              const encoding = supportsBrotli ? 'br' : 'gzip';
              const compressed = await compressData(body, encoding as 'br' | 'gzip');
              const ratio = calculateCompressionRatio(body.length, compressed.length);
              
              response = new NextResponse(compressed, {
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers),
              });
              
              response.headers.set('Content-Encoding', encoding);
              response.headers.set('Vary', 'Accept-Encoding');
              response.headers.set('X-Compression-Ratio', `${ratio.toFixed(2)}%`);
              response.headers.delete('Content-Length');
            }
          } catch (error) {
            console.error('Compression failed:', error);
            // Continue with uncompressed response
          }
        }
      }
      
      // Record metrics
      apiMetrics.recordMetric({
        endpoint,
        method,
        statusCode: response.status,
        duration,
        timestamp: Date.now(),
        userId: context.user?.id,
        leagueId: context.league?.id,
        cacheHit: response.headers.get('X-Cache') === 'HIT',
      });
      
      // Record to performance monitor
      performanceMonitor.recordApiPerformance(
        endpoint,
        method,
        response.status,
        duration
      );
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] ${method} ${endpoint} - ${duration}ms`);
      }
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Record error metrics
      apiMetrics.recordMetric({
        endpoint,
        method,
        statusCode: 500,
        duration,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: context.user?.id,
        leagueId: context.league?.id,
      });
      
      console.error('[API Error]:', error);
      
      if (error instanceof ApiError) {
        return NextResponse.json(
          { 
            error: error.message, 
            code: error.code 
          },
          { status: error.statusCode }
        );
      }
      
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'Validation Error', 
            details: error.errors 
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }
  };
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  return schema.parse(data);
}

export async function parseRequestBody(request: NextRequest): Promise<any> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function createErrorResponse(
  message: string,
  status: number = 400,
  code?: string
): NextResponse {
  return NextResponse.json(
    { error: message, code },
    { status }
  );
}