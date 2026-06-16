// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AI_CONTENT_TYPES,
  type AiContentType,
  type AiPersona,
  assertLlmJudgeScorePasses,
  type BlogDraft,
  buildPromptParts,
  CONTENT_TYPE_TEMPLATES,
  DEFAULT_LLM_JUDGE_RUBRIC,
  DEFAULT_PERSONA_CARDS,
  type LeagueBlogContext,
  type LeaguePersonaCard,
  MockLlmClient,
  MockLlmJudge,
} from "@/ai";

interface EvalLeagueFixture {
  leagueId: string;
  leagueName: string;
  providerLeagueId: string;
  primaryTeam: string;
  primaryManager: string;
  secondaryTeam: string;
  secondaryManager: string;
  recordLabel: string;
  canonTitle: string;
  canonStatement: string;
}

const league95050 = {
  canonStatement:
    "Avery Arc owns the annual Week 9 collapse until the room votes otherwise.",
  canonTitle: "The Week 9 Spiral",
  leagueId: "eval-95050",
  leagueName: "NHS Alumni Annual",
  primaryManager: "Avery Arc",
  primaryTeam: "Calc Brawlers",
  providerLeagueId: "95050",
  recordLabel: "single-week points",
  secondaryManager: "Blair Ledger",
  secondaryTeam: "Homeroom Meteors",
} satisfies EvalLeagueFixture;

const isolationLeague = {
  canonStatement:
    "Morgan Lock turned the Canal Bowl into a keeper-league cautionary tale.",
  canonTitle: "The Canal Bowl Curse",
  leagueId: "eval-isolation",
  leagueName: "Canal Street Keeper",
  primaryManager: "Morgan Lock",
  primaryTeam: "Harbor Ghosts",
  providerLeagueId: "33114",
  recordLabel: "keeper-era margin",
  secondaryManager: "Riley North",
  secondaryTeam: "Turnpike Satellites",
} satisfies EvalLeagueFixture;

function uniqueTokens(
  values: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const token = value?.replace(/\s+/g, " ").trim();
    if (!token || token.length < 3) {
      continue;
    }
    const key = token.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(token);
  }
  return result;
}

function personaCard(persona: AiPersona): LeaguePersonaCard {
  const defaults = DEFAULT_PERSONA_CARDS[persona];
  return {
    beat: defaults.beat,
    enabled: defaults.enabled,
    id: `eval-persona-${persona}`,
    maxWords: defaults.maxWords,
    minWords: defaults.minWords,
    name: defaults.name,
    performsWhen: defaults.performsWhen,
    persona,
    pointOfView: defaults.pointOfView,
    promptTemplate: defaults.promptTemplate,
    purpose: defaults.purpose,
    tone: defaults.tone,
    toneProfile: defaults.toneProfile,
    toneUpdatedAt: new Date("2026-06-11T00:00:00.000Z"),
    toneUpdatedBy: null,
    toneVersion: defaults.toneVersion,
  };
}

function contextFor({
  fixture,
  persona,
}: {
  fixture: EvalLeagueFixture;
  persona: AiPersona;
}): LeagueBlogContext {
  const teams = [
    {
      losses: 2,
      managerNames: [fixture.primaryManager],
      name: fixture.primaryTeam,
      pointsAgainst: 1010.4,
      pointsFor: 1242.6,
      ties: 0,
      wins: 7,
    },
    {
      losses: 5,
      managerNames: [fixture.secondaryManager],
      name: fixture.secondaryTeam,
      pointsAgainst: 1164.3,
      pointsFor: 1117.9,
      ties: 0,
      wins: 4,
    },
  ];
  const records = [
    {
      holderName: fixture.primaryManager,
      id: `${fixture.leagueId}-record-primary`,
      label: fixture.recordLabel,
      previousHolderName: null,
      previousRecordId: null,
      previousValue: null,
      recordType: "highest_single_week_score",
      scoringPeriod: 9,
      season: 2024,
      value: 186.4,
    },
  ];
  const people = [
    {
      canonicalName: fixture.primaryManager,
      id: `${fixture.leagueId}-person-primary`,
      ownerNames: [fixture.primaryManager],
    },
    {
      canonicalName: fixture.secondaryManager,
      id: `${fixture.leagueId}-person-secondary`,
      ownerNames: [fixture.secondaryManager],
    },
  ];
  const rivalries = [
    {
      currentStreakLength: 2,
      currentStreakName: fixture.primaryManager,
      id: `${fixture.leagueId}-rivalry`,
      longestStreakLength: 3,
      longestStreakName: fixture.secondaryManager,
      meetings: 11,
      personAName: fixture.primaryManager,
      personAWins: 6,
      personBName: fixture.secondaryManager,
      personBWins: 5,
      ties: 0,
    },
  ];
  const canonLore = [
    {
      authorPersona: "narrator" as const,
      branchOf: null,
      kind: "opinion",
      id: `${fixture.leagueId}-canon`,
      origin: "member",
      provenance: "vote" as const,
      ratifiedAt: new Date("2026-06-01T00:00:00.000Z"),
      ratifiedBy: fixture.secondaryManager,
      relation: "root",
      sourceInstigationId: null,
      sourcePollId: null,
      statement: fixture.canonStatement,
      status: "canon" as const,
      title: fixture.canonTitle,
      verification: "n_a",
      voteClosesAt: null,
    },
  ];
  return {
    authenticity: {
      canonLore,
      entityTokens: uniqueTokens([
        ...teams.flatMap((team) => [team.name, ...team.managerNames]),
        ...records.flatMap((record) => [record.holderName, record.label]),
        ...people.flatMap((person) => [
          person.canonicalName,
          ...person.ownerNames,
        ]),
        ...rivalries.flatMap((rivalry) => [
          rivalry.personAName,
          rivalry.personBName,
          `${rivalry.personAName} vs ${rivalry.personBName}`,
          rivalry.currentStreakName,
          rivalry.longestStreakName,
        ]),
        ...canonLore.flatMap((claim) => [claim.title, claim.statement]),
      ]),
      lore: {
        canon: canonLore,
        disputed: [],
        pending: [],
        refuted: [],
      },
      people,
      rivalries,
    },
    league: {
      currentScoringPeriod: 10,
      id: fixture.leagueId,
      name: fixture.leagueName,
      providerLeagueId: fixture.providerLeagueId,
      scoringType: "H2H_POINTS",
      season: 2026,
      status: "in_season",
    },
    arena: {
      computedAt: "2026-06-12T00:00:00.000Z",
      fieldLeader: {
        currentBalanceCents: 13_000,
        displayName: `${fixture.leagueName} Field Leader`,
        id: `${fixture.leagueId}-leader`,
        netPnlCents: 3_000,
        rank: 1,
        rankDelta: 0,
        roiBps: 2_500,
        weeksSurvived: 1,
        winRateBps: 6_667,
      },
      headToHead: {
        anchor: {
          currentBalanceCents: 11_500,
          displayName: fixture.leagueName,
          id: fixture.leagueId,
          netPnlCents: 1_500,
          rank: 2,
          rankDelta: 2,
          roiBps: 1_500,
          weeksSurvived: 1,
          winRateBps: 5_000,
        },
        comparison: "trailing",
        leaderDisplayName: `${fixture.leagueName} Field Leader`,
        marginCents: 1_500,
        rankGap: 1,
        rival: {
          currentBalanceCents: 13_000,
          displayName: `${fixture.leagueName} Field Leader`,
          id: `${fixture.leagueId}-leader`,
          netPnlCents: 3_000,
          rank: 1,
          rankDelta: 0,
          roiBps: 2_500,
          weeksSurvived: 1,
          winRateBps: 6_667,
        },
      },
      leagueStanding: {
        currentBalanceCents: 11_500,
        displayName: fixture.leagueName,
        id: fixture.leagueId,
        netPnlCents: 1_500,
        rank: 2,
        rankDelta: 2,
        roiBps: 1_500,
        weeksSurvived: 1,
        winRateBps: 5_000,
      },
      movers: {
        fallers: [],
        risers: [
          {
            displayName: fixture.leagueName,
            kind: "league",
            netPnlCents: 1_500,
            previousRank: 4,
            rank: 2,
            rankDelta: 2,
          },
        ],
      },
      season: {
        endsAt: "2026-12-31T00:00:00.000Z",
        id: `${fixture.leagueId}-arena-season`,
        name: "Fixture Arena",
        startsAt: "2026-01-01T00:00:00.000Z",
        status: "active",
      },
      topLeagueStandings: [
        {
          currentBalanceCents: 13_000,
          displayName: `${fixture.leagueName} Field Leader`,
          id: `${fixture.leagueId}-leader`,
          netPnlCents: 3_000,
          rank: 1,
          rankDelta: 0,
          roiBps: 2_500,
          weeksSurvived: 1,
          winRateBps: 6_667,
        },
      ],
    },
    memory: [],
    persona: personaCard(persona),
    priorPosts: [],
    records,
    teams,
    trigger: {
      instigation: null,
      loreClaim: null,
      poll: null,
    },
  };
}

async function generateEvalDraft({
  contentType,
  context,
  llm,
}: {
  contentType: AiContentType;
  context: LeagueBlogContext;
  llm: MockLlmClient;
}): Promise<BlogDraft> {
  const prompt = buildPromptParts({
    contentType,
    context,
    newsItems: [],
    triggerKey: `offline-eval:${contentType}`,
  });
  return llm.generate({
    attempt: 1,
    contentType,
    context,
    newsItems: [],
    persona: context.persona.persona,
    prompt,
  });
}

function fixtureTokens(fixture: EvalLeagueFixture): string[] {
  return uniqueTokens([
    fixture.primaryTeam,
    fixture.primaryManager,
    fixture.secondaryTeam,
    fixture.secondaryManager,
    fixture.recordLabel,
    fixture.canonTitle,
    fixture.canonStatement,
  ]);
}

function weeklyRecapFixture(body: string): BlogDraft {
  return {
    body,
    bodyBlocks: [
      { text: "Eval fixture", type: "heading" },
      { text: body, type: "paragraph" },
    ],
    contentType: "weekly_recap",
    dek: body,
    section: "recaps",
    structure: {
      kicker: body,
      lead: body,
      standingsShift: body,
      topResult: body,
      type: "weekly_recap",
      upsetOrBlowout: body,
    },
    summary: body,
    tags: ["Eval"],
    title: "Eval fixture",
  };
}

describe("offline AI judge eval gate", () => {
  it("passes every content type for deterministic league fixtures without cross-league leakage", async () => {
    const llm = new MockLlmClient();
    const judge = new MockLlmJudge();
    const fixtures = [league95050, isolationLeague] as const;

    for (const fixture of fixtures) {
      for (const contentType of AI_CONTENT_TYPES) {
        const persona = CONTENT_TYPE_TEMPLATES[contentType].defaultPersonas[0];
        if (!persona) {
          throw new Error(`${contentType} has no default persona`);
        }
        const context = contextFor({ fixture, persona });
        const otherFixture =
          fixture.leagueId === league95050.leagueId
            ? isolationLeague
            : league95050;
        const draft = await generateEvalDraft({ contentType, context, llm });
        const score = await judge.score({
          leagueFacts: {
            context,
            otherLeagueEntityTokens: fixtureTokens(otherFixture),
          },
          piece: draft,
          rubric: DEFAULT_LLM_JUDGE_RUBRIC,
        });

        expect(score.leakage, `${fixture.leagueName}:${contentType}`).toBe(
          false,
        );
        expect(score.authenticity, `${fixture.leagueName}:${contentType}`).toBe(
          1,
        );
        expect(score.personaMatch, `${fixture.leagueName}:${contentType}`).toBe(
          1,
        );
        assertLlmJudgeScorePasses({
          label: `${fixture.leagueName}:${contentType}`,
          score,
        });
      }
    }
  });

  it("fails generic, persona-broken, and leaking fixtures", async () => {
    const judge = new MockLlmJudge();
    const context = contextFor({
      fixture: league95050,
      persona: "commissioner",
    });

    const genericScore = await judge.score({
      leagueFacts: {
        context,
        otherLeagueEntityTokens: fixtureTokens(isolationLeague),
      },
      piece: weeklyRecapFixture(
        "This league had some fantasy football drama, but no concrete local fact appears.",
      ),
      rubric: DEFAULT_LLM_JUDGE_RUBRIC,
    });
    expect(genericScore.authenticity).toBe(0);
    expect(() =>
      assertLlmJudgeScorePasses({
        label: "generic fixture",
        score: genericScore,
      }),
    ).toThrow("generic fixture failed the AI judge eval gate");

    const personaBrokenScore = await judge.score({
      leagueFacts: {
        context,
        otherLeagueEntityTokens: fixtureTokens(isolationLeague),
      },
      piece: weeklyRecapFixture(
        "Calc Brawlers and Avery Arc control the standings, but the piece carries no cast beat, role, or point of view.",
      ),
      rubric: DEFAULT_LLM_JUDGE_RUBRIC,
    });
    expect(personaBrokenScore.authenticity).toBeGreaterThanOrEqual(
      DEFAULT_LLM_JUDGE_RUBRIC.authenticityThreshold,
    );
    expect(personaBrokenScore.personaMatch).toBeLessThan(
      DEFAULT_LLM_JUDGE_RUBRIC.personaMatchThreshold,
    );
    expect(() =>
      assertLlmJudgeScorePasses({
        label: "persona-broken fixture",
        score: personaBrokenScore,
      }),
    ).toThrow("persona-broken fixture failed the AI judge eval gate");

    const persona = context.persona;
    const leakingScore = await judge.score({
      leagueFacts: {
        context,
        otherLeagueEntityTokens: fixtureTokens(isolationLeague),
      },
      piece: weeklyRecapFixture(
        `${persona.name}'s beat: ${persona.beat} Point of view: ${persona.pointOfView} Calc Brawlers and Avery Arc own this column, but Harbor Ghosts should never enter this league's article.`,
      ),
      rubric: DEFAULT_LLM_JUDGE_RUBRIC,
    });
    expect(leakingScore.leakage).toBe(true);
    expect(leakingScore.leakedTokens).toContain("Harbor Ghosts");
    expect(() =>
      assertLlmJudgeScorePasses({
        label: "leaking fixture",
        score: leakingScore,
      }),
    ).toThrow("leaking fixture failed the AI judge eval gate");
  });
});
