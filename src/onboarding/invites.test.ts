// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMembers,
  fantasyTeams,
  leagueInvites,
  leagueMemberIdentityClaims,
  leagues,
  members,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  acceptLeagueInvite,
  createLeaguemateInvite,
  listLeaguemateInviteTargets,
} from "./invites";
import { RecordingInviteNotifier } from "./notifier";

const marker = `invitetest-${randomUUID()}`;

let handle: DbHandle;

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `${marker} ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning();
  if (!user) throw new Error("user was not created");
  return user;
}

async function seedLeague() {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: `${marker} league`,
      provider: "espn",
      providerLeagueId: `${marker}-${randomUUID()}`,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 3,
      sport: "ffl",
      status: "in_season",
    })
    .returning();
  if (!league) throw new Error("league was not created");
  return league;
}

async function seedImportedMembers({
  leagueId,
  leagueProviderId,
}: {
  leagueId: string;
  leagueProviderId: string;
}) {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const [self, invited, noTeam] = await tx
      .insert(fantasyMembers)
      .values([
        {
          contentHash: `${marker}-self-hash`,
          displayName: "Self Manager",
          leagueId,
          leagueProviderId,
          provider: "espn",
          providerMemberId: `${marker}-self-member`,
          role: "commissioner",
          season: 2026,
        },
        {
          contentHash: `${marker}-invited-hash`,
          displayName: "Fixture Manager Two",
          leagueId,
          leagueProviderId,
          provider: "espn",
          providerMemberId: `${marker}-member-two`,
          role: "member",
          season: 2026,
        },
        {
          contentHash: `${marker}-noteam-hash`,
          displayName: "Fixture Manager Three",
          leagueId,
          leagueProviderId,
          provider: "espn",
          providerMemberId: `${marker}-member-three`,
          role: "member",
          season: 2026,
        },
      ])
      .returning();
    if (!self || !invited || !noTeam) {
      throw new Error("fantasy members were not created");
    }

    await tx.insert(fantasyTeams).values([
      {
        abbrev: "ONE",
        contentHash: `${marker}-team-one-hash`,
        leagueId,
        leagueProviderId,
        name: "Self Team",
        ownerMemberIds: [self.providerMemberId],
        provider: "espn",
        providerTeamId: `${marker}-team-one`,
        season: 2026,
      },
      {
        abbrev: "TWO",
        contentHash: `${marker}-team-two-hash`,
        leagueId,
        leagueProviderId,
        name: "Invite Team",
        ownerMemberIds: [invited.providerMemberId],
        provider: "espn",
        providerTeamId: `${marker}-team-two`,
        season: 2026,
      },
    ]);

    return { invited, noTeam, self };
  });
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

describe("leaguemate invites", () => {
  it("lists non-self imported members with their team names", async () => {
    const league = await seedLeague();
    const user = await seedUser("list");
    const imported = await seedImportedMembers({
      leagueId: league.id,
      leagueProviderId: league.providerLeagueId,
    });
    await handle.db.insert(members).values({
      organizationId: league.id,
      role: "commissioner",
      userId: user.id,
    });
    await handle.db.insert(providerCredentials).values({
      connectionFlow: "manual",
      encryptedPayload: `${marker}-encrypted`,
      lastValidatedAt: new Date("2026-06-12T00:00:00.000Z"),
      provider: "espn",
      subjectProviderId: imported.self.providerMemberId,
      userId: user.id,
    });

    const listed = await listLeaguemateInviteTargets(
      { db: handle.db, notifier: new RecordingInviteNotifier() },
      {
        leagueId: league.id,
        userId: user.id,
      },
    );

    expect(listed.ok).toBe(true);
    if (!listed.ok) throw listed.error;
    expect(listed.value.totals).toEqual({
      importedMembers: 3,
      inviteTargets: 2,
    });
    expect(listed.value.targets.map((target) => target.displayName)).toEqual([
      "Fixture Manager Three",
      "Fixture Manager Two",
    ]);
    expect(
      listed.value.targets.find(
        (target) =>
          target.providerMemberId === imported.invited.providerMemberId,
      ),
    ).toMatchObject({
      teamNames: ["Invite Team"],
    });
    expect(
      listed.value.targets.some(
        (target) => target.providerMemberId === imported.self.providerMemberId,
      ),
    ).toBe(false);
  });

  it("creates a stable share link and records mock SMS/email sends", async () => {
    const league = await seedLeague();
    const user = await seedUser("create");
    const imported = await seedImportedMembers({
      leagueId: league.id,
      leagueProviderId: league.providerLeagueId,
    });
    await handle.db.insert(members).values({
      organizationId: league.id,
      role: "commissioner",
      userId: user.id,
    });
    await handle.db.insert(providerCredentials).values({
      connectionFlow: "manual",
      encryptedPayload: `${marker}-encrypted-create`,
      lastValidatedAt: new Date("2026-06-12T00:00:00.000Z"),
      provider: "espn",
      subjectProviderId: imported.self.providerMemberId,
      userId: user.id,
    });

    const notifier = new RecordingInviteNotifier();
    const deps = {
      db: handle.db,
      notifier,
      now: () => new Date("2026-06-12T12:00:00.000Z"),
    };

    const shared = await createLeaguemateInvite(deps, {
      appBaseUrl: "https://rumbledore.example/app",
      channel: "share",
      leagueId: league.id,
      providerMemberId: imported.invited.providerMemberId,
      userId: user.id,
    });
    expect(shared.ok).toBe(true);
    if (!shared.ok) throw shared.error;
    expect(shared.value.inviteUrl).toContain(`/invite/${league.id}/`);
    expect(shared.value.target).toMatchObject({
      displayName: "Fixture Manager Two",
      teamNames: ["Invite Team"],
    });
    expect(notifier.sms).toHaveLength(0);
    expect(notifier.emails).toHaveLength(0);

    const sharedAgain = await createLeaguemateInvite(deps, {
      appBaseUrl: "https://rumbledore.example",
      channel: "share",
      leagueId: league.id,
      providerMemberId: imported.invited.providerMemberId,
      userId: user.id,
    });
    expect(sharedAgain.ok).toBe(true);
    if (!sharedAgain.ok) throw sharedAgain.error;
    expect(sharedAgain.value.token).toBe(shared.value.token);
    expect(sharedAgain.value.inviteUrl).toBe(shared.value.inviteUrl);

    const emailed = await createLeaguemateInvite(deps, {
      appBaseUrl: "https://rumbledore.example",
      channel: "email",
      destination: "MANAGER@example.com",
      leagueId: league.id,
      providerMemberId: imported.invited.providerMemberId,
      userId: user.id,
    });
    expect(emailed.ok).toBe(true);
    if (!emailed.ok) throw emailed.error;
    expect(notifier.emails).toHaveLength(1);
    expect(notifier.emails[0]).toMatchObject({
      subject: `Join ${marker} league on Rumbledore`,
      to: "manager@example.com",
    });
    expect(notifier.emails[0]?.body).toContain(emailed.value.inviteUrl);

    const sms = await createLeaguemateInvite(deps, {
      appBaseUrl: "https://rumbledore.example",
      channel: "sms",
      destination: "+1 (555) 123-4567",
      leagueId: league.id,
      providerMemberId: imported.noTeam.providerMemberId,
      userId: user.id,
    });
    expect(sms.ok).toBe(true);
    if (!sms.ok) throw sms.error;
    expect(notifier.sms).toHaveLength(1);
    expect(notifier.sms[0]).toMatchObject({
      to: "+15551234567",
    });
    expect(notifier.sms[0]?.body).toContain(sms.value.inviteUrl);

    const rows = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({
          channel: leagueInvites.channel,
          providerMemberId: leagueInvites.providerMemberId,
          sentAt: leagueInvites.sentAt,
          status: leagueInvites.status,
          targetHint: leagueInvites.targetHint,
        })
        .from(leagueInvites)
        .where(
          and(
            eq(leagueInvites.leagueId, league.id),
            eq(
              leagueInvites.providerMemberId,
              imported.invited.providerMemberId,
            ),
          ),
        ),
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "share",
          status: "pending",
          targetHint: null,
        }),
        expect.objectContaining({
          channel: "email",
          status: "sent",
          targetHint: "m***@example.com",
        }),
      ]),
    );
    expect(rows.find((row) => row.channel === "email")?.sentAt).toBeInstanceOf(
      Date,
    );
  });

  it("accepts a share invite by granting membership and recording identity", async () => {
    const league = await seedLeague();
    const inviter = await seedUser("accept-inviter");
    const invitee = await seedUser("accept-invitee");
    const imported = await seedImportedMembers({
      leagueId: league.id,
      leagueProviderId: league.providerLeagueId,
    });
    await handle.db.insert(members).values({
      organizationId: league.id,
      role: "commissioner",
      userId: inviter.id,
    });
    await handle.db.insert(providerCredentials).values({
      connectionFlow: "manual",
      encryptedPayload: `${marker}-encrypted-accept`,
      lastValidatedAt: new Date("2026-06-12T00:00:00.000Z"),
      provider: "espn",
      subjectProviderId: imported.self.providerMemberId,
      userId: inviter.id,
    });

    const deps = {
      db: handle.db,
      notifier: new RecordingInviteNotifier(),
      now: () => new Date("2026-06-12T12:00:00.000Z"),
    };
    const shared = await createLeaguemateInvite(deps, {
      appBaseUrl: "https://rumbledore.example",
      channel: "share",
      leagueId: league.id,
      providerMemberId: imported.invited.providerMemberId,
      userId: inviter.id,
    });
    expect(shared.ok).toBe(true);
    if (!shared.ok) throw shared.error;

    const accepted = await acceptLeagueInvite(
      { db: handle.db, now: () => new Date("2026-06-12T12:05:00.000Z") },
      {
        leagueId: league.id,
        token: shared.value.token,
        userId: invitee.id,
      },
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw accepted.error;
    expect(accepted.value).toMatchObject({
      providerMemberId: imported.invited.providerMemberId,
      providerTeamIds: [`${marker}-team-two`],
      teamNames: ["Invite Team"],
    });

    const [membership] = await handle.db
      .select({ role: members.role })
      .from(members)
      .where(
        and(
          eq(members.organizationId, league.id),
          eq(members.userId, invitee.id),
        ),
      );
    expect(membership).toEqual({ role: "member" });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => {
      const claims = await tx
        .select({
          fantasyMemberId: leagueMemberIdentityClaims.fantasyMemberId,
          providerMemberId: leagueMemberIdentityClaims.providerMemberId,
          providerTeamIds: leagueMemberIdentityClaims.providerTeamIds,
          sourceInviteId: leagueMemberIdentityClaims.sourceInviteId,
          userId: leagueMemberIdentityClaims.userId,
        })
        .from(leagueMemberIdentityClaims)
        .where(eq(leagueMemberIdentityClaims.leagueId, league.id));
      const invites = await tx
        .select({
          acceptedAt: leagueInvites.acceptedAt,
          acceptedUserId: leagueInvites.acceptedUserId,
          status: leagueInvites.status,
        })
        .from(leagueInvites)
        .where(eq(leagueInvites.token, shared.value.token));
      return { claims, invites };
    });
    expect(rows.claims).toEqual([
      expect.objectContaining({
        fantasyMemberId: imported.invited.id,
        providerMemberId: imported.invited.providerMemberId,
        providerTeamIds: [`${marker}-team-two`],
        userId: invitee.id,
      }),
    ]);
    expect(rows.claims[0]?.sourceInviteId).toBeTruthy();
    expect(rows.invites).toEqual([
      expect.objectContaining({
        acceptedAt: new Date("2026-06-12T12:05:00.000Z"),
        acceptedUserId: invitee.id,
        status: "accepted",
      }),
    ]);

    const acceptedAgain = await acceptLeagueInvite(
      { db: handle.db, now: () => new Date("2026-06-12T12:10:00.000Z") },
      {
        leagueId: league.id,
        token: shared.value.token,
        userId: invitee.id,
      },
    );
    expect(acceptedAgain.ok).toBe(true);
    if (!acceptedAgain.ok) throw acceptedAgain.error;

    const afterClaim = await listLeaguemateInviteTargets(deps, {
      leagueId: league.id,
      userId: inviter.id,
    });
    expect(afterClaim.ok).toBe(true);
    if (!afterClaim.ok) throw afterClaim.error;
    expect(
      afterClaim.value.targets.some(
        (target) =>
          target.providerMemberId === imported.invited.providerMemberId,
      ),
    ).toBe(false);
  });

  it("rejects an accepted invite claimed by another user", async () => {
    const league = await seedLeague();
    const inviter = await seedUser("claimed-inviter");
    const invitee = await seedUser("claimed-invitee");
    const otherInvitee = await seedUser("claimed-other");
    const imported = await seedImportedMembers({
      leagueId: league.id,
      leagueProviderId: league.providerLeagueId,
    });
    await handle.db.insert(members).values({
      organizationId: league.id,
      role: "commissioner",
      userId: inviter.id,
    });
    await handle.db.insert(providerCredentials).values({
      connectionFlow: "manual",
      encryptedPayload: `${marker}-encrypted-claimed`,
      lastValidatedAt: new Date("2026-06-12T00:00:00.000Z"),
      provider: "espn",
      subjectProviderId: imported.self.providerMemberId,
      userId: inviter.id,
    });

    const deps = {
      db: handle.db,
      notifier: new RecordingInviteNotifier(),
      now: () => new Date("2026-06-12T12:00:00.000Z"),
    };
    const shared = await createLeaguemateInvite(deps, {
      appBaseUrl: "https://rumbledore.example",
      channel: "share",
      leagueId: league.id,
      providerMemberId: imported.invited.providerMemberId,
      userId: inviter.id,
    });
    expect(shared.ok).toBe(true);
    if (!shared.ok) throw shared.error;

    const accepted = await acceptLeagueInvite(
      { db: handle.db, now: () => new Date("2026-06-12T12:05:00.000Z") },
      {
        leagueId: league.id,
        token: shared.value.token,
        userId: invitee.id,
      },
    );
    expect(accepted.ok).toBe(true);

    const rejected = await acceptLeagueInvite(
      { db: handle.db, now: () => new Date("2026-06-12T12:06:00.000Z") },
      {
        leagueId: league.id,
        token: shared.value.token,
        userId: otherInvitee.id,
      },
    );
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error("expected claimed invite to fail");
    expect(rejected.error).toMatchObject({
      code: "LEAGUE_INVITE_ALREADY_ACCEPTED",
      status: 409,
    });
  });

  it("rejects invite listing for a non-member before scoped reads", async () => {
    const league = await seedLeague();
    const user = await seedUser("forbidden");

    const listed = await listLeaguemateInviteTargets(
      { db: handle.db, notifier: new RecordingInviteNotifier() },
      {
        leagueId: league.id,
        userId: user.id,
      },
    );

    expect(listed.ok).toBe(false);
    if (listed.ok) throw new Error("expected non-member invite list to fail");
    expect(listed.error).toMatchObject({
      code: "LEAGUE_FORBIDDEN",
      status: 403,
    });
  });
});
