import type {
  CentralPublicationBranchId,
  CentralPublicationSectionId,
} from "@/news/sections";
import type { AiPersona } from "./personas";

export const CENTRAL_COLUMN_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type CentralColumnDay = (typeof CENTRAL_COLUMN_DAYS)[number];

export const CENTRAL_COLUMN_DATA_SOURCES = [
  "central-news",
  "general-stats",
  "betting-odds",
] as const;

export type CentralColumnDataSource =
  (typeof CENTRAL_COLUMN_DATA_SOURCES)[number];

export const CENTRAL_COLUMN_CONTENT_TYPES = [
  "central_wire_blurb",
  "central_rundown_report",
  "central_weekend_recap_mnf_projection",
  "central_mnf_recap",
  "central_pre_waiver",
  "central_post_waiver",
  "central_matchups",
  "central_rankings_projections",
  "central_start_sit",
  "central_injuries",
] as const;

export type CentralColumnContentType =
  (typeof CENTRAL_COLUMN_CONTENT_TYPES)[number];

export const CENTRAL_COLUMN_QUEUES = [
  "central-news-events",
  "central-report-requests",
  "central-fantasy-schedule",
  "central-injury-events",
] as const;

export type CentralColumnQueue = (typeof CENTRAL_COLUMN_QUEUES)[number];

export interface CentralJournalistDefinition {
  beat: string;
  id: string;
  name: string;
  persona: AiPersona;
  registerContract: string;
}

/**
 * The central newsroom byline layer. These are deliberately descriptive
 * placeholders until the owner names the cast; changing a name, beat, or base
 * persona here updates every assigned central column.
 */
export const CENTRAL_JOURNALISTS = {
  fantasyAnalyst: {
    beat: "Fantasy projections, rankings, matchup decisions, and waiver value.",
    id: "fantasy-data-analyst",
    name: "Fantasy Data Analyst",
    persona: "analyst",
    registerContract:
      "Lead with auditable NFL data, label computed outputs, hedge recommendations, and keep personality secondary to utility.",
  },
  fantasyReporter: {
    beat: "Fantasy-relevant player movement, waiver outcomes, and injuries.",
    id: "fantasy-news-reporter",
    name: "Fantasy News Reporter",
    persona: "beat_reporter",
    registerContract:
      "File concise, utility-first updates grounded in supplied news and stats without implying private sourcing.",
  },
  fantasyRecapWriter: {
    beat: "NFL game results and their immediate fantasy consequences.",
    id: "fantasy-recap-writer",
    name: "Fantasy Recap Writer",
    persona: "narrator",
    registerContract:
      "Connect game results to fantasy consequences while keeping the account factual, compact, and free of invented narrative.",
  },
  nflAnalyst: {
    beat: "General NFL reports, trends, and data-backed context.",
    id: "nfl-data-analyst",
    name: "NFL Data Analyst",
    persona: "analyst",
    registerContract:
      "Explain the supplied football evidence objectively and distinguish facts, computed outputs, and uncertainty.",
  },
  nflReporter: {
    beat: "General NFL transactions, injuries, signings, and breaking events.",
    id: "nfl-wire-reporter",
    name: "NFL Wire Reporter",
    persona: "beat_reporter",
    registerContract:
      "State what happened and why it matters in a concise, league-agnostic filing grounded only in supplied sources.",
  },
} as const satisfies Record<string, CentralJournalistDefinition>;

export type CentralJournalistKey = keyof typeof CENTRAL_JOURNALISTS;
export type CentralJournalist =
  (typeof CENTRAL_JOURNALISTS)[CentralJournalistKey];
export type CentralJournalistId = CentralJournalist["id"];

export interface CentralColumnDaySlot {
  day: CentralColumnDay;
  dayOfWeek: number;
  utcHour: number;
  utcMinute: number;
}

interface CentralColumnDefinitionBase {
  branch: CentralPublicationBranchId;
  contentType: CentralColumnContentType;
  dataSources: readonly CentralColumnDataSource[];
  formatContract: string;
  id: string;
  journalistId: CentralJournalistId;
  name: string;
  section: CentralPublicationSectionId;
}

export type CentralColumnCadence =
  | {
      cadence: "scheduled";
      daySlots: readonly [CentralColumnDaySlot, ...CentralColumnDaySlot[]];
      queue: "central-fantasy-schedule";
    }
  | {
      cadence: "reactive";
      daySlots: readonly [];
      queue: "central-news-events" | "central-injury-events";
    }
  | {
      cadence: "queued";
      daySlots: readonly [];
      queue: "central-report-requests";
    };

export type CentralColumnDefinition = CentralColumnDefinitionBase &
  CentralColumnCadence;

/**
 * The complete central column identity and scheduling layer. Column names,
 * journalist assignments, cadence, format identity, and substrate references
 * live here so the central generation engine has one owner-configurable source
 * of truth.
 */
export const CENTRAL_COLUMN_LINEUP = {
  theWire: {
    branch: "news",
    cadence: "reactive",
    contentType: "central_wire_blurb",
    dataSources: ["central-news"],
    daySlots: [],
    formatContract:
      "File a concise news-and-so-what blurb for a supplied NFL event; injuries here describe the event, not its fantasy recommendation.",
    id: "the-wire",
    journalistId: "nfl-wire-reporter",
    name: "The Wire",
    queue: "central-news-events",
    section: "wire",
  },
  theRundown: {
    branch: "news",
    cadence: "queued",
    contentType: "central_rundown_report",
    dataSources: ["central-news", "general-stats", "betting-odds"],
    daySlots: [],
    formatContract:
      "Produce the requested configurable NFL report from its report template and supplied fresh evidence; report categories are queue configuration, not hard-coded columns.",
    id: "the-rundown",
    journalistId: "nfl-data-analyst",
    name: "The Rundown",
    queue: "central-report-requests",
    section: "rundown",
  },
  weekendRecapMnfProjection: {
    branch: "fantasy",
    cadence: "scheduled",
    contentType: "central_weekend_recap_mnf_projection",
    dataSources: ["general-stats", "betting-odds"],
    daySlots: [
      {
        day: "monday",
        dayOfWeek: 1,
        utcHour: 14,
        utcMinute: 0,
      },
    ],
    formatContract:
      "Recap completed weekend games through the fantasy lens and separate them from a labeled Monday-night projection using only supplied stats and odds.",
    id: "weekend-recap-mnf-projection",
    journalistId: "fantasy-recap-writer",
    name: "Weekend Recap + MNF Projection",
    queue: "central-fantasy-schedule",
    section: "weekend-recap-mnf-projection",
  },
  mnfRecap: {
    branch: "fantasy",
    cadence: "scheduled",
    contentType: "central_mnf_recap",
    dataSources: ["general-stats"],
    daySlots: [
      {
        day: "tuesday",
        dayOfWeek: 2,
        utcHour: 14,
        utcMinute: 0,
      },
    ],
    formatContract:
      "Recap Monday-night results and the fantasy-relevant player outcomes without carrying forward stale projections as facts.",
    id: "mnf-recap",
    journalistId: "fantasy-recap-writer",
    name: "MNF Recap",
    queue: "central-fantasy-schedule",
    section: "mnf-recap",
  },
  preWaiver: {
    branch: "fantasy",
    cadence: "scheduled",
    contentType: "central_pre_waiver",
    dataSources: ["general-stats"],
    daySlots: [
      {
        day: "tuesday",
        dayOfWeek: 2,
        utcHour: 14,
        utcMinute: 0,
      },
    ],
    formatContract:
      "Give pre-processing waiver recommendations supported by supplied player usage, production, schedule, and availability evidence.",
    id: "pre-waiver",
    journalistId: "fantasy-data-analyst",
    name: "Pre-waiver",
    queue: "central-fantasy-schedule",
    section: "pre-waiver",
  },
  postWaiver: {
    branch: "fantasy",
    cadence: "scheduled",
    contentType: "central_post_waiver",
    dataSources: ["general-stats"],
    daySlots: [
      {
        day: "wednesday",
        dayOfWeek: 3,
        // 11:00 UTC is safely after the typical 2-3 AM US waiver run.
        utcHour: 11,
        utcMinute: 0,
      },
    ],
    formatContract:
      "Publish a post-processing waiver follow-up that distinguishes supplied outcomes from fallback targets and never invents universal roster availability.",
    id: "post-waiver",
    journalistId: "fantasy-news-reporter",
    name: "Post-waiver",
    queue: "central-fantasy-schedule",
    section: "post-waiver",
  },
  matchups: {
    branch: "fantasy",
    cadence: "scheduled",
    contentType: "central_matchups",
    dataSources: ["general-stats", "betting-odds"],
    daySlots: [
      {
        day: "wednesday",
        dayOfWeek: 3,
        utcHour: 14,
        utcMinute: 0,
      },
      {
        day: "thursday",
        dayOfWeek: 4,
        utcHour: 14,
        utcMinute: 0,
      },
    ],
    formatContract:
      "Preview the NFL matchup slate with supplied team and player projections, schedule facts, and odds while labeling uncertainty.",
    id: "matchups",
    journalistId: "fantasy-data-analyst",
    name: "Matchups",
    queue: "central-fantasy-schedule",
    section: "matchups",
  },
  rankingsProjections: {
    branch: "fantasy",
    cadence: "scheduled",
    contentType: "central_rankings_projections",
    dataSources: ["general-stats"],
    daySlots: [
      {
        day: "tuesday",
        dayOfWeek: 2,
        utcHour: 14,
        utcMinute: 0,
      },
      {
        day: "wednesday",
        dayOfWeek: 3,
        utcHour: 14,
        utcMinute: 0,
      },
    ],
    formatContract:
      "Publish player rankings and projections as explicitly labeled computed output with inputs, position, team, and nullable estimates.",
    id: "rankings-projections",
    journalistId: "fantasy-data-analyst",
    name: "Rankings & Projections",
    queue: "central-fantasy-schedule",
    section: "rankings-projections",
  },
  startSit: {
    branch: "fantasy",
    cadence: "scheduled",
    contentType: "central_start_sit",
    dataSources: ["general-stats", "betting-odds"],
    daySlots: [
      {
        day: "thursday",
        dayOfWeek: 4,
        utcHour: 14,
        utcMinute: 0,
      },
      {
        day: "friday",
        dayOfWeek: 5,
        utcHour: 14,
        utcMinute: 0,
      },
      {
        day: "saturday",
        dayOfWeek: 6,
        utcHour: 14,
        utcMinute: 0,
      },
      {
        day: "sunday",
        dayOfWeek: 0,
        utcHour: 14,
        utcMinute: 0,
      },
    ],
    formatContract:
      "Give player-level start, sit, or conditional leans from supplied matchup evidence and projections without claiming certainty.",
    id: "start-sit",
    journalistId: "fantasy-data-analyst",
    name: "Start/Sit",
    queue: "central-fantasy-schedule",
    section: "start-sit",
  },
  injuries: {
    branch: "fantasy",
    cadence: "reactive",
    contentType: "central_injuries",
    dataSources: ["central-news", "general-stats"],
    daySlots: [],
    formatContract:
      "Explain the fantasy implication of a supplied injury event, preserving uncertainty and keeping the underlying event dual-filed to The Wire.",
    id: "injuries",
    journalistId: "fantasy-news-reporter",
    name: "Injuries",
    queue: "central-injury-events",
    section: "injuries",
  },
} as const satisfies Record<string, CentralColumnDefinition>;

export type CentralColumnKey = keyof typeof CENTRAL_COLUMN_LINEUP;
export type CentralColumn = (typeof CENTRAL_COLUMN_LINEUP)[CentralColumnKey];
export type CentralColumnId = CentralColumn["id"];

export const CENTRAL_COLUMN_KEYS = Object.freeze(
  Object.keys(CENTRAL_COLUMN_LINEUP) as CentralColumnKey[],
);

export const CENTRAL_JOURNALIST_KEYS = Object.freeze(
  Object.keys(CENTRAL_JOURNALISTS) as CentralJournalistKey[],
);

function centralColumns(): CentralColumn[] {
  return CENTRAL_COLUMN_KEYS.map((key) => CENTRAL_COLUMN_LINEUP[key]);
}

export function centralColumnForId(id: string): CentralColumn | null {
  return centralColumns().find((column) => column.id === id) ?? null;
}

export function centralJournalistForId(id: string): CentralJournalist | null {
  return (
    CENTRAL_JOURNALIST_KEYS.map((key) => CENTRAL_JOURNALISTS[key]).find(
      (journalist) => journalist.id === id,
    ) ?? null
  );
}

export function centralColumnsForQueue(
  queue: CentralColumnQueue,
): CentralColumn[] {
  return centralColumns().filter((column) => column.queue === queue);
}

/** Returns only the scheduled columns whose configured UTC slot is due now. */
export function centralColumnsScheduledAt(date: Date): CentralColumn[] {
  const dayOfWeek = date.getUTCDay();
  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();

  return centralColumns().filter(
    (column) =>
      column.cadence === "scheduled" &&
      column.daySlots.some(
        (slot) =>
          slot.dayOfWeek === dayOfWeek &&
          slot.utcHour === utcHour &&
          slot.utcMinute === utcMinute,
      ),
  );
}

/**
 * Derives the minimal set of UTC cron triggers needed by the configured
 * scheduled slots. Runtime planning still calls centralColumnsScheduledAt so
 * columns sharing a trigger time remain driven by this lineup.
 */
export function centralColumnCronSchedules(): string[] {
  const daysByTime = new Map<string, Set<number>>();
  for (const column of centralColumns()) {
    if (column.cadence !== "scheduled") {
      continue;
    }
    for (const slot of column.daySlots) {
      const key = `${slot.utcHour}:${slot.utcMinute}`;
      const days = daysByTime.get(key) ?? new Set<number>();
      days.add(slot.dayOfWeek);
      daysByTime.set(key, days);
    }
  }

  return [...daysByTime.entries()]
    .map(([time, days]) => {
      const [hour, minute] = time.split(":").map(Number);
      return {
        hour,
        minute,
        schedule: `${minute} ${hour} * * ${[...days].sort((left, right) => left - right).join(",")}`,
      };
    })
    .sort((left, right) => left.hour - right.hour || left.minute - right.minute)
    .map(({ schedule }) => schedule);
}
