/**
 * Web Vitals Monitoring
 * Tracks Core Web Vitals and other performance metrics
 */

import performanceMonitor from './performance-monitor';

export interface WebVital {
  name: 'FCP' | 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'INP' | 'FP' | 'TTI';
  value: number;
  delta?: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationType?: 'navigate' | 'reload' | 'back-forward' | 'prerender';
  id: string;
  entries?: PerformanceEntry[];
}

// Thresholds based on Web Vitals standards
const WEB_VITAL_THRESHOLDS = {
  FCP: { good: 1800, poor: 3000 },    // First Contentful Paint
  LCP: { good: 2500, poor: 4000 },    // Largest Contentful Paint
  FID: { good: 100, poor: 300 },      // First Input Delay
  CLS: { good: 0.1, poor: 0.25 },     // Cumulative Layout Shift
  TTFB: { good: 800, poor: 1800 },    // Time to First Byte
  INP: { good: 200, poor: 500 },      // Interaction to Next Paint
  FP: { good: 1000, poor: 2000 },     // First Paint
  TTI: { good: 3800, poor: 7300 },    // Time to Interactive
};

class WebVitalsMonitor {
  private vitals: Map<string, WebVital>;
  private observers: Map<string, PerformanceObserver>;
  private isMonitoring: boolean;
  private reportCallback?: (vital: WebVital) => void;

  constructor() {
    this.vitals = new Map();
    this.observers = new Map();
    this.isMonitoring = false;
  }

  startMonitoring(callback?: (vital: WebVital) => void) {
    if (typeof window === 'undefined' || this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.reportCallback = callback;
    
    // Import web-vitals library dynamically
    this.loadWebVitals();
    
    // Also set up custom performance observers
    this.setupPerformanceObservers();
    
    // Monitor page visibility changes
    this.monitorPageVisibility();
  }

  private async loadWebVitals() {
    try {
      const { onFCP, onLCP, onFID, onCLS, onTTFB, onINP } = await import('web-vitals');
      
      // First Contentful Paint
      onFCP((metric) => {
        this.reportWebVital({
          name: 'FCP',
          value: metric.value,
          delta: metric.delta,
          rating: this.getRating('FCP', metric.value),
          navigationType: metric.navigationType,
          id: metric.id,
          entries: metric.entries,
        });
      });
      
      // Largest Contentful Paint
      onLCP((metric) => {
        this.reportWebVital({
          name: 'LCP',
          value: metric.value,
          delta: metric.delta,
          rating: this.getRating('LCP', metric.value),
          navigationType: metric.navigationType,
          id: metric.id,
          entries: metric.entries,
        });
      });
      
      // First Input Delay
      onFID((metric) => {
        this.reportWebVital({
          name: 'FID',
          value: metric.value,
          delta: metric.delta,
          rating: this.getRating('FID', metric.value),
          navigationType: metric.navigationType,
          id: metric.id,
          entries: metric.entries,
        });
      });
      
      // Cumulative Layout Shift
      onCLS((metric) => {
        this.reportWebVital({
          name: 'CLS',
          value: metric.value,
          delta: metric.delta,
          rating: this.getRating('CLS', metric.value),
          navigationType: metric.navigationType,
          id: metric.id,
          entries: metric.entries,
        });
      });
      
      // Time to First Byte
      onTTFB((metric) => {
        this.reportWebVital({
          name: 'TTFB',
          value: metric.value,
          delta: metric.delta,
          rating: this.getRating('TTFB', metric.value),
          navigationType: metric.navigationType,
          id: metric.id,
          entries: metric.entries,
        });
      });
      
      // Interaction to Next Paint (INP)
      onINP((metric) => {
        this.reportWebVital({
          name: 'INP',
          value: metric.value,
          delta: metric.delta,
          rating: this.getRating('INP', metric.value),
          navigationType: metric.navigationType,
          id: metric.id,
          entries: metric.entries,
        });
      });
    } catch (error) {
      console.error('Failed to load web-vitals library:', error);
    }
  }

  private setupPerformanceObservers() {
    if (!window.PerformanceObserver) return;
    
    // Observe paint entries
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-paint') {
            this.reportWebVital({
              name: 'FP',
              value: entry.startTime,
              rating: this.getRating('FP', entry.startTime),
              id: `fp-${Date.now()}`,
            });
          }
        }
      });
      
      paintObserver.observe({ entryTypes: ['paint'] });
      this.observers.set('paint', paintObserver);
    } catch (error) {
      console.error('Failed to set up paint observer:', error);
    }
    
    // Observe navigation timing
    try {
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            
            // Time to Interactive approximation
            const tti = navEntry.loadEventEnd - navEntry.fetchStart;
            if (tti > 0) {
              this.reportWebVital({
                name: 'TTI',
                value: tti,
                rating: this.getRating('TTI', tti),
                id: `tti-${Date.now()}`,
              });
            }
          }
        }
      });
      
      navObserver.observe({ entryTypes: ['navigation'] });
      this.observers.set('navigation', navObserver);
    } catch (error) {
      console.error('Failed to set up navigation observer:', error);
    }
    
    // Observe long tasks
    try {
      const taskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            // Report long tasks that block the main thread
            performanceMonitor.recordMetric({
              name: 'longtask',
              value: entry.duration,
              unit: 'ms',
              timestamp: Date.now(),
              tags: {
                startTime: entry.startTime.toString(),
              },
            });
          }
        }
      });
      
      taskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.set('longtask', taskObserver);
    } catch (error) {
      // Long task observer not supported in all browsers
    }
    
    // Observe resource timing
    try {
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const resourceEntry = entry as PerformanceResourceTiming;
          
          // Track slow resources
          if (resourceEntry.duration > 1000) {
            performanceMonitor.recordMetric({
              name: 'resource.slow',
              value: resourceEntry.duration,
              unit: 'ms',
              timestamp: Date.now(),
              tags: {
                url: resourceEntry.name.substring(0, 100),
                type: resourceEntry.initiatorType,
              },
            });
          }
        }
      });
      
      resourceObserver.observe({ entryTypes: ['resource'] });
      this.observers.set('resource', resourceObserver);
    } catch (error) {
      console.error('Failed to set up resource observer:', error);
    }
  }

  private monitorPageVisibility() {
    if (typeof document === 'undefined') return;
    
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Page is hidden, flush any pending metrics
        this.flushMetrics();
      }
    });
    
    // Also monitor before unload
    window.addEventListener('beforeunload', () => {
      this.flushMetrics();
    });
  }

  private getRating(
    name: keyof typeof WEB_VITAL_THRESHOLDS,
    value: number
  ): 'good' | 'needs-improvement' | 'poor' {
    const thresholds = WEB_VITAL_THRESHOLDS[name];
    
    if (value <= thresholds.good) {
      return 'good';
    } else if (value <= thresholds.poor) {
      return 'needs-improvement';
    } else {
      return 'poor';
    }
  }

  private reportWebVital(vital: WebVital) {
    // Store vital
    this.vitals.set(vital.name, vital);
    
    // Report to performance monitor
    performanceMonitor.recordWebVital({
      name: vital.name,
      value: vital.value,
      rating: vital.rating,
      timestamp: Date.now(),
      url: window.location.href,
    });
    
    // Call custom callback if provided
    if (this.reportCallback) {
      this.reportCallback(vital);
    }
    
    // Log poor performance
    if (vital.rating === 'poor') {
      console.warn(`Poor Web Vital detected: ${vital.name} = ${vital.value} (${vital.rating})`);
    }
    
    // Send to analytics endpoint
    this.sendToAnalytics(vital);
  }

  private sendToAnalytics(vital: WebVital) {
    if (typeof window === 'undefined' || !navigator.sendBeacon) return;
    
    const payload = JSON.stringify({
      type: 'webvital',
      metric: vital.name,
      value: vital.value,
      rating: vital.rating,
      url: window.location.href,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      connection: (navigator as any).connection?.effectiveType,
    });
    
    navigator.sendBeacon('/api/analytics', payload);
  }

  private flushMetrics() {
    // Send all collected vitals
    const allVitals = Array.from(this.vitals.values());
    
    if (allVitals.length > 0 && navigator.sendBeacon) {
      const payload = JSON.stringify({
        type: 'webvitals-batch',
        metrics: allVitals,
        url: window.location.href,
        timestamp: Date.now(),
      });
      
      navigator.sendBeacon('/api/analytics', payload);
    }
  }

  stopMonitoring() {
    this.isMonitoring = false;
    
    // Disconnect all observers
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    
    // Flush any remaining metrics
    this.flushMetrics();
  }

  getVitals(): WebVital[] {
    return Array.from(this.vitals.values());
  }

  getVital(name: string): WebVital | undefined {
    return this.vitals.get(name);
  }

  getSummary(): {
    scores: Record<string, number>;
    ratings: Record<string, string>;
    overallScore: number;
  } {
    const vitals = this.getVitals();
    const scores: Record<string, number> = {};
    const ratings: Record<string, string> = {};
    
    let totalScore = 0;
    let count = 0;
    
    vitals.forEach(vital => {
      // Calculate score (0-100)
      const threshold = WEB_VITAL_THRESHOLDS[vital.name];
      let score = 100;
      
      if (vital.value <= threshold.good) {
        score = 100;
      } else if (vital.value <= threshold.poor) {
        // Linear interpolation between good and poor
        const range = threshold.poor - threshold.good;
        const position = vital.value - threshold.good;
        score = 100 - (position / range) * 50;
      } else {
        // Exponential decay after poor threshold
        const excess = vital.value - threshold.poor;
        score = Math.max(0, 50 * Math.exp(-excess / threshold.poor));
      }
      
      scores[vital.name] = Math.round(score);
      ratings[vital.name] = vital.rating;
      totalScore += score;
      count++;
    });
    
    return {
      scores,
      ratings,
      overallScore: count > 0 ? Math.round(totalScore / count) : 0,
    };
  }

  reset() {
    this.vitals.clear();
  }
}

// Singleton instance
export const webVitalsMonitor = new WebVitalsMonitor();

// Initialize monitoring on page load
if (typeof window !== 'undefined') {
  // Start monitoring when the page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      webVitalsMonitor.startMonitoring();
    });
  } else {
    webVitalsMonitor.startMonitoring();
  }
}

export default webVitalsMonitor;