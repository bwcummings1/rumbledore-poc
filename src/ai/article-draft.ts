import { AppError } from "@/core/result";
import {
  getLeaguePublicationSectionBySlug,
  type LeaguePublicationSectionId,
} from "@/news/sections";
import {
  type AiContentType,
  defaultLeagueArticleSectionForContentType,
  parseAiContentType,
  validateContentStructure,
} from "./content-types";
import type {
  BlogDraft,
  BlogDraftBodyBlock,
  LeagueBlogContext,
} from "./interfaces";
import type { AiPersona } from "./personas";

const MAX_TAGS = 8;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeTags(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const value of values) {
    const tag = cleanText(value);
    const key = tag.toLowerCase();
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
  block: BlogDraftBodyBlock,
): BlogDraftBodyBlock | null {
  switch (block.type) {
    case "heading": {
      const text = cleanText(block.text);
      return text ? { text, type: "heading" } : null;
    }
    case "paragraph": {
      const text = cleanText(block.text);
      return text ? { text, type: "paragraph" } : null;
    }
    case "quote": {
      const text = cleanText(block.text);
      return text ? { text, type: "quote" } : null;
    }
    case "list": {
      const rawItems = Array.isArray(block.items) ? block.items : [];
      const items = normalizeTags(rawItems);
      return items.length > 0
        ? { items, ordered: block.ordered === true, type: "list" }
        : null;
    }
  }
}

export function normalizeLeagueArticleSection(
  value: unknown,
): LeaguePublicationSectionId | null {
  const section = cleanText(value);
  return section
    ? (getLeaguePublicationSectionBySlug(section)?.id ?? null)
    : null;
}

export function defaultLeagueArticleSectionForPersona(
  persona: AiPersona,
): LeaguePublicationSectionId {
  switch (persona) {
    case "analyst":
      return "power-rankings";
    case "beat_reporter":
    case "betting_advisor":
    case "commissioner":
      return "previews";
    case "narrator":
      return "recaps";
    case "trash_talker":
      return "trash-talk";
  }
}

export { defaultLeagueArticleSectionForContentType };

export function bodyBlocksToMarkdown(
  blocks: readonly BlogDraftBodyBlock[],
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
    .join("\n\n");
}

function draftReferencesLeagueEntity(
  draft: BlogDraft,
  context: LeagueBlogContext,
): boolean {
  const text = blogDraftText(draft).toLowerCase();
  const entityTokens = [
    ...context.authenticity.entityTokens,
    ...context.teams.flatMap((team) => [team.name, ...team.managerNames]),
    ...context.records.flatMap((record) => [
      record.holderName ?? "",
      record.label,
    ]),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return entityTokens.some((token) => text.includes(token.toLowerCase()));
}

export function validateBlogDraft(
  draft: BlogDraft,
  options: {
    contentType: AiContentType;
    context: LeagueBlogContext;
  },
): BlogDraft {
  const title = cleanText(draft.title);
  const summary = cleanText(draft.summary);
  const dek = cleanText(draft.dek);
  const body = cleanText(draft.body);
  const section = normalizeLeagueArticleSection(draft.section);
  const rawTags = Array.isArray(draft.tags) ? draft.tags : [];
  const tags = normalizeTags(rawTags);
  const rawBodyBlocks = Array.isArray(draft.bodyBlocks) ? draft.bodyBlocks : [];
  const bodyBlocks = rawBodyBlocks
    .map(normalizeBodyBlock)
    .filter((block): block is BlogDraftBodyBlock => block !== null);

  if (!title || !summary || !dek || !body) {
    throw new AppError({
      code: "AI_DRAFT_EMPTY",
      message: "AI draft must include a headline, summary, dek, and body",
      status: 422,
    });
  }

  const contentType = parseAiContentType(draft.contentType);
  if (contentType !== options.contentType) {
    throw new AppError({
      code: "AI_DRAFT_CONTENT_TYPE_MISMATCH",
      message: "AI draft content type did not match the generation job",
      status: 422,
    });
  }

  const structure = validateContentStructure({
    contentType,
    context: options.context,
    structure: draft.structure,
  });

  if (!section || tags.length === 0 || bodyBlocks.length < 2) {
    throw new AppError({
      code: "AI_DRAFT_ARTICLE_INVALID",
      message:
        "AI draft must include a league section, tags, and a structured body",
      status: 422,
    });
  }

  const expectedSection =
    defaultLeagueArticleSectionForContentType(contentType);
  if (section !== expectedSection) {
    throw new AppError({
      code: "AI_DRAFT_SECTION_MISMATCH",
      message: "AI draft section did not match the content type template",
      status: 422,
    });
  }

  const canonicalBody = bodyBlocksToMarkdown(bodyBlocks);
  const banned = /\b(DraftKings|FanDuel|sportsbook|real money)\b/i;
  if (
    banned.test(
      [title, summary, dek, canonicalBody, section, ...tags].join("\n"),
    )
  ) {
    throw new AppError({
      code: "AI_DRAFT_CONSTRAINT_FAILED",
      message: "AI draft used restricted betting language",
      status: 422,
    });
  }

  const normalizedDraft: BlogDraft = {
    body: canonicalBody,
    bodyBlocks,
    citedCanonClaimIds: normalizeCitedCanonClaimIds(draft, options.context),
    contentType,
    dek,
    section,
    structure,
    summary,
    tags,
    title,
  };

  if (!draftReferencesLeagueEntity(normalizedDraft, options.context)) {
    throw new AppError({
      code: "AI_DRAFT_GENERIC",
      message: "AI draft must reference a concrete league-owned entity",
      status: 422,
    });
  }

  return normalizedDraft;
}

export function blogDraftText(draft: BlogDraft): string {
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

function includesDraftText(text: string, value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.length > 0 && text.includes(normalized);
}

function allowedCanonClaimIds(context: LeagueBlogContext): Set<string> {
  const ids = new Set(context.authenticity.lore.canon.map((claim) => claim.id));
  const triggerClaim = context.trigger.loreClaim;
  if (triggerClaim?.status === "canon") {
    ids.add(triggerClaim.id);
  }
  return ids;
}

function normalizeCitedCanonClaimIds(
  draft: BlogDraft,
  context: LeagueBlogContext,
): string[] {
  const rawIds = Array.isArray(draft.citedCanonClaimIds)
    ? draft.citedCanonClaimIds
    : [];
  const allowed = allowedCanonClaimIds(context);
  const seen = new Set<string>();
  const citedIds: string[] = [];
  const invalidIds: string[] = [];

  for (const rawId of rawIds) {
    const id = cleanText(rawId);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (!allowed.has(id)) {
      invalidIds.push(id);
      continue;
    }
    citedIds.push(id);
  }

  if (invalidIds.length > 0) {
    throw new AppError({
      code: "AI_DRAFT_CANON_CITATION_INVALID",
      message: "AI draft cited lore claims that are not active canon",
      status: 422,
    });
  }

  return citedIds;
}

interface CanonCitationSource {
  id: string;
  ratifiedAt: Date | null;
  ratifiedBy: string | null;
  statement: string;
  title: string;
}

function canonCitationMetadata(claim: CanonCitationSource) {
  return {
    claimId: claim.id,
    ratifiedAt: claim.ratifiedAt?.toISOString() ?? null,
    ratifiedBy: claim.ratifiedBy,
    statement: claim.statement,
    title: claim.title,
  };
}

function canonCitationsForDraft({
  context,
  draft,
}: {
  context: LeagueBlogContext;
  draft: BlogDraft;
}) {
  const text = blogDraftText(draft).replace(/\s+/g, " ").toLowerCase();
  const cited = new Map<string, CanonCitationSource>();
  const canonById = new Map<string, CanonCitationSource>(
    context.authenticity.lore.canon.map((claim) => [claim.id, claim]),
  );
  const triggerClaim = context.trigger.loreClaim;
  if (triggerClaim?.status === "canon") {
    canonById.set(triggerClaim.id, {
      id: triggerClaim.id,
      ratifiedAt: triggerClaim.ratifiedAt,
      ratifiedBy: triggerClaim.ratifiedBy,
      statement: triggerClaim.statement,
      title: triggerClaim.title,
    });
  }

  for (const claim of context.authenticity.lore.canon) {
    if (
      includesDraftText(text, claim.title) ||
      includesDraftText(text, claim.statement)
    ) {
      cited.set(claim.id, claim);
    }
  }

  if (triggerClaim?.status === "canon") {
    const claim = canonById.get(triggerClaim.id);
    if (claim) {
      cited.set(claim.id, claim);
    }
  }

  for (const claimId of draft.citedCanonClaimIds ?? []) {
    const claim = canonById.get(claimId);
    if (claim) {
      cited.set(claim.id, claim);
    }
  }

  return [...cited.values()].map(canonCitationMetadata);
}

export function blogDraftMetadata({
  context,
  draft,
  persona,
  triggerKey,
}: {
  context?: LeagueBlogContext;
  draft: BlogDraft;
  persona: AiPersona;
  triggerKey: string;
}): Record<string, unknown> {
  const canonCitations = context
    ? canonCitationsForDraft({ context, draft })
    : [];
  const citedCanonClaimIds = canonCitations.map((citation) => citation.claimId);
  return {
    article: {
      bodyBlocks: draft.bodyBlocks,
      bylinePersona: persona,
      canonCitations,
      citedCanonClaimIds,
      contentType: draft.contentType,
      format: "rumbledore.article.v1",
      headline: draft.title,
      structure: draft.structure,
    },
    bodyBlocks: draft.bodyBlocks,
    byline: persona,
    canonCitations,
    citedCanonClaimIds,
    content_type: draft.contentType,
    contentType: draft.contentType,
    dek: draft.dek,
    leagueSection: draft.section,
    section: draft.section,
    structure: draft.structure,
    tags: draft.tags,
    triggerKey,
  };
}
