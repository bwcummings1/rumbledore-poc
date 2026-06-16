import { describe, expect, it } from "vitest";
import {
  LEAGUE_PAGE_CACHE_CONTROL,
  LEAGUE_PAGE_CACHE_HEADER_RULE,
} from "./league-cache-headers";

describe("league page cache headers", () => {
  it("marks every league-scoped HTML page private and unstorable", () => {
    expect(LEAGUE_PAGE_CACHE_CONTROL).toBe("private, no-store");
    expect(LEAGUE_PAGE_CACHE_HEADER_RULE).toEqual({
      headers: [
        {
          key: "Cache-Control",
          value: "private, no-store",
        },
      ],
      source: "/leagues/:path*",
    });
  });
});
