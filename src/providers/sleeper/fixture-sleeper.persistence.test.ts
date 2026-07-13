// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLeagueDataBookData } from "@/app/leagues/[leagueId]/data/data-book-data";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { fantasyRosterEntries, leagues } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { importLeagueHistory } from "@/ingestion/historical-import";
import { recomputeLeagueStatistics } from "@/stats";
import { createFixtureSleeperProvider } from "./fixture-sleeper";

const marker = `sleeperfixturepersist-${randomUUID()}`;
const currentLeagueId = `${marker}-2026`;
const previousLeagueId = `${marker}-2025`;
let handle: DbHandle;

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await handle.pool.query("select 1");
  await migrateSerialized(handle);
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(
      and(
        eq(leagues.provider, "sleeper"),
        eq(leagues.providerLeagueId, currentLeagueId),
      ),
    );
  await handle.pool.end();
});

describe("Sleeper fixture history persistence", () => {
  it("persists every named historical player-week roster row", async () => {
    const provider = createFixtureSleeperProvider({
      currentLeagueId,
      previousLeagueId,
    });
    const authenticated = await provider.authenticate({
      seasons: [2026, 2025],
      usernameOrUserId: "fixture_sleeper",
    });
    expect(authenticated.ok).toBe(true);
    if (!authenticated.ok) throw authenticated.error;
    const discovered = await provider.discoverLeagues(authenticated.value);
    expect(discovered.ok).toBe(true);
    if (!discovered.ok) throw discovered.error;
    const current = discovered.value.find(
      (league) => league.providerId === currentLeagueId,
    );
    if (!current) throw new Error("current fixture league was not discovered");

    const imported = await importLeagueHistory({
      db: handle.db,
      provider,
      ref: current,
      seasons: [2025],
      session: authenticated.value,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw imported.error;
    expect(imported.value.rosters).toEqual({
      changed: 30,
      total: 30,
      unchanged: 0,
    });

    const rows = await handle.db
      .select()
      .from(fantasyRosterEntries)
      .where(
        and(
          eq(fantasyRosterEntries.leagueId, imported.value.league.id),
          eq(fantasyRosterEntries.season, 2025),
        ),
      );
    expect(rows).toHaveLength(30);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actualPoints: 22.4,
          providerPlayerId: "QB1",
          scoringPeriod: 1,
          slot: "QB",
          started: true,
        }),
      ]),
    );

    await recomputeLeagueStatistics(handle.db, {
      leagueId: imported.value.league.id,
    });
    const dataBook = await getLeagueDataBookData(handle.db, {
      canManageEras: true,
      leagueId: imported.value.league.id,
      selectedSeason: 2025,
    });
    expect(dataBook.status).toBe("ready");
    if (dataBook.status !== "ready") {
      throw new Error("Sleeper fixture Data Book was not ready");
    }
    const selectedSeason = dataBook.data.seasons.find(
      (season) => season.season === 2025,
    );
    expect(selectedSeason?.weeks[0]?.roster).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerName: "Quentin Banks",
          position: "QB",
          slot: "QB",
        }),
      ]),
    );
  });
});
