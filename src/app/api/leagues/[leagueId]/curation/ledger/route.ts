import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, ok } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, resultJson } from "@/onboarding/http";
import { listUnifiedDataLedger } from "@/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ledgerTargetKindSchema = z
  .enum([
    "person",
    "team_season",
    "weekly_stat",
    "matchup",
    "season_setting",
    "grouping",
    "member",
    "curation_checkpoint",
    "curation_push",
    "integrity_check",
  ])
  .optional();

interface CurationLedgerRouteContext {
  params: Promise<{ leagueId: string }>;
}

async function curationLedgerGet(
  request: Request,
  context: CurationLedgerRouteContext,
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

  const url = new URL(request.url);
  const targetKindRaw = url.searchParams.get("targetKind") ?? undefined;
  const targetKind = ledgerTargetKindSchema.safeParse(targetKindRaw);
  if (!targetKind.success) {
    return errorJson(
      new AppError({
        code: "INVALID_LEDGER_FILTER",
        message: "Ledger target kind is invalid",
        status: 400,
      }),
    );
  }

  const targetIdRaw = url.searchParams.get("targetId") ?? undefined;
  const targetId = z.uuid().optional().safeParse(targetIdRaw);
  if (!targetId.success) {
    return errorJson(
      new AppError({
        code: "INVALID_LEDGER_FILTER",
        message: "Ledger target id is invalid",
        status: 400,
      }),
    );
  }
  const limit = Number(url.searchParams.get("limit") ?? 100);

  return resultJson(
    ok({
      entries: await listUnifiedDataLedger(db, {
        leagueId,
        limit: Number.isFinite(limit) ? limit : 100,
        targetId: targetId.data,
        targetKind: targetKind.data,
      }),
    }),
  );
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/leagues/[leagueId]/curation/ledger" },
  curationLedgerGet,
);
