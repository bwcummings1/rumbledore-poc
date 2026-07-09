import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  fantasyRosterEntries,
  fantasyTeams,
  type LeagueFeedMatchedEntity,
  leagues,
} from "@/db/schema";
import type { CentralNewsPlayerRef } from "./interfaces";
import { upsertLeagueFeedReference } from "./league-feed";

export interface CentralNewsTailoringInput {
  contentItemIds: readonly string[];
}

export interface CentralNewsTailoringResult {
  contentItemsScanned: number;
  leaguesMatched: number;
  referencesUpserted: number;
  skippedNoPlayerRefs: number;
}

type CentralNewsTailoringRow = {
  id: string;
  metadata: Record<string, unknown>;
  summary: string;
  title: string;
};

type LeagueProvider = (typeof leagues.$inferSelect)["provider"];

type LeagueRow = {
  id: string;
  name: string;
  provider: LeagueProvider;
  providerLeagueId: string;
  season: number;
};

type RosterMatch = {
  playerLabel: string;
  provider: string;
  providerPlayerId: string;
  providerTeamId: string;
  teamLabel: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function playerRefsFromMetadata(
  metadata: Record<string, unknown>,
): CentralNewsPlayerRef[] {
  const value = metadata.playerRefs;
  if (!Array.isArray(value)) {
    return [];
  }

  const byKey = new Map<string, CentralNewsPlayerRef>();
  for (const item of value) {
    const record = asRecord(item);
    const provider = cleanText(record.provider).toLowerCase();
    const providerId = cleanText(record.providerId);
    const label = cleanText(record.label);
    if (!provider || !providerId) {
      continue;
    }

    const key = `${provider}\n${providerId}`;
    byKey.set(key, {
      provider,
      providerId,
      ...(label ? { label } : {}),
    });
  }

  return [...byKey.values()].sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) ||
      left.providerId.localeCompare(right.providerId),
  );
}

function refsForProvider(
  refs: readonly CentralNewsPlayerRef[],
  provider: string,
): CentralNewsPlayerRef[] {
  return refs.filter((ref) => ref.provider === provider);
}

function scoreFor(matches: readonly RosterMatch[]): number {
  const uniquePlayers = new Set(matches.map((match) => match.providerPlayerId));
  const uniqueTeams = new Set(matches.map((match) => match.providerTeamId));
  return Math.min(100, 55 + uniquePlayers.size * 10 + uniqueTeams.size * 5);
}

function reasonFor(matches: readonly RosterMatch[]): string {
  const teamLabels = sortedUnique(matches.map((match) => match.teamLabel));
  const playerLabels = sortedUnique(matches.map((match) => match.playerLabel));

  if (teamLabels.length === 1 && playerLabels.length === 1) {
    return `${teamLabels[0]} rosters ${playerLabels[0]}.`;
  }

  if (teamLabels.length === 1) {
    return `${teamLabels[0]} rosters ${playerLabels.length} players mentioned in this story.`;
  }

  return `${teamLabels.length} league teams roster ${playerLabels.length} players mentioned in this story.`;
}

function matchedEntitiesFor(
  matches: readonly RosterMatch[],
): LeagueFeedMatchedEntity[] {
  const entities = new Map<string, LeagueFeedMatchedEntity>();

  for (const match of matches) {
    entities.set(`player:${match.provider}:${match.providerPlayerId}`, {
      label: match.playerLabel,
      provider: match.provider,
      providerId: match.providerPlayerId,
      type: "player",
    });
    entities.set(`team:${match.provider}:${match.providerTeamId}`, {
      label: match.teamLabel,
      provider: match.provider,
      providerId: match.providerTeamId,
      type: "team",
    });
  }

  return [...entities.values()].sort(
    (left, right) =>
      left.type.localeCompare(right.type) ||
      (left.label ?? left.providerId).localeCompare(
        right.label ?? right.providerId,
      ),
  );
}

async function latestRosterScoringPeriod(
  db: Db,
  league: LeagueRow,
): Promise<number | null> {
  return withLeagueContext(db, league.id, async (tx) => {
    const [row] = await tx
      .select({
        scoringPeriod: sql<
          number | null
        >`max(${fantasyRosterEntries.scoringPeriod})`,
      })
      .from(fantasyRosterEntries)
      .where(
        and(
          eq(fantasyRosterEntries.leagueId, league.id),
          eq(fantasyRosterEntries.provider, league.provider),
          eq(fantasyRosterEntries.leagueProviderId, league.providerLeagueId),
          eq(fantasyRosterEntries.season, league.season),
        ),
      );

    const scoringPeriod = Number(row?.scoringPeriod ?? Number.NaN);
    return Number.isFinite(scoringPeriod) ? scoringPeriod : null;
  });
}

async function rosterMatchesForLeague({
  db,
  league,
  refs,
}: {
  db: Db;
  league: LeagueRow;
  refs: readonly CentralNewsPlayerRef[];
}): Promise<RosterMatch[]> {
  if (refs.length === 0) {
    return [];
  }

  const latestScoringPeriod = await latestRosterScoringPeriod(db, league);
  if (latestScoringPeriod === null) {
    return [];
  }

  const refByPlayerId = new Map(
    refs.map((ref) => [ref.providerId, ref] as const),
  );
  const providerPlayerIds = sortedUnique([...refByPlayerId.keys()]);

  return withLeagueContext(db, league.id, async (tx) => {
    const rows = await tx
      .select({
        provider: fantasyRosterEntries.provider,
        providerPlayerId: fantasyRosterEntries.providerPlayerId,
        providerTeamId: fantasyRosterEntries.providerTeamId,
        teamName: fantasyTeams.name,
      })
      .from(fantasyRosterEntries)
      .leftJoin(
        fantasyTeams,
        and(
          eq(fantasyTeams.leagueId, fantasyRosterEntries.leagueId),
          eq(fantasyTeams.provider, fantasyRosterEntries.provider),
          eq(
            fantasyTeams.leagueProviderId,
            fantasyRosterEntries.leagueProviderId,
          ),
          eq(fantasyTeams.providerTeamId, fantasyRosterEntries.providerTeamId),
          eq(fantasyTeams.season, fantasyRosterEntries.season),
        ),
      )
      .where(
        and(
          eq(fantasyRosterEntries.leagueId, league.id),
          eq(fantasyRosterEntries.provider, league.provider),
          eq(fantasyRosterEntries.leagueProviderId, league.providerLeagueId),
          eq(fantasyRosterEntries.season, league.season),
          eq(fantasyRosterEntries.scoringPeriod, latestScoringPeriod),
          inArray(fantasyRosterEntries.providerPlayerId, providerPlayerIds),
        ),
      )
      .orderBy(
        desc(fantasyRosterEntries.scoringPeriod),
        fantasyRosterEntries.providerTeamId,
        fantasyRosterEntries.providerPlayerId,
      );

    return rows.map((row) => {
      const ref = refByPlayerId.get(row.providerPlayerId);
      return {
        playerLabel: ref?.label ?? row.providerPlayerId,
        provider: row.provider,
        providerPlayerId: row.providerPlayerId,
        providerTeamId: row.providerTeamId,
        teamLabel: row.teamName ?? `Team ${row.providerTeamId}`,
      };
    });
  });
}

async function centralNewsRowsForTailoring(
  db: Db,
  contentItemIds: readonly string[],
): Promise<CentralNewsTailoringRow[]> {
  const ids = sortedUnique(contentItemIds);
  if (ids.length === 0) {
    return [];
  }

  return db
    .select({
      id: contentItems.id,
      metadata: contentItems.metadata,
      summary: contentItems.summary,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.id, ids),
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
        contentItemIsPublished(),
      ),
    );
}

async function leagueRows(db: Db): Promise<LeagueRow[]> {
  return db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues);
}

export async function tailorCentralNewsToLeagues(
  db: Db,
  input: CentralNewsTailoringInput,
): Promise<CentralNewsTailoringResult> {
  const rows = await centralNewsRowsForTailoring(db, input.contentItemIds);
  const allLeagues = await leagueRows(db);
  const matchedLeagueIds = new Set<string>();
  let referencesUpserted = 0;
  let skippedNoPlayerRefs = 0;

  for (const row of rows) {
    const refs = playerRefsFromMetadata(row.metadata);
    if (refs.length === 0) {
      skippedNoPlayerRefs += 1;
      continue;
    }

    for (const league of allLeagues) {
      const matches = await rosterMatchesForLeague({
        db,
        league,
        refs: refsForProvider(refs, league.provider),
      });
      if (matches.length === 0) {
        continue;
      }

      const reason = reasonFor(matches);
      await upsertLeagueFeedReference(db, {
        contentItemId: row.id,
        framingSummary: reason,
        leagueId: league.id,
        matchedEntities: matchedEntitiesFor(matches),
        reason,
        relevanceScore: scoreFor(matches),
      });
      matchedLeagueIds.add(league.id);
      referencesUpserted += 1;
    }
  }

  return {
    contentItemsScanned: rows.length,
    leaguesMatched: matchedLeagueIds.size,
    referencesUpserted,
    skippedNoPlayerRefs,
  };
}
