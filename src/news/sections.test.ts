import { describe, expect, it } from "vitest";
import {
  CENTRAL_PUBLICATION_SECTIONS,
  getCentralPublicationSectionBySlug,
  getLeaguePublicationSectionBySlug,
  LEAGUE_PUBLICATION_SECTIONS,
  resolveCentralPublicationSection,
  resolveLeaguePublicationSection,
} from "./sections";

describe("publication section taxonomies", () => {
  it("declares the central and league beats from the publication spec", () => {
    expect(
      CENTRAL_PUBLICATION_SECTIONS.map((section) => section.label),
    ).toEqual(["NFL", "Fantasy", "Injuries", "Rankings"]);
    expect(LEAGUE_PUBLICATION_SECTIONS.map((section) => section.label)).toEqual(
      ["Recaps", "Power Rankings", "Trash Talk", "Records", "Previews"],
    );
  });

  it("looks up section fronts by slug", () => {
    expect(getCentralPublicationSectionBySlug("injuries")?.label).toBe(
      "Injuries",
    );
    expect(getLeaguePublicationSectionBySlug("power-rankings")?.label).toBe(
      "Power Rankings",
    );
    expect(getCentralPublicationSectionBySlug("unknown")).toBeNull();
    expect(getLeaguePublicationSectionBySlug("unknown")).toBeNull();
  });

  it("resolves central sections from metadata before text fallback", () => {
    expect(
      resolveCentralPublicationSection({
        metadata: { section: "rankings" },
        summary: "The injury report is messy.",
        title: "Practice report changes the wire",
      }).label,
    ).toBe("Rankings");
    expect(
      resolveCentralPublicationSection({
        metadata: { topics: ["practice report"] },
        title: "Starter misses practice",
      }).label,
    ).toBe("Injuries");
    expect(
      resolveCentralPublicationSection({
        metadata: {},
        title: "Default fantasy market story",
      }).label,
    ).toBe("Fantasy");
  });

  it("resolves league sections from metadata, persona, and kind fallbacks", () => {
    expect(
      resolveLeaguePublicationSection({
        authorPersona: "commissioner",
        kind: "blog",
        metadata: { leagueSection: "records" },
      }).label,
    ).toBe("Records");
    expect(
      resolveLeaguePublicationSection({
        authorPersona: "analyst",
        kind: "blog",
        metadata: {},
      }).label,
    ).toBe("Power Rankings");
    expect(
      resolveLeaguePublicationSection({
        kind: "ingest_event",
        metadata: {},
      }).label,
    ).toBe("Records");
    expect(
      resolveLeaguePublicationSection({
        kind: "news",
        metadata: {},
      }).label,
    ).toBe("Previews");
  });
});
