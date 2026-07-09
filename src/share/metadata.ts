import type { Metadata } from "next";
import { getEnv } from "@/core/env";
import type { OgCardKind, OgCardStatus } from "./og-card";

const SITE_NAME = "Rumbledore";
const DEFAULT_DESCRIPTION =
  "Your fantasy league's home base: history, records, news, AI takes, and paper betting.";
const TITLE_LIMIT = 92;
const DESCRIPTION_LIMIT = 180;
const IMAGE_TEXT_LIMIT = 120;

export interface ShareImageInput {
  byline?: string | null;
  hash?: string | null;
  headline: string;
  kind: OgCardKind;
  leagueName?: string | null;
  section?: string | null;
  status?: OgCardStatus;
  summary?: string | null;
}

export interface ShareMetadataInput {
  description?: string | null;
  image: ShareImageInput;
  noIndex?: boolean;
  path: string;
  title: string;
  type?: "article" | "website";
}

export function siteBaseUrl(): URL {
  return new URL(getEnv().auth.url);
}

export function absoluteAppUrl(path: string, base: URL = siteBaseUrl()): URL {
  return new URL(path, base);
}

export function cleanShareText(
  value: string | null | undefined,
  limit = DESCRIPTION_LIMIT,
): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function unavailableShareMetadata(path: string): Metadata {
  return buildShareMetadata({
    description: "This Rumbledore story is no longer available.",
    image: {
      headline: "No longer available",
      kind: "neutral",
      section: "Editorial lifecycle",
      status: "retracted",
    },
    noIndex: true,
    path,
    title: "No longer available | Rumbledore",
  });
}

export function buildShareMetadata(input: ShareMetadataInput): Metadata {
  const base = siteBaseUrl();
  const canonical = absoluteAppUrl(input.path, base);
  const title = cleanShareText(input.title, TITLE_LIMIT) || SITE_NAME;
  const description =
    cleanShareText(input.description, DESCRIPTION_LIMIT) || DEFAULT_DESCRIPTION;
  const image = buildOgImageUrl(input.image, base);
  const imageAlt = ogImageAlt(input.image);

  return {
    alternates: {
      canonical: canonical.toString(),
    },
    description,
    metadataBase: base,
    openGraph: {
      description,
      images: [
        {
          alt: imageAlt,
          height: 630,
          url: image,
          width: 1200,
        },
      ],
      siteName: SITE_NAME,
      title,
      type: input.type ?? "website",
      url: canonical.toString(),
    },
    robots: input.noIndex ? { follow: false, index: false } : undefined,
    title,
    twitter: {
      card: "summary_large_image",
      description,
      images: [image.toString()],
      title,
    },
  };
}

export function buildOgImageUrl(
  input: ShareImageInput,
  base: URL = siteBaseUrl(),
): URL {
  const url = absoluteAppUrl("/api/og", base);
  const params = url.searchParams;

  params.set("kind", input.kind);
  params.set("title", cleanShareText(input.headline, IMAGE_TEXT_LIMIT));
  setOptionalParam(params, "byline", input.byline);
  setOptionalParam(params, "league", input.leagueName);
  setOptionalParam(params, "section", input.section);
  setOptionalParam(params, "status", input.status);
  setOptionalParam(params, "v", input.hash);

  if (input.kind === "central_article") {
    setOptionalParam(
      params,
      "summary",
      cleanShareText(input.summary, IMAGE_TEXT_LIMIT),
    );
  }

  return url;
}

function setOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | null | undefined,
) {
  const cleaned = cleanShareText(value, IMAGE_TEXT_LIMIT);
  if (cleaned) {
    params.set(key, cleaned);
  }
}

function ogImageAlt(input: ShareImageInput): string {
  if (input.status && input.status !== "published") {
    return "Rumbledore card: no longer available";
  }
  const parts = [
    input.headline,
    input.byline,
    input.leagueName,
    input.section,
  ].flatMap((part) => {
    const cleaned = cleanShareText(part, 80);
    return cleaned ? [cleaned] : [];
  });
  return `Rumbledore card: ${parts.join(" · ") || SITE_NAME}`;
}
