import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  identityMappings,
  leagueSeasonSettings,
  persons,
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

export interface ImportSummaryData {
  identityMappings: number;
  persons: ImportSummaryPerson[];
  seasonSettings: ImportSummarySeasonSettings[];
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

    return {
      identityMappings: mappingRows.length,
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
      seasonSettings,
      teamSeasons: teamSeasonRows.length,
    };
  });
}
