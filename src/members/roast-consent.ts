import { and, asc, eq } from "drizzle-orm";
import type { LeagueRole } from "@/auth/guards";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
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
import type {
  LeagueRoastConsentData,
  LeagueRoastConsentMutationResult,
  LeagueRoastConsentMutationTarget,
  LeagueRoastConsentUnclaimedTarget,
  RoastLevel,
} from "./roast-consent-types";

interface FantasyMemberConsentRow {
  displayName: string;
  fantasyMemberId: string;
  providerMemberId: string;
  roastLevel: RoastLevel;
}

interface FantasyTeamOwnerRow {
  name: string;
  ownerMemberIds: string[];
}

export interface SetLeagueRoastConsentInput {
  actorRole: LeagueRole;
  actorUserId: string;
  leagueId: string;
  roastLevel: RoastLevel;
  target: LeagueRoastConsentMutationTarget;
}

function teamNamesByOwner(rows: readonly FantasyTeamOwnerRow[]) {
  const byOwner = new Map<string, string[]>();
  for (const team of rows) {
    for (const ownerMemberId of team.ownerMemberIds) {
      const existing = byOwner.get(ownerMemberId) ?? [];
      existing.push(team.name);
      byOwner.set(ownerMemberId, existing);
    }
  }
  return byOwner;
}

function unclaimedTargetFromRow(
  row: FantasyMemberConsentRow,
  teamsByOwner: ReadonlyMap<string, readonly string[]>,
): LeagueRoastConsentUnclaimedTarget {
  return {
    displayName: row.displayName,
    fantasyMemberId: row.fantasyMemberId,
    providerMemberId: row.providerMemberId,
    roastLevel: row.roastLevel,
    teamNames: [...(teamsByOwner.get(row.providerMemberId) ?? [])].sort(),
  };
}

function roastConsentMetadata(input: {
  after: RoastLevel;
  before: RoastLevel;
  target: LeagueRoastConsentMutationTarget & {
    displayName?: string;
    providerMemberId?: string;
  };
}) {
  return {
    after: { roastLevel: input.after },
    before: { roastLevel: input.before },
    target: input.target,
  };
}

export async function getLeagueRoastConsentData(
  db: Db,
  input: { leagueId: string; userId: string; userRole: LeagueRole },
): Promise<LeagueRoastConsentData> {
  const [self] = await db
    .select({
      displayName: users.displayName,
      memberId: members.id,
      roastLevel: members.roastLevel,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(
      and(
        eq(members.organizationId, input.leagueId),
        eq(members.userId, input.userId),
      ),
    )
    .limit(1);

  if (!self) {
    throw new AppError({
      code: "ROAST_CONSENT_MEMBER_NOT_FOUND",
      message: "Roast consent settings require league membership",
      status: 403,
    });
  }

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [league] = await tx
      .select({
        provider: leagues.provider,
        season: leagues.season,
      })
      .from(leagues)
      .where(eq(leagues.id, input.leagueId))
      .limit(1);

    if (!league) {
      return null;
    }

    const memberRows = await tx
      .select({
        displayName: fantasyMembers.displayName,
        fantasyMemberId: fantasyMembers.id,
        providerMemberId: fantasyMembers.providerMemberId,
        roastLevel: fantasyMembers.roastLevel,
      })
      .from(fantasyMembers)
      .where(
        and(
          eq(fantasyMembers.leagueId, input.leagueId),
          eq(fantasyMembers.provider, league.provider),
          eq(fantasyMembers.season, league.season),
        ),
      )
      .orderBy(asc(fantasyMembers.displayName));

    const claimedRows = await tx
      .select({ providerMemberId: leagueMemberIdentityClaims.providerMemberId })
      .from(leagueMemberIdentityClaims)
      .where(
        and(
          eq(leagueMemberIdentityClaims.leagueId, input.leagueId),
          eq(leagueMemberIdentityClaims.provider, league.provider),
        ),
      );

    const teamRows = await tx
      .select({
        name: fantasyTeams.name,
        ownerMemberIds: fantasyTeams.ownerMemberIds,
      })
      .from(fantasyTeams)
      .where(
        and(
          eq(fantasyTeams.leagueId, input.leagueId),
          eq(fantasyTeams.provider, league.provider),
          eq(fantasyTeams.season, league.season),
        ),
      );

    return {
      claimedProviderMemberIds: new Set(
        claimedRows.map((row) => row.providerMemberId),
      ),
      memberRows: memberRows satisfies FantasyMemberConsentRow[],
      teamsByOwner: teamNamesByOwner(teamRows),
    };
  });

  if (!scoped) {
    throw new AppError({
      code: "ROAST_CONSENT_LEAGUE_NOT_FOUND",
      message: "League could not be found for roast consent settings",
      status: 404,
    });
  }

  return {
    apiUrl: `/api/leagues/${input.leagueId}/roast-consent`,
    canManageUnclaimed: input.userRole === "commissioner",
    self: {
      displayName: self.displayName,
      memberId: self.memberId,
      roastLevel: self.roastLevel,
    },
    unclaimedTargets: scoped.memberRows
      .filter(
        (row) => !scoped.claimedProviderMemberIds.has(row.providerMemberId),
      )
      .map((row) => unclaimedTargetFromRow(row, scoped.teamsByOwner)),
  };
}

export async function setLeagueRoastConsent(
  deps: { db: Db; now?: () => Date },
  input: SetLeagueRoastConsentInput,
): Promise<LeagueRoastConsentMutationResult> {
  const now = deps.now?.() ?? new Date();
  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    if (input.target.kind === "self") {
      const [membership] = await tx
        .select({
          id: members.id,
          roastLevel: members.roastLevel,
        })
        .from(members)
        .where(
          and(
            eq(members.organizationId, input.leagueId),
            eq(members.userId, input.actorUserId),
          ),
        )
        .limit(1);

      if (!membership) {
        throw new AppError({
          code: "ROAST_CONSENT_MEMBER_NOT_FOUND",
          message: "Roast consent updates require league membership",
          status: 403,
        });
      }

      if (membership.roastLevel === input.roastLevel) {
        return {
          roastLevel: input.roastLevel,
          status: "already_current",
          target: input.target,
        };
      }

      await tx
        .update(members)
        .set({ roastLevel: input.roastLevel, updatedAt: now })
        .where(eq(members.id, membership.id));
      await tx.insert(editorialActions).values({
        action: "roast_consent",
        actorUserId: input.actorUserId,
        leagueId: input.leagueId,
        metadata: roastConsentMetadata({
          after: input.roastLevel,
          before: membership.roastLevel,
          target: input.target,
        }),
        reason: "Member roast consent updated",
        targetMemberId: membership.id,
      });

      return {
        roastLevel: input.roastLevel,
        status: "changed",
        target: input.target,
      };
    }

    if (input.actorRole !== "commissioner") {
      throw new AppError({
        code: "ROAST_CONSENT_FORBIDDEN",
        message: "Only commissioners can edit unclaimed member roast consent",
        status: 403,
      });
    }

    const [target] = await tx
      .select({
        displayName: fantasyMembers.displayName,
        id: fantasyMembers.id,
        provider: fantasyMembers.provider,
        providerMemberId: fantasyMembers.providerMemberId,
        roastLevel: fantasyMembers.roastLevel,
      })
      .from(fantasyMembers)
      .where(
        and(
          eq(fantasyMembers.leagueId, input.leagueId),
          eq(fantasyMembers.id, input.target.fantasyMemberId),
        ),
      )
      .limit(1);

    if (!target) {
      throw new AppError({
        code: "ROAST_CONSENT_TARGET_NOT_FOUND",
        message: "Imported member could not be found",
        status: 404,
      });
    }

    const [claim] = await tx
      .select({ id: leagueMemberIdentityClaims.id })
      .from(leagueMemberIdentityClaims)
      .where(
        and(
          eq(leagueMemberIdentityClaims.leagueId, input.leagueId),
          eq(leagueMemberIdentityClaims.provider, target.provider),
          eq(
            leagueMemberIdentityClaims.providerMemberId,
            target.providerMemberId,
          ),
        ),
      )
      .limit(1);

    if (claim) {
      throw new AppError({
        code: "ROAST_CONSENT_TARGET_CLAIMED",
        message: "Claimed members edit their own roast consent",
        status: 409,
      });
    }

    if (target.roastLevel === input.roastLevel) {
      return {
        roastLevel: input.roastLevel,
        status: "already_current",
        target: input.target,
      };
    }

    await tx
      .update(fantasyMembers)
      .set({ roastLevel: input.roastLevel, updatedAt: now })
      .where(eq(fantasyMembers.id, target.id));
    await tx.insert(editorialActions).values({
      action: "roast_consent",
      actorUserId: input.actorUserId,
      leagueId: input.leagueId,
      metadata: roastConsentMetadata({
        after: input.roastLevel,
        before: target.roastLevel,
        target: {
          ...input.target,
          displayName: target.displayName,
          providerMemberId: target.providerMemberId,
        },
      }),
      reason: "Imported member roast consent updated",
      targetFantasyMemberId: target.id,
    });

    return {
      roastLevel: input.roastLevel,
      status: "changed",
      target: input.target,
    };
  });
}
