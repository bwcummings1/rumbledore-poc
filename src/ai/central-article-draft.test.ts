import { describe, expect, it } from "vitest";
import { centralPlayerRefsFromEvidence } from "./central-article-draft";
import type { CentralGenerationNewsEvidence } from "./interfaces";

function newsEvidence(
  id: string,
  playerRefs: CentralGenerationNewsEvidence["playerRefs"],
): CentralGenerationNewsEvidence {
  return {
    body: "",
    id,
    playerRefs,
    publishedAt: "2026-09-15T00:00:00.000Z",
    source: "mock-wire",
    sourceUrl: `https://news.example/${id}`,
    summary: "",
    title: id,
  };
}

describe("centralPlayerRefsFromEvidence (REC-007)", () => {
  it("aggregates, de-dupes, normalizes, and sorts player refs from news evidence", () => {
    const refs = centralPlayerRefsFromEvidence([
      newsEvidence("n1", [
        { label: "Patrick Mahomes", provider: "ESPN", providerId: "3139477" },
        // duplicate by (provider, providerId) with provider case-normalized —
        // first occurrence (with the label) is kept.
        { label: null, provider: "espn", providerId: "3139477" },
        // dropped: no providerId.
        { label: "Nobody", provider: "espn", providerId: "  " },
      ]),
      newsEvidence("n2", [
        {
          label: "Christian McCaffrey",
          provider: "sleeper",
          providerId: "4046",
        },
      ]),
    ]);

    // Sorted by provider then providerId; providers lower-cased; empties dropped.
    expect(refs).toEqual([
      { label: "Patrick Mahomes", provider: "espn", providerId: "3139477" },
      { label: "Christian McCaffrey", provider: "sleeper", providerId: "4046" },
    ]);
  });

  it("returns an empty list when no news evidence carries player refs", () => {
    expect(centralPlayerRefsFromEvidence([])).toEqual([]);
    expect(centralPlayerRefsFromEvidence([newsEvidence("n1", [])])).toEqual([]);
  });
});
