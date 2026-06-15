// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { leagues, members, platformAdmins, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  listLeagueMembershipsForUser,
  requireLeagueRole,
  requireLeagueRoleForUser,
  requirePlatformAdmin,
  requireSession,
} from "./guards";

const marker = `guardtest-${randomUUID()}`;

let handle: DbHandle;
let memberUserId: string;
let stewardUserId: string;
let adminUserId: string;
let outsiderUserId: string;
let platformAdminUserId: string;
let leagueId: string;
let otherLeagueId: string;

function sessionFor(userId: string | null) {
  return async () => (userId ? { user: { id: userId } } : null);
}

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `Guard ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning({ id: users.id });
  if (!user) throw new Error(`failed to seed ${tag} user`);
  return user.id;
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: `Guard League ${tag}`,
      provider: "espn",
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

  [
    memberUserId,
    stewardUserId,
    adminUserId,
    outsiderUserId,
    platformAdminUserId,
  ] = await Promise.all([
    seedUser("member"),
    seedUser("steward"),
    seedUser("admin"),
    seedUser("outsider"),
    seedUser("platform-admin"),
  ]);
  [leagueId, otherLeagueId] = await Promise.all([
    seedLeague("a"),
    seedLeague("b"),
  ]);

  await handle.db.insert(members).values([
    { organizationId: leagueId, role: "member", userId: memberUserId },
    { organizationId: leagueId, role: "data_steward", userId: stewardUserId },
    { organizationId: leagueId, role: "league_admin", userId: adminUserId },
    {
      organizationId: otherLeagueId,
      role: "commissioner",
      userId: adminUserId,
    },
  ]);
  await handle.db.insert(platformAdmins).values({
    reason: "guard test",
    userId: platformAdminUserId,
  });
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

describe("auth guards", () => {
  it("requires a session before touching league membership", async () => {
    const result = await requireLeagueRole({
      db: undefined as unknown as DbHandle["db"],
      getSession: sessionFor(null),
      headers: new Headers(),
      leagueId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(401);
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the authenticated user id for a valid session", async () => {
    const result = await requireSession({
      getSession: sessionFor(memberUserId),
      headers: new Headers(),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        session: { user: { id: memberUserId } },
        userId: memberUserId,
      },
    });
  });

  it("authorizes member-level league access and returns the stored role", async () => {
    const result = await requireLeagueRole({
      db: handle.db,
      getSession: sessionFor(stewardUserId),
      headers: new Headers(),
      leagueId,
      minRole: "member",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      leagueId,
      role: "data_steward",
      userId: stewardUserId,
    });
  });

  it("rejects non-members and insufficient roles", async () => {
    const nonMember = await requireLeagueRoleForUser(handle.db, {
      leagueId,
      userId: outsiderUserId,
    });
    expect(nonMember.ok).toBe(false);
    if (nonMember.ok) return;
    expect(nonMember.error.status).toBe(403);
    expect(nonMember.error.code).toBe("LEAGUE_FORBIDDEN");

    const memberAsAdmin = await requireLeagueRoleForUser(handle.db, {
      leagueId,
      minRole: "league_admin",
      userId: memberUserId,
    });
    expect(memberAsAdmin.ok).toBe(false);
    if (memberAsAdmin.ok) return;
    expect(memberAsAdmin.error.status).toBe(403);
    expect(memberAsAdmin.error.code).toBe("LEAGUE_FORBIDDEN");
  });

  it("lists requested memberships through the shared role filter", async () => {
    const result = await listLeagueMembershipsForUser(handle.db, {
      leagueIds: [leagueId, otherLeagueId],
      minRole: "league_admin",
      userId: adminUserId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = [
      { leagueId, role: "league_admin" },
      { leagueId: otherLeagueId, role: "commissioner" },
    ].sort((left, right) => left.leagueId.localeCompare(right.leagueId));
    expect(result.value).toEqual(expected);
  });

  it("rejects malformed league ids before membership lookup", async () => {
    const result = await requireLeagueRoleForUser(handle.db, {
      leagueId: "not-a-uuid",
      userId: memberUserId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(400);
    expect(result.error.code).toBe("INVALID_LEAGUE_ID");
  });

  it("authorizes platform admins through the global admin table", async () => {
    const result = await requirePlatformAdmin({
      db: handle.db,
      getSession: sessionFor(platformAdminUserId),
      headers: new Headers(),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        session: { user: { id: platformAdminUserId } },
        userId: platformAdminUserId,
      },
    });
  });

  it("does not treat league admins or commissioners as platform admins", async () => {
    const result = await requirePlatformAdmin({
      db: handle.db,
      getSession: sessionFor(adminUserId),
      headers: new Headers(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(403);
    expect(result.error.code).toBe("PLATFORM_ADMIN_FORBIDDEN");
  });
});
