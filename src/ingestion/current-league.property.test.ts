// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import * as fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  dataIntegrityChecks,
  fantasyDraftPicks,
  fantasyMatchups,
  fantasyMembers,
  fantasyPlayers,
  fantasyPlayerWeekStatBreakdowns,
  fantasyRosterEntries,
  fantasyTeams,
  fantasyTransactions,
  identityMappings,
  leagueSeasonSettings,
  leagues,
  persons,
  providerFinalStandings,
  teamSeasons,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import type { ProviderCodeKind } from "@/providers/decoding";
import type {
  NormalizedPlayer,
  NormalizedSeasonBundle,
} from "@/providers/model";
import {
  resolveLeagueIdentities,
  runDataIntegrityChecks,
} from "@/stats/engine";
import {
  buildNormalizedSeasonBundle,
  type GeneratedOwnerOverlap,
  normalizedSeasonShapeArbitrary,
  normalizedVolumeSeasonShapeArbitrary,
} from "@/testing/arbitraries";
import { persistNormalizedLeagueRows } from "./current-league";

const marker = `property-ingest-${randomUUID()}`;
const PROPERTY_SEED = 0x47b2;
const DEFAULT_PROPERTY_RUNS = 3;
const POSTGRES_MAX_BIND_PARAMETERS = 65_535;
const ROSTER_INSERT_BOUND_COLUMNS = 17;
const STAT_BREAKDOWN_INSERT_BOUND_COLUMNS = 16;
const PROVIDER_CODE_KINDS: readonly ProviderCodeKind[] = [
  "activity",
  "lineup_slot",
  "position",
  "pro_team",
  "scoring_stat",
];
let handle: DbHandle;

const completePairingShapeArbitrary = normalizedSeasonShapeArbitrary.filter(
  (shape) => shape.leagueSize % 2 === 0,
);

const OVERLAPPING_OWNER_MODES: readonly GeneratedOwnerOverlap[] = [
  "co_owned",
  "shared_member",
];

const providerCodeCaseArbitrary = fc
  .tuple(
    normalizedSeasonShapeArbitrary,
    fc.integer({ max: 99_999, min: 10_000 }),
  )
  .map(([shape, code]) => ({
    code,
    shape: {
      ...shape,
      playerDepth: true,
      statBreakdowns: true,
      transactions: true,
    },
  }));

function configuredPropertyRuns(defaultRuns = DEFAULT_PROPERTY_RUNS): number {
  const configured = process.env.PROPERTY_RUNS;
  if (!configured) return defaultRuns;
  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("PROPERTY_RUNS must be a positive integer");
  }
  return parsed;
}

function reconciliationScope(season: number) {
  return {
    draftPicks: [season],
    members: [season],
    rosters: [season],
    teams: [season],
    transactions: [season],
  };
}

async function insertLeague(bundle: NormalizedSeasonBundle): Promise<string> {
  const [inserted] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: bundle.league.currentScoringPeriod ?? 0,
      name: bundle.league.name,
      provider: bundle.league.provider,
      providerLeagueId: bundle.league.providerId,
      scoringSettings: bundle.league.scoringSettings ?? {},
      scoringType: bundle.league.scoringType,
      season: bundle.league.season,
      size: bundle.league.size,
      sport: bundle.league.sport,
      status: bundle.league.status,
    })
    .returning({ id: leagues.id });
  if (!inserted) throw new Error("failed to insert generated property league");
  return inserted.id;
}

async function persistBundle(leagueId: string, bundle: NormalizedSeasonBundle) {
  return persistNormalizedLeagueRows({
    db: handle.db,
    draftPicks: bundle.draftPicks,
    finalStandings: bundle.finalStandings,
    league: bundle.league,
    leagueId,
    leagueProviderId: bundle.league.providerId,
    matchups: bundle.matchups,
    members: bundle.members,
    players: bundle.players,
    reconcileSeasons: reconciliationScope(bundle.league.season),
    rosters: bundle.rosters,
    teams: bundle.teams,
    transactions: bundle.transactions,
  });
}

async function selectPersistedRows(leagueId: string, season?: number) {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const teamRows = await tx
      .select()
      .from(fantasyTeams)
      .where(
        and(
          eq(fantasyTeams.leagueId, leagueId),
          season === undefined ? undefined : eq(fantasyTeams.season, season),
        ),
      )
      .orderBy(asc(fantasyTeams.season), asc(fantasyTeams.providerTeamId));
    const memberRows = await tx
      .select()
      .from(fantasyMembers)
      .where(
        and(
          eq(fantasyMembers.leagueId, leagueId),
          season === undefined ? undefined : eq(fantasyMembers.season, season),
        ),
      )
      .orderBy(
        asc(fantasyMembers.season),
        asc(fantasyMembers.providerMemberId),
      );
    const playerRows =
      season === undefined
        ? await tx
            .select()
            .from(fantasyPlayers)
            .where(eq(fantasyPlayers.leagueId, leagueId))
            .orderBy(asc(fantasyPlayers.providerPlayerId))
        : [];
    const matchupRows = await tx
      .select()
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.leagueId, leagueId),
          season === undefined ? undefined : eq(fantasyMatchups.season, season),
        ),
      )
      .orderBy(
        asc(fantasyMatchups.season),
        asc(fantasyMatchups.scoringPeriod),
        asc(fantasyMatchups.providerMatchupId),
      );
    const standingRows = await tx
      .select()
      .from(providerFinalStandings)
      .where(
        and(
          eq(providerFinalStandings.leagueId, leagueId),
          season === undefined
            ? undefined
            : eq(providerFinalStandings.season, season),
        ),
      )
      .orderBy(
        asc(providerFinalStandings.season),
        asc(providerFinalStandings.providerTeamId),
      );
    const settingRows = await tx
      .select()
      .from(leagueSeasonSettings)
      .where(
        and(
          eq(leagueSeasonSettings.leagueId, leagueId),
          season === undefined
            ? undefined
            : eq(leagueSeasonSettings.season, season),
        ),
      )
      .orderBy(asc(leagueSeasonSettings.season));
    const rosterRows = await tx
      .select()
      .from(fantasyRosterEntries)
      .where(
        and(
          eq(fantasyRosterEntries.leagueId, leagueId),
          season === undefined
            ? undefined
            : eq(fantasyRosterEntries.season, season),
        ),
      )
      .orderBy(
        asc(fantasyRosterEntries.season),
        asc(fantasyRosterEntries.scoringPeriod),
        asc(fantasyRosterEntries.providerTeamId),
        asc(fantasyRosterEntries.providerPlayerId),
      );
    const breakdownRows = await tx
      .select()
      .from(fantasyPlayerWeekStatBreakdowns)
      .where(
        and(
          eq(fantasyPlayerWeekStatBreakdowns.leagueId, leagueId),
          season === undefined
            ? undefined
            : eq(fantasyPlayerWeekStatBreakdowns.season, season),
        ),
      )
      .orderBy(
        asc(fantasyPlayerWeekStatBreakdowns.season),
        asc(fantasyPlayerWeekStatBreakdowns.scoringPeriod),
        asc(fantasyPlayerWeekStatBreakdowns.providerTeamId),
        asc(fantasyPlayerWeekStatBreakdowns.providerPlayerId),
        asc(fantasyPlayerWeekStatBreakdowns.statSource),
        asc(fantasyPlayerWeekStatBreakdowns.providerStatId),
      );
    const draftRows = await tx
      .select()
      .from(fantasyDraftPicks)
      .where(
        and(
          eq(fantasyDraftPicks.leagueId, leagueId),
          season === undefined
            ? undefined
            : eq(fantasyDraftPicks.season, season),
        ),
      )
      .orderBy(
        asc(fantasyDraftPicks.season),
        asc(fantasyDraftPicks.providerPickId),
      );
    const transactionRows = await tx
      .select()
      .from(fantasyTransactions)
      .where(
        and(
          eq(fantasyTransactions.leagueId, leagueId),
          season === undefined
            ? undefined
            : eq(fantasyTransactions.season, season),
        ),
      )
      .orderBy(
        asc(fantasyTransactions.season),
        asc(fantasyTransactions.providerTransactionId),
      );

    return {
      breakdownRows,
      draftRows,
      matchupRows,
      memberRows,
      playerRows,
      rosterRows,
      settingRows,
      standingRows,
      teamRows,
      transactionRows,
    };
  });
}

async function selectIntegrityCheck(
  leagueId: string,
  checkKey: (typeof dataIntegrityChecks.$inferSelect)["checkKey"],
  season: number | null,
) {
  return withLeagueContext(handle.db, leagueId, async (tx) => {
    const rows = await tx
      .select()
      .from(dataIntegrityChecks)
      .where(
        and(
          eq(dataIntegrityChecks.leagueId, leagueId),
          eq(dataIntegrityChecks.checkKey, checkKey),
          season === null
            ? sql`${dataIntegrityChecks.season} is null`
            : eq(dataIntegrityChecks.season, season),
        ),
      );
    return rows.find((row) => row.status === "fail") ?? rows[0];
  });
}

function makeInconsistentBundle(bundle: NormalizedSeasonBundle): {
  bundle: NormalizedSeasonBundle;
  missingTeamIds: string[];
  orphanStandingTeamId: string;
} {
  const missingMatchup = bundle.matchups[0];
  const firstStanding = bundle.finalStandings?.[0];
  if (!missingMatchup?.awayTeamRef || !firstStanding) {
    throw new Error("generated bundle cannot be made inconsistent");
  }
  const orphanStandingTeamId = `orphan-${bundle.league.season}`;
  return {
    bundle: {
      ...bundle,
      finalStandings: bundle.finalStandings?.map((standing, index) =>
        index === 0
          ? {
              ...standing,
              teamRef: {
                ...standing.teamRef,
                providerId: orphanStandingTeamId,
              },
            }
          : standing,
      ),
      matchups: bundle.matchups.slice(1),
    },
    missingTeamIds: [
      missingMatchup.awayTeamRef.providerId,
      missingMatchup.homeTeamRef.providerId,
    ].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    ),
    orphanStandingTeamId,
  };
}

function updatePlayerCode(
  bundle: NormalizedSeasonBundle,
  kind: Extract<ProviderCodeKind, "position" | "pro_team">,
  code: number,
): NormalizedSeasonBundle {
  const targetPlayerId = bundle.players?.[0]?.providerId;
  if (!targetPlayerId) {
    throw new Error("generated provider-code bundle has no player");
  }
  const update = (player: NormalizedPlayer | undefined) =>
    player?.providerId === targetPlayerId
      ? {
          ...player,
          metadata: {
            ...(player.metadata ?? {}),
            [kind === "position" ? "defaultPositionId" : "proTeamId"]: code,
          },
        }
      : player;

  return {
    ...bundle,
    draftPicks: bundle.draftPicks?.map((pick) => ({
      ...pick,
      player: update(pick.player),
    })),
    players: bundle.players?.map((player) => update(player) ?? player),
    rosters: bundle.rosters?.map((roster) => ({
      ...roster,
      entries: roster.entries.map((entry) => ({
        ...entry,
        player: update(entry.player),
      })),
    })),
  };
}

function withSyntheticUnknownCode(
  bundle: NormalizedSeasonBundle,
  kind: ProviderCodeKind,
  code: number,
): NormalizedSeasonBundle {
  switch (kind) {
    case "activity":
      if (!bundle.transactions[0]) {
        throw new Error("generated provider-code bundle has no transaction");
      }
      return {
        ...bundle,
        transactions: bundle.transactions.map((transaction, index) =>
          index === 0
            ? {
                ...transaction,
                details: {
                  ...transaction.details,
                  rawActivityTypeId: code,
                },
              }
            : transaction,
        ),
      };
    case "lineup_slot":
      return {
        ...bundle,
        league: {
          ...bundle.league,
          rosterSettings: {
            ...(bundle.league.rosterSettings ?? {}),
            lineupSlotCounts: {
              ...(bundle.league.rosterSettings?.lineupSlotCounts ?? {}),
              [String(code)]: 1,
            },
          },
        },
      };
    case "position":
    case "pro_team":
      return updatePlayerCode(bundle, kind, code);
    case "scoring_stat":
      return {
        ...bundle,
        league: {
          ...bundle.league,
          scoringSettings: {
            ...(bundle.league.scoringSettings ?? {}),
            scoringItems: [{ points: 1, statId: code }],
          },
        },
      };
  }
}

function dropLastTeam(bundle: NormalizedSeasonBundle): NormalizedSeasonBundle {
  const droppedTeam = bundle.teams.at(-1);
  if (!droppedTeam) throw new Error("generated bundle has no team to drop");
  const droppedTeamId = droppedTeam.providerId;
  const teams = bundle.teams.filter(
    (team) => team.providerId !== droppedTeamId,
  );
  const retainedMemberIds = new Set(
    teams.flatMap((team) => team.ownerMemberIds),
  );
  const rosters = bundle.rosters?.filter(
    (roster) => roster.teamRef.providerId !== droppedTeamId,
  );
  const draftPicks = bundle.draftPicks?.filter(
    (pick) => pick.teamRef.providerId !== droppedTeamId,
  );
  const retainedPlayerIds = new Set([
    ...(rosters ?? []).flatMap((roster) =>
      roster.entries.map((entry) => entry.playerRef.providerId),
    ),
    ...(draftPicks ?? []).flatMap((pick) =>
      pick.playerRef ? [pick.playerRef.providerId] : [],
    ),
  ]);

  return {
    ...bundle,
    draftPicks,
    finalStandings: bundle.finalStandings?.filter(
      (standing) => standing.teamRef.providerId !== droppedTeamId,
    ),
    league: {
      ...bundle.league,
      postseason: bundle.league.postseason
        ? {
            ...bundle.league.postseason,
            playoffTeamCount: Math.min(
              bundle.league.postseason.playoffTeamCount ?? teams.length,
              teams.length,
            ),
          }
        : undefined,
      size: teams.length,
    },
    matchups: bundle.matchups.filter(
      (matchup) =>
        matchup.homeTeamRef.providerId !== droppedTeamId &&
        matchup.awayTeamRef?.providerId !== droppedTeamId,
    ),
    members: bundle.members.filter((member) =>
      retainedMemberIds.has(member.providerId),
    ),
    players: bundle.players?.filter((player) =>
      retainedPlayerIds.has(player.providerId),
    ),
    rosters,
    teams,
  };
}

async function deletePropertyLeagues(leagueIds: readonly string[]) {
  if (leagueIds.length === 0) return;
  await handle.db.delete(leagues).where(inArray(leagues.id, [...leagueIds]));
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable — start the isolated test database before running properties.",
      { cause },
    );
  }
  await migrateSerialized(handle);
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("normalized ingestion properties", () => {
  it("is idempotent for generated normalized season bundles", async () => {
    await fc.assert(
      fc.asyncProperty(normalizedSeasonShapeArbitrary, async (shape) => {
        const providerLeagueId = `${marker}-idempotent-${shape.caseId}`;
        const bundle = buildNormalizedSeasonBundle(shape, providerLeagueId);
        const leagueId = await insertLeague(bundle);
        try {
          await persistBundle(leagueId, bundle);
          const firstRows = await selectPersistedRows(leagueId);

          const repeated = await persistBundle(leagueId, bundle);
          const secondRows = await selectPersistedRows(leagueId);

          expect(secondRows).toEqual(firstRows);
          expect(repeated).toMatchObject({
            draftPickStats: { changed: 0 },
            finalStandingStats: { changed: 0 },
            leagueSeasonSettingsStats: { changed: 0 },
            matchupStats: { changed: 0 },
            memberStats: { changed: 0 },
            playerStatBreakdownStats: { changed: 0 },
            playerStats: { changed: 0 },
            rosterStats: { changed: 0 },
            teamStats: { changed: 0 },
            transactionStats: { changed: 0 },
          });
        } finally {
          await deletePropertyLeagues([leagueId]);
        }
      }),
      { numRuns: configuredPropertyRuns(), seed: PROPERTY_SEED },
    );
  });

  it("reconciles only the generated target season and league", async () => {
    await fc.assert(
      fc.asyncProperty(normalizedSeasonShapeArbitrary, async (shape) => {
        const otherSeason = shape.season === 2000 ? 2001 : shape.season - 1;
        const primaryProviderLeagueId = `${marker}-scope-primary-${shape.caseId}`;
        const targetBundle = buildNormalizedSeasonBundle(
          shape,
          primaryProviderLeagueId,
        );
        const otherSeasonBundle = buildNormalizedSeasonBundle(
          { ...shape, season: otherSeason },
          primaryProviderLeagueId,
        );
        const otherLeagueBundle = buildNormalizedSeasonBundle(
          { ...shape, caseId: shape.caseId + 1_000_000 },
          `${marker}-scope-secondary-${shape.caseId}`,
        );
        const primaryLeagueId = await insertLeague(targetBundle);
        const otherLeagueId = await insertLeague(otherLeagueBundle);

        try {
          await persistBundle(primaryLeagueId, otherSeasonBundle);
          await persistBundle(primaryLeagueId, targetBundle);
          await persistBundle(otherLeagueId, otherLeagueBundle);
          const otherSeasonBefore = await selectPersistedRows(
            primaryLeagueId,
            otherSeason,
          );
          const otherLeagueBefore = await selectPersistedRows(otherLeagueId);

          const prunedTarget = dropLastTeam(targetBundle);
          await persistBundle(primaryLeagueId, prunedTarget);

          const targetAfter = await selectPersistedRows(
            primaryLeagueId,
            shape.season,
          );
          const otherSeasonAfter = await selectPersistedRows(
            primaryLeagueId,
            otherSeason,
          );
          const otherLeagueAfter = await selectPersistedRows(otherLeagueId);
          expect(targetAfter.teamRows).toHaveLength(shape.leagueSize - 1);
          expect(otherSeasonAfter).toEqual(otherSeasonBefore);
          expect(otherLeagueAfter).toEqual(otherLeagueBefore);
        } finally {
          await deletePropertyLeagues([primaryLeagueId, otherLeagueId]);
        }
      }),
      { numRuns: configuredPropertyRuns(), seed: PROPERTY_SEED + 1 },
    );
  });

  it("persists generated season-scale volume past the bind-parameter cap", async () => {
    await fc.assert(
      fc.asyncProperty(normalizedVolumeSeasonShapeArbitrary, async (shape) => {
        const providerLeagueId = `${marker}-volume-${shape.caseId}`;
        const bundle = buildNormalizedSeasonBundle(shape, providerLeagueId);
        const rosterRowCount =
          bundle.rosters?.reduce(
            (total, roster) => total + roster.entries.length,
            0,
          ) ?? 0;
        const breakdownRowCount =
          bundle.rosters?.reduce(
            (total, roster) =>
              total +
              roster.entries.reduce(
                (entryTotal, entry) =>
                  entryTotal + (entry.statBreakdown?.length ?? 0),
                0,
              ),
            0,
          ) ?? 0;

        expect(rosterRowCount * ROSTER_INSERT_BOUND_COLUMNS).toBeGreaterThan(
          POSTGRES_MAX_BIND_PARAMETERS,
        );
        expect(
          breakdownRowCount * STAT_BREAKDOWN_INSERT_BOUND_COLUMNS,
        ).toBeGreaterThan(POSTGRES_MAX_BIND_PARAMETERS);

        const leagueId = await insertLeague(bundle);
        try {
          const persisted = await persistBundle(leagueId, bundle);
          expect(persisted.rosterStats).toMatchObject({
            changed: rosterRowCount,
            total: rosterRowCount,
          });
          expect(persisted.playerStatBreakdownStats).toMatchObject({
            changed: breakdownRowCount,
            total: breakdownRowCount,
          });

          const counts = await withLeagueContext(
            handle.db,
            leagueId,
            async (tx) => {
              const [rosters] = await tx
                .select({ count: sql<number>`count(*)::int` })
                .from(fantasyRosterEntries)
                .where(eq(fantasyRosterEntries.leagueId, leagueId));
              const [breakdowns] = await tx
                .select({ count: sql<number>`count(*)::int` })
                .from(fantasyPlayerWeekStatBreakdowns)
                .where(eq(fantasyPlayerWeekStatBreakdowns.leagueId, leagueId));
              return {
                breakdowns: breakdowns?.count ?? 0,
                rosters: rosters?.count ?? 0,
              };
            },
          );
          expect(counts).toEqual({
            breakdowns: breakdownRowCount,
            rosters: rosterRowCount,
          });
        } finally {
          await deletePropertyLeagues([leagueId]);
        }
      }),
      { numRuns: configuredPropertyRuns(1), seed: PROPERTY_SEED + 2 },
    );
  });

  it("fails loudly for incomplete schedules and orphan standings", async () => {
    await fc.assert(
      fc.asyncProperty(completePairingShapeArbitrary, async (shape) => {
        const providerLeagueId = `${marker}-loud-${shape.caseId}`;
        const generated = buildNormalizedSeasonBundle(shape, providerLeagueId);
        const malformed = makeInconsistentBundle(generated);
        const leagueId = await insertLeague(malformed.bundle);

        try {
          const persisted = await persistBundle(leagueId, malformed.bundle);
          expect(persisted.matchupStats.total).toBe(
            malformed.bundle.matchups.length,
          );
          expect(persisted.finalStandingStats.total).toBe(
            malformed.bundle.finalStandings?.length,
          );

          await resolveLeagueIdentities(handle.db, { leagueId });
          const integrity = await runDataIntegrityChecks(handle.db, {
            leagueId,
          });
          expect(integrity.failures).toBeGreaterThanOrEqual(2);

          const scheduleCheck = await selectIntegrityCheck(
            leagueId,
            "schedule_coverage",
            shape.season,
          );
          expect(scheduleCheck).toMatchObject({
            status: "fail",
            detail: expect.objectContaining({
              gaps: expect.arrayContaining([
                expect.objectContaining({
                  missingTeamIds: malformed.missingTeamIds,
                  scoringPeriod: 1,
                }),
              ]),
            }),
          });

          const standingsCheck = await selectIntegrityCheck(
            leagueId,
            "standings_parity",
            shape.season,
          );
          expect(standingsCheck).toMatchObject({
            status: "fail",
            detail: expect.objectContaining({
              mismatches: expect.arrayContaining([
                expect.objectContaining({
                  providerTeamId: malformed.orphanStandingTeamId,
                  reason: "missing_identity_mapping",
                }),
              ]),
            }),
          });
        } finally {
          await deletePropertyLeagues([leagueId]);
        }
      }),
      { numRuns: configuredPropertyRuns(), seed: PROPERTY_SEED + 3 },
    );
  });

  it("keeps generated same-season owner overlaps in distinct people", async () => {
    await fc.assert(
      fc.asyncProperty(normalizedSeasonShapeArbitrary, async (generated) => {
        for (const ownerOverlap of OVERLAPPING_OWNER_MODES) {
          const shape = { ...generated, ownerOverlap };
          const providerLeagueId = `${marker}-identity-${shape.caseId}-${ownerOverlap}`;
          const bundle = buildNormalizedSeasonBundle(shape, providerLeagueId);
          const leagueId = await insertLeague(bundle);

          try {
            await persistBundle(leagueId, bundle);
            await resolveLeagueIdentities(handle.db, { leagueId });
            await runDataIntegrityChecks(handle.db, { leagueId });

            const identityRows = await withLeagueContext(
              handle.db,
              leagueId,
              async (tx) => {
                const mappingRows = await tx
                  .select()
                  .from(identityMappings)
                  .where(
                    and(
                      eq(identityMappings.leagueId, leagueId),
                      eq(identityMappings.season, shape.season),
                    ),
                  );
                const teamSeasonRows = await tx
                  .select()
                  .from(teamSeasons)
                  .where(
                    and(
                      eq(teamSeasons.leagueId, leagueId),
                      eq(teamSeasons.season, shape.season),
                    ),
                  );
                const personRows = await tx
                  .select()
                  .from(persons)
                  .where(eq(persons.leagueId, leagueId));
                return { mappingRows, personRows, teamSeasonRows };
              },
            );

            expect(identityRows.teamSeasonRows).toHaveLength(shape.leagueSize);
            expect(identityRows.mappingRows).toHaveLength(shape.leagueSize);
            expect(
              new Set(identityRows.mappingRows.map((row) => row.teamSeasonId))
                .size,
            ).toBe(shape.leagueSize);
            expect(
              new Set(identityRows.mappingRows.map((row) => row.personId)).size,
            ).toBe(shape.leagueSize);
            expect(identityRows.personRows).toHaveLength(shape.leagueSize);

            const identityCheck = await selectIntegrityCheck(
              leagueId,
              "identity_sanity",
              shape.season,
            );
            expect(identityCheck).toMatchObject({
              status: "pass",
              detail: expect.objectContaining({ issues: [] }),
            });
          } finally {
            await deletePropertyLeagues([leagueId]);
          }
        }
      }),
      { numRuns: configuredPropertyRuns(), seed: PROPERTY_SEED + 4 },
    );
  });

  it("fails ESPN decoding for every generated out-of-dictionary code kind", async () => {
    await fc.assert(
      fc.asyncProperty(providerCodeCaseArbitrary, async ({ code, shape }) => {
        for (const kind of PROVIDER_CODE_KINDS) {
          const providerLeagueId = `${marker}-decode-${shape.caseId}-${kind}`;
          const bundle = buildNormalizedSeasonBundle(shape, providerLeagueId);
          const leagueId = await insertLeague(bundle);

          try {
            await persistBundle(leagueId, bundle);
            await runDataIntegrityChecks(handle.db, { leagueId });
            const decodedCheck = await selectIntegrityCheck(
              leagueId,
              "provider_code_decoding",
              null,
            );
            expect(decodedCheck).toMatchObject({
              status: "pass",
              detail: expect.objectContaining({ issues: [] }),
            });

            const unknownBundle = withSyntheticUnknownCode(bundle, kind, code);
            await persistBundle(leagueId, unknownBundle);
            const integrity = await runDataIntegrityChecks(handle.db, {
              leagueId,
            });
            expect(integrity.failures).toBeGreaterThanOrEqual(1);

            const unknownCheck = await selectIntegrityCheck(
              leagueId,
              "provider_code_decoding",
              null,
            );
            expect(unknownCheck).toMatchObject({
              status: "fail",
              detail: expect.objectContaining({
                checkedProviders: ["espn"],
                issues: expect.arrayContaining([
                  { id: code, kind, provider: "espn" },
                ]),
              }),
            });
          } finally {
            await deletePropertyLeagues([leagueId]);
          }
        }
      }),
      { numRuns: configuredPropertyRuns(), seed: PROPERTY_SEED + 5 },
    );
  });
});
