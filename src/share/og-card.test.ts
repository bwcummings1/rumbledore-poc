import { describe, expect, it } from "vitest";
import { ogCardFromSearchParams, ogCardSnapshot } from "./og-card";

function card(params: Record<string, string>) {
  return ogCardSnapshot(ogCardFromSearchParams(new URLSearchParams(params)));
}

describe("OG card normalization", () => {
  it("snapshots a central article card with summary copy", () => {
    expect(
      card({
        byline: "Central Wire",
        kind: "central_article",
        section: "Injuries",
        summary: "Central summary is allowed in open central previews.",
        title: "Quarterback injury changes Sunday",
      }),
    ).toMatchInlineSnapshot(`
      {
        "byline": "Central Wire",
        "headline": "Quarterback injury changes Sunday",
        "kind": "central_article",
        "leagueName": "",
        "section": "Injuries",
        "status": "published",
        "summary": "Central summary is allowed in open central previews.",
      }
    `);
  });

  it("snapshots a league article card without body or summary copy", () => {
    expect(
      card({
        byline: "Narrator",
        kind: "league_article",
        league: "NHS Alumni Annual",
        section: "Recaps",
        summary: "PRIVATE BODY COPY SHOULD NOT LEAK",
        title: "Narrator files the rivalry column",
      }),
    ).toMatchInlineSnapshot(`
      {
        "byline": "Narrator",
        "headline": "Narrator files the rivalry column",
        "kind": "league_article",
        "leagueName": "NHS Alumni Annual",
        "section": "Recaps",
        "status": "published",
        "summary": "",
      }
    `);
  });

  it("snapshots an invite card", () => {
    expect(
      card({
        byline: "League invite",
        kind: "invite",
        league: "NHS Alumni Annual",
        section: "Claim your team",
        title: "Join NHS Alumni Annual",
      }),
    ).toMatchInlineSnapshot(`
      {
        "byline": "League invite",
        "headline": "Join NHS Alumni Annual",
        "kind": "invite",
        "leagueName": "NHS Alumni Annual",
        "section": "Claim your team",
        "status": "published",
        "summary": "",
      }
    `);
  });

  it("snapshots a neutral retracted card", () => {
    expect(
      card({
        byline: "Narrator",
        kind: "league_article",
        league: "NHS Alumni Annual",
        section: "Recaps",
        status: "retracted",
        title: "Old story",
      }),
    ).toMatchInlineSnapshot(`
      {
        "byline": "Rumbledore",
        "headline": "No longer available",
        "kind": "neutral",
        "leagueName": "",
        "section": "Editorial lifecycle",
        "status": "retracted",
        "summary": "This story was retracted or superseded.",
      }
    `);
  });
});
