// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataIntegrityChecks,
  leagueSeasonSettings,
  leagues,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { FantasyProviderId } from "@/providers/ids";
import { runDataIntegrityChecks } from "./engine";

const marker = `provider-decoding-${randomUUID()}`;
const leagueIds: string[] = [];
let adminUrl: string;
let databaseName: string;
let handle: DbHandle;

function databaseUrlWithName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function quotedDatabaseName(name: string): string {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error("Generated test database name was unsafe");
  }
  return `"${name}"`;
}

beforeAll(async () => {
  const baseDatabaseUrl = parseEnv(process.env).databaseUrl;
  databaseName = `rumbledore_provider_decoding_${randomUUID().replaceAll("-", "")}`;
  adminUrl = databaseUrlWithName(baseDatabaseUrl, "postgres");
  const adminPool = new Pool({ connectionString: adminUrl });
  try {
    await adminPool.query(
      `create database ${quotedDatabaseName(databaseName)}`,
    );
  } catch (cause) {
    throw new Error(
      "Postgres could not create an isolated provider-decoding test database.",
      { cause },
    );
  } finally {
    await adminPool.end();
  }
  handle = createDb(databaseUrlWithName(baseDatabaseUrl, databaseName));
  await migrateSerialized(handle);
});

afterAll(async () => {
  if (!handle) return;
  if (leagueIds.length > 0) {
    await handle.db.delete(leagues).where(inArray(leagues.id, leagueIds));
  }
  await handle.pool.end();
  const adminPool = new Pool({ connectionString: adminUrl });
  try {
    await adminPool.query(
      `drop database if exists ${quotedDatabaseName(databaseName)}`,
    );
  } finally {
    await adminPool.end();
  }
});

async function seedLeagueWithNumericCodes(provider: FantasyProviderId) {
  const providerLeagueId = `${marker}-${provider}`;
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: `${provider} decoding invariant`,
      provider,
      providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 2,
      sport: "ffl",
      status: "complete",
    })
    .returning({ id: leagues.id });
  if (!league) {
    throw new Error(`${provider} decoding invariant league was not created`);
  }
  leagueIds.push(league.id);

  await withLeagueContext(handle.db, league.id, async (tx) => {
    await tx.insert(leagueSeasonSettings).values({
      contentHash: `${marker}-${provider}-settings`,
      leagueId: league.id,
      leagueProviderId: providerLeagueId,
      leagueSize: 2,
      lineupSlotCounts: { "0": 1 },
      matchupPeriodCount: 1,
      provider,
      scoringSettings: { scoringItems: [{ points: 1, statId: 3 }] },
      scoringType: "H2H_POINTS",
      season: 2026,
    });
  });

  return league.id;
}

describe("provider_code_decoding integrity invariant", () => {
  it.each(["sleeper", "yahoo"] as const)(
    "fails an imported %s league when its dictionary is unregistered",
    async (provider) => {
      const leagueId = await seedLeagueWithNumericCodes(provider);

      await runDataIntegrityChecks(handle.db, { leagueId });

      const check = await withLeagueContext(handle.db, leagueId, (tx) =>
        tx.query.dataIntegrityChecks.findFirst({
          where: and(
            eq(dataIntegrityChecks.leagueId, leagueId),
            eq(dataIntegrityChecks.checkKey, "provider_code_decoding"),
          ),
        }),
      );
      expect(check).toMatchObject({
        status: "fail",
        detail: {
          checkedProviders: [provider],
          issues: [{ provider, reason: "dictionary_missing" }],
          observedCodeCounts: {
            [provider]: expect.objectContaining({
              lineupSlots: 1,
              scoringStats: 1,
            }),
          },
        },
      });
    },
  );
});
