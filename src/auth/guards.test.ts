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
let commissionerUserId: string;
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
    commissionerUserId,
    outsiderUserId,
    platformAdminUserId,
  ] = await Promise.all([
    seedUser("member"),
    seedUser("steward"),
    seedUser("commissioner"),
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
    {
      organizationId: leagueId,
      role: "commissioner",
      userId: commissionerUserId,
    },
    {
      organizationId: otherLeagueId,
      role: "commissioner",
      userId: commissionerUserId,
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

    const memberAsCommissioner = await requireLeagueRoleForUser(handle.db, {
      leagueId,
      minRole: "commissioner",
      userId: memberUserId,
    });
    expect(memberAsCommissioner.ok).toBe(false);
    if (memberAsCommissioner.ok) return;
    expect(memberAsCommissioner.error.status).toBe(403);
    expect(memberAsCommissioner.error.code).toBe("LEAGUE_FORBIDDEN");
  });

  it("admits a data_steward to a steward gate but not to a commissioner gate", async () => {
    // Pins the collapsed ladder from the other side: after `league_admin` was
    // folded into `commissioner` (migration 0082) there is exactly one rung
    // above `data_steward`, and the steward must not have been promoted into it.
    const atStewardGate = await requireLeagueRoleForUser(handle.db, {
      leagueId,
      minRole: "data_steward",
      userId: stewardUserId,
    });
    expect(atStewardGate.ok).toBe(true);

    const atCommissionerGate = await requireLeagueRoleForUser(handle.db, {
      leagueId,
      minRole: "commissioner",
      userId: stewardUserId,
    });
    expect(atCommissionerGate.ok).toBe(false);
  });

  it("clears every gate for a commissioner, including the steward gate", async () => {
    // The maintainer's ruling made concrete: an admin (= commissioner) may do
    // anything an assigned role can. A `league_admin` row seeded before 0082 is
    // now stored as `commissioner`, so this is the path such a user takes.
    for (const minRole of ["member", "data_steward", "commissioner"] as const) {
      const result = await requireLeagueRoleForUser(handle.db, {
        leagueId,
        minRole,
        userId: commissionerUserId,
      });
      expect(result.ok, `commissioner denied at minRole=${minRole}`).toBe(true);
      if (!result.ok) return;
      expect(result.value.role).toBe("commissioner");
    }
  });

  it("lists requested memberships through the shared role filter", async () => {
    const result = await listLeagueMembershipsForUser(handle.db, {
      leagueIds: [leagueId, otherLeagueId],
      minRole: "commissioner",
      userId: commissionerUserId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = [
      { leagueId, role: "commissioner" },
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

  it("does not treat league commissioners as platform admins", async () => {
    const result = await requirePlatformAdmin({
      db: handle.db,
      getSession: sessionFor(commissionerUserId),
      headers: new Headers(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(403);
    expect(result.error.code).toBe("PLATFORM_ADMIN_FORBIDDEN");
  });
});
