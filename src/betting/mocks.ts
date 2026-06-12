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
const MOCK_EVENT_ID = "mock-nfl-2026-week-01-ari-sea";

function eventIdFor(index: number): string {
  return index === 0 ? MOCK_EVENT_ID : `mock-nfl-2026-week-01-nyj-buf-${index}`;
}

export class MockOddsProvider implements OddsProvider {
  async listEvents(_input: OddsProviderListInput): Promise<OddsEvent[]> {
    return [
      {
        awayTeam: "Arizona Cardinals",
        homeTeam: "Seattle Seahawks",
        lastUpdated: new Date("2026-09-10T12:00:00.000Z"),
        provider: MOCK_PROVIDER,
        providerEventId: eventIdFor(0),
        sport: "nfl",
        startTime: new Date("2026-09-10T20:20:00.000Z"),
        status: "scheduled",
      },
      {
        awayTeam: "New York Jets",
        homeTeam: "Buffalo Bills",
        lastUpdated: new Date("2026-09-10T12:00:00.000Z"),
        provider: MOCK_PROVIDER,
        providerEventId: eventIdFor(1),
        sport: "nfl",
        startTime: new Date("2026-09-11T17:00:00.000Z"),
        status: "scheduled",
      },
    ];
  }

  async getMarkets(input: OddsProviderEventInput): Promise<OddsMarket[]> {
    if (input.providerEventId !== MOCK_EVENT_ID) {
      return [
        {
          period: "full_game",
          provider: MOCK_PROVIDER,
          providerEventId: input.providerEventId,
          providerMarketId: `${input.providerEventId}:moneyline`,
          status: "open",
          subject: "game",
          type: "moneyline",
        },
      ];
    }

    return [
      {
        period: "full_game",
        provider: MOCK_PROVIDER,
        providerEventId: input.providerEventId,
        providerMarketId: `${input.providerEventId}:moneyline`,
        status: "open",
        subject: "game",
        type: "moneyline",
      },
      {
        period: "full_game",
        provider: MOCK_PROVIDER,
        providerEventId: input.providerEventId,
        providerMarketId: `${input.providerEventId}:spread`,
        status: "open",
        subject: "game",
        type: "spread",
      },
      {
        period: "full_game",
        provider: MOCK_PROVIDER,
        providerEventId: input.providerEventId,
        providerMarketId: `${input.providerEventId}:total`,
        status: "open",
        subject: "game",
        type: "total",
      },
      {
        metadata: { playerName: "Mock Quarterback" },
        period: "full_game",
        propType: "passing_yards",
        provider: MOCK_PROVIDER,
        providerEventId: input.providerEventId,
        providerMarketId: `${input.providerEventId}:player-prop:mock-qb-passing-yards`,
        status: "open",
        subject: "mock-player-qb",
        type: "player_prop",
      },
    ];
  }

  async getOdds(input: OddsProviderEventInput): Promise<OddsQuote[]> {
    if (input.providerEventId !== MOCK_EVENT_ID) {
      return [
        {
          awayPrice: 135,
          capturedAt: new Date("2026-09-10T12:00:00.000Z"),
          homePrice: -155,
          provider: MOCK_PROVIDER,
          providerMarketId: `${input.providerEventId}:moneyline`,
        },
      ];
    }

    return [
      {
        awayPrice: 120,
        capturedAt: new Date("2026-09-10T12:00:00.000Z"),
        homePrice: -140,
        provider: MOCK_PROVIDER,
        providerMarketId: `${input.providerEventId}:moneyline`,
      },
      {
        awayPrice: -110,
        capturedAt: new Date("2026-09-10T12:00:00.000Z"),
        homePrice: -110,
        line: -2.5,
        provider: MOCK_PROVIDER,
        providerMarketId: `${input.providerEventId}:spread`,
      },
      {
        capturedAt: new Date("2026-09-10T12:00:00.000Z"),
        line: 47.5,
        overPrice: -108,
        provider: MOCK_PROVIDER,
        providerMarketId: `${input.providerEventId}:total`,
        underPrice: -112,
      },
      {
        capturedAt: new Date("2026-09-10T12:00:00.000Z"),
        line: 242.5,
        overPrice: -115,
        provider: MOCK_PROVIDER,
        providerMarketId: `${input.providerEventId}:player-prop:mock-qb-passing-yards`,
        underPrice: -105,
      },
    ];
  }
}

export class MockResultsProvider implements ResultsProvider {
  readonly id = MOCK_RESULTS_PROVIDER;

  constructor(private readonly results = new Map<string, EventResult>()) {}

  async getEventResult(input: ResultsProviderInput): Promise<EventResult> {
    return (
      this.results.get(input.event.providerEventId) ?? {
        awayScore: 21,
        finalStatus: "final",
        homeScore: 24,
        playerStats: [
          {
            playerId: "mock-player-qb",
            stats: { passing_yards: 251 },
          },
        ],
        provider: this.id,
        sourcePayload: {
          providerEventId: input.event.providerEventId,
          source: this.id,
        },
      }
    );
  }
}
