import { and, eq, isNull } from "drizzle-orm";
import {
  buildPersonaBylineMap,
  resolvePersonaByline,
} from "@/ai/persona-display";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  type ContentItem,
  contentItems,
  leagues,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import { articleDek } from "./article-metadata";
import {
  resolveCentralPublicationSection,
  resolveLeaguePublicationSection,
} from "./sections";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShareLifecycleStatus = ContentItem["status"];

export interface CentralArticleShareMetadata {
  byline: string;
  contentHash: string;
  dek: string;
  id: string;
  section: {
    label: string;
    slug: string;
  };
  status: ShareLifecycleStatus;
  title: string;
}

export interface LeagueArticleShareMetadata {
  byline: string;
  contentHash: string;
  id: string;
  league: {
    id: string;
    name: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    season: number;
  };
  section: {
    label: string;
    slug: string;
  };
  status: ShareLifecycleStatus;
  title: string;
}

export interface LeagueRouteShareMetadata {
  id: string;
  name: string;
  provider: FantasyProviderId;
  providerLeagueId: string;
  season: number;
}

export type CentralArticleShareMetadataResult =
  | { data: CentralArticleShareMetadata; status: "ready" }
  | { status: "not_found" };

export type LeagueArticleShareMetadataResult =
  | { data: LeagueArticleShareMetadata; status: "ready" }
  | { status: "not_found" };

export type LeagueRouteShareMetadataResult =
  | { data: LeagueRouteShareMetadata; status: "ready" }
  | { status: "not_found" };

function sourceLabel(value: string | null): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : "Central news";
}

export async function getCentralNewsArticleShareMetadata(
  db: Db,
  input: { articleId: string },
): Promise<CentralArticleShareMetadataResult> {
  if (!UUID_RE.test(input.articleId)) {
    return { status: "not_found" };
  }

  const [row] = await db
    .select({
      contentHash: contentItems.contentHash,
      id: contentItems.id,
      metadata: contentItems.metadata,
      source: contentItems.source,
      status: contentItems.status,
      summary: contentItems.summary,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.id, input.articleId),
        isNull(contentItems.leagueId),
        eq(contentItems.kind, "news"),
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

  return {
    data: {
      byline: sourceLabel(row.source),
      contentHash: row.contentHash,
      dek: articleDek(row.metadata, row.summary),
      id: row.id,
      section: {
        label: section.label,
        slug: section.slug,
      },
      status: row.status,
      title: row.title,
    },
    status: "ready",
  };
}

export async function getLeagueRouteShareMetadata(
  db: Db,
  input: { leagueId: string },
): Promise<LeagueRouteShareMetadataResult> {
  if (!UUID_RE.test(input.leagueId)) {
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

  return league ? { data: league, status: "ready" } : { status: "not_found" };
}

export async function getLeaguePressArticleShareMetadata(
  db: Db,
  input: { leagueId: string; postId: string },
): Promise<LeagueArticleShareMetadataResult> {
  if (!UUID_RE.test(input.leagueId) || !UUID_RE.test(input.postId)) {
    return { status: "not_found" };
  }

  const leagueResult = await getLeagueRouteShareMetadata(db, {
    leagueId: input.leagueId,
  });
  if (leagueResult.status !== "ready") {
    return { status: "not_found" };
  }
  const league = leagueResult.data;

  const row = await withLeagueContext(db, input.leagueId, async (tx) => {
    const [article] = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        contentHash: contentItems.contentHash,
        id: contentItems.id,
        metadata: contentItems.metadata,
        status: contentItems.status,
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

    if (!article) {
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
    const byline = resolvePersonaByline(article.authorPersona, personaBylines);
    const section = resolveLeaguePublicationSection({
      authorPersona: article.authorPersona,
      kind: "blog",
      metadata: article.metadata,
      summary: article.summary,
      title: article.title,
    });

    return {
      byline: byline.label,
      contentHash: article.contentHash,
      id: article.id,
      section: {
        label: section.label,
        slug: section.slug,
      },
      status: article.status,
      title: article.title,
    };
  });

  if (!row) {
    return { status: "not_found" };
  }

  return {
    data: {
      ...row,
      league,
    },
    status: "ready",
  };
}
