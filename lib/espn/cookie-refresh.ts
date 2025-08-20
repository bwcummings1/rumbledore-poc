import { getCookieManager, CookieManager } from '@/lib/crypto/cookie-manager';
import { getESPNValidator, ESPNValidator } from './validator';
import { prisma } from '@/lib/prisma';

/**
 * Refresh result information
 */
export interface RefreshResult {
  success: boolean;
  needsUserAction: boolean;
  message: string;
  validUntil?: Date;
}

/**
 * Service for validating and refreshing ESPN cookies
 * Handles automatic validation and user notification when re-authentication is needed
 */
export class CookieRefreshService {
  private manager: CookieManager;
  private validator: ESPNValidator;

  constructor() {
    this.manager = getCookieManager();
    this.validator = getESPNValidator();
  }

  /**
   * Validate and refresh cookies for a league
   * @param userId User ID
   * @param leagueId League ID
   * @returns Refresh result with status
   */
  async validateAndRefresh(
    userId: string,
    leagueId: string
  ): Promise<RefreshResult> {
    try {
      // Get league information
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: {
          espnLeagueId: true,
          season: true,
          name: true
        }
      });

      if (!league) {
        return {
          success: false,
          needsUserAction: false,
          message: 'League not found'
        };
      }

      // Check if we have cookies
      const cookies = await this.manager.getCookies(userId, leagueId);
      
      if (!cookies) {
        return {
          success: false,
          needsUserAction: true,
          message: 'No ESPN credentials found. Please install the browser extension and capture your ESPN cookies.'
        };
      }

      // Validate the cookies with ESPN
      const validationResult = await this.validator.validateCookies(
        cookies,
        Number(league.espnLeagueId),
        league.season
      );

      if (validationResult.isValid) {
        // Update validation timestamp
        await this.manager.updateValidation(userId, leagueId, true);
        
        // Calculate next validation time (24 hours from now)
        const validUntil = new Date();
        validUntil.setHours(validUntil.getHours() + 24);

        return {
          success: true,
          needsUserAction: false,
          message: `Credentials are valid for ${league.name}`,
          validUntil
        };
      }

      // Handle different failure scenarios
      if (validationResult.statusCode === 401 || validationResult.statusCode === 403) {
        // Cookies are expired or invalid
        await this.manager.markAsExpired(userId, leagueId);
        
        return {
          success: false,
          needsUserAction: true,
          message: 'ESPN credentials have expired. Please re-authenticate using the browser extension.'
        };
      }

      if (validationResult.statusCode === 404) {
        // League not found - might be wrong league ID or season
        return {
          success: false,
          needsUserAction: false,
          message: validationResult.error || 'League not found on ESPN'
        };
      }

      if (validationResult.statusCode === 429) {
        // Rate limited - don't mark as invalid
        return {
          success: false,
          needsUserAction: false,
          message: 'ESPN rate limit reached. Please try again in a few minutes.'
        };
      }

      // Other errors (500s, network issues)
      return {
        success: false,
        needsUserAction: false,
        message: validationResult.error || 'Unable to validate credentials at this time'
      };

    } catch (error) {
      console.error('Cookie refresh error:', error);
      return {
        success: false,
        needsUserAction: false,
        message: 'An unexpected error occurred during validation'
      };
    }
  }

  /**
   * Batch validate all leagues for a user
   * @param userId User ID
   * @returns Array of validation results
   */
  async validateAllLeagues(userId: string): Promise<Map<string, RefreshResult>> {
    const results = new Map<string, RefreshResult>();

    // Get all leagues with credentials for this user
    const credentials = await prisma.espnCredential.findMany({
      where: { userId },
      select: {
        leagueId: true,
        league: {
          select: {
            id: true,
            name: true,
            espnLeagueId: true,
            season: true
          }
        }
      }
    });

    // Validate each league
    for (const credential of credentials) {
      const result = await this.validateAndRefresh(userId, credential.leagueId);
      results.set(credential.league.name, result);
      
      // Add delay to avoid rate limiting
      await this.delay(1000);
    }

    return results;
  }

  /**
   * Check if any leagues need validation
   * @param userId User ID
   * @returns Array of league IDs that need validation
   */
  async getLeaguesNeedingValidation(userId: string): Promise<string[]> {
    const credentials = await prisma.espnCredential.findMany({
      where: {
        userId,
        OR: [
          { lastValidated: null },
          { 
            lastValidated: { 
              lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
            } 
          },
          { isValid: false }
        ]
      },
      select: {
        leagueId: true
      }
    });

    return credentials.map(c => c.leagueId);
  }

  /**
   * Automatically validate credentials that haven't been checked recently
   * @param userId User ID
   * @returns Number of leagues validated
   */
  async autoValidate(userId: string): Promise<number> {
    const leaguesNeedingValidation = await this.getLeaguesNeedingValidation(userId);
    let validatedCount = 0;

    for (const leagueId of leaguesNeedingValidation) {
      const result = await this.validateAndRefresh(userId, leagueId);
      if (result.success) {
        validatedCount++;
      }
      
      // Rate limiting delay
      await this.delay(1000);
    }

    return validatedCount;
  }

  /**
   * Force refresh cookies by marking them as needing validation
   * @param userId User ID
   * @param leagueId League ID
   */
  async forceRefresh(userId: string, leagueId: string): Promise<RefreshResult> {
    // Clear the last validated timestamp to force revalidation
    await prisma.espnCredential.update({
      where: {
        userId_leagueId: { userId, leagueId }
      },
      data: {
        lastValidated: null
      }
    });

    return this.validateAndRefresh(userId, leagueId);
  }

  /**
   * Helper function to add delay
   * @param ms Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if ESPN API is accessible
   * @returns True if ESPN is reachable
   */
  async checkESPNStatus(): Promise<boolean> {
    return this.validator.testConnection();
  }

  /**
   * Get summary of all credentials for a user
   * @param userId User ID
   * @returns Summary of credential status
   */
  async getCredentialSummary(userId: string): Promise<{
    total: number;
    valid: number;
    expired: number;
    needsValidation: number;
  }> {
    const credentials = await prisma.espnCredential.findMany({
      where: { userId },
      select: {
        isValid: true,
        expiresAt: true,
        lastValidated: true
      }
    });

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let valid = 0;
    let expired = 0;
    let needsValidation = 0;

    for (const cred of credentials) {
      if (cred.expiresAt && cred.expiresAt < now) {
        expired++;
      } else if (!cred.lastValidated || cred.lastValidated < twentyFourHoursAgo) {
        needsValidation++;
      } else if (cred.isValid) {
        valid++;
      }
    }

    return {
      total: credentials.length,
      valid,
      expired,
      needsValidation
    };
  }
}

// Export singleton instance
let refreshServiceInstance: CookieRefreshService | null = null;

export function getCookieRefreshService(): CookieRefreshService {
  if (!refreshServiceInstance) {
    refreshServiceInstance = new CookieRefreshService();
  }
  return refreshServiceInstance;
}