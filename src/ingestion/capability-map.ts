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

function capabilityKey(row: DataCapabilityObservation): string {
  return [row.provider, row.providerLeagueId, row.season, row.dataClass].join(
    ":",
  );
}

const dataClassOrder = new Map<ProviderDataClass, number>(
  PROVIDER_DATA_CLASSES.map((dataClass, index) => [dataClass, index]),
);

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
