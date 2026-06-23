import { z } from "zod";
import { requireLeagueRole } from "@/auth/guards";
import { recordApiHandler } from "@/core/metrics";
import { AppError, ok } from "@/core/result";
import { getDb } from "@/db";
import { errorJson, resultJson } from "@/onboarding/http";
import { listUnifiedDataLedgerPage } from "@/stats";

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
const ledgerLimitSchema = z.coerce.number().int().min(1).max(100).optional();
const ledgerOffsetSchema = z.coerce.number().int().min(0).optional();
const DEFAULT_LEDGER_PAGE_SIZE = 25;

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
  const limitParam = ledgerLimitSchema.safeParse(
    url.searchParams.get("limit") ?? undefined,
  );
  const offsetParam = ledgerOffsetSchema.safeParse(
    url.searchParams.get("offset") ?? undefined,
  );
  if (!limitParam.success || !offsetParam.success) {
    return errorJson(
      new AppError({
        code: "INVALID_LEDGER_PAGE",
        message: "Ledger pagination is invalid",
        status: 400,
      }),
    );
  }
  const limit = limitParam.data ?? DEFAULT_LEDGER_PAGE_SIZE;
  const offset = offsetParam.data ?? 0;
  const page = await listUnifiedDataLedgerPage(db, {
    leagueId,
    limit,
    offset,
    targetId: targetId.data,
    targetKind: targetKind.data,
  });
  const pageCount = Math.max(1, Math.ceil(page.total / page.limit));

  return resultJson(
    ok({
      entries: page.entries,
      pagination: {
        hasMore: page.hasMore,
        limit: page.limit,
        offset: page.offset,
        page: Math.floor(page.offset / page.limit) + 1,
        pageCount,
        total: page.total,
      },
    }),
  );
}

export const GET = recordApiHandler(
  { method: "GET", route: "/api/leagues/[leagueId]/curation/ledger" },
  curationLedgerGet,
);
