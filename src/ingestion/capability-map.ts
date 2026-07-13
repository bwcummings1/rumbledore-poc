import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  type DataCapabilityObservation,
  dataCapabilityObservations,
} from "@/db/schema";
import type { FantasyProviderId, ProviderDataClass } from "@/providers/model";
import { PROVIDER_DATA_CLASSES } from "@/providers/model";

export interface DeclaredCapabilityMapInput {
  db: Db;
  leagueId: string;
  provider?: FantasyProviderId;
  providerLeagueId?: string;
  season?: number;
}

export interface DeclaredCapabilityBasis {
  absentSeasons: number[];
  availableSeasons: number[];
  dataClass: ProviderDataClass;
  label: string;
  measuredSeasons: number[];
  partialSeasons: number[];
  providerLimited: boolean;
  seasonBasis: string;
}

type CapabilityBasisObservation = Pick<
  DataCapabilityObservation,
  "availability" | "dataClass" | "rowCount" | "season"
>;

function capabilityKey(row: DataCapabilityObservation): string {
  return [row.provider, row.providerLeagueId, row.season, row.dataClass].join(
    ":",
  );
}

const dataClassOrder = new Map<ProviderDataClass, number>(
  PROVIDER_DATA_CLASSES.map((dataClass, index) => [dataClass, index]),
);

function sortedUniqueSeasons(seasons: readonly number[]): number[] {
  return [...new Set(seasons)].sort((left, right) => left - right);
}

function formatSeasonRanges(seasons: readonly number[]): string[] {
  const sorted = sortedUniqueSeasons(seasons);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = start;

  for (const season of sorted.slice(1)) {
    if (end !== undefined && season === end + 1) {
      end = season;
      continue;
    }
    if (start !== undefined && end !== undefined) {
      ranges.push(start === end ? `${start}` : `${start}\u2013${end}`);
    }
    start = season;
    end = season;
  }

  if (start !== undefined && end !== undefined) {
    ranges.push(start === end ? `${start}` : `${start}\u2013${end}`);
  }
  return ranges;
}

function formatAvailableSeasonBasis(
  seasons: readonly number[],
  currentSeason: number,
): string {
  const available = sortedUniqueSeasons(seasons);
  if (available.length === 0) {
    return "none";
  }
  if (!available.includes(currentSeason)) {
    return formatSeasonRanges(available).join(" + ");
  }

  const historical = available.filter((season) => season !== currentSeason);
  if (historical.length === 0) {
    return `current (${currentSeason})`;
  }
  if (
    historical[0] !== undefined &&
    historical.every(
      (season, index) => season === (historical[0] ?? season) + index,
    ) &&
    historical.at(-1) === currentSeason - 1
  ) {
    return `${historical[0]}\u2013current`;
  }
  return [...formatSeasonRanges(historical), "current"].join(" + ");
}

/**
 * Builds display-only provenance for a data-backed surface. This is derived
 * from operational probe observations and must never be written into pushed
 * canonical snapshots or used to alter record values.
 */
export function buildDeclaredCapabilityBasis({
  currentSeason,
  dataClass,
  label,
  observations,
}: {
  currentSeason: number;
  dataClass: ProviderDataClass;
  label: string;
  observations: readonly CapabilityBasisObservation[];
}): DeclaredCapabilityBasis {
  const measured = observations.filter((row) => row.dataClass === dataClass);
  const measuredSeasons = sortedUniqueSeasons(
    measured.map((row) => row.season),
  );
  const availableSeasons = sortedUniqueSeasons(
    measured
      .filter((row) => row.availability !== "none" && row.rowCount > 0)
      .map((row) => row.season),
  );
  const partialSeasons = sortedUniqueSeasons(
    measured
      .filter((row) => row.availability === "partial" && row.rowCount > 0)
      .map((row) => row.season),
  );
  const availableSet = new Set(availableSeasons);
  const absentSeasons = measuredSeasons.filter(
    (season) => !availableSet.has(season),
  );
  const providerLimited = absentSeasons.length > 0 || partialSeasons.length > 0;
  const seasonBasis =
    measuredSeasons.length === 0
      ? "not measured"
      : formatAvailableSeasonBasis(availableSeasons, currentSeason);

  return {
    absentSeasons,
    availableSeasons,
    dataClass,
    label:
      measuredSeasons.length === 0
        ? `${label}: ${seasonBasis}`
        : `${label}: ${seasonBasis} \u2014 measured${
            providerLimited ? ", provider-limited" : ""
          }`,
    measuredSeasons,
    partialSeasons,
    providerLimited,
    seasonBasis,
  };
}

/**
 * Returns the current declared capability map from the append-only probe log.
 * A re-probe never destroys evidence: the newest observation wins per
 * provider league, season, and data class only in this read projection.
 */
export async function listDeclaredCapabilityMap({
  db,
  leagueId,
  provider,
  providerLeagueId,
  season,
}: DeclaredCapabilityMapInput): Promise<DataCapabilityObservation[]> {
  const observations = await withLeagueContext(db, leagueId, (tx) =>
    tx
      .select()
      .from(dataCapabilityObservations)
      .where(
        and(
          eq(dataCapabilityObservations.leagueId, leagueId),
          provider
            ? eq(dataCapabilityObservations.provider, provider)
            : undefined,
          providerLeagueId
            ? eq(dataCapabilityObservations.providerLeagueId, providerLeagueId)
            : undefined,
          season !== undefined
            ? eq(dataCapabilityObservations.season, season)
            : undefined,
        ),
      )
      .orderBy(
        desc(dataCapabilityObservations.probedAt),
        desc(dataCapabilityObservations.createdAt),
      ),
  );

  const latest = new Map<string, DataCapabilityObservation>();
  for (const observation of observations) {
    const key = capabilityKey(observation);
    if (!latest.has(key)) {
      latest.set(key, observation);
    }
  }

  return [...latest.values()].sort(
    (left, right) =>
      right.season - left.season ||
      (dataClassOrder.get(left.dataClass) ?? Number.MAX_SAFE_INTEGER) -
        (dataClassOrder.get(right.dataClass) ?? Number.MAX_SAFE_INTEGER) ||
      left.provider.localeCompare(right.provider) ||
      left.providerLeagueId.localeCompare(right.providerLeagueId),
  );
}
