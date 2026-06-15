import { and, asc, eq } from "drizzle-orm";
import { type LeagueRole, requireLeagueRoleForUser } from "@/auth/guards";
import { AppError, err, ok, type Result, toAppError } from "@/core/result";
import type { Db } from "@/db/client";
import { members, users } from "@/db/schema";
import { listDataStewardReview } from "@/stats";

export interface DataStewardCandidate {
  displayName: string;
  email: string;
  isDataSteward: boolean;
  memberId: string;
  role: LeagueRole;
  userId: string;
}

export interface DataStewardReviewDoorway {
  href: string;
  latestFailureAt: string | null;
  needsReview: boolean;
  suggestedIdentityLinks: number;
  unresolvedIntegrityChecks: number;
}

export interface DataStewardDoorwaySummary {
  canAssignStewards: boolean;
  canOpenReview: boolean;
  review: DataStewardReviewDoorway | null;
  stewardCandidates: DataStewardCandidate[];
}

export interface AssignDataStewardResult {
  steward: DataStewardCandidate;
}

function notFound(): AppError {
  return new AppError({
    code: "DATA_STEWARD_MEMBER_NOT_FOUND",
    message: "League member was not found",
    status: 404,
  });
}

function invalidTarget(): AppError {
  return new AppError({
    code: "DATA_STEWARD_TARGET_INVALID",
    message: "Only regular members can be designated as data stewards",
    status: 400,
  });
}

function canOpenReview(role: LeagueRole): boolean {
  switch (role) {
    case "data_steward":
    case "league_admin":
    case "commissioner":
      return true;
    case "member":
      return false;
  }
}

function canAssignStewards(role: LeagueRole): boolean {
  return role === "commissioner";
}

function canBeDesignated(role: LeagueRole): boolean {
  switch (role) {
    case "member":
    case "data_steward":
      return true;
    case "league_admin":
    case "commissioner":
      return false;
  }
}

async function authorizeMemberRole(
  db: Db,
  input: { leagueId: string; userId: string; userRole?: LeagueRole },
): Promise<Result<LeagueRole, AppError>> {
  if (input.userRole) {
    return ok(input.userRole);
  }

  const access = await requireLeagueRoleForUser(db, {
    leagueId: input.leagueId,
    userId: input.userId,
  });
  return access.ok ? ok(access.value.role) : access;
}

function reviewHref(
  leagueId: string,
  review: Pick<
    DataStewardReviewDoorway,
    "suggestedIdentityLinks" | "unresolvedIntegrityChecks"
  >,
): string {
  const base = `/leagues/${encodeURIComponent(leagueId)}/members/steward`;
  if (review.suggestedIdentityLinks > 0) {
    return `${base}#identity-review`;
  }
  if (review.unresolvedIntegrityChecks > 0) {
    return `${base}#integrity-review`;
  }
  return base;
}

async function listStewardCandidates(
  db: Db,
  leagueId: string,
): Promise<DataStewardCandidate[]> {
  const rows = await db
    .select({
      displayName: users.displayName,
      email: users.email,
      memberId: members.id,
      role: members.role,
      userId: users.id,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.organizationId, leagueId))
    .orderBy(asc(users.displayName), asc(users.email));

  return rows
    .filter((row) => canBeDesignated(row.role))
    .map((row) => ({
      displayName: row.displayName,
      email: row.email,
      isDataSteward: row.role === "data_steward",
      memberId: row.memberId,
      role: row.role,
      userId: row.userId,
    }));
}

export async function listDataStewardDoorway(
  db: Db,
  input: {
    leagueId: string;
    userId: string;
    userRole?: LeagueRole;
  },
): Promise<Result<DataStewardDoorwaySummary, AppError>> {
  try {
    const role = await authorizeMemberRole(db, input);
    if (!role.ok) {
      return role;
    }

    const canReview = canOpenReview(role.value);
    const canAssign = canAssignStewards(role.value);
    let review: DataStewardReviewDoorway | null = null;

    if (canReview) {
      const reviewResult = await listDataStewardReview(db, {
        leagueId: input.leagueId,
      });
      if (!reviewResult.ok) {
        return err(reviewResult.error);
      }

      const unresolvedIntegrityChecks =
        reviewResult.value.integrityChecks.filter(
          (check) => check.status === "fail",
        );
      const suggestedIdentityLinks =
        reviewResult.value.suggestedIdentityLinks.length;
      const counts = {
        suggestedIdentityLinks,
        unresolvedIntegrityChecks: unresolvedIntegrityChecks.length,
      };

      review = {
        ...counts,
        href: reviewHref(input.leagueId, counts),
        latestFailureAt: unresolvedIntegrityChecks[0]?.createdAt ?? null,
        needsReview:
          counts.unresolvedIntegrityChecks > 0 ||
          counts.suggestedIdentityLinks > 0,
      };
    }

    return ok({
      canAssignStewards: canAssign,
      canOpenReview: canReview,
      review,
      stewardCandidates: canAssign
        ? await listStewardCandidates(db, input.leagueId)
        : [],
    });
  } catch (error) {
    return err(
      toAppError(error, {
        code: "DATA_STEWARD_DOORWAY_LOAD_FAILED",
        message: "Data steward doorway could not be loaded",
      }),
    );
  }
}

export async function assignDataSteward(
  db: Db,
  input: {
    actorUserId: string;
    leagueId: string;
    targetMemberId: string;
  },
): Promise<Result<AssignDataStewardResult, AppError>> {
  const access = await requireLeagueRoleForUser(db, {
    leagueId: input.leagueId,
    minRole: "commissioner",
    userId: input.actorUserId,
  });
  if (!access.ok) {
    return err(access.error);
  }

  try {
    const [target] = await db
      .select({
        displayName: users.displayName,
        email: users.email,
        memberId: members.id,
        role: members.role,
        userId: users.id,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(
        and(
          eq(members.organizationId, input.leagueId),
          eq(members.id, input.targetMemberId),
        ),
      )
      .limit(1);

    if (!target) {
      return err(notFound());
    }
    if (!canBeDesignated(target.role)) {
      return err(invalidTarget());
    }

    if (target.role !== "data_steward") {
      await db
        .update(members)
        .set({ role: "data_steward", updatedAt: new Date() })
        .where(
          and(
            eq(members.organizationId, input.leagueId),
            eq(members.id, input.targetMemberId),
          ),
        );
    }

    return ok({
      steward: {
        displayName: target.displayName,
        email: target.email,
        isDataSteward: true,
        memberId: target.memberId,
        role: "data_steward",
        userId: target.userId,
      },
    });
  } catch (error) {
    return err(
      toAppError(error, {
        code: "DATA_STEWARD_ASSIGN_FAILED",
        message: "Data steward could not be assigned",
      }),
    );
  }
}
