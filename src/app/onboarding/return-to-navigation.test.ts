import { describe, expect, it } from "vitest";
import {
  returnToAfterConnection,
  returnToAfterImport,
} from "./return-to-navigation";

describe("onboarding return-to navigation", () => {
  it("returns invite links after provider connection", () => {
    expect(returnToAfterConnection("/invite/league/token")).toBe(
      "/invite/league/token",
    );
    expect(returnToAfterConnection("/leagues/league-1")).toBeNull();
  });

  it("returns matching league links after import", () => {
    expect(
      returnToAfterImport("/leagues/league-1/bet?slip=open-123", ["league-1"]),
    ).toBe("/leagues/league-1/bet?slip=open-123");
    expect(
      returnToAfterImport("/leagues/league-2/press/post-1", ["league-1"]),
    ).toBeNull();
  });

  it("rejects unsafe return paths before navigation", () => {
    expect(
      returnToAfterImport("https://example.com/leagues/league-1", ["league-1"]),
    ).toBeNull();
  });
});
