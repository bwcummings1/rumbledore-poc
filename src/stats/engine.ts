import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  championshipRecords,
  dataCoverage,
  dataIntegrityChecks,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  headToHeadRecords,
  identityAuditLog,
  identityMappings,
  leagueDataEdits,
  leagueGroupingSeasons,
  leagueSeasonGroupings,
  leagueSeasonSettings,
  type PersonOwnerHistoryEntry,
  persons,
  providerFinalStandings,
  seasonStatistics,
  statsCalculations,
  teamSeasons,
  weeklyStatistics,
} from "@/db/schema";
import type { NormalizedMatchupKind } from "@/providers";
import { identityNameSimilarity } from "./fuzzy";
import { refreshRecordBookAggregates } from "./records-catalog";

export const RECORD_TYPE_LABELS = {
  best_career_win_percentage: "Best career win %",
  best_luck_season: "Luckiest season",
  best_score_in_loss: "Best score in a loss",
  biggest_blowout: "Biggest blowout",
  fewest_points_against_season: "Fewest points against",
  fewest_points_for_season: "Fewest points for",
  fewest_wins_season: "Fewest wins",
  highest_combined_matchup: "Highest-scoring matchup",
  highest_season_scoring_average: "Highest season average",
  highest_single_week_score: "Highest weekly score",
  longest_loss_streak: "Longest losing streak",
  longest_win_streak: "Longest winning streak",
  lowest_single_week_score: "Lowest weekly score",
  luckiest_career: "Luckiest career",
  most_career_points: "Most career points",
  most_championships: "Most championships",
  most_playoff_appearances: "Most playoff appearances",
  most_points_against_season: "Most points against",
  most_points_for_season: "Most points for",
  most_wins_season: "Most wins",
  narrowest_win: "Narrowest win",
  worst_luck_season: "Unluckiest season",
  worst_score_in_win: "Worst score in a win",
} as const;

export type RecordType = keyof typeof RECORD_TYPE_LABELS;

type TeamSeasonRow = typeof teamSeasons.$inferSelect;
type IdentityMappingRow = typeof identityMappings.$inferSelect;
type ProviderFinalStandingRow = typeof providerFinalStandings.$inferSelect;
type LeagueSeasonSettingsRow = typeof leagueSeasonSettings.$inferSelect;
type DataIntegrityCheckInsert = typeof dataIntegrityChecks.$inferInsert;
type WeeklyResult = "win" | "loss" | "tie";

interface ResolvedIdentityState {
  ownerMemberIds: Set<string>;
  ownerNames: Set<string>;
  ownerSignatures: Set<string>;
  personId: string;
  providerTeamIds: Set<string>;
  seasons: Set<number>;
  teamNames: Set<string>;
}

interface IdentityCandidate {
  confidence: number;
  method: "auto" | "fuzzy";
  personId: string;
  sameProviderSlot: boolean;
}

interface WeeklyFact {
  isBottomScorer: boolean;
  isChampionship: boolean;
  isPlayoff: boolean;
  isTopScorer: boolean;
  leagueId: string;
  margin: number;
  matchupKind: NormalizedMatchupKind;
  matchupId: string;
  opponentPersonId: string;
  personId: string;
  periodStart: number | null;
  pointsAgainst: number;
  pointsFor: number;
  result: WeeklyResult;
  scoringPeriod: number;
  scoringPeriodSpan: number;
  season: number;
  teamSeasonId: string;
  weeklyRank: number;
}

interface SeasonStat {
  allPlayLosses: number;
  allPlayTies: number;
  allPlayWins: number;
  avgPointsAgainst: number;
  avgPointsFor: number;
  currentStreakLength: number;
  currentStreakType: WeeklyResult | null;
  divisionWinner: boolean;
  expectedWins: number;
  computedRank: number;
  finalPlacement: string;
  finalRank: number;
  highestScore: number;
  leagueId: string;
  longestLossStreak: number;
  longestWinStreak: number;
  losses: number;
  lowScoreSortValue: number;
  lowestScore: number;
  luck: number;
  madeChampionship: boolean;
  madePlayoffs: boolean;
  medianPointsAgainst: number;
  medianPointsFor: number;
  personId: string;
  pointDifferential: number;
  playoffSeed: number | null;
  pointsAgainst: number;
  pointsFor: number;
  scoringStdDev: number;
  season: number;
  ties: number;
  winPercentage: number;
  wins: number;
}

interface RecordCandidate {
  holderPersonId: string | null;
  metadata?: Record<string, unknown>;
  opponentPersonId?: string | null;
  scoringPeriod?: number | null;
  season?: number | null;
  sortKey: string;
  value: number;
}

interface RecordEvent extends RecordCandidate {
  recordType: RecordType;
}

interface PostseasonFlags {
  isChampionship: boolean;
  isPlayoff: boolean;
}

interface DataIntegrityCheckDraft {
  checkKey: DataIntegrityCheckInsert["checkKey"];
  detail: Record<string, unknown>;
  season: number | null;
  status: Extract<DataIntegrityCheckInsert["status"], "pass" | "fail">;
}

type StatsCalculationType =
  (typeof statsCalculations.$inferInsert)["calculationType"];

interface StatsCalculationRun {
  id: string;
  startedAtMs: number;
}

interface StatsComputationState {
  h2hRows: HeadToHeadRow[];
  mappingRows: IdentityMappingRow[];
  seasonStats: SeasonStat[];
  weeklyFacts: WeeklyFact[];
}

export interface RecordBrokenHook {
  allTimeRecordId: string;
  holderPersonId: string | null;
  previousRecordId: string;
  recordKey: string;
  recordType: RecordType;
  scoringPeriod: number | null;
  season: number | null;
  value: number;
}

interface ChangedMatchupRecomputeSummary {
  headToHeadRecords: number;
  integrityChecks: number;
  integrityFailures: number;
  recordBookAggregates: number;
  recordBrokenHooks: RecordBrokenHook[];
  records: number;
  seasonStatistics: number;
  seasons: number[];
  targetedPairs: { personAId: string; personBId: string }[];
  weeklyStatistics: number;
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function identityKey(providerTeamId: string, season: number): string {
  return `${providerTeamId}:${season}`;
}

function personPairKey(personAId: string, personBId: string): string {
  const [left, right] = [personAId, personBId].sort(compareStable);
  return `${left}\u001f${right}`;
}

function personPairFromKey(key: string): {
  personAId: string;
  personBId: string;
} {
  const [personAId, personBId] = key.split("\u001f");
  if (!personAId || !personBId) {
    throw new Error("invalid person pair key");
  }
  return { personAId, personBId };
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort(compareStable);
}

function sortedUniqueNumbers(values: Iterable<number>): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right);
}

function ownerSignature(values: readonly string[]): string {
  return sortedUnique(values).join("\u001f");
}

function overlap(left: ReadonlySet<string>, right: readonly string[]): boolean {
  return right.some((value) => left.has(value));
}

function maxNameSimilarity(
  left: Iterable<string>,
  right: Iterable<string>,
): number {
  let best = 0;
  for (const leftValue of left) {
    for (const rightValue of right) {
      best = Math.max(best, identityNameSimilarity(leftValue, rightValue));
    }
  }
  return best;
}

function addTeamSeasonToState(
  state: ResolvedIdentityState,
  teamSeason: TeamSeasonRow,
) {
  state.providerTeamIds.add(teamSeason.providerTeamId);
  state.seasons.add(teamSeason.season);
  state.teamNames.add(teamSeason.teamName);
  if (teamSeason.ownerMemberIds.length > 0) {
    state.ownerSignatures.add(ownerSignature(teamSeason.ownerMemberIds));
  }
  for (const ownerId of teamSeason.ownerMemberIds) {
    state.ownerMemberIds.add(ownerId);
  }
  for (const ownerName of teamSeason.ownerNames) {
    state.ownerNames.add(ownerName);
  }
}

function chooseCandidate(
  teamSeason: TeamSeasonRow,
  states: Iterable<ResolvedIdentityState>,
): IdentityCandidate | null {
  let best: IdentityCandidate | null = null;
  const teamSeasonOwnerMemberIds = sortedUnique(teamSeason.ownerMemberIds);

  for (const state of states) {
    const sameProviderSlot = state.providerTeamIds.has(
      teamSeason.providerTeamId,
    );
    if (state.seasons.has(teamSeason.season) && !sameProviderSlot) {
      continue;
    }

    const hasOwnerOverlap = overlap(
      state.ownerMemberIds,
      teamSeasonOwnerMemberIds,
    );
    const hasExactOwnerSet =
      teamSeasonOwnerMemberIds.length > 0 &&
      state.ownerSignatures.has(ownerSignature(teamSeasonOwnerMemberIds));
    const hasSlotScopedOwnerOverlap = sameProviderSlot && hasOwnerOverlap;
    const hasStrongOwnerMatch = hasExactOwnerSet || hasSlotScopedOwnerOverlap;
    const hasAmbiguousSharedCoOwner = hasOwnerOverlap && !hasStrongOwnerMatch;
    const ownerSimilarity = maxNameSimilarity(
      state.ownerNames,
      teamSeason.ownerNames,
    );
    const teamSimilarity = maxNameSimilarity(state.teamNames, [
      teamSeason.teamName,
    ]);
    const bothHaveOwnerIds =
      state.ownerMemberIds.size > 0 && teamSeason.ownerMemberIds.length > 0;

    let confidence = 0;
    let method: IdentityCandidate["method"] = "fuzzy";

    if (hasStrongOwnerMatch) {
      confidence = 1;
      method = "auto";
    } else if (
      sameProviderSlot &&
      (!bothHaveOwnerIds || ownerSimilarity >= 0.85)
    ) {
      confidence = Math.max(0.86, ownerSimilarity * 0.7 + teamSimilarity * 0.3);
      method = "auto";
    } else if (hasAmbiguousSharedCoOwner) {
      // Shared co-owners are common in Sleeper; a partial overlap across
      // different team slots is not enough evidence to merge franchises.
      confidence = Math.min(0.59, teamSimilarity * 0.5);
    } else {
      confidence =
        ownerSimilarity > 0
          ? ownerSimilarity * 0.7 + teamSimilarity * 0.3
          : teamSimilarity * 0.5;
      method = confidence >= 0.85 ? "auto" : "fuzzy";
    }

    const candidate = {
      confidence: round(Math.min(1, Math.max(0, confidence)), 4),
      method,
      personId: state.personId,
      sameProviderSlot,
    };

    if (
      !best ||
      candidate.confidence > best.confidence ||
      (candidate.confidence === best.confidence &&
        candidate.sameProviderSlot &&
        !best.sameProviderSlot) ||
      (candidate.confidence === best.confidence &&
        candidate.sameProviderSlot === best.sameProviderSlot &&
        compareStable(candidate.personId, best.personId) < 0)
    ) {
      best = candidate;
    }
  }

  return best;
}

function canonicalNameFor(teamSeason: TeamSeasonRow): string {
  return teamSeason.ownerNames[0] ?? teamSeason.teamName;
}

async function loadTeamSeasonFacts(tx: LeagueScopedTx, leagueId: string) {
  const teams = await tx
    .select({
      division: fantasyTeams.division,
      fantasyTeamId: fantasyTeams.id,
      leagueProviderId: fantasyTeams.leagueProviderId,
      name: fantasyTeams.name,
      ownerMemberIds: fantasyTeams.ownerMemberIds,
      provider: fantasyTeams.provider,
      providerTeamId: fantasyTeams.providerTeamId,
      season: fantasyTeams.season,
    })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.leagueId, leagueId))
    .orderBy(asc(fantasyTeams.season), asc(fantasyTeams.providerTeamId));

  const members = await tx
    .select({
      displayName: fantasyMembers.displayName,
      providerMemberId: fantasyMembers.providerMemberId,
      season: fantasyMembers.season,
    })
    .from(fantasyMembers)
    .where(eq(fantasyMembers.leagueId, leagueId));

  const memberNamesBySeason = new Map<string, string>();
  for (const member of members) {
    memberNamesBySeason.set(
      `${member.season}:${member.providerMemberId}`,
      member.displayName,
    );
  }

  return teams.map((team) => {
    const ownerMemberIds = sortedUnique(team.ownerMemberIds);
    const ownerNames = sortedUnique(
      ownerMemberIds
        .map((ownerId) => memberNamesBySeason.get(`${team.season}:${ownerId}`))
        .filter((name): name is string => Boolean(name)),
    );

    return {
      fantasyTeamId: team.fantasyTeamId,
      leagueId,
      leagueProviderId: team.leagueProviderId,
      division: team.division,
      ownerMemberIds,
      ownerNames,
      provider: team.provider,
      providerTeamId: team.providerTeamId,
      season: team.season,
      teamName: team.name,
    };
  });
}

async function upsertTeamSeasonFacts(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<TeamSeasonRow[]> {
  const facts = await loadTeamSeasonFacts(tx, leagueId);
  if (facts.length > 0) {
    await tx
      .insert(teamSeasons)
      .values(facts)
      .onConflictDoUpdate({
        target: [
          teamSeasons.leagueId,
          teamSeasons.provider,
          teamSeasons.providerTeamId,
          teamSeasons.season,
        ],
        set: {
          fantasyTeamId: sql`excluded.fantasy_team_id`,
          division: sql`excluded.division`,
          leagueProviderId: sql`excluded.league_provider_id`,
          ownerMemberIds: sql`excluded.owner_member_ids`,
          ownerNames: sql`excluded.owner_names`,
          teamName: sql`excluded.team_name`,
          updatedAt: sql`now()`,
        },
      });
  }

  return tx
    .select()
    .from(teamSeasons)
    .where(eq(teamSeasons.leagueId, leagueId))
    .orderBy(asc(teamSeasons.season), asc(teamSeasons.providerTeamId));
}

function buildOwnerHistory(
  mappedSeasons: readonly TeamSeasonRow[],
): PersonOwnerHistoryEntry[] {
  const history: PersonOwnerHistoryEntry[] = [];

  for (const teamSeason of [...mappedSeasons].sort(
    (left, right) =>
      left.season - right.season ||
      compareStable(left.providerTeamId, right.providerTeamId),
  )) {
    const providerMemberIds = sortedUnique(teamSeason.ownerMemberIds);
    const ownerNames = sortedUnique(
      teamSeason.ownerNames.length > 0 ? teamSeason.ownerNames : ["Unknown"],
    );
    const currentKey = `${providerMemberIds.join(",")}|${ownerNames.join(",")}`;
    const previous = history.at(-1);
    const previousKey = previous
      ? `${previous.providerMemberIds.join(",")}|${previous.ownerNames.join(",")}`
      : null;

    if (previous && previousKey === currentKey) {
      previous.endSeason = teamSeason.season;
      continue;
    }

    if (previous?.endSeason === null) {
      previous.endSeason = teamSeason.season - 1;
    }
    history.push({
      endSeason: null,
      ownerNames,
      providerMemberIds,
      startSeason: teamSeason.season,
    });
  }

  return history;
}

async function refreshOwnerHistory({
  mappings,
  teamSeasonById,
  tx,
}: {
  mappings: readonly IdentityMappingRow[];
  teamSeasonById: ReadonlyMap<string, TeamSeasonRow>;
  tx: LeagueScopedTx;
}) {
  const seasonsByPersonId = new Map<string, TeamSeasonRow[]>();
  for (const mapping of mappings) {
    const teamSeason = teamSeasonById.get(mapping.teamSeasonId);
    if (!teamSeason) {
      continue;
    }
    const existing = seasonsByPersonId.get(mapping.personId) ?? [];
    existing.push(teamSeason);
    seasonsByPersonId.set(mapping.personId, existing);
  }

  for (const [personId, mappedSeasons] of seasonsByPersonId) {
    await tx
      .update(persons)
      .set({
        ownerHistory: buildOwnerHistory(mappedSeasons),
        updatedAt: new Date(),
      })
      .where(eq(persons.id, personId));
  }
}

export async function resolveLeagueIdentities(
  db: Db,
  input: { leagueId: string },
): Promise<{ mappings: number; persons: number; teamSeasons: number }> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const seasonRows = await upsertTeamSeasonFacts(tx, input.leagueId);
    const personRows = await tx
      .select()
      .from(persons)
      .where(eq(persons.leagueId, input.leagueId));
    const existingMappings = await tx
      .select()
      .from(identityMappings)
      .where(eq(identityMappings.leagueId, input.leagueId));

    const teamSeasonById = new Map(seasonRows.map((row) => [row.id, row]));
    const mappingByTeamSeasonId = new Map(
      existingMappings.map((mapping) => [mapping.teamSeasonId, mapping]),
    );
    const states = new Map<string, ResolvedIdentityState>();

    for (const person of personRows) {
      states.set(person.id, {
        ownerMemberIds: new Set(),
        ownerNames: new Set(),
        ownerSignatures: new Set(),
        personId: person.id,
        providerTeamIds: new Set(),
        seasons: new Set(),
        teamNames: new Set(),
      });
    }

    for (const mapping of existingMappings) {
      const teamSeason = teamSeasonById.get(mapping.teamSeasonId);
      const state = states.get(mapping.personId);
      if (teamSeason && state) {
        addTeamSeasonToState(state, teamSeason);
      }
    }

    let createdPersons = 0;
    let changedMappings = 0;

    for (const teamSeason of seasonRows) {
      const existing = mappingByTeamSeasonId.get(teamSeason.id);
      if (existing) {
        continue;
      }

      const candidate = chooseCandidate(teamSeason, states.values());
      let personId = candidate?.personId;
      let confidence = candidate?.confidence ?? 0;
      let method = candidate?.method ?? "auto";

      if (!candidate || candidate.confidence < 0.6 || !personId) {
        const [created] = await tx
          .insert(persons)
          .values({
            canonicalName: canonicalNameFor(teamSeason),
            leagueId: input.leagueId,
          })
          .returning();
        if (!created) {
          throw new Error("person identity was not created");
        }
        personId = created.id;
        confidence = 1;
        method = "auto";
        createdPersons += 1;
        states.set(personId, {
          ownerMemberIds: new Set(),
          ownerNames: new Set(),
          ownerSignatures: new Set(),
          personId,
          providerTeamIds: new Set(),
          seasons: new Set(),
          teamNames: new Set(),
        });
        await tx.insert(identityAuditLog).values({
          action: "create",
          afterState: {
            canonicalName: created.canonicalName,
            teamSeasonId: teamSeason.id,
          },
          leagueId: input.leagueId,
          personId,
          reason: "automatic identity creation",
          teamSeasonId: teamSeason.id,
        });
      }

      const [mapping] = await tx
        .insert(identityMappings)
        .values({
          confidence,
          leagueId: input.leagueId,
          leagueProviderId: teamSeason.leagueProviderId,
          method,
          personId,
          provider: teamSeason.provider,
          providerTeamId: teamSeason.providerTeamId,
          season: teamSeason.season,
          teamSeasonId: teamSeason.id,
        })
        .returning();
      if (!mapping) {
        throw new Error("identity mapping was not created");
      }
      changedMappings += 1;
      mappingByTeamSeasonId.set(teamSeason.id, mapping);
      const state = states.get(personId);
      if (!state) {
        throw new Error("identity state was not initialized");
      }
      addTeamSeasonToState(state, teamSeason);
    }

    const finalMappings = await tx
      .select()
      .from(identityMappings)
      .where(eq(identityMappings.leagueId, input.leagueId));
    await refreshOwnerHistory({
      mappings: finalMappings,
      teamSeasonById,
      tx,
    });

    return {
      mappings: finalMappings.length,
      persons: personRows.length + createdPersons,
      teamSeasons: seasonRows.length + changedMappings * 0,
    };
  });
}

function toWeeklyResult(
  pointsFor: number,
  pointsAgainst: number,
): WeeklyResult {
  if (pointsFor > pointsAgainst) {
    return "win";
  }
  if (pointsFor < pointsAgainst) {
    return "loss";
  }
  return "tie";
}

async function loadFinalMatchups(tx: LeagueScopedTx, leagueId: string) {
  return tx
    .select({
      awayScore: fantasyMatchups.awayScore,
      awayTeamProviderId: fantasyMatchups.awayTeamProviderId,
      homeScore: fantasyMatchups.homeScore,
      homeTeamProviderId: fantasyMatchups.homeTeamProviderId,
      id: fantasyMatchups.id,
      kind: fantasyMatchups.kind,
      periodStart: fantasyMatchups.periodStart,
      scoringPeriod: fantasyMatchups.scoringPeriod,
      scoringPeriodSpan: fantasyMatchups.scoringPeriodSpan,
      season: fantasyMatchups.season,
      status: fantasyMatchups.status,
    })
    .from(fantasyMatchups)
    .where(
      and(
        eq(fantasyMatchups.leagueId, leagueId),
        eq(fantasyMatchups.status, "final"),
      ),
    )
    .orderBy(
      asc(fantasyMatchups.season),
      asc(fantasyMatchups.scoringPeriod),
      asc(fantasyMatchups.providerMatchupId),
    );
}

async function loadProviderFinalStandings(
  tx: LeagueScopedTx,
  leagueId: string,
) {
  return tx
    .select()
    .from(providerFinalStandings)
    .where(eq(providerFinalStandings.leagueId, leagueId));
}

async function loadLeagueSeasonSettings(tx: LeagueScopedTx, leagueId: string) {
  return tx
    .select()
    .from(leagueSeasonSettings)
    .where(eq(leagueSeasonSettings.leagueId, leagueId));
}

function rankWeeklyFacts(facts: WeeklyFact[]): WeeklyFact[] {
  const byWeek = new Map<string, WeeklyFact[]>();
  for (const fact of facts) {
    const key = `${fact.season}:${fact.periodStart ?? fact.scoringPeriod}`;
    const weekly = byWeek.get(key) ?? [];
    weekly.push(fact);
    byWeek.set(key, weekly);
  }

  for (const weekly of byWeek.values()) {
    const scoreByPerson = new Map<string, number>();
    for (const fact of weekly) {
      scoreByPerson.set(
        fact.personId,
        Math.max(scoreByPerson.get(fact.personId) ?? -Infinity, fact.pointsFor),
      );
    }
    const sorted = [...scoreByPerson.entries()].sort(
      (left, right) => right[1] - left[1] || compareStable(left[0], right[0]),
    );
    const maxScore = sorted[0]?.[1];
    const minScore = sorted.at(-1)?.[1];
    const rankByPerson = new Map(
      sorted.map(([personId], index) => [personId, index + 1] as const),
    );
    for (const fact of weekly) {
      const score = scoreByPerson.get(fact.personId);
      fact.weeklyRank = rankByPerson.get(fact.personId) ?? 0;
      fact.isTopScorer = score === maxScore;
      fact.isBottomScorer = score === minScore;
    }
  }

  return facts;
}

function standingsBySeason(
  standings: readonly ProviderFinalStandingRow[],
): Map<number, ProviderFinalStandingRow[]> {
  const bySeason = new Map<number, ProviderFinalStandingRow[]>();
  for (const standing of standings) {
    bySeason.set(standing.season, [
      ...(bySeason.get(standing.season) ?? []),
      standing,
    ]);
  }
  return bySeason;
}

function settingsBySeason(
  settings: readonly LeagueSeasonSettingsRow[],
): Map<number, LeagueSeasonSettingsRow> {
  return new Map(settings.map((row) => [row.season, row]));
}

function rankedTeams(
  standings: readonly ProviderFinalStandingRow[],
): ProviderFinalStandingRow[] {
  return [...standings]
    .filter((standing) => standing.finalRank > 0)
    .sort(
      (left, right) =>
        left.finalRank - right.finalRank ||
        compareStable(left.providerTeamId, right.providerTeamId),
    );
}

function playoffTeamIdsForSeason({
  settings,
  standings,
}: {
  settings?: LeagueSeasonSettingsRow;
  standings: readonly ProviderFinalStandingRow[];
}): Set<string> {
  const ranked = rankedTeams(standings);
  const seeded = standings.filter(
    (standing) => (standing.playoffSeed ?? 0) > 0,
  );
  const playoffTeamCount = settings?.playoffTeamCount;
  if (seeded.length > 0) {
    const ids = new Set(seeded.map((standing) => standing.providerTeamId));
    for (const standing of ranked.slice(0, playoffTeamCount ?? seeded.length)) {
      ids.add(standing.providerTeamId);
    }
    return ids;
  }

  const fallbackPlayoffTeamCount =
    playoffTeamCount ??
    (ranked.length > 1 ? Math.ceil(ranked.length / 2) : ranked.length);
  return new Set(
    ranked
      .slice(0, Math.max(0, fallbackPlayoffTeamCount))
      .map((standing) => standing.providerTeamId),
  );
}

function hasPlayoffField({
  awayTeamProviderId,
  homeTeamProviderId,
  playoffTeamIds,
}: {
  awayTeamProviderId: string;
  homeTeamProviderId: string;
  playoffTeamIds: ReadonlySet<string>;
}): boolean {
  return (
    playoffTeamIds.size === 0 ||
    (playoffTeamIds.has(homeTeamProviderId) &&
      playoffTeamIds.has(awayTeamProviderId))
  );
}

function championshipMatchupIdForSeason({
  matchups,
  settings,
  standings,
}: {
  matchups: Awaited<ReturnType<typeof loadFinalMatchups>>;
  settings?: LeagueSeasonSettingsRow;
  standings: readonly ProviderFinalStandingRow[];
}): string | null {
  const ranked = rankedTeams(standings);
  const champion = ranked[0]?.providerTeamId;
  const runnerUp = ranked[1]?.providerTeamId;
  if (!champion || !runnerUp) {
    return null;
  }
  if (
    !settings?.championshipScoringPeriod &&
    !settings?.playoffStartScoringPeriod
  ) {
    return null;
  }

  const candidates = matchups.filter((matchup) => {
    if (matchup.kind !== "head_to_head") {
      return false;
    }
    const teams = [matchup.homeTeamProviderId, matchup.awayTeamProviderId];
    const inKnownPostseason =
      !settings?.playoffStartScoringPeriod ||
      matchup.scoringPeriod >= settings.playoffStartScoringPeriod;
    return (
      teams.includes(champion) && teams.includes(runnerUp) && inKnownPostseason
    );
  });
  const preferredPeriod = settings?.championshipScoringPeriod;
  const preferred = preferredPeriod
    ? candidates.filter((matchup) => matchup.scoringPeriod === preferredPeriod)
    : candidates;
  const sorted = [...(preferred.length > 0 ? preferred : candidates)].sort(
    (left, right) =>
      right.scoringPeriod - left.scoringPeriod ||
      compareStable(left.id, right.id),
  );

  return sorted[0]?.id ?? null;
}

function postseasonFlagsByMatchupId({
  matchups,
  seasonSettings,
  standings,
}: {
  matchups: Awaited<ReturnType<typeof loadFinalMatchups>>;
  seasonSettings: readonly LeagueSeasonSettingsRow[];
  standings: readonly ProviderFinalStandingRow[];
}): Map<string, PostseasonFlags> {
  const standingsMap = standingsBySeason(standings);
  const settingsMap = settingsBySeason(seasonSettings);
  const seasons = new Set(matchups.map((matchup) => matchup.season));
  const flags = new Map<string, PostseasonFlags>();

  for (const season of seasons) {
    const seasonMatchups = matchups.filter(
      (matchup) => matchup.season === season,
    );
    const settings = settingsMap.get(season);
    const seasonStandings = standingsMap.get(season) ?? [];
    const playoffTeamIds = playoffTeamIdsForSeason({
      settings,
      standings: seasonStandings,
    });
    const championshipMatchupId = championshipMatchupIdForSeason({
      matchups: seasonMatchups,
      settings,
      standings: seasonStandings,
    });
    const playoffStart = settings?.playoffStartScoringPeriod ?? null;
    const championshipPeriod =
      settings?.championshipScoringPeriod ??
      seasonMatchups.find((matchup) => matchup.id === championshipMatchupId)
        ?.scoringPeriod ??
      null;

    for (const matchup of seasonMatchups) {
      const isChampionship = matchup.id === championshipMatchupId;
      const inPostseasonWindow =
        playoffStart !== null
          ? matchup.scoringPeriod >= playoffStart &&
            (championshipPeriod === null ||
              matchup.scoringPeriod <= championshipPeriod)
          : isChampionship;
      const isPlayoff =
        isChampionship ||
        (inPostseasonWindow &&
          hasPlayoffField({
            awayTeamProviderId: matchup.awayTeamProviderId,
            homeTeamProviderId: matchup.homeTeamProviderId,
            playoffTeamIds,
          }));

      flags.set(matchup.id, { isChampionship, isPlayoff });
    }
  }

  return flags;
}

function buildWeeklyFacts({
  leagueId,
  mappings,
  matchups,
  postseasonFlags,
  teamSeasonByIdentity,
}: {
  leagueId: string;
  mappings: readonly IdentityMappingRow[];
  matchups: Awaited<ReturnType<typeof loadFinalMatchups>>;
  postseasonFlags: ReadonlyMap<string, PostseasonFlags>;
  teamSeasonByIdentity: ReadonlyMap<string, TeamSeasonRow>;
}): WeeklyFact[] {
  const mappingByIdentity = new Map(
    mappings.map((mapping) => [
      identityKey(mapping.providerTeamId, mapping.season),
      mapping,
    ]),
  );
  const facts: WeeklyFact[] = [];

  for (const matchup of matchups) {
    const homeMapping = mappingByIdentity.get(
      identityKey(matchup.homeTeamProviderId, matchup.season),
    );
    const awayMapping = mappingByIdentity.get(
      identityKey(matchup.awayTeamProviderId, matchup.season),
    );
    if (!homeMapping || !awayMapping) {
      continue;
    }
    const homeTeamSeason = teamSeasonByIdentity.get(
      identityKey(matchup.homeTeamProviderId, matchup.season),
    );
    const awayTeamSeason = teamSeasonByIdentity.get(
      identityKey(matchup.awayTeamProviderId, matchup.season),
    );
    if (!homeTeamSeason || !awayTeamSeason) {
      continue;
    }

    const homeScore = round(matchup.homeScore, 2);
    const awayScore = round(matchup.awayScore, 2);
    const scoringPeriodSpan = Math.max(1, matchup.scoringPeriodSpan ?? 1);
    const periodStart = matchup.periodStart ?? matchup.scoringPeriod;
    const flags = postseasonFlags.get(matchup.id) ?? {
      isChampionship: false,
      isPlayoff: false,
    };
    facts.push({
      isBottomScorer: false,
      isChampionship: flags.isChampionship,
      isPlayoff: flags.isPlayoff,
      isTopScorer: false,
      leagueId,
      margin: round(homeScore - awayScore, 2),
      matchupKind: matchup.kind,
      matchupId: matchup.id,
      opponentPersonId: awayMapping.personId,
      personId: homeMapping.personId,
      periodStart,
      pointsAgainst: awayScore,
      pointsFor: homeScore,
      result: toWeeklyResult(homeScore, awayScore),
      scoringPeriod: matchup.scoringPeriod,
      scoringPeriodSpan,
      season: matchup.season,
      teamSeasonId: homeTeamSeason.id,
      weeklyRank: 0,
    });
    facts.push({
      isBottomScorer: false,
      isChampionship: flags.isChampionship,
      isPlayoff: flags.isPlayoff,
      isTopScorer: false,
      leagueId,
      margin: round(awayScore - homeScore, 2),
      matchupKind: matchup.kind,
      matchupId: matchup.id,
      opponentPersonId: homeMapping.personId,
      personId: awayMapping.personId,
      periodStart,
      pointsAgainst: homeScore,
      pointsFor: awayScore,
      result: toWeeklyResult(awayScore, homeScore),
      scoringPeriod: matchup.scoringPeriod,
      scoringPeriodSpan,
      season: matchup.season,
      teamSeasonId: awayTeamSeason.id,
      weeklyRank: 0,
    });
  }

  return rankWeeklyFacts(facts);
}

interface OfficialSeasonPlacement {
  divisionWinner: boolean;
  finalRank: number;
  playoffSeed: number | null;
}

function officialPlacementsByPersonSeason({
  mappings,
  standings,
}: {
  mappings: readonly IdentityMappingRow[];
  standings: readonly ProviderFinalStandingRow[];
}): Map<string, OfficialSeasonPlacement> {
  const mappingByIdentity = new Map(
    mappings.map((mapping) => [
      identityKey(mapping.providerTeamId, mapping.season),
      mapping,
    ]),
  );
  const placements = new Map<string, OfficialSeasonPlacement>();
  const divisionWinners = new Set<string>();
  const standingsByDivision = new Map<string, ProviderFinalStandingRow[]>();

  for (const standing of standings) {
    if (!standing.division) {
      continue;
    }
    const key = `${standing.season}:${standing.division}`;
    standingsByDivision.set(key, [
      ...(standingsByDivision.get(key) ?? []),
      standing,
    ]);
  }

  for (const rows of standingsByDivision.values()) {
    const explicitWinners = rows.filter(
      (standing) => standing.divisionWinner || standing.divisionRank === 1,
    );
    const winners =
      explicitWinners.length > 0
        ? explicitWinners
        : [...rows]
            .filter((standing) => standing.finalRank > 0)
            .sort(
              (left, right) =>
                left.finalRank - right.finalRank ||
                compareStable(left.providerTeamId, right.providerTeamId),
            )
            .slice(0, 1);
    for (const winner of winners) {
      divisionWinners.add(identityKey(winner.providerTeamId, winner.season));
    }
  }

  for (const standing of standings) {
    const mapping = mappingByIdentity.get(
      identityKey(standing.providerTeamId, standing.season),
    );
    if (!mapping || standing.finalRank <= 0) {
      continue;
    }

    const key = `${mapping.personId}:${standing.season}`;
    const existing = placements.get(key);
    if (!existing || standing.finalRank < existing.finalRank) {
      placements.set(key, {
        divisionWinner: divisionWinners.has(
          identityKey(standing.providerTeamId, standing.season),
        ),
        finalRank: standing.finalRank,
        playoffSeed: standing.playoffSeed,
      });
    }
  }

  return placements;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function buildSeasonStats(
  facts: readonly WeeklyFact[],
  leagueId: string,
  officialPlacements = new Map<string, OfficialSeasonPlacement>(),
): SeasonStat[] {
  const byTeamSeason = new Map<string, WeeklyFact[]>();
  const byWeek = new Map<string, WeeklyFact[]>();

  for (const fact of facts) {
    const teamKey = `${fact.personId}:${fact.season}`;
    byTeamSeason.set(teamKey, [...(byTeamSeason.get(teamKey) ?? []), fact]);
    const weekKey = `${fact.season}:${fact.scoringPeriod}`;
    byWeek.set(weekKey, [...(byWeek.get(weekKey) ?? []), fact]);
  }

  const allPlay = new Map<
    string,
    { expectedWins: number; losses: number; ties: number; wins: number }
  >();
  for (const weeklyFacts of byWeek.values()) {
    const scoringFactsByPerson = new Map<string, WeeklyFact>();
    for (const fact of weeklyFacts) {
      const existing = scoringFactsByPerson.get(fact.personId);
      if (
        !existing ||
        (existing.matchupKind !== "head_to_head" &&
          fact.matchupKind === "head_to_head") ||
        (existing.matchupKind === fact.matchupKind &&
          compareStable(fact.matchupId, existing.matchupId) < 0)
      ) {
        scoringFactsByPerson.set(fact.personId, fact);
      }
    }
    const scoringFacts = [...scoringFactsByPerson.values()];

    for (const fact of scoringFacts) {
      const key = `${fact.personId}:${fact.season}`;
      const entry = allPlay.get(key) ?? {
        expectedWins: 0,
        losses: 0,
        ties: 0,
        wins: 0,
      };
      const opponents = scoringFacts.filter(
        (other) => other.personId !== fact.personId,
      );
      let weekWins = 0;
      for (const opponent of opponents) {
        if (fact.pointsFor > opponent.pointsFor) {
          entry.wins += 1;
          weekWins += 1;
        } else if (fact.pointsFor < opponent.pointsFor) {
          entry.losses += 1;
        } else {
          entry.ties += 1;
        }
      }
      entry.expectedWins +=
        opponents.length > 0 ? weekWins / opponents.length : 0;
      allPlay.set(key, entry);
    }
  }

  const seasonRows: SeasonStat[] = [];
  for (const [teamKey, teamFacts] of byTeamSeason) {
    const sorted = [...teamFacts].sort(
      (left, right) =>
        left.scoringPeriod - right.scoringPeriod ||
        compareStable(left.matchupId, right.matchupId),
    );
    const [personId, seasonRaw] = teamKey.split(":");
    const season = Number(seasonRaw);
    const games = sorted.length;
    const scoringPeriods = sorted.reduce(
      (sum, fact) => sum + Math.max(1, fact.scoringPeriodSpan),
      0,
    );
    const wins = sorted.filter((fact) => fact.result === "win").length;
    const losses = sorted.filter((fact) => fact.result === "loss").length;
    const ties = sorted.filter((fact) => fact.result === "tie").length;
    const pointsFor = round(
      sorted.reduce((sum, fact) => sum + fact.pointsFor, 0),
      2,
    );
    const pointsAgainst = round(
      sorted.reduce((sum, fact) => sum + fact.pointsAgainst, 0),
      2,
    );
    const scoresFor = sorted.map((fact) => fact.pointsFor);
    const scoresAgainst = sorted.map((fact) => fact.pointsAgainst);
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let currentStreakType: WeeklyResult | null = null;
    let currentStreakLength = 0;

    for (const fact of sorted) {
      if (fact.result === currentStreakType) {
        currentStreakLength += 1;
      } else {
        currentStreakType = fact.result;
        currentStreakLength = 1;
      }
      if (fact.result === "win") {
        longestWinStreak = Math.max(longestWinStreak, currentStreakLength);
      }
      if (fact.result === "loss") {
        longestLossStreak = Math.max(longestLossStreak, currentStreakLength);
      }
    }

    const allPlayRow = allPlay.get(teamKey) ?? {
      expectedWins: 0,
      losses: 0,
      ties: 0,
      wins: 0,
    };
    const expectedWins = round(allPlayRow.expectedWins, 4);
    const lowestScore =
      scoresFor.filter((score) => score > 0).sort((a, b) => a - b)[0] ?? 0;
    seasonRows.push({
      allPlayLosses: allPlayRow.losses,
      allPlayTies: allPlayRow.ties,
      allPlayWins: allPlayRow.wins,
      avgPointsAgainst: round(pointsAgainst / Math.max(1, scoringPeriods), 2),
      avgPointsFor: round(pointsFor / Math.max(1, scoringPeriods), 2),
      currentStreakLength,
      currentStreakType,
      divisionWinner: false,
      expectedWins,
      computedRank: 0,
      finalPlacement: "out",
      finalRank: 0,
      highestScore: round(Math.max(...scoresFor), 2),
      leagueId,
      longestLossStreak,
      longestWinStreak,
      losses,
      lowScoreSortValue: lowestScore,
      lowestScore: round(lowestScore, 2),
      luck: round(wins - expectedWins, 4),
      madeChampionship: false,
      madePlayoffs: false,
      medianPointsAgainst: round(median(scoresAgainst), 2),
      medianPointsFor: round(median(scoresFor), 2),
      personId,
      pointDifferential: round(pointsFor - pointsAgainst, 2),
      playoffSeed: null,
      pointsAgainst,
      pointsFor,
      scoringStdDev: round(standardDeviation(scoresFor), 4),
      season,
      ties,
      winPercentage: round(games > 0 ? (wins + ties * 0.5) / games : 0, 4),
      wins,
    });
  }

  const rowsBySeason = new Map<number, SeasonStat[]>();
  for (const row of seasonRows) {
    rowsBySeason.set(row.season, [
      ...(rowsBySeason.get(row.season) ?? []),
      row,
    ]);
  }
  for (const rows of rowsBySeason.values()) {
    const sorted = [...rows].sort(
      (left, right) =>
        right.wins - left.wins ||
        left.losses - right.losses ||
        right.ties - left.ties ||
        right.pointsFor - left.pointsFor ||
        left.pointsAgainst - right.pointsAgainst ||
        compareStable(left.personId, right.personId),
    );
    const playoffCut = sorted.length > 1 ? Math.ceil(sorted.length / 2) : 1;
    for (const [index, row] of sorted.entries()) {
      row.computedRank = index + 1;
      const official = officialPlacements.get(`${row.personId}:${row.season}`);
      const finalRank = official?.finalRank ?? row.computedRank;
      row.finalRank = finalRank;
      row.divisionWinner = official?.divisionWinner ?? false;
      row.playoffSeed = official?.playoffSeed ?? null;
      row.madePlayoffs =
        row.playoffSeed !== null
          ? row.playoffSeed > 0
          : finalRank <= playoffCut;
      row.madeChampionship = finalRank <= 2;
      row.finalPlacement =
        finalRank === 1
          ? "champ"
          : finalRank === 2
            ? "runner_up"
            : finalRank === 3
              ? "third"
              : "out";
    }
  }

  return seasonRows;
}

interface HeadToHeadRow {
  championshipMeetings: number;
  currentStreakLength: number;
  currentStreakPersonId: string | null;
  lastScoringPeriod: number | null;
  lastSeason: number | null;
  leagueId: string;
  longestStreakLength: number;
  longestStreakPersonId: string | null;
  meetings: number;
  personAHighestScore: number;
  personAId: string;
  personAPoints: number;
  personAWins: number;
  personBHighestScore: number;
  personBId: string;
  personBPoints: number;
  personBWins: number;
  playoffMeetings: number;
  season: number;
  ties: number;
}

function headToHeadRows(
  facts: readonly WeeklyFact[],
  leagueId: string,
): HeadToHeadRow[] {
  const groups = new Map<string, WeeklyFact[]>();

  for (const fact of facts) {
    if (fact.matchupKind !== "head_to_head") {
      continue;
    }
    if (compareStable(fact.personId, fact.opponentPersonId) > 0) {
      continue;
    }
    const pair = [fact.personId, fact.opponentPersonId].sort(compareStable);
    for (const season of [0, fact.season]) {
      const key = `${season}:${pair[0]}:${pair[1]}`;
      groups.set(key, [...(groups.get(key) ?? []), fact]);
    }
  }

  const rows: HeadToHeadRow[] = [];
  for (const [key, meetings] of groups) {
    const [seasonRaw, personAId, personBId] = key.split(":");
    const sorted = [...meetings].sort(
      (left, right) =>
        left.season - right.season ||
        left.scoringPeriod - right.scoringPeriod ||
        compareStable(left.matchupId, right.matchupId),
    );
    const row: HeadToHeadRow = {
      championshipMeetings: 0,
      currentStreakLength: 0,
      currentStreakPersonId: null,
      lastScoringPeriod: null,
      lastSeason: null,
      leagueId,
      longestStreakLength: 0,
      longestStreakPersonId: null,
      meetings: 0,
      personAHighestScore: 0,
      personAId,
      personAPoints: 0,
      personAWins: 0,
      personBHighestScore: 0,
      personBId,
      personBPoints: 0,
      personBWins: 0,
      playoffMeetings: 0,
      season: Number(seasonRaw),
      ties: 0,
    };

    for (const meeting of sorted) {
      const personAScore =
        meeting.personId === personAId
          ? meeting.pointsFor
          : meeting.pointsAgainst;
      const personBScore =
        meeting.personId === personAId
          ? meeting.pointsAgainst
          : meeting.pointsFor;
      row.meetings += 1;
      row.personAPoints = round(row.personAPoints + personAScore, 2);
      row.personBPoints = round(row.personBPoints + personBScore, 2);
      row.personAHighestScore = Math.max(row.personAHighestScore, personAScore);
      row.personBHighestScore = Math.max(row.personBHighestScore, personBScore);
      row.playoffMeetings += meeting.isPlayoff ? 1 : 0;
      row.championshipMeetings += meeting.isChampionship ? 1 : 0;
      row.lastSeason = meeting.season;
      row.lastScoringPeriod = meeting.scoringPeriod;

      const winner =
        personAScore > personBScore
          ? personAId
          : personBScore > personAScore
            ? personBId
            : null;
      if (winner === personAId) {
        row.personAWins += 1;
      } else if (winner === personBId) {
        row.personBWins += 1;
      } else {
        row.ties += 1;
      }

      if (winner === null) {
        row.currentStreakPersonId = null;
        row.currentStreakLength = 0;
      } else if (row.currentStreakPersonId === winner) {
        row.currentStreakLength += 1;
      } else {
        row.currentStreakPersonId = winner;
        row.currentStreakLength = 1;
      }
      if (row.currentStreakLength > row.longestStreakLength) {
        row.longestStreakLength = row.currentStreakLength;
        row.longestStreakPersonId = row.currentStreakPersonId;
      }
    }
    rows.push(row);
  }

  return rows;
}

function titleGameScore({
  facts,
  personId,
  season,
}: {
  facts: readonly WeeklyFact[];
  personId?: string;
  season: number;
}): number | null {
  if (!personId) {
    return null;
  }
  return (
    facts.find(
      (fact) =>
        fact.season === season &&
        fact.personId === personId &&
        fact.isChampionship,
    )?.pointsFor ?? null
  );
}

function currentRecordEvents(
  recordType: RecordType,
  candidates: readonly RecordCandidate[],
  direction: "max" | "min",
): RecordEvent[] {
  const events: RecordEvent[] = [];
  let current: RecordCandidate | undefined;
  const sorted = [...candidates].sort((left, right) =>
    compareStable(left.sortKey, right.sortKey),
  );

  for (const candidate of sorted) {
    if (
      !current ||
      (direction === "max" && candidate.value > current.value) ||
      (direction === "min" && candidate.value < current.value)
    ) {
      current = candidate;
      events.push({ ...candidate, recordType });
    }
  }

  return events;
}

function bestCurrentOnly(
  recordType: RecordType,
  candidates: readonly RecordCandidate[],
  direction: "max" | "min",
): RecordEvent[] {
  const [best] = [...candidates].sort((left, right) => {
    const valueCompare =
      direction === "max" ? right.value - left.value : left.value - right.value;
    return valueCompare || compareStable(left.sortKey, right.sortKey);
  });
  return best ? [{ ...best, recordType }] : [];
}

function recordEvents({
  facts,
  headToHead,
  seasonRows,
}: {
  facts: readonly WeeklyFact[];
  headToHead: readonly HeadToHeadRow[];
  seasonRows: readonly SeasonStat[];
}): RecordEvent[] {
  const winners = facts.filter((fact) => fact.result === "win");
  const losers = facts.filter((fact) => fact.result === "loss");
  const weeklySort = (fact: WeeklyFact) =>
    `${fact.season}:${fact.scoringPeriod}:${fact.personId}`;
  const singleWeek = (fact: WeeklyFact): RecordCandidate => ({
    holderPersonId: fact.personId,
    opponentPersonId: fact.opponentPersonId,
    scoringPeriod: fact.scoringPeriod,
    season: fact.season,
    sortKey: weeklySort(fact),
    value: fact.pointsFor,
  });
  const seasonCandidate = (
    row: SeasonStat,
    value: number,
  ): RecordCandidate => ({
    holderPersonId: row.personId,
    season: row.season,
    sortKey: `${row.season}:${row.personId}`,
    value,
  });

  const matchupCombined = headToHead
    .filter((row) => row.season !== 0)
    .map((row) => ({
      holderPersonId:
        row.personAWins > row.personBWins ? row.personAId : row.personBId,
      opponentPersonId:
        row.personAWins > row.personBWins ? row.personBId : row.personAId,
      season: row.season,
      sortKey: `${row.season}:${row.personAId}:${row.personBId}`,
      value: round(row.personAPoints + row.personBPoints, 2),
    }));

  const career = new Map<
    string,
    {
      championships: number;
      games: number;
      luck: number;
      playoffAppearances: number;
      pointsFor: number;
      ties: number;
      wins: number;
    }
  >();
  for (const row of seasonRows) {
    const entry = career.get(row.personId) ?? {
      championships: 0,
      games: 0,
      luck: 0,
      playoffAppearances: 0,
      pointsFor: 0,
      ties: 0,
      wins: 0,
    };
    entry.championships += row.finalPlacement === "champ" ? 1 : 0;
    entry.games += row.wins + row.losses + row.ties;
    entry.luck = round(entry.luck + row.luck, 4);
    entry.playoffAppearances += row.madePlayoffs ? 1 : 0;
    entry.pointsFor = round(entry.pointsFor + row.pointsFor, 2);
    entry.ties += row.ties;
    entry.wins += row.wins;
    career.set(row.personId, entry);
  }
  const careerRows = [...career.entries()].map(([personId, row]) => ({
    ...row,
    personId,
    winPercentage:
      row.games > 0 ? round((row.wins + row.ties * 0.5) / row.games, 4) : 0,
  }));

  return [
    ...currentRecordEvents(
      "highest_single_week_score",
      facts.map(singleWeek),
      "max",
    ),
    ...currentRecordEvents(
      "lowest_single_week_score",
      facts.filter((fact) => fact.pointsFor > 0).map(singleWeek),
      "min",
    ),
    ...currentRecordEvents(
      "biggest_blowout",
      winners.map((fact) => ({ ...singleWeek(fact), value: fact.margin })),
      "max",
    ),
    ...currentRecordEvents(
      "narrowest_win",
      winners.map((fact) => ({ ...singleWeek(fact), value: fact.margin })),
      "min",
    ),
    ...currentRecordEvents("best_score_in_loss", losers.map(singleWeek), "max"),
    ...currentRecordEvents(
      "worst_score_in_win",
      winners.map(singleWeek),
      "min",
    ),
    ...currentRecordEvents("highest_combined_matchup", matchupCombined, "max"),
    ...bestCurrentOnly(
      "most_wins_season",
      seasonRows.map((row) => seasonCandidate(row, row.wins)),
      "max",
    ),
    ...bestCurrentOnly(
      "fewest_wins_season",
      seasonRows.map((row) => seasonCandidate(row, row.wins)),
      "min",
    ),
    ...bestCurrentOnly(
      "most_points_for_season",
      seasonRows.map((row) => seasonCandidate(row, row.pointsFor)),
      "max",
    ),
    ...bestCurrentOnly(
      "fewest_points_for_season",
      seasonRows.map((row) => seasonCandidate(row, row.pointsFor)),
      "min",
    ),
    ...bestCurrentOnly(
      "most_points_against_season",
      seasonRows.map((row) => seasonCandidate(row, row.pointsAgainst)),
      "max",
    ),
    ...bestCurrentOnly(
      "fewest_points_against_season",
      seasonRows.map((row) => seasonCandidate(row, row.pointsAgainst)),
      "min",
    ),
    ...bestCurrentOnly(
      "best_luck_season",
      seasonRows.map((row) => seasonCandidate(row, row.luck)),
      "max",
    ),
    ...bestCurrentOnly(
      "worst_luck_season",
      seasonRows.map((row) => seasonCandidate(row, row.luck)),
      "min",
    ),
    ...bestCurrentOnly(
      "longest_win_streak",
      seasonRows.map((row) => seasonCandidate(row, row.longestWinStreak)),
      "max",
    ),
    ...bestCurrentOnly(
      "longest_loss_streak",
      seasonRows.map((row) => seasonCandidate(row, row.longestLossStreak)),
      "max",
    ),
    ...bestCurrentOnly(
      "highest_season_scoring_average",
      seasonRows.map((row) => seasonCandidate(row, row.avgPointsFor)),
      "max",
    ),
    ...bestCurrentOnly(
      "best_career_win_percentage",
      careerRows.map((row) => ({
        holderPersonId: row.personId,
        sortKey: row.personId,
        value: row.winPercentage,
      })),
      "max",
    ),
    ...bestCurrentOnly(
      "most_career_points",
      careerRows.map((row) => ({
        holderPersonId: row.personId,
        sortKey: row.personId,
        value: row.pointsFor,
      })),
      "max",
    ),
    ...bestCurrentOnly(
      "most_championships",
      careerRows.map((row) => ({
        holderPersonId: row.personId,
        sortKey: row.personId,
        value: row.championships,
      })),
      "max",
    ),
    ...bestCurrentOnly(
      "most_playoff_appearances",
      careerRows.map((row) => ({
        holderPersonId: row.personId,
        sortKey: row.personId,
        value: row.playoffAppearances,
      })),
      "max",
    ),
    ...bestCurrentOnly(
      "luckiest_career",
      careerRows.map((row) => ({
        holderPersonId: row.personId,
        sortKey: row.personId,
        value: row.luck,
      })),
      "max",
    ),
  ];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareStable(left, right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function recordSortKey(metadata: Record<string, unknown>): string | null {
  const value = metadata.sortKey;
  return typeof value === "string" ? value : null;
}

function recordNaturalKey(recordType: RecordType, sortKey: string): string {
  return `${recordType}\u001f${sortKey}`;
}

function recordBrokenKey(
  recordType: RecordType,
  allTimeRecordId: string,
): string {
  return `${recordType}:${allTimeRecordId}`;
}

function recordBrokenHookFor({
  event,
  id,
  previousRecordId,
}: {
  event: RecordEvent;
  id: string;
  previousRecordId: string;
}): RecordBrokenHook {
  return {
    allTimeRecordId: id,
    holderPersonId: event.holderPersonId,
    previousRecordId,
    recordKey: recordBrokenKey(event.recordType, id),
    recordType: event.recordType,
    scoringPeriod: event.scoringPeriod ?? null,
    season: event.season ?? null,
    value: round(event.value, 4),
  };
}

function recordEventValues({
  event,
  isCurrent,
  leagueId,
  previousRecordId,
}: {
  event: RecordEvent;
  isCurrent: boolean;
  leagueId: string;
  previousRecordId: string | null;
}): typeof allTimeRecords.$inferInsert {
  return {
    holderPersonId: event.holderPersonId,
    isCurrent,
    leagueId,
    metadata: {
      label: RECORD_TYPE_LABELS[event.recordType],
      sortKey: event.sortKey,
      ...(event.metadata ?? {}),
    },
    opponentPersonId: event.opponentPersonId ?? null,
    previousRecordId,
    recordType: event.recordType,
    scoringPeriod: event.scoringPeriod ?? null,
    season: event.season ?? null,
    value: round(event.value, 4),
  };
}

function allTimeRecordChanged(
  existing: typeof allTimeRecords.$inferSelect,
  values: typeof allTimeRecords.$inferInsert,
): boolean {
  return (
    existing.recordType !== values.recordType ||
    existing.holderPersonId !== values.holderPersonId ||
    existing.value !== values.value ||
    existing.season !== values.season ||
    existing.scoringPeriod !== values.scoringPeriod ||
    existing.opponentPersonId !== values.opponentPersonId ||
    existing.previousRecordId !== values.previousRecordId ||
    existing.isCurrent !== values.isCurrent ||
    stableJson(existing.metadata) !== stableJson(values.metadata)
  );
}

async function refreshAllTimeRecords(
  tx: LeagueScopedTx,
  leagueId: string,
  events: readonly RecordEvent[],
): Promise<{ recordBrokenHooks: RecordBrokenHook[]; records: number }> {
  const byType = new Map<RecordType, RecordEvent[]>();
  for (const event of events) {
    byType.set(event.recordType, [
      ...(byType.get(event.recordType) ?? []),
      event,
    ]);
  }

  const existingRows = await tx
    .select()
    .from(allTimeRecords)
    .where(eq(allTimeRecords.leagueId, leagueId));
  const existingByKey = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) {
    const sortKey = recordSortKey(row.metadata);
    if (!sortKey) {
      continue;
    }
    existingByKey.set(
      recordNaturalKey(row.recordType as RecordType, sortKey),
      row,
    );
  }

  const canEmitHooks = existingRows.length > 0;
  const recordBrokenHooks: RecordBrokenHook[] = [];
  let writes = 0;
  const targetKeys = new Set<string>();
  for (const [recordType, typeEvents] of byType) {
    let previousRecordId: string | null = null;
    const sorted = [...typeEvents].sort((left, right) =>
      compareStable(left.sortKey, right.sortKey),
    );
    for (const [index, event] of sorted.entries()) {
      const key = recordNaturalKey(recordType, event.sortKey);
      targetKeys.add(key);
      const existing = existingByKey.get(key);
      const values = recordEventValues({
        event,
        isCurrent: index === sorted.length - 1,
        leagueId,
        previousRecordId,
      });
      if (!existing) {
        const [inserted] = await tx
          .insert(allTimeRecords)
          .values(values)
          .returning({ id: allTimeRecords.id });
        if (!inserted) {
          throw new Error("all-time record row was not inserted");
        }
        if (canEmitHooks && values.isCurrent && values.previousRecordId) {
          recordBrokenHooks.push(
            recordBrokenHookFor({
              event,
              id: inserted.id,
              previousRecordId: values.previousRecordId,
            }),
          );
        }
        previousRecordId = inserted.id;
        writes += 1;
        continue;
      }
      const becameCurrentRecord =
        values.isCurrent &&
        values.previousRecordId &&
        (!existing.isCurrent ||
          existing.previousRecordId !== values.previousRecordId);
      if (allTimeRecordChanged(existing, values)) {
        await tx
          .update(allTimeRecords)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(allTimeRecords.id, existing.id));
        const nextPreviousRecordId = values.previousRecordId;
        if (canEmitHooks && becameCurrentRecord && nextPreviousRecordId) {
          recordBrokenHooks.push(
            recordBrokenHookFor({
              event,
              id: existing.id,
              previousRecordId: nextPreviousRecordId,
            }),
          );
        }
        writes += 1;
      }
      previousRecordId = existing.id;
    }
  }

  const staleIds = existingRows
    .filter((row) => {
      const sortKey = recordSortKey(row.metadata);
      return (
        !sortKey ||
        !targetKeys.has(recordNaturalKey(row.recordType as RecordType, sortKey))
      );
    })
    .map((row) => row.id);
  if (staleIds.length > 0) {
    await tx.delete(allTimeRecords).where(inArray(allTimeRecords.id, staleIds));
    writes += staleIds.length;
  }

  return { recordBrokenHooks, records: writes };
}

function amountEqual(left: number, right: number, tolerance = 0.01): boolean {
  return Math.abs(left - right) <= tolerance;
}

function checkStatus(
  issues: readonly unknown[],
): DataIntegrityCheckDraft["status"] {
  return issues.length > 0 ? "fail" : "pass";
}

function seasonKeys(values: Iterable<number>): number[] {
  return [...new Set(values)]
    .filter((season) => Number.isInteger(season))
    .sort((left, right) => left - right);
}

async function buildDataIntegrityCheckDrafts(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<DataIntegrityCheckDraft[]> {
  const weeklyRows = await tx
    .select({
      id: weeklyStatistics.id,
      isChampionship: weeklyStatistics.isChampionship,
      matchupId: weeklyStatistics.matchupId,
      personId: weeklyStatistics.personId,
      periodStart: weeklyStatistics.periodStart,
      pointsAgainst: weeklyStatistics.pointsAgainst,
      pointsFor: weeklyStatistics.pointsFor,
      result: weeklyStatistics.result,
      scoringPeriod: weeklyStatistics.scoringPeriod,
      scoringPeriodSpan: weeklyStatistics.scoringPeriodSpan,
      season: weeklyStatistics.season,
    })
    .from(weeklyStatistics)
    .where(eq(weeklyStatistics.leagueId, leagueId));
  const seasonRows = await tx
    .select({
      finalRank: seasonStatistics.finalRank,
      losses: seasonStatistics.losses,
      personId: seasonStatistics.personId,
      pointsAgainst: seasonStatistics.pointsAgainst,
      pointsFor: seasonStatistics.pointsFor,
      season: seasonStatistics.season,
      ties: seasonStatistics.ties,
      wins: seasonStatistics.wins,
    })
    .from(seasonStatistics)
    .where(eq(seasonStatistics.leagueId, leagueId));
  const finalStandingRows = await tx
    .select({
      finalRank: providerFinalStandings.finalRank,
      providerTeamId: providerFinalStandings.providerTeamId,
      rankConfidence: providerFinalStandings.rankConfidence,
      rankSource: providerFinalStandings.rankSource,
      season: providerFinalStandings.season,
    })
    .from(providerFinalStandings)
    .where(eq(providerFinalStandings.leagueId, leagueId));
  const mappingRows = await tx
    .select({
      personId: identityMappings.personId,
      providerTeamId: identityMappings.providerTeamId,
      season: identityMappings.season,
      teamSeasonId: identityMappings.teamSeasonId,
    })
    .from(identityMappings)
    .where(eq(identityMappings.leagueId, leagueId));
  const teamSeasonRows = await tx
    .select({
      id: teamSeasons.id,
      providerTeamId: teamSeasons.providerTeamId,
      season: teamSeasons.season,
    })
    .from(teamSeasons)
    .where(eq(teamSeasons.leagueId, leagueId));
  const teamRows = await tx
    .select({
      providerTeamId: fantasyTeams.providerTeamId,
      season: fantasyTeams.season,
    })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.leagueId, leagueId));
  const matchupRows = await tx
    .select({
      awayTeamProviderId: fantasyMatchups.awayTeamProviderId,
      homeTeamProviderId: fantasyMatchups.homeTeamProviderId,
      id: fantasyMatchups.id,
      periodStart: fantasyMatchups.periodStart,
      scoringPeriod: fantasyMatchups.scoringPeriod,
      scoringPeriodSpan: fantasyMatchups.scoringPeriodSpan,
      season: fantasyMatchups.season,
      status: fantasyMatchups.status,
    })
    .from(fantasyMatchups)
    .where(
      and(
        eq(fantasyMatchups.leagueId, leagueId),
        eq(fantasyMatchups.status, "final"),
      ),
    );
  const coverageRows = await tx
    .select({
      capability: dataCoverage.capability,
      dataClass: dataCoverage.dataClass,
      itemCount: dataCoverage.itemCount,
      season: dataCoverage.season,
      status: dataCoverage.status,
    })
    .from(dataCoverage)
    .where(eq(dataCoverage.leagueId, leagueId));
  const settingsRows = await tx
    .select({
      id: leagueSeasonSettings.id,
      matchupPeriodCount: leagueSeasonSettings.matchupPeriodCount,
      season: leagueSeasonSettings.season,
    })
    .from(leagueSeasonSettings)
    .where(eq(leagueSeasonSettings.leagueId, leagueId));
  const groupingRows = await tx
    .select({
      id: leagueSeasonGroupings.id,
      kind: leagueSeasonGroupings.kind,
      status: leagueSeasonGroupings.status,
    })
    .from(leagueSeasonGroupings)
    .where(eq(leagueSeasonGroupings.leagueId, leagueId));
  const groupingSeasonRows = await tx
    .select({
      groupingId: leagueGroupingSeasons.groupingId,
      season: leagueGroupingSeasons.season,
    })
    .from(leagueGroupingSeasons)
    .where(eq(leagueGroupingSeasons.leagueId, leagueId));
  const editRows = await tx
    .select({
      editClass: leagueDataEdits.editClass,
      field: leagueDataEdits.field,
      id: leagueDataEdits.id,
      targetId: leagueDataEdits.targetId,
      targetKind: leagueDataEdits.targetKind,
    })
    .from(leagueDataEdits)
    .where(eq(leagueDataEdits.leagueId, leagueId));
  const personRows = await tx
    .select({ id: persons.id })
    .from(persons)
    .where(eq(persons.leagueId, leagueId));

  const drafts: DataIntegrityCheckDraft[] = [];

  const seasonStatsByPersonSeason = new Map(
    seasonRows.map((row) => [`${row.personId}:${row.season}`, row]),
  );
  const weeklyTotals = new Map<
    string,
    {
      losses: number;
      pointsAgainst: number;
      pointsFor: number;
      season: number;
      ties: number;
      wins: number;
    }
  >();
  for (const row of weeklyRows) {
    const key = `${row.personId}:${row.season}`;
    const current = weeklyTotals.get(key) ?? {
      losses: 0,
      pointsAgainst: 0,
      pointsFor: 0,
      season: row.season,
      ties: 0,
      wins: 0,
    };
    current.wins += row.result === "win" ? 1 : 0;
    current.losses += row.result === "loss" ? 1 : 0;
    current.ties += row.result === "tie" ? 1 : 0;
    current.pointsFor = round(current.pointsFor + row.pointsFor, 2);
    current.pointsAgainst = round(current.pointsAgainst + row.pointsAgainst, 2);
    weeklyTotals.set(key, current);
  }
  const reconciliationSeasons = seasonKeys([
    ...weeklyRows.map((row) => row.season),
    ...seasonRows.map((row) => row.season),
  ]);
  for (const season of reconciliationSeasons) {
    const mismatches: Record<string, unknown>[] = [];
    for (const row of seasonRows.filter((entry) => entry.season === season)) {
      const weekly = weeklyTotals.get(`${row.personId}:${row.season}`);
      if (!weekly) {
        mismatches.push({
          personId: row.personId,
          reason: "missing_weekly_totals",
        });
        continue;
      }
      if (
        row.wins !== weekly.wins ||
        row.losses !== weekly.losses ||
        row.ties !== weekly.ties ||
        !amountEqual(row.pointsFor, weekly.pointsFor) ||
        !amountEqual(row.pointsAgainst, weekly.pointsAgainst)
      ) {
        mismatches.push({
          personId: row.personId,
          season: row.season,
          seasonTotals: {
            losses: row.losses,
            pointsAgainst: row.pointsAgainst,
            pointsFor: row.pointsFor,
            ties: row.ties,
            wins: row.wins,
          },
          weeklyTotals: weekly,
        });
      }
    }
    for (const [key, weekly] of weeklyTotals) {
      if (!key.endsWith(`:${season}`)) {
        continue;
      }
      if (!seasonStatsByPersonSeason.has(key)) {
        mismatches.push({
          personId: key.split(":")[0],
          reason: "missing_season_totals",
          weeklyTotals: weekly,
        });
      }
    }
    drafts.push({
      checkKey: "reconciliation_totals",
      detail: {
        checkedRows: seasonRows.filter((row) => row.season === season).length,
        mismatches,
      },
      season,
      status: checkStatus(mismatches),
    });
  }

  const mappingsByProviderTeamSeason = new Map(
    mappingRows.map((row) => [
      identityKey(row.providerTeamId, row.season),
      row,
    ]),
  );
  const standingsSeasons = seasonKeys(
    finalStandingRows.map((row) => row.season),
  );
  const championshipFactsByPersonSeason = new Set(
    weeklyRows
      .filter((row) => row.isChampionship)
      .map((row) => `${row.personId}:${row.season}`),
  );
  for (const season of standingsSeasons) {
    const issues: Record<string, unknown>[] = [];
    const seasonStandings = finalStandingRows
      .filter((row) => row.season === season)
      .sort(
        (left, right) =>
          left.finalRank - right.finalRank ||
          compareStable(left.providerTeamId, right.providerTeamId),
      );

    for (const standing of seasonStandings) {
      if (standing.rankConfidence !== "high") {
        issues.push({
          finalRank: standing.finalRank,
          providerTeamId: standing.providerTeamId,
          rankConfidence: standing.rankConfidence,
          rankSource: standing.rankSource,
          reason: "low_confidence_final_rank",
        });
      }
    }

    const champion = seasonStandings.find((row) => row.finalRank === 1);
    const runnerUp = seasonStandings.find((row) => row.finalRank === 2);
    const championMapping = champion
      ? mappingsByProviderTeamSeason.get(
          identityKey(champion.providerTeamId, season),
        )
      : undefined;
    const runnerUpMapping = runnerUp
      ? mappingsByProviderTeamSeason.get(
          identityKey(runnerUp.providerTeamId, season),
        )
      : undefined;
    if (
      champion &&
      runnerUp &&
      championMapping &&
      runnerUpMapping &&
      (!championshipFactsByPersonSeason.has(
        `${championMapping.personId}:${season}`,
      ) ||
        !championshipFactsByPersonSeason.has(
          `${runnerUpMapping.personId}:${season}`,
        ))
    ) {
      issues.push({
        championProviderTeamId: champion.providerTeamId,
        finalRanks: {
          champion: champion.finalRank,
          runnerUp: runnerUp.finalRank,
        },
        reason: "missing_championship_matchup",
        runnerUpProviderTeamId: runnerUp.providerTeamId,
      });
    }

    drafts.push({
      checkKey: "postseason_derivation_confidence",
      detail: {
        checkedRows: seasonStandings.length,
        issues,
      },
      season,
      status: checkStatus(issues),
    });
  }

  for (const season of standingsSeasons) {
    const mismatches: Record<string, unknown>[] = [];
    for (const standing of finalStandingRows.filter(
      (row) => row.season === season,
    )) {
      const mapping = mappingsByProviderTeamSeason.get(
        identityKey(standing.providerTeamId, standing.season),
      );
      if (!mapping) {
        mismatches.push({
          providerTeamId: standing.providerTeamId,
          reason: "missing_identity_mapping",
        });
        continue;
      }
      const seasonStat = seasonStatsByPersonSeason.get(
        `${mapping.personId}:${standing.season}`,
      );
      if (!seasonStat) {
        mismatches.push({
          personId: mapping.personId,
          providerTeamId: standing.providerTeamId,
          reason: "missing_season_statistics",
        });
        continue;
      }
      if (seasonStat.finalRank !== standing.finalRank) {
        mismatches.push({
          computedFinalRank: seasonStat.finalRank,
          personId: mapping.personId,
          providerFinalRank: standing.finalRank,
          providerTeamId: standing.providerTeamId,
        });
      }
    }
    drafts.push({
      checkKey: "standings_parity",
      detail: {
        checkedRows: finalStandingRows.filter((row) => row.season === season)
          .length,
        mismatches,
      },
      season,
      status: checkStatus(mismatches),
    });
  }

  const teamIdsBySeason = new Map<number, Set<string>>();
  for (const row of teamRows) {
    const teamIds = teamIdsBySeason.get(row.season) ?? new Set<string>();
    teamIds.add(row.providerTeamId);
    teamIdsBySeason.set(row.season, teamIds);
  }
  const matchupsBySeasonWeek = new Map<string, typeof matchupRows>();
  for (const row of matchupRows) {
    const key = `${row.season}:${row.scoringPeriod}`;
    matchupsBySeasonWeek.set(key, [
      ...(matchupsBySeasonWeek.get(key) ?? []),
      row,
    ]);
  }
  const scheduleBySeason = new Map<number, Record<string, unknown>[]>();
  for (const [key, rows] of matchupsBySeasonWeek) {
    const [seasonRaw, scoringPeriodRaw] = key.split(":");
    const season = Number(seasonRaw);
    const scoringPeriod = Number(scoringPeriodRaw);
    const expectedTeamIds = teamIdsBySeason.get(season) ?? new Set<string>();
    const seenTeamIds = new Set<string>();
    for (const row of rows) {
      seenTeamIds.add(row.homeTeamProviderId);
      seenTeamIds.add(row.awayTeamProviderId);
    }
    const missingTeamIds = [...expectedTeamIds]
      .filter((providerTeamId) => !seenTeamIds.has(providerTeamId))
      .sort(compareStable);
    if (missingTeamIds.length > 0) {
      scheduleBySeason.set(season, [
        ...(scheduleBySeason.get(season) ?? []),
        {
          missingTeamIds,
          scoringPeriod,
        },
      ]);
    }
  }
  for (const season of seasonKeys(teamRows.map((row) => row.season))) {
    const gaps = scheduleBySeason.get(season) ?? [];
    drafts.push({
      checkKey: "schedule_coverage",
      detail: {
        checkedWeeks: [...matchupsBySeasonWeek.keys()].filter((key) =>
          key.startsWith(`${season}:`),
        ).length,
        gaps,
        teamCount: teamIdsBySeason.get(season)?.size ?? 0,
      },
      season,
      status: checkStatus(gaps),
    });
  }

  const mappingCountsByTeamSeasonId = new Map<string, number>();
  const teamSeasonIds = new Set(teamSeasonRows.map((row) => row.id));
  for (const mapping of mappingRows) {
    mappingCountsByTeamSeasonId.set(
      mapping.teamSeasonId,
      (mappingCountsByTeamSeasonId.get(mapping.teamSeasonId) ?? 0) + 1,
    );
  }
  const identityIssuesBySeason = new Map<number, Record<string, unknown>[]>();
  for (const teamSeason of teamSeasonRows) {
    const count = mappingCountsByTeamSeasonId.get(teamSeason.id) ?? 0;
    if (count !== 1) {
      identityIssuesBySeason.set(teamSeason.season, [
        ...(identityIssuesBySeason.get(teamSeason.season) ?? []),
        {
          mappingCount: count,
          providerTeamId: teamSeason.providerTeamId,
          reason: "team_season_mapping_count",
          teamSeasonId: teamSeason.id,
        },
      ]);
    }
  }
  for (const mapping of mappingRows) {
    if (!teamSeasonIds.has(mapping.teamSeasonId)) {
      identityIssuesBySeason.set(mapping.season, [
        ...(identityIssuesBySeason.get(mapping.season) ?? []),
        {
          mappingTeamSeasonId: mapping.teamSeasonId,
          reason: "mapping_without_team_season",
        },
      ]);
    }
  }
  const sameSeasonPersonToTeamSeasons = new Map<string, Set<string>>();
  for (const mapping of mappingRows) {
    const key = `${mapping.season}:${mapping.personId}`;
    const mapped = sameSeasonPersonToTeamSeasons.get(key) ?? new Set<string>();
    mapped.add(mapping.teamSeasonId);
    sameSeasonPersonToTeamSeasons.set(key, mapped);
  }
  for (const [key, mapped] of sameSeasonPersonToTeamSeasons) {
    if (mapped.size <= 1) {
      continue;
    }
    const [seasonRaw, personId] = key.split(":");
    const season = Number(seasonRaw);
    identityIssuesBySeason.set(season, [
      ...(identityIssuesBySeason.get(season) ?? []),
      {
        personId,
        reason: "same_season_person_overmerge",
        teamSeasonIds: [...mapped].sort(compareStable),
      },
    ]);
  }
  for (const season of seasonKeys(teamSeasonRows.map((row) => row.season))) {
    const issues = identityIssuesBySeason.get(season) ?? [];
    drafts.push({
      checkKey: "identity_sanity",
      detail: {
        checkedTeamSeasons: teamSeasonRows.filter(
          (row) => row.season === season,
        ).length,
        issues,
      },
      season,
      status: checkStatus(issues),
    });
  }

  const emptyCompleteBySeason = new Map<number, Record<string, unknown>[]>();
  for (const row of coverageRows) {
    if (
      row.capability === "none" ||
      !["complete", "partial"].includes(row.status) ||
      row.itemCount > 0
    ) {
      continue;
    }
    emptyCompleteBySeason.set(row.season, [
      ...(emptyCompleteBySeason.get(row.season) ?? []),
      {
        capability: row.capability,
        dataClass: row.dataClass,
        itemCount: row.itemCount,
        status: row.status,
      },
    ]);
  }
  const coverageSeasons = seasonKeys(coverageRows.map((row) => row.season));
  for (const season of coverageSeasons.length > 0 ? coverageSeasons : [null]) {
    const issues =
      season === null ? [] : (emptyCompleteBySeason.get(season) ?? []);
    drafts.push({
      checkKey: "no_silent_empty",
      detail: {
        checkedRows:
          season === null
            ? 0
            : coverageRows.filter((row) => row.season === season).length,
        issues,
      },
      season,
      status: checkStatus(issues),
    });
  }

  const knownSeasons = new Set([
    ...settingsRows.map((row) => row.season),
    ...teamSeasonRows.map((row) => row.season),
    ...matchupRows.map((row) => row.season),
    ...seasonRows.map((row) => row.season),
  ]);
  const groupingById = new Map(groupingRows.map((row) => [row.id, row]));
  const groupingCoverageIssues: Record<string, unknown>[] = [];
  const seasonKindMembership = new Map<string, string[]>();
  for (const row of groupingSeasonRows) {
    const grouping = groupingById.get(row.groupingId);
    if (!grouping) {
      groupingCoverageIssues.push({
        groupingId: row.groupingId,
        reason: "season_without_grouping",
        season: row.season,
      });
      continue;
    }
    if (!knownSeasons.has(row.season)) {
      groupingCoverageIssues.push({
        groupingId: row.groupingId,
        reason: "unknown_grouping_season",
        season: row.season,
      });
    }
    if (grouping.status === "confirmed") {
      const membershipKey = `${grouping.kind}:${row.season}`;
      seasonKindMembership.set(membershipKey, [
        ...(seasonKindMembership.get(membershipKey) ?? []),
        grouping.id,
      ]);
    }
  }
  for (const [key, groupingIds] of seasonKindMembership) {
    if (groupingIds.length <= 1) {
      continue;
    }
    const [kind, seasonRaw] = key.split(":");
    groupingCoverageIssues.push({
      groupingIds: groupingIds.sort(compareStable),
      kind,
      reason: "season_in_multiple_confirmed_groupings",
      season: Number(seasonRaw),
    });
  }
  drafts.push({
    checkKey: "grouping_season_coverage",
    detail: {
      checkedGroupings: groupingRows.length,
      checkedSeasons: groupingSeasonRows.length,
      issues: groupingCoverageIssues,
    },
    season: null,
    status: checkStatus(groupingCoverageIssues),
  });

  const settingPeriodCountBySeason = new Map(
    settingsRows.map((row) => [row.season, row.matchupPeriodCount]),
  );
  const spanEditTargets = new Set(
    editRows
      .filter(
        (row) =>
          row.targetKind === "matchup" && row.field === "scoring_period_span",
      )
      .map((row) => row.targetId),
  );
  const weeklyByMatchup = new Map<string, typeof weeklyRows>();
  for (const row of weeklyRows) {
    weeklyByMatchup.set(row.matchupId, [
      ...(weeklyByMatchup.get(row.matchupId) ?? []),
      row,
    ]);
  }
  const spanIssuesBySeason = new Map<number, Record<string, unknown>[]>();
  for (const matchup of matchupRows) {
    const issues = spanIssuesBySeason.get(matchup.season) ?? [];
    if (matchup.scoringPeriodSpan < 1) {
      issues.push({
        matchupId: matchup.id,
        reason: "matchup_span_below_one",
        scoringPeriodSpan: matchup.scoringPeriodSpan,
      });
    }
    const settingPeriodCount =
      settingPeriodCountBySeason.get(matchup.season) ?? 1;
    if (
      matchup.scoringPeriodSpan > 1 &&
      settingPeriodCount <= 1 &&
      !spanEditTargets.has(matchup.id)
    ) {
      issues.push({
        matchupId: matchup.id,
        reason: "span_without_settings_or_ledger",
        scoringPeriodSpan: matchup.scoringPeriodSpan,
      });
    }
    for (const weekly of weeklyByMatchup.get(matchup.id) ?? []) {
      if (
        weekly.scoringPeriodSpan !== matchup.scoringPeriodSpan ||
        (weekly.periodStart ?? weekly.scoringPeriod) !==
          (matchup.periodStart ?? matchup.scoringPeriod)
      ) {
        issues.push({
          matchupId: matchup.id,
          reason: "weekly_span_mismatch",
          weeklyPersonId: weekly.personId,
        });
      }
    }
    if (issues.length > 0) {
      spanIssuesBySeason.set(matchup.season, issues);
    }
  }
  for (const season of seasonKeys(matchupRows.map((row) => row.season))) {
    const issues = spanIssuesBySeason.get(season) ?? [];
    drafts.push({
      checkKey: "matchup_span_sanity",
      detail: {
        checkedMatchups: matchupRows.filter((row) => row.season === season)
          .length,
        issues,
      },
      season,
      status: checkStatus(issues),
    });
  }

  const editTargets = {
    grouping: new Set(groupingRows.map((row) => row.id)),
    matchup: new Set(matchupRows.map((row) => row.id)),
    person: new Set(personRows.map((row) => row.id)),
    season_setting: new Set(settingsRows.map((row) => row.id)),
    team_season: new Set(teamSeasonRows.map((row) => row.id)),
    weekly_stat: new Set(weeklyRows.map((row) => row.id)),
  };
  const ledgerIssues: Record<string, unknown>[] = [];
  for (const row of editRows.filter(
    (entry) => entry.editClass === "substantive",
  )) {
    const targetSet =
      row.targetKind === "person"
        ? editTargets.person
        : row.targetKind === "team_season"
          ? editTargets.team_season
          : row.targetKind === "weekly_stat"
            ? editTargets.weekly_stat
            : row.targetKind === "matchup"
              ? editTargets.matchup
              : row.targetKind === "season_setting"
                ? editTargets.season_setting
                : editTargets.grouping;
    if (!targetSet.has(row.targetId)) {
      ledgerIssues.push({
        editId: row.id,
        field: row.field,
        reason: "substantive_edit_target_missing",
        targetId: row.targetId,
        targetKind: row.targetKind,
      });
    }
  }
  drafts.push({
    checkKey: "data_edit_ledger_completeness",
    detail: {
      checkedSubstantiveEdits: editRows.filter(
        (entry) => entry.editClass === "substantive",
      ).length,
      issues: ledgerIssues,
    },
    season: null,
    status: checkStatus(ledgerIssues),
  });

  return drafts;
}

async function runDataIntegrityChecksInContext(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<{ checks: number; failures: number }> {
  const drafts = await buildDataIntegrityCheckDrafts(tx, leagueId);
  if (drafts.length === 0) {
    return { checks: 0, failures: 0 };
  }

  await tx.insert(dataIntegrityChecks).values(
    drafts.map((draft) => ({
      checkKey: draft.checkKey,
      detail: draft.detail,
      leagueId,
      season: draft.season,
      status: draft.status,
    })),
  );

  return {
    checks: drafts.length,
    failures: drafts.filter((draft) => draft.status === "fail").length,
  };
}

export async function runDataIntegrityChecks(
  db: Db,
  input: { leagueId: string },
): Promise<{ checks: number; failures: number }> {
  return withLeagueContext(db, input.leagueId, (tx) =>
    runDataIntegrityChecksInContext(tx, input.leagueId),
  );
}

async function startStatsCalculation(
  tx: LeagueScopedTx,
  input: {
    calculationType: StatsCalculationType;
    leagueId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<StatsCalculationRun> {
  const [calculation] = await tx
    .insert(statsCalculations)
    .values({
      calculationType: input.calculationType,
      leagueId: input.leagueId,
      metadata: input.metadata ?? {},
      status: "running",
    })
    .returning({ id: statsCalculations.id });
  if (!calculation) {
    throw new Error("stats calculation log was not created");
  }
  return { id: calculation.id, startedAtMs: Date.now() };
}

async function completeStatsCalculation(
  tx: LeagueScopedTx,
  input: StatsCalculationRun & {
    rowsProcessed: number;
  },
): Promise<void> {
  await tx
    .update(statsCalculations)
    .set({
      completedAt: new Date(),
      durationMs: Date.now() - input.startedAtMs,
      rowsProcessed: input.rowsProcessed,
      status: "completed",
    })
    .where(eq(statsCalculations.id, input.id));
}

async function buildStatsComputationState(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<StatsComputationState> {
  const seasonRows = await tx
    .select()
    .from(teamSeasons)
    .where(eq(teamSeasons.leagueId, leagueId));
  const mappingRows = await tx
    .select()
    .from(identityMappings)
    .where(eq(identityMappings.leagueId, leagueId));
  const matchups = await loadFinalMatchups(tx, leagueId);
  const providerStandings = await loadProviderFinalStandings(tx, leagueId);
  const seasonSettings = await loadLeagueSeasonSettings(tx, leagueId);
  const teamSeasonByIdentity = new Map(
    seasonRows.map((row) => [identityKey(row.providerTeamId, row.season), row]),
  );
  const weeklyFacts = buildWeeklyFacts({
    leagueId,
    mappings: mappingRows,
    matchups,
    postseasonFlags: postseasonFlagsByMatchupId({
      matchups,
      seasonSettings,
      standings: providerStandings,
    }),
    teamSeasonByIdentity,
  });
  const seasonStats = buildSeasonStats(
    weeklyFacts,
    leagueId,
    officialPlacementsByPersonSeason({
      mappings: mappingRows,
      standings: providerStandings,
    }),
  );
  return {
    h2hRows: headToHeadRows(weeklyFacts, leagueId),
    mappingRows,
    seasonStats,
    weeklyFacts,
  };
}

function weeklyStatisticValues(fact: WeeklyFact) {
  return {
    isBottomScorer: fact.isBottomScorer,
    isChampionship: fact.isChampionship,
    isPlayoff: fact.isPlayoff,
    leagueId: fact.leagueId,
    margin: fact.margin,
    matchupKind: fact.matchupKind,
    matchupId: fact.matchupId,
    opponentPersonId: fact.opponentPersonId,
    periodStart: fact.periodStart,
    personId: fact.personId,
    pointsAgainst: fact.pointsAgainst,
    pointsFor: fact.pointsFor,
    result: fact.result,
    scoringPeriod: fact.scoringPeriod,
    scoringPeriodSpan: fact.scoringPeriodSpan,
    season: fact.season,
    teamSeasonId: fact.teamSeasonId,
    weeklyRank: fact.weeklyRank,
    isTopScorer: fact.isTopScorer,
  };
}

async function insertWeeklyFacts(
  tx: LeagueScopedTx,
  facts: readonly WeeklyFact[],
): Promise<number> {
  if (facts.length === 0) {
    return 0;
  }
  await tx.insert(weeklyStatistics).values(facts.map(weeklyStatisticValues));
  return facts.length;
}

function seasonStatisticValues(row: SeasonStat) {
  return {
    allPlayLosses: row.allPlayLosses,
    allPlayTies: row.allPlayTies,
    allPlayWins: row.allPlayWins,
    avgPointsAgainst: row.avgPointsAgainst,
    avgPointsFor: row.avgPointsFor,
    currentStreakLength: row.currentStreakLength,
    currentStreakType: row.currentStreakType,
    divisionWinner: row.divisionWinner,
    expectedWins: row.expectedWins,
    finalPlacement: row.finalPlacement,
    finalRank: row.finalRank,
    highestScore: row.highestScore,
    leagueId: row.leagueId,
    longestLossStreak: row.longestLossStreak,
    longestWinStreak: row.longestWinStreak,
    losses: row.losses,
    lowestScore: row.lowestScore,
    luck: row.luck,
    madeChampionship: row.madeChampionship,
    madePlayoffs: row.madePlayoffs,
    medianPointsAgainst: row.medianPointsAgainst,
    medianPointsFor: row.medianPointsFor,
    personId: row.personId,
    pointDifferential: row.pointDifferential,
    playoffSeed: row.playoffSeed,
    pointsAgainst: row.pointsAgainst,
    pointsFor: row.pointsFor,
    scoringStdDev: row.scoringStdDev,
    season: row.season,
    ties: row.ties,
    winPercentage: row.winPercentage,
    wins: row.wins,
  };
}

async function insertSeasonStats(
  tx: LeagueScopedTx,
  rows: readonly SeasonStat[],
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  await tx.insert(seasonStatistics).values(rows.map(seasonStatisticValues));
  return rows.length;
}

async function insertHeadToHeadStats(
  tx: LeagueScopedTx,
  rows: readonly HeadToHeadRow[],
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  await tx.insert(headToHeadRecords).values([...rows]);
  return rows.length;
}

async function insertChampionshipStats({
  facts,
  leagueId,
  seasonRows,
  seasons,
  tx,
}: {
  facts: readonly WeeklyFact[];
  leagueId: string;
  seasonRows: readonly SeasonStat[];
  seasons?: ReadonlySet<number>;
  tx: LeagueScopedTx;
}): Promise<number> {
  const champions = seasonRows.filter(
    (row) => row.finalRank > 0 && (!seasons || seasons.has(row.season)),
  );
  const championRows = new Map<number, SeasonStat[]>();
  for (const row of champions) {
    championRows.set(row.season, [
      ...(championRows.get(row.season) ?? []),
      row,
    ]);
  }

  let inserted = 0;
  for (const [season, rows] of championRows) {
    const sorted = [...rows].sort(
      (left, right) =>
        left.finalRank - right.finalRank ||
        compareStable(left.personId, right.personId),
    );
    const regularSeasonWinner =
      rows.find((row) => row.playoffSeed === 1) ??
      [...rows].sort(
        (left, right) =>
          left.computedRank - right.computedRank ||
          compareStable(left.personId, right.personId),
      )[0];
    await tx.insert(championshipRecords).values({
      championPersonId: sorted[0]?.personId ?? null,
      championshipScore:
        titleGameScore({
          facts,
          personId: sorted[0]?.personId,
          season,
        }) ??
        sorted[0]?.highestScore ??
        null,
      leagueId,
      regularSeasonWinnerPersonId: regularSeasonWinner?.personId ?? null,
      runnerUpPersonId: sorted[1]?.personId ?? null,
      runnerUpScore:
        titleGameScore({
          facts,
          personId: sorted[1]?.personId,
          season,
        }) ??
        sorted[1]?.highestScore ??
        null,
      season,
      thirdPlacePersonId: sorted[2]?.personId ?? null,
    });
    inserted += 1;
  }
  return inserted;
}

export async function recomputeLeagueStatistics(
  db: Db,
  input: { leagueId: string },
): Promise<{
  headToHeadRecords: number;
  integrityChecks: number;
  integrityFailures: number;
  recordBookAggregates: number;
  records: number;
  seasonStatistics: number;
  weeklyStatistics: number;
}> {
  await resolveLeagueIdentities(db, input);
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const calculation = await startStatsCalculation(tx, {
      calculationType: "all",
      leagueId: input.leagueId,
    });

    await tx
      .delete(championshipRecords)
      .where(eq(championshipRecords.leagueId, input.leagueId));
    await tx
      .delete(headToHeadRecords)
      .where(eq(headToHeadRecords.leagueId, input.leagueId));
    await tx
      .delete(seasonStatistics)
      .where(eq(seasonStatistics.leagueId, input.leagueId));
    await tx
      .delete(weeklyStatistics)
      .where(eq(weeklyStatistics.leagueId, input.leagueId));

    const state = await buildStatsComputationState(tx, input.leagueId);
    const weeklyRows = await insertWeeklyFacts(tx, state.weeklyFacts);
    const seasonRows = await insertSeasonStats(tx, state.seasonStats);
    const h2hRows = await insertHeadToHeadStats(tx, state.h2hRows);
    await insertChampionshipStats({
      facts: state.weeklyFacts,
      leagueId: input.leagueId,
      seasonRows: state.seasonStats,
      tx,
    });

    const recordRefresh = await refreshAllTimeRecords(
      tx,
      input.leagueId,
      recordEvents({
        facts: state.weeklyFacts,
        headToHead: state.h2hRows,
        seasonRows: state.seasonStats,
      }),
    );
    const recordBookAggregateCount = await refreshRecordBookAggregates(tx, {
      leagueId: input.leagueId,
    });
    const integrity = await runDataIntegrityChecksInContext(tx, input.leagueId);
    const rowsProcessed =
      weeklyRows +
      seasonRows +
      h2hRows +
      recordRefresh.records +
      recordBookAggregateCount.standings +
      recordBookAggregateCount.milestones +
      integrity.checks;

    await completeStatsCalculation(tx, {
      ...calculation,
      rowsProcessed,
    });

    return {
      headToHeadRecords: h2hRows,
      integrityChecks: integrity.checks,
      integrityFailures: integrity.failures,
      recordBookAggregates:
        recordBookAggregateCount.standings +
        recordBookAggregateCount.milestones,
      records: recordRefresh.records,
      seasonStatistics: seasonRows,
      weeklyStatistics: weeklyRows,
    };
  });
}

export async function recomputeChangedMatchupStatistics(
  db: Db,
  input: { leagueId: string; matchupIds: readonly string[] },
): Promise<ChangedMatchupRecomputeSummary> {
  const matchupIds = sortedUnique(input.matchupIds);
  if (matchupIds.length === 0) {
    return {
      headToHeadRecords: 0,
      integrityChecks: 0,
      integrityFailures: 0,
      recordBookAggregates: 0,
      recordBrokenHooks: [],
      records: 0,
      seasonStatistics: 0,
      seasons: [],
      targetedPairs: [],
      weeklyStatistics: 0,
    };
  }

  const finalizedTargets = await withLeagueContext(
    db,
    input.leagueId,
    async (tx) =>
      tx
        .select({
          awayTeamProviderId: fantasyMatchups.awayTeamProviderId,
          homeTeamProviderId: fantasyMatchups.homeTeamProviderId,
          id: fantasyMatchups.id,
          kind: fantasyMatchups.kind,
          season: fantasyMatchups.season,
        })
        .from(fantasyMatchups)
        .where(
          and(
            eq(fantasyMatchups.leagueId, input.leagueId),
            eq(fantasyMatchups.status, "final"),
            inArray(fantasyMatchups.id, matchupIds),
          ),
        ),
  );
  if (finalizedTargets.length === 0) {
    return {
      headToHeadRecords: 0,
      integrityChecks: 0,
      integrityFailures: 0,
      recordBookAggregates: 0,
      recordBrokenHooks: [],
      records: 0,
      seasonStatistics: 0,
      seasons: [],
      targetedPairs: [],
      weeklyStatistics: 0,
    };
  }

  await resolveLeagueIdentities(db, { leagueId: input.leagueId });

  return withLeagueContext(db, input.leagueId, async (tx) => {
    const state = await buildStatsComputationState(tx, input.leagueId);
    const mappingByIdentity = new Map(
      state.mappingRows.map((mapping) => [
        identityKey(mapping.providerTeamId, mapping.season),
        mapping,
      ]),
    );
    const targetSeasons = sortedUniqueNumbers(
      finalizedTargets.map((matchup) => matchup.season),
    );
    const targetSeasonSet = new Set(targetSeasons);
    const targetPairKeys = new Set<string>();

    for (const matchup of finalizedTargets) {
      if (matchup.kind !== "head_to_head") {
        continue;
      }
      const homeMapping = mappingByIdentity.get(
        identityKey(matchup.homeTeamProviderId, matchup.season),
      );
      const awayMapping = mappingByIdentity.get(
        identityKey(matchup.awayTeamProviderId, matchup.season),
      );
      if (!homeMapping || !awayMapping) {
        continue;
      }
      targetPairKeys.add(
        personPairKey(homeMapping.personId, awayMapping.personId),
      );
    }

    const targetWeeklyFacts = state.weeklyFacts.filter((fact) =>
      targetSeasonSet.has(fact.season),
    );
    const targetSeasonStats = state.seasonStats.filter((row) =>
      targetSeasonSet.has(row.season),
    );
    const targetH2hRows = state.h2hRows.filter((row) =>
      targetPairKeys.has(personPairKey(row.personAId, row.personBId)),
    );
    const calculationMetadata = {
      matchupIds,
      seasons: targetSeasons,
      trigger: "changed_finalized_matchup",
    };

    const seasonCalculation = await startStatsCalculation(tx, {
      calculationType: "season",
      leagueId: input.leagueId,
      metadata: calculationMetadata,
    });
    await tx
      .delete(championshipRecords)
      .where(
        and(
          eq(championshipRecords.leagueId, input.leagueId),
          inArray(championshipRecords.season, targetSeasons),
        ),
      );
    await tx
      .delete(seasonStatistics)
      .where(
        and(
          eq(seasonStatistics.leagueId, input.leagueId),
          inArray(seasonStatistics.season, targetSeasons),
        ),
      );
    await tx
      .delete(weeklyStatistics)
      .where(
        and(
          eq(weeklyStatistics.leagueId, input.leagueId),
          inArray(weeklyStatistics.season, targetSeasons),
        ),
      );
    const weeklyRows = await insertWeeklyFacts(tx, targetWeeklyFacts);
    const seasonRows = await insertSeasonStats(tx, targetSeasonStats);
    const championshipRows = await insertChampionshipStats({
      facts: state.weeklyFacts,
      leagueId: input.leagueId,
      seasonRows: targetSeasonStats,
      seasons: targetSeasonSet,
      tx,
    });
    const integrity = await runDataIntegrityChecksInContext(tx, input.leagueId);
    await completeStatsCalculation(tx, {
      ...seasonCalculation,
      rowsProcessed:
        weeklyRows + seasonRows + championshipRows + integrity.checks,
    });

    let h2hRows = 0;
    if (targetPairKeys.size > 0) {
      const targetedPairs = [...targetPairKeys]
        .map(personPairFromKey)
        .sort((left, right) => {
          const leftKey = personPairKey(left.personAId, left.personBId);
          const rightKey = personPairKey(right.personAId, right.personBId);
          return compareStable(leftKey, rightKey);
        });
      const h2hCalculation = await startStatsCalculation(tx, {
        calculationType: "head_to_head",
        leagueId: input.leagueId,
        metadata: {
          ...calculationMetadata,
          pairs: targetedPairs,
        },
      });
      for (const pair of targetedPairs) {
        await tx
          .delete(headToHeadRecords)
          .where(
            and(
              eq(headToHeadRecords.leagueId, input.leagueId),
              eq(headToHeadRecords.personAId, pair.personAId),
              eq(headToHeadRecords.personBId, pair.personBId),
            ),
          );
      }
      h2hRows = await insertHeadToHeadStats(tx, targetH2hRows);
      await completeStatsCalculation(tx, {
        ...h2hCalculation,
        rowsProcessed: h2hRows,
      });
    }

    const recordsCalculation = await startStatsCalculation(tx, {
      calculationType: "records",
      leagueId: input.leagueId,
      metadata: calculationMetadata,
    });
    const recordRefresh = await refreshAllTimeRecords(
      tx,
      input.leagueId,
      recordEvents({
        facts: state.weeklyFacts,
        headToHead: state.h2hRows,
        seasonRows: state.seasonStats,
      }),
    );
    const recordBookAggregateCount = await refreshRecordBookAggregates(tx, {
      leagueId: input.leagueId,
    });
    const aggregateRows =
      recordBookAggregateCount.standings + recordBookAggregateCount.milestones;
    await completeStatsCalculation(tx, {
      ...recordsCalculation,
      rowsProcessed: recordRefresh.records + aggregateRows,
    });

    return {
      headToHeadRecords: h2hRows,
      integrityChecks: integrity.checks,
      integrityFailures: integrity.failures,
      recordBookAggregates: aggregateRows,
      recordBrokenHooks: recordRefresh.recordBrokenHooks,
      records: recordRefresh.records,
      seasonStatistics: seasonRows,
      seasons: targetSeasons,
      targetedPairs: [...targetPairKeys].map(personPairFromKey),
      weeklyStatistics: weeklyRows,
    };
  });
}

export async function mergePersons(
  db: Db,
  input: {
    actorUserId?: string;
    leagueId: string;
    primaryPersonId: string;
    reason?: string;
    secondaryPersonId: string;
  },
): Promise<void> {
  await withLeagueContext(db, input.leagueId, async (tx) => {
    const rows = await tx
      .select()
      .from(persons)
      .where(
        and(
          eq(persons.leagueId, input.leagueId),
          inArray(persons.id, [input.primaryPersonId, input.secondaryPersonId]),
        ),
      );
    if (rows.length !== 2) {
      throw new Error("mergePersons: both person identities must exist");
    }

    await tx
      .update(identityMappings)
      .set({
        confidence: 1,
        method: "manual",
        personId: input.primaryPersonId,
        resolvedBy: input.actorUserId ?? "system",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(identityMappings.leagueId, input.leagueId),
          inArray(identityMappings.personId, [
            input.primaryPersonId,
            input.secondaryPersonId,
          ]),
        ),
      );
    await tx.insert(identityAuditLog).values({
      action: "merge",
      actorUserId: input.actorUserId ?? null,
      afterState: {
        primaryPersonId: input.primaryPersonId,
      },
      beforeState: {
        mergedPersonId: input.secondaryPersonId,
      },
      leagueId: input.leagueId,
      personId: input.primaryPersonId,
      reason: input.reason ?? "manual person merge",
    });
    await tx.delete(persons).where(eq(persons.id, input.secondaryPersonId));
  });
  await recomputeLeagueStatistics(db, { leagueId: input.leagueId });
}

export async function splitPerson(
  db: Db,
  input: {
    actorUserId?: string;
    leagueId: string;
    newCanonicalName: string;
    personId: string;
    reason?: string;
    teamSeasonIds: string[];
  },
): Promise<{ personId: string }> {
  let newPersonId = "";
  await withLeagueContext(db, input.leagueId, async (tx) => {
    const [created] = await tx
      .insert(persons)
      .values({
        canonicalName: input.newCanonicalName,
        leagueId: input.leagueId,
      })
      .returning({ id: persons.id });
    if (!created) {
      throw new Error("splitPerson: new person was not created");
    }
    newPersonId = created.id;
    await tx
      .update(identityMappings)
      .set({
        confidence: 1,
        method: "manual",
        personId: created.id,
        resolvedBy: input.actorUserId ?? "system",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(identityMappings.leagueId, input.leagueId),
          eq(identityMappings.personId, input.personId),
          inArray(identityMappings.teamSeasonId, input.teamSeasonIds),
        ),
      );
    await tx.insert(identityAuditLog).values({
      action: "split",
      actorUserId: input.actorUserId ?? null,
      afterState: {
        newPersonId: created.id,
        teamSeasonIds: input.teamSeasonIds,
      },
      beforeState: {
        personId: input.personId,
      },
      leagueId: input.leagueId,
      personId: input.personId,
      reason: input.reason ?? "manual person split",
    });
  });
  await recomputeLeagueStatistics(db, { leagueId: input.leagueId });
  return { personId: newPersonId };
}
