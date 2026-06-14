// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { leagues, members, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  listLeagueSwitcherItemsForUser,
  markLeagueOpened,
} from "./league-switcher-data";

const marker = `switchertest-${randomUUID()}`;
const openedOlder = new Date("2026-06-14T08:00:00.000Z");
const openedNewest = new Date("2026-06-14T10:00:00.000Z");

let handle: DbHandle;
let userId: string;
let otherUserId: string;
let espnLeagueId: string;
let sleeperLeagueId: string;
let yahooLeagueId: string;
let otherLeagueId: string;

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `Switcher ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning({ id: users.id });
  if (!user) throw new Error(`failed to seed ${tag} user`);
  return user.id;
}

async function seedLeague(
  tag: string,
  values: Pick<typeof leagues.$inferInsert, "name" | "provider">,
) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: values.name,
      provider: values.provider,
      providerLeagueId: `${marker}-${tag}`,
      season: 2026,
      sport: "ffl",
    })
    .returning({ id: leagues.id });
  if (!league) throw new Error(`failed to seed ${tag} league`);
  return league.id;
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable - start the local stack with `pnpm db:up` before running tests.",
      { cause },
    );
  }
  await migrateSerialized(handle);

  userId = await seedUser("member");
  otherUserId = await seedUser("other");
  espnLeagueId = await seedLeague("espn", {
    name: "Alpha After Dark",
    provider: "espn",
  });
  sleeperLeagueId = await seedLeague("sleeper", {
    name: "Sleeper Bowl",
    provider: "sleeper",
  });
  yahooLeagueId = await seedLeague("yahoo", {
    name: "Yahoo Crown",
    provider: "yahoo",
  });
  otherLeagueId = await seedLeague("private", {
    name: "Private League",
    provider: "espn",
  });

  await handle.db.insert(members).values([
    { organizationId: espnLeagueId, role: "member", userId },
    {
      lastOpenedAt: openedOlder,
      organizationId: sleeperLeagueId,
      role: "data_steward",
      userId,
    },
    {
      lastOpenedAt: openedNewest,
      organizationId: yahooLeagueId,
      role: "commissioner",
      userId,
    },
    {
      lastOpenedAt: new Date("2026-06-14T11:00:00.000Z"),
      organizationId: otherLeagueId,
      role: "commissioner",
      userId: otherUserId,
    },
  ]);
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

describe("league switcher data", () => {
  it("lists only the user's leagues with provider badges in MRU order", async () => {
    const result = await listLeagueSwitcherItemsForUser(handle.db, { userId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((league) => league.leagueId)).toEqual([
      yahooLeagueId,
      sleeperLeagueId,
      espnLeagueId,
    ]);
    expect(result.value.map((league) => league.providerLabel)).toEqual([
      "Yahoo",
      "Sleeper",
      "ESPN",
    ]);
    expect(result.value.map((league) => league.role)).toEqual([
      "commissioner",
      "data_steward",
      "member",
    ]);
    expect(
      result.value.some((league) => league.leagueId === otherLeagueId),
    ).toBe(false);
  });

  it("honors explicit league filters without leaking non-member leagues", async () => {
    const result = await listLeagueSwitcherItemsForUser(handle.db, {
      leagueIds: [espnLeagueId, otherLeagueId],
      userId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("LEAGUE_FORBIDDEN");
  });

  it("updates membership recency when a league is opened", async () => {
    const openedAt = new Date("2026-06-14T12:00:00.000Z");
    const marked = await markLeagueOpened(handle.db, {
      leagueId: espnLeagueId,
      openedAt,
      userId,
    });

    expect(marked).toEqual({
      ok: true,
      value: { lastOpenedAt: openedAt, leagueId: espnLeagueId },
    });

    const listed = await listLeagueSwitcherItemsForUser(handle.db, { userId });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value[0]?.leagueId).toBe(espnLeagueId);

    const [member] = await handle.db
      .select({ lastOpenedAt: members.lastOpenedAt })
      .from(members)
      .where(
        and(
          eq(members.organizationId, espnLeagueId),
          eq(members.userId, userId),
        ),
      );
    expect(member?.lastOpenedAt?.toISOString()).toBe(openedAt.toISOString());
  });

  it("rejects malformed league ids before updating recency", async () => {
    const result = await markLeagueOpened(handle.db, {
      leagueId: "not-a-uuid",
      userId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_LEAGUE_ID");
  });
});
