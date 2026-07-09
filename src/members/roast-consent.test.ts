// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import type { AppError } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  editorialActions,
  fantasyMembers,
  fantasyTeams,
  leagueMemberIdentityClaims,
  leagues,
  members,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  getLeagueRoastConsentData,
  setLeagueRoastConsent,
} from "./roast-consent";

const marker = `roast-consent-${randomUUID()}`;

let handle: DbHandle;
let leagueId: string;
let commissionerUserId: string;
let commissionerMemberId: string;
let claimedUserId: string;
let unclaimedFantasyMemberId: string;
let claimedFantasyMemberId: string;

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await migrateSerialized(handle);

  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: `${marker} league`,
      provider: "espn",
      providerLeagueId: marker,
      season: 2026,
    })
    .returning({ id: leagues.id, providerLeagueId: leagues.providerLeagueId });
  if (!league) throw new Error("league insert failed");
  leagueId = league.id;

  const [commissioner, claimedUser] = await handle.db
    .insert(users)
    .values([
      {
        displayName: "Consent Commissioner",
        email: `${marker}-commissioner@example.test`,
      },
      {
        displayName: "Claimed Manager",
        email: `${marker}-claimed@example.test`,
      },
    ])
    .returning({ id: users.id });
  if (!commissioner || !claimedUser) throw new Error("user insert failed");
  commissionerUserId = commissioner.id;
  claimedUserId = claimedUser.id;

  const [commissionerMember] = await handle.db
    .insert(members)
    .values({
      organizationId: leagueId,
      role: "commissioner",
      userId: commissionerUserId,
    })
    .returning({ id: members.id });
  if (!commissionerMember) throw new Error("member insert failed");
  commissionerMemberId = commissionerMember.id;

  await withLeagueContext(handle.db, leagueId, async (tx) => {
    const [unclaimed, claimed] = await tx
      .insert(fantasyMembers)
      .values([
        {
          contentHash: `${marker}-unclaimed-member-hash`,
          displayName: "Unclaimed Manager",
          leagueId,
          leagueProviderId: league.providerLeagueId,
          provider: "espn",
          providerMemberId: `${marker}-unclaimed`,
          role: "member",
          season: 2026,
        },
        {
          contentHash: `${marker}-claimed-member-hash`,
          displayName: "Claimed Manager",
          leagueId,
          leagueProviderId: league.providerLeagueId,
          provider: "espn",
          providerMemberId: `${marker}-claimed`,
          role: "member",
          season: 2026,
        },
      ])
      .returning({
        id: fantasyMembers.id,
        providerMemberId: fantasyMembers.providerMemberId,
      });
    if (!unclaimed || !claimed) throw new Error("fantasy member insert failed");
    unclaimedFantasyMemberId = unclaimed.id;
    claimedFantasyMemberId = claimed.id;

    await tx.insert(fantasyTeams).values([
      {
        abbrev: "UNC",
        contentHash: `${marker}-unclaimed-team-hash`,
        leagueId,
        leagueProviderId: league.providerLeagueId,
        name: "Unclaimed Team",
        ownerMemberIds: [unclaimed.providerMemberId],
        provider: "espn",
        providerTeamId: `${marker}-unclaimed-team`,
        season: 2026,
      },
      {
        abbrev: "CLM",
        contentHash: `${marker}-claimed-team-hash`,
        leagueId,
        leagueProviderId: league.providerLeagueId,
        name: "Claimed Team",
        ownerMemberIds: [claimed.providerMemberId],
        provider: "espn",
        providerTeamId: `${marker}-claimed-team`,
        season: 2026,
      },
    ]);

    await tx.insert(leagueMemberIdentityClaims).values({
      fantasyMemberId: claimed.id,
      leagueId,
      provider: "espn",
      providerMemberId: claimed.providerMemberId,
      providerTeamIds: [`${marker}-claimed-team`],
      userId: claimedUserId,
    });
  });
});

afterAll(async () => {
  await handle?.pool.end();
});

describe("league roast consent", () => {
  it("loads self consent and only unclaimed imported members", async () => {
    const data = await getLeagueRoastConsentData(handle.db, {
      leagueId,
      userId: commissionerUserId,
      userRole: "commissioner",
    });

    expect(data.canManageUnclaimed).toBe(true);
    expect(data.self.roastLevel).toBe("light");
    expect(data.unclaimedTargets).toEqual([
      expect.objectContaining({
        displayName: "Unclaimed Manager",
        fantasyMemberId: unclaimedFantasyMemberId,
        roastLevel: "light",
        teamNames: ["Unclaimed Team"],
      }),
    ]);
  });

  it("lets a member update their own consent and records an editorial action", async () => {
    const result = await setLeagueRoastConsent(
      { db: handle.db, now: () => new Date("2026-07-09T12:00:00.000Z") },
      {
        actorRole: "commissioner",
        actorUserId: commissionerUserId,
        leagueId,
        roastLevel: "off_limits",
        target: { kind: "self" },
      },
    );

    expect(result).toEqual({
      roastLevel: "off_limits",
      status: "changed",
      target: { kind: "self" },
    });

    const [member] = await handle.db
      .select({ roastLevel: members.roastLevel })
      .from(members)
      .where(eq(members.id, commissionerMemberId));
    expect(member?.roastLevel).toBe("off_limits");

    const [action] = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(editorialActions)
        .where(
          and(
            eq(editorialActions.action, "roast_consent"),
            eq(editorialActions.targetMemberId, commissionerMemberId),
          ),
        )
        .limit(1),
    );
    expect(action?.metadata).toMatchObject({
      after: { roastLevel: "off_limits" },
      before: { roastLevel: "light" },
      target: { kind: "self" },
    });
  });

  it("lets commissioners update unclaimed imported members", async () => {
    const result = await setLeagueRoastConsent(
      { db: handle.db },
      {
        actorRole: "commissioner",
        actorUserId: commissionerUserId,
        leagueId,
        roastLevel: "full_send",
        target: {
          fantasyMemberId: unclaimedFantasyMemberId,
          kind: "fantasy_member",
        },
      },
    );

    expect(result.status).toBe("changed");

    const [target] = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select({ roastLevel: fantasyMembers.roastLevel })
        .from(fantasyMembers)
        .where(eq(fantasyMembers.id, unclaimedFantasyMemberId)),
    );
    expect(target?.roastLevel).toBe("full_send");

    const [action] = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(editorialActions)
        .where(
          and(
            eq(editorialActions.action, "roast_consent"),
            eq(
              editorialActions.targetFantasyMemberId,
              unclaimedFantasyMemberId,
            ),
          ),
        )
        .limit(1),
    );
    expect(action?.metadata).toMatchObject({
      after: { roastLevel: "full_send" },
      before: { roastLevel: "light" },
      target: {
        displayName: "Unclaimed Manager",
        fantasyMemberId: unclaimedFantasyMemberId,
        kind: "fantasy_member",
      },
    });
  });

  it("rejects commissioner overrides for claimed imported members", async () => {
    await expect(
      setLeagueRoastConsent(
        { db: handle.db },
        {
          actorRole: "commissioner",
          actorUserId: commissionerUserId,
          leagueId,
          roastLevel: "off_limits",
          target: {
            fantasyMemberId: claimedFantasyMemberId,
            kind: "fantasy_member",
          },
        },
      ),
    ).rejects.toMatchObject({
      code: "ROAST_CONSENT_TARGET_CLAIMED",
      status: 409,
    } satisfies Partial<AppError>);
  });
});
