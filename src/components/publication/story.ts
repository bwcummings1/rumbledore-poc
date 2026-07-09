import type { ContentReactionSummary } from "@/content/reaction-types";

export type PublicationStoryCardVariant =
  | "hero"
  | "secondary"
  | "river"
  | "rail"
  | "compact"
  | "inFeed";

export type PublicationStoryOrigin = "cast" | "source";

export interface PublicationStory {
  id: string;
  headline: string;
  dek: string;
  byline: string;
  sectionTag: string;
  publishedAt: string;
  thumbnailUrl?: string;
  thumbnailAlt?: string;
  href?: string;
  hrefLabel?: string;
  origin?: PublicationStoryOrigin;
  sourceUrl?: string;
  relevanceReason?: string;
  reactions?: ContentReactionSummary;
}
