// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AI_CONTENT_TYPES,
  assertLlmJudgeScorePasses,
  CONTENT_TYPE_TEMPLATES,
  DEFAULT_LLM_JUDGE_RUBRIC,
  MockLlmClient,
  MockLlmJudge,
} from "@/ai";
import {
  getPersonalAgentAnswer,
  type PersonalAgentBriefingInput,
} from "@/ai/personal-agent";
import { DEFAULT_ENTITLEMENT_CAPS } from "@/core/env/schema";
import type { Db } from "@/db/client";
import type { RecordsCatalog } from "@/stats";
import { forgeCanonCatalogForTest } from "@/testing/canon";
import {
  contextFor,
  EVAL_LEAGUE_FIXTURES,
  fixtureTokens,
  generateEvalDraft,
  isolationLeague,
  league95050,
  weeklyRecapFixture,
} from "./fixtures";

const personalAgentEvalEnv = {
  entitlements: {
    caps: DEFAULT_ENTITLEMENT_CAPS,
    devOverride: true,
    gateArenaAdvanced: false,
  },
} satisfies PersonalAgentBriefingInput["env"];

const offlineDb = {} as Db;

function emptyRecordsCatalog(
  overrides: Partial<RecordsCatalog> = {},
): RecordsCatalog {
  return {
    achievements: {
      highestScoringSeasons: [],
      longestWinStreaks: [],
      mostRegularSeasonTitles: [],
      mostRunnerUps: [],
      mostTitles: [],
      mostTopScoringWeeks: [],
    },
    allTimeStandings: [],
    blowouts: {
      biggest: [],
      biggestLosses: [],
      narrowestLosses: [],
      narrowestWins: [],
    },
    championships: {
      managerRecords: [],
      seasons: [],
    },
    headToHead: {
      allTimePairs: [],
      longestStreaks: [],
      managerLedgers: [],
      seasonPairs: [],
    },
    highLow: {
      bestScoresInLosses: [],
      highestCombinedMatchups: [],
      highestScores: [],
      lowestScores: [],
      worstScoresInWins: [],
    },
    integrityBlocked: false,
    lowlights: {
      biggestLosses: [],
      lowestScoringSeasons: [],
      mostBottomScoringWeeks: [],
      mostLastPlaceFinishes: [],
      narrowestLosses: [],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    milestones: {
      keeper: {
        entries: [],
        status: "unavailable",
        summary: null,
      },
    },
    playoff: {
      highestScoringAverages: [],
      highestScoringSeasons: [],
      lowestScoringSeasons: [],
      mostPointsAgainstSeasons: [],
      standings: [],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    regularSeason: {
      highestScoringAverages: [],
      highestScoringSeasons: [],
      lowestScoringSeasons: [],
      mostPointsAgainstSeasons: [],
      standings: [],
      worstScoringAverages: [],
      worstWinPercentages: [],
    },
    streaks: {
      longestLosses: [],
      longestWins: [],
    },
    ...overrides,
  };
}

function canonScoreCatalog(fixture = league95050): RecordsCatalog {
  return emptyRecordsCatalog({
    highLow: {
      bestScoresInLosses: [],
      highestCombinedMatchups: [],
      highestScores: [
        {
          matchupId: `${fixture.leagueId}-week-9`,
          opponentName: fixture.secondaryManager,
          opponentPersonId: `${fixture.leagueId}-person-secondary`,
          personId: `${fixture.leagueId}-person-primary`,
          personName: fixture.primaryManager,
          recordType: "highest_single_week_score",
          scoringPeriod: 9,
          season: 2024,
          value: 186.4,
        },
      ],
      lowestScores: [],
      worstScoresInWins: [],
    },
  });
}

describe("offline AI judge eval gate", () => {
  it("passes every content type for deterministic league fixtures without cross-league leakage", async () => {
    const llm = new MockLlmClient();
    const judge = new MockLlmJudge();

    for (const fixture of EVAL_LEAGUE_FIXTURES) {
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

describe("offline personal-agent canon evals", () => {
  it("cites canon and the curated Record Book for league answers", async () => {
    const result = await getPersonalAgentAnswer({
      context: {
        leagueId: league95050.leagueId,
        pathname: `/leagues/${league95050.leagueId}/records`,
        scope: "league",
        sectionId: "records",
      },
      db: offlineDb,
      env: personalAgentEvalEnv,
      loadLeagueQuestionContext: async () => ({
        canonFacts: [
          `${league95050.canonTitle}: ${league95050.canonStatement}`,
        ],
        catalog: forgeCanonCatalogForTest(canonScoreCatalog()),
        leagueId: league95050.leagueId,
        leagueName: league95050.leagueName,
        lens: { grouping: null, segment: "both" },
      }),
      now: () => new Date("2026-06-15T12:00:00.000Z"),
      question: "Who owns the top score?",
      userId: "offline-eval-user",
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("expected offline personal-agent answer");
    }
    expect(result.answer.text).toContain(league95050.primaryManager);
    expect(result.answer.text).toContain("186.40");
    expect(result.answer.text).toContain("curated Record Book");
    expect(result.answer.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Curated Record Book" }),
        expect.objectContaining({
          detail: `${league95050.canonTitle}: ${league95050.canonStatement}`,
          label: "Ratified canon checked",
        }),
      ]),
    );
  });

  it("does not assert un-ratified history suggested by the question", async () => {
    const result = await getPersonalAgentAnswer({
      context: {
        leagueId: league95050.leagueId,
        pathname: `/leagues/${league95050.leagueId}/records`,
        scope: "league",
        sectionId: "records",
      },
      db: offlineDb,
      env: personalAgentEvalEnv,
      loadLeagueQuestionContext: async () => ({
        canonFacts: [],
        catalog: forgeCanonCatalogForTest(canonScoreCatalog()),
        leagueId: league95050.leagueId,
        leagueName: league95050.leagueName,
        lens: { grouping: null, segment: "both" },
      }),
      now: () => new Date("2026-06-15T12:00:00.000Z"),
      question:
        "The unratified chat says Blair Ledger scored 999. Who owns the top score?",
      userId: "offline-eval-user",
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") {
      throw new Error("expected offline personal-agent answer");
    }
    expect(result.answer.text).toContain(league95050.primaryManager);
    expect(result.answer.text).not.toContain("999");
    expect(result.answer.text).not.toContain("unratified chat");
    expect(result.answer.text).not.toContain("Blair Ledger scored");
    expect(result.answer.citations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ detail: expect.stringContaining("999") }),
      ]),
    );
  });
});
