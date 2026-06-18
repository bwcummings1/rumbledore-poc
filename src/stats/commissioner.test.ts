// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireLeagueRoleForUser } from "@/auth/guards";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { leagueDataEdits, leagues, members, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { transferCommissionerRole } from "./commissioner";

const marker = `commissionertest-${randomUUID()}`;
let handle: DbHandle;

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `Commissioner ${tag}`,
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
      name: `Commissioner League ${tag}`,
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

describe("transferCommissionerRole", () => {
  it("transfers commissioner authority and writes a league-visible ledger row", async () => {
    const leagueId = await seedLeague("handoff");
    const commissionerUserId = await seedUser("commissioner");
    const targetUserId = await seedUser("target");
    const [commissionerMember, targetMember] = await handle.db
      .insert(members)
      .values([
        {
          organizationId: leagueId,
          role: "commissioner",
          userId: commissionerUserId,
        },
        {
          organizationId: leagueId,
          role: "data_steward",
          userId: targetUserId,
        },
      ])
      .returning({
        id: members.id,
        role: members.role,
        userId: members.userId,
      });

    if (!commissionerMember || !targetMember) {
      throw new Error("members were not seeded");
    }

    const result = await transferCommissionerRole(handle.db, {
      actorUserId: commissionerUserId,
      leagueId,
      reason: "owner asked for a handoff",
      targetMemberId: targetMember.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.newCommissioner).toMatchObject({
      memberId: targetMember.id,
      role: "commissioner",
      userId: targetUserId,
    });
    expect(result.value.previousCommissioner).toMatchObject({
      memberId: commissionerMember.id,
      role: "member",
      userId: commissionerUserId,
    });

    await expect(
      requireLeagueRoleForUser(handle.db, {
        leagueId,
        minRole: "commissioner",
        userId: targetUserId,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      requireLeagueRoleForUser(handle.db, {
        leagueId,
        minRole: "commissioner",
        userId: commissionerUserId,
      }),
    ).resolves.toMatchObject({ ok: false });

    const [ledger] = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(leagueDataEdits)
        .where(
          and(
            eq(leagueDataEdits.leagueId, leagueId),
            eq(leagueDataEdits.field, "commissioner_handoff"),
          ),
        )
        .limit(1),
    );

    expect(ledger).toMatchObject({
      actorUserId: commissionerUserId,
      editClass: "substantive",
      reason: "owner asked for a handoff",
      targetId: targetMember.id,
      targetKind: "member",
    });
  });

  it("rejects non-commissioner handoffs before membership mutation", async () => {
    const leagueId = await seedLeague("forbidden");
    const commissionerUserId = await seedUser("forbidden-commissioner");
    const memberUserId = await seedUser("forbidden-member");
    const targetUserId = await seedUser("forbidden-target");
    const insertedMembers = await handle.db
      .insert(members)
      .values([
        {
          organizationId: leagueId,
          role: "commissioner",
          userId: commissionerUserId,
        },
        { organizationId: leagueId, role: "member", userId: memberUserId },
        { organizationId: leagueId, role: "member", userId: targetUserId },
      ])
      .returning({
        id: members.id,
        role: members.role,
        userId: members.userId,
      });
    const member = insertedMembers[1];
    const targetMember = insertedMembers[2];

    if (!member || !targetMember) {
      throw new Error("members were not seeded");
    }

    const result = await transferCommissionerRole(handle.db, {
      actorUserId: memberUserId,
      leagueId,
      targetMemberId: targetMember.id,
    });

    expect(result).toMatchObject({ ok: false });
    const [targetAfter] = await handle.db
      .select({ role: members.role })
      .from(members)
      .where(eq(members.id, targetMember.id))
      .limit(1);
    expect(targetAfter?.role).toBe("member");
  });
});
