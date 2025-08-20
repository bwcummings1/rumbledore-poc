import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const IV_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 32;

/**
 * Secure cookie encryption service using AES-256-GCM
 * Provides authenticated encryption for ESPN cookies
 */
export class CookieEncryption {
  private key: Buffer;
  private salt: Buffer;

  constructor(masterKey: string) {
    if (!masterKey || masterKey.length < 32) {
      throw new Error('Master key must be at least 32 characters');
    }
    
    // Generate a consistent salt from the master key for deterministic encryption
    // In production, consider using a random salt stored with each encrypted value
    this.salt = crypto.createHash('sha256').update(masterKey).digest();
    
    // Derive encryption key from master key using PBKDF2
    this.key = crypto.pbkdf2Sync(masterKey, this.salt, ITERATIONS, KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt a plaintext string using AES-256-GCM
   * @param text The plaintext to encrypt
   * @returns Base64 encoded encrypted data with IV and auth tag
   */
  encrypt(text: string): string {
    if (!text) {
      throw new Error('Cannot encrypt empty text');
    }

    // Generate random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine IV, auth tag, and encrypted data
    // Format: [IV (16 bytes)][Auth Tag (16 bytes)][Encrypted Data]
    const combined = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);
    
    // Return as base64 for storage
    return combined.toString('base64');
  }

  /**
   * Decrypt a base64 encoded encrypted string
   * @param encryptedData Base64 encoded encrypted data
   * @returns The decrypted plaintext
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) {
      throw new Error('Cannot decrypt empty data');
    }

    try {
      // Decode from base64
      const buffer = Buffer.from(encryptedData, 'base64');
      
      // Extract components
      const iv = buffer.slice(0, IV_LENGTH);
      const authTag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const encrypted = buffer.slice(IV_LENGTH + TAG_LENGTH);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt data. Data may be corrupted or tampered with.');
    }
  }

  /**
   * Verify that encryption and decryption are working correctly
   * @returns true if the service is working correctly
   */
  async verify(): Promise<boolean> {
    try {
      const testData = 'test-cookie-value-' + Date.now();
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      return testData === decrypted;
    } catch {
      return false;
    }
  }
}

// Export a singleton instance for consistent encryption across the app
let encryptionInstance: CookieEncryption | null = null;

export function getEncryption(): CookieEncryption {
  if (!encryptionInstance) {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) {
      throw new Error('ENCRYPTION_MASTER_KEY environment variable is not set');
    }
    encryptionInstance = new CookieEncryption(masterKey);
  }
  return encryptionInstance;
}