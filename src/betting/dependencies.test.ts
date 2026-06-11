// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import type { Db } from "@/db/client";
import { createOddsDependencies } from "./dependencies";
import { MockOddsProvider } from "./mocks";
import { TheOddsApiProvider } from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

describe("createOddsDependencies", () => {
  it("keeps odds mocked with zero paid configuration", () => {
    const deps = createOddsDependencies({} as Db, parseEnv({}));

    expect(deps.provider).toBeInstanceOf(MockOddsProvider);
  });

  it("selects The Odds API provider when its key is present", () => {
    const deps = createOddsDependencies(
      {} as Db,
      parseEnv({ THE_ODDS_API_KEY: fakeKey() }),
    );

    expect(deps.provider).toBeInstanceOf(TheOddsApiProvider);
  });
});
