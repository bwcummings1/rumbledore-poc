const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_GAME_WINDOW_MS = 5 * HOUR_MS;
const DEFAULT_POST_GAMES_WINDOW_MS = 36 * HOUR_MS;
const DEFAULT_PRE_KICKOFF_WINDOW_MS = 72 * HOUR_MS;
const DEFAULT_SCHEDULE_LOOKBACK_DAYS = 3;
const DEFAULT_SCHEDULE_LOOKAHEAD_DAYS = 4;
const ESPN_SCOREBOARD_BASE_URL = "https://site.api.espn.com";

export type NflPhase =
  | "offseason"
  | "preseason"
  | "regular"
  | "playoffs"
  | "superbowl_week";

export type NflGamePhase =
  | "pre_kickoff"
  | "games_live"
  | "post_games"
  | "quiet";

export interface NflWeekState {
  gamePhase: NflGamePhase;
  isQuietWeek?: boolean;
  isRivalryWindow?: boolean;
  phase: NflPhase;
  seasonWeek: number | null;
}

export interface NflCalendar {
  weekState(now: Date): NflWeekState | Promise<NflWeekState>;
}

export type NflScheduleGameStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "canceled";

export interface NflScheduleGame {
  id: string;
  phase: NflPhase;
  seasonWeek: number | null;
  startTime: Date;
  status: NflScheduleGameStatus;
}

export interface NflScheduleSnapshot {
  games: NflScheduleGame[];
  phase: NflPhase | null;
  seasonWeek: number | null;
}

export interface NflScheduleWindowInput {
  end: Date;
  now: Date;
  start: Date;
}

export interface NflScheduleSource {
  scheduleForWindow(
    input: NflScheduleWindowInput,
  ): NflScheduleSnapshot | Promise<NflScheduleSnapshot>;
}

type NflScheduleFetchResponse = Pick<
  Response,
  "json" | "ok" | "status" | "statusText"
>;

export type NflScheduleFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<NflScheduleFetchResponse>;

interface MockNflCalendarMapInput {
  defaultState: NflWeekState;
  statesByDate?: Record<string, NflWeekState>;
}

export class MockNflCalendar implements NflCalendar {
  private readonly defaultState: NflWeekState;
  private readonly statesByDate: ReadonlyMap<string, NflWeekState>;

  constructor(input: NflWeekState | MockNflCalendarMapInput) {
    if ("defaultState" in input) {
      this.defaultState = input.defaultState;
      this.statesByDate = new Map(Object.entries(input.statesByDate ?? {}));
      return;
    }

    this.defaultState = input;
    this.statesByDate = new Map();
  }

  weekState(now: Date): NflWeekState {
    return this.statesByDate.get(toIsoDate(now)) ?? this.defaultState;
  }
}

export class HeuristicNflCalendar implements NflCalendar {
  weekState(now: Date): NflWeekState {
    const month = now.getUTCMonth();
    const dayOfMonth = now.getUTCDate();
    const gamePhase = inferGamePhase(now);

    if (month === 0) {
      return {
        gamePhase,
        phase: "playoffs",
        seasonWeek: Math.min(21, 19 + Math.floor((dayOfMonth - 1) / 7)),
      };
    }

    if (month === 1 && dayOfMonth <= 14) {
      return {
        gamePhase,
        phase: "superbowl_week",
        seasonWeek: 22,
      };
    }

    if (month >= 8) {
      return {
        gamePhase,
        phase: "regular",
        seasonWeek: estimateRegularSeasonWeek(now),
      };
    }

    if (month === 7) {
      return {
        gamePhase: "quiet",
        phase: "preseason",
        seasonWeek: null,
      };
    }

    return {
      gamePhase: "quiet",
      phase: "offseason",
      seasonWeek: null,
    };
  }
}

export interface ScheduleBackedNflCalendarOptions {
  fallback?: NflCalendar;
  gameWindowMs?: number;
  lookaheadDays?: number;
  lookbackDays?: number;
  postGamesWindowMs?: number;
  preKickoffWindowMs?: number;
  source: NflScheduleSource;
}

export class ScheduleBackedNflCalendar implements NflCalendar {
  private readonly fallback: NflCalendar;
  private readonly gameWindowMs: number;
  private readonly lookaheadDays: number;
  private readonly lookbackDays: number;
  private readonly postGamesWindowMs: number;
  private readonly preKickoffWindowMs: number;
  private readonly source: NflScheduleSource;

  constructor(options: ScheduleBackedNflCalendarOptions) {
    this.fallback = options.fallback ?? new HeuristicNflCalendar();
    this.gameWindowMs = options.gameWindowMs ?? DEFAULT_GAME_WINDOW_MS;
    this.lookaheadDays =
      options.lookaheadDays ?? DEFAULT_SCHEDULE_LOOKAHEAD_DAYS;
    this.lookbackDays = options.lookbackDays ?? DEFAULT_SCHEDULE_LOOKBACK_DAYS;
    this.postGamesWindowMs =
      options.postGamesWindowMs ?? DEFAULT_POST_GAMES_WINDOW_MS;
    this.preKickoffWindowMs =
      options.preKickoffWindowMs ?? DEFAULT_PRE_KICKOFF_WINDOW_MS;
    this.source = options.source;
  }

  async weekState(now: Date): Promise<NflWeekState> {
    try {
      const snapshot = await this.source.scheduleForWindow({
        end: addUtcDays(now, this.lookaheadDays),
        now,
        start: addUtcDays(now, -this.lookbackDays),
      });
      const state = nflWeekStateFromSchedule(snapshot, now, {
        gameWindowMs: this.gameWindowMs,
        postGamesWindowMs: this.postGamesWindowMs,
        preKickoffWindowMs: this.preKickoffWindowMs,
      });
      if (state) {
        return state;
      }
    } catch {
      return this.fallback.weekState(now);
    }

    return this.fallback.weekState(now);
  }
}

export interface EspnScoreboardNflScheduleSourceOptions {
  baseUrl?: string;
  fetcher?: NflScheduleFetch;
}

export class EspnScoreboardNflScheduleSource implements NflScheduleSource {
  private readonly baseUrl: string;
  private readonly cache = new Map<string, Promise<NflScheduleSnapshot>>();
  private readonly fetcher: NflScheduleFetch;

  constructor(options: EspnScoreboardNflScheduleSourceOptions = {}) {
    this.baseUrl = options.baseUrl ?? ESPN_SCOREBOARD_BASE_URL;
    this.fetcher = options.fetcher ?? fetch;
  }

  scheduleForWindow(
    input: NflScheduleWindowInput,
  ): Promise<NflScheduleSnapshot> {
    const dateRange = `${espnDateKey(input.start)}-${espnDateKey(input.end)}`;
    const cacheKey = `${this.baseUrl}:${dateRange}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = this.fetchScoreboard(dateRange);
    this.cache.set(cacheKey, request);
    return request;
  }

  private async fetchScoreboard(
    dateRange: string,
  ): Promise<NflScheduleSnapshot> {
    const url = new URL(
      "/apis/site/v2/sports/football/nfl/scoreboard",
      this.baseUrl,
    );
    url.searchParams.set("dates", dateRange);
    url.searchParams.set("limit", "1000");

    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(
        `ESPN NFL schedule request failed with HTTP ${response.status}`,
      );
    }

    return nflScheduleSnapshotFromEspnScoreboard(await response.json());
  }
}

export function createDefaultNflCalendar(): NflCalendar {
  return new ScheduleBackedNflCalendar({
    fallback: new HeuristicNflCalendar(),
    source: new EspnScoreboardNflScheduleSource(),
  });
}

export const defaultNflCalendar = createDefaultNflCalendar();

export function nflWeekToken(state: NflWeekState, now: Date): string {
  if (state.seasonWeek !== null) {
    return String(state.seasonWeek);
  }

  return isoWeekToken(now);
}

export function nflScheduleSnapshotFromEspnScoreboard(
  value: unknown,
): NflScheduleSnapshot {
  const body = asRecord(value);
  const scoreboardWeek = numberValue(recordField(body, "week"), "number");
  const leagueSeasonType = firstLeagueSeasonType(body);
  const events = arrayValue(recordField(body, "events")).flatMap((event) => {
    const parsed = espnEventToScheduleGame(
      event,
      scoreboardWeek,
      leagueSeasonType,
    );
    return parsed ? [parsed] : [];
  });
  const snapshotPhase = phaseFromSeasonType(leagueSeasonType, scoreboardWeek);

  return {
    games: events.sort(
      (left, right) => left.startTime.getTime() - right.startTime.getTime(),
    ),
    phase: snapshotPhase?.phase ?? null,
    seasonWeek: snapshotPhase?.seasonWeek ?? null,
  };
}

function nflWeekStateFromSchedule(
  snapshot: NflScheduleSnapshot,
  now: Date,
  windows: {
    gameWindowMs: number;
    postGamesWindowMs: number;
    preKickoffWindowMs: number;
  },
): NflWeekState | null {
  const playableGames = snapshot.games.filter(
    (game) => game.status !== "canceled" && game.status !== "postponed",
  );
  const liveGame = playableGames.find((game) =>
    gameIsLive(game, now, windows.gameWindowMs),
  );
  if (liveGame) {
    return stateForScheduleGame(liveGame, "games_live");
  }

  const previousGame = [...playableGames]
    .filter((game) => game.startTime.getTime() <= now.getTime())
    .sort((left, right) => right.startTime.getTime() - left.startTime.getTime())
    .at(0);
  const nextGame = playableGames.find(
    (game) => game.startTime.getTime() > now.getTime(),
  );
  const recentPreviousGame =
    previousGame &&
    now.getTime() - previousGame.startTime.getTime() <=
      windows.postGamesWindowMs
      ? previousGame
      : null;
  const soonNextGame =
    nextGame &&
    nextGame.startTime.getTime() - now.getTime() <= windows.preKickoffWindowMs
      ? nextGame
      : null;

  if (
    recentPreviousGame &&
    (!soonNextGame || !sameScheduleWeek(recentPreviousGame, soonNextGame))
  ) {
    return stateForScheduleGame(recentPreviousGame, "post_games");
  }

  if (soonNextGame) {
    return stateForScheduleGame(soonNextGame, "pre_kickoff");
  }

  if (recentPreviousGame) {
    return stateForScheduleGame(recentPreviousGame, "post_games");
  }

  const anchor = previousGame ?? nextGame;
  if (anchor) {
    return stateForScheduleGame(anchor, "quiet");
  }

  if (snapshot.phase) {
    return {
      gamePhase: "quiet",
      phase: snapshot.phase,
      seasonWeek: snapshot.seasonWeek,
    };
  }

  return null;
}

function gameIsLive(
  game: NflScheduleGame,
  now: Date,
  gameWindowMs: number,
): boolean {
  if (game.status === "in_progress") {
    return true;
  }

  const start = game.startTime.getTime();
  const observedAt = now.getTime();
  return start <= observedAt && observedAt <= start + gameWindowMs;
}

function stateForScheduleGame(
  game: NflScheduleGame,
  gamePhase: NflGamePhase,
): NflWeekState {
  return {
    gamePhase,
    phase: game.phase,
    seasonWeek: game.seasonWeek,
  };
}

function sameScheduleWeek(
  left: NflScheduleGame,
  right: NflScheduleGame,
): boolean {
  return left.phase === right.phase && left.seasonWeek === right.seasonWeek;
}

function espnEventToScheduleGame(
  value: unknown,
  scoreboardWeek: number | null,
  fallbackSeasonType: number | null,
): NflScheduleGame | null {
  const event = asRecord(value);
  const competition = firstRecord(recordField(event, "competitions"));
  const rawDate =
    stringValue(recordField(competition, "date")) ??
    stringValue(recordField(event, "date"));
  const startTime = rawDate ? new Date(rawDate) : null;
  if (!startTime || Number.isNaN(startTime.getTime())) {
    return null;
  }

  const seasonType =
    numberValue(recordField(event, "season"), "type") ?? fallbackSeasonType;
  const week =
    numberValue(recordField(event, "week"), "number") ?? scoreboardWeek;
  const phase = phaseFromSeasonType(seasonType, week);
  if (!phase) {
    return null;
  }

  return {
    id: String(
      stringValue(recordField(event, "id")) ??
        `${startTime.toISOString()}:${phase.phase}:${phase.seasonWeek ?? "na"}`,
    ),
    phase: phase.phase,
    seasonWeek: phase.seasonWeek,
    startTime,
    status: espnEventStatus(event, competition),
  };
}

function phaseFromSeasonType(
  seasonType: number | null,
  week: number | null,
): { phase: NflPhase; seasonWeek: number | null } | null {
  switch (seasonType) {
    case 1:
      return { phase: "preseason", seasonWeek: null };
    case 2:
      return { phase: "regular", seasonWeek: week };
    case 3:
      if (week !== null && week >= 5) {
        return { phase: "superbowl_week", seasonWeek: 22 };
      }
      return {
        phase: "playoffs",
        seasonWeek: week === null ? null : 18 + week,
      };
    case 4:
      return { phase: "offseason", seasonWeek: null };
    default:
      return null;
  }
}

function estimateRegularSeasonWeek(now: Date): number {
  const seasonStart = Date.UTC(now.getUTCFullYear(), 8, 1);
  const elapsed = now.getTime() - seasonStart;
  return Math.min(18, Math.max(1, Math.floor(elapsed / WEEK_MS) + 1));
}

function inferGamePhase(now: Date): NflGamePhase {
  switch (now.getUTCDay()) {
    case 0:
      return "games_live";
    case 1:
    case 2:
      return "post_games";
    case 4:
    case 5:
    case 6:
      return "pre_kickoff";
    default:
      return "quiet";
  }
}

function isoWeekToken(date: Date): string {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() + 4 - day);
  const weekYear = start.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(
    ((start.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7,
  );
  return `${weekYear}-w${String(week).padStart(2, "0")}`;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function espnEventStatus(
  event: Record<string, unknown>,
  competition: Record<string, unknown>,
): NflScheduleGameStatus {
  const eventStatus = asRecord(
    recordField(asRecord(recordField(event, "status")), "type"),
  );
  const competitionStatus = asRecord(
    recordField(asRecord(recordField(competition, "status")), "type"),
  );
  const status = objectHasEntries(eventStatus)
    ? eventStatus
    : competitionStatus;
  const state = cleanText(stringValue(recordField(status, "state")));
  const description = cleanText(
    [
      stringValue(recordField(status, "name")),
      stringValue(recordField(status, "description")),
      stringValue(recordField(status, "detail")),
      stringValue(recordField(status, "shortDetail")),
    ].join(" "),
  );

  if (description.includes("cancel")) return "canceled";
  if (description.includes("postpon")) return "postponed";
  if (state === "in" || description.includes("progress")) {
    return "in_progress";
  }
  if (recordField(status, "completed") === true || state === "post") {
    return "final";
  }
  return "scheduled";
}

function objectHasEntries(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

function firstLeagueSeasonType(body: Record<string, unknown>): number | null {
  const league = firstRecord(recordField(body, "leagues"));
  const season = asRecord(recordField(league, "season"));
  const type = asRecord(recordField(season, "type"));
  return (
    numberFromUnknown(recordField(type, "type")) ??
    numberFromUnknown(recordField(type, "id"))
  );
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function espnDateKey(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstRecord(value: unknown): Record<string, unknown> {
  const entry = arrayValue(value).find(
    (candidate): candidate is Record<string, unknown> =>
      Boolean(candidate) && typeof candidate === "object",
  );
  return entry ?? {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordField(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(record: unknown, key: string): number | null {
  return numberFromUnknown(recordField(asRecord(record), key));
}

function numberFromUnknown(value: unknown): number | null {
  const candidate =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : null;
}

function cleanText(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
