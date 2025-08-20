/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

/**
 * Execute a function with retry logic and exponential backoff
 * @param fn The async function to execute
 * @param options Retry configuration options
 * @returns Promise resolving to the function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      // Call retry callback
      onRetry(attempt, error);

      // Wait before retrying
      await sleep(delay);
      
      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified number of milliseconds
 * @param ms Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry configuration for ESPN API calls
 */
export const ESPN_RETRY_CONFIG: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 5000,
  backoffFactor: 2,
  shouldRetry: (error) => {
    // Retry on network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // Retry on specific HTTP status codes
    if (error.statusCode === 429) { // Rate limited
      return true;
    }
    
    if (error.statusCode >= 500) { // Server errors
      return true;
    }
    
    // Don't retry on client errors
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return false;
    }
    
    return true;
  },
  onRetry: (attempt, error) => {
    console.log(`Retry attempt ${attempt} after error:`, error.message || error);
  }
};

/**
 * Create a retry wrapper with preset configuration
 * @param config Preset retry configuration
 * @returns Function that executes with the preset config
 */
export function createRetryWrapper(config: RetryOptions) {
  return <T>(fn: () => Promise<T>) => withRetry(fn, config);
}

/**
 * Retry with linear backoff instead of exponential
 * @param fn The async function to execute
 * @param attempts Number of attempts
 * @param delay Delay between attempts in ms
 */
export async function retryWithLinearBackoff<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  delay: number = 1000
): Promise<T> {
  return withRetry(fn, {
    maxAttempts: attempts,
    initialDelay: delay,
    maxDelay: delay,
    backoffFactor: 1 // Linear backoff
  });
}

/**
 * Retry with jitter to prevent thundering herd
 * @param fn The async function to execute
 * @param options Retry configuration
 */
export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const originalInitialDelay = options.initialDelay || 1000;
  
  return withRetry(fn, {
    ...options,
    initialDelay: originalInitialDelay + Math.random() * 1000 // Add up to 1 second of jitter
  });
}