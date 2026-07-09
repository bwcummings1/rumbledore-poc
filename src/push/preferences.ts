import { and, eq } from "drizzle-orm";
import { requireLeagueRoleForUser } from "@/auth/guards";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { pushNotificationPreferences } from "@/db/schema";
import {
  defaultNotificationChannelForFamily,
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_EVENT_FAMILY_VALUES,
  NOTIFICATION_FAMILY_REPRESENTATIVE_EVENT,
  type NotificationChannel,
  type NotificationEventFamily,
  notificationFamilyForPushEvent,
  PUSH_EVENT_VALUES,
  type PushEventType,
} from "./interfaces";

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

export interface SetNotificationChannelPreferenceInput {
  channel: NotificationChannel;
  eventFamily: NotificationEventFamily;
  leagueId: string;
  userId: string;
}

export interface NotificationPreferenceResult {
  channel: NotificationChannel;
  enabled: boolean;
  eventFamily: NotificationEventFamily;
  id: string | null;
  leagueId: string;
  type: PushEventType;
  userId: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUSH_EVENT_SET = new Set<string>(PUSH_EVENT_VALUES);
const NOTIFICATION_EVENT_FAMILY_SET = new Set<string>(
  NOTIFICATION_EVENT_FAMILY_VALUES,
);
const NOTIFICATION_CHANNEL_SET = new Set<string>(NOTIFICATION_CHANNEL_VALUES);

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

function validateEventFamily(
  eventFamily: NotificationEventFamily,
): Result<void, AppError> {
  if (NOTIFICATION_EVENT_FAMILY_SET.has(eventFamily)) {
    return ok(undefined);
  }
  return err(
    new AppError({
      code: "INVALID_NOTIFICATION_EVENT_FAMILY",
      message: "Notification preference event family is invalid",
      status: 400,
    }),
  );
}

function validateChannel(channel: NotificationChannel): Result<void, AppError> {
  if (NOTIFICATION_CHANNEL_SET.has(channel)) {
    return ok(undefined);
  }
  return err(
    new AppError({
      code: "INVALID_NOTIFICATION_CHANNEL",
      message: "Notification preference channel is invalid",
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

export async function setNotificationChannelPreference(
  deps: PushPreferenceMutationDeps,
  input: SetNotificationChannelPreferenceInput,
): Promise<Result<NotificationPreferenceResult, AppError>> {
  const validLeagueId = validateLeagueId(input.leagueId);
  if (!validLeagueId.ok) {
    return validLeagueId;
  }

  const validEventFamily = validateEventFamily(input.eventFamily);
  if (!validEventFamily.ok) {
    return validEventFamily;
  }

  const validChannel = validateChannel(input.channel);
  if (!validChannel.ok) {
    return validChannel;
  }

  const membership = await requireLeagueMembership(deps.db, input);
  if (!membership.ok) {
    return membership;
  }

  const timestamp = mutationNow(deps);
  const representativeType =
    NOTIFICATION_FAMILY_REPRESENTATIVE_EVENT[input.eventFamily];
  const enabled = input.channel !== "none";
  const row = await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [saved] = await tx
      .insert(pushNotificationPreferences)
      .values({
        channel: input.channel,
        enabled,
        eventFamily: input.eventFamily,
        leagueId: input.leagueId,
        type: representativeType,
        updatedAt: timestamp,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        target: [
          pushNotificationPreferences.leagueId,
          pushNotificationPreferences.userId,
          pushNotificationPreferences.eventFamily,
        ],
        set: {
          channel: input.channel,
          enabled,
          type: representativeType,
          updatedAt: timestamp,
        },
      })
      .returning({
        channel: pushNotificationPreferences.channel,
        enabled: pushNotificationPreferences.enabled,
        eventFamily: pushNotificationPreferences.eventFamily,
        id: pushNotificationPreferences.id,
        leagueId: pushNotificationPreferences.leagueId,
        type: pushNotificationPreferences.type,
        userId: pushNotificationPreferences.userId,
      });

    return saved;
  });

  return ok({
    channel: row?.channel ?? input.channel,
    enabled: row?.enabled ?? enabled,
    eventFamily: row?.eventFamily ?? input.eventFamily,
    id: row?.id ?? null,
    leagueId: row?.leagueId ?? input.leagueId,
    type: (row?.type ?? representativeType) as PushEventType,
    userId: row?.userId ?? input.userId,
  });
}

export async function setPushNotificationPreference(
  deps: PushPreferenceMutationDeps,
  input: SetPushNotificationPreferenceInput,
): Promise<Result<NotificationPreferenceResult, AppError>> {
  const validType = validateType(input.type);
  if (!validType.ok) {
    return validType;
  }

  const result = await setNotificationChannelPreference(deps, {
    channel: input.enabled ? "push" : "none",
    eventFamily: notificationFamilyForPushEvent(input.type),
    leagueId: input.leagueId,
    userId: input.userId,
  });
  if (!result.ok) {
    return result;
  }

  return ok({
    ...result.value,
    type: input.type,
  });
}

export async function getNotificationChannelPreference(
  db: Db,
  input: {
    eventFamily: NotificationEventFamily;
    leagueId: string;
    userId: string;
  },
): Promise<NotificationChannel> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [row] = await tx
      .select({ channel: pushNotificationPreferences.channel })
      .from(pushNotificationPreferences)
      .where(
        and(
          eq(pushNotificationPreferences.leagueId, input.leagueId),
          eq(pushNotificationPreferences.userId, input.userId),
          eq(pushNotificationPreferences.eventFamily, input.eventFamily),
        ),
      )
      .limit(1);

    return (
      row?.channel ?? defaultNotificationChannelForFamily(input.eventFamily)
    );
  });
}

export async function isDigestNotificationEnabled(
  db: Db,
  input: {
    eventFamily: NotificationEventFamily;
    leagueId: string;
    userId: string;
  },
): Promise<boolean> {
  return (await getNotificationChannelPreference(db, input)) === "digest";
}

export async function isPushNotificationEnabled(
  db: Db,
  input: { leagueId: string; type: PushEventType; userId: string },
): Promise<boolean> {
  return (
    (await getNotificationChannelPreference(db, {
      eventFamily: notificationFamilyForPushEvent(input.type),
      leagueId: input.leagueId,
      userId: input.userId,
    })) === "push"
  );
}
