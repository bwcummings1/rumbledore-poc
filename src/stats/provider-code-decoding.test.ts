// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
import {
  encodeSleeperRosterSlot,
  encodeSleeperScoringSetting,
} from "@/providers/sleeper/reference-data";
import { runDataIntegrityChecks } from "./engine";

const forgedUnregisteredProviders = vi.hoisted(() => new Set<string>());

vi.mock("@/providers/decoding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/providers/decoding")>();
  return {
    ...actual,
    providerCodeDecodingIssues: (
      provider: FantasyProviderId,
      observed: Parameters<typeof actual.providerCodeDecodingIssues>[1],
    ) =>
      forgedUnregisteredProviders.has(provider)
        ? [{ provider, reason: "dictionary_missing" as const }]
        : actual.providerCodeDecodingIssues(provider, observed),
  };
});

const marker = `provider-decoding-${randomUUID()}`;
const leagueIds: string[] = [];
let adminUrl: string;
let databaseName: string;
let handle: DbHandle;
let seedSequence = 0;

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

beforeEach(() => {
  forgedUnregisteredProviders.clear();
});

async function seedLeagueWithNumericCodes(
  provider: FantasyProviderId,
  {
    lineupSlotIds = [0],
    scoringStatIds = [3],
  }: { lineupSlotIds?: number[]; scoringStatIds?: number[] } = {},
) {
  seedSequence += 1;
  const providerLeagueId = `${marker}-${provider}-${seedSequence}`;
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
      lineupSlotCounts: Object.fromEntries(
        lineupSlotIds.map((id) => [String(id), 1]),
      ),
      matchupPeriodCount: 1,
      provider,
      scoringSettings: {
        scoringItems: scoringStatIds.map((statId) => ({ points: 1, statId })),
      },
      scoringType: "H2H_POINTS",
      season: 2026,
    });
  });

  return league.id;
}

async function providerCodeCheck(leagueId: string) {
  return withLeagueContext(handle.db, leagueId, (tx) =>
    tx.query.dataIntegrityChecks.findFirst({
      where: and(
        eq(dataIntegrityChecks.leagueId, leagueId),
        eq(dataIntegrityChecks.checkKey, "provider_code_decoding"),
      ),
    }),
  );
}

function requiredCode(value: number | undefined): number {
  if (value === undefined) throw new Error("expected a Sleeper adapter code");
  return value;
}

describe("provider_code_decoding integrity invariant", () => {
  it("keeps an imported Yahoo league loud while its dictionary is unregistered", async () => {
    const leagueId = await seedLeagueWithNumericCodes("yahoo");

    await runDataIntegrityChecks(handle.db, { leagueId });

    expect(await providerCodeCheck(leagueId)).toMatchObject({
      status: "fail",
      detail: {
        checkedProviders: ["yahoo"],
        issues: [{ provider: "yahoo", reason: "dictionary_missing" }],
        observedCodeCounts: {
          yahoo: expect.objectContaining({
            lineupSlots: 1,
            scoringStats: 1,
          }),
        },
      },
    });
  });

  it("passes registered Sleeper lineup and scoring adapter codes", async () => {
    const leagueId = await seedLeagueWithNumericCodes("sleeper", {
      lineupSlotIds: [requiredCode(encodeSleeperRosterSlot("SUPER_FLEX"))],
      scoringStatIds: [
        requiredCode(encodeSleeperScoringSetting("idp_tkl_solo")),
      ],
    });

    await runDataIntegrityChecks(handle.db, { leagueId });

    expect(await providerCodeCheck(leagueId)).toMatchObject({
      status: "pass",
      detail: {
        checkedProviders: ["sleeper"],
        issues: [],
        observedCodeCounts: {
          sleeper: expect.objectContaining({
            lineupSlots: 1,
            scoringStats: 1,
          }),
        },
      },
    });
  });

  it("re-fails Sleeper with dictionary_missing when registration is forged away", async () => {
    forgedUnregisteredProviders.add("sleeper");
    const leagueId = await seedLeagueWithNumericCodes("sleeper", {
      lineupSlotIds: [requiredCode(encodeSleeperRosterSlot("QB"))],
      scoringStatIds: [requiredCode(encodeSleeperScoringSetting("pass_yd"))],
    });

    await runDataIntegrityChecks(handle.db, { leagueId });

    expect(await providerCodeCheck(leagueId)).toMatchObject({
      status: "fail",
      detail: {
        checkedProviders: ["sleeper"],
        issues: [{ provider: "sleeper", reason: "dictionary_missing" }],
        observedCodeCounts: {
          sleeper: expect.objectContaining({
            lineupSlots: 1,
            scoringStats: 1,
          }),
        },
      },
    });
  });
});
