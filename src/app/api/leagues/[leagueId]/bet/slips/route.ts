import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import {
  BET_LEG_SELECTIONS,
  BET_SLIP_KINDS,
  placeBetSlip,
} from "@/betting/placement";
import { recordApiHandler } from "@/core/metrics";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BET_SLIP_BODY_BYTES = 4096;

const placeBetSlipSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  kind: z.enum(BET_SLIP_KINDS),
  legs: z
    .array(
      z.object({
        oddsSnapshotId: z.uuid(),
        selection: z.enum(BET_LEG_SELECTIONS),
      }),
    )
    .min(1)
    .max(12),
  stakeCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

interface BetSlipsRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function betSlipsPost(request: Request, context: BetSlipsRouteContext) {
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

  const body = await readJsonBody(request, MAX_BET_SLIP_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = placeBetSlipSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        code: "INVALID_BET_SLIP_REQUEST",
        message: "Bet slip request payload is invalid",
        status: 400,
      }),
    );
  }

  try {
    const result = await placeBetSlip(db, {
      idempotencyKey: parsed.data.idempotencyKey,
      kind: parsed.data.kind,
      leagueId,
      legs: parsed.data.legs,
      stakeCents: parsed.data.stakeCents,
      userId: access.value.userId,
    });

    return okJson(
      {
        balanceCents: result.stakeLedgerEntry?.runningBalanceCents ?? null,
        reused: result.reused,
        slip: {
          id: result.slip.id,
          kind: result.slip.kind,
          placedAt: result.slip.placedAt.toISOString(),
          potentialPayoutCents: result.slip.potentialPayoutCents,
          stakeCents: result.slip.stakeCents,
          status: result.slip.status,
        },
      },
      result.reused ? 200 : 201,
    );
  } catch (error) {
    return errorJson(
      toAppError(error, {
        code: "BET_SLIP_PLACE_FAILED",
        message: "Bet slip could not be placed",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/bet/slips" },
  betSlipsPost,
);
