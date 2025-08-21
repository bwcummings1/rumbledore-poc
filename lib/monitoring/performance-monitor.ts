/**
 * Performance Monitoring Module
 * Tracks and reports application performance metrics
 */

import { EventEmitter } from 'events';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'kb' | 'mb' | 'count' | 'percent';
  timestamp: number;
  tags?: Record<string, string>;
}

export interface ApiPerformanceMetric extends PerformanceMetric {
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
}

export interface DatabasePerformanceMetric extends PerformanceMetric {
  query: string;
  operation: 'select' | 'insert' | 'update' | 'delete';
  duration: number;
  rowCount?: number;
}

export interface WebVitalMetric {
  name: 'FCP' | 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
  url?: string;
}

class PerformanceMonitor extends EventEmitter {
  private metrics: Map<string, PerformanceMetric[]>;
  private thresholds: Map<string, number>;
  private alertCallbacks: Array<(metric: PerformanceMetric) => void>;
  private isMonitoring: boolean;
  private metricsBuffer: PerformanceMetric[];
  private flushInterval: NodeJS.Timeout | null;

  constructor() {
    super();
    this.metrics = new Map();
    this.thresholds = new Map();
    this.alertCallbacks = [];
    this.isMonitoring = false;
    this.metricsBuffer = [];
    this.flushInterval = null;
    
    this.initializeThresholds();
    this.startMonitoring();
  }

  private initializeThresholds() {
    // API Response thresholds
    this.thresholds.set('api.response', 200); // 200ms
    this.thresholds.set('api.response.p95', 500); // 500ms for p95
    
    // Database query thresholds
    this.thresholds.set('db.query', 100); // 100ms
    this.thresholds.set('db.query.complex', 500); // 500ms for complex queries
    
    // Web Vitals thresholds
    this.thresholds.set('webvital.lcp', 2500); // 2.5s for LCP
    this.thresholds.set('webvital.fid', 100); // 100ms for FID
    this.thresholds.set('webvital.cls', 0.1); // 0.1 for CLS
    this.thresholds.set('webvital.fcp', 1800); // 1.8s for FCP
    this.thresholds.set('webvital.ttfb', 800); // 800ms for TTFB
    
    // Bundle size thresholds
    this.thresholds.set('bundle.size', 500); // 500KB
    this.thresholds.set('bundle.chunk', 200); // 200KB per chunk
    
    // Memory thresholds
    this.thresholds.set('memory.heap', 500); // 500MB heap
    this.thresholds.set('memory.rss', 1000); // 1GB RSS
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // Start buffer flush interval (every 10 seconds)
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, 10000);

    // Monitor Node.js process metrics
    if (typeof process !== 'undefined') {
      this.monitorProcessMetrics();
    }
  }

  stopMonitoring() {
    this.isMonitoring = false;
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    this.flushMetrics();
  }

  private monitorProcessMetrics() {
    setInterval(() => {
      if (!this.isMonitoring) return;
      
      const memUsage = process.memoryUsage();
      
      this.recordMetric({
        name: 'memory.heap',
        value: Math.round(memUsage.heapUsed / 1024 / 1024),
        unit: 'mb',
        timestamp: Date.now(),
      });
      
      this.recordMetric({
        name: 'memory.rss',
        value: Math.round(memUsage.rss / 1024 / 1024),
        unit: 'mb',
        timestamp: Date.now(),
      });
      
      const cpuUsage = process.cpuUsage();
      this.recordMetric({
        name: 'cpu.user',
        value: Math.round(cpuUsage.user / 1000),
        unit: 'ms',
        timestamp: Date.now(),
      });
    }, 30000); // Every 30 seconds
  }

  recordMetric(metric: PerformanceMetric) {
    this.metricsBuffer.push(metric);
    
    // Check threshold
    const threshold = this.thresholds.get(metric.name);
    if (threshold && metric.value > threshold) {
      this.handleThresholdExceeded(metric, threshold);
    }
    
    // Emit metric event
    this.emit('metric', metric);
    
    // Auto-flush if buffer is large
    if (this.metricsBuffer.length >= 100) {
      this.flushMetrics();
    }
  }

  recordApiPerformance(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number
  ) {
    const metric: ApiPerformanceMetric = {
      name: 'api.response',
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      endpoint,
      method,
      statusCode,
      duration,
      tags: {
        endpoint,
        method,
        status: statusCode.toString(),
      },
    };
    
    this.recordMetric(metric);
    
    // Track slow requests
    if (duration > 1000) {
      console.warn(`Slow API request: ${method} ${endpoint} took ${duration}ms`);
      this.emit('slow-request', metric);
    }
  }

  recordDatabasePerformance(
    query: string,
    operation: 'select' | 'insert' | 'update' | 'delete',
    duration: number,
    rowCount?: number
  ) {
    const metric: DatabasePerformanceMetric = {
      name: 'db.query',
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      query: query.substring(0, 100), // Truncate long queries
      operation,
      duration,
      rowCount,
      tags: {
        operation,
        hasRows: (rowCount && rowCount > 0) ? 'true' : 'false',
      },
    };
    
    this.recordMetric(metric);
    
    // Track slow queries
    if (duration > 500) {
      console.warn(`Slow database query: ${operation} took ${duration}ms`);
      this.emit('slow-query', metric);
    }
  }

  recordWebVital(vital: WebVitalMetric) {
    const metric: PerformanceMetric = {
      name: `webvital.${vital.name.toLowerCase()}`,
      value: vital.value,
      unit: vital.name === 'CLS' ? 'count' : 'ms',
      timestamp: vital.timestamp,
      tags: {
        rating: vital.rating,
        url: vital.url || 'unknown',
      },
    };
    
    this.recordMetric(metric);
    
    // Alert on poor web vitals
    if (vital.rating === 'poor') {
      console.warn(`Poor Web Vital: ${vital.name} = ${vital.value}`);
      this.emit('poor-webvital', vital);
    }
  }

  trackBundleSize(bundleName: string, sizeInKB: number) {
    const metric: PerformanceMetric = {
      name: 'bundle.size',
      value: sizeInKB,
      unit: 'kb',
      timestamp: Date.now(),
      tags: {
        bundle: bundleName,
      },
    };
    
    this.recordMetric(metric);
    
    if (sizeInKB > 500) {
      console.warn(`Large bundle detected: ${bundleName} is ${sizeInKB}KB`);
      this.emit('large-bundle', metric);
    }
  }

  private handleThresholdExceeded(metric: PerformanceMetric, threshold: number) {
    const alert = {
      metric,
      threshold,
      exceededBy: metric.value - threshold,
      percentage: ((metric.value - threshold) / threshold) * 100,
    };
    
    console.warn(
      `Performance threshold exceeded: ${metric.name} = ${metric.value}${metric.unit} (threshold: ${threshold}${metric.unit})`
    );
    
    this.emit('threshold-exceeded', alert);
    
    // Call alert callbacks
    this.alertCallbacks.forEach(callback => callback(metric));
  }

  onThresholdExceeded(callback: (metric: PerformanceMetric) => void) {
    this.alertCallbacks.push(callback);
  }

  private flushMetrics() {
    if (this.metricsBuffer.length === 0) return;
    
    // Store metrics
    this.metricsBuffer.forEach(metric => {
      const key = metric.name;
      if (!this.metrics.has(key)) {
        this.metrics.set(key, []);
      }
      
      const metricsList = this.metrics.get(key)!;
      metricsList.push(metric);
      
      // Keep only last 1000 metrics per key
      if (metricsList.length > 1000) {
        metricsList.splice(0, metricsList.length - 1000);
      }
    });
    
    // Send to analytics if configured
    if (typeof window !== 'undefined' && navigator.sendBeacon) {
      const payload = JSON.stringify({
        metrics: this.metricsBuffer,
        timestamp: Date.now(),
      });
      
      navigator.sendBeacon('/api/analytics', payload);
    }
    
    // Clear buffer
    this.metricsBuffer = [];
  }

  getMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      return this.metrics.get(name) || [];
    }
    
    const allMetrics: PerformanceMetric[] = [];
    this.metrics.forEach(metrics => {
      allMetrics.push(...metrics);
    });
    
    return allMetrics;
  }

  getMetricsSummary(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;
    
    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;
    
    return {
      count,
      min: values[0],
      max: values[count - 1],
      avg: values.reduce((a, b) => a + b, 0) / count,
      p50: values[Math.floor(count * 0.5)],
      p95: values[Math.floor(count * 0.95)],
      p99: values[Math.floor(count * 0.99)],
    };
  }

  generateReport(): string {
    const report: string[] = ['=== Performance Report ===\n'];
    
    this.metrics.forEach((metrics, name) => {
      const summary = this.getMetricsSummary(name);
      if (summary) {
        report.push(`\n${name}:`);
        report.push(`  Count: ${summary.count}`);
        report.push(`  Min: ${summary.min}`);
        report.push(`  Max: ${summary.max}`);
        report.push(`  Avg: ${summary.avg.toFixed(2)}`);
        report.push(`  P50: ${summary.p50}`);
        report.push(`  P95: ${summary.p95}`);
        report.push(`  P99: ${summary.p99}`);
      }
    });
    
    return report.join('\n');
  }

  reset() {
    this.metrics.clear();
    this.metricsBuffer = [];
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Helper function for timing async operations
export async function timeAsync<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    performanceMonitor.recordMetric({
      name,
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    performanceMonitor.recordMetric({
      name: `${name}.error`,
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      tags: {
        error: 'true',
      },
    });
    
    throw error;
  }
}

// Helper function for timing sync operations
export function timeSync<T>(name: string, operation: () => T): T {
  const startTime = Date.now();
  
  try {
    const result = operation();
    const duration = Date.now() - startTime;
    
    performanceMonitor.recordMetric({
      name,
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    performanceMonitor.recordMetric({
      name: `${name}.error`,
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      tags: {
        error: 'true',
      },
    });
    
    throw error;
  }
}

export default performanceMonitor;