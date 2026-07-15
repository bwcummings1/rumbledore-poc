// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateCentralArticleDraft } from "./central-article-draft";
import {
  CENTRAL_COLUMN_KEYS,
  CENTRAL_COLUMN_LINEUP,
  centralJournalistForId,
} from "./central-columns";
import {
  CENTRAL_CONTENT_TYPE_TEMPLATES,
  validateCentralContentStructure,
} from "./central-content-types";
import type {
  CentralGenerationContext,
  CentralLlmGenerateRequest,
} from "./interfaces";
import { MockLlmClient } from "./mocks";

function contextForColumn(
  key: (typeof CENTRAL_COLUMN_KEYS)[number],
  empty = false,
): CentralGenerationContext {
  const column = CENTRAL_COLUMN_LINEUP[key];
  const journalist = centralJournalistForId(column.journalistId);
  if (!journalist) throw new Error("central journalist fixture is missing");
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
      fetchedAt: empty ? null : "2026-09-15T12:00:00.000Z",
      games: empty
        ? []
        : [
            {
              awayScore: 24,
              awayTeam: "KC",
              fetchedAt: "2026-09-15T12:00:00.000Z",
              gameTime: "2026-09-14T00:15:00.000Z",
              homeScore: 20,
              homeTeam: "BUF",
              sourceGameId: "fixture-sunday-final",
              status: "final",
            },
            {
              awayScore: 28,
              awayTeam: "DAL",
              fetchedAt: "2026-09-15T12:00:00.000Z",
              gameTime: "2026-09-15T00:15:00.000Z",
              homeScore: 27,
              homeTeam: "PHI",
              sourceGameId: "fixture-monday-final",
              status: "final",
            },
            {
              awayScore: null,
              awayTeam: "SF",
              fetchedAt: "2026-09-15T12:00:00.000Z",
              gameTime: "2026-09-22T00:15:00.000Z",
              homeScore: null,
              homeTeam: "MIN",
              sourceGameId: "fixture-monday-scheduled",
              status: "scheduled",
            },
          ],
      news: empty
        ? []
        : [
            {
              body: "Patrick Mahomes was listed on the supplied practice report.",
              id: "fixture-news-injury",
              playerRefs: [
                {
                  label: "Patrick Mahomes",
                  provider: "espn",
                  providerId: "3139477",
                },
              ],
              publishedAt: "2026-09-15T11:00:00.000Z",
              source: "Fixture Wire",
              sourceUrl: "https://example.invalid/fixture-injury",
              summary: "A supplied practice-status update.",
              title: "Patrick Mahomes practice update",
            },
          ],
      odds: empty
        ? []
        : [
            {
              awayPrice: 115,
              awayTeam: "SF",
              capturedAt: "2026-09-15T12:00:00.000Z",
              homePrice: -135,
              homeTeam: "MIN",
              line: -2.5,
              marketId: "fixture-market",
              marketType: "spread",
              outcomePrice: null,
              overPrice: null,
              propType: null,
              subject: "game",
              underPrice: null,
            },
          ],
      players: empty
        ? []
        : [
            {
              fantasyPoints: 25.8,
              fetchedAt: "2026-09-15T12:00:00.000Z",
              fullName: "Patrick Mahomes",
              opponentTeam: "BUF",
              position: "QB",
              receptions: 0,
              receivingYards: 0,
              rushingYards: 22,
              sourcePlayerId: "fixture-mahomes",
              targets: 0,
              team: "KC",
            },
            {
              fantasyPoints: 22.4,
              fetchedAt: "2026-09-15T12:00:00.000Z",
              fullName: "CeeDee Lamb",
              opponentTeam: "PHI",
              position: "WR",
              receptions: 8,
              receivingYards: 112,
              rushingYards: 0,
              sourcePlayerId: "fixture-lamb",
              targets: 11,
              team: "DAL",
            },
          ],
      source: empty ? null : "mock-nfl-general-stats",
      sourceFreshness: [],
      teamStats: empty
        ? []
        : [
            {
              fetchedAt: "2026-09-15T12:00:00.000Z",
              opponentTeam: "BUF",
              passingYards: 315,
              pointsAgainst: 20,
              pointsFor: 24,
              receivingYards: 315,
              rushingYards: 104,
              sourceGameId: "fixture-sunday-final",
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
        ? { brief: "Summarize the supplied fixture.", category: "fixture" }
        : null,
    requestedAt: "2026-09-15T12:00:00.000Z",
    season: 2026,
    triggerKey: `fixture:${column.id}`,
    week: 1,
  };
}

function requestFor(
  context: CentralGenerationContext,
): CentralLlmGenerateRequest {
  return {
    attempt: 1,
    contentType: context.column.contentType,
    context,
    prompt: {
      prompt: "fixture",
      systemPrefix: "{}",
      volatileContext: "{}",
    },
  };
}

describe("central content format contracts", () => {
  it("generates and validates every configured central structure", async () => {
    expect(Object.keys(CENTRAL_CONTENT_TYPE_TEMPLATES)).toHaveLength(10);
    const llm = new MockLlmClient();

    for (const key of CENTRAL_COLUMN_KEYS) {
      const context = contextForColumn(key);
      const draft = await llm.generateCentral(requestFor(context));
      const validated = validateCentralArticleDraft(draft, { context });
      expect(validated.contentType).toBe(context.column.contentType);
      expect(validated.section).toBe(context.column.section);
      expect(validated.structure.type).toBe(context.column.contentType);
      expect(validated.bodyBlocks.length).toBeGreaterThanOrEqual(2);
    }
    expect(llm.centralRequests).toHaveLength(10);
  });

  it("degrades every central format without inventing absent mock data", async () => {
    const llm = new MockLlmClient();
    for (const key of CENTRAL_COLUMN_KEYS) {
      const context = contextForColumn(key, true);
      const draft = await llm.generateCentral(requestFor(context));
      const validated = validateCentralArticleDraft(draft, { context });
      expect(validated.structure).toMatchObject({
        dataStatus: "unavailable",
        type: context.column.contentType,
      });
    }
  });

  it("rejects central structures that name unsupplied players", async () => {
    const context = contextForColumn("rankingsProjections");
    const draft = await new MockLlmClient().generateCentral(
      requestFor(context),
    );
    if (draft.structure.type !== "central_rankings_projections") {
      throw new Error("expected rankings fixture");
    }
    const tampered = {
      ...draft.structure,
      rankings: draft.structure.rankings.map((entry, index) =>
        index === 0 ? { ...entry, player: "Invented Player" } : entry,
      ),
    };

    expect(() =>
      validateCentralContentStructure({
        contentType: "central_rankings_projections",
        context,
        structure: tampered,
      }),
    ).toThrow("must reference a supplied player");
  });

  it("rejects invented Rundown metrics and units despite a real evidence citation", async () => {
    const context = contextForColumn("theRundown");
    const draft = await new MockLlmClient().generateCentral(
      requestFor(context),
    );
    if (draft.structure.type !== "central_rundown_report") {
      throw new Error("expected Rundown fixture");
    }
    const findingIndex = draft.structure.findings.findIndex(
      (finding) => finding.metric !== null,
    );
    const finding = draft.structure.findings[findingIndex];
    if (!finding || finding.metric === null || finding.unit === null) {
      throw new Error("expected grounded Rundown metric fixture");
    }

    for (const replacement of [
      { metric: 99, unit: finding.unit },
      { metric: finding.metric, unit: "touchdowns" },
    ]) {
      const tampered = {
        ...draft.structure,
        findings: draft.structure.findings.map((entry, index) =>
          index === findingIndex ? { ...entry, ...replacement } : entry,
        ),
      };

      expect(() =>
        validateCentralContentStructure({
          contentType: "central_rundown_report",
          context,
          structure: tampered,
        }),
      ).toThrow("metric and unit must match cited supplied evidence");
    }
  });

  it("rejects fabricated processed waiver outcomes without transaction evidence", async () => {
    const context = contextForColumn("postWaiver");
    const draft = await new MockLlmClient().generateCentral(
      requestFor(context),
    );
    if (draft.structure.type !== "central_post_waiver") {
      throw new Error("expected post-waiver fixture");
    }
    const player = context.evidence.players[0];
    if (!player) throw new Error("expected player evidence fixture");
    const tampered = {
      ...draft.structure,
      outcomesAvailable: true,
      processedOutcomes: [
        {
          evidenceRefs: [`player:${player.sourcePlayerId}`],
          outcome: `${player.fullName} cleared waivers for a $95 FAB bid.`,
          player: player.fullName,
          rosterAvailabilityPercent: null,
          team: player.team,
        },
      ],
    };

    expect(() =>
      validateCentralContentStructure({
        contentType: "central_post_waiver",
        context,
        structure: tampered,
      }),
    ).toThrow(
      "processed waiver outcomes must remain unavailable until transaction evidence is supplied",
    );
  });
});
