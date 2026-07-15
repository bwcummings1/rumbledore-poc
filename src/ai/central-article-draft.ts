import { AppError } from "@/core/result";
import { centralPublicationSectionById } from "@/news/sections";
import { validateCentralContentStructure } from "./central-content-types";
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

export function validateCentralArticleDraft(
  draft: CentralArticleDraft,
  options: { context: CentralGenerationContext },
): CentralArticleDraft {
  const title = cleanText(draft.title);
  const summary = cleanText(draft.summary);
  const dek = cleanText(draft.dek);
  const tags = normalizeTags(Array.isArray(draft.tags) ? draft.tags : []);
  const bodyBlocks = (Array.isArray(draft.bodyBlocks) ? draft.bodyBlocks : [])
    .map(normalizeBodyBlock)
    .filter((block): block is CentralArticleBodyBlock => block !== null);

  if (
    !title ||
    !summary ||
    !dek ||
    tags.length === 0 ||
    bodyBlocks.length < 2
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

  return {
    body: centralBodyBlocksToMarkdown(bodyBlocks),
    bodyBlocks,
    contentType: draft.contentType,
    dek,
    section: section.id,
    structure: validateCentralContentStructure({
      contentType: draft.contentType,
      context: options.context,
      structure: draft.structure,
    }),
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
