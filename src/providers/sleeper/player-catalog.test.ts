// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import playersFixture from "../../../test/fixtures/sleeper/players-nfl.json";
import { ProviderParseError } from "../model";
import {
  createSleeperPlayerCatalog,
  type SleeperCatalogFetch,
} from "./player-catalog";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryCacheFile(): string {
  const directory = mkdtempSync(join(tmpdir(), "rumbledore-sleeper-catalog-"));
  temporaryDirectories.push(directory);
  return join(directory, "players-nfl.json");
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

describe("Sleeper player catalog", () => {
  it("fetches the large player dump once and reuses the daily disk cache", async () => {
    const cacheFilePath = temporaryCacheFile();
    const calls: { init?: RequestInit; url: string }[] = [];
    const fetch: SleeperCatalogFetch = async (input, init) => {
      calls.push({ init, url: input.toString() });
      return jsonResponse(playersFixture);
    };
    const now = new Date("2026-07-13T10:00:00.000Z");
    const firstCatalog = createSleeperPlayerCatalog({
      cacheFilePath,
      fetch,
      now: () => now,
    });
    const concurrentCatalog = createSleeperPlayerCatalog({
      cacheFilePath,
      fetch,
      now: () => now,
    });

    const [first, repeated, concurrent] = await Promise.all([
      firstCatalog.load(),
      firstCatalog.load(),
      concurrentCatalog.load(),
    ]);
    expect(first.ok).toBe(true);
    expect(repeated.ok).toBe(true);
    expect(concurrent.ok).toBe(true);
    if (!first.ok) throw first.error;
    expect(first.value.get("QB1")).toEqual({
      active: true,
      fantasyPositions: ["QB"],
      fullName: "Quentin Banks",
      playerId: "QB1",
      position: "QB",
      proTeam: "BUF",
      status: "Active",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.sleeper.app/v1/players/nfl");
    expect(calls[0]?.init?.headers).toMatchObject({
      Accept: "application/json",
      "User-Agent": "Rumbledore/2.0 (+https://rumbledore.app)",
    });

    const secondCatalog = createSleeperPlayerCatalog({
      cacheFilePath,
      fetch,
      now: () => new Date("2026-07-14T09:59:59.000Z"),
    });
    const fromDisk = await secondCatalog.load();
    expect(fromDisk.ok).toBe(true);
    if (!fromDisk.ok) throw fromDisk.error;
    expect(fromDisk.value.get("ARI")?.fullName).toBe("Arizona Cardinals");
    expect(calls).toHaveLength(1);
  });

  it("uses a stale valid cache when the daily refresh is unavailable", async () => {
    const cacheFilePath = temporaryCacheFile();
    let requests = 0;
    const fetch: SleeperCatalogFetch = async () => {
      requests += 1;
      return requests === 1
        ? jsonResponse(playersFixture)
        : jsonResponse({}, { status: 503 });
    };
    const first = createSleeperPlayerCatalog({
      cacheFilePath,
      fetch,
      now: () => new Date("2026-07-13T00:00:00.000Z"),
    });
    expect((await first.load()).ok).toBe(true);

    const staleFallback = createSleeperPlayerCatalog({
      cacheFilePath,
      fetch,
      now: () => new Date("2026-07-14T01:00:00.000Z"),
    });
    const result = await staleFallback.load();

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.get("WR4")?.fullName).toBe("Theo Young");
    expect(requests).toBe(2);

    const sameDayRetry = createSleeperPlayerCatalog({
      cacheFilePath,
      fetch,
      now: () => new Date("2026-07-14T02:00:00.000Z"),
    });
    expect((await sameDayRetry.load()).ok).toBe(true);
    expect(requests).toBe(2);
  });

  it("fails loudly when an uncached player dump has the wrong shape", async () => {
    const catalog = createSleeperPlayerCatalog({
      cacheFilePath: temporaryCacheFile(),
      fetch: async () => jsonResponse([]),
    });

    const result = await catalog.load();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected malformed catalog to fail");
    expect(result.error).toBeInstanceOf(ProviderParseError);
  });
});
