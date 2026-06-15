import { describe, expect, it } from "vitest";
import {
  normalizeLocalReturnTo,
  returnToFromSearchParams,
  withReturnTo,
} from "./return-to";

describe("invite return-to helpers", () => {
  it("keeps local paths with query and hash", () => {
    expect(
      normalizeLocalReturnTo("/invite/league-token/abc123?source=sms#claim"),
    ).toBe("/invite/league-token/abc123?source=sms#claim");
  });

  it("keeps encoded local paths from cookies", () => {
    expect(normalizeLocalReturnTo("%2Finvite%2Fleague%2Ftoken")).toBe(
      "/invite/league/token",
    );
  });

  it("rejects absolute, protocol-relative, and control-character URLs", () => {
    expect(normalizeLocalReturnTo("https://example.com/invite")).toBeNull();
    expect(normalizeLocalReturnTo("//example.com/invite")).toBeNull();
    expect(normalizeLocalReturnTo("%2F%2Fexample.com/invite")).toBeNull();
    expect(normalizeLocalReturnTo("/invite/ok\nLocation:/evil")).toBeNull();
  });

  it("reads the first returnTo search param value", () => {
    expect(
      returnToFromSearchParams({
        returnTo: ["/invite/league/token", "/leagues/other"],
      }),
    ).toBe("/invite/league/token");
  });

  it("adds encoded returnTo to a local href", () => {
    expect(withReturnTo("/onboarding/espn", "/invite/league/token")).toBe(
      "/onboarding/espn?returnTo=%2Finvite%2Fleague%2Ftoken",
    );
  });
});
