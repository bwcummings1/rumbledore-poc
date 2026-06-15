import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  leagues,
  loreClaims,
  loreVerifications,
  persons,
  seasonStatistics,
  weeklyStatistics,
} from "@/db/schema";
import type {
  LoreClaimVerificationSummary,
  LoreSectionData,
  LoreSubmitOptions,
} from "./member-ui";

export type LoreSectionResult =
  | {
      readonly data: LoreSectionData;
      readonly status: "ready";
    }
  | {
      readonly status: "not_found";
    };

export async function getLoreSectionData(
  db: Db,
  input: { leagueId: string },
): Promise<LoreSectionResult> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [counts] = await tx
      .select({
        canon: sql<number>`count(*) filter (where ${loreClaims.status} = 'canon')::int`,
        openVotes: sql<number>`count(*) filter (where ${loreClaims.status} = 'vote')::int`,
        refuted: sql<number>`count(*) filter (where ${loreClaims.verification} = 'refuted')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(loreClaims)
      .where(eq(loreClaims.leagueId, input.leagueId));

    return {
      counts: counts ?? { canon: 0, openVotes: 0, refuted: 0, total: 0 },
      submitOptions: await getLoreSubmitOptionsInContext(tx, input),
    };
  });

  return {
    data: {
      counts: scoped.counts,
      league,
      submitOptions: scoped.submitOptions,
    },
    status: "ready",
  };
}

export async function getLoreSubmitOptions(
  db: Db,
  input: { leagueId: string },
): Promise<LoreSubmitOptions> {
  return withLeagueContext(db, input.leagueId, (tx) =>
    getLoreSubmitOptionsInContext(tx, input),
  );
}

export async function getLoreClaimVerificationSummary(
  db: Db,
  input: { claimId: string; leagueId: string },
): Promise<LoreClaimVerificationSummary | null> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [verification] = await tx
      .select({
        actualValue: loreVerifications.actualValue,
        assertedValue: loreVerifications.assertedValue,
        result: loreVerifications.result,
      })
      .from(loreVerifications)
      .where(
        and(
          eq(loreVerifications.leagueId, input.leagueId),
          eq(loreVerifications.claimId, input.claimId),
        ),
      )
      .limit(1);

    return verification ?? null;
  });
}

async function getLoreSubmitOptionsInContext(
  tx: LeagueScopedTx,
  input: { leagueId: string },
): Promise<LoreSubmitOptions> {
  const people = await tx
    .select({
      id: persons.id,
      name: persons.canonicalName,
    })
    .from(persons)
    .where(eq(persons.leagueId, input.leagueId))
    .orderBy(asc(persons.canonicalName))
    .limit(100);

  const seasonRows = await tx
    .select({ season: seasonStatistics.season })
    .from(seasonStatistics)
    .where(eq(seasonStatistics.leagueId, input.leagueId))
    .groupBy(seasonStatistics.season)
    .orderBy(desc(seasonStatistics.season));

  const weekRows = await tx
    .select({
      season: weeklyStatistics.season,
      week: weeklyStatistics.scoringPeriod,
    })
    .from(weeklyStatistics)
    .where(eq(weeklyStatistics.leagueId, input.leagueId))
    .groupBy(weeklyStatistics.season, weeklyStatistics.scoringPeriod)
    .orderBy(
      desc(weeklyStatistics.season),
      asc(weeklyStatistics.scoringPeriod),
    );

  const recordRows = await tx
    .select({ recordType: allTimeRecords.recordType })
    .from(allTimeRecords)
    .where(
      and(
        eq(allTimeRecords.leagueId, input.leagueId),
        eq(allTimeRecords.isCurrent, true),
      ),
    )
    .groupBy(allTimeRecords.recordType)
    .orderBy(asc(allTimeRecords.recordType));

  const weeksBySeason = new Map<number, number[]>();
  for (const row of weekRows) {
    const weeks = weeksBySeason.get(row.season) ?? [];
    weeks.push(row.week);
    weeksBySeason.set(row.season, weeks);
  }

  const seasonSet = new Set([
    ...seasonRows.map((row) => row.season),
    ...weekRows.map((row) => row.season),
  ]);
  const seasons = [...seasonSet]
    .sort((left, right) => right - left)
    .map((season) => ({
      season,
      weeks: weeksBySeason.get(season) ?? [],
    }));

  return {
    people,
    recordTypes: recordRows.map((row) => ({
      label: row.recordType.replaceAll("_", " "),
      recordType: row.recordType,
    })),
    seasons,
  };
}
