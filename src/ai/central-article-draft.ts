import { AppError } from "@/core/result";
import { centralPublicationSectionById } from "@/news/sections";
import {
  type CentralContentStructure,
  validateCentralContentStructure,
} from "./central-content-types";
import type {
  CentralArticleBodyBlock,
  CentralArticleDraft,
  CentralGenerationContext,
} from "./interfaces";

const MAX_TAGS = 8;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeTags(values: readonly unknown[]): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const tag = cleanText(value);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) {
      break;
    }
  }
  return tags;
}

function normalizeBodyBlock(
  block: CentralArticleBodyBlock,
): CentralArticleBodyBlock | null {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "quote": {
      const text = cleanText(block.text);
      return text ? { text, type: block.type } : null;
    }
    case "list": {
      const items = normalizeTags(
        Array.isArray(block.items) ? block.items : [],
      );
      return items.length > 0
        ? { items, ordered: block.ordered === true, type: "list" }
        : null;
    }
  }
}

export function centralBodyBlocksToMarkdown(
  blocks: readonly CentralArticleBodyBlock[],
): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `## ${block.text}`;
        case "paragraph":
          return block.text;
        case "quote":
          return `> ${block.text}`;
        case "list":
          return block.items
            .map((item, index) =>
              block.ordered ? `${index + 1}. ${item}` : `- ${item}`,
            )
            .join("\n");
      }
      return "";
    })
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}

export function centralStructureLines(
  structure: CentralContentStructure,
): string[] {
  switch (structure.type) {
    case "central_wire_blurb":
      return [structure.whatHappened, structure.whyItMatters].filter(
        (line): line is string => Boolean(line),
      );
    case "central_rundown_report":
      return structure.findings.map(
        (finding) => `${finding.heading}: ${finding.finding}`,
      );
    case "central_weekend_recap_mnf_projection":
      return [
        ...structure.completedGames.flatMap((game) =>
          game.takeaway ? [game.takeaway] : [],
        ),
        structure.mnfProjection
          ? `Computed MNF projection: ${structure.mnfProjection.methodology}`
          : "No supplied Monday-night game was available for projection.",
      ];
    case "central_mnf_recap":
      return structure.game
        ? [
            `${structure.game.awayTeam} at ${structure.game.homeTeam}: ${structure.game.awayScore ?? "score unavailable"}-${structure.game.homeScore ?? "score unavailable"}.`,
          ]
        : ["No supplied Monday-night final was available."];
    case "central_pre_waiver":
      return structure.recommendations.map(
        (player) => `${player.priority}. ${player.recommendation}`,
      );
    case "central_post_waiver":
      return [
        structure.outcomesAvailable
          ? `${structure.processedOutcomes.length} supplied waiver outcomes were available.`
          : "No universal processed-waiver outcomes were supplied.",
        ...structure.fallbackTargets.map((player) => player.recommendation),
      ];
    case "central_matchups":
      return structure.matchups.map(
        (game) => `${game.awayTeam} at ${game.homeTeam} (${game.status}).`,
      );
    case "central_rankings_projections":
      return [
        structure.methodology,
        ...structure.rankings.map(
          (player) =>
            `${player.rank}. ${player.player}, ${player.position}, ${player.team}: projection ${player.projectedPoints ?? "unavailable"}.`,
        ),
      ];
    case "central_start_sit":
      return structure.recommendations.map(
        (player) => `${player.player}: ${player.verdict}. ${player.rationale}`,
      );
    case "central_injuries":
      return structure.updates.length > 0
        ? structure.updates.map((update) => update.eventSummary)
        : ["No supplied injury event was available for a fantasy implication."];
  }
}

export function centralStructureBodyBlocks({
  context,
  structure,
}: {
  context: CentralGenerationContext;
  structure: CentralContentStructure;
}): CentralArticleBodyBlock[] {
  const evidenceCount =
    context.evidence.news.length +
    context.evidence.games.length +
    context.evidence.players.length +
    context.evidence.odds.length;
  const lines = centralStructureLines(structure);

  return [
    {
      text: `${context.column.name} — ${context.season} Week ${context.week}`,
      type: "heading",
    },
    {
      text: `${context.journalist.name} files from ${evidenceCount} supplied central evidence record${evidenceCount === 1 ? "" : "s"}. ${context.journalist.registerContract}`,
      type: "paragraph",
    },
    ...(lines.length > 0
      ? [{ items: lines, type: "list" as const }]
      : [
          {
            text: "The supplied substrate did not contain enough evidence for a factual assertion.",
            type: "paragraph" as const,
          },
        ]),
  ];
}

export function validateCentralArticleDraft(
  draft: CentralArticleDraft,
  options: { context: CentralGenerationContext },
): CentralArticleDraft {
  const title = cleanText(draft.title);
  const summary = cleanText(draft.summary);
  const dek = cleanText(draft.dek);
  const tags = normalizeTags(Array.isArray(draft.tags) ? draft.tags : []);
  const proposedBodyBlocks = (
    Array.isArray(draft.bodyBlocks) ? draft.bodyBlocks : []
  )
    .map(normalizeBodyBlock)
    .filter((block): block is CentralArticleBodyBlock => block !== null);

  if (
    !title ||
    !summary ||
    !dek ||
    tags.length === 0 ||
    proposedBodyBlocks.length < 2
  ) {
    throw new AppError({
      code: "CENTRAL_AI_DRAFT_ARTICLE_INVALID",
      message:
        "Central AI draft must include a headline, summary, dek, tags, and structured body",
      status: 422,
    });
  }
  if (draft.contentType !== options.context.column.contentType) {
    throw new AppError({
      code: "CENTRAL_AI_DRAFT_CONTENT_TYPE_MISMATCH",
      message: "Central AI draft content type did not match its column",
      status: 422,
    });
  }
  if (draft.section !== options.context.column.section) {
    throw new AppError({
      code: "CENTRAL_AI_DRAFT_SECTION_MISMATCH",
      message: "Central AI draft section did not match its column",
      status: 422,
    });
  }
  const section = centralPublicationSectionById(draft.section);
  const structure = validateCentralContentStructure({
    contentType: draft.contentType,
    context: options.context,
    structure: draft.structure,
  });
  const bodyBlocks = centralStructureBodyBlocks({
    context: options.context,
    structure,
  });

  return {
    body: centralBodyBlocksToMarkdown(bodyBlocks),
    bodyBlocks,
    contentType: draft.contentType,
    dek,
    section: section.id,
    structure,
    summary,
    tags,
    title,
  };
}

export function centralArticleText(draft: CentralArticleDraft): string {
  return [
    draft.contentType,
    draft.title,
    draft.dek,
    draft.summary,
    draft.section,
    draft.tags.join(", "),
    JSON.stringify(draft.structure),
    draft.body,
  ].join("\n\n");
}

export function centralArticleMetadata({
  context,
  draft,
}: {
  context: CentralGenerationContext;
  draft: CentralArticleDraft;
}): Record<string, unknown> {
  const preGenerationContext = context.preGenerationContext;
  return {
    article: {
      bodyBlocks: draft.bodyBlocks,
      byline: context.journalist.name,
      bylinePersona: context.journalist.persona,
      contentType: draft.contentType,
      format: "rumbledore.central-article.v1",
      headline: draft.title,
      structure: draft.structure,
    },
    bodyBlocks: draft.bodyBlocks,
    byline: context.journalist.name,
    centralBranch: context.column.branch,
    centralColumnId: context.column.id,
    centralSection: draft.section,
    content_type: draft.contentType,
    contentType: draft.contentType,
    dek: draft.dek,
    generatedBy: "central-journalist-engine",
    generation: {
      dataSources: context.column.dataSources,
      evidenceFetchedAt: context.evidence.fetchedAt,
      reportCategory: context.reportRequest?.category ?? null,
      season: context.season,
      sourceFreshness: context.evidence.sourceFreshness,
      triggerKey: context.triggerKey,
      week: context.week,
    },
    journalist: context.journalist,
    preGenerationContext: {
      injected: preGenerationContext !== null,
      publicationPool: "central",
      publishedContentItemIds:
        preGenerationContext?.publishedContentItemIds ?? [],
      queuedGenerationKeys: preGenerationContext?.queuedGenerationKeys ?? [],
    },
    publicationSection: draft.section,
    section: draft.section,
    structure: draft.structure,
    tags: draft.tags,
    triggerKey: context.triggerKey,
  };
}
