import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  championshipRecords,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  headToHeadRecords,
  identityAuditLog,
  identityMappings,
  type PersonOwnerHistoryEntry,
  persons,
  seasonStatistics,
  statsCalculations,
  teamSeasons,
  weeklyStatistics,
} from "@/db/schema";
import { identityNameSimilarity } from "./fuzzy";

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
type WeeklyResult = "win" | "loss" | "tie";

interface ResolvedIdentityState {
  ownerMemberIds: Set<string>;
  ownerNames: Set<string>;
  personId: string;
  providerTeamIds: Set<string>;
  seasons: Set<number>;
  teamNames: Set<string>;
}

interface IdentityCandidate {
  confidence: number;
  method: "auto" | "fuzzy";
  personId: string;
}

interface WeeklyFact {
  isBottomScorer: boolean;
  isChampionship: boolean;
  isPlayoff: boolean;
  isTopScorer: boolean;
  leagueId: string;
  margin: number;
  matchupId: string;
  opponentPersonId: string;
  personId: string;
  pointsAgainst: number;
  pointsFor: number;
  result: WeeklyResult;
  scoringPeriod: number;
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

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort(compareStable);
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

  for (const state of states) {
    const hasOwnerOverlap = overlap(
      state.ownerMemberIds,
      teamSeason.ownerMemberIds,
    );
    if (!hasOwnerOverlap && state.seasons.has(teamSeason.season)) {
      continue;
    }
    const sameProviderSlot = state.providerTeamIds.has(
      teamSeason.providerTeamId,
    );
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

    if (hasOwnerOverlap) {
      confidence = 1;
      method = "auto";
    } else if (
      sameProviderSlot &&
      (!bothHaveOwnerIds || ownerSimilarity >= 0.85)
    ) {
      confidence = Math.max(0.86, ownerSimilarity * 0.7 + teamSimilarity * 0.3);
      method = "auto";
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
    };

    if (
      !best ||
      candidate.confidence > best.confidence ||
      (candidate.confidence === best.confidence &&
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
      scoringPeriod: fantasyMatchups.scoringPeriod,
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

function rankWeeklyFacts(facts: WeeklyFact[]): WeeklyFact[] {
  const byWeek = new Map<string, WeeklyFact[]>();
  for (const fact of facts) {
    const key = `${fact.season}:${fact.scoringPeriod}`;
    const weekly = byWeek.get(key) ?? [];
    weekly.push(fact);
    byWeek.set(key, weekly);
  }

  for (const weekly of byWeek.values()) {
    const sorted = [...weekly].sort(
      (left, right) =>
        right.pointsFor - left.pointsFor ||
        compareStable(left.personId, right.personId),
    );
    const maxScore = sorted[0]?.pointsFor;
    const minScore = sorted.at(-1)?.pointsFor;
    for (const [index, fact] of sorted.entries()) {
      fact.weeklyRank = index + 1;
      fact.isTopScorer = fact.pointsFor === maxScore;
      fact.isBottomScorer = fact.pointsFor === minScore;
    }
  }

  return facts;
}

function buildWeeklyFacts({
  leagueId,
  mappings,
  matchups,
  teamSeasonByIdentity,
}: {
  leagueId: string;
  mappings: readonly IdentityMappingRow[];
  matchups: Awaited<ReturnType<typeof loadFinalMatchups>>;
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
    facts.push({
      isBottomScorer: false,
      isChampionship: false,
      isPlayoff: false,
      isTopScorer: false,
      leagueId,
      margin: round(homeScore - awayScore, 2),
      matchupId: matchup.id,
      opponentPersonId: awayMapping.personId,
      personId: homeMapping.personId,
      pointsAgainst: awayScore,
      pointsFor: homeScore,
      result: toWeeklyResult(homeScore, awayScore),
      scoringPeriod: matchup.scoringPeriod,
      season: matchup.season,
      teamSeasonId: homeTeamSeason.id,
      weeklyRank: 0,
    });
    facts.push({
      isBottomScorer: false,
      isChampionship: false,
      isPlayoff: false,
      isTopScorer: false,
      leagueId,
      margin: round(awayScore - homeScore, 2),
      matchupId: matchup.id,
      opponentPersonId: homeMapping.personId,
      personId: awayMapping.personId,
      pointsAgainst: homeScore,
      pointsFor: awayScore,
      result: toWeeklyResult(awayScore, homeScore),
      scoringPeriod: matchup.scoringPeriod,
      season: matchup.season,
      teamSeasonId: awayTeamSeason.id,
      weeklyRank: 0,
    });
  }

  return rankWeeklyFacts(facts);
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
    for (const fact of weeklyFacts) {
      const key = `${fact.personId}:${fact.season}`;
      const entry = allPlay.get(key) ?? {
        expectedWins: 0,
        losses: 0,
        ties: 0,
        wins: 0,
      };
      const opponents = weeklyFacts.filter(
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
      avgPointsAgainst: round(pointsAgainst / games, 2),
      avgPointsFor: round(pointsFor / games, 2),
      currentStreakLength,
      currentStreakType,
      divisionWinner: false,
      expectedWins,
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
      row.finalRank = index + 1;
      row.madePlayoffs = index < playoffCut;
      row.madeChampionship = index < 2;
      row.finalPlacement =
        index === 0
          ? "champ"
          : index === 1
            ? "runner_up"
            : index === 2
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

async function insertRecordEvents(
  tx: LeagueScopedTx,
  leagueId: string,
  events: readonly RecordEvent[],
): Promise<number> {
  const byType = new Map<RecordType, RecordEvent[]>();
  for (const event of events) {
    byType.set(event.recordType, [
      ...(byType.get(event.recordType) ?? []),
      event,
    ]);
  }

  let rows = 0;
  for (const [recordType, typeEvents] of byType) {
    let previousRecordId: string | null = null;
    const sorted = [...typeEvents].sort((left, right) =>
      compareStable(left.sortKey, right.sortKey),
    );
    for (const [index, event] of sorted.entries()) {
      const insertedRows: { id: string }[] = await tx
        .insert(allTimeRecords)
        .values({
          holderPersonId: event.holderPersonId,
          isCurrent: index === sorted.length - 1,
          leagueId,
          metadata: {
            label: RECORD_TYPE_LABELS[recordType],
            sortKey: event.sortKey,
            ...(event.metadata ?? {}),
          },
          opponentPersonId: event.opponentPersonId ?? null,
          previousRecordId,
          recordType,
          scoringPeriod: event.scoringPeriod ?? null,
          season: event.season ?? null,
          value: round(event.value, 4),
        })
        .returning({ id: allTimeRecords.id });
      const inserted = insertedRows[0];
      previousRecordId = inserted?.id ?? null;
      rows += 1;
    }
  }

  return rows;
}

export async function recomputeLeagueStatistics(
  db: Db,
  input: { leagueId: string },
): Promise<{
  headToHeadRecords: number;
  records: number;
  seasonStatistics: number;
  weeklyStatistics: number;
}> {
  await resolveLeagueIdentities(db, input);
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const startedAt = Date.now();
    const [calculation] = await tx
      .insert(statsCalculations)
      .values({
        calculationType: "all",
        leagueId: input.leagueId,
        status: "running",
      })
      .returning({ id: statsCalculations.id });
    if (!calculation) {
      throw new Error("stats calculation log was not created");
    }

    await tx
      .delete(allTimeRecords)
      .where(eq(allTimeRecords.leagueId, input.leagueId));
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

    const seasonRows = await tx
      .select()
      .from(teamSeasons)
      .where(eq(teamSeasons.leagueId, input.leagueId));
    const mappingRows = await tx
      .select()
      .from(identityMappings)
      .where(eq(identityMappings.leagueId, input.leagueId));
    const matchups = await loadFinalMatchups(tx, input.leagueId);
    const teamSeasonByIdentity = new Map(
      seasonRows.map((row) => [
        identityKey(row.providerTeamId, row.season),
        row,
      ]),
    );
    const weeklyFacts = buildWeeklyFacts({
      leagueId: input.leagueId,
      mappings: mappingRows,
      matchups,
      teamSeasonByIdentity,
    });

    if (weeklyFacts.length > 0) {
      await tx.insert(weeklyStatistics).values(
        weeklyFacts.map((fact) => ({
          isBottomScorer: fact.isBottomScorer,
          isChampionship: fact.isChampionship,
          isPlayoff: fact.isPlayoff,
          leagueId: fact.leagueId,
          margin: fact.margin,
          matchupId: fact.matchupId,
          opponentPersonId: fact.opponentPersonId,
          personId: fact.personId,
          pointsAgainst: fact.pointsAgainst,
          pointsFor: fact.pointsFor,
          result: fact.result,
          scoringPeriod: fact.scoringPeriod,
          season: fact.season,
          teamSeasonId: fact.teamSeasonId,
          weeklyRank: fact.weeklyRank,
          isTopScorer: fact.isTopScorer,
        })),
      );
    }

    const seasonStats = buildSeasonStats(weeklyFacts, input.leagueId);
    if (seasonStats.length > 0) {
      await tx.insert(seasonStatistics).values(
        seasonStats.map((row) => ({
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
          pointsAgainst: row.pointsAgainst,
          pointsFor: row.pointsFor,
          scoringStdDev: row.scoringStdDev,
          season: row.season,
          ties: row.ties,
          winPercentage: row.winPercentage,
          wins: row.wins,
        })),
      );
    }

    const h2hRows = headToHeadRows(weeklyFacts, input.leagueId);
    if (h2hRows.length > 0) {
      await tx.insert(headToHeadRecords).values(h2hRows);
    }

    const champions = seasonStats.filter((row) => row.finalRank > 0);
    const championRows = new Map<number, SeasonStat[]>();
    for (const row of champions) {
      championRows.set(row.season, [
        ...(championRows.get(row.season) ?? []),
        row,
      ]);
    }
    for (const [season, rows] of championRows) {
      const sorted = [...rows].sort(
        (left, right) =>
          left.finalRank - right.finalRank ||
          compareStable(left.personId, right.personId),
      );
      await tx.insert(championshipRecords).values({
        championPersonId: sorted[0]?.personId ?? null,
        championshipScore: sorted[0]?.highestScore ?? null,
        leagueId: input.leagueId,
        regularSeasonWinnerPersonId: sorted[0]?.personId ?? null,
        runnerUpPersonId: sorted[1]?.personId ?? null,
        runnerUpScore: sorted[1]?.highestScore ?? null,
        season,
        thirdPlacePersonId: sorted[2]?.personId ?? null,
      });
    }

    const recordCount = await insertRecordEvents(
      tx,
      input.leagueId,
      recordEvents({
        facts: weeklyFacts,
        headToHead: h2hRows,
        seasonRows: seasonStats,
      }),
    );
    const rowsProcessed =
      weeklyFacts.length + seasonStats.length + h2hRows.length + recordCount;

    await tx
      .update(statsCalculations)
      .set({
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
        rowsProcessed,
        status: "completed",
      })
      .where(eq(statsCalculations.id, calculation.id));

    return {
      headToHeadRecords: h2hRows.length,
      records: recordCount,
      seasonStatistics: seasonStats.length,
      weeklyStatistics: weeklyFacts.length,
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
