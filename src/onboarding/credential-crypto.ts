import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { z } from "zod";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = "rumbledore-provider-credential-v1";
const VERSION = "v1";

const encryptedPayloadSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  version: z.literal(VERSION),
});

export class CredentialCryptoError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "CredentialCryptoError";
  }
}

export interface CredentialCipher {
  encryptJson(value: unknown): string;
  decryptJson<T>(payload: string): T;
}

function encodeBase64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function createCredentialCipher(masterKey: string): CredentialCipher {
  if (masterKey.trim().length < 32) {
    throw new CredentialCryptoError(
      "Credential encryption key must be at least 32 characters",
    );
  }

  const key = scryptSync(masterKey, SALT, KEY_LENGTH);

  return {
    encryptJson(value) {
      const plaintext = Buffer.from(JSON.stringify(value), "utf8");
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv, {
        authTagLength: TAG_LENGTH,
      });
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();

      return JSON.stringify({
        ciphertext: encodeBase64Url(ciphertext),
        iv: encodeBase64Url(iv),
        tag: encodeBase64Url(tag),
        version: VERSION,
      });
    },

    decryptJson<T>(payload: string): T {
      try {
        const parsed = encryptedPayloadSchema.parse(JSON.parse(payload));
        const decipher = createDecipheriv(
          ALGORITHM,
          key,
          decodeBase64Url(parsed.iv),
          { authTagLength: TAG_LENGTH },
        );
        decipher.setAuthTag(decodeBase64Url(parsed.tag));
        const plaintext = Buffer.concat([
          decipher.update(decodeBase64Url(parsed.ciphertext)),
          decipher.final(),
        ]);
        return JSON.parse(plaintext.toString("utf8")) as T;
      } catch (cause) {
        throw new CredentialCryptoError(
          "Credential payload could not be decrypted",
          cause,
        );
      }
    },
  };
}
