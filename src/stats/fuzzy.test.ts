import { describe, expect, it } from "vitest";
import { identityNameSimilarity, normalizeIdentityName } from "./fuzzy";

describe("identityNameSimilarity", () => {
  it("normalizes punctuation and case before comparing names", () => {
    expect(normalizeIdentityName(" Bob's   Bombers!! ")).toBe("bobs bombers");
    expect(identityNameSimilarity("Bob's Bombers", "Bobs Bombers")).toBe(1);
  });

  it("scores related names above unrelated names", () => {
    const similar = identityNameSimilarity("Alex Bombers", "Alexander Bombers");
    const unrelated = identityNameSimilarity("Alex Bombers", "Casey Crushers");

    expect(similar).toBeGreaterThan(0.6);
    expect(unrelated).toBeLessThan(similar);
  });
});
