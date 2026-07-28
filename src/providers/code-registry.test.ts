import { describe, expect, it } from "vitest";
import {
  createProviderCodeRegistry,
  encodeCode,
  encodeObservedCode,
  normalizedCode,
  numericDictionary,
  stableCodeId,
} from "./code-registry";

type TestCodeKind = "lineup_slot" | "position";

const testCodes = createProviderCodeRegistry<TestCodeKind>("TestProvider");

describe("provider code registry", () => {
  it("normalizes by trimming and case-folding, and rejects blank codes", () => {
    expect(normalizedCode("  qb  ", true)).toBe("QB");
    expect(normalizedCode("  Pass_YD ", false)).toBe("pass_yd");
    expect(normalizedCode("", true)).toBeUndefined();
    expect(normalizedCode("   ", false)).toBeUndefined();
  });

  it("derives stable, kind-scoped, non-zero 31-bit ids", () => {
    const id = stableCodeId("position", "QB");

    expect(id).toBe(stableCodeId("position", "QB"));
    expect(id).toBeGreaterThan(0);
    expect(id).toBeLessThanOrEqual(0x7fff_ffff);
    expect(Number.isInteger(id)).toBe(true);
    expect(stableCodeId("lineup_slot", "QB")).not.toBe(id);
  });

  it("encodes through normalization and skips blank input", () => {
    expect(encodeCode("position", " qb ", true)).toBe(
      stableCodeId("position", "QB"),
    );
    expect(encodeCode("position", "  ", true)).toBeUndefined();
  });

  it("signs observed codes: positive when known, negative when unknown", () => {
    const dictionary = { QB: "QB" };

    expect(encodeObservedCode("position", "qb", true, dictionary)).toBe(
      stableCodeId("position", "QB"),
    );
    expect(encodeObservedCode("position", "MYSTERY", true, dictionary)).toBe(
      -stableCodeId("position", "MYSTERY"),
    );
    expect(
      encodeObservedCode("position", " ", true, dictionary),
    ).toBeUndefined();
  });

  it("builds a numeric dictionary keyed by the normalized code id", () => {
    const dictionary = numericDictionary(
      "TestProvider",
      "position",
      { QB: "QB", RB: "RB" },
      true,
    );

    expect(Object.keys(dictionary)).toHaveLength(2);
    expect(dictionary[stableCodeId("position", "QB")]).toBe("QB");
    expect(dictionary[stableCodeId("position", "RB")]).toBe("RB");
    expect(Object.isFrozen(dictionary)).toBe(true);
  });

  it("drops blank dictionary keys rather than encoding them", () => {
    expect(
      Object.keys(
        numericDictionary(
          "TestProvider",
          "position",
          { "": "x", QB: "QB" },
          true,
        ),
      ),
    ).toHaveLength(1);
  });

  // The collision guard fires while the module graph is loading, so it would
  // otherwise surface as a startup crash rather than a test failure.
  it("throws, naming the provider, when two codes encode to one id", () => {
    expect(() =>
      numericDictionary(
        "TestProvider",
        "position",
        { qb: "lower", QB: "upper" },
        true,
      ),
    ).toThrow(
      /TestProvider position adapter collision: qb and QB encode to \d+/,
    );
  });

  it("binds the provider label and defers to the shared encoders", () => {
    expect(testCodes.stableCodeId("position", "QB")).toBe(
      stableCodeId("position", "QB"),
    );
    expect(testCodes.encodeCode("position", " qb ", true)).toBe(
      stableCodeId("position", "QB"),
    );
    expect(
      testCodes.encodeObservedCode("position", "MYSTERY", true, { QB: "QB" }),
    ).toBe(-stableCodeId("position", "MYSTERY"));
    expect(testCodes.numericDictionary("position", { QB: "QB" }, true)).toEqual(
      numericDictionary("TestProvider", "position", { QB: "QB" }, true),
    );
    expect(() =>
      testCodes.numericDictionary(
        "position",
        { qb: "lower", QB: "upper" },
        true,
      ),
    ).toThrow(/^TestProvider position adapter collision/);
  });
});
