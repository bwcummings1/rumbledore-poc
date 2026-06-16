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
  contextFor,
  EVAL_LEAGUE_FIXTURES,
  fixtureTokens,
  generateEvalDraft,
  isolationLeague,
  league95050,
  weeklyRecapFixture,
} from "./fixtures";

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
