import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { leagueCurationSeasonStates } from "@/db/schema";

export type CurationSeasonMode = "finalized" | "live";

export interface CurationSeasonState {
  createdAt: string;
  finalizedAt: string | null;
  finalizedByUserId: string | null;
  id: string;
  leagueId: string;
  mode: CurationSeasonMode;
  reason: string | null;
  season: number;
  updatedAt: string;
}

function iso(value: Date): string {
  return value.toISOString();
}

function stateFromRow(
  row: typeof leagueCurationSeasonStates.$inferSelect,
): CurationSeasonState {
  return {
    createdAt: iso(row.createdAt),
    finalizedAt: row.finalizedAt ? iso(row.finalizedAt) : null,
    finalizedByUserId: row.finalizedByUserId,
    id: row.id,
    leagueId: row.leagueId,
    mode: row.mode,
    reason: row.reason,
    season: row.season,
    updatedAt: iso(row.updatedAt),
  };
}

export async function listCurationSeasonStates(
  db: Db,
  input: { leagueId: string },
): Promise<CurationSeasonState[]> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const rows = await tx
      .select()
      .from(leagueCurationSeasonStates)
      .where(eq(leagueCurationSeasonStates.leagueId, input.leagueId))
      .orderBy(asc(leagueCurationSeasonStates.season));
    return rows.map(stateFromRow);
  });
}

export async function setCurationSeasonMode(
  db: Db,
  input: {
    actorUserId: string;
    leagueId: string;
    mode: CurationSeasonMode;
    reason?: string;
    season: number;
  },
): Promise<CurationSeasonState> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const now = new Date();
    const values = {
      finalizedAt: input.mode === "finalized" ? now : null,
      finalizedByUserId: input.mode === "finalized" ? input.actorUserId : null,
      leagueId: input.leagueId,
      mode: input.mode,
      reason: input.reason ?? null,
      season: input.season,
      updatedAt: now,
    };
    const [row] = await tx
      .insert(leagueCurationSeasonStates)
      .values(values)
      .onConflictDoUpdate({
        set: {
          finalizedAt: values.finalizedAt,
          finalizedByUserId: values.finalizedByUserId,
          mode: values.mode,
          reason: values.reason,
          updatedAt: values.updatedAt,
        },
        target: [
          leagueCurationSeasonStates.leagueId,
          leagueCurationSeasonStates.season,
        ],
      })
      .returning();
    if (!row) {
      throw new Error("curation season state was not written");
    }

    return stateFromRow(row);
  });
}
