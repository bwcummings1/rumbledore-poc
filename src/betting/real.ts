import { AppError } from "@/core/result";
import type {
  BettingMarketType,
  BettingSport,
  EventResult,
  OddsEvent,
  OddsMarket,
  OddsProvider,
  OddsProviderEventInput,
  OddsProviderListInput,
  OddsQuote,
  ResultsPlayerStat,
  ResultsProvider,
  ResultsProviderInput,
} from "./interfaces";

type FetchResponse = Pick<Response, "json" | "ok" | "status" | "statusText">;
type Fetcher = (url: string, init?: RequestInit) => Promise<FetchResponse>;

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

export interface SportsDataIoResultsProviderOptions {
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

function sportsDataDate(date: Date): string {
  const month = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ][date.getUTCMonth()];
  return `${date.getUTCFullYear()}-${month}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizeTeamName(value: string | undefined): string {
  return cleanText(value).toLowerCase();
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function idOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function statusFromSportsData(
  value: unknown,
  isOver: unknown,
): EventResult["finalStatus"] {
  const status = cleanText(stringOrUndefined(value)).toLowerCase();
  if (status.includes("cancel")) return "canceled";
  if (status.includes("postpon")) return "postponed";
  if (status.includes("final") || isOver === true) return "final";
  if (status.includes("progress") || status.includes("halftime")) {
    return "in_progress";
  }
  return "scheduled";
}

function collectPlayerStats(
  game: Record<string, unknown>,
): ResultsPlayerStat[] {
  const rawPlayers = [
    game.PlayerGames,
    game.PlayerGameStats,
    game.PlayerStats,
  ].find(Array.isArray);
  if (!Array.isArray(rawPlayers)) {
    return [];
  }

  return rawPlayers.flatMap((rawPlayer) => {
    if (!rawPlayer || typeof rawPlayer !== "object") {
      return [];
    }
    const player = rawPlayer as Record<string, unknown>;
    const playerId =
      idOrUndefined(player.PlayerID) ??
      idOrUndefined(player.PlayerId) ??
      idOrUndefined(player.GlobalPlayerID) ??
      idOrUndefined(player.GlobalPlayerId);
    if (!playerId) {
      return [];
    }

    const stats: Record<string, number> = {};
    for (const [key, value] of Object.entries(player)) {
      const normalizedKey = key
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase();
      if (typeof value === "number" && Number.isFinite(value)) {
        stats[normalizedKey] = value;
      }
    }
    return [{ playerId, stats }];
  });
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

export class SportsDataIoResultsProvider implements ResultsProvider {
  readonly id = "sportsdataio";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(options: SportsDataIoResultsProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.sportsdata.io";
    this.fetcher = options.fetcher ?? fetch;
  }

  async getEventResult(input: ResultsProviderInput): Promise<EventResult> {
    if (input.event.sport !== "nfl") {
      throw new AppError({
        code: "RESULTS_PROVIDER_UNSUPPORTED_SPORT",
        message: "SportsDataIO results currently support NFL events only",
        status: 400,
      });
    }

    const dateKey = sportsDataDate(input.event.startTime);
    const url = new URL(
      `/v3/nfl/scores/json/ScoresByDate/${dateKey}`,
      this.baseUrl,
    );
    const response = await this.fetcher(url.toString(), {
      headers: { "Ocp-Apim-Subscription-Key": this.apiKey },
    });
    if (!response.ok) {
      throw new AppError({
        code: "RESULTS_PROVIDER_HTTP_ERROR",
        message: `SportsDataIO request failed with HTTP ${response.status}`,
        status: response.status >= 500 ? 502 : 400,
      });
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new AppError({
        code: "RESULTS_PROVIDER_INVALID_RESPONSE",
        message: "SportsDataIO returned an invalid results response",
        status: 502,
      });
    }

    const game = this.findGame(payload, input);
    if (!game) {
      throw new AppError({
        code: "RESULTS_EVENT_NOT_FOUND",
        message: "SportsDataIO did not return a matching event result",
        status: 404,
      });
    }

    return {
      awayScore: numberOrNull(game.AwayScore),
      finalStatus: statusFromSportsData(game.Status, game.IsOver),
      homeScore: numberOrNull(game.HomeScore),
      playerStats: collectPlayerStats(game),
      provider: this.id,
      sourcePayload: game,
    };
  }

  private findGame(
    payload: unknown[],
    input: ResultsProviderInput,
  ): Record<string, unknown> | null {
    const rows = payload.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object",
    );

    const providerId = input.event.providerEventId;
    const byId = rows.find((row) => {
      const candidates = [
        row.GameKey,
        row.GameID,
        row.GameId,
        row.GlobalGameID,
        row.GlobalGameId,
        row.ScoreID,
      ]
        .filter((value) => value !== undefined && value !== null)
        .map(String);
      return candidates.includes(providerId);
    });
    if (byId) {
      return byId;
    }

    const home = normalizeTeamName(input.event.homeTeam);
    const away = normalizeTeamName(input.event.awayTeam);
    return (
      rows.find((row) => {
        const rowHome = normalizeTeamName(
          stringOrUndefined(row.HomeTeam) ??
            stringOrUndefined(row.HomeTeamName) ??
            stringOrUndefined(row.Home),
        );
        const rowAway = normalizeTeamName(
          stringOrUndefined(row.AwayTeam) ??
            stringOrUndefined(row.AwayTeamName) ??
            stringOrUndefined(row.Away),
        );
        return rowHome === home && rowAway === away;
      }) ?? null
    );
  }
}
