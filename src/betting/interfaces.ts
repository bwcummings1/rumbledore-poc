export const ODDS_PROVIDER_IDS = ["mock_odds", "the_odds_api"] as const;

export type OddsProviderId = (typeof ODDS_PROVIDER_IDS)[number] | string;

export type BettingSport = "nfl";

export type BettingEventStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "canceled";

export type BettingMarketType =
  | "moneyline"
  | "spread"
  | "total"
  | "player_prop";

export type BettingMarketPeriod = "full_game";

export type BettingMarketStatus = "open" | "suspended" | "settled" | "void";

export interface OddsEvent {
  awayScore?: number | null;
  awayTeam: string;
  homeScore?: number | null;
  homeTeam: string;
  lastUpdated?: Date;
  provider: OddsProviderId;
  providerEventId: string;
  sport: BettingSport;
  startTime: Date;
  status: BettingEventStatus;
}

export interface OddsMarket {
  metadata?: Record<string, unknown>;
  period: BettingMarketPeriod;
  propType?: string | null;
  provider: OddsProviderId;
  providerEventId: string;
  providerMarketId: string;
  status: BettingMarketStatus;
  subject: string;
  type: BettingMarketType;
}

export interface OddsQuote {
  awayPrice?: number | null;
  capturedAt?: Date;
  homePrice?: number | null;
  line?: number | null;
  metadata?: Record<string, unknown>;
  outcomePrice?: number | null;
  overPrice?: number | null;
  provider: OddsProviderId;
  providerMarketId: string;
  sourcePayload?: unknown;
  underPrice?: number | null;
}

export interface OddsProviderListInput {
  now?: Date;
  sport: BettingSport;
}

export interface OddsProviderEventInput {
  now?: Date;
  providerEventId: string;
  sport: BettingSport;
}

export interface OddsProvider {
  getMarkets(input: OddsProviderEventInput): Promise<OddsMarket[]>;
  getOdds(input: OddsProviderEventInput): Promise<OddsQuote[]>;
  listEvents(input: OddsProviderListInput): Promise<OddsEvent[]>;
}
