import type { AiContentType } from "./content-types";
import type { AiPersona } from "./personas";

export const LEAGUE_COLUMN_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type LeagueColumnDay = (typeof LEAGUE_COLUMN_DAYS)[number];

export const LEAGUE_COLUMN_PLANNER_CADENCES = [
  "weekly-preview",
  "weekly-wrap",
  "mid-week",
  "post-odds-refresh",
] as const;

export type LeagueColumnPlannerCadence =
  (typeof LEAGUE_COLUMN_PLANNER_CADENCES)[number];

export interface LeagueColumnCandidate {
  contentType: AiContentType;
  persona: AiPersona;
}

export interface LeagueColumnDefinition {
  candidates: readonly LeagueColumnCandidate[];
  day: LeagueColumnDay;
  dayOfWeek: number;
  formatContract: string;
  gamePhases: readonly ("post_games" | "pre_kickoff" | "quiet")[];
  id: string;
  name: string;
  plannerCadence: LeagueColumnPlannerCadence;
  slotUtcHour: number;
  slotUtcMinute: number;
}

/**
 * The league column identity layer. Placeholder names, roster days, and built
 * content-type mappings live here so an owner rename is a one-line label edit.
 */
export const LEAGUE_COLUMN_LINEUP = {
  fantasyFriday: {
    candidates: [
      { contentType: "matchup_preview", persona: "betting_advisor" },
    ],
    day: "friday",
    dayOfWeek: 5,
    formatContract:
      "Summarize Thursday-night football matchups, odds or percentage changes, and one historically interesting league flashback.",
    gamePhases: ["pre_kickoff"],
    id: "fantasy-friday",
    name: "Fantasy Friday",
    plannerCadence: "post-odds-refresh",
    slotUtcHour: 14,
    slotUtcMinute: 0,
  },
  powerRankingsSummary: {
    candidates: [
      { contentType: "power_rankings", persona: "analyst" },
      { contentType: "weekly_recap", persona: "narrator" },
    ],
    day: "tuesday",
    dayOfWeek: 2,
    formatContract:
      "After Sunday and Monday-night games, rank the league's managers and summarize the completed fantasy week.",
    gamePhases: ["post_games"],
    id: "power-rankings-summary",
    name: "Power Rankings + Week (#) Summary",
    plannerCadence: "mid-week",
    slotUtcHour: 14,
    slotUtcMinute: 0,
  },
  predictions: {
    candidates: [{ contentType: "matchup_preview", persona: "analyst" }],
    day: "sunday",
    dayOfWeek: 0,
    formatContract:
      "Write league matchup predictions with end-score and player-performance predictions.",
    gamePhases: ["pre_kickoff"],
    id: "predictions",
    name: "Predictions",
    plannerCadence: "weekly-preview",
    slotUtcHour: 14,
    slotUtcMinute: 0,
  },
  taleOfTheTape: {
    candidates: [{ contentType: "matchup_preview", persona: "analyst" }],
    day: "thursday",
    dayOfWeek: 4,
    formatContract:
      "Preview this week's league matchups with projections, odds or percentages, grudge history, and power-ranking, playoff, historical, and head-to-head implications.",
    gamePhases: ["pre_kickoff"],
    id: "tale-of-the-tape",
    name: "Tale of the Tape",
    plannerCadence: "weekly-preview",
    slotUtcHour: 14,
    slotUtcMinute: 0,
  },
  theWrap: {
    candidates: [{ contentType: "weekly_recap", persona: "narrator" }],
    day: "monday",
    dayOfWeek: 1,
    formatContract:
      "Recap the Sunday games and identify which league matchups do or do not still matter going into Monday Night Football.",
    gamePhases: ["pre_kickoff", "post_games"],
    id: "the-wrap",
    name: "The Wrap",
    plannerCadence: "weekly-wrap",
    slotUtcHour: 14,
    slotUtcMinute: 0,
  },
  waiverSummary: {
    candidates: [
      { contentType: "transaction_reaction", persona: "beat_reporter" },
    ],
    day: "wednesday",
    dayOfWeek: 3,
    formatContract:
      "Summarize leaguemate roster changes and the available FAB spending and remaining-budget facts.",
    gamePhases: ["quiet", "post_games"],
    id: "waiver-summary",
    name: "Waiver Summary",
    plannerCadence: "mid-week",
    slotUtcHour: 14,
    slotUtcMinute: 0,
  },
} as const satisfies Record<string, LeagueColumnDefinition>;

export type LeagueColumnKey = keyof typeof LEAGUE_COLUMN_LINEUP;
export type LeagueColumn = (typeof LEAGUE_COLUMN_LINEUP)[LeagueColumnKey];
export type LeagueColumnId = LeagueColumn["id"];

export const LEAGUE_COLUMN_KEYS = Object.freeze(
  Object.keys(LEAGUE_COLUMN_LINEUP) as LeagueColumnKey[],
);

export function leagueColumnForId(id: string): LeagueColumn | null {
  return (
    LEAGUE_COLUMN_KEYS.map((key) => LEAGUE_COLUMN_LINEUP[key]).find(
      (column) => column.id === id,
    ) ?? null
  );
}

export function leagueColumnForCadenceAndDate(
  cadence: LeagueColumnPlannerCadence,
  date: Date,
): LeagueColumn | null {
  return (
    LEAGUE_COLUMN_KEYS.map((key) => LEAGUE_COLUMN_LINEUP[key]).find(
      (column) =>
        column.plannerCadence === cadence &&
        column.dayOfWeek === date.getUTCDay(),
    ) ?? null
  );
}

export function leagueColumnCronSchedule(
  cadence: LeagueColumnPlannerCadence,
): string {
  const columns = LEAGUE_COLUMN_KEYS.map(
    (key) => LEAGUE_COLUMN_LINEUP[key],
  ).filter((column) => column.plannerCadence === cadence);
  const [first] = columns;
  if (!first) {
    throw new Error(`No league columns configured for ${cadence}`);
  }
  if (
    columns.some(
      (column) =>
        column.slotUtcHour !== first.slotUtcHour ||
        column.slotUtcMinute !== first.slotUtcMinute,
    )
  ) {
    throw new Error(`League columns sharing ${cadence} need one UTC time slot`);
  }

  const days = columns
    .map((column) => column.dayOfWeek)
    .sort((left, right) => left - right)
    .join(",");
  return `${first.slotUtcMinute} ${first.slotUtcHour} * * ${days}`;
}

export function leagueColumnPlannerName(
  cadence: LeagueColumnPlannerCadence,
): string {
  const names = LEAGUE_COLUMN_KEYS.map((key) => LEAGUE_COLUMN_LINEUP[key])
    .filter((column) => column.plannerCadence === cadence)
    .map((column) => column.name);
  return `AI league column planner: ${names.join(" / ")}`;
}
