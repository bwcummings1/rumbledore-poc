import { AppError } from "@/core/result";
import type {
  BettingMarketType,
  BettingSport,
  OddsEvent,
  OddsMarket,
  OddsProvider,
  OddsProviderEventInput,
  OddsProviderListInput,
  OddsQuote,
} from "./interfaces";

type FetchResponse = Pick<Response, "json" | "ok" | "status" | "statusText">;
type Fetcher = (url: string) => Promise<FetchResponse>;

interface TheOddsApiOutcome {
  description?: string;
  name?: string;
  point?: number;
  price?: number;
}

interface TheOddsApiMarket {
  key?: string;
  last_update?: string;
  outcomes?: TheOddsApiOutcome[];
}

interface TheOddsApiBookmaker {
  key?: string;
  last_update?: string;
  markets?: TheOddsApiMarket[];
  title?: string;
}

interface TheOddsApiEvent {
  away_team?: string;
  bookmakers?: TheOddsApiBookmaker[];
  commence_time?: string;
  home_team?: string;
  id?: string;
  sport_key?: string;
}

export interface TheOddsApiProviderOptions {
  apiKey: string;
  baseUrl?: string;
  fetcher?: Fetcher;
}

const SPORT_KEYS: Record<BettingSport, string> = {
  nfl: "americanfootball_nfl",
};

const FEATURED_MARKETS = ["h2h", "spreads", "totals"] as const;

function parseDate(value: string | undefined, fallback: Date): Date {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallback;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function marketTypeFor(key: string | undefined): BettingMarketType | null {
  switch (key) {
    case "h2h":
      return "moneyline";
    case "spreads":
      return "spread";
    case "totals":
      return "total";
    default:
      return null;
  }
}

function providerMarketId({
  bookmakerKey,
  eventId,
  marketKey,
}: {
  bookmakerKey: string;
  eventId: string;
  marketKey: string;
}): string {
  return `${eventId}:${bookmakerKey}:${marketKey}`;
}

function latestUpdate(
  event: TheOddsApiEvent,
  fallback: Date,
  bookmaker?: TheOddsApiBookmaker,
): Date {
  const candidates = [
    ...(event.bookmakers ?? []).map((entry) => entry.last_update),
    bookmaker?.last_update,
  ]
    .filter(Boolean)
    .map((entry) => parseDate(entry, fallback))
    .sort((left, right) => right.getTime() - left.getTime());

  return candidates[0] ?? fallback;
}

function outcomeNamed(
  outcomes: readonly TheOddsApiOutcome[],
  name: string,
): TheOddsApiOutcome | undefined {
  return outcomes.find(
    (outcome) => cleanText(outcome.name).toLowerCase() === name.toLowerCase(),
  );
}

function outcomeTeam(
  outcomes: readonly TheOddsApiOutcome[],
  teamName: string,
): TheOddsApiOutcome | undefined {
  return outcomes.find((outcome) => cleanText(outcome.name) === teamName);
}

function price(value: number | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function assertResponseArray(value: unknown): TheOddsApiEvent[] {
  if (!Array.isArray(value)) {
    throw new AppError({
      code: "ODDS_PROVIDER_INVALID_RESPONSE",
      message: "The Odds API returned an invalid odds response",
      status: 502,
    });
  }

  return value as TheOddsApiEvent[];
}

export class TheOddsApiProvider implements OddsProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;
  private readonly oddsCache = new Map<
    BettingSport,
    Promise<TheOddsApiEvent[]>
  >();

  constructor(options: TheOddsApiProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.the-odds-api.com";
    this.fetcher = options.fetcher ?? fetch;
  }

  async listEvents(input: OddsProviderListInput): Promise<OddsEvent[]> {
    const events = await this.fetchOdds(input.sport);
    return events.flatMap((event) => {
      const id = cleanText(event.id);
      const homeTeam = cleanText(event.home_team);
      const awayTeam = cleanText(event.away_team);
      if (!id || !homeTeam || !awayTeam || !event.commence_time) {
        return [];
      }

      return [
        {
          awayTeam,
          homeTeam,
          lastUpdated: latestUpdate(event, input.now ?? new Date()),
          provider: "the_odds_api",
          providerEventId: id,
          sport: input.sport,
          startTime: parseDate(event.commence_time, input.now ?? new Date()),
          status: "scheduled" as const,
        },
      ];
    });
  }

  async getMarkets(input: OddsProviderEventInput): Promise<OddsMarket[]> {
    const event = await this.findEvent(input);
    if (!event) {
      return [];
    }

    return (event.bookmakers ?? []).flatMap((bookmaker) => {
      const bookmakerKey = cleanText(bookmaker.key);
      if (!bookmakerKey) {
        return [];
      }

      return (bookmaker.markets ?? []).flatMap((market) => {
        const marketKey = cleanText(market.key);
        const type = marketTypeFor(marketKey);
        if (!type) {
          return [];
        }

        return [
          {
            metadata: {
              bookmaker: bookmakerKey,
              marketKey,
              sourceTitle: cleanText(bookmaker.title),
            },
            period: "full_game" as const,
            provider: "the_odds_api",
            providerEventId: input.providerEventId,
            providerMarketId: providerMarketId({
              bookmakerKey,
              eventId: input.providerEventId,
              marketKey,
            }),
            status: "open" as const,
            subject: "game",
            type,
          },
        ];
      });
    });
  }

  async getOdds(input: OddsProviderEventInput): Promise<OddsQuote[]> {
    const event = await this.findEvent(input);
    if (!event) {
      return [];
    }

    const homeTeam = cleanText(event.home_team);
    const awayTeam = cleanText(event.away_team);
    return (event.bookmakers ?? []).flatMap((bookmaker) => {
      const bookmakerKey = cleanText(bookmaker.key);
      if (!bookmakerKey) {
        return [];
      }

      return (bookmaker.markets ?? []).flatMap((market) => {
        const marketKey = cleanText(market.key);
        const type = marketTypeFor(marketKey);
        const outcomes = market.outcomes ?? [];
        if (!type) {
          return [];
        }

        const base = {
          capturedAt: parseDate(market.last_update, input.now ?? new Date()),
          metadata: {
            bookmaker: bookmakerKey,
            marketKey,
            sourceTitle: cleanText(bookmaker.title),
          },
          provider: "the_odds_api" as const,
          providerMarketId: providerMarketId({
            bookmakerKey,
            eventId: input.providerEventId,
            marketKey,
          }),
          sourcePayload: { bookmakerKey, eventId: event.id, market },
        };

        switch (type) {
          case "moneyline": {
            const home = outcomeTeam(outcomes, homeTeam);
            const away = outcomeTeam(outcomes, awayTeam);
            const homePrice = price(home?.price);
            const awayPrice = price(away?.price);
            if (homePrice === null || awayPrice === null) {
              return [];
            }

            const quote: OddsQuote = {
              ...base,
              awayPrice,
              homePrice,
            };
            return [quote];
          }
          case "spread": {
            const home = outcomeTeam(outcomes, homeTeam);
            const away = outcomeTeam(outcomes, awayTeam);
            const homePrice = price(home?.price);
            const awayPrice = price(away?.price);
            if (homePrice === null || awayPrice === null) {
              return [];
            }

            const quote: OddsQuote = {
              ...base,
              awayPrice,
              homePrice,
              line: home?.point ?? null,
            };
            return [quote];
          }
          case "total": {
            const over = outcomeNamed(outcomes, "Over");
            const under = outcomeNamed(outcomes, "Under");
            const overPrice = price(over?.price);
            const underPrice = price(under?.price);
            if (overPrice === null || underPrice === null) {
              return [];
            }

            const quote: OddsQuote = {
              ...base,
              line: over?.point ?? under?.point ?? null,
              overPrice,
              underPrice,
            };
            return [quote];
          }
          case "player_prop":
            return [];
        }

        return [];
      });
    });
  }

  private async findEvent(
    input: OddsProviderEventInput,
  ): Promise<TheOddsApiEvent | undefined> {
    const events = await this.fetchOdds(input.sport);
    return events.find(
      (event) => cleanText(event.id) === input.providerEventId,
    );
  }

  private fetchOdds(sport: BettingSport): Promise<TheOddsApiEvent[]> {
    const cached = this.oddsCache.get(sport);
    if (cached) {
      return cached;
    }

    const url = new URL(`/v4/sports/${SPORT_KEYS[sport]}/odds`, this.baseUrl);
    url.searchParams.set("regions", "us");
    url.searchParams.set("markets", FEATURED_MARKETS.join(","));
    url.searchParams.set("oddsFormat", "american");
    url.searchParams.set("apiKey", this.apiKey);

    const loaded = this.fetcher(url.toString()).then(async (response) => {
      if (!response.ok) {
        throw new AppError({
          code: "ODDS_PROVIDER_HTTP_ERROR",
          message: `The Odds API request failed with HTTP ${response.status}`,
          status: response.status >= 500 ? 502 : 400,
        });
      }

      return assertResponseArray(await response.json());
    });
    this.oddsCache.set(sport, loaded);
    return loaded;
  }
}
