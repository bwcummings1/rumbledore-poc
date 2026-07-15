// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AI_CONTENT_TYPES,
  assertLlmJudgeScorePasses,
  type BlogDraft,
  CENTRAL_COLUMN_KEYS,
  CENTRAL_COLUMN_LINEUP,
  type CentralGenerationContext,
  type CentralLlmGenerateRequest,
  CONTENT_TYPE_TEMPLATES,
  centralJournalistForId,
  DEFAULT_LLM_JUDGE_RUBRIC,
  type LeagueBlogContext,
  MockLlmClient,
  MockLlmJudge,
  validateCentralArticleDraft,
  validateContentStructure,
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

function centralEvalContext(
  key: (typeof CENTRAL_COLUMN_KEYS)[number],
): CentralGenerationContext {
  const column = CENTRAL_COLUMN_LINEUP[key];
  const journalist = centralJournalistForId(column.journalistId);
  if (!journalist) throw new Error("central eval journalist is missing");
  return {
    column: {
      branch: column.branch,
      contentType: column.contentType,
      dataSources: column.dataSources,
      formatContract: column.formatContract,
      id: column.id,
      name: column.name,
      section: column.section,
    },
    evidence: {
      fetchedAt: "2026-09-15T12:00:00.000Z",
      games: [
        {
          awayScore: 31,
          awayTeam: "KC",
          fetchedAt: "2026-09-15T12:00:00.000Z",
          gameTime: "2026-09-15T00:15:00.000Z",
          homeScore: 27,
          homeTeam: "MIN",
          sourceGameId: "eval-mnf-final",
          status: "final",
        },
        {
          awayScore: null,
          awayTeam: "SF",
          fetchedAt: "2026-09-15T12:00:00.000Z",
          gameTime: "2026-09-22T00:15:00.000Z",
          homeScore: null,
          homeTeam: "DAL",
          sourceGameId: "eval-mnf-next",
          status: "scheduled",
        },
      ],
      news: [
        {
          body: "Patrick Mahomes was limited in the supplied practice report.",
          id: "eval-central-injury",
          playerRefs: [
            {
              label: "Patrick Mahomes",
              provider: "espn",
              providerId: "3139477",
            },
          ],
          publishedAt: "2026-09-15T11:00:00.000Z",
          source: "Eval Wire",
          sourceUrl: "https://example.invalid/eval-central-injury",
          summary: "A supplied practice-status update.",
          title: "Patrick Mahomes practice update",
        },
      ],
      odds: [
        {
          awayPrice: 115,
          awayTeam: "SF",
          capturedAt: "2026-09-15T12:00:00.000Z",
          homePrice: -135,
          homeTeam: "DAL",
          line: -2.5,
          marketId: "eval-central-spread",
          marketType: "spread",
          outcomePrice: null,
          overPrice: null,
          propType: null,
          subject: "game",
          underPrice: null,
        },
      ],
      players: [
        {
          fantasyPoints: 25.8,
          fetchedAt: "2026-09-15T12:00:00.000Z",
          fullName: "Patrick Mahomes",
          opponentTeam: "MIN",
          position: "QB",
          receptions: 0,
          receivingYards: 0,
          rushingYards: 22,
          sourcePlayerId: "eval-mahomes",
          targets: 0,
          team: "KC",
        },
      ],
      source: "mock-nfl-general-stats",
      sourceFreshness: [],
      teamStats: [
        {
          fetchedAt: "2026-09-15T12:00:00.000Z",
          opponentTeam: "MIN",
          passingYards: 315,
          pointsAgainst: 27,
          pointsFor: 31,
          receivingYards: 315,
          rushingYards: 104,
          sourceGameId: "eval-mnf-final",
          team: "KC",
          turnovers: 1,
        },
      ],
    },
    journalist: {
      beat: journalist.beat,
      id: journalist.id,
      name: journalist.name,
      persona: journalist.persona,
      registerContract: journalist.registerContract,
    },
    preGenerationContext: null,
    reportRequest:
      column.id === "the-rundown"
        ? { brief: "Report on supplied evidence.", category: "eval report" }
        : null,
    requestedAt: "2026-09-15T12:00:00.000Z",
    season: 2026,
    triggerKey: `eval:${column.id}`,
    week: 1,
  };
}

function centralEvalRequest(
  context: CentralGenerationContext,
): CentralLlmGenerateRequest {
  return {
    attempt: 1,
    contentType: context.column.contentType,
    context,
    prompt: {
      prompt: "central eval",
      systemPrefix: "{}",
      volatileContext: JSON.stringify(context.evidence),
    },
  };
}

function editorialSurfaceOverlap(left: BlogDraft, right: BlogDraft): number {
  const tokens = (draft: BlogDraft) =>
    new Set(
      `${draft.title} ${draft.dek} ${draft.summary}`
        .toLocaleLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((token) => token.length > 2) ?? [],
    );
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token));
  return shared.length / union.size;
}

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
    players: {
      benchTragedies: [],
      bestWeeks: [],
      draftBusts: [],
      draftSteals: [],
      positionalBests: {
        "D-ST": [],
        K: [],
        QB: [],
        RB: [],
        TE: [],
        WR: [],
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
  it("passes every central column format on mock shared-substrate evidence", async () => {
    const llm = new MockLlmClient();
    for (const key of CENTRAL_COLUMN_KEYS) {
      const context = centralEvalContext(key);
      const draft = validateCentralArticleDraft(
        await llm.generateCentral(centralEvalRequest(context)),
        { context },
      );
      expect(draft.structure.type, context.column.id).toBe(
        context.column.contentType,
      );
      const serialized = JSON.stringify(draft);
      for (const fixture of EVAL_LEAGUE_FIXTURES) {
        expect(serialized, context.column.id).not.toContain(fixture.leagueName);
        expect(serialized, context.column.id).not.toContain(
          fixture.primaryManager,
        );
      }
    }
  });

  it("reduces same-topic restatement and advances the throughline when editorial recall is on", async () => {
    const llm = new MockLlmClient();
    const baseContext = contextFor({
      fixture: league95050,
      persona: "narrator",
    });
    const first = await generateEvalDraft({
      contentType: "weekly_recap",
      context: baseContext,
      llm,
    });
    const recallOffRepeat = await generateEvalDraft({
      contentType: "weekly_recap",
      context: baseContext,
      llm,
    });
    const recalledContext: LeagueBlogContext = {
      ...baseContext,
      preGenerationContext: {
        digest: [
          `Recent headline: ${first.title}`,
          `Recent angle: ${first.summary}`,
          "Complement this coverage; do not repeat its snapshot framing.",
        ].join("\n"),
        leagueId: baseContext.league.id,
        publicationPool: "league",
        publishedContentItemIds: ["offline-eval-prior-piece"],
        queuedGenerationKeys: [],
      },
    };
    const recallOnFollowup = await generateEvalDraft({
      contentType: "weekly_recap",
      context: recalledContext,
      llm,
    });

    const withoutRecall = editorialSurfaceOverlap(first, recallOffRepeat);
    const withRecall = editorialSurfaceOverlap(first, recallOnFollowup);
    expect(withoutRecall).toBe(1);
    expect(withRecall).toBeLessThan(0.5);
    expect(withRecall).toBeLessThan(withoutRecall);
    expect(recallOnFollowup.title).not.toBe(first.title);
    expect(recallOnFollowup.summary).not.toBe(first.summary);
    expect(recallOnFollowup.body).toContain(
      "advances the points-for consequence instead of restating that angle",
    );

    const recalledRequest = llm.requests[2];
    expect(recalledRequest?.prompt.volatileContext).toContain(first.title);
    expect(recalledRequest?.prompt.volatileContext).toContain(first.summary);
    expect(recalledRequest?.prompt.systemPrefix).not.toContain(first.title);
    expect(recalledRequest?.prompt.systemPrefix).not.toContain(first.summary);
    expect(
      validateContentStructure({
        contentType: "weekly_recap",
        context: recalledContext,
        structure: recallOnFollowup.structure,
      }).type,
    ).toBe("weekly_recap");

    const score = await new MockLlmJudge().score({
      leagueFacts: {
        context: recalledContext,
        otherLeagueEntityTokens: fixtureTokens(isolationLeague),
      },
      piece: recallOnFollowup,
      rubric: DEFAULT_LLM_JUDGE_RUBRIC,
    });
    assertLlmJudgeScorePasses({ label: "editorial recall follow-up", score });
  });

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
        const generalNflPlayer = context.generalNfl.facts[0]?.player.fullName;
        if (!generalNflPlayer) {
          throw new Error(`${fixture.leagueName} has no general NFL fixture`);
        }
        const otherFixture =
          fixture.leagueId === league95050.leagueId
            ? isolationLeague
            : league95050;
        const draft = await generateEvalDraft({ contentType, context, llm });
        expect(draft.body, `${fixture.leagueName}:${contentType}`).toContain(
          "General NFL context (non-canon):",
        );
        expect(draft.body, `${fixture.leagueName}:${contentType}`).toContain(
          generalNflPlayer,
        );
        expect(draft.citedCanonClaimIds).toEqual([
          context.authenticity.canonLore[0]?.id,
        ]);
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

  it("passes Fantasy Friday and Predictions structured fixtures without cross-league leakage", async () => {
    const llm = new MockLlmClient();
    const judge = new MockLlmJudge();

    for (const fixture of EVAL_LEAGUE_FIXTURES) {
      const otherFixture =
        fixture.leagueId === league95050.leagueId
          ? isolationLeague
          : league95050;
      for (const scheduled of [
        {
          cadence: "post-odds-refresh",
          columnFormat: "fantasy-friday" as const,
          persona: "betting_advisor" as const,
        },
        {
          cadence: "weekly-preview",
          columnFormat: "predictions" as const,
          persona: "analyst" as const,
        },
      ]) {
        const base = contextFor({ fixture, persona: scheduled.persona });
        const player = base.generalNfl.facts[0]?.player.fullName;
        if (!player) {
          throw new Error(`${fixture.leagueName} has no blended player fact`);
        }
        const context: LeagueBlogContext = {
          ...base,
          blended: {
            matchupProjections: [
              {
                opponent: fixture.secondaryTeam,
                opponentProjectedScore: 107.8,
                team: fixture.primaryTeam,
                teamProjectedScore: 121.4,
              },
            ],
            oddsSignals: [
              {
                after: 61.54,
                before: 58.33,
                changed: true,
                event: "KC at DAL",
                market: "moneyline",
                unit: "implied_percentage",
              },
            ],
            playerProjections: [
              {
                leagueTeam: fixture.primaryTeam,
                player,
                position: base.generalNfl.facts[0]?.player.position ?? null,
                proTeam: base.generalNfl.facts[0]?.player.team ?? null,
                projectedPoints: 24.2,
              },
            ],
            thursdayNightGames: [
              {
                awayScore: 28,
                awayTeam: "KC",
                gameTime: "2026-09-20T00:20:00.000Z",
                homeScore: 30,
                homeTeam: "DAL",
                status: "final",
              },
            ],
          },
          matchups: [
            {
              awayScore: 98.2,
              awayTeam: fixture.secondaryTeam,
              homeScore: 104.6,
              homeTeam: fixture.primaryTeam,
              status: "in_progress",
            },
          ],
          trigger: {
            ...base.trigger,
            cadence: {
              cadence: scheduled.cadence,
              columnFormat: scheduled.columnFormat,
              event: null,
              gamePhase: "pre_kickoff",
              phase: "regular",
              seasonWeek: 10,
              source: "scheduled",
              stakes: ["weekly_decision_window"],
              weekToken: "10",
            },
          },
        };
        const draft = await generateEvalDraft({
          columnFormat: scheduled.columnFormat,
          contentType: "matchup_preview",
          context,
          llm,
        });
        const validated = validateContentStructure({
          columnFormat: scheduled.columnFormat,
          contentType: "matchup_preview",
          context: { ...context, players: [player] },
          structure: draft.structure,
        });
        expect(validated.type).toBe("matchup_preview");
        if (validated.type !== "matchup_preview") {
          throw new Error("expected a matchup preview structure");
        }
        if (scheduled.columnFormat === "fantasy-friday") {
          expect(validated.fantasyFriday).toMatchObject({
            flashback: { available: true, season: 2024 },
            oddsOrPercentageChanges: [
              { matchup: "KC at DAL", unit: "implied_percentage" },
            ],
            thursdayNightSummaries: [{ awayTeam: "KC", homeTeam: "DAL" }],
          });
        } else {
          expect(validated.predictions).toMatchObject({
            matchups: [
              {
                endScore: { opponentScore: 107.8, teamScore: 121.4 },
                playerPerformances: [{ player, projectedPoints: 24.2 }],
              },
            ],
          });
        }
        const score = await judge.score({
          leagueFacts: {
            context,
            otherLeagueEntityTokens: fixtureTokens(otherFixture),
          },
          piece: draft,
          rubric: DEFAULT_LLM_JUDGE_RUBRIC,
        });
        expect(score.leakage).toBe(false);
        assertLlmJudgeScorePasses({
          label: `${fixture.leagueName}:${scheduled.columnFormat}`,
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

  it("enforces roast consent levels in judge scoring", async () => {
    const judge = new MockLlmJudge();
    const baseContext = contextFor({
      fixture: league95050,
      persona: "trash_talker",
    });
    const persona = baseContext.persona;
    const personaLead = `${persona.name}'s beat: ${persona.beat}. Point of view: ${persona.pointOfView}.`;

    const fullSendContext = {
      ...baseContext,
      authenticity: {
        ...baseContext.authenticity,
        roastConsent: {
          full_send: [league95050.primaryManager],
          light: [league95050.secondaryManager],
          off_limits: [],
        },
      },
    };
    const fullSendScore = await judge.score({
      leagueFacts: { context: fullSendContext },
      piece: weeklyRecapFixture(
        `${personaLead} ${league95050.primaryTeam} and ${league95050.primaryManager} take the loudest ribbing because the canon facts are theirs.`,
      ),
      rubric: DEFAULT_LLM_JUDGE_RUBRIC,
    });
    expect(fullSendScore.targetingConsent).toBe(true);
    expect(fullSendScore.targetedOffLimits).toEqual([]);
    assertLlmJudgeScorePasses({
      label: "full-send roast consent",
      score: fullSendScore,
    });

    const lightContext = {
      ...baseContext,
      authenticity: {
        ...baseContext.authenticity,
        roastConsent: {
          full_send: [],
          light: [league95050.primaryManager, league95050.secondaryManager],
          off_limits: [],
        },
      },
    };
    const lightScore = await judge.score({
      leagueFacts: { context: lightContext },
      piece: weeklyRecapFixture(
        `${personaLead} ${league95050.primaryTeam} and ${league95050.primaryManager} get a playful nudge, not a humiliation lap.`,
      ),
      rubric: DEFAULT_LLM_JUDGE_RUBRIC,
    });
    expect(lightScore.targetingConsent).toBe(true);
    expect(lightScore.targetedOffLimits).toEqual([]);
    assertLlmJudgeScorePasses({
      label: "light roast consent",
      score: lightScore,
    });

    const offLimitsContext = {
      ...baseContext,
      authenticity: {
        ...baseContext.authenticity,
        roastConsent: {
          full_send: [league95050.primaryManager],
          light: [],
          off_limits: [league95050.secondaryManager],
        },
      },
    };
    const offLimitsScore = await judge.score({
      leagueFacts: { context: offLimitsContext },
      piece: weeklyRecapFixture(
        `${personaLead} ${league95050.primaryTeam} and ${league95050.secondaryManager} are framed as the joke of the week.`,
      ),
      rubric: DEFAULT_LLM_JUDGE_RUBRIC,
    });
    expect(offLimitsScore.targetingConsent).toBe(false);
    expect(offLimitsScore.targetedOffLimits).toContain(
      league95050.secondaryManager,
    );
    expect(() =>
      assertLlmJudgeScorePasses({
        label: "off-limits roast consent",
        score: offLimitsScore,
      }),
    ).toThrow("off-limits roast consent failed the AI judge eval gate");
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
