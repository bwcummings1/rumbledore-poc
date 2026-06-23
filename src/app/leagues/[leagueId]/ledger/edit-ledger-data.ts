import { eq, inArray } from "drizzle-orm";
import type { EditLedgerEntry } from "@/components/curation/edit-ledger-types";
import type { Db } from "@/db/client";
import { leagues, users } from "@/db/schema";
import { listUnifiedDataLedgerPage } from "@/stats";

const EDIT_LEDGER_PAGE_SIZE = 25;

export interface EditLedgerPageData {
  readonly entries: readonly EditLedgerEntry[];
  readonly league: {
    readonly id: string;
    readonly name: string;
    readonly provider: string;
    readonly providerLeagueId: string;
    readonly season: number;
  };
  readonly pagination: {
    readonly hasMore: boolean;
    readonly limit: number;
    readonly offset: number;
    readonly page: number;
    readonly pageCount: number;
    readonly total: number;
  };
}

export type EditLedgerPageResult =
  | { readonly data: EditLedgerPageData; readonly status: "ready" }
  | { readonly status: "not_found" };

export async function getEditLedgerPageData(
  db: Db,
  input: { leagueId: string },
): Promise<EditLedgerPageResult> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const ledgerPage = await listUnifiedDataLedgerPage(db, {
    leagueId: input.leagueId,
    limit: EDIT_LEDGER_PAGE_SIZE,
    offset: 0,
  });
  const ledgerEntries = ledgerPage.entries;
  const actorIds = [
    ...new Set(
      ledgerEntries
        .map((entry) => entry.actorUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const actorRows =
    actorIds.length > 0
      ? await db
          .select({ displayName: users.displayName, id: users.id })
          .from(users)
          .where(inArray(users.id, actorIds))
      : [];
  const actorDisplayNames = new Map(
    actorRows.map((actor) => [actor.id, actor.displayName]),
  );

  return {
    data: {
      entries: ledgerEntries.map((entry) => ({
        ...entry,
        actorDisplayName: entry.actorUserId
          ? (actorDisplayNames.get(entry.actorUserId) ?? null)
          : null,
      })),
      league,
      pagination: {
        hasMore: ledgerPage.hasMore,
        limit: ledgerPage.limit,
        offset: ledgerPage.offset,
        page: 1,
        pageCount: Math.max(1, Math.ceil(ledgerPage.total / ledgerPage.limit)),
        total: ledgerPage.total,
      },
    },
    status: "ready",
  };
}
