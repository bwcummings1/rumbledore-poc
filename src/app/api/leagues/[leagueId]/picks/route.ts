import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { PICK_SELECTIONS, submitPick } from "@/betting/pickem";
import { recordApiHandler } from "@/core/metrics";
import { enforceApiRateLimitOrReject } from "@/core/rate-limit";
import { AppError, toAppError } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, okJson, readJsonBody } from "@/onboarding/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PICK_BODY_BYTES = 2048;

const submitPickSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  oddsSnapshotId: z.uuid(),
  pickWeekId: z.uuid(),
  selection: z.enum(PICK_SELECTIONS),
});

interface PicksRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function picksPost(request: Request, context: PicksRouteContext) {
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

  // The weekly allowance bounds SUCCESSFUL picks, not attempts. A member can
  // spam submissions the server will reject -- a stale snapshot, a locked
  // kickoff, a closed week -- indefinitely, and each one costs a transaction
  // with an RLS context switch. The cap is well above any honest pick session:
  // the largest legitimate burst is one submit per staged pick.
  const limited = await enforceApiRateLimitOrReject({
    max: 60,
    message: "Too many pick submissions. Try again shortly.",
    scope: "league-picks",
    // Keyed on the session user, never on a header a caller controls.
    subject: access.value.userId,
    windowSeconds: 60,
  });
  if (limited) {
    return limited;
  }

  const body = await readJsonBody(request, MAX_PICK_BODY_BYTES);
  if (!body.ok) {
    return errorJson(body.error);
  }

  const parsed = submitPickSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorJson(
      new AppError({
        cause: parsed.error,
        code: "INVALID_PICK_REQUEST",
        message: "Pick requests require a week, a priced selection, and a key",
        status: 400,
      }),
    );
  }

  try {
    // The user id comes from the session, never from the body: accepting a
    // caller-supplied userId would let any member submit picks as a rival.
    const result = await submitPick(db, {
      idempotencyKey: parsed.data.idempotencyKey,
      leagueId,
      oddsSnapshotId: parsed.data.oddsSnapshotId,
      pickWeekId: parsed.data.pickWeekId,
      selection: parsed.data.selection,
      userId: access.value.userId,
    });

    // A deduplicated retry is not a new pick, so it answers 200 rather than
    // 201. The client needs to tell the two apart to avoid double-counting a
    // submission it already drew.
    return okJson(
      {
        deduplicated: result.deduplicated,
        pickId: result.pickId,
        remainingPicks: result.remainingPicks,
      },
      result.deduplicated ? 200 : 201,
    );
  } catch (error) {
    // Domain refusals (kickoff lock, allowance exhausted, closed week) are
    // AppErrors and keep their own status; toAppError only clothes the rest.
    return errorJson(
      toAppError(error, {
        code: "PICK_SUBMIT_FAILED",
        message: "Pick could not be submitted",
        status: 500,
      }),
    );
  }
}

export const POST = recordApiHandler(
  { method: "POST", route: "/api/leagues/[leagueId]/picks" },
  picksPost,
);
