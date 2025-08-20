import { CookieEncryption } from '@/lib/crypto/encryption';

describe('CookieEncryption', () => {
  let encryption: CookieEncryption;
  const testMasterKey = 'test_master_key_at_least_32_characters_long!!';

  beforeEach(() => {
    encryption = new CookieEncryption(testMasterKey);
  });

  describe('constructor', () => {
    it('should throw error if master key is too short', () => {
      expect(() => new CookieEncryption('short')).toThrow(
        'Master key must be at least 32 characters'
      );
    });

    it('should create instance with valid master key', () => {
      expect(encryption).toBeInstanceOf(CookieEncryption);
    });
  });

  describe('encrypt', () => {
    it('should encrypt a string', () => {
      const plaintext = 'test-cookie-value';
      const encrypted = encryption.encrypt(plaintext);
      
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe('string');
      // Should be base64 encoded
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should produce different ciphertexts for same plaintext (due to random IV)', () => {
      const plaintext = 'test-cookie-value';
      const encrypted1 = encryption.encrypt(plaintext);
      const encrypted2 = encryption.encrypt(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error for empty text', () => {
      expect(() => encryption.encrypt('')).toThrow('Cannot encrypt empty text');
    });

    it('should handle special characters', () => {
      const plaintext = '{SWID-VALUE-WITH-SPECIAL-!@#$%^&*()}';
      const encrypted = encryption.encrypt(plaintext);
      
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(1000);
      const encrypted = encryption.encrypt(plaintext);
      
      expect(encrypted).toBeTruthy();
      expect(encrypted.length).toBeGreaterThan(1000);
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted string', () => {
      const plaintext = 'test-cookie-value';
      const encrypted = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt special characters correctly', () => {
      const plaintext = '{SWID-VALUE-WITH-SPECIAL-!@#$%^&*()}';
      const encrypted = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt long strings correctly', () => {
      const plaintext = 'Lorem ipsum dolor sit amet, '.repeat(100);
      const encrypted = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error for empty data', () => {
      expect(() => encryption.decrypt('')).toThrow('Cannot decrypt empty data');
    });

    it('should throw error for invalid base64', () => {
      expect(() => encryption.decrypt('not-valid-base64!@#')).toThrow(
        'Failed to decrypt data'
      );
    });

    it('should throw error for tampered data', () => {
      const plaintext = 'test-cookie-value';
      const encrypted = encryption.encrypt(plaintext);
      
      // Tamper with the encrypted data
      const tampered = encrypted.slice(0, -4) + 'XXXX';
      
      expect(() => encryption.decrypt(tampered)).toThrow(
        'Failed to decrypt data'
      );
    });
  });

  describe('verify', () => {
    it('should verify encryption/decryption is working', async () => {
      const result = await encryption.verify();
      expect(result).toBe(true);
    });

    it('should return false if encryption fails', async () => {
      // Mock encrypt to throw
      jest.spyOn(encryption, 'encrypt').mockImplementation(() => {
        throw new Error('Encryption failed');
      });
      
      const result = await encryption.verify();
      expect(result).toBe(false);
    });
  });

  describe('consistency', () => {
    it('should use same encryption instance with same master key', () => {
      const encryption1 = new CookieEncryption(testMasterKey);
      const encryption2 = new CookieEncryption(testMasterKey);
      
      const plaintext = 'test-cookie-value';
      const encrypted = encryption1.encrypt(plaintext);
      const decrypted = encryption2.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should not decrypt with different master key', () => {
      const encryption1 = new CookieEncryption(testMasterKey);
      const encryption2 = new CookieEncryption('different_master_key_at_least_32_chars!');
      
      const plaintext = 'test-cookie-value';
      const encrypted = encryption1.encrypt(plaintext);
      
      expect(() => encryption2.decrypt(encrypted)).toThrow(
        'Failed to decrypt data'
      );
    });
  });

  describe('ESPN cookie formats', () => {
    it('should handle SWID format', () => {
      const swid = '{12345678-1234-1234-1234-123456789012}';
      const encrypted = encryption.encrypt(swid);
      const decrypted = encryption.decrypt(encrypted);
      
      expect(decrypted).toBe(swid);
    });

    it('should handle espn_s2 format', () => {
      const espnS2 = 'AEBxyz123456789abcdefghijklmnopqrstuvwxyz%2Ftest%3D';
      const encrypted = encryption.encrypt(espnS2);
      const decrypted = encryption.decrypt(encrypted);
      
      expect(decrypted).toBe(espnS2);
    });

    it('should handle URL-encoded characters', () => {
      const cookie = 'value%20with%20spaces%2Fslashes%3Dequals';
      const encrypted = encryption.encrypt(cookie);
      const decrypted = encryption.decrypt(encrypted);
      
      expect(decrypted).toBe(cookie);
    });
  });
});

describe('getEncryption singleton', () => {
  // Mock environment variable
  const originalEnv = process.env.ENCRYPTION_MASTER_KEY;

  afterEach(() => {
    // Restore original environment
    if (originalEnv) {
      process.env.ENCRYPTION_MASTER_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
    
    // Clear module cache to reset singleton
    jest.resetModules();
  });

  it('should throw error if ENCRYPTION_MASTER_KEY is not set', () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    
    const { getEncryption } = require('@/lib/crypto/encryption');
    expect(() => getEncryption()).toThrow(
      'ENCRYPTION_MASTER_KEY environment variable is not set'
    );
  });

  it('should return singleton instance', () => {
    process.env.ENCRYPTION_MASTER_KEY = 'test_master_key_at_least_32_characters_long!!';
    
    const { getEncryption } = require('@/lib/crypto/encryption');
    const instance1 = getEncryption();
    const instance2 = getEncryption();
    
    expect(instance1).toBe(instance2);
  });
});