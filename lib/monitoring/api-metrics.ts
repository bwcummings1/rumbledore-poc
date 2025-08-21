/**
 * API Performance Metrics
 * Tracks and analyzes API endpoint performance
 */

import performanceMonitor from './performance-monitor';
import { NextRequest, NextResponse } from 'next/server';

export interface ApiMetric {
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: number;
  requestSize?: number;
  responseSize?: number;
  error?: string;
  userId?: string;
  leagueId?: string;
  cacheHit?: boolean;
}

export interface ApiEndpointStats {
  endpoint: string;
  calls: number;
  errors: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  minDuration: number;
  maxDuration: number;
  errorRate: number;
  avgRequestSize: number;
  avgResponseSize: number;
  cacheHitRate: number;
}

class ApiMetricsCollector {
  private metrics: Map<string, ApiMetric[]>;
  private endpointStats: Map<string, ApiEndpointStats>;
  private slowEndpoints: Set<string>;
  private errorEndpoints: Set<string>;
  private readonly SLOW_THRESHOLD = 1000; // 1 second
  private readonly ERROR_RATE_THRESHOLD = 0.05; // 5% error rate

  constructor() {
    this.metrics = new Map();
    this.endpointStats = new Map();
    this.slowEndpoints = new Set();
    this.errorEndpoints = new Set();
    
    // Update stats periodically
    setInterval(() => this.updateStats(), 60000); // Every minute
  }

  /**
   * Middleware to track API performance
   */
  middleware() {
    return async (req: NextRequest, handler: Function) => {
      const startTime = Date.now();
      const endpoint = this.normalizeEndpoint(req.nextUrl.pathname);
      const method = req.method;
      
      // Get request size
      const requestSize = this.getRequestSize(req);
      
      let statusCode = 200;
      let responseSize = 0;
      let error: string | undefined;
      let cacheHit = false;
      
      try {
        // Call the actual handler
        const response = await handler(req);
        
        // Extract response info
        statusCode = response.status;
        responseSize = this.getResponseSize(response);
        cacheHit = response.headers.get('X-Cache') === 'HIT';
        
        // Track the metric
        const duration = Date.now() - startTime;
        this.recordMetric({
          endpoint,
          method,
          statusCode,
          duration,
          timestamp: Date.now(),
          requestSize,
          responseSize,
          cacheHit,
          userId: this.extractUserId(req),
          leagueId: this.extractLeagueId(req),
        });
        
        // Add performance headers
        response.headers.set('X-Response-Time', `${duration}ms`);
        response.headers.set('X-Request-Id', this.generateRequestId());
        
        return response;
      } catch (err) {
        statusCode = 500;
        error = err instanceof Error ? err.message : 'Unknown error';
        
        const duration = Date.now() - startTime;
        this.recordMetric({
          endpoint,
          method,
          statusCode,
          duration,
          timestamp: Date.now(),
          requestSize,
          error,
          userId: this.extractUserId(req),
          leagueId: this.extractLeagueId(req),
        });
        
        throw err;
      }
    };
  }

  recordMetric(metric: ApiMetric) {
    const key = `${metric.method}:${metric.endpoint}`;
    
    // Store metric
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    const metricsList = this.metrics.get(key)!;
    metricsList.push(metric);
    
    // Keep only last 1000 metrics per endpoint
    if (metricsList.length > 1000) {
      metricsList.splice(0, metricsList.length - 1000);
    }
    
    // Report to performance monitor
    performanceMonitor.recordApiPerformance(
      metric.endpoint,
      metric.method,
      metric.statusCode,
      metric.duration
    );
    
    // Check for slow endpoints
    if (metric.duration > this.SLOW_THRESHOLD) {
      this.slowEndpoints.add(key);
      console.warn(
        `Slow API endpoint: ${metric.method} ${metric.endpoint} took ${metric.duration}ms`
      );
    }
    
    // Check for errors
    if (metric.statusCode >= 500 || metric.error) {
      this.errorEndpoints.add(key);
      console.error(
        `API error: ${metric.method} ${metric.endpoint} - ${metric.statusCode} ${metric.error || ''}`
      );
    }
  }

  private normalizeEndpoint(pathname: string): string {
    // Replace dynamic segments with placeholders
    return pathname
      .replace(/\/[a-f0-9-]{36}/g, '/:id') // UUIDs
      .replace(/\/\d+/g, '/:id') // Numeric IDs
      .replace(/\?.*$/, ''); // Remove query params
  }

  private getRequestSize(req: NextRequest): number {
    try {
      const contentLength = req.headers.get('content-length');
      if (contentLength) {
        return parseInt(contentLength, 10);
      }
      
      // Estimate based on URL and headers
      const urlSize = req.url.length;
      const headersSize = Array.from(req.headers.entries())
        .reduce((sum, [key, value]) => sum + key.length + value.length, 0);
      
      return urlSize + headersSize;
    } catch {
      return 0;
    }
  }

  private getResponseSize(response: NextResponse): number {
    try {
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        return parseInt(contentLength, 10);
      }
      
      // Estimate if not available
      return 0;
    } catch {
      return 0;
    }
  }

  private extractUserId(req: NextRequest): string | undefined {
    // Try to extract from JWT token or session
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      // Parse JWT or session token
      // This is a simplified example
      return undefined;
    }
    
    return undefined;
  }

  private extractLeagueId(req: NextRequest): string | undefined {
    // Extract from URL path
    const matches = req.nextUrl.pathname.match(/leagues\/([^\/]+)/);
    return matches ? matches[1] : undefined;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateStats() {
    this.endpointStats.clear();
    
    this.metrics.forEach((metricsList, key) => {
      if (metricsList.length === 0) return;
      
      const [method, endpoint] = key.split(':');
      const durations = metricsList.map(m => m.duration).sort((a, b) => a - b);
      const errors = metricsList.filter(m => m.statusCode >= 400).length;
      const cacheHits = metricsList.filter(m => m.cacheHit).length;
      
      const stats: ApiEndpointStats = {
        endpoint,
        calls: metricsList.length,
        errors,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        p50Duration: durations[Math.floor(durations.length * 0.5)],
        p95Duration: durations[Math.floor(durations.length * 0.95)],
        p99Duration: durations[Math.floor(durations.length * 0.99)],
        minDuration: durations[0],
        maxDuration: durations[durations.length - 1],
        errorRate: errors / metricsList.length,
        avgRequestSize: 
          metricsList.reduce((sum, m) => sum + (m.requestSize || 0), 0) / metricsList.length,
        avgResponseSize:
          metricsList.reduce((sum, m) => sum + (m.responseSize || 0), 0) / metricsList.length,
        cacheHitRate: cacheHits / metricsList.length,
      };
      
      this.endpointStats.set(key, stats);
      
      // Check for problematic endpoints
      if (stats.errorRate > this.ERROR_RATE_THRESHOLD) {
        console.warn(
          `High error rate on ${method} ${endpoint}: ${(stats.errorRate * 100).toFixed(1)}%`
        );
      }
      
      if (stats.p95Duration > this.SLOW_THRESHOLD) {
        console.warn(
          `Slow p95 on ${method} ${endpoint}: ${stats.p95Duration}ms`
        );
      }
    });
  }

  getStats(endpoint?: string): ApiEndpointStats[] {
    if (endpoint) {
      const stats = this.endpointStats.get(endpoint);
      return stats ? [stats] : [];
    }
    
    return Array.from(this.endpointStats.values());
  }

  getSlowestEndpoints(limit: number = 10): ApiEndpointStats[] {
    return Array.from(this.endpointStats.values())
      .sort((a, b) => b.p95Duration - a.p95Duration)
      .slice(0, limit);
  }

  getMostErrorProne(limit: number = 10): ApiEndpointStats[] {
    return Array.from(this.endpointStats.values())
      .filter(s => s.errors > 0)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, limit);
  }

  getMostCalled(limit: number = 10): ApiEndpointStats[] {
    return Array.from(this.endpointStats.values())
      .sort((a, b) => b.calls - a.calls)
      .slice(0, limit);
  }

  generateReport(): string {
    const report: string[] = ['=== API Performance Report ===\n'];
    
    // Overall statistics
    const allMetrics = Array.from(this.metrics.values()).flat();
    const totalCalls = allMetrics.length;
    const totalErrors = allMetrics.filter(m => m.statusCode >= 400).length;
    const avgDuration = allMetrics.reduce((sum, m) => sum + m.duration, 0) / totalCalls;
    
    report.push('Overall Statistics:');
    report.push(`  Total API Calls: ${totalCalls}`);
    report.push(`  Total Errors: ${totalErrors} (${((totalErrors / totalCalls) * 100).toFixed(1)}%)`);
    report.push(`  Average Duration: ${avgDuration.toFixed(0)}ms`);
    report.push('');
    
    // Slowest endpoints
    report.push('Slowest Endpoints (p95):');
    this.getSlowestEndpoints(5).forEach(stats => {
      report.push(`  ${stats.endpoint}: ${stats.p95Duration}ms (${stats.calls} calls)`);
    });
    report.push('');
    
    // Most error-prone
    report.push('Most Error-Prone Endpoints:');
    this.getMostErrorProne(5).forEach(stats => {
      report.push(
        `  ${stats.endpoint}: ${(stats.errorRate * 100).toFixed(1)}% errors (${stats.errors}/${stats.calls})`
      );
    });
    report.push('');
    
    // Most called
    report.push('Most Called Endpoints:');
    this.getMostCalled(5).forEach(stats => {
      report.push(
        `  ${stats.endpoint}: ${stats.calls} calls (avg ${stats.avgDuration.toFixed(0)}ms)`
      );
    });
    
    // Cache effectiveness
    const endpointsWithCache = Array.from(this.endpointStats.values())
      .filter(s => s.cacheHitRate > 0);
    
    if (endpointsWithCache.length > 0) {
      report.push('');
      report.push('Cache Effectiveness:');
      endpointsWithCache
        .sort((a, b) => b.cacheHitRate - a.cacheHitRate)
        .slice(0, 5)
        .forEach(stats => {
          report.push(
            `  ${stats.endpoint}: ${(stats.cacheHitRate * 100).toFixed(1)}% hit rate`
          );
        });
    }
    
    return report.join('\n');
  }

  reset() {
    this.metrics.clear();
    this.endpointStats.clear();
    this.slowEndpoints.clear();
    this.errorEndpoints.clear();
  }

  exportMetrics(): ApiMetric[] {
    const allMetrics: ApiMetric[] = [];
    this.metrics.forEach(metricsList => {
      allMetrics.push(...metricsList);
    });
    return allMetrics;
  }
}

// Singleton instance
export const apiMetrics = new ApiMetricsCollector();

// Helper function to wrap API handlers with metrics
export function withApiMetrics<T>(
  handler: (req: NextRequest) => Promise<NextResponse<T>>
) {
  return async (req: NextRequest): Promise<NextResponse<T>> => {
    const startTime = Date.now();
    const endpoint = req.nextUrl.pathname;
    const method = req.method;
    
    try {
      const response = await handler(req);
      const duration = Date.now() - startTime;
      
      apiMetrics.recordMetric({
        endpoint,
        method,
        statusCode: response.status,
        duration,
        timestamp: Date.now(),
        cacheHit: response.headers.get('X-Cache') === 'HIT',
      });
      
      // Add performance headers
      response.headers.set('X-Response-Time', `${duration}ms`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      apiMetrics.recordMetric({
        endpoint,
        method,
        statusCode: 500,
        duration,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  };
}

export default apiMetrics;