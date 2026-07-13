import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ogCardFromSearchParams,
  ogCardSnapshot,
  renderOgCard,
} from "./og-card";

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
        "brandMark": "RUMBLEDORE",
        "byline": "Central Wire",
        "bylineContext": "Central news",
        "headline": "Quarterback injury changes Sunday",
        "kind": "central_article",
        "leagueName": "",
        "section": "Injuries",
        "sectionChip": "Injuries",
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
        "brandMark": "RUMBLEDORE",
        "byline": "Narrator",
        "bylineContext": "The Press",
        "headline": "Narrator files the rivalry column",
        "kind": "league_article",
        "leagueName": "NHS Alumni Annual",
        "section": "Recaps",
        "sectionChip": "Recaps",
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
        "brandMark": "RUMBLEDORE",
        "byline": "League invite",
        "bylineContext": "League invite",
        "headline": "Join NHS Alumni Annual",
        "kind": "invite",
        "leagueName": "NHS Alumni Annual",
        "section": "Claim your team",
        "sectionChip": "Claim your team",
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
        "brandMark": "RUMBLEDORE",
        "byline": "Editorial desk",
        "bylineContext": "Status notice",
        "headline": "No longer available",
        "kind": "neutral",
        "leagueName": "",
        "section": "Editorial lifecycle",
        "sectionChip": "Editorial lifecycle",
        "status": "retracted",
        "summary": "This story was retracted or superseded.",
      }
    `);
  });

  it("renders one brand mark and a meaningful section chip deterministically", () => {
    const data = ogCardFromSearchParams(
      new URLSearchParams({
        byline: "Central Wire",
        kind: "central_article",
        section: "Injuries",
        summary: "Central summary is allowed in open central previews.",
        title: "Quarterback injury changes Sunday",
      }),
    );

    const first = renderToStaticMarkup(renderOgCard(data));
    const second = renderToStaticMarkup(renderOgCard(data));

    expect(first).toBe(second);
    expect(first.match(/RUMBLEDORE/gu)).toHaveLength(1);
    expect(first).toContain(">Injuries<");
    expect(first).not.toContain("Share card");
  });
});
