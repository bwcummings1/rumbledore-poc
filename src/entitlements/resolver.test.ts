// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type EntitlementsConfig, parseEnv } from "@/core/env/schema";
import { createDb, type Db, type DbHandle } from "@/db/client";
import {
  leagueEntitlements,
  leagues,
  userEntitlements,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  type EntitlementResolverEnv,
  mergeEntitlementCaps,
  resolveEntitlement,
} from "./resolver";

const marker = `resolver-entitlement-${randomUUID()}`;

const DEFAULT_CAPS = {
  aiPostsPerWeek: 25,
  individualLeaguesCovered: 10,
  maxPremiumLeaguesPerUser: null,
} satisfies EntitlementsConfig["caps"];

let handle: DbHandle;

function resolverEnv(
  overrides: Partial<EntitlementsConfig> = {},
): EntitlementResolverEnv {
  return {
    entitlements: {
      caps: { ...DEFAULT_CAPS, ...overrides.caps },
      devOverride: overrides.devOverride ?? false,
      gateArenaAdvanced: overrides.gateArenaAdvanced ?? false,
    },
  };
}

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `Resolver Entitlement ${tag}`,
      email: `${marker}-${tag}@example.test`,
    })
    .returning();
  return user;
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: `Resolver Entitlement ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
    })
    .returning();
  return league;
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable — start the local stack with `pnpm db:up` before running tests.",
      { cause },
    );
  }
  await migrateSerialized(handle);
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("resolveEntitlement", () => {
  it("allows every capability through the dev override before reading the database", async () => {
    const throwingDb = new Proxy(
      {},
      {
        get() {
          throw new Error("dev override should not read entitlement rows");
        },
      },
    ) as Db;

    await expect(
      resolveEntitlement({
        capability: "ai.cast.generate",
        db: throwingDb,
        env: resolverEnv({ devOverride: true }),
        leagueId: randomUUID(),
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "DEV_OVERRIDE",
      requiredTier: "premium",
      scope: "league",
      tier: "premium",
    });

    await expect(
      resolveEntitlement({
        capability: "ai.individual.agent",
        db: throwingDb,
        env: resolverEnv({ devOverride: true }),
        userId: randomUUID(),
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "DEV_OVERRIDE",
      requiredTier: "individual",
      scope: "user",
      tier: "individual",
    });
  });

  it("keeps league and user scopes independent", async () => {
    const user = await seedUser("independent-user");
    const otherUser = await seedUser("independent-other-user");
    const league = await seedLeague("independent-league");

    await handle.db
      .insert(userEntitlements)
      .values({ tier: "individual", userId: user.id });

    await expect(
      resolveEntitlement({
        capability: "ai.cast.generate",
        db: handle.db,
        env: resolverEnv(),
        leagueId: league.id,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "TIER_REQUIRED",
      requiredTier: "premium",
      scope: "league",
      tier: "free",
    });

    await expect(
      resolveEntitlement({
        capability: "ai.individual.agent",
        db: handle.db,
        env: resolverEnv(),
        userId: user.id,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "ENTITLED",
      requiredTier: "individual",
      scope: "user",
      tier: "individual",
    });

    await handle.db
      .insert(leagueEntitlements)
      .values({ leagueId: league.id, tier: "premium" });

    await expect(
      resolveEntitlement({
        capability: "ai.cast.generate",
        db: handle.db,
        env: resolverEnv(),
        leagueId: league.id,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "ENTITLED",
      requiredTier: "premium",
      tier: "premium",
    });

    await expect(
      resolveEntitlement({
        capability: "ai.individual.agent",
        db: handle.db,
        env: resolverEnv(),
        userId: otherUser.id,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "TIER_REQUIRED",
      requiredTier: "individual",
      scope: "user",
      tier: "none",
    });
  });

  it("treats expired and suspended rows as denied effective free or none", async () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const expiredLeague = await seedLeague("expired-league");
    const suspendedLeague = await seedLeague("suspended-league");
    const expiredUser = await seedUser("expired-user");

    await handle.db.insert(leagueEntitlements).values([
      {
        expiresAt: new Date("2026-06-15T11:59:59.000Z"),
        leagueId: expiredLeague.id,
        tier: "premium",
      },
      {
        leagueId: suspendedLeague.id,
        status: "suspended",
        tier: "premium",
      },
    ]);
    await handle.db.insert(userEntitlements).values({
      expiresAt: new Date("2026-06-15T11:59:59.000Z"),
      tier: "individual",
      userId: expiredUser.id,
    });

    await expect(
      resolveEntitlement({
        capability: "ai.cadence.schedule",
        db: handle.db,
        env: resolverEnv(),
        leagueId: expiredLeague.id,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "EXPIRED",
      tier: "free",
    });

    await expect(
      resolveEntitlement({
        capability: "ai.instigator",
        db: handle.db,
        env: resolverEnv(),
        leagueId: suspendedLeague.id,
        now: () => now,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "SUSPENDED",
      tier: "free",
    });

    await expect(
      resolveEntitlement({
        capability: "ai.individual.agent",
        db: handle.db,
        env: resolverEnv(),
        now: () => now,
        userId: expiredUser.id,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "EXPIRED",
      tier: "none",
    });
  });

  it("applies league caps overrides to the returned resolution", async () => {
    const league = await seedLeague("caps");
    await handle.db.insert(leagueEntitlements).values({
      capsOverride: {
        aiPostsPerWeek: 12,
        individualLeaguesCovered: 4,
        maxPremiumLeaguesPerUser: 2,
      },
      leagueId: league.id,
      tier: "premium",
    });

    await expect(
      resolveEntitlement({
        capability: "ai.lore.canonize",
        db: handle.db,
        env: resolverEnv(),
        leagueId: league.id,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      caps: {
        aiPostsPerWeek: 12,
        individualLeaguesCovered: 4,
        maxPremiumLeaguesPerUser: 2,
      },
      reason: "ENTITLED",
    });
  });

  it("leaves advanced arena ungated unless the config explicitly enables it", async () => {
    const league = await seedLeague("arena");

    await expect(
      resolveEntitlement({
        capability: "arena.advanced",
        db: handle.db,
        env: resolverEnv({ gateArenaAdvanced: false }),
        leagueId: league.id,
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "ENTITLED",
      tier: "free",
    });

    await expect(
      resolveEntitlement({
        capability: "arena.advanced",
        db: handle.db,
        env: resolverEnv({ gateArenaAdvanced: true }),
        leagueId: league.id,
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "TIER_REQUIRED",
      tier: "free",
    });
  });

  it("rejects caller input without the required scope identifier", async () => {
    await expect(
      resolveEntitlement({
        capability: "ai.cast.generate",
        db: handle.db,
        env: resolverEnv(),
      } as Parameters<typeof resolveEntitlement>[0]),
    ).rejects.toMatchObject({
      code: "ENTITLEMENT_SCOPE_INPUT_INVALID",
      status: 400,
    });
  });
});

describe("mergeEntitlementCaps", () => {
  it("keeps invalid override values from weakening configured caps", () => {
    expect(
      mergeEntitlementCaps(DEFAULT_CAPS, {
        aiPostsPerWeek: 0,
        individualLeaguesCovered: -1,
        maxPremiumLeaguesPerUser: "many",
      }),
    ).toEqual(DEFAULT_CAPS);
  });

  it("allows nullable max premium league overrides", () => {
    expect(
      mergeEntitlementCaps(
        {
          aiPostsPerWeek: 25,
          individualLeaguesCovered: 10,
          maxPremiumLeaguesPerUser: 3,
        },
        { maxPremiumLeaguesPerUser: null },
      ),
    ).toEqual({
      aiPostsPerWeek: 25,
      individualLeaguesCovered: 10,
      maxPremiumLeaguesPerUser: null,
    });
  });
});
