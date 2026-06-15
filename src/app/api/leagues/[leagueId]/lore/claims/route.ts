import { z } from "zod";
import { getEnv } from "@/core/env";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { inngest } from "@/jobs/client";
import { JOB_EVENTS } from "@/jobs/events";
import {
  type LoreSubjectInput,
  type LoreVerificationAssertion,
  type SubmitLoreClaimResult,
  submitLoreClaim,
} from "@/lore";
import {
  getLoreClaimVerificationSummary,
  getLoreSectionData,
} from "@/lore/member-experience";
import type { LoreClaimSubmitResponse } from "@/lore/member-ui";
import { SEASON_LORE_METRICS, WEEKLY_LORE_METRICS } from "@/lore/member-ui";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";
import { createRealtimePublisher } from "@/realtime";
import { authorizeLoreMember, getMemberIdForUser } from "../lore-route-helpers";

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

function invalidLoreClaimRequestError(): AppError {
  return new AppError({
    code: "INVALID_LORE_CLAIM_REQUEST",
    message: "Lore claim request payload is invalid",
    status: 400,
  });
}

async function scheduleLoreVoteClose(
  leagueId: string,
  result: SubmitLoreClaimResult,
) {
  if (result.status !== "vote" || getEnv().jobs.inngest.mode === "mock") {
    return;
  }

  await inngest.send({
    data: {
      claimId: result.claimId,
      leagueId,
    },
    id: `${JOB_EVENTS.loreVoteClose}:${leagueId}:${result.claimId}`,
    name: JOB_EVENTS.loreVoteClose,
    ts: result.voteClosesAt.getTime(),
  });
}

async function loreClaimsPost(
  request: Request,
  context: LoreClaimsRouteContext,
) {
  const { leagueId } = await context.params;
  const { access, db } = await authorizeLoreMember(request, leagueId);
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
      deps: { db, realtime: createRealtimePublisher(getEnv()) },
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
    await scheduleLoreVoteClose(leagueId, result);
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

async function loreClaimsGet(
  request: Request,
  context: LoreClaimsRouteContext,
) {
  const { leagueId } = await context.params;
  const { access, db } = await authorizeLoreMember(request, leagueId);
  if (!access.ok) {
    return errorJson(access.error);
  }

  const result = await getLoreSectionData(db, { leagueId });
  switch (result.status) {
    case "ready":
      return okJson(result.data);
    case "not_found":
      return errorJson(
        new AppError({
          code: "LORE_LEAGUE_NOT_FOUND",
          message: "League lore could not be found",
          status: 404,
        }),
      );
  }
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/leagues/[leagueId]/lore/claims" },
  loreClaimsGet,
);

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/lore/claims" },
  loreClaimsPost,
);
