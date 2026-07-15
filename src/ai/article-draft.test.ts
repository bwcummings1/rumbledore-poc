import { describe, expect, it } from "vitest";
import {
  LEAGUE_EDITORIAL_IMPORTANCE_BASELINE,
  LEAGUE_EDITORIAL_IMPORTANCE_LEAD,
} from "@/news/front";
import { blogDraftMetadata, validateBlogDraft } from "./article-draft";
import type { BlogDraft, LeagueBlogContext } from "./interfaces";
import { DEFAULT_TONE_PROFILES, DEFAULT_TONE_VERSION } from "./personas";

const leagueId = "00000000-0000-4000-8000-000000000001";
const canonClaimId = "00000000-0000-4000-8000-000000000201";
const pendingClaimId = "00000000-0000-4000-8000-000000000202";

function context(): LeagueBlogContext {
  const canonClaim = {
    authorPersona: "narrator",
    branchOf: null,
    id: canonClaimId,
    kind: "opinion",
    origin: "member",
    provenance: "vote",
    ratifiedAt: new Date("2026-06-10T12:00:00.000Z"),
    ratifiedBy: "vote",
    relation: "original",
    sourceInstigationId: null,
    sourcePollId: null,
    statement: "Canon Alpha owns the Snow Bowl collapse",
    status: "canon",
    title: "Snow Bowl Collapse",
    verification: "none",
    voteClosesAt: null,
  } satisfies LeagueBlogContext["authenticity"]["lore"]["canon"][number];

  return {
    arena: {
      computedAt: null,
      fieldLeader: null,
      headToHead: null,
      leagueStanding: null,
      movers: { fallers: [], risers: [] },
      season: null,
      topLeagueStandings: [],
    },
    authenticity: {
      canonLore: [canonClaim],
      entityTokens: ["Fixture Team"],
      lore: {
        canon: [canonClaim],
        disputed: [],
        pending: [
          {
            authorPersona: null,
            branchOf: null,
            id: pendingClaimId,
            kind: "opinion",
            origin: "member",
            ratifiedAt: null,
            ratifiedBy: null,
            relation: "original",
            sourceInstigationId: null,
            sourcePollId: null,
            statement: "The pending rumor should not be cited as canon",
            status: "vote",
            title: "Pending rumor",
            verification: "none",
            voteClosesAt: null,
          },
        ],
        refuted: [],
      },
      people: [],
      rivalries: [],
      roastConsent: { full_send: [], light: [], off_limits: [] },
    },
    league: {
      currentScoringPeriod: 1,
      id: leagueId,
      name: "Fixture League",
      providerLeagueId: "95050",
      scoringType: "H2H_POINTS",
      season: 2026,
      status: "in_season",
    },
    generalNfl: {
      boundary: "general_nfl_context_not_league_canon",
      facts: [],
      source: null,
    },
    memory: [],
    persona: {
      beat: "Story-driven recaps",
      enabled: true,
      id: "00000000-0000-4000-8000-000000000301",
      maxWords: 180,
      minWords: 80,
      name: "Narrator",
      performsWhen: ["weekly_recap"],
      persona: "narrator",
      pointOfView: "Mythic but grounded",
      promptTemplate: "Tell the story.",
      purpose: "League history",
      tone: "cinematic",
      toneProfile: DEFAULT_TONE_PROFILES.narrator,
      toneUpdatedAt: new Date("2026-06-11T00:00:00.000Z"),
      toneUpdatedBy: null,
      toneVersion: DEFAULT_TONE_VERSION,
    },
    priorPosts: [],
    records: [],
    teams: [
      {
        losses: 1,
        managerNames: ["Canon Alpha"],
        name: "Fixture Team",
        pointsAgainst: 100,
        pointsFor: 120,
        ties: 0,
        wins: 2,
      },
    ],
    trigger: {
      correction: null,
      instigation: null,
      loreClaim: null,
      poll: null,
    },
  };
}

function weeklyDraft(overrides: Partial<BlogDraft> = {}): BlogDraft {
  const bodyBlocks: BlogDraft["bodyBlocks"] = [
    { text: "Frozen folklore", type: "heading" },
    {
      text: "Fixture Team still carries the league's cold-weather collapse legend into this week's recap.",
      type: "paragraph",
    },
  ];
  return {
    body: "Fixture Team still carries the league's cold-weather collapse legend into this week's recap.",
    bodyBlocks,
    citedCanonClaimIds: [canonClaimId],
    contentType: "weekly_recap",
    dek: "Fixture Team brings an old winter legend back into the recap.",
    section: "recaps",
    structure: {
      kicker: "Fixture Team keeps the old winter scar in circulation.",
      lead: "Fixture Team is the recap's anchor.",
      standingsShift: "Fixture Team held position.",
      topResult: "Fixture Team was the result to watch.",
      type: "weekly_recap",
      upsetOrBlowout: "Fixture Team made the margin matter.",
    },
    summary: "Fixture Team gets a recap with cited canon.",
    tags: ["Fixture Team", "Canon"],
    title: "Fixture Team revisits the winter legend",
    ...overrides,
  };
}

function powerRankingsDraft(overrides: Partial<BlogDraft> = {}): BlogDraft {
  const bodyBlocks: BlogDraft["bodyBlocks"] = [
    { text: "Model board", type: "heading" },
    {
      text: "Fixture Team keeps the top line because the record and points both point there.",
      type: "paragraph",
    },
  ];
  return {
    body: "Fixture Team keeps the top line because the record and points both point there.",
    bodyBlocks,
    citedCanonClaimIds: [canonClaimId],
    contentType: "power_rankings",
    dek: "Fixture Team stays on top of the model board.",
    section: "power-rankings",
    structure: {
      rankings: [
        {
          delta: 0,
          rank: 1,
          rationale: "Fixture Team is 2-1-0 with 120 points for.",
          record: "2-1-0",
          team: "Fixture Team",
        },
      ],
      type: "power_rankings",
    },
    summary: "Fixture Team tops the power rankings.",
    tags: ["Fixture Team", "Power"],
    title: "Fixture Team leads the model board",
    ...overrides,
  };
}

describe("blog draft canon citations", () => {
  it("persists structured citations for paraphrased canon claims", () => {
    const leagueContext = context();
    const draft = validateBlogDraft(weeklyDraft(), {
      contentType: "weekly_recap",
      context: leagueContext,
    });

    const metadata = blogDraftMetadata({
      context: leagueContext,
      draft,
      persona: "narrator",
      triggerKey: "weekly:fixture",
    });

    expect(metadata).toMatchObject({
      citedCanonClaimIds: [canonClaimId],
      canonCitations: [
        {
          claimId: canonClaimId,
          statement: "Canon Alpha owns the Snow Bowl collapse",
          title: "Snow Bowl Collapse",
        },
      ],
      editorialImportance: LEAGUE_EDITORIAL_IMPORTANCE_BASELINE,
    });
    expect(metadata.article).toMatchObject({
      citedCanonClaimIds: [canonClaimId],
      canonCitations: [{ claimId: canonClaimId }],
    });
  });

  it("persists an explicit league lead signal in article metadata", () => {
    const leagueContext = context();
    const draft = validateBlogDraft(weeklyDraft(), {
      contentType: "weekly_recap",
      context: leagueContext,
    });

    expect(
      blogDraftMetadata({
        context: leagueContext,
        draft,
        editorialImportance: LEAGUE_EDITORIAL_IMPORTANCE_LEAD,
        persona: "narrator",
        triggerKey: "weekly:lead",
      }),
    ).toMatchObject({
      editorialImportance: LEAGUE_EDITORIAL_IMPORTANCE_LEAD,
    });
  });

  it("rejects generated citations to non-canon lore claims", () => {
    expect(() =>
      validateBlogDraft(weeklyDraft({ citedCanonClaimIds: [pendingClaimId] }), {
        contentType: "weekly_recap",
        context: context(),
      }),
    ).toThrowError("AI draft cited lore claims that are not active canon");
  });

  it("adds live-data embed blocks to recap and power-ranking drafts", () => {
    const leagueContext = context();
    const recap = validateBlogDraft(weeklyDraft(), {
      contentType: "weekly_recap",
      context: leagueContext,
    });
    const rankings = validateBlogDraft(powerRankingsDraft(), {
      contentType: "power_rankings",
      context: leagueContext,
    });

    expect(recap.bodyBlocks).toEqual(
      expect.arrayContaining([
        {
          embed: {
            kind: "scoreboard_strip",
            scoringPeriod: 1,
            season: 2026,
            title: "Week 1 scoreboard",
          },
          type: "embed",
        },
      ]),
    );
    expect(rankings.bodyBlocks).toEqual(
      expect.arrayContaining([
        {
          embed: {
            kind: "standings_movement",
            limit: 8,
            season: 2026,
            title: "Standings movement",
          },
          type: "embed",
        },
      ]),
    );
    expect(recap.body).not.toContain("scoreboard_strip");
    expect(rankings.body).not.toContain("standings_movement");
  });
});
