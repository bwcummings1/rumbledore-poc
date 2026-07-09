import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  fantasyRosterEntries,
  fantasyTeams,
  leagueMemberIdentityClaims,
  leagues,
  members,
} from "@/db/schema";
import { articleHeroImageUrl, articleTags } from "./article-metadata";
import { editorialImportance, publicationRankScore } from "./front";
import type { CentralNewsPlayerRef } from "./interfaces";
import { resolveCentralPublicationSection } from "./sections";

export type NewsWireMode = "general" | "personal";

export type NewsWireStatus =
  | "empty"
  | "no_matches"
  | "no_rosters"
  | "ready"
  | "signed_out";

export interface NewsWireItem {
  readonly href: string;
  readonly id: string;
  readonly matchedLabels?: readonly string[];
  readonly publishedAt: string;
  readonly section: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly tags: readonly string[];
  readonly thumbnailUrl?: string;
  readonly title: string;
}

export interface NewsWireData {
  readonly items: readonly NewsWireItem[];
  readonly mode: NewsWireMode;
  readonly rosteredPlayerCount?: number;
  readonly status: NewsWireStatus;
}

type CentralNewsWireRow = {
  id: string;
  metadata: Record<string, unknown>;
  publishedAt: Date;
  source: string | null;
  sourceUrl: string | null;
  summary: string;
  title: string;
};

type LeagueMembershipRow = {
  id: string;
  provider: (typeof leagues.$inferSelect)["provider"];
  providerLeagueId: string;
  season: number;
};

interface RosteredPlayerRefsResult {
  readonly playerRefs: readonly CentralNewsPlayerRef[];
  readonly teamCount: number;
}

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 24;
const CANDIDATE_LIMIT = 150;

function boundedLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIMIT);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function playerLabelFromMetadata(
  metadata: Record<string, unknown>,
): string | null {
  for (const key of ["playerName", "fullName", "name", "displayName"]) {
    const label = cleanText(metadata[key]);
    if (label) {
      return label;
    }
  }

  return null;
}

function playerRefKey(
  ref: Pick<CentralNewsPlayerRef, "provider" | "providerId">,
): string {
  return `${ref.provider.toLowerCase()}\n${ref.providerId}`;
}

function playerRefsFromMetadata(
  metadata: Record<string, unknown>,
): CentralNewsPlayerRef[] {
  if (!Array.isArray(metadata.playerRefs)) {
    return [];
  }

  const refs = new Map<string, CentralNewsPlayerRef>();
  for (const item of metadata.playerRefs) {
    const record = asRecord(item);
    const provider = cleanText(record.provider).toLowerCase();
    const providerId = cleanText(record.providerId);
    const label = cleanText(record.label);
    if (!provider || !providerId) {
      continue;
    }

    refs.set(`${provider}\n${providerId}`, {
      provider,
      providerId,
      ...(label ? { label } : {}),
    });
  }

  return [...refs.values()].sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) ||
      left.providerId.localeCompare(right.providerId),
  );
}

function newsWireItemFromRow(
  row: CentralNewsWireRow,
  input: { matchedLabels?: readonly string[] } = {},
): NewsWireItem {
  const section = resolveCentralPublicationSection({
    metadata: row.metadata,
    summary: row.summary,
    title: row.title,
  });
  const thumbnailUrl = articleHeroImageUrl(row.metadata);

  return {
    href: `/news/articles/${row.id}`,
    id: row.id,
    ...(input.matchedLabels && input.matchedLabels.length > 0
      ? { matchedLabels: input.matchedLabels }
      : {}),
    publishedAt: row.publishedAt.toISOString(),
    section: section.label,
    source: row.source ?? "Central news",
    sourceUrl: row.sourceUrl ?? "",
    tags: articleTags(row.metadata),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    title: row.title,
  };
}

function rankRows(rows: readonly CentralNewsWireRow[]): CentralNewsWireRow[] {
  return [...rows].sort((left, right) => {
    const leftPublishedAt = left.publishedAt.toISOString();
    const rightPublishedAt = right.publishedAt.toISOString();

    return (
      publicationRankScore({
        editorialImportance: editorialImportance(right.metadata),
        publishedAt: rightPublishedAt,
      }) -
        publicationRankScore({
          editorialImportance: editorialImportance(left.metadata),
          publishedAt: leftPublishedAt,
        }) ||
      Date.parse(rightPublishedAt) - Date.parse(leftPublishedAt) ||
      left.title.localeCompare(right.title)
    );
  });
}

async function centralNewsRows(db: Db): Promise<CentralNewsWireRow[]> {
  return db
    .select({
      id: contentItems.id,
      metadata: contentItems.metadata,
      publishedAt: contentItems.publishedAt,
      source: contentItems.source,
      sourceUrl: contentItems.sourceUrl,
      summary: contentItems.summary,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(
      and(
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
        contentItemIsPublished(),
      ),
    )
    .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
    .limit(CANDIDATE_LIMIT);
}

async function userLeagueMemberships(
  db: Db,
  userId: string,
): Promise<LeagueMembershipRow[]> {
  return db
    .select({
      id: leagues.id,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(members)
    .innerJoin(leagues, eq(leagues.id, members.organizationId))
    .where(eq(members.userId, userId));
}

async function rosteredPlayerRefsForLeague(
  db: Db,
  league: LeagueMembershipRow,
  userId: string,
): Promise<RosteredPlayerRefsResult> {
  return withLeagueContext(db, league.id, async (tx) => {
    const claims = await tx
      .select({
        providerMemberId: leagueMemberIdentityClaims.providerMemberId,
        providerTeamIds: leagueMemberIdentityClaims.providerTeamIds,
      })
      .from(leagueMemberIdentityClaims)
      .where(
        and(
          eq(leagueMemberIdentityClaims.leagueId, league.id),
          eq(leagueMemberIdentityClaims.userId, userId),
          eq(leagueMemberIdentityClaims.provider, league.provider),
        ),
      );

    if (claims.length === 0) {
      return { playerRefs: [], teamCount: 0 };
    }

    const claimMemberIds = new Set(
      claims.map((claim) => claim.providerMemberId),
    );
    const claimedTeamIds = new Set(
      claims.flatMap((claim) => claim.providerTeamIds),
    );

    const teams = await tx
      .select({
        ownerMemberIds: fantasyTeams.ownerMemberIds,
        providerTeamId: fantasyTeams.providerTeamId,
      })
      .from(fantasyTeams)
      .where(
        and(
          eq(fantasyTeams.leagueId, league.id),
          eq(fantasyTeams.provider, league.provider),
          eq(fantasyTeams.leagueProviderId, league.providerLeagueId),
          eq(fantasyTeams.season, league.season),
        ),
      );

    const rosteredTeamIds = sortedUnique(
      teams.flatMap((team) =>
        claimedTeamIds.has(team.providerTeamId) ||
        team.ownerMemberIds.some((ownerMemberId) =>
          claimMemberIds.has(ownerMemberId),
        )
          ? [team.providerTeamId]
          : [],
      ),
    );

    if (rosteredTeamIds.length === 0) {
      return { playerRefs: [], teamCount: 0 };
    }

    const [latest] = await tx
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
          inArray(fantasyRosterEntries.providerTeamId, rosteredTeamIds),
        ),
      );

    const scoringPeriod = Number(latest?.scoringPeriod ?? Number.NaN);
    if (!Number.isFinite(scoringPeriod)) {
      return { playerRefs: [], teamCount: rosteredTeamIds.length };
    }

    const rosterRows = await tx
      .select({
        metadata: fantasyRosterEntries.metadata,
        provider: fantasyRosterEntries.provider,
        providerPlayerId: fantasyRosterEntries.providerPlayerId,
      })
      .from(fantasyRosterEntries)
      .where(
        and(
          eq(fantasyRosterEntries.leagueId, league.id),
          eq(fantasyRosterEntries.provider, league.provider),
          eq(fantasyRosterEntries.leagueProviderId, league.providerLeagueId),
          eq(fantasyRosterEntries.season, league.season),
          eq(fantasyRosterEntries.scoringPeriod, scoringPeriod),
          inArray(fantasyRosterEntries.providerTeamId, rosteredTeamIds),
        ),
      )
      .orderBy(
        fantasyRosterEntries.providerTeamId,
        fantasyRosterEntries.providerPlayerId,
      );

    const refs = new Map<string, CentralNewsPlayerRef>();
    for (const row of rosterRows) {
      const ref = {
        label: playerLabelFromMetadata(row.metadata) ?? row.providerPlayerId,
        provider: row.provider,
        providerId: row.providerPlayerId,
      };
      refs.set(playerRefKey(ref), ref);
    }

    return {
      playerRefs: [...refs.values()],
      teamCount: rosteredTeamIds.length,
    };
  });
}

async function userRosteredPlayerRefs(
  db: Db,
  userId: string,
): Promise<RosteredPlayerRefsResult> {
  const leagues = await userLeagueMemberships(db, userId);
  const refs = new Map<string, CentralNewsPlayerRef>();
  let teamCount = 0;

  for (const league of leagues) {
    const scoped = await rosteredPlayerRefsForLeague(db, league, userId);
    teamCount += scoped.teamCount;
    for (const ref of scoped.playerRefs) {
      refs.set(playerRefKey(ref), ref);
    }
  }

  return {
    playerRefs: [...refs.values()],
    teamCount,
  };
}

function matchedPersonalRefs(
  row: CentralNewsWireRow,
  rosteredRefs: ReadonlyMap<string, CentralNewsPlayerRef>,
): readonly string[] {
  return sortedUnique(
    playerRefsFromMetadata(row.metadata).flatMap((ref) => {
      const matched = rosteredRefs.get(playerRefKey(ref));
      return matched ? [matched.label ?? ref.label ?? ref.providerId] : [];
    }),
  );
}

async function generalNewsWireData(
  db: Db,
  input: { limit: number },
): Promise<NewsWireData> {
  const items = rankRows(await centralNewsRows(db))
    .slice(0, input.limit)
    .map((row) => newsWireItemFromRow(row));

  return {
    items,
    mode: "general",
    status: items.length > 0 ? "ready" : "empty",
  };
}

async function personalNewsWireData(
  db: Db,
  input: { limit: number; userId: string | null | undefined },
): Promise<NewsWireData> {
  if (!input.userId) {
    return { items: [], mode: "personal", status: "signed_out" };
  }

  const rostered = await userRosteredPlayerRefs(db, input.userId);
  if (rostered.playerRefs.length === 0) {
    return {
      items: [],
      mode: "personal",
      rosteredPlayerCount: 0,
      status: rostered.teamCount > 0 ? "no_matches" : "no_rosters",
    };
  }

  const rosteredRefs = new Map(
    rostered.playerRefs.map((ref) => [playerRefKey(ref), ref] as const),
  );
  const items = rankRows(await centralNewsRows(db))
    .flatMap((row) => {
      const matchedLabels = matchedPersonalRefs(row, rosteredRefs);
      return matchedLabels.length > 0
        ? [newsWireItemFromRow(row, { matchedLabels })]
        : [];
    })
    .slice(0, input.limit);

  return {
    items,
    mode: "personal",
    rosteredPlayerCount: rostered.playerRefs.length,
    status: items.length > 0 ? "ready" : "no_matches",
  };
}

export async function getNewsWireData(
  db: Db,
  input: {
    limit?: number;
    mode?: NewsWireMode;
    userId?: string | null;
  } = {},
): Promise<NewsWireData> {
  const limit = boundedLimit(input.limit);
  const mode = input.mode ?? "general";

  if (mode === "personal") {
    return personalNewsWireData(db, { limit, userId: input.userId });
  }

  return generalNewsWireData(db, { limit });
}
