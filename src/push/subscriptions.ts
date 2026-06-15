import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { requireLeagueRoleForUser } from "@/auth/guards";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { pushSubscriptions } from "@/db/schema";
import type { BrowserPushSubscriptionInput } from "./interfaces";

export interface PushSubscriptionMutationDeps {
  db: Db;
  now?: () => Date;
}

export interface UpsertPushSubscriptionInput {
  leagueId: string;
  subscription: BrowserPushSubscriptionInput;
  userAgent: string | null;
  userId: string;
}

export interface DisablePushSubscriptionInput {
  endpoint: string;
  leagueId: string;
  userId: string;
}

export interface GetPushSubscriptionStatusInput {
  endpoint: string;
  leagueId: string;
  userId: string;
}

export interface PushSubscriptionMutationResult {
  id: string | null;
  status: "active" | "disabled";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pushEndpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function mutationNow(deps: PushSubscriptionMutationDeps): Date {
  return deps.now?.() ?? new Date();
}

function validateLeagueId(leagueId: string): Result<void, AppError> {
  if (UUID_RE.test(leagueId)) {
    return ok(undefined);
  }
  return err(
    new AppError({
      code: "INVALID_LEAGUE_ID",
      message: "Push subscription leagueId must be a UUID",
      status: 400,
    }),
  );
}

function expirationDate(value: number | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  return new Date(value);
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
      code: "PUSH_LEAGUE_FORBIDDEN",
      message: "Push notifications for a league require membership",
      status: 403,
    }),
  );
}

export async function upsertPushSubscription(
  deps: PushSubscriptionMutationDeps,
  input: UpsertPushSubscriptionInput,
): Promise<Result<PushSubscriptionMutationResult, AppError>> {
  const validLeagueId = validateLeagueId(input.leagueId);
  if (!validLeagueId.ok) {
    return validLeagueId;
  }

  const membership = await requireLeagueMembership(deps.db, input);
  if (!membership.ok) {
    return membership;
  }

  const timestamp = mutationNow(deps);
  const endpointHash = pushEndpointHash(input.subscription.endpoint);
  const expirationTime = expirationDate(input.subscription.expirationTime);

  const row = await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [saved] = await tx
      .insert(pushSubscriptions)
      .values({
        authSecret: input.subscription.keys.auth,
        disabledAt: null,
        endpoint: input.subscription.endpoint,
        endpointHash,
        expirationTime,
        lastSeenAt: timestamp,
        leagueId: input.leagueId,
        p256dh: input.subscription.keys.p256dh,
        status: "active",
        updatedAt: timestamp,
        userAgent: input.userAgent,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        target: [
          pushSubscriptions.leagueId,
          pushSubscriptions.userId,
          pushSubscriptions.endpointHash,
        ],
        set: {
          authSecret: input.subscription.keys.auth,
          disabledAt: null,
          endpoint: input.subscription.endpoint,
          expirationTime,
          lastSeenAt: timestamp,
          p256dh: input.subscription.keys.p256dh,
          status: "active",
          updatedAt: timestamp,
          userAgent: input.userAgent,
        },
      })
      .returning({
        id: pushSubscriptions.id,
        status: pushSubscriptions.status,
      });
    return saved;
  });

  return ok({ id: row?.id ?? null, status: row?.status ?? "active" });
}

export async function disablePushSubscription(
  deps: PushSubscriptionMutationDeps,
  input: DisablePushSubscriptionInput,
): Promise<Result<PushSubscriptionMutationResult, AppError>> {
  const validLeagueId = validateLeagueId(input.leagueId);
  if (!validLeagueId.ok) {
    return validLeagueId;
  }

  const membership = await requireLeagueMembership(deps.db, input);
  if (!membership.ok) {
    return membership;
  }

  const timestamp = mutationNow(deps);
  const endpointHash = pushEndpointHash(input.endpoint);
  const row = await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [updated] = await tx
      .update(pushSubscriptions)
      .set({
        disabledAt: timestamp,
        status: "disabled",
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(pushSubscriptions.leagueId, input.leagueId),
          eq(pushSubscriptions.userId, input.userId),
          eq(pushSubscriptions.endpointHash, endpointHash),
        ),
      )
      .returning({
        id: pushSubscriptions.id,
        status: pushSubscriptions.status,
      });
    return updated;
  });

  return ok({ id: row?.id ?? null, status: "disabled" });
}

export async function getPushSubscriptionStatus(
  deps: Pick<PushSubscriptionMutationDeps, "db">,
  input: GetPushSubscriptionStatusInput,
): Promise<Result<PushSubscriptionMutationResult, AppError>> {
  const validLeagueId = validateLeagueId(input.leagueId);
  if (!validLeagueId.ok) {
    return validLeagueId;
  }

  const membership = await requireLeagueMembership(deps.db, input);
  if (!membership.ok) {
    return membership;
  }

  const endpointHash = pushEndpointHash(input.endpoint);
  const row = await withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [saved] = await tx
      .select({
        disabledAt: pushSubscriptions.disabledAt,
        id: pushSubscriptions.id,
        status: pushSubscriptions.status,
      })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.leagueId, input.leagueId),
          eq(pushSubscriptions.userId, input.userId),
          eq(pushSubscriptions.endpointHash, endpointHash),
        ),
      );
    return saved;
  });

  if (!row || row.status !== "active" || row.disabledAt !== null) {
    return ok({ id: row?.id ?? null, status: "disabled" });
  }

  return ok({ id: row.id, status: "active" });
}
