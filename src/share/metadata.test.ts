// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildOgImageUrl, buildShareMetadata } from "./metadata";

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
    expect(JSON.stringify(metadata.openGraph)).toContain("v=hash-123");
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
});
