// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { DEV_OG_IMAGE_SIGNING_SECRET } from "@/core/env/schema";
import { buildOgImageUrl, buildShareMetadata } from "./metadata";
import { ogImageVersionKey, verifyOgImageSignature } from "./og-signature";
import {
  centralNewsArticleMetadata,
  leagueArticleMetadata,
} from "./route-metadata";

vi.mock("server-only", () => ({}));

const base = new URL("https://rumbledore.example");

describe("share metadata", () => {
  it("emits complete OG and Twitter metadata with a deterministic card URL", () => {
    const metadata = buildShareMetadata({
      description: "Central article summary.",
      image: {
        byline: "Central Wire",
        hash: "hash-123",
        headline: "Quarterback injury changes Sunday",
        kind: "central_article",
        section: "Injuries",
        summary: "Central article summary.",
      },
      path: "/news/articles/article-1",
      title: "Quarterback injury changes Sunday | Rumbledore News",
      type: "article",
    });

    expect(metadata.openGraph).toMatchObject({
      description: "Central article summary.",
      siteName: "Rumbledore",
      title: "Quarterback injury changes Sunday | Rumbledore News",
      type: "article",
      url: "http://localhost:3000/news/articles/article-1",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      description: "Central article summary.",
      title: "Quarterback injury changes Sunday | Rumbledore News",
    });
    expect(JSON.stringify(metadata.openGraph)).toContain("/api/og?");
    expect(JSON.stringify(metadata.openGraph)).toContain("s=");
    expect(JSON.stringify(metadata.openGraph)).not.toContain("hash-123");
    const [image] = Array.isArray(metadata.openGraph?.images)
      ? metadata.openGraph.images
      : [];
    const imageUrl = new URL(String((image as { url: URL }).url));
    expect(imageUrl.searchParams.get("v")).toBe(
      ogImageVersionKey("hash-123", DEV_OG_IMAGE_SIGNING_SECRET),
    );
    expect(
      verifyOgImageSignature(
        imageUrl.searchParams,
        DEV_OG_IMAGE_SIGNING_SECRET,
      ),
    ).toBe(true);
  });

  it("allows central cards to carry summary copy", () => {
    const url = buildOgImageUrl(
      {
        byline: "Central Wire",
        headline: "Central story",
        kind: "central_article",
        section: "Headlines",
        summary: "Central summary is allowed on open central content.",
      },
      base,
    );

    expect(url.searchParams.get("summary")).toBe(
      "Central summary is allowed on open central content.",
    );
    expect(
      verifyOgImageSignature(url.searchParams, DEV_OG_IMAGE_SIGNING_SECRET),
    ).toBe(true);
  });

  it("never serializes league article summaries into share-card URLs", () => {
    const url = buildOgImageUrl(
      {
        byline: "Narrator",
        headline: "League story",
        kind: "league_article",
        leagueName: "Fixture League",
        section: "Recaps",
        summary: "PRIVATE BODY COPY SHOULD NOT LEAK",
      },
      base,
    );

    expect(url.searchParams.has("summary")).toBe(false);
    expect(url.toString()).not.toContain("PRIVATE");
  });

  it("rejects unsigned or tampered OG image params", () => {
    const url = buildOgImageUrl(
      {
        byline: "Central Wire",
        headline: "Central story",
        kind: "central_article",
        section: "Headlines",
        summary: "Central summary.",
      },
      base,
    );

    const unsigned = new URL(url);
    unsigned.searchParams.delete("s");
    expect(
      verifyOgImageSignature(
        unsigned.searchParams,
        DEV_OG_IMAGE_SIGNING_SECRET,
      ),
    ).toBe(false);

    url.searchParams.set("title", "Tampered");
    expect(
      verifyOgImageSignature(url.searchParams, DEV_OG_IMAGE_SIGNING_SECRET),
    ).toBe(false);
  });

  it("noindexes league article teasers while keeping central articles indexable", () => {
    const league = leagueArticleMetadata({
      byline: "Narrator",
      contentHash: "league-hash",
      id: "post-1",
      league: {
        id: "league-1",
        name: "Fixture League",
        provider: "espn",
        providerLeagueId: "95050",
        season: 2026,
      },
      section: { label: "Recaps", slug: "recaps" },
      status: "published",
      title: "League story",
    });
    const central = centralNewsArticleMetadata({
      byline: "Central Wire",
      contentHash: "central-hash",
      dek: "Central summary.",
      id: "article-1",
      section: { label: "Injuries", slug: "injuries" },
      status: "published",
      title: "Central story",
    });

    expect(league.robots).toEqual({ follow: false, index: false });
    expect(central.robots).toBeUndefined();
  });
});
