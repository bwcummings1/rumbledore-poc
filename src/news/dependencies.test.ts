// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import type { Db } from "@/db/client";
import { createNewsDependencies } from "./dependencies";
import { MockCentralNewsSource } from "./mocks";
import { TavilyCentralNewsSource } from "./real";

function fakeKey() {
  return ["fixture", "key"].join("-");
}

describe("createNewsDependencies", () => {
  it("keeps central news mocked with zero paid configuration", () => {
    const deps = createNewsDependencies({} as Db, parseEnv({}));

    expect(deps.source).toBeInstanceOf(MockCentralNewsSource);
  });

  it("selects Tavily for central news when its key is present", () => {
    const deps = createNewsDependencies(
      {} as Db,
      parseEnv({ TAVILY_API_KEY: fakeKey() }),
    );

    expect(deps.source).toBeInstanceOf(TavilyCentralNewsSource);
  });
});
