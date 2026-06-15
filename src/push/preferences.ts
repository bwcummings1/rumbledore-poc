import { and, eq } from "drizzle-orm";
import { requireLeagueRoleForUser } from "@/auth/guards";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { pushNotificationPreferences } from "@/db/schema";
import { PUSH_EVENT_VALUES, type PushEventType } from "./interfaces";

export interface PushPreferenceMutationDeps {
  db: Db;
  now?: () => Date;
}

export interface SetPushNotificationPreferenceInput {
  enabled: boolean;
  leagueId: string;
  type: PushEventType;
  userId: string;
}

export interface PushNotificationPreferenceResult {
  enabled: boolean;
  id: string | null;
  leagueId: string;
  type: PushEventType;
  userId: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUSH_EVENT_SET = new Set<string>(PUSH_EVENT_VALUES);

function mutationNow(deps: PushPreferenceMutationDeps): Date {
  return deps.now?.() ?? new Date();
}

function validateLeagueId(leagueId: string): Result<void, AppError> {
  if (UUID_RE.test(leagueId)) {
    return ok(undefined);
  }
  return err(
    new AppError({
      code: "INVALID_PUSH_PREFERENCE_LEAGUE_ID",
      message: "Push notification preference leagueId must be a UUID",
      status: 400,
    }),
  );
}

function validateType(type: PushEventType): Result<void, AppError> {
  if (PUSH_EVENT_SET.has(type)) {
    return ok(undefined);
  }
  return err(
    new AppError({
      code: "INVALID_PUSH_PREFERENCE_TYPE",
      message: "Push notification preference type is invalid",
      status: 400,
    }),
  );
}

async function requireLeagueMembership(
  db: Db,
  input: { leagueId: string; userId: string },
): Promise<Result<void, AppError>> {
  const access = await requireLeagueRoleForUser(db, {
    leagueId: input.leagueId,
    minRole: "member",
    userId: input.userId,
  });
  if (access.ok) {
    return ok(undefined);
  }

  if (access.error.code !== "LEAGUE_FORBIDDEN") {
    return access;
  }

  return err(
    new AppError({
      code: "PUSH_PREFERENCE_LEAGUE_FORBIDDEN",
      message: "Push notification preferences for a league require membership",
      status: 403,
    }),
  );
}

export async function setPushNotificationPreference(
  deps: PushPreferenceMutationDeps,
  input: SetPushNotificationPreferenceInput,
): Promise<Result<PushNotificationPreferenceResult, AppError>> {
  const validLeagueId = validateLeagueId(input.leagueId);
  if (!validLeagueId.ok) {
    return validLeagueId;
  }

  const validType = validateType(input.type);
  if (!validType.ok) {
    return validType;
  }

  const membership = await requireLeagueMembership(deps.db, input);
  if (!membership.ok) {
    return membership;
  }

  const timestamp = mutationNow(deps);
  const row = await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [saved] = await tx
      .insert(pushNotificationPreferences)
      .values({
        enabled: input.enabled,
        leagueId: input.leagueId,
        type: input.type,
        updatedAt: timestamp,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        target: [
          pushNotificationPreferences.leagueId,
          pushNotificationPreferences.userId,
          pushNotificationPreferences.type,
        ],
        set: {
          enabled: input.enabled,
          updatedAt: timestamp,
        },
      })
      .returning({
        enabled: pushNotificationPreferences.enabled,
        id: pushNotificationPreferences.id,
        leagueId: pushNotificationPreferences.leagueId,
        type: pushNotificationPreferences.type,
        userId: pushNotificationPreferences.userId,
      });

    return saved;
  });

  return ok({
    enabled: row?.enabled ?? input.enabled,
    id: row?.id ?? null,
    leagueId: row?.leagueId ?? input.leagueId,
    type: row?.type ?? input.type,
    userId: row?.userId ?? input.userId,
  });
}

export async function isPushNotificationEnabled(
  db: Db,
  input: { leagueId: string; type: PushEventType; userId: string },
): Promise<boolean> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [row] = await tx
      .select({ enabled: pushNotificationPreferences.enabled })
      .from(pushNotificationPreferences)
      .where(
        and(
          eq(pushNotificationPreferences.leagueId, input.leagueId),
          eq(pushNotificationPreferences.userId, input.userId),
          eq(pushNotificationPreferences.type, input.type),
        ),
      )
      .limit(1);

    return row?.enabled ?? true;
  });
}
