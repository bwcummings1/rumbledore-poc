import {
  type AiContentType,
  type AiPersona,
  type BlogDraft,
  buildPromptParts,
  DEFAULT_PERSONA_CARDS,
  type LeagueBlogContext,
  type LeaguePersonaCard,
  type LlmClient,
} from "@/ai";
import type { PromptTemplate } from "@/ai/prompt-templates";

export interface EvalLeagueFixture {
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

export const league95050 = {
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

export const isolationLeague = {
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

export const EVAL_LEAGUE_FIXTURES = [league95050, isolationLeague] as const;

function generalNflFactForFixture(
  fixture: EvalLeagueFixture,
): LeagueBlogContext["generalNfl"]["facts"][number] {
  const isPrimary = fixture.leagueId === league95050.leagueId;
  return {
    boundary: "general_nfl_context_not_league_canon",
    confidence: "provider_id",
    latestWeek: {
      fantasyPoints: isPrimary ? 27.78 : 14.4,
      interceptions: isPrimary ? 1 : 0,
      opponentTeam: isPrimary ? "DAL" : "SF",
      passingTouchdowns: isPrimary ? 2 : 0,
      passingYards: isPrimary ? 292 : 0,
      receptions: isPrimary ? 0 : 6,
      receivingTouchdowns: 0,
      receivingYards: isPrimary ? 0 : 84,
      rushingTouchdowns: isPrimary ? 1 : 0,
      rushingYards: isPrimary ? 31 : 0,
      targets: isPrimary ? 0 : 9,
      team: isPrimary ? "KC" : "MIN",
      week: 2,
    },
    player: {
      fullName: isPrimary ? "Patrick Mahomes" : "Justin Jefferson",
      position: isPrimary ? "QB" : "WR",
      sourcePlayerId: isPrimary
        ? "mock-patrick-mahomes"
        : "mock-justin-jefferson",
      team: isPrimary ? "KC" : "MIN",
    },
    roster: {
      leagueTeamName: fixture.primaryTeam,
      playerName: isPrimary ? "Patrick Mahomes" : "Justin Jefferson",
      provider: "espn",
      providerPlayerId: isPrimary ? "3139477" : "4262921",
      providerTeamId: "1",
      rosterSlot: isPrimary ? "QB" : "WR",
      started: true,
    },
    schedule: [
      {
        awayScore: isPrimary ? 28 : 20,
        awayTeam: isPrimary ? "KC" : "MIN",
        gameTime: "2026-09-20T00:20:00.000Z",
        homeScore: isPrimary ? 30 : 26,
        homeTeam: isPrimary ? "DAL" : "SF",
        status: "final",
        week: 2,
      },
    ],
    season: 2026,
    seasonTotals: {
      fantasyPoints: isPrimary ? 53.58 : 40,
      games: 2,
      interceptions: isPrimary ? 2 : 0,
      passingTouchdowns: isPrimary ? 5 : 0,
      passingYards: isPrimary ? 607 : 0,
      receptions: isPrimary ? 0 : 14,
      receivingTouchdowns: isPrimary ? 0 : 1,
      receivingYards: isPrimary ? 0 : 200,
      rushingTouchdowns: isPrimary ? 1 : 0,
      rushingYards: isPrimary ? 53 : 0,
      targets: isPrimary ? 0 : 20,
    },
    source: "mock-nfl-general-stats",
  };
}

export function uniqueTokens(
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

export function evalPersonaCard({
  overrides,
  persona,
}: {
  persona: AiPersona;
  overrides?: Partial<
    Pick<
      LeaguePersonaCard,
      "toneProfile" | "toneUpdatedAt" | "toneUpdatedBy" | "toneVersion"
    >
  >;
}): LeaguePersonaCard {
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
    toneProfile: overrides?.toneProfile ?? defaults.toneProfile,
    toneUpdatedAt:
      overrides?.toneUpdatedAt ?? new Date("2026-06-11T00:00:00.000Z"),
    toneUpdatedBy: overrides?.toneUpdatedBy ?? null,
    toneVersion: overrides?.toneVersion ?? defaults.toneVersion,
  };
}

export function contextFor({
  fixture,
  persona,
  personaCard,
}: {
  fixture: EvalLeagueFixture;
  persona: AiPersona;
  personaCard?: LeaguePersonaCard;
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
      roastConsent: {
        full_send: [],
        light: [fixture.primaryManager, fixture.secondaryManager],
        off_limits: [],
      },
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
    generalNfl: {
      boundary: "general_nfl_context_not_league_canon",
      facts: [generalNflFactForFixture(fixture)],
      source: "mock-nfl-general-stats",
    },
    memory: [],
    persona: personaCard ?? evalPersonaCard({ persona }),
    priorPosts: [],
    records,
    teams,
    trigger: {
      correction: null,
      instigation: null,
      loreClaim: null,
      poll: null,
    },
  };
}

export async function generateEvalDraft({
  contentType,
  context,
  llm,
  template,
}: {
  contentType: AiContentType;
  context: LeagueBlogContext;
  llm: LlmClient;
  template?: PromptTemplate;
}): Promise<BlogDraft> {
  const prompt = buildPromptParts({
    contentType,
    context,
    newsItems: [],
    template,
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

export function fixtureTokens(fixture: EvalLeagueFixture): string[] {
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

export function weeklyRecapFixture(body: string): BlogDraft {
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
