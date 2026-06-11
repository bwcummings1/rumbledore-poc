import { describe, expect, it } from "vitest";
import {
  CredentialCryptoError,
  createCredentialCipher,
} from "./credential-crypto";

const masterKey = "test-credential-master-key-minimum-32"; // ubs:ignore — fake fixture value

describe("credential encryption", () => {
  it("round-trips JSON without exposing plaintext", () => {
    const cipher = createCredentialCipher(masterKey);
    const payload = {
      swid: "{00000000-0000-4000-8000-000000000001}",
      espn_s2: "fixture-session-value", // ubs:ignore — fake ESPN cookie value for crypto tests
    };

    const encrypted = cipher.encryptJson(payload);

    expect(encrypted).not.toContain(payload.swid);
    expect(encrypted).not.toContain(payload.espn_s2);
    expect(cipher.decryptJson<typeof payload>(encrypted)).toEqual(payload);
  });

  it("rejects a short master key", () => {
    expect(() => createCredentialCipher("short")).toThrow(
      CredentialCryptoError,
    );
  });
});
