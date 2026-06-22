import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { LeagueRole } from "@/auth/guards";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  identityMappings,
  leagueSeasonSettings,
  persons,
  teamSeasons,
} from "@/db/schema";
import {
  type CommissionerMemberSummary,
  listCommissionerHandoffCandidates,
  listLeagueSeasonGroupings,
  listUnifiedDataLedger,
  type PersistedSeasonGrouping,
  proposeLeagueSeasonGroupings,
  type UnifiedLedgerEntry,
} from "@/stats";

export interface CurationPerson {
  canonicalName: string;
  id: string;
  ownerHistoryCount: number;
  seasons: number[];
}

export interface CurationTeamSeason {
  id: string;
  ownerNames: string[];
  personId: string | null;
  personName: string | null;
  providerTeamId: string;
  season: number;
  teamName: string;
}

export interface CurationMatchupSpan {
  awayScore: number;
  awayTeamName: string;
  homeScore: number;
  homeTeamName: string;
  id: string;
  matchupPeriodCount: number;
  periodStart: number | null;
  scoringPeriod: number;
  scoringPeriodSpan: number;
  season: number;
  status: string;
}

export interface DataCurationSummary {
  access: {
    canConfirmGroupings: boolean;
    canEditData: boolean;
    canHandoffCommissioner: boolean;
    role: LeagueRole;
  };
  commissionerCandidates: CommissionerMemberSummary[];
  groupings: PersistedSeasonGrouping[];
  ledger: UnifiedLedgerEntry[];
  matchupSpans: CurationMatchupSpan[];
  persons: CurationPerson[];
  teamSeasons: CurationTeamSeason[];
}

function canEditData(role: LeagueRole): boolean {
  switch (role) {
    case "commissioner":
    case "data_steward":
    case "league_admin":
      return true;
    case "member":
      return false;
  }
}

function teamLookupKey(season: number, providerTeamId: string): string {
  return `${season}:${providerTeamId}`;
}

async function loadCurationRows(
  db: Db,
  leagueId: string,
): Promise<
  Pick<DataCurationSummary, "matchupSpans" | "persons" | "teamSeasons">
> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const personRows = await tx
      .select({
        canonicalName: persons.canonicalName,
        id: persons.id,
        ownerHistory: persons.ownerHistory,
      })
      .from(persons)
      .where(eq(persons.leagueId, leagueId))
      .orderBy(asc(persons.canonicalName), asc(persons.id));

    const teamRows = await tx
      .select({
        id: teamSeasons.id,
        ownerNames: teamSeasons.ownerNames,
        providerTeamId: teamSeasons.providerTeamId,
        season: teamSeasons.season,
        teamName: teamSeasons.teamName,
      })
      .from(teamSeasons)
      .where(eq(teamSeasons.leagueId, leagueId))
      .orderBy(desc(teamSeasons.season), asc(teamSeasons.teamName));

    const mappingRows =
      teamRows.length > 0
        ? await tx
            .select({
              personId: identityMappings.personId,
              teamSeasonId: identityMappings.teamSeasonId,
            })
            .from(identityMappings)
            .where(
              and(
                eq(identityMappings.leagueId, leagueId),
                inArray(
                  identityMappings.teamSeasonId,
                  teamRows.map((row) => row.id),
                ),
              ),
            )
        : [];

    const settingsRows = await tx
      .select({
        matchupPeriodCount: leagueSeasonSettings.matchupPeriodCount,
        season: leagueSeasonSettings.season,
      })
      .from(leagueSeasonSettings)
      .where(eq(leagueSeasonSettings.leagueId, leagueId));

    const matchupRows = await tx
      .select({
        awayScore: fantasyMatchups.awayScore,
        awayTeamProviderId: fantasyMatchups.awayTeamProviderId,
        homeScore: fantasyMatchups.homeScore,
        homeTeamProviderId: fantasyMatchups.homeTeamProviderId,
        id: fantasyMatchups.id,
        periodStart: fantasyMatchups.periodStart,
        scoringPeriod: fantasyMatchups.scoringPeriod,
        scoringPeriodSpan: fantasyMatchups.scoringPeriodSpan,
        season: fantasyMatchups.season,
        status: fantasyMatchups.status,
      })
      .from(fantasyMatchups)
      .where(eq(fantasyMatchups.leagueId, leagueId))
      .orderBy(
        desc(fantasyMatchups.season),
        desc(fantasyMatchups.scoringPeriod),
      )
      .limit(16);

    const personById = new Map(
      personRows.map((row) => [row.id, row.canonicalName]),
    );
    const seasonsByPerson = new Map<string, Set<number>>();
    const personByTeamSeason = new Map(
      mappingRows.map((row) => [row.teamSeasonId, row.personId]),
    );
    const teamNameBySeasonProvider = new Map<string, string>();

    for (const row of teamRows) {
      const personId = personByTeamSeason.get(row.id);
      if (personId) {
        const seasons = seasonsByPerson.get(personId) ?? new Set<number>();
        seasons.add(row.season);
        seasonsByPerson.set(personId, seasons);
      }
      teamNameBySeasonProvider.set(
        teamLookupKey(row.season, row.providerTeamId),
        row.teamName,
      );
    }

    const matchupPeriodCountBySeason = new Map(
      settingsRows.map((row) => [row.season, row.matchupPeriodCount]),
    );

    return {
      matchupSpans: matchupRows.map((row) => ({
        awayScore: row.awayScore,
        awayTeamName: row.awayTeamProviderId
          ? (teamNameBySeasonProvider.get(
              teamLookupKey(row.season, row.awayTeamProviderId),
            ) ?? `Team ${row.awayTeamProviderId}`)
          : "BYE",
        homeScore: row.homeScore,
        homeTeamName:
          teamNameBySeasonProvider.get(
            teamLookupKey(row.season, row.homeTeamProviderId),
          ) ?? `Team ${row.homeTeamProviderId}`,
        id: row.id,
        matchupPeriodCount: matchupPeriodCountBySeason.get(row.season) ?? 1,
        periodStart: row.periodStart,
        scoringPeriod: row.scoringPeriod,
        scoringPeriodSpan: row.scoringPeriodSpan,
        season: row.season,
        status: row.status,
      })),
      persons: personRows.map((row) => ({
        canonicalName: row.canonicalName,
        id: row.id,
        ownerHistoryCount: row.ownerHistory.length,
        seasons: [...(seasonsByPerson.get(row.id) ?? [])].sort(
          (left, right) => left - right,
        ),
      })),
      teamSeasons: teamRows.map((row) => {
        const personId = personByTeamSeason.get(row.id) ?? null;
        return {
          id: row.id,
          ownerNames: row.ownerNames,
          personId,
          personName: personId ? (personById.get(personId) ?? null) : null,
          providerTeamId: row.providerTeamId,
          season: row.season,
          teamName: row.teamName,
        };
      }),
    };
  });
}

export async function loadDataCurationSummary(
  db: Db,
  input: { leagueId: string; userRole: LeagueRole },
): Promise<DataCurationSummary> {
  const canEdit = canEditData(input.userRole);
  const canConfirmGroupings = input.userRole === "commissioner";

  const rows = await loadCurationRows(db, input.leagueId);
  const groupings = canConfirmGroupings
    ? await proposeLeagueSeasonGroupings(db, { leagueId: input.leagueId })
    : await listLeagueSeasonGroupings(db, { leagueId: input.leagueId });
  const ledger = await listUnifiedDataLedger(db, {
    leagueId: input.leagueId,
    limit: 100,
  });
  const candidatesResult = canConfirmGroupings
    ? await listCommissionerHandoffCandidates(db, { leagueId: input.leagueId })
    : { ok: true as const, value: [] };
  if (!candidatesResult.ok) {
    throw candidatesResult.error;
  }

  return {
    access: {
      canConfirmGroupings,
      canEditData: canEdit,
      canHandoffCommissioner: canConfirmGroupings,
      role: input.userRole,
    },
    commissionerCandidates: candidatesResult.value,
    groupings,
    ledger,
    matchupSpans: rows.matchupSpans,
    persons: rows.persons,
    teamSeasons: rows.teamSeasons,
  };
}
