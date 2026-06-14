export type PublicationStoryCardVariant =
  | "hero"
  | "secondary"
  | "river"
  | "rail";

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
  sourceUrl?: string;
  relevanceReason?: string;
}
