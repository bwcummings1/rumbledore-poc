import { and, asc, eq } from "drizzle-orm";
import { type LeagueRole, requireLeagueRoleForUser } from "@/auth/guards";
import { AppError, err, ok, type Result, toAppError } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { leagueDataEdits, members, users } from "@/db/schema";

export interface CommissionerMemberSummary {
  displayName: string;
  email: string;
  memberId: string;
  role: LeagueRole;
  userId: string;
}

export interface CommissionerHandoffResult {
  ledgerEntryId: string;
  newCommissioner: CommissionerMemberSummary;
  previousCommissioner: CommissionerMemberSummary;
}

function commissionerError({
  code,
  message,
  status,
}: {
  code: string;
  message: string;
  status: number;
}): AppError {
  return new AppError({ code, message, status });
}

function memberNotFoundError(): AppError {
  return commissionerError({
    code: "COMMISSIONER_HANDOFF_TARGET_NOT_FOUND",
    message: "Target league member was not found",
    status: 404,
  });
}

function invalidTargetError(message: string): AppError {
  return commissionerError({
    code: "COMMISSIONER_HANDOFF_TARGET_INVALID",
    message,
    status: 400,
  });
}

function toMemberSummary(row: {
  displayName: string;
  email: string;
  memberId: string;
  role: LeagueRole;
  userId: string;
}): CommissionerMemberSummary {
  return {
    displayName: row.displayName,
    email: row.email,
    memberId: row.memberId,
    role: row.role,
    userId: row.userId,
  };
}

export async function listCommissionerHandoffCandidates(
  db: Db,
  input: { leagueId: string },
): Promise<Result<CommissionerMemberSummary[], AppError>> {
  try {
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
      .where(eq(members.organizationId, input.leagueId))
      .orderBy(asc(users.displayName), asc(users.email));

    return ok(
      rows.filter((row) => row.role !== "commissioner").map(toMemberSummary),
    );
  } catch (error) {
    return err(
      toAppError(error, {
        code: "COMMISSIONER_HANDOFF_CANDIDATES_FAILED",
        message: "Commissioner handoff candidates could not be loaded",
      }),
    );
  }
}

export async function transferCommissionerRole(
  db: Db,
  input: {
    actorUserId: string;
    leagueId: string;
    reason?: string;
    targetMemberId: string;
  },
): Promise<Result<CommissionerHandoffResult, AppError>> {
  const access = await requireLeagueRoleForUser(db, {
    leagueId: input.leagueId,
    minRole: "commissioner",
    userId: input.actorUserId,
  });
  if (!access.ok) {
    return err(access.error);
  }

  try {
    const transferred = await withLeagueContext(
      db,
      input.leagueId,
      async (tx) => {
        const [actor] = await tx
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
              eq(members.userId, input.actorUserId),
            ),
          )
          .limit(1);

        if (!actor || actor.role !== "commissioner") {
          throw commissionerError({
            code: "COMMISSIONER_HANDOFF_FORBIDDEN",
            message: "Only the current commissioner can hand off the league",
            status: 403,
          });
        }

        const [target] = await tx
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
          throw memberNotFoundError();
        }
        if (target.memberId === actor.memberId) {
          throw invalidTargetError("Choose a different league member");
        }
        if (target.role === "commissioner") {
          throw invalidTargetError("Target member is already commissioner");
        }

        const now = new Date();
        await tx
          .update(members)
          .set({ role: "commissioner", updatedAt: now })
          .where(
            and(
              eq(members.organizationId, input.leagueId),
              eq(members.id, target.memberId),
            ),
          );
        await tx
          .update(members)
          .set({ role: "member", updatedAt: now })
          .where(
            and(
              eq(members.organizationId, input.leagueId),
              eq(members.id, actor.memberId),
            ),
          );

        const [edit] = await tx
          .insert(leagueDataEdits)
          .values({
            actorUserId: input.actorUserId,
            afterValue: {
              commissionerMemberId: target.memberId,
              commissionerUserId: target.userId,
              previousCommissionerRole: "member",
            },
            beforeValue: {
              commissionerMemberId: actor.memberId,
              commissionerUserId: actor.userId,
              targetMemberId: target.memberId,
              targetRole: target.role,
            },
            editClass: "substantive",
            field: "commissioner_handoff",
            leagueId: input.leagueId,
            reason: input.reason ?? "commissioner handed off league authority",
            targetId: target.memberId,
            targetKind: "member",
          })
          .returning({ id: leagueDataEdits.id });

        if (!edit) {
          throw new Error("commissioner handoff ledger entry was not written");
        }

        return {
          ledgerEntryId: edit.id,
          newCommissioner: toMemberSummary({
            ...target,
            role: "commissioner",
          }),
          previousCommissioner: toMemberSummary({
            ...actor,
            role: "member",
          }),
        };
      },
    );

    return ok(transferred);
  } catch (error) {
    return err(
      toAppError(error, {
        code: "COMMISSIONER_HANDOFF_FAILED",
        message: "Commissioner handoff could not be completed",
      }),
    );
  }
}
