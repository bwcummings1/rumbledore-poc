import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { contentItems, editorialActions, fantasyMatchups } from "@/db/schema";

export interface ChangedFinalMatchupCorrectionSource {
  contentHash: string;
  id: string;
}

export interface CorrectionMatchupWeek {
  scoringPeriod: number;
  season: number;
}

export interface CorrectionChangedMatchup extends CorrectionMatchupWeek {
  contentHash: string;
  id: string;
}

export interface ContentCorrectionNeeded {
  affectedWeeks: CorrectionMatchupWeek[];
  changedMatchups: CorrectionChangedMatchup[];
  contentItemId: string;
  correctionHash: string;
  leagueId: string;
  reason: string;
}

interface ContentCorrectionCandidate {
  id: string;
  metadata: Record<string, unknown>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function weekKey(week: CorrectionMatchupWeek): string {
  return `${week.season}:${week.scoringPeriod}`;
}

function uniqueWeeks(
  weeks: readonly CorrectionMatchupWeek[],
): CorrectionMatchupWeek[] {
  const byKey = new Map<string, CorrectionMatchupWeek>();
  for (const week of weeks) {
    byKey.set(weekKey(week), week);
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.season - right.season || left.scoringPeriod - right.scoringPeriod,
  );
}

function parseMatchupWeek(value: unknown): CorrectionMatchupWeek | null {
  const record = recordValue(value);
  const season = numberValue(record.season);
  const scoringPeriod =
    numberValue(record.scoringPeriod) ??
    numberValue(record.week) ??
    numberValue(record.scoring_period);
  return season !== null && scoringPeriod !== null
    ? { scoringPeriod, season }
    : null;
}

export function contentMetadataMatchupWeeks(
  metadata: Record<string, unknown>,
): CorrectionMatchupWeek[] {
  const references = recordValue(metadata.references);
  const article = recordValue(metadata.article);
  return uniqueWeeks([
    ...arrayValue(references.matchupWeeks)
      .map(parseMatchupWeek)
      .filter((week): week is CorrectionMatchupWeek => week !== null),
    ...arrayValue(article.matchupWeeks)
      .map(parseMatchupWeek)
      .filter((week): week is CorrectionMatchupWeek => week !== null),
  ]);
}

export function contentCorrectionHash({
  changedMatchups,
}: {
  changedMatchups: readonly CorrectionChangedMatchup[];
}): string {
  return sha256({
    changedMatchups: [...changedMatchups]
      .map((matchup) => ({
        contentHash: matchup.contentHash,
        id: matchup.id,
        scoringPeriod: matchup.scoringPeriod,
        season: matchup.season,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
}

async function loadChangedFinalMatchupCorrections({
  db,
  leagueId,
  matchups,
}: {
  db: Db;
  leagueId: string;
  matchups: readonly ChangedFinalMatchupCorrectionSource[];
}): Promise<CorrectionChangedMatchup[]> {
  if (matchups.length === 0) {
    return [];
  }

  const hashById = new Map(
    matchups.map((matchup) => [matchup.id, matchup.contentHash]),
  );
  const rows = await withLeagueContext(db, leagueId, (tx) =>
    tx
      .select({
        id: fantasyMatchups.id,
        scoringPeriod: fantasyMatchups.scoringPeriod,
        season: fantasyMatchups.season,
      })
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.leagueId, leagueId),
          eq(fantasyMatchups.status, "final"),
          inArray(fantasyMatchups.id, [...hashById.keys()]),
        ),
      ),
  );

  return rows
    .map((row) => ({
      contentHash: hashById.get(row.id) ?? "",
      id: row.id,
      scoringPeriod: row.scoringPeriod,
      season: row.season,
    }))
    .filter((row) => row.contentHash.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function correctionAlreadyLedgered({
  contentItemId,
  correctionHash,
  db,
  leagueId,
}: {
  contentItemId: string;
  correctionHash: string;
  db: Db;
  leagueId: string;
}): Promise<boolean> {
  const [row] = await withLeagueContext(db, leagueId, (tx) =>
    tx
      .select({ id: editorialActions.id })
      .from(editorialActions)
      .where(
        and(
          eq(editorialActions.leagueId, leagueId),
          eq(editorialActions.action, "correct"),
          eq(editorialActions.targetContentItemId, contentItemId),
          sql`${editorialActions.metadata}->>'correctionHash' = ${correctionHash}`,
        ),
      )
      .limit(1),
  );
  return Boolean(row);
}

function correctionForContent({
  candidate,
  changedByWeek,
  leagueId,
}: {
  candidate: ContentCorrectionCandidate;
  changedByWeek: ReadonlyMap<string, CorrectionChangedMatchup[]>;
  leagueId: string;
}): Omit<ContentCorrectionNeeded, "correctionHash"> | null {
  const referencedWeeks = contentMetadataMatchupWeeks(candidate.metadata);
  const affectedWeeks = referencedWeeks.filter((week) =>
    changedByWeek.has(weekKey(week)),
  );
  if (affectedWeeks.length === 0) {
    return null;
  }

  const changedMatchups = uniqueWeeks(affectedWeeks).flatMap(
    (week) => changedByWeek.get(weekKey(week)) ?? [],
  );
  if (changedMatchups.length === 0) {
    return null;
  }

  return {
    affectedWeeks: uniqueWeeks(affectedWeeks),
    changedMatchups,
    contentItemId: candidate.id,
    leagueId,
    reason: "Score correction changed a published post's referenced week.",
  };
}

function metadataRepresentsCorrection(
  metadata: Record<string, unknown>,
  correctionHash: string,
): boolean {
  const editorial = recordValue(metadata.editorial);
  return (
    editorial.kind === "correction" &&
    editorial.correctionHash === correctionHash
  );
}

export async function detectContentCorrectionsNeeded({
  changedFinalMatchups,
  db,
  leagueId,
}: {
  changedFinalMatchups: readonly ChangedFinalMatchupCorrectionSource[];
  db: Db;
  leagueId: string;
}): Promise<ContentCorrectionNeeded[]> {
  const changedMatchups = await loadChangedFinalMatchupCorrections({
    db,
    leagueId,
    matchups: changedFinalMatchups,
  });
  if (changedMatchups.length === 0) {
    return [];
  }

  const changedByWeek = new Map<string, CorrectionChangedMatchup[]>();
  for (const matchup of changedMatchups) {
    const key = weekKey(matchup);
    changedByWeek.set(key, [...(changedByWeek.get(key) ?? []), matchup]);
  }

  const candidates = await withLeagueContext(db, leagueId, (tx) =>
    tx
      .select({
        id: contentItems.id,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.leagueId, leagueId),
          eq(contentItems.kind, "blog"),
          contentItemIsPublished(),
        ),
      ),
  );

  const corrections: ContentCorrectionNeeded[] = [];
  for (const candidate of candidates) {
    const correction = correctionForContent({
      candidate,
      changedByWeek,
      leagueId,
    });
    if (!correction) {
      continue;
    }
    const correctionHash = contentCorrectionHash({
      changedMatchups: correction.changedMatchups,
    });
    if (metadataRepresentsCorrection(candidate.metadata, correctionHash)) {
      continue;
    }
    if (
      await correctionAlreadyLedgered({
        contentItemId: correction.contentItemId,
        correctionHash,
        db,
        leagueId,
      })
    ) {
      continue;
    }
    corrections.push({ ...correction, correctionHash });
  }

  return corrections.sort((left, right) =>
    left.contentItemId.localeCompare(right.contentItemId),
  );
}
