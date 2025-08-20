import { CookieEncryption, getEncryption } from './encryption';
import { prisma } from '@/lib/prisma';

/**
 * ESPN cookie structure
 */
export interface ESPNCookies {
  swid: string;
  espnS2: string;
}

/**
 * Cookie validation result
 */
export interface CookieValidationResult {
  isValid: boolean;
  lastValidated?: Date;
  expiresAt?: Date;
  error?: string;
}

/**
 * Cookie status information
 */
export interface CookieStatus {
  hasCredentials: boolean;
  isExpired: boolean;
  isValid: boolean;
  lastValidated?: Date;
  createdAt?: Date;
  expiresAt?: Date;
}

/**
 * Manages secure storage and retrieval of ESPN cookies
 * Handles encryption, validation tracking, and expiry
 */
export class CookieManager {
  private encryption: CookieEncryption;

  constructor() {
    this.encryption = getEncryption();
  }

  /**
   * Store ESPN cookies securely in the database
   * @param userId User ID
   * @param leagueId League ID
   * @param cookies ESPN cookies to store
   * @returns Promise resolving when cookies are stored
   */
  async storeCookies(
    userId: string,
    leagueId: string,
    cookies: ESPNCookies
  ): Promise<void> {
    if (!cookies.swid || !cookies.espnS2) {
      throw new Error('Both SWID and ESPN_S2 cookies are required');
    }

    // Encrypt the cookies
    const encryptedSwid = this.encryption.encrypt(cookies.swid);
    const encryptedEspnS2 = this.encryption.encrypt(cookies.espnS2);
    
    // Calculate expiry (ESPN cookies typically last 1 year)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    
    // Store or update in database
    await prisma.espnCredential.upsert({
      where: {
        userId_leagueId: { userId, leagueId }
      },
      update: {
        encryptedSwid,
        encryptedEspnS2,
        lastValidated: new Date(),
        isValid: true,
        expiresAt,
        updatedAt: new Date()
      },
      create: {
        userId,
        leagueId,
        encryptedSwid,
        encryptedEspnS2,
        lastValidated: new Date(),
        isValid: true,
        expiresAt
      }
    });
  }

  /**
   * Retrieve and decrypt ESPN cookies from the database
   * @param userId User ID
   * @param leagueId League ID
   * @returns Decrypted cookies or null if not found
   */
  async getCookies(
    userId: string,
    leagueId: string
  ): Promise<ESPNCookies | null> {
    const credential = await prisma.espnCredential.findUnique({
      where: {
        userId_leagueId: { userId, leagueId }
      }
    });

    if (!credential) {
      return null;
    }

    // Check if expired
    if (credential.expiresAt && credential.expiresAt < new Date()) {
      // Mark as invalid but still return for potential refresh
      await this.markAsExpired(userId, leagueId);
    }

    try {
      return {
        swid: this.encryption.decrypt(credential.encryptedSwid),
        espnS2: this.encryption.decrypt(credential.encryptedEspnS2)
      };
    } catch (error) {
      console.error('Failed to decrypt cookies:', error);
      // If decryption fails, the cookies are corrupted
      await this.deleteCookies(userId, leagueId);
      return null;
    }
  }

  /**
   * Get the status of stored cookies without decrypting them
   * @param userId User ID
   * @param leagueId League ID
   * @returns Cookie status information
   */
  async getCookieStatus(
    userId: string,
    leagueId: string
  ): Promise<CookieStatus> {
    const credential = await prisma.espnCredential.findUnique({
      where: {
        userId_leagueId: { userId, leagueId }
      },
      select: {
        isValid: true,
        lastValidated: true,
        expiresAt: true,
        createdAt: true
      }
    });

    if (!credential) {
      return {
        hasCredentials: false,
        isExpired: false,
        isValid: false
      };
    }

    const isExpired = credential.expiresAt ? credential.expiresAt < new Date() : false;

    return {
      hasCredentials: true,
      isExpired,
      isValid: credential.isValid && !isExpired,
      lastValidated: credential.lastValidated || undefined,
      createdAt: credential.createdAt,
      expiresAt: credential.expiresAt || undefined
    };
  }

  /**
   * Update the validation timestamp for cookies
   * @param userId User ID
   * @param leagueId League ID
   * @param isValid Whether the validation was successful
   */
  async updateValidation(
    userId: string,
    leagueId: string,
    isValid: boolean
  ): Promise<void> {
    await prisma.espnCredential.update({
      where: {
        userId_leagueId: { userId, leagueId }
      },
      data: {
        lastValidated: new Date(),
        isValid
      }
    });
  }

  /**
   * Mark cookies as expired
   * @param userId User ID
   * @param leagueId League ID
   */
  async markAsExpired(userId: string, leagueId: string): Promise<void> {
    await prisma.espnCredential.update({
      where: {
        userId_leagueId: { userId, leagueId }
      },
      data: {
        isValid: false,
        expiresAt: new Date()
      }
    });
  }

  /**
   * Delete stored cookies
   * @param userId User ID
   * @param leagueId League ID
   */
  async deleteCookies(userId: string, leagueId: string): Promise<void> {
    await prisma.espnCredential.delete({
      where: {
        userId_leagueId: { userId, leagueId }
      }
    });
  }

  /**
   * Get all leagues with valid cookies for a user
   * @param userId User ID
   * @returns Array of league IDs with valid cookies
   */
  async getLeaguesWithValidCookies(userId: string): Promise<string[]> {
    const credentials = await prisma.espnCredential.findMany({
      where: {
        userId,
        isValid: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      select: {
        leagueId: true
      }
    });

    return credentials.map(c => c.leagueId);
  }

  /**
   * Check if cookies need validation (haven't been validated in 24 hours)
   * @param userId User ID
   * @param leagueId League ID
   * @returns Whether validation is needed
   */
  async needsValidation(
    userId: string,
    leagueId: string
  ): Promise<boolean> {
    const credential = await prisma.espnCredential.findUnique({
      where: {
        userId_leagueId: { userId, leagueId }
      },
      select: {
        lastValidated: true,
        isValid: true
      }
    });

    if (!credential || !credential.isValid) {
      return true;
    }

    if (!credential.lastValidated) {
      return true;
    }

    // Check if last validation was more than 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return credential.lastValidated < twentyFourHoursAgo;
  }
}

// Export singleton instance
let cookieManagerInstance: CookieManager | null = null;

export function getCookieManager(): CookieManager {
  if (!cookieManagerInstance) {
    cookieManagerInstance = new CookieManager();
  }
  return cookieManagerInstance;
}