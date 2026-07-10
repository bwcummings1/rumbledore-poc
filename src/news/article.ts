import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  buildPersonaBylineMap,
  resolvePersonaByline,
} from "@/ai/persona-display";
import type { EditLedgerEntry } from "@/components/curation/edit-ledger-types";
import type { PublicationStory } from "@/components/publication/story";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { ContentReactionSummary } from "@/content/reaction-types";
import {
  getLeagueMemberIdForUser,
  loadContentReactionSummaries,
} from "@/content/reactions";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  contentItems,
  editorialActions,
  leagueFeedReferences,
  leagues,
  loreClaims,
  type Member,
  members,
  users,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import type { PublicationArticleBodyBlock } from "./article-embed-types";
import {
  resolveLeagueArticleBodyBlocks,
  unresolvedArticleBodyBlocks,
} from "./article-embeds";
import {
  articleDek,
  articleHeroImageUrl,
  articleLoreCitationIds,
  articleTags,
  sharedArticleTagCount,
} from "./article-metadata";
import { editorialImportance, publicationRankScore } from "./front";
import {
  resolveCentralPublicationSection,
  resolveLeaguePublicationSection,
} from "./sections";

export type { PublicationArticleBodyBlock } from "./article-embed-types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RELATED_CANDIDATE_LIMIT = 50;
const RELATED_LIMIT = 4;

export type PublicationArticleStory = PublicationStory;

export interface PublicationArticleCanonCitation {
  claimId: string;
  href: string;
  provenance: "steward" | "verified" | "vote";
  ratifiedAt: string | null;
  title: string;
}

export interface PublicationArticleInlineDataRow {
  detail: string;
  id: string;
  label: string;
  metric?: string;
  tone?: "negative" | "positive" | "value";
  value: string;
}

export interface PublicationArticleInlineDataBlock {
  caption: string;
  id: string;
  kind: "ranked" | "summary";
  rows: PublicationArticleInlineDataRow[];
  title: string;
}

export interface PublicationArticleViewData {
  scope: "central" | "league";
  publicationLabel: string;
  publicationHref: string;
  backHref: string;
  backLabel: string;
  tagHrefBase: string;
  arrivalCta?: {
    body: string;
    href: string;
    label: string;
    title: string;
  };
  article: {
    id: string;
    kind: "news" | "blog";
    headline: string;
    dek: string;
    body: string;
    bodyBlocks: PublicationArticleBodyBlock[];
    byline: string;
    bylineDetail: string;
    publishedAt: string;
    section: {
      label: string;
      href: string;
    };
    tags: string[];
    inlineDataBlocks: PublicationArticleInlineDataBlock[];
    heroImageUrl: string;
    sourceUrl: string;
    canonCitations: PublicationArticleCanonCitation[];
    reactions?: ContentReactionSummary;
    lifecycle: {
      status: "published" | "retracted" | "superseded";
      statusChangedAt: string;
      replacementHref?: string;
      replacementTitle?: string;
      retractionReason?: string;
    };
    share?: {
      href: string;
      text: string;
      title: string;
    };
  };
  editorial?: {
    canManage: boolean;
    ledgerEntries: readonly EditLedgerEntry[];
    regenerateApiUrl: string;
    retractApiUrl: string;
  };
  relatedStories: PublicationArticleStory[];
}

export interface CentralNewsArticleData extends PublicationArticleViewData {
  scope: "central";
}

export interface LeaguePressArticleData extends PublicationArticleViewData {
  scope: "league";
  league: {
    id: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    name: string;
    season: number;
  };
  userRole: Member["role"];
}

export interface LeaguePressArticleTeaserData {
  scope: "league";
  publicationLabel: string;
  publicationHref: string;
  articleHref: string;
  article: {
    byline: string;
    bylineDetail: string;
    dek: string;
    headline: string;
    id: string;
    lede: string;
    lifecycle: {
      status: "published" | "retracted" | "superseded";
      statusChangedAt: string;
    };
    publishedAt: string;
    section: {
      href: string;
      label: string;
    };
  };
  league: {
    id: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    name: string;
    season: number;
  };
}

export type CentralNewsArticleLoadResult =
  | { status: "ready"; data: CentralNewsArticleData }
  | { status: "not_found" };

export type LeaguePressArticleLoadResult =
  | { status: "ready"; data: LeaguePressArticleData }
  | { status: "not_found" }
  | { status: "forbidden" };

export type LeaguePressArticleTeaserLoadResult =
  | { status: "ready"; data: LeaguePressArticleTeaserData }
  | { status: "not_found" };

interface RelatedCandidate extends PublicationArticleStory {
  editorialImportance?: number;
  relevanceScore?: number;
  sectionId: string;
  tags: string[];
}

function sourceLabel(value: string | null): string {
  return value?.trim() || "Central news";
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function metadataText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cappedTeaserText(value: string, limit = 320): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function teaserLedeFromBody(body: string, fallback: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    if (/^#{1,6}\s+/.test(paragraph)) {
      continue;
    }
    if (/^[-*]\s+/.test(paragraph) || /^\d+[.)]\s+/.test(paragraph)) {
      continue;
    }
    if (paragraph.startsWith(">")) {
      continue;
    }
    return cappedTeaserText(paragraph);
  }

  return cappedTeaserText(fallback);
}

function metadataNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function canManageEditorial(role: Member["role"]): boolean {
  return (
    role === "commissioner" ||
    role === "data_steward" ||
    role === "league_admin"
  );
}

function articleStructure(metadata: unknown): Record<string, unknown> {
  const record = metadataRecord(metadata);
  const direct = metadataRecord(record.structure);
  if (metadataText(direct.type)) {
    return direct;
  }

  const article = metadataRecord(record.article);
  const nested = metadataRecord(article.structure);
  return metadataText(nested.type) ? nested : {};
}

function summaryRow(
  id: string,
  label: string,
  value: unknown,
  detail: unknown = "",
): PublicationArticleInlineDataRow[] {
  const text = metadataText(value);
  if (!text) {
    return [];
  }
  return [
    {
      detail: metadataText(detail),
      id,
      label,
      value: text,
    },
  ];
}

function summaryBlock(
  input: Omit<PublicationArticleInlineDataBlock, "kind">,
): PublicationArticleInlineDataBlock[] {
  if (input.rows.length === 0) {
    return [];
  }
  return [{ ...input, kind: "summary" }];
}

function articleInlineDataBlocks(
  metadata: unknown,
): PublicationArticleInlineDataBlock[] {
  const structure = articleStructure(metadata);
  const type = metadataText(structure.type);

  switch (type) {
    case "power_rankings": {
      const rows = metadataArray(structure.rankings).flatMap(
        (entry, index): PublicationArticleInlineDataRow[] => {
          const row = metadataRecord(entry);
          const team = metadataText(row.team);
          if (!team) {
            return [];
          }

          const rank = metadataNumber(row.rank) ?? index + 1;
          const delta = metadataNumber(row.delta);
          const deltaText =
            delta === null || delta === 0
              ? ""
              : `${delta > 0 ? "+" : ""}${delta}`;

          return [
            {
              detail: metadataText(row.rationale),
              id: `rank-${rank}-${team}`,
              label: team,
              metric: `#${rank}`,
              tone:
                delta === null || delta === 0
                  ? undefined
                  : delta > 0
                    ? "positive"
                    : "negative",
              value: [metadataText(row.record), deltaText]
                .filter(Boolean)
                .join(" / "),
            },
          ];
        },
      );

      if (rows.length === 0) {
        return [];
      }
      return [
        {
          caption:
            "Ordered ranks from the article's structured power ranking draft.",
          id: "power-rankings",
          kind: "ranked",
          rows,
          title: "Power ranking table",
        },
      ];
    }
    case "weekly_recap":
      return summaryBlock({
        caption: "Structured beats behind this weekly recap.",
        id: "weekly-recap",
        rows: [
          ...summaryRow("top-result", "Top result", structure.topResult),
          ...summaryRow(
            "upset-or-blowout",
            "Upset or blowout",
            structure.upsetOrBlowout,
          ),
          ...summaryRow(
            "standings-shift",
            "Standings shift",
            structure.standingsShift,
          ),
          ...summaryRow("kicker", "Kicker", structure.kicker),
        ],
        title: "Recap ledger",
      });
    case "matchup_preview": {
      const rows = metadataArray(structure.matchups).flatMap(
        (entry, index): PublicationArticleInlineDataRow[] => {
          const row = metadataRecord(entry);
          const team = metadataText(row.team);
          const opponent = metadataText(row.opponent);
          if (!team && !opponent) {
            return [];
          }
          return [
            {
              detail: [
                metadataText(row.edge),
                metadataText(row.xFactor)
                  ? `X-factor: ${metadataText(row.xFactor)}`
                  : "",
                metadataText(row.keyNumber)
                  ? `Key number: ${metadataText(row.keyNumber)}`
                  : "",
              ]
                .filter(Boolean)
                .join(" "),
              id: `matchup-${index}`,
              label: [team, opponent].filter(Boolean).join(" vs "),
              value: metadataText(row.prediction) || "Preview filed",
            },
          ];
        },
      );
      return summaryBlock({
        caption: "Structured matchup notes carried by the article draft.",
        id: "matchup-preview",
        rows,
        title: "Matchup board",
      });
    }
    case "awards_superlatives": {
      const rows = metadataArray(structure.awards).flatMap(
        (entry, index): PublicationArticleInlineDataRow[] => {
          const row = metadataRecord(entry);
          const award = metadataText(row.award);
          if (!award) {
            return [];
          }
          return [
            {
              detail: metadataText(row.fact),
              id: `award-${index}`,
              label: award,
              value: metadataText(row.recipient) || "Recipient pending",
            },
          ];
        },
      );
      return summaryBlock({
        caption: "Award rows from the structured superlatives draft.",
        id: "awards-superlatives",
        rows,
        title: "Awards card",
      });
    }
    case "transaction_reaction":
      return summaryBlock({
        caption: "Structured transaction verdict carried by the article draft.",
        id: "transaction-reaction",
        rows: [
          ...summaryRow("move", "Move", structure.move),
          ...summaryRow("grade", "Grade", structure.grade),
          ...summaryRow("winner", "Winner", structure.winner),
          ...summaryRow("loser", "Loser", structure.loser),
          ...summaryRow("sources-say", "Sources say", structure.sourcesSay),
        ],
        title: "Transaction verdict",
      });
    case "season_arc":
      return summaryBlock({
        caption: "Season-arc facts from the structured article draft.",
        id: "season-arc",
        rows: [
          ...summaryRow("act-so-far", "Act so far", structure.actSoFar),
          ...summaryRow(
            "turning-point",
            "Turning point",
            structure.turningPoint,
          ),
          ...summaryRow("team-to-beat", "Team to beat", structure.teamToBeat),
          ...summaryRow("stakes", "Stakes", structure.stakes),
        ],
        title: "Season arc board",
      });
    case "rivalry_piece":
      return summaryBlock({
        caption: "Rivalry facts from the structured article draft.",
        id: "rivalry-piece",
        rows: [
          ...summaryRow("history", "History", structure.history),
          ...summaryRow("score", "Score", structure.score),
          ...summaryRow("stakes", "Stakes", structure.stakes),
          ...summaryRow("needle", "Needle", structure.needle),
        ],
        title: "Rivalry ledger",
      });
    case "arena_recap":
      return summaryBlock({
        caption: "Arena movement extracted from the structured recap.",
        id: "arena-recap",
        rows: [
          ...summaryRow(
            "league-position",
            "League position",
            structure.leaguePosition,
          ),
          ...summaryRow("field-leader", "Field leader", structure.fieldLeader),
          ...summaryRow("rival-watch", "Rival watch", structure.rivalWatch),
          ...summaryRow("needle", "Needle", structure.needle),
          ...metadataArray(structure.biggestMovers).flatMap((value, index) =>
            summaryRow(`mover-${index}`, "Mover", value),
          ),
        ],
        title: "Arena movement",
      });
    case "milestone_record":
      return summaryBlock({
        caption: "Record math from the structured milestone draft.",
        id: "milestone-record",
        rows: [
          ...summaryRow("record", "Record", structure.record),
          ...summaryRow(
            "previous-holder",
            "Previous holder",
            structure.previousHolder,
          ),
          ...summaryRow("new-holder", "New holder", structure.newHolder),
          ...summaryRow("math", "Math", structure.math),
          ...summaryRow("legend", "Legend", structure.legend),
        ],
        title: "Record ledger",
      });
    case "instigation_column":
      return summaryBlock({
        caption: "Debate inputs from the structured instigation draft.",
        id: "instigation-column",
        rows: [
          ...summaryRow("provocation", "Provocation", structure.provocation),
          ...metadataArray(structure.twoSides).flatMap((value, index) =>
            summaryRow(`side-${index}`, "Side", value),
          ),
          ...summaryRow("settle-it", "Settle it", structure.settleItCta),
          ...summaryRow("stakes", "Stakes", structure.stakes),
        ],
        title: "Instigation brief",
      });
    case "verdict_column":
      return summaryBlock({
        caption: "Verdict inputs from the structured article draft.",
        id: "verdict-column",
        rows: [
          ...summaryRow("question", "Question", structure.question),
          ...summaryRow("vote", "Vote", structure.vote),
          ...summaryRow("ruling", "Ruling", structure.ruling),
          ...summaryRow("new-canon", "New canon", structure.newCanon),
        ],
        title: "Verdict record",
      });
    default:
      return [];
  }
}

function cleanUrl(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "";
}

function sourceUrlFor(metadata: unknown, sourceUrl: string | null): string {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return (
    (typeof record.canonicalUrl === "string"
      ? cleanUrl(record.canonicalUrl)
      : "") || cleanUrl(sourceUrl)
  );
}

function matchedEntityTags(
  entities: readonly { label?: string | null }[] | null | undefined,
): string[] {
  return (entities ?? []).flatMap((entity) => {
    const label = entity.label?.trim();
    return label ? [label] : [];
  });
}

function relatedScore(
  candidate: RelatedCandidate,
  input: { sectionId: string; tags: readonly string[] },
): number {
  const sharedTags = sharedArticleTagCount(candidate.tags, input.tags);
  const sectionBoost = candidate.sectionId === input.sectionId ? 10_000 : 0;
  const tagBoost = sharedTags * 1_000;
  return (
    sectionBoost +
    tagBoost +
    publicationRankScore({
      editorialImportance: candidate.editorialImportance,
      publishedAt: candidate.publishedAt,
      relevanceScore: candidate.relevanceScore,
    })
  );
}

function selectRelatedStories(
  candidates: readonly RelatedCandidate[],
  input: { sectionId: string; tags: readonly string[] },
): PublicationArticleStory[] {
  const related = candidates.filter(
    (candidate) =>
      candidate.sectionId === input.sectionId ||
      sharedArticleTagCount(candidate.tags, input.tags) > 0,
  );
  const pool = related.length > 0 ? related : candidates;

  return pool
    .map((candidate) => ({
      candidate,
      score: relatedScore(candidate, input),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        Date.parse(right.candidate.publishedAt) -
          Date.parse(left.candidate.publishedAt) ||
        left.candidate.headline.localeCompare(right.candidate.headline),
    )
    .slice(0, RELATED_LIMIT)
    .map(({ candidate }) => ({
      byline: candidate.byline,
      dek: candidate.dek,
      headline: candidate.headline,
      href: candidate.href,
      hrefLabel: candidate.hrefLabel,
      id: candidate.id,
      origin: candidate.origin,
      publishedAt: candidate.publishedAt,
      relevanceReason: candidate.relevanceReason,
      reactions: candidate.reactions,
      sectionTag: candidate.sectionTag,
      sourceUrl: candidate.sourceUrl,
      thumbnailAlt: candidate.thumbnailAlt,
      thumbnailUrl: candidate.thumbnailUrl,
    }));
}

type EditorialActionRow = {
  action:
    | "correct"
    | "regenerate"
    | "retract"
    | "roast_consent"
    | "tone_edit"
    | "tone_rollback";
  actorDisplayName: string | null;
  actorUserId: string | null;
  afterContentItemId: string | null;
  beforeContentItemId: string | null;
  createdAt: Date;
  id: string;
  metadata: Record<string, unknown>;
  reason: string;
  targetContentItemId: string | null;
  targetFantasyMemberId: string | null;
  targetMemberId: string | null;
  targetPersonaCardId: string | null;
};

function editorialActionLabel(action: EditorialActionRow["action"]): string {
  return action.replaceAll("_", " ");
}

function editorialLedgerValue(
  row: EditorialActionRow,
  side: "after" | "before",
): Record<string, unknown> {
  const contentItemId =
    side === "after" ? row.afterContentItemId : row.beforeContentItemId;
  const status =
    side === "after"
      ? row.action === "retract"
        ? "retracted"
        : row.action === "regenerate"
          ? row.afterContentItemId
            ? "replacement published"
            : "generation did not publish"
          : editorialActionLabel(row.action)
      : row.beforeContentItemId
        ? "previous article"
        : "none";

  return {
    ...(contentItemId ? { contentItemId } : {}),
    action: editorialActionLabel(row.action),
    reason: row.reason || "none",
    status,
  };
}

function editorialRowsToLedgerEntries(
  rows: readonly EditorialActionRow[],
): EditLedgerEntry[] {
  return rows.map((row) => ({
    actorDisplayName: row.actorDisplayName,
    actorUserId: row.actorUserId,
    afterValue: editorialLedgerValue(row, "after"),
    beforeValue: editorialLedgerValue(row, "before"),
    createdAt: row.createdAt.toISOString(),
    editClass:
      row.action === "tone_edit" || row.action === "tone_rollback"
        ? "cosmetic"
        : "substantive",
    field: row.action,
    id: row.id,
    reason: row.reason || null,
    scope: null,
    source: "editorial_action",
    targetId:
      row.targetContentItemId ??
      row.targetPersonaCardId ??
      row.targetMemberId ??
      row.targetFantasyMemberId,
    targetKind: row.targetContentItemId
      ? "content_item"
      : row.targetPersonaCardId
        ? "persona_card"
        : row.targetMemberId
          ? "member"
          : "fantasy_member",
  }));
}

async function loadCanonCitationsInContext(
  tx: LeagueScopedTx,
  input: { claimIds: readonly string[]; leagueId: string },
): Promise<PublicationArticleCanonCitation[]> {
  const claimIds = [...new Set(input.claimIds)];
  if (claimIds.length === 0) {
    return [];
  }

  const rows = await tx
    .select({
      id: loreClaims.id,
      ratifiedAt: loreClaims.ratifiedAt,
      ratifiedBy: loreClaims.ratifiedBy,
      title: loreClaims.title,
    })
    .from(loreClaims)
    .where(
      and(
        eq(loreClaims.leagueId, input.leagueId),
        inArray(loreClaims.id, claimIds),
        eq(loreClaims.status, "canon"),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));

  return claimIds.flatMap((claimId) => {
    const row = byId.get(claimId);
    if (!row) {
      return [];
    }
    return [
      {
        claimId,
        href: `/leagues/${input.leagueId}/lore/${claimId}`,
        provenance: row.ratifiedBy ?? "vote",
        ratifiedAt: row.ratifiedAt?.toISOString() ?? null,
        title: row.title,
      },
    ];
  });
}

export async function getCentralNewsArticleData(
  db: Db,
  input: { articleId: string },
): Promise<CentralNewsArticleLoadResult> {
  if (!UUID_RE.test(input.articleId)) {
    return { status: "not_found" };
  }

  const [row] = await db
    .select({
      body: contentItems.body,
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
        eq(contentItems.id, input.articleId),
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
        contentItemIsPublished(),
      ),
    )
    .limit(1);

  if (!row) {
    return { status: "not_found" };
  }

  const section = resolveCentralPublicationSection({
    metadata: row.metadata,
    summary: row.summary,
    title: row.title,
  });
  const tags = articleTags(row.metadata);
  const relatedRows = await db
    .select({
      body: contentItems.body,
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
    .limit(RELATED_CANDIDATE_LIMIT);

  const candidates: RelatedCandidate[] = relatedRows
    .filter((candidate) => candidate.id !== row.id)
    .map((candidate) => {
      const candidateSection = resolveCentralPublicationSection({
        metadata: candidate.metadata,
        summary: candidate.summary,
        title: candidate.title,
      });

      return {
        byline: sourceLabel(candidate.source),
        dek: articleDek(candidate.metadata, candidate.summary),
        editorialImportance: editorialImportance(candidate.metadata),
        headline: candidate.title,
        href: `/news/articles/${candidate.id}`,
        hrefLabel: "Read story",
        id: candidate.id,
        origin: "source",
        publishedAt: candidate.publishedAt.toISOString(),
        sectionId: candidateSection.id,
        sectionTag: candidateSection.label,
        sourceUrl: sourceUrlFor(candidate.metadata, candidate.sourceUrl),
        tags: articleTags(candidate.metadata),
        thumbnailAlt: candidate.title,
        thumbnailUrl: articleHeroImageUrl(candidate.metadata),
      };
    });

  return {
    data: {
      article: {
        body: row.body,
        bodyBlocks: unresolvedArticleBodyBlocks(row.metadata),
        byline: sourceLabel(row.source),
        bylineDetail: "Central NFL and fantasy desk",
        dek: articleDek(row.metadata, row.summary),
        headline: row.title,
        heroImageUrl: articleHeroImageUrl(row.metadata),
        id: row.id,
        inlineDataBlocks: articleInlineDataBlocks(row.metadata),
        kind: "news",
        publishedAt: row.publishedAt.toISOString(),
        section: {
          href: `/news/${section.slug}`,
          label: section.label,
        },
        sourceUrl: sourceUrlFor(row.metadata, row.sourceUrl),
        tags,
        canonCitations: [],
        lifecycle: {
          status: "published",
          statusChangedAt: row.publishedAt.toISOString(),
        },
        share: {
          href: `/news/articles/${row.id}`,
          text: articleDek(row.metadata, row.summary),
          title: row.title,
        },
      },
      backHref: "/news",
      backLabel: "News front",
      publicationHref: "/news",
      publicationLabel: "Rumbledore News",
      relatedStories: selectRelatedStories(candidates, {
        sectionId: section.id,
        tags,
      }),
      scope: "central",
      tagHrefBase: "/news",
    },
    status: "ready",
  };
}

export async function getLeaguePressArticleData(
  db: Db,
  input: {
    leagueId: string;
    postId: string;
    userId: string;
    userRole?: Member["role"];
  },
): Promise<LeaguePressArticleLoadResult> {
  if (!UUID_RE.test(input.leagueId) || !UUID_RE.test(input.postId)) {
    return { status: "not_found" };
  }

  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const userRole =
    input.userRole ??
    (
      await db
        .select({ role: members.role })
        .from(members)
        .where(
          and(
            eq(members.organizationId, input.leagueId),
            eq(members.userId, input.userId),
          ),
        )
        .limit(1)
    )[0]?.role;

  if (!userRole) {
    return { status: "forbidden" };
  }

  const memberId = await getLeagueMemberIdForUser(db, {
    leagueId: input.leagueId,
    userId: input.userId,
  });

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [articleRow] = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        body: contentItems.body,
        id: contentItems.id,
        metadata: contentItems.metadata,
        publishedAt: contentItems.publishedAt,
        status: contentItems.status,
        statusChangedAt: contentItems.statusChangedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, input.postId),
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.kind, "blog"),
        ),
      )
      .limit(1);

    if (!articleRow) {
      return null;
    }

    const personaBylines = buildPersonaBylineMap(
      await tx
        .select({
          name: aiPersonaCards.name,
          persona: aiPersonaCards.persona,
          purpose: aiPersonaCards.purpose,
        })
        .from(aiPersonaCards)
        .where(eq(aiPersonaCards.leagueId, input.leagueId)),
    );

    const articleSection = resolveLeaguePublicationSection({
      authorPersona: articleRow.authorPersona,
      kind: "blog",
      metadata: articleRow.metadata,
      summary: articleRow.summary,
      title: articleRow.title,
    });
    const tags = articleTags(articleRow.metadata);
    const bodyBlocks = await resolveLeagueArticleBodyBlocks(tx, {
      leagueId: input.leagueId,
      leagueSeason: league.season,
      metadata: articleRow.metadata,
    });
    const canonCitations = await loadCanonCitationsInContext(tx, {
      claimIds: articleLoreCitationIds(articleRow.metadata),
      leagueId: input.leagueId,
    });
    const editorialRows = await tx
      .select({
        action: editorialActions.action,
        actorDisplayName: users.displayName,
        actorUserId: editorialActions.actorUserId,
        afterContentItemId: editorialActions.afterContentItemId,
        beforeContentItemId: editorialActions.beforeContentItemId,
        createdAt: editorialActions.createdAt,
        id: editorialActions.id,
        metadata: editorialActions.metadata,
        reason: editorialActions.reason,
        targetContentItemId: editorialActions.targetContentItemId,
        targetFantasyMemberId: editorialActions.targetFantasyMemberId,
        targetMemberId: editorialActions.targetMemberId,
        targetPersonaCardId: editorialActions.targetPersonaCardId,
      })
      .from(editorialActions)
      .leftJoin(users, eq(editorialActions.actorUserId, users.id))
      .where(
        and(
          eq(editorialActions.leagueId, input.leagueId),
          or(
            eq(editorialActions.targetContentItemId, articleRow.id),
            eq(editorialActions.beforeContentItemId, articleRow.id),
            eq(editorialActions.afterContentItemId, articleRow.id),
          ),
        ),
      )
      .orderBy(desc(editorialActions.createdAt), desc(editorialActions.id))
      .limit(12);
    const retraction = editorialRows.find(
      (row) =>
        row.action === "retract" && row.targetContentItemId === articleRow.id,
    );
    const [replacement] =
      articleRow.status === "superseded"
        ? await tx
            .select({ id: contentItems.id, title: contentItems.title })
            .from(contentItems)
            .where(
              and(
                eq(contentItems.leagueId, input.leagueId),
                eq(contentItems.kind, "blog"),
                eq(contentItems.supersedesContentItemId, articleRow.id),
                contentItemIsPublished(),
              ),
            )
            .orderBy(
              desc(contentItems.publishedAt),
              desc(contentItems.createdAt),
            )
            .limit(1)
        : [];

    const leagueRows = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        id: contentItems.id,
        metadata: contentItems.metadata,
        publishedAt: contentItems.publishedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.kind, "blog"),
          contentItemIsPublished(),
        ),
      )
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
      .limit(RELATED_CANDIDATE_LIMIT);

    const centralRows = await tx
      .select({
        contentItemId: contentItems.id,
        framingSummary: leagueFeedReferences.framingSummary,
        framingTitle: leagueFeedReferences.framingTitle,
        id: leagueFeedReferences.id,
        matchedEntities: leagueFeedReferences.matchedEntities,
        metadata: contentItems.metadata,
        publishedAt: contentItems.publishedAt,
        reason: leagueFeedReferences.reason,
        relevanceScore: leagueFeedReferences.relevanceScore,
        source: contentItems.source,
        sourceUrl: contentItems.sourceUrl,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(leagueFeedReferences)
      .innerJoin(
        contentItems,
        eq(leagueFeedReferences.contentItemId, contentItems.id),
      )
      .where(
        and(
          eq(leagueFeedReferences.leagueId, input.leagueId),
          isNull(contentItems.leagueId),
          eq(contentItems.kind, "news"),
          contentItemIsPublished(),
        ),
      )
      .orderBy(
        desc(leagueFeedReferences.relevanceScore),
        desc(contentItems.publishedAt),
      )
      .limit(RELATED_CANDIDATE_LIMIT);

    const reactionSummaries = await loadContentReactionSummaries(tx, {
      apiUrlFor: (contentItemId) =>
        `/api/leagues/${input.leagueId}/press/${contentItemId}/reactions`,
      contentItemIds: [
        articleRow.id,
        ...leagueRows.map((candidate) => candidate.id),
      ],
      leagueId: input.leagueId,
      memberId,
    });

    const leagueCandidates: RelatedCandidate[] = leagueRows
      .filter((candidate) => candidate.id !== articleRow.id)
      .map((candidate) => {
        const byline = resolvePersonaByline(
          candidate.authorPersona,
          personaBylines,
        );
        const candidateSection = resolveLeaguePublicationSection({
          authorPersona: candidate.authorPersona,
          kind: "blog",
          metadata: candidate.metadata,
          summary: candidate.summary,
          title: candidate.title,
        });

        return {
          byline: byline.label,
          dek: articleDek(candidate.metadata, candidate.summary),
          editorialImportance: editorialImportance(candidate.metadata),
          headline: candidate.title,
          href: `/leagues/${input.leagueId}/press/${candidate.id}`,
          hrefLabel: "Read post",
          id: candidate.id,
          origin: "cast",
          publishedAt: candidate.publishedAt.toISOString(),
          reactions: reactionSummaries.get(candidate.id),
          sectionId: candidateSection.id,
          sectionTag: candidateSection.label,
          tags: articleTags(candidate.metadata),
          thumbnailAlt: candidate.title,
          thumbnailUrl: articleHeroImageUrl(candidate.metadata),
        };
      });

    const centralCandidates: RelatedCandidate[] = centralRows.map(
      (candidate) => {
        const title = candidate.framingTitle ?? candidate.title;
        const summary =
          candidate.framingSummary ??
          articleDek(candidate.metadata, candidate.summary);
        const candidateSection = resolveLeaguePublicationSection({
          authorPersona: null,
          kind: "news",
          metadata: candidate.metadata,
          summary,
          title,
        });

        return {
          byline: sourceLabel(candidate.source),
          dek: summary,
          editorialImportance: editorialImportance(candidate.metadata),
          headline: title,
          href: `/news/articles/${candidate.contentItemId}`,
          hrefLabel: "Read story",
          id: candidate.id,
          origin: "source",
          publishedAt: candidate.publishedAt.toISOString(),
          relevanceReason: candidate.reason,
          relevanceScore: candidate.relevanceScore,
          sectionId: candidateSection.id,
          sectionTag: candidateSection.label,
          sourceUrl: sourceUrlFor(candidate.metadata, candidate.sourceUrl),
          tags: [
            ...articleTags(candidate.metadata),
            ...matchedEntityTags(candidate.matchedEntities),
          ],
          thumbnailAlt: title,
          thumbnailUrl: articleHeroImageUrl(candidate.metadata),
        };
      },
    );

    const byline = resolvePersonaByline(
      articleRow.authorPersona,
      personaBylines,
    );
    const isRetracted = articleRow.status === "retracted";
    const visibleDek = isRetracted
      ? ""
      : articleDek(articleRow.metadata, articleRow.summary);
    return {
      article: {
        body: isRetracted ? "" : articleRow.body,
        bodyBlocks: isRetracted ? [] : bodyBlocks,
        byline: byline.label,
        bylineDetail: byline.detail,
        dek: visibleDek,
        headline: articleRow.title,
        heroImageUrl: articleHeroImageUrl(articleRow.metadata),
        id: articleRow.id,
        inlineDataBlocks: isRetracted
          ? []
          : articleInlineDataBlocks(articleRow.metadata),
        kind: "blog" as const,
        publishedAt: articleRow.publishedAt.toISOString(),
        reactions: reactionSummaries.get(articleRow.id),
        section: {
          href: `/leagues/${input.leagueId}/press/${articleSection.slug}`,
          label: articleSection.label,
        },
        sourceUrl: "",
        tags,
        canonCitations,
        lifecycle: {
          status: articleRow.status,
          statusChangedAt: articleRow.statusChangedAt.toISOString(),
          ...(replacement
            ? {
                replacementHref: `/leagues/${input.leagueId}/press/${replacement.id}`,
                replacementTitle: replacement.title,
              }
            : {}),
          ...(retraction?.reason
            ? { retractionReason: retraction.reason }
            : {}),
        },
        share: {
          href: `/leagues/${input.leagueId}/press/${articleRow.id}`,
          text: visibleDek,
          title: articleRow.title,
        },
      },
      editorial: {
        canManage: canManageEditorial(userRole),
        ledgerEntries: editorialRowsToLedgerEntries(editorialRows),
        regenerateApiUrl: `/api/leagues/${input.leagueId}/press/${articleRow.id}/regenerate`,
        retractApiUrl: `/api/leagues/${input.leagueId}/press/${articleRow.id}/retract`,
      },
      relatedStories: selectRelatedStories(
        [...leagueCandidates, ...centralCandidates],
        {
          sectionId: articleSection.id,
          tags,
        },
      ),
    };
  });

  if (!scoped) {
    return { status: "not_found" };
  }

  return {
    data: {
      ...scoped,
      backHref: `/leagues/${league.id}/press`,
      backLabel: "The Press",
      league,
      publicationHref: `/leagues/${league.id}/press`,
      publicationLabel: `The ${league.name} Press`,
      scope: "league",
      tagHrefBase: `/leagues/${league.id}/press`,
      userRole,
    },
    status: "ready",
  };
}

export async function getLeaguePressArticleTeaserData(
  db: Db,
  input: { leagueId: string; postId: string },
): Promise<LeaguePressArticleTeaserLoadResult> {
  if (!UUID_RE.test(input.leagueId) || !UUID_RE.test(input.postId)) {
    return { status: "not_found" };
  }

  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    // Intentionally open teaser query: body is read only to derive a capped
    // first paragraph. The returned DTO never carries raw body, embeds, canon
    // citations, reactions, editorial rows, or member-derived data.
    const [articleRow] = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        body: contentItems.body,
        id: contentItems.id,
        metadata: contentItems.metadata,
        publishedAt: contentItems.publishedAt,
        status: contentItems.status,
        statusChangedAt: contentItems.statusChangedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, input.postId),
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.kind, "blog"),
        ),
      )
      .limit(1);

    if (!articleRow) {
      return null;
    }

    const personaBylines = buildPersonaBylineMap(
      await tx
        .select({
          name: aiPersonaCards.name,
          persona: aiPersonaCards.persona,
          purpose: aiPersonaCards.purpose,
        })
        .from(aiPersonaCards)
        .where(eq(aiPersonaCards.leagueId, input.leagueId)),
    );
    const articleSection = resolveLeaguePublicationSection({
      authorPersona: articleRow.authorPersona,
      kind: "blog",
      metadata: articleRow.metadata,
      summary: articleRow.summary,
      title: articleRow.title,
    });

    if (articleRow.status !== "published") {
      return {
        article: {
          byline: "Rumbledore Press",
          bylineDetail: "Editorial lifecycle notice",
          dek: "",
          headline: "No longer available",
          id: articleRow.id,
          lede: "",
          lifecycle: {
            status: articleRow.status,
            statusChangedAt: articleRow.statusChangedAt.toISOString(),
          },
          publishedAt: articleRow.publishedAt.toISOString(),
          section: {
            href: `/leagues/${input.leagueId}/press/${articleSection.slug}`,
            label: articleSection.label,
          },
        },
      };
    }

    const byline = resolvePersonaByline(
      articleRow.authorPersona,
      personaBylines,
    );
    const dek = cappedTeaserText(
      articleDek(articleRow.metadata, articleRow.summary),
    );

    return {
      article: {
        byline: byline.label,
        bylineDetail: "",
        dek,
        headline: articleRow.title,
        id: articleRow.id,
        lede: teaserLedeFromBody(articleRow.body, dek),
        lifecycle: {
          status: articleRow.status,
          statusChangedAt: articleRow.statusChangedAt.toISOString(),
        },
        publishedAt: articleRow.publishedAt.toISOString(),
        section: {
          href: `/leagues/${input.leagueId}/press/${articleSection.slug}`,
          label: articleSection.label,
        },
      },
    };
  });

  if (!scoped) {
    return { status: "not_found" };
  }

  return {
    data: {
      ...scoped,
      articleHref: `/leagues/${league.id}/press/${scoped.article.id}`,
      league,
      publicationHref: `/leagues/${league.id}/press`,
      publicationLabel: `The ${league.name} Press`,
      scope: "league",
    },
    status: "ready",
  };
}
