export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private queue: Array<() => void> = [];
  private requestCount = 0;
  private windowStart = Date.now();

  constructor(
    private config: RateLimiterConfig
  ) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    
    // Reset window if expired
    if (now - this.windowStart >= this.config.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    // If under limit, proceed immediately
    if (this.requestCount < this.config.maxRequests) {
      this.requestCount++;
      return;
    }

    // Otherwise, wait for next window
    const waitTime = this.config.windowMs - (now - this.windowStart);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Reset and proceed
    this.requestCount = 1;
    this.windowStart = Date.now();
  }

  getRemainingRequests(): number {
    const now = Date.now();
    
    // Reset if window expired
    if (now - this.windowStart >= this.config.windowMs) {
      return this.config.maxRequests;
    }

    return Math.max(0, this.config.maxRequests - this.requestCount);
  }

  getResetTime(): number {
    return this.windowStart + this.config.windowMs;
  }

  reset(): void {
    this.requestCount = 0;
    this.windowStart = Date.now();
    this.queue = [];
  }
}