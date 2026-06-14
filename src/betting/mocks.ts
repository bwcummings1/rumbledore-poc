import type {
  EventResult,
  OddsEvent,
  OddsMarket,
  OddsProvider,
  OddsProviderEventInput,
  OddsProviderListInput,
  OddsQuote,
  ResultsProvider,
  ResultsProviderInput,
} from "./interfaces";

const MOCK_PROVIDER = "mock_odds";
const MOCK_RESULTS_PROVIDER = "mock_results";
const MOCK_CAPTURED_AT = new Date("2026-09-10T12:00:00.000Z");

type MockPropType = "passing_yards" | "receptions" | "rushing_yards";

type MockPlayerPropFixture = {
  line: number;
  overPrice: number;
  playerId: string;
  playerName: string;
  propType: MockPropType;
  stat: number;
  underPrice: number;
};

type MockEventFixture = {
  awayScore: number;
  awayTeam: string;
  homeScore: number;
  homeTeam: string;
  lastUpdated: Date;
  moneyline: { awayPrice: number; homePrice: number };
  playerProps: MockPlayerPropFixture[];
  providerEventId: string;
  spread: { awayPrice: number; homePrice: number; line: number };
  startTime: Date;
  total: { line: number; overPrice: number; underPrice: number };
};

const MOCK_EVENT_FIXTURES: MockEventFixture[] = [
  {
    awayScore: 21,
    awayTeam: "Arizona Cardinals",
    homeScore: 24,
    homeTeam: "Seattle Seahawks",
    lastUpdated: MOCK_CAPTURED_AT,
    moneyline: { awayPrice: 120, homePrice: -140 },
    playerProps: [
      {
        line: 242.5,
        overPrice: -115,
        playerId: "mock-sea-qb",
        playerName: "Mock Quarterback",
        propType: "passing_yards",
        stat: 251,
        underPrice: -105,
      },
      {
        line: 4.5,
        overPrice: 105,
        playerId: "mock-ari-wr",
        playerName: "Fixture Wideout",
        propType: "receptions",
        stat: 5,
        underPrice: -125,
      },
    ],
    providerEventId: "mock-nfl-2026-week-01-ari-sea",
    spread: { awayPrice: -110, homePrice: -110, line: -2.5 },
    startTime: new Date("2026-09-10T20:20:00.000Z"),
    total: { line: 47.5, overPrice: -108, underPrice: -112 },
  },
  {
    awayScore: 17,
    awayTeam: "New York Jets",
    homeScore: 28,
    homeTeam: "Buffalo Bills",
    lastUpdated: MOCK_CAPTURED_AT,
    moneyline: { awayPrice: 135, homePrice: -155 },
    playerProps: [
      {
        line: 63.5,
        overPrice: -102,
        playerId: "mock-buf-rb",
        playerName: "Mock Tailback",
        propType: "rushing_yards",
        stat: 71,
        underPrice: -118,
      },
    ],
    providerEventId: "mock-nfl-2026-week-01-nyj-buf",
    spread: { awayPrice: -112, homePrice: -108, line: -3.5 },
    startTime: new Date("2026-09-11T17:00:00.000Z"),
    total: { line: 44.5, overPrice: -110, underPrice: -110 },
  },
];

function fixtureFor(providerEventId: string): MockEventFixture {
  const fixture = MOCK_EVENT_FIXTURES.find(
    (event) => event.providerEventId === providerEventId,
  );
  if (fixture) {
    return fixture;
  }

  return {
    awayScore: 20,
    awayTeam: "Mock Away",
    homeScore: 23,
    homeTeam: "Mock Home",
    lastUpdated: MOCK_CAPTURED_AT,
    moneyline: { awayPrice: 130, homePrice: -150 },
    playerProps: [
      {
        line: 225.5,
        overPrice: -110,
        playerId: `${providerEventId}:qb`,
        playerName: "Fallback Quarterback",
        propType: "passing_yards",
        stat: 231,
        underPrice: -110,
      },
    ],
    providerEventId,
    spread: { awayPrice: -110, homePrice: -110, line: -3 },
    startTime: new Date("2026-09-12T17:00:00.000Z"),
    total: { line: 45.5, overPrice: -110, underPrice: -110 },
  };
}

function propMarketId(eventId: string, prop: MockPlayerPropFixture): string {
  return `${eventId}:player-prop:${prop.playerId}:${prop.propType}`;
}

export class MockOddsProvider implements OddsProvider {
  async listEvents(_input: OddsProviderListInput): Promise<OddsEvent[]> {
    return MOCK_EVENT_FIXTURES.map((fixture) => ({
      awayTeam: fixture.awayTeam,
      homeTeam: fixture.homeTeam,
      lastUpdated: fixture.lastUpdated,
      provider: MOCK_PROVIDER,
      providerEventId: fixture.providerEventId,
      sport: "nfl",
      startTime: fixture.startTime,
      status: "scheduled",
    }));
  }

  async getMarkets(input: OddsProviderEventInput): Promise<OddsMarket[]> {
    const fixture = fixtureFor(input.providerEventId);

    return [
      {
        period: "full_game",
        provider: MOCK_PROVIDER,
        providerEventId: input.providerEventId,
        providerMarketId: `${fixture.providerEventId}:moneyline`,
        status: "open",
        subject: "game",
        type: "moneyline",
      },
      {
        period: "full_game",
        provider: MOCK_PROVIDER,
        providerEventId: input.providerEventId,
        providerMarketId: `${fixture.providerEventId}:spread`,
        status: "open",
        subject: "game",
        type: "spread",
      },
      {
        period: "full_game",
        provider: MOCK_PROVIDER,
        providerEventId: input.providerEventId,
        providerMarketId: `${fixture.providerEventId}:total`,
        status: "open",
        subject: "game",
        type: "total",
      },
      ...fixture.playerProps.map((prop) => ({
        metadata: { playerName: prop.playerName },
        period: "full_game" as const,
        propType: prop.propType,
        provider: MOCK_PROVIDER,
        providerEventId: input.providerEventId,
        providerMarketId: propMarketId(fixture.providerEventId, prop),
        status: "open" as const,
        subject: prop.playerId,
        type: "player_prop" as const,
      })),
    ];
  }

  async getOdds(input: OddsProviderEventInput): Promise<OddsQuote[]> {
    const fixture = fixtureFor(input.providerEventId);

    return [
      {
        awayPrice: fixture.moneyline.awayPrice,
        capturedAt: MOCK_CAPTURED_AT,
        homePrice: fixture.moneyline.homePrice,
        provider: MOCK_PROVIDER,
        providerMarketId: `${fixture.providerEventId}:moneyline`,
      },
      {
        awayPrice: fixture.spread.awayPrice,
        capturedAt: MOCK_CAPTURED_AT,
        homePrice: fixture.spread.homePrice,
        line: fixture.spread.line,
        provider: MOCK_PROVIDER,
        providerMarketId: `${fixture.providerEventId}:spread`,
      },
      {
        capturedAt: MOCK_CAPTURED_AT,
        line: fixture.total.line,
        overPrice: fixture.total.overPrice,
        provider: MOCK_PROVIDER,
        providerMarketId: `${fixture.providerEventId}:total`,
        underPrice: fixture.total.underPrice,
      },
      ...fixture.playerProps.map((prop) => ({
        capturedAt: MOCK_CAPTURED_AT,
        line: prop.line,
        overPrice: prop.overPrice,
        provider: MOCK_PROVIDER,
        providerMarketId: propMarketId(fixture.providerEventId, prop),
        underPrice: prop.underPrice,
      })),
    ];
  }
}

export class MockResultsProvider implements ResultsProvider {
  readonly id = MOCK_RESULTS_PROVIDER;

  constructor(private readonly results = new Map<string, EventResult>()) {}

  async getEventResult(input: ResultsProviderInput): Promise<EventResult> {
    const fixture = fixtureFor(input.event.providerEventId);
    return (
      this.results.get(input.event.providerEventId) ?? {
        awayScore: fixture.awayScore,
        finalStatus: "final",
        homeScore: fixture.homeScore,
        playerStats: fixture.playerProps.map((prop) => ({
          playerId: prop.playerId,
          stats: { [prop.propType]: prop.stat },
        })),
        provider: this.id,
        sourcePayload: {
          providerEventId: input.event.providerEventId,
          scores: {
            away: fixture.awayScore,
            home: fixture.homeScore,
          },
          source: this.id,
        },
      }
    );
  }
}
