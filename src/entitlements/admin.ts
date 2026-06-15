import { eq } from "drizzle-orm";
import { AppError, err, ok, type Result, toAppError } from "@/core/result";
import type { Db } from "@/db/client";
import {
  type EntitlementEvent,
  entitlementEvents,
  type LeagueEntitlement,
  leagueEntitlements,
  type NewLeagueEntitlement,
  type NewUserEntitlement,
  type UserEntitlement,
  userEntitlements,
} from "@/db/schema";

type EntitlementSource = LeagueEntitlement["source"];
type EntitlementStatus = LeagueEntitlement["status"];
type LeagueEntitlementTier = LeagueEntitlement["tier"];
type UserEntitlementTier = UserEntitlement["tier"];

export type AdminEntitlementGrantInput =
  | AdminLeagueEntitlementGrantInput
  | AdminUserEntitlementGrantInput;

export interface AdminLeagueEntitlementGrantInput {
  actorUserId: string;
  capsOverride?: Record<string, unknown> | null;
  expiresAt?: Date | null;
  leagueId: string;
  reason?: string | null;
  scope: "league";
  source?: EntitlementSource;
  status?: EntitlementStatus;
  tier: LeagueEntitlementTier;
}

export interface AdminUserEntitlementGrantInput {
  actorUserId: string;
  expiresAt?: Date | null;
  reason?: string | null;
  scope: "user";
  source?: EntitlementSource;
  status?: EntitlementStatus;
  tier?: UserEntitlementTier;
  userId: string;
}

export type AdminEntitlementGrantResult =
  | {
      entitlement: LeagueEntitlement;
      event: EntitlementEvent;
      scope: "league";
    }
  | {
      entitlement: UserEntitlement;
      event: EntitlementEvent;
      scope: "user";
    };

type EntitlementState = Record<string, unknown>;

function entitlementGrantFailed(cause: unknown): AppError {
  return toAppError(cause, {
    code: "ENTITLEMENT_GRANT_FAILED",
    message: "Entitlement grant could not be recorded",
  });
}

function dateState(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function leagueState(row: LeagueEntitlement | null): EntitlementState {
  return row
    ? {
        capsOverride: row.capsOverride,
        expiresAt: dateState(row.expiresAt),
        grantedBy: row.grantedBy,
        id: row.id,
        leagueId: row.leagueId,
        source: row.source,
        status: row.status,
        tier: row.tier,
      }
    : {
        capsOverride: null,
        expiresAt: null,
        grantedBy: null,
        leagueId: null,
        source: null,
        status: "active",
        tier: "free",
      };
}

function userState(row: UserEntitlement | null): EntitlementState {
  return row
    ? {
        expiresAt: dateState(row.expiresAt),
        grantedBy: row.grantedBy,
        id: row.id,
        source: row.source,
        status: row.status,
        tier: row.tier,
        userId: row.userId,
      }
    : {
        expiresAt: null,
        grantedBy: null,
        source: null,
        status: "active",
        tier: "none",
        userId: null,
      };
}

async function grantLeagueEntitlement(
  db: Db,
  input: AdminLeagueEntitlementGrantInput,
): Promise<AdminEntitlementGrantResult> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(leagueEntitlements)
      .where(eq(leagueEntitlements.leagueId, input.leagueId))
      .limit(1);

    const values = {
      capsOverride: input.capsOverride ?? null,
      expiresAt: input.expiresAt ?? null,
      grantedBy: input.actorUserId,
      leagueId: input.leagueId,
      source: input.source ?? "granted",
      status: input.status ?? "active",
      tier: input.tier,
      updatedAt: new Date(),
    } satisfies NewLeagueEntitlement;

    const [entitlement] = await tx
      .insert(leagueEntitlements)
      .values(values)
      .onConflictDoUpdate({
        set: values,
        target: leagueEntitlements.leagueId,
      })
      .returning();
    if (!entitlement) {
      throw new AppError({
        code: "ENTITLEMENT_GRANT_EMPTY",
        message: "Entitlement grant did not return a row",
      });
    }

    const [event] = await tx
      .insert(entitlementEvents)
      .values({
        action: "grant",
        afterState: leagueState(entitlement),
        actorUserId: input.actorUserId,
        beforeState: leagueState(before ?? null),
        leagueEntitlementId: entitlement.id,
        leagueId: input.leagueId,
        reason: input.reason ?? null,
        source: values.source,
      })
      .returning();
    if (!event) {
      throw new AppError({
        code: "ENTITLEMENT_EVENT_EMPTY",
        message: "Entitlement grant audit did not return a row",
      });
    }

    return { entitlement, event, scope: "league" };
  });
}

async function grantUserEntitlement(
  db: Db,
  input: AdminUserEntitlementGrantInput,
): Promise<AdminEntitlementGrantResult> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(userEntitlements)
      .where(eq(userEntitlements.userId, input.userId))
      .limit(1);

    const values = {
      expiresAt: input.expiresAt ?? null,
      grantedBy: input.actorUserId,
      source: input.source ?? "granted",
      status: input.status ?? "active",
      tier: input.tier ?? "individual",
      updatedAt: new Date(),
      userId: input.userId,
    } satisfies NewUserEntitlement;

    const [entitlement] = await tx
      .insert(userEntitlements)
      .values(values)
      .onConflictDoUpdate({
        set: values,
        target: userEntitlements.userId,
      })
      .returning();
    if (!entitlement) {
      throw new AppError({
        code: "ENTITLEMENT_GRANT_EMPTY",
        message: "Entitlement grant did not return a row",
      });
    }

    const [event] = await tx
      .insert(entitlementEvents)
      .values({
        action: "grant",
        afterState: userState(entitlement),
        actorUserId: input.actorUserId,
        beforeState: userState(before ?? null),
        reason: input.reason ?? null,
        source: values.source,
        userEntitlementId: entitlement.id,
        userId: input.userId,
      })
      .returning();
    if (!event) {
      throw new AppError({
        code: "ENTITLEMENT_EVENT_EMPTY",
        message: "Entitlement grant audit did not return a row",
      });
    }

    return { entitlement, event, scope: "user" };
  });
}

export async function grantEntitlementAsAdmin(
  db: Db,
  input: AdminEntitlementGrantInput,
): Promise<Result<AdminEntitlementGrantResult, AppError>> {
  try {
    const result =
      input.scope === "league"
        ? await grantLeagueEntitlement(db, input)
        : await grantUserEntitlement(db, input);
    return ok(result);
  } catch (error) {
    return err(entitlementGrantFailed(error));
  }
}
