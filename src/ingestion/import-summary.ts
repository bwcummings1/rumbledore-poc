import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  allTimeRecords,
  dataIntegrityChecks,
  fantasyMatchups,
  identityMappings,
  leagueSeasonSettings,
  persons,
  recordBookAllTimeStandings,
  recordBookMilestones,
  teamSeasons,
} from "@/db/schema";

export interface ImportSummaryPerson {
  canonicalName: string;
  mappedSeasons: number[];
  ownerNames: string[];
  teamNames: string[];
}

export interface ImportSummarySeasonSettings {
  acquisitionBudget: number | null;
  acquisitionType: string | null;
  championshipScoringPeriod: number | null;
  leagueSize: number;
  lineupSlotCounts: Record<string, number>;
  matchupPeriodCount: number;
  playoffMatchupPeriodLength: number | null;
  playoffTeamCount: number | null;
  regularSeasonEndScoringPeriod: number | null;
  scoringType: string;
  season: number;
}

export interface ImportSummaryIntegrityCheck {
  checkKey: string;
  detail: Record<string, unknown>;
  season: number | null;
  status: string;
}

export interface ImportSummaryRecordCounts {
  allTimeRecords: number;
  recordBookAllTimeStandings: number;
  recordBookMilestones: number;
}

export interface ImportSummarySingleWeekRecord {
  holderName: string | null;
  scoringPeriod: number | null;
  season: number | null;
  value: number;
}

export interface ImportSummarySpanRow {
  count: number;
  maxScore: number;
  season: number;
}

export interface ImportSummaryData {
  identityMappings: number;
  integrityChecks: ImportSummaryIntegrityCheck[];
  persons: ImportSummaryPerson[];
  recordCounts: ImportSummaryRecordCounts;
  seasonSettings: ImportSummarySeasonSettings[];
  singleWeekRecord: ImportSummarySingleWeekRecord | null;
  spanRows: ImportSummarySpanRow[];
  teamSeasons: number;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function sortedUniqueNumbers(values: Iterable<number>): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right);
}

export async function loadImportSummaryData(
  db: Db,
  leagueId: string,
): Promise<ImportSummaryData> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const seasonSettings = await tx
      .select({
        acquisitionBudget: leagueSeasonSettings.acquisitionBudget,
        acquisitionType: leagueSeasonSettings.acquisitionType,
        championshipScoringPeriod:
          leagueSeasonSettings.championshipScoringPeriod,
        leagueSize: leagueSeasonSettings.leagueSize,
        lineupSlotCounts: leagueSeasonSettings.lineupSlotCounts,
        matchupPeriodCount: leagueSeasonSettings.matchupPeriodCount,
        playoffMatchupPeriodLength:
          leagueSeasonSettings.playoffMatchupPeriodLength,
        playoffTeamCount: leagueSeasonSettings.playoffTeamCount,
        regularSeasonEndScoringPeriod:
          leagueSeasonSettings.regularSeasonEndScoringPeriod,
        scoringType: leagueSeasonSettings.scoringType,
        season: leagueSeasonSettings.season,
      })
      .from(leagueSeasonSettings)
      .where(eq(leagueSeasonSettings.leagueId, leagueId))
      .orderBy(asc(leagueSeasonSettings.season));

    const personRows = await tx
      .select({
        canonicalName: persons.canonicalName,
        id: persons.id,
      })
      .from(persons)
      .where(eq(persons.leagueId, leagueId))
      .orderBy(asc(persons.canonicalName), asc(persons.id));
    const personNameById = new Map(
      personRows.map((person) => [person.id, person.canonicalName]),
    );

    const mappingRows = await tx
      .select({
        personId: identityMappings.personId,
        season: identityMappings.season,
        teamSeasonId: identityMappings.teamSeasonId,
      })
      .from(identityMappings)
      .where(eq(identityMappings.leagueId, leagueId));

    const teamSeasonIds = [
      ...new Set(mappingRows.map((row) => row.teamSeasonId)),
    ];
    const teamSeasonRows =
      teamSeasonIds.length === 0
        ? []
        : await tx
            .select({
              id: teamSeasons.id,
              ownerNames: teamSeasons.ownerNames,
              season: teamSeasons.season,
              teamName: teamSeasons.teamName,
            })
            .from(teamSeasons)
            .where(inArray(teamSeasons.id, teamSeasonIds));
    const teamSeasonById = new Map(teamSeasonRows.map((row) => [row.id, row]));
    const mappingsByPersonId = new Map<string, typeof mappingRows>();
    for (const mapping of mappingRows) {
      const existing = mappingsByPersonId.get(mapping.personId) ?? [];
      existing.push(mapping);
      mappingsByPersonId.set(mapping.personId, existing);
    }

    const integrityChecks = await tx
      .select({
        checkKey: dataIntegrityChecks.checkKey,
        detail: dataIntegrityChecks.detail,
        season: dataIntegrityChecks.season,
        status: dataIntegrityChecks.status,
      })
      .from(dataIntegrityChecks)
      .where(eq(dataIntegrityChecks.leagueId, leagueId))
      .orderBy(
        asc(dataIntegrityChecks.checkKey),
        asc(dataIntegrityChecks.season),
      );
    const recordRows = await tx
      .select({
        holderPersonId: allTimeRecords.holderPersonId,
        isCurrent: allTimeRecords.isCurrent,
        recordType: allTimeRecords.recordType,
        scoringPeriod: allTimeRecords.scoringPeriod,
        season: allTimeRecords.season,
        value: allTimeRecords.value,
      })
      .from(allTimeRecords)
      .where(eq(allTimeRecords.leagueId, leagueId));
    const currentSingleWeek = recordRows
      .filter(
        (row) =>
          row.recordType === "highest_single_week_score" && row.isCurrent,
      )
      .sort((left, right) => right.value - left.value)[0];
    const allTimeStandingRows = await tx
      .select({ id: recordBookAllTimeStandings.id })
      .from(recordBookAllTimeStandings)
      .where(eq(recordBookAllTimeStandings.leagueId, leagueId));
    const milestoneRows = await tx
      .select({ id: recordBookMilestones.id })
      .from(recordBookMilestones)
      .where(eq(recordBookMilestones.leagueId, leagueId));
    const spanMatchups = await tx
      .select({
        awayScore: fantasyMatchups.awayScore,
        homeScore: fantasyMatchups.homeScore,
        season: fantasyMatchups.season,
      })
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.leagueId, leagueId),
          inArray(fantasyMatchups.season, [2011, 2012]),
          eq(fantasyMatchups.scoringPeriodSpan, 2),
        ),
      );
    const spanRows = [2011, 2012].map((season) => {
      const rows = spanMatchups.filter((row) => row.season === season);
      return {
        count: rows.length,
        maxScore:
          rows.length === 0
            ? 0
            : Math.max(
                ...rows.flatMap((row) => [row.homeScore, row.awayScore]),
              ),
        season,
      };
    });

    return {
      identityMappings: mappingRows.length,
      integrityChecks,
      persons: personRows.map((person) => {
        const mappings = mappingsByPersonId.get(person.id) ?? [];
        const mappedTeamSeasons = mappings
          .map((mapping) => teamSeasonById.get(mapping.teamSeasonId))
          .filter((row): row is NonNullable<typeof row> => Boolean(row));
        return {
          canonicalName: person.canonicalName,
          mappedSeasons: sortedUniqueNumbers(
            mappedTeamSeasons.map((row) => row.season),
          ),
          ownerNames: sortedUnique(
            mappedTeamSeasons.flatMap((row) => row.ownerNames),
          ),
          teamNames: sortedUnique(mappedTeamSeasons.map((row) => row.teamName)),
        };
      }),
      recordCounts: {
        allTimeRecords: recordRows.length,
        recordBookAllTimeStandings: allTimeStandingRows.length,
        recordBookMilestones: milestoneRows.length,
      },
      seasonSettings,
      singleWeekRecord: currentSingleWeek
        ? {
            holderName: currentSingleWeek.holderPersonId
              ? (personNameById.get(currentSingleWeek.holderPersonId) ?? null)
              : null,
            scoringPeriod: currentSingleWeek.scoringPeriod,
            season: currentSingleWeek.season,
            value: currentSingleWeek.value,
          }
        : null,
      spanRows,
      teamSeasons: teamSeasonRows.length,
    };
  });
}
