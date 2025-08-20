import { ESPNCookies } from '@/lib/crypto/cookie-manager';

/**
 * ESPN API response types
 */
export interface ESPNValidationResponse {
  id: number;
  seasonId: number;
  name: string;
  isActive: boolean;
}

/**
 * Validation result with detailed information
 */
export interface ValidationResult {
  isValid: boolean;
  statusCode?: number;
  leagueData?: ESPNValidationResponse;
  error?: string;
}

/**
 * ESPN Fantasy API validator
 * Validates cookies against the ESPN API to ensure they're still valid
 */
export class ESPNValidator {
  private baseUrl = 'https://fantasy.espn.com/apis/v3/games/ffl';
  private userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

  /**
   * Validate ESPN cookies by attempting to fetch league data
   * @param cookies ESPN cookies to validate
   * @param leagueId ESPN league ID
   * @param season Season year
   * @returns Validation result with status
   */
  async validateCookies(
    cookies: ESPNCookies,
    leagueId: number,
    season: number
  ): Promise<ValidationResult> {
    if (!cookies.swid || !cookies.espnS2) {
      return {
        isValid: false,
        error: 'Missing required cookies'
      };
    }

    try {
      // Format cookies for the request
      const cookieString = this.formatCookies(cookies);
      
      // ESPN API endpoint for league info
      const url = `${this.baseUrl}/seasons/${season}/segments/0/leagues/${leagueId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cookie': cookieString,
          'User-Agent': this.userAgent,
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://fantasy.espn.com/',
          'X-Fantasy-Source': 'kona'
        }
      });

      const statusCode = response.status;

      // Handle different response codes
      switch (statusCode) {
        case 200:
          // Success - cookies are valid
          const data = await response.json();
          return {
            isValid: true,
            statusCode,
            leagueData: {
              id: data.id,
              seasonId: data.seasonId,
              name: data.settings?.name || 'Unknown League',
              isActive: data.status?.isActive || false
            }
          };

        case 401:
        case 403:
          // Authentication failed - cookies are invalid
          return {
            isValid: false,
            statusCode,
            error: 'Invalid or expired ESPN credentials'
          };

        case 404:
          // League not found - this might mean wrong league ID or season
          return {
            isValid: false,
            statusCode,
            error: `League ${leagueId} not found for season ${season}`
          };

        case 429:
          // Rate limited
          return {
            isValid: false,
            statusCode,
            error: 'ESPN API rate limit exceeded. Please try again later.'
          };

        case 500:
        case 502:
        case 503:
          // ESPN server error
          return {
            isValid: false,
            statusCode,
            error: 'ESPN service is temporarily unavailable'
          };

        default:
          return {
            isValid: false,
            statusCode,
            error: `Unexpected response from ESPN API: ${statusCode}`
          };
      }
    } catch (error) {
      // Network or parsing error
      console.error('ESPN validation error:', error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Failed to validate cookies'
      };
    }
  }

  /**
   * Format cookies for the ESPN API request
   * @param cookies ESPN cookies object
   * @returns Formatted cookie string
   */
  private formatCookies(cookies: ESPNCookies): string {
    // SWID needs to be wrapped in curly braces for ESPN
    const formattedSwid = cookies.swid.startsWith('{') ? cookies.swid : `{${cookies.swid}}`;
    return `SWID=${formattedSwid}; espn_s2=${cookies.espnS2}`;
  }

  /**
   * Test if ESPN API is accessible (without authentication)
   * @returns True if ESPN API is reachable
   */
  async testConnection(): Promise<boolean> {
    try {
      // Use a public endpoint that doesn't require authentication
      const response = await fetch(`${this.baseUrl}/seasons/2024`, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });

      return response.status === 200 || response.status === 401;
    } catch (error) {
      console.error('ESPN connection test failed:', error);
      return false;
    }
  }

  /**
   * Get detailed league information if cookies are valid
   * @param cookies ESPN cookies
   * @param leagueId ESPN league ID
   * @param season Season year
   * @returns League data or null if invalid
   */
  async getLeagueInfo(
    cookies: ESPNCookies,
    leagueId: number,
    season: number
  ): Promise<any | null> {
    const validation = await this.validateCookies(cookies, leagueId, season);
    
    if (!validation.isValid) {
      return null;
    }

    try {
      const cookieString = this.formatCookies(cookies);
      const url = `${this.baseUrl}/seasons/${season}/segments/0/leagues/${leagueId}?view=mSettings`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cookie': cookieString,
          'User-Agent': this.userAgent,
          'Accept': 'application/json',
          'X-Fantasy-Source': 'kona'
        }
      });

      if (response.ok) {
        return await response.json();
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch league info:', error);
      return null;
    }
  }

  /**
   * Check if a user has access to a specific league
   * @param cookies ESPN cookies
   * @param leagueId ESPN league ID
   * @param season Season year
   * @returns True if user has access to the league
   */
  async hasLeagueAccess(
    cookies: ESPNCookies,
    leagueId: number,
    season: number
  ): Promise<boolean> {
    const validation = await this.validateCookies(cookies, leagueId, season);
    return validation.isValid;
  }
}

// Export singleton instance
let validatorInstance: ESPNValidator | null = null;

export function getESPNValidator(): ESPNValidator {
  if (!validatorInstance) {
    validatorInstance = new ESPNValidator();
  }
  return validatorInstance;
}