/**
 * ESPN-specific error handling
 */

/**
 * ESPN API error class with detailed information
 */
export class ESPNError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    retryable: boolean = false,
    details?: any
  ) {
    super(message);
    this.name = 'ESPNError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ESPNError);
    }
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details
    };
  }
}

/**
 * ESPN error codes
 */
export enum ESPNErrorCode {
  // Authentication errors
  AUTH_INVALID = 'AUTH_INVALID',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_MISSING = 'AUTH_MISSING',
  
  // API errors
  LEAGUE_NOT_FOUND = 'LEAGUE_NOT_FOUND',
  PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND',
  SEASON_NOT_FOUND = 'SEASON_NOT_FOUND',
  ACCESS_DENIED = 'ACCESS_DENIED',
  
  // Rate limiting
  RATE_LIMIT = 'RATE_LIMIT',
  
  // Server errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  
  // Data errors
  INVALID_DATA = 'INVALID_DATA',
  PARSING_ERROR = 'PARSING_ERROR'
}

/**
 * Handle ESPN API errors and convert to ESPNError
 * @param error The error to handle
 * @returns Never (always throws)
 */
export function handleESPNError(error: any): never {
  // Handle fetch/axios response errors
  if (error.response) {
    const { status, data } = error.response;
    
    switch (status) {
      case 401:
        throw new ESPNError(
          'Invalid or expired ESPN credentials. Please re-authenticate.',
          ESPNErrorCode.AUTH_INVALID,
          401,
          false,
          data
        );
        
      case 403:
        throw new ESPNError(
          'Access denied. You may not have permission to access this league.',
          ESPNErrorCode.ACCESS_DENIED,
          403,
          false,
          data
        );
        
      case 404:
        throw new ESPNError(
          'The requested resource was not found on ESPN.',
          ESPNErrorCode.LEAGUE_NOT_FOUND,
          404,
          false,
          data
        );
        
      case 429:
        throw new ESPNError(
          'ESPN API rate limit exceeded. Please try again later.',
          ESPNErrorCode.RATE_LIMIT,
          429,
          true, // Retryable
          data
        );
        
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ESPNError(
          'ESPN service is temporarily unavailable. Please try again.',
          ESPNErrorCode.SERVICE_UNAVAILABLE,
          status,
          true, // Retryable
          data
        );
        
      default:
        throw new ESPNError(
          `ESPN API error: ${status}`,
          ESPNErrorCode.INTERNAL_ERROR,
          status,
          false,
          data
        );
    }
  }
  
  // Handle network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    throw new ESPNError(
      'Unable to connect to ESPN API. Please check your internet connection.',
      ESPNErrorCode.NETWORK_ERROR,
      undefined,
      true,
      { originalError: error.message }
    );
  }
  
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    throw new ESPNError(
      'Request to ESPN API timed out. Please try again.',
      ESPNErrorCode.TIMEOUT,
      undefined,
      true,
      { originalError: error.message }
    );
  }
  
  // Handle parsing errors
  if (error instanceof SyntaxError) {
    throw new ESPNError(
      'Failed to parse ESPN API response. The response format may have changed.',
      ESPNErrorCode.PARSING_ERROR,
      undefined,
      false,
      { originalError: error.message }
    );
  }
  
  // Generic error
  throw new ESPNError(
    error.message || 'An unexpected error occurred while communicating with ESPN.',
    ESPNErrorCode.INTERNAL_ERROR,
    undefined,
    false,
    { originalError: error }
  );
}

/**
 * Check if an error is retryable
 * @param error The error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (error instanceof ESPNError) {
    return error.retryable;
  }
  
  // Check for common retryable network errors
  const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'ENOTFOUND'];
  if (error.code && retryableCodes.includes(error.code)) {
    return true;
  }
  
  // Check for retryable HTTP status codes
  if (error.statusCode) {
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  
  return false;
}

/**
 * Create an error for missing cookies
 */
export function createMissingCookiesError(): ESPNError {
  return new ESPNError(
    'ESPN cookies not found. Please capture your cookies using the browser extension.',
    ESPNErrorCode.AUTH_MISSING,
    401,
    false
  );
}

/**
 * Create an error for expired cookies
 */
export function createExpiredCookiesError(): ESPNError {
  return new ESPNError(
    'ESPN cookies have expired. Please re-authenticate using the browser extension.',
    ESPNErrorCode.AUTH_EXPIRED,
    401,
    false
  );
}

/**
 * Extract user-friendly error message from any error
 * @param error The error to extract message from
 * @returns User-friendly error message
 */
export function getErrorMessage(error: any): string {
  if (error instanceof ESPNError) {
    return error.message;
  }
  
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  
  if (error.message) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
}

/**
 * Log ESPN error with context
 * @param error The error to log
 * @param context Additional context to log
 */
export function logESPNError(error: any, context?: Record<string, any>): void {
  const timestamp = new Date().toISOString();
  
  console.error('[ESPN Error]', {
    timestamp,
    error: error instanceof ESPNError ? error.toJSON() : {
      message: error.message,
      stack: error.stack
    },
    context
  });
}