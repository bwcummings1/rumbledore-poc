import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  type ProviderPayloadObservation,
  providerPayloadObservations,
} from "@/db/schema";
import type {
  FantasyProvider,
  FantasyProviderSession,
  NormalizedLeague,
  NormalizedMatchup,
  ProviderLeagueRef,
} from "@/providers/model";
import { stableContentHash } from "./hash";

export const PROVIDER_PAYLOAD_CANARY_VIEWS = [
  "settings",
  "scoreboard",
] as const;

export type ProviderPayloadCanaryView =
  (typeof PROVIDER_PAYLOAD_CANARY_VIEWS)[number];

export const PROVIDER_PAYLOAD_DRIFT_KINDS = [
  "shape_additive",
  "shape_changed",
  "semantic",
] as const;

export type ProviderPayloadDriftKind =
  (typeof PROVIDER_PAYLOAD_DRIFT_KINDS)[number];

export type ProviderPayloadCanaryProvider = Pick<
  FantasyProvider<unknown, FantasyProviderSession>,
  "authenticate" | "getLeague" | "getMatchups"
>;

export interface ProviderPayloadCanaryCapture {
  detail: Record<string, unknown>;
  normalized: unknown;
  scoringPeriod: number | null;
  view: ProviderPayloadCanaryView;
}

export interface ProviderPayloadCanaryResult {
  alerts: number;
  observations: ProviderPayloadObservation[];
  scoreboardPeriod: number;
}

function schemaValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value instanceof Date) {
    return "date";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function collectSchemaShape(
  value: unknown,
  path: string,
  paths: Set<string>,
): void {
  const valueType = schemaValueType(value);
  paths.add(`${path}:${valueType}`);

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectSchemaShape(entry, `${path}[]`, paths);
    }
    return;
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, entry] of Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      collectSchemaShape(entry, `${path}[${JSON.stringify(key)}]`, paths);
    }
  }
}

export function providerPayloadSchemaShape(value: unknown): string[] {
  const paths = new Set<string>();
  collectSchemaShape(value, "$", paths);
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function normalizedSettingsView(league: NormalizedLeague) {
  return {
    acquisitionSettings: league.acquisitionSettings ?? null,
    keeperSettings: league.keeperSettings ?? null,
    postseason: league.postseason ?? null,
    rosterSettings: league.rosterSettings ?? null,
    scoringSettings: league.scoringSettings ?? {},
    scoringType: league.scoringType,
    size: league.size,
  };
}

function normalizedScoreboardView(matchups: readonly NormalizedMatchup[]) {
  return [...matchups]
    .sort(
      (left, right) =>
        left.scoringPeriod - right.scoringPeriod ||
        left.providerId.localeCompare(right.providerId),
    )
    .map((matchup) => ({
      awayScore: matchup.awayScore ?? null,
      awayTeamProviderId: matchup.awayTeamRef?.providerId ?? null,
      homeScore: matchup.homeScore,
      homeTeamProviderId: matchup.homeTeamRef.providerId,
      kind: matchup.kind ?? "head_to_head",
      periodStart: matchup.periodStart ?? null,
      providerMatchupId: matchup.providerId,
      scoringPeriod: matchup.scoringPeriod,
      scoringPeriodSpan: matchup.scoringPeriodSpan ?? 1,
      status: matchup.status,
      winner: matchup.winner,
    }));
}

export function providerPayloadCanaryScoreboardPeriod(
  league: Pick<NormalizedLeague, "currentScoringPeriod" | "status">,
): number {
  if (league.status === "in_season" && league.currentScoringPeriod > 1) {
    return league.currentScoringPeriod - 1;
  }
  return Math.max(1, league.currentScoringPeriod);
}

export async function captureProviderPayloadCanaryViews({
  provider,
  ref,
  session,
}: {
  provider: ProviderPayloadCanaryProvider;
  ref: ProviderLeagueRef;
  session: FantasyProviderSession;
}): Promise<ProviderPayloadCanaryCapture[]> {
  const leagueResult = await provider.getLeague(session, ref);
  if (!leagueResult.ok) {
    throw leagueResult.error;
  }

  const scoreboardPeriod = providerPayloadCanaryScoreboardPeriod(
    leagueResult.value,
  );
  const matchupResult = await provider.getMatchups(
    session,
    ref,
    scoreboardPeriod,
  );
  if (!matchupResult.ok) {
    throw matchupResult.error;
  }

  return [
    {
      detail: { settingGroups: 7 },
      normalized: normalizedSettingsView(leagueResult.value),
      scoringPeriod: null,
      view: "settings",
    },
    {
      detail: { matchupCount: matchupResult.value.length },
      normalized: normalizedScoreboardView(matchupResult.value),
      scoringPeriod: scoreboardPeriod,
      view: "scoreboard",
    },
  ];
}

function changedPaths(previous: readonly string[], current: readonly string[]) {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  return {
    added: current.filter((path) => !previousSet.has(path)),
    removed: previous.filter((path) => !currentSet.has(path)),
  };
}

function digestChanged(current: string, previous: string): boolean {
  return Boolean(current.localeCompare(previous));
}

function driftKindsFor({
  addedPaths,
  contentHash,
  previous,
  removedPaths,
  schemaHash,
}: {
  addedPaths: readonly string[];
  contentHash: string;
  previous: ProviderPayloadObservation;
  removedPaths: readonly string[];
  schemaHash: string;
}): ProviderPayloadDriftKind[] {
  const kinds: ProviderPayloadDriftKind[] = [];
  if (addedPaths.length > 0) {
    kinds.push("shape_additive");
  }
  if (
    removedPaths.length > 0 ||
    (digestChanged(schemaHash, previous.schemaHash) && addedPaths.length === 0)
  ) {
    kinds.push("shape_changed");
  }
  if (digestChanged(contentHash, previous.contentHash)) {
    kinds.push("semantic");
  }
  return kinds;
}

export async function appendProviderPayloadCanaryObservations({
  captures,
  db,
  leagueId,
  observedAt,
  provider,
  providerLeagueId,
  season,
}: {
  captures: readonly ProviderPayloadCanaryCapture[];
  db: Db;
  leagueId: string;
  observedAt?: Date;
  provider: ProviderPayloadObservation["provider"];
  providerLeagueId: string;
  season: number;
}): Promise<ProviderPayloadObservation[]> {
  const capturedAt = observedAt ?? new Date();
  return withLeagueContext(db, leagueId, async (tx) => {
    const observations: ProviderPayloadObservation[] = [];
    for (const capture of captures) {
      const schemaShape = providerPayloadSchemaShape(capture.normalized);
      const schemaHash = stableContentHash(schemaShape);
      const contentHash = stableContentHash(capture.normalized);
      const scoringPeriodFilter =
        capture.scoringPeriod === null
          ? isNull(providerPayloadObservations.scoringPeriod)
          : eq(
              providerPayloadObservations.scoringPeriod,
              capture.scoringPeriod,
            );
      const [previous] = await tx
        .select()
        .from(providerPayloadObservations)
        .where(
          and(
            eq(providerPayloadObservations.leagueId, leagueId),
            eq(providerPayloadObservations.provider, provider),
            eq(providerPayloadObservations.providerLeagueId, providerLeagueId),
            eq(providerPayloadObservations.season, season),
            eq(providerPayloadObservations.view, capture.view),
            scoringPeriodFilter,
          ),
        )
        .orderBy(
          desc(providerPayloadObservations.observedAt),
          desc(providerPayloadObservations.createdAt),
          desc(providerPayloadObservations.id),
        )
        .limit(1);

      const paths = previous
        ? changedPaths(previous.schemaShape, schemaShape)
        : { added: [], removed: [] };
      const driftKinds = previous
        ? driftKindsFor({
            addedPaths: paths.added,
            contentHash,
            previous,
            removedPaths: paths.removed,
            schemaHash,
          })
        : [];
      const outcome = previous
        ? driftKinds.length > 0
          ? "alert"
          : "stable"
        : "baseline";

      const [inserted] = await tx
        .insert(providerPayloadObservations)
        .values({
          addedPaths: paths.added,
          contentHash,
          detail: capture.detail,
          driftKinds,
          leagueId,
          observedAt: capturedAt,
          outcome,
          previousObservationId: previous?.id,
          provider,
          providerLeagueId,
          removedPaths: paths.removed,
          schemaHash,
          schemaShape,
          scoringPeriod: capture.scoringPeriod,
          season,
          view: capture.view,
        })
        .returning();
      if (!inserted) {
        throw new Error("provider payload observation was not persisted");
      }
      observations.push(inserted);
    }
    return observations;
  });
}

export async function runProviderPayloadCanary({
  db,
  leagueId,
  observedAt,
  provider,
  providerId,
  providerLeagueId,
  ref,
  session,
}: {
  db: Db;
  leagueId: string;
  observedAt?: Date;
  provider: ProviderPayloadCanaryProvider;
  providerId: ProviderPayloadObservation["provider"];
  providerLeagueId: string;
  ref: ProviderLeagueRef;
  session: FantasyProviderSession;
}): Promise<ProviderPayloadCanaryResult> {
  const captures = await captureProviderPayloadCanaryViews({
    provider,
    ref,
    session,
  });
  const observations = await appendProviderPayloadCanaryObservations({
    captures,
    db,
    leagueId,
    observedAt,
    provider: providerId,
    providerLeagueId,
    season: ref.season,
  });
  const capturesByView = new Map(
    captures.map((capture) => [capture.view, capture] as const),
  );
  const scoreboard = capturesByView.get("scoreboard");
  if (!scoreboard?.scoringPeriod) {
    throw new Error("provider payload canary did not capture a scoreboard");
  }
  return {
    alerts: observations.filter((row) => row.outcome === "alert").length,
    observations,
    scoreboardPeriod: scoreboard.scoringPeriod,
  };
}
