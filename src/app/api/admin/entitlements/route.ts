import { z } from "zod";
import { requirePlatformAdmin } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError } from "@/core/result";
import { getDb } from "@/db";
import { grantEntitlementAsAdmin } from "@/entitlements";
import { errorJson, readJsonBody, resultJson } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ENTITLEMENT_GRANT_BODY_BYTES = 4096;

const entitlementSourceSchema = z.enum(["granted", "comp", "dev", "purchased"]);
const entitlementStatusSchema = z.enum(["active", "expired", "suspended"]);
const capsOverrideSchema = z.record(z.string(), z.unknown()).nullable();

const grantBodySchema = z.discriminatedUnion("scope", [
  z.object({
    capsOverride: capsOverrideSchema.optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
    leagueId: z.uuid(),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
    scope: z.literal("league"),
    source: entitlementSourceSchema.default("granted"),
    status: entitlementStatusSchema.default("active"),
    tier: z.enum(["free", "premium"]),
  }),
  z.object({
    expiresAt: z.iso.datetime().nullable().optional(),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
    scope: z.literal("user"),
    source: entitlementSourceSchema.default("granted"),
    status: entitlementStatusSchema.default("active"),
    tier: z.literal("individual").default("individual"),
    userId: z.uuid(),
  }),
]);

async function adminEntitlementsPost(request: Request) {
  const db = getDb();
  const access = await requirePlatformAdmin({
    db,
    headers: request.headers,
  });
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_ENTITLEMENT_GRANT_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = grantBodySchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_ENTITLEMENT_GRANT",
        message: "Entitlement grant payload is invalid",
        status: 400,
      }),
    );
  }

  const expiresAt = parsed.data.expiresAt
    ? new Date(parsed.data.expiresAt)
    : null;
  const result =
    parsed.data.scope === "league"
      ? await grantEntitlementAsAdmin(db, {
          actorUserId: access.value.userId,
          capsOverride: parsed.data.capsOverride,
          expiresAt,
          leagueId: parsed.data.leagueId,
          reason: parsed.data.reason,
          scope: "league",
          source: parsed.data.source,
          status: parsed.data.status,
          tier: parsed.data.tier,
        })
      : await grantEntitlementAsAdmin(db, {
          actorUserId: access.value.userId,
          expiresAt,
          reason: parsed.data.reason,
          scope: "user",
          source: parsed.data.source,
          status: parsed.data.status,
          tier: parsed.data.tier,
          userId: parsed.data.userId,
        });

  return resultJson(result);
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/admin/entitlements" },
  adminEntitlementsPost,
);
