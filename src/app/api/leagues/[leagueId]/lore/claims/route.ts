import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import type { Db } from "@/db/client";
import { members } from "@/db/schema";
import {
  type LoreSubjectInput,
  type LoreVerificationAssertion,
  submitLoreClaim,
} from "@/lore";
import { getLoreClaimVerificationSummary } from "@/lore/member-experience";
import type { LoreClaimSubmitResponse } from "@/lore/member-ui";
import { SEASON_LORE_METRICS, WEEKLY_LORE_METRICS } from "@/lore/member-ui";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LORE_CLAIM_BODY_BYTES = 16_384;

const verificationValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string().trim().min(1).max(240),
]);

const loreSubjectSchema = z.object({
  allTimeRecordId: z.uuid().nullable().optional(),
  headToHeadRecordId: z.uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  personAId: z.uuid().nullable().optional(),
  personBId: z.uuid().nullable().optional(),
  personId: z.uuid().nullable().optional(),
  recordType: z.string().trim().min(1).max(120).nullable().optional(),
  season: z.number().int().min(1900).max(3000).nullable().optional(),
  subjectType: z.enum(["person", "rivalry", "season", "week", "record"]),
  week: z.number().int().min(1).max(40).nullable().optional(),
});

const weeklyAssertionSchema = z.object({
  assertedValue: verificationValueSchema,
  metric: z.enum(WEEKLY_LORE_METRICS),
  personId: z.uuid(),
  scoringPeriod: z.number().int().min(1).max(40),
  season: z.number().int().min(1900).max(3000),
  source: z.literal("weekly_statistics"),
});

const seasonAssertionSchema = z.object({
  assertedValue: verificationValueSchema,
  metric: z.enum(SEASON_LORE_METRICS),
  personId: z.uuid(),
  season: z.number().int().min(1900).max(3000),
  source: z.literal("season_statistics"),
});

const allTimeRecordAssertionSchema = z.object({
  assertedValue: verificationValueSchema,
  holderPersonId: z.uuid().optional(),
  recordType: z.string().trim().min(1).max(120),
  scoringPeriod: z.number().int().min(1).max(40).optional(),
  season: z.number().int().min(1900).max(3000).optional(),
  source: z.literal("all_time_record"),
});

const loreAssertionSchema = z.discriminatedUnion("source", [
  weeklyAssertionSchema,
  seasonAssertionSchema,
  allTimeRecordAssertionSchema,
]);

const submitLoreClaimSchema = z.object({
  assertions: z.array(loreAssertionSchema).max(3).optional(),
  body: z.string().trim().min(1).max(4000),
  branchOf: z.uuid().optional(),
  relation: z
    .enum(["root", "response", "addendum", "dispute", "relitigation"])
    .optional(),
  subjects: z.array(loreSubjectSchema).max(8).optional(),
  title: z.string().trim().min(1).max(160),
});

interface LoreClaimsRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function getMemberIdForUser(
  db: Db,
  input: { leagueId: string; userId: string },
): Promise<string> {
  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, input.leagueId),
        eq(members.userId, input.userId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new AppError({
      code: "LORE_MEMBER_NOT_FOUND",
      message: "Lore claims require league membership",
      status: 403,
    });
  }

  return membership.id;
}

function invalidLoreClaimRequestError(): AppError {
  return new AppError({
    code: "INVALID_LORE_CLAIM_REQUEST",
    message: "Lore claim request payload is invalid",
    status: 400,
  });
}

async function loreClaimsPost(
  request: Request,
  context: LoreClaimsRouteContext,
) {
  const { leagueId } = await context.params;
  const db = getDb();
  const access = await requireLeagueRole({
    db,
    headers: request.headers,
    leagueId,
    minRole: "member",
  });
  if (!access.ok) {
    return errorJson(access.error);
  }

  const body = await readJsonBody(request, MAX_LORE_CLAIM_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = submitLoreClaimSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(invalidLoreClaimRequestError());
  }

  try {
    const authorMemberId = await getMemberIdForUser(db, {
      leagueId,
      userId: access.value.userId,
    });
    const result = await submitLoreClaim({
      deps: { db },
      input: {
        ...(parsed.data.assertions
          ? {
              assertions: parsed.data.assertions as LoreVerificationAssertion[],
            }
          : {}),
        authorMemberId,
        body: parsed.data.body,
        ...(parsed.data.branchOf ? { branchOf: parsed.data.branchOf } : {}),
        leagueId,
        origin: "member",
        ...(parsed.data.relation ? { relation: parsed.data.relation } : {}),
        subjects: (parsed.data.subjects ?? []) as LoreSubjectInput[],
        title: parsed.data.title,
      },
    });
    const verificationResult = await getLoreClaimVerificationSummary(db, {
      claimId: result.claimId,
      leagueId,
    });
    const response: LoreClaimSubmitResponse =
      result.status === "vote"
        ? {
            ...result,
            verificationResult,
            voteClosesAt: result.voteClosesAt.toISOString(),
          }
        : {
            ...result,
            verificationResult,
          };

    return okJson(response, 201);
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "LORE_CLAIM_SUBMIT_FAILED",
        message: "Lore claim could not be submitted",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/lore/claims" },
  loreClaimsPost,
);
