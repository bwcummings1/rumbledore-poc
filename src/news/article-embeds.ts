import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  type ContentEmbed,
  contentEmbedKey,
  normalizeContentEmbed,
} from "@/content/embeds";
import type { LeagueScopedTx } from "@/db/rls";
import {
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  identityMappings,
  persons,
  seasonStatistics,
  weeklyStatistics,
} from "@/db/schema";
import type {
  PublicationArticleBodyBlock,
  PublicationArticleEmbed,
  PublicationArticleH2HPoint,
  PublicationArticleScoreboardEmbed,
  PublicationArticleScoreboardMatchup,
  PublicationArticleStandingsMovementEmbed,
  PublicationArticleStandingsMovementRow,
} from "./article-embed-types";

type RawArticleBodyBlock =
  | Exclude<PublicationArticleBodyBlock, { type: "embed" }>
  | {
      embed: ContentEmbed | null;
      id: string;
      type: "embed";
    };

type FantasyTeamRow = Pick<
  typeof fantasyTeams.$inferSelect,
  | "abbrev"
  | "losses"
  | "name"
  | "ownerMemberIds"
  | "pointsAgainst"
  | "pointsFor"
  | "providerTeamId"
  | "ties"
  | "wins"
>;

type FantasyMemberRow = Pick<
  typeof fantasyMembers.$inferSelect,
  "displayName" | "providerMemberId"
>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function rawArticleBodyBlockValues(metadata: unknown): unknown[] {
  const record = asRecord(metadata);
  const article = asRecord(record.article);
  const articleBlocks = asArray(article.bodyBlocks);
  if (articleBlocks.length > 0) {
    return articleBlocks;
  }
  return asArray(record.bodyBlocks);
}

function parseRawTextBlock(record: Record<string, unknown>) {
  switch (cleanText(record.type)) {
    case "heading": {
      const text = cleanText(record.text);
      return text ? ({ text, type: "heading" } as const) : null;
    }
    case "paragraph": {
      const text = cleanText(record.text);
      return text ? ({ text, type: "paragraph" } as const) : null;
    }
    case "quote": {
      const text = cleanText(record.text);
      return text ? ({ text, type: "quote" } as const) : null;
    }
    case "list": {
      const items = asArray(record.items).map(cleanText).filter(Boolean);
      return items.length > 0
        ? ({ items, ordered: record.ordered === true, type: "list" } as const)
        : null;
    }
    default:
      return null;
  }
}

function parseRawEmbedBlock(
  record: Record<string, unknown>,
  index: number,
): RawArticleBodyBlock | null {
  if (cleanText(record.type) !== "embed") {
    return null;
  }

  const rawEmbed = asRecord(record.embed);
  const embed = normalizeContentEmbed(rawEmbed);
  const rawKind = cleanText(
    rawEmbed.kind ?? rawEmbed.type ?? rawEmbed.embedType,
  );
  return {
    embed,
    id: embed ? contentEmbedKey(embed, index) : `unknown:${rawKind}:${index}`,
    type: "embed",
  };
}

function parseStructuredArticleBodyBlocks(
  metadata: unknown,
): RawArticleBodyBlock[] {
  return rawArticleBodyBlockValues(metadata).flatMap((block, index) => {
    const record = asRecord(block);
    const textBlock = parseRawTextBlock(record);
    if (textBlock) {
      return [textBlock];
    }
    const embedBlock = parseRawEmbedBlock(record, index);
    return embedBlock ? [embedBlock] : [];
  });
}

export function unresolvedArticleBodyBlocks(
  metadata: unknown,
): PublicationArticleBodyBlock[] {
  return parseStructuredArticleBodyBlocks(metadata).map((block) =>
    block.type === "embed"
      ? { embed: { id: block.id, kind: "unknown" }, type: "embed" }
      : block,
  );
}

function managerNamesFor(
  ownerMemberIds: readonly string[],
  membersByProviderId: ReadonlyMap<string, string>,
): string[] {
  const names = ownerMemberIds
    .map((ownerId) => membersByProviderId.get(ownerId))
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names : ["Unknown manager"];
}

function standingsSort(left: FantasyTeamRow, right: FantasyTeamRow): number {
  return (
    right.wins - left.wins ||
    left.losses - right.losses ||
    right.ties - left.ties ||
    right.pointsFor - left.pointsFor ||
    left.pointsAgainst - right.pointsAgainst ||
    left.name.localeCompare(right.name)
  );
}

async function loadTeamsForSeason(
  tx: LeagueScopedTx,
  input: { leagueId: string; season: number },
): Promise<FantasyTeamRow[]> {
  return tx
    .select({
      abbrev: fantasyTeams.abbrev,
      losses: fantasyTeams.losses,
      name: fantasyTeams.name,
      ownerMemberIds: fantasyTeams.ownerMemberIds,
      pointsAgainst: fantasyTeams.pointsAgainst,
      pointsFor: fantasyTeams.pointsFor,
      providerTeamId: fantasyTeams.providerTeamId,
      ties: fantasyTeams.ties,
      wins: fantasyTeams.wins,
    })
    .from(fantasyTeams)
    .where(
      and(
        eq(fantasyTeams.leagueId, input.leagueId),
        eq(fantasyTeams.season, input.season),
      ),
    )
    .orderBy(asc(fantasyTeams.name));
}

async function loadMembersForSeason(
  tx: LeagueScopedTx,
  input: { leagueId: string; season: number },
): Promise<FantasyMemberRow[]> {
  return tx
    .select({
      displayName: fantasyMembers.displayName,
      providerMemberId: fantasyMembers.providerMemberId,
    })
    .from(fantasyMembers)
    .where(
      and(
        eq(fantasyMembers.leagueId, input.leagueId),
        eq(fantasyMembers.season, input.season),
      ),
    );
}

function teamLabel(team: FantasyTeamRow | undefined, providerTeamId: string) {
  return team?.abbrev || team?.name || `Team ${providerTeamId}`;
}

function scoreboardStatus(
  status: (typeof fantasyMatchups.$inferSelect)["status"],
): PublicationArticleScoreboardMatchup["status"] {
  switch (status) {
    case "final":
      return "final";
    case "in_progress":
      return "live";
    case "scheduled":
      return "upcoming";
    default:
      return "stale";
  }
}

function homeWinProbability(row: {
  awayScore: number;
  homeScore: number;
  status: (typeof fantasyMatchups.$inferSelect)["status"];
}): number {
  if (row.status === "final") {
    if (row.homeScore === row.awayScore) {
      return 50;
    }
    return row.homeScore > row.awayScore ? 100 : 0;
  }
  const total = row.homeScore + row.awayScore;
  return total > 0 ? Math.round((row.homeScore / total) * 100) : 50;
}

async function resolveScoreboardEmbed(
  tx: LeagueScopedTx,
  input: {
    embed: Extract<ContentEmbed, { kind: "scoreboard_strip" }>;
    id: string;
    leagueId: string;
    leagueSeason: number;
  },
): Promise<PublicationArticleScoreboardEmbed> {
  const season = input.embed.season ?? input.leagueSeason;
  const teams = await loadTeamsForSeason(tx, {
    leagueId: input.leagueId,
    season,
  });
  const teamsByProviderId = new Map(
    teams.map((team) => [team.providerTeamId, team]),
  );
  const rows = await tx
    .select({
      awayScore: fantasyMatchups.awayScore,
      awayTeamProviderId: fantasyMatchups.awayTeamProviderId,
      homeScore: fantasyMatchups.homeScore,
      homeTeamProviderId: fantasyMatchups.homeTeamProviderId,
      id: fantasyMatchups.id,
      providerMatchupId: fantasyMatchups.providerMatchupId,
      scoringPeriod: fantasyMatchups.scoringPeriod,
      status: fantasyMatchups.status,
    })
    .from(fantasyMatchups)
    .where(
      and(
        eq(fantasyMatchups.leagueId, input.leagueId),
        eq(fantasyMatchups.season, season),
        input.embed.scoringPeriod
          ? eq(fantasyMatchups.scoringPeriod, input.embed.scoringPeriod)
          : undefined,
      ),
    )
    .orderBy(
      desc(fantasyMatchups.scoringPeriod),
      asc(fantasyMatchups.providerMatchupId),
    )
    .limit(12);

  const selectedPeriod =
    input.embed.scoringPeriod ?? rows[0]?.scoringPeriod ?? null;
  const selectedRows = selectedPeriod
    ? rows.filter((row) => row.scoringPeriod === selectedPeriod)
    : rows;
  const matchups = selectedRows.map((row) => {
    const homeTeam = teamsByProviderId.get(row.homeTeamProviderId);
    const awayTeam = row.awayTeamProviderId
      ? teamsByProviderId.get(row.awayTeamProviderId)
      : undefined;
    return {
      awayLabel: row.awayTeamProviderId
        ? teamLabel(awayTeam, row.awayTeamProviderId)
        : "BYE",
      awayScore: row.awayScore,
      homeLabel: teamLabel(homeTeam, row.homeTeamProviderId),
      homeScore: row.homeScore,
      id: row.id,
      kickoffLabel: `Week ${row.scoringPeriod}`,
      status: scoreboardStatus(row.status),
      winProbability: homeWinProbability(row),
    } satisfies PublicationArticleScoreboardMatchup;
  });

  return {
    id: input.id,
    kind: "scoreboard_strip",
    matchups,
    scoringPeriod: selectedPeriod,
    season,
    title:
      input.embed.title ??
      (selectedPeriod ? `Week ${selectedPeriod} scoreboard` : "Scoreboard"),
  };
}

async function resolveStandingsMovementEmbed(
  tx: LeagueScopedTx,
  input: {
    embed: Extract<ContentEmbed, { kind: "standings_movement" }>;
    id: string;
    leagueId: string;
    leagueSeason: number;
  },
): Promise<PublicationArticleStandingsMovementEmbed> {
  const season = input.embed.season ?? input.leagueSeason;
  const teams = await loadTeamsForSeason(tx, {
    leagueId: input.leagueId,
    season,
  });
  const members = await loadMembersForSeason(tx, {
    leagueId: input.leagueId,
    season,
  });
  const membersByProviderId = new Map(
    members.map((member) => [member.providerMemberId, member.displayName]),
  );
  const sortedTeams = [...teams].sort(standingsSort);
  const identityRows =
    sortedTeams.length > 0
      ? await tx
          .select({
            personId: identityMappings.personId,
            providerTeamId: identityMappings.providerTeamId,
          })
          .from(identityMappings)
          .where(
            and(
              eq(identityMappings.leagueId, input.leagueId),
              eq(identityMappings.season, season),
              inArray(
                identityMappings.providerTeamId,
                sortedTeams.map((team) => team.providerTeamId),
              ),
            ),
          )
      : [];
  const personIds = identityRows.map((row) => row.personId);
  const seasonRows =
    personIds.length > 0
      ? await tx
          .select({
            finalRank: seasonStatistics.finalRank,
            personId: seasonStatistics.personId,
          })
          .from(seasonStatistics)
          .where(
            and(
              eq(seasonStatistics.leagueId, input.leagueId),
              eq(seasonStatistics.season, season),
              inArray(seasonStatistics.personId, personIds),
            ),
          )
      : [];
  const personIdByTeamId = new Map(
    identityRows.map((row) => [row.providerTeamId, row.personId]),
  );
  const previousRankByPersonId = new Map(
    seasonRows
      .filter((row) => row.finalRank > 0)
      .map((row) => [row.personId, row.finalRank]),
  );
  const limit = input.embed.limit ?? 8;
  const rows: PublicationArticleStandingsMovementRow[] = sortedTeams
    .slice(0, limit)
    .map((team, index) => {
      const rank = index + 1;
      const personId = personIdByTeamId.get(team.providerTeamId);
      const previousRank = personId
        ? (previousRankByPersonId.get(personId) ?? null)
        : null;
      return {
        delta: previousRank ? previousRank - rank : 0,
        id: team.providerTeamId,
        managerNames: managerNamesFor(team.ownerMemberIds, membersByProviderId),
        pointsFor: team.pointsFor,
        previousRank,
        rank,
        record: `${team.wins}-${team.losses}-${team.ties}`,
        team: team.name,
      };
    });

  return {
    id: input.id,
    kind: "standings_movement",
    rows,
    season,
    title: input.embed.title ?? "Standings movement",
  };
}

function invertResult(
  result: (typeof weeklyStatistics.$inferSelect)["result"],
): PublicationArticleH2HPoint["resultForA"] {
  switch (result) {
    case "win":
      return "loss";
    case "loss":
      return "win";
    default:
      return "tie";
  }
}

function normalizeResult(
  result: (typeof weeklyStatistics.$inferSelect)["result"],
): PublicationArticleH2HPoint["resultForA"] {
  switch (result) {
    case "win":
    case "loss":
    case "tie":
      return result;
    default:
      return "tie";
  }
}

async function resolveH2HSparklineEmbed(
  tx: LeagueScopedTx,
  input: {
    embed: Extract<ContentEmbed, { kind: "h2h_sparkline" }>;
    id: string;
    leagueId: string;
  },
): Promise<PublicationArticleEmbed> {
  const personRows = await tx
    .select({
      canonicalName: persons.canonicalName,
      id: persons.id,
    })
    .from(persons)
    .where(
      and(
        eq(persons.leagueId, input.leagueId),
        inArray(persons.canonicalName, [
          input.embed.personAName,
          input.embed.personBName,
        ]),
      ),
    );
  const personA = personRows.find(
    (row) => row.canonicalName === input.embed.personAName,
  );
  const personB = personRows.find(
    (row) => row.canonicalName === input.embed.personBName,
  );
  if (!personA || !personB) {
    return {
      id: input.id,
      kind: "h2h_sparkline",
      personAName: input.embed.personAName,
      personBName: input.embed.personBName,
      points: [],
      season: input.embed.season ?? null,
      title:
        input.embed.title ??
        `${input.embed.personAName} vs ${input.embed.personBName}`,
    };
  }

  const rows = await tx
    .select({
      matchupId: weeklyStatistics.matchupId,
      personId: weeklyStatistics.personId,
      pointsAgainst: weeklyStatistics.pointsAgainst,
      pointsFor: weeklyStatistics.pointsFor,
      result: weeklyStatistics.result,
      scoringPeriod: weeklyStatistics.scoringPeriod,
      season: weeklyStatistics.season,
    })
    .from(weeklyStatistics)
    .where(
      and(
        eq(weeklyStatistics.leagueId, input.leagueId),
        input.embed.season
          ? eq(weeklyStatistics.season, input.embed.season)
          : undefined,
        or(
          and(
            eq(weeklyStatistics.personId, personA.id),
            eq(weeklyStatistics.opponentPersonId, personB.id),
          ),
          and(
            eq(weeklyStatistics.personId, personB.id),
            eq(weeklyStatistics.opponentPersonId, personA.id),
          ),
        ),
      ),
    )
    .orderBy(asc(weeklyStatistics.season), asc(weeklyStatistics.scoringPeriod))
    .limit(24);

  const byMatchup = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = byMatchup.get(row.matchupId);
    if (!existing || row.personId === personA.id) {
      byMatchup.set(row.matchupId, row);
    }
  }

  const points: PublicationArticleH2HPoint[] = [...byMatchup.values()].map(
    (row) => {
      const rowIsA = row.personId === personA.id;
      return {
        label: `${row.season} W${row.scoringPeriod}`,
        personAScore: rowIsA ? row.pointsFor : row.pointsAgainst,
        personBScore: rowIsA ? row.pointsAgainst : row.pointsFor,
        resultForA: rowIsA
          ? normalizeResult(row.result)
          : invertResult(row.result),
      };
    },
  );

  return {
    id: input.id,
    kind: "h2h_sparkline",
    personAName: personA.canonicalName,
    personBName: personB.canonicalName,
    points,
    season: input.embed.season ?? null,
    title:
      input.embed.title ??
      `${personA.canonicalName} vs ${personB.canonicalName}`,
  };
}

async function resolveEmbed(
  tx: LeagueScopedTx,
  input: {
    embed: ContentEmbed;
    id: string;
    leagueId: string;
    leagueSeason: number;
  },
): Promise<PublicationArticleEmbed> {
  switch (input.embed.kind) {
    case "scoreboard_strip":
      return resolveScoreboardEmbed(tx, {
        embed: input.embed,
        id: input.id,
        leagueId: input.leagueId,
        leagueSeason: input.leagueSeason,
      });
    case "standings_movement":
      return resolveStandingsMovementEmbed(tx, {
        embed: input.embed,
        id: input.id,
        leagueId: input.leagueId,
        leagueSeason: input.leagueSeason,
      });
    case "h2h_sparkline":
      return resolveH2HSparklineEmbed(tx, {
        embed: input.embed,
        id: input.id,
        leagueId: input.leagueId,
      });
  }
}

export async function resolveLeagueArticleBodyBlocks(
  tx: LeagueScopedTx,
  input: { leagueId: string; leagueSeason: number; metadata: unknown },
): Promise<PublicationArticleBodyBlock[]> {
  const rawBlocks = parseStructuredArticleBodyBlocks(input.metadata);
  const resolvedEmbeds = new Map<string, PublicationArticleEmbed>();

  for (const block of rawBlocks) {
    if (block.type !== "embed" || !block.embed) {
      continue;
    }
    resolvedEmbeds.set(
      block.id,
      await resolveEmbed(tx, {
        embed: block.embed,
        id: block.id,
        leagueId: input.leagueId,
        leagueSeason: input.leagueSeason,
      }),
    );
  }

  return rawBlocks.map((block) => {
    if (block.type !== "embed") {
      return block;
    }
    return {
      embed: resolvedEmbeds.get(block.id) ?? { id: block.id, kind: "unknown" },
      type: "embed",
    };
  });
}
