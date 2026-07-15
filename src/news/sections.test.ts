import { describe, expect, it } from "vitest";
import { AI_CONTENT_TYPES, CONTENT_TYPE_TEMPLATES } from "@/ai/content-types";
import type { AiPersona } from "@/ai/personas";
import {
  CENTRAL_PUBLICATION_BRANCHES,
  CENTRAL_PUBLICATION_SECTIONS,
  getCentralPublicationSectionBySlug,
  getLeaguePublicationSectionBySlug,
  LEAGUE_PUBLICATION_SECTIONS,
  type LeaguePublicationSectionId,
  resolveCentralPublicationSection,
  resolveLeaguePublicationSection,
} from "./sections";

const CONTRADICTORY_PERSONA_BY_SECTION: Record<
  LeaguePublicationSectionId,
  AiPersona
> = {
  "power-rankings": "narrator",
  previews: "trash_talker",
  recaps: "analyst",
  records: "narrator",
  "trash-talk": "beat_reporter",
};

describe("publication section taxonomies", () => {
  it("declares the central News and Fantasy branches from the locked lineup", () => {
    expect(
      CENTRAL_PUBLICATION_BRANCHES.map((branch) => ({
        id: branch.id,
        label: branch.label,
        sections: branch.sections.map((section) => section.label),
      })),
    ).toEqual([
      {
        id: "news",
        label: "News",
        sections: ["The Wire", "The Rundown"],
      },
      {
        id: "fantasy",
        label: "Fantasy",
        sections: [
          "Weekend Recap + MNF Projection",
          "MNF Recap",
          "Pre-waiver",
          "Post-waiver",
          "Matchups",
          "Rankings & Projections",
          "Start/Sit",
          "Injuries",
        ],
      },
    ]);
    expect(CENTRAL_PUBLICATION_SECTIONS).toHaveLength(10);
  });

  it("declares the league beats from the publication spec", () => {
    expect(LEAGUE_PUBLICATION_SECTIONS.map((section) => section.id)).toEqual([
      "recaps",
      "power-rankings",
      "trash-talk",
      "records",
      "previews",
    ]);
    expect(LEAGUE_PUBLICATION_SECTIONS.map((section) => section.label)).toEqual(
      ["Recaps", "Power Rankings", "Trash Talk", "Records", "Previews"],
    );
  });

  it("looks up section fronts by slug", () => {
    expect(getCentralPublicationSectionBySlug("injuries")?.label).toBe(
      "Injuries",
    );
    expect(getCentralPublicationSectionBySlug("start-sit")?.label).toBe(
      "Start/Sit",
    );
    expect(getCentralPublicationSectionBySlug("wire")).toMatchObject({
      branch: "news",
      label: "The Wire",
    });
    expect(
      getCentralPublicationSectionBySlug("rankings-projections"),
    ).toMatchObject({ branch: "fantasy", label: "Rankings & Projections" });
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
    ).toBe("Rankings & Projections");
    expect(
      resolveCentralPublicationSection({
        metadata: { topics: ["practice report"] },
        title: "Starter misses practice",
      }).label,
    ).toBe("Injuries");
    expect(
      resolveCentralPublicationSection({
        metadata: {},
        title: "Waiver wire priority opens after Sunday",
      }).label,
    ).toBe("Pre-waiver");
    expect(
      resolveCentralPublicationSection({
        metadata: {},
        title: "Default fantasy market story",
      }).label,
    ).toBe("The Wire");
    expect(
      resolveCentralPublicationSection({
        metadata: { section: "nfl" },
        title: "Old metadata still maps to the main desk",
      }).label,
    ).toBe("The Wire");
    expect(
      resolveCentralPublicationSection({
        metadata: {},
        title: "Generic league office headline",
      }).label,
    ).toBe("The Wire");
    expect(
      resolveCentralPublicationSection({
        metadata: { centralSection: "wire", topics: ["injuries"] },
        title: "Starter misses practice",
      }),
    ).toMatchObject({ branch: "news", id: "wire", label: "The Wire" });
  });

  it.each(AI_CONTENT_TYPES)(
    "files %s into its template-declared section",
    (contentType) => {
      const expectedSection = CONTENT_TYPE_TEMPLATES[contentType].section;
      const conflictingSection = LEAGUE_PUBLICATION_SECTIONS.find(
        (section) => section.id !== expectedSection,
      );
      expect(conflictingSection).toBeDefined();

      const resolved = resolveLeaguePublicationSection({
        authorPersona: CONTRADICTORY_PERSONA_BY_SECTION[expectedSection],
        kind: "blog",
        metadata: {
          contentType,
          leagueSection: conflictingSection?.id,
          section: conflictingSection?.id,
          tags: [conflictingSection?.label],
        },
        summary: `${conflictingSection?.label} filing fallback`,
        title: `${conflictingSection?.label} desk report`,
      });

      expect(resolved.id).toBe(expectedSection);
    },
  );

  it("uses the template for the formerly contradictory awards assignment", () => {
    expect(
      resolveLeaguePublicationSection({
        authorPersona: "beat_reporter",
        kind: "blog",
        metadata: {
          article: { contentType: "awards_superlatives" },
          leagueSection: "previews",
        },
      }).id,
    ).toBe("trash-talk");
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
        authorPersona: "beat_reporter",
        kind: "blog",
        metadata: {},
      }).label,
    ).toBe("Previews");
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
