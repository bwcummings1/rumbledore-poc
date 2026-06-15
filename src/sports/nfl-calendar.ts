const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

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

export const defaultNflCalendar = new HeuristicNflCalendar();

export function nflWeekToken(state: NflWeekState, now: Date): string {
  if (state.seasonWeek !== null) {
    return String(state.seasonWeek);
  }

  return isoWeekToken(now);
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
