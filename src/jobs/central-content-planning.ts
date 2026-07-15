import {
  type CentralColumn,
  centralColumnScheduleMatchesAt,
} from "@/ai/central-columns";
import { centralGenerationKey } from "@/ai/central-generation-key";
import {
  HeuristicNflCalendar,
  type NflCalendar,
  type NflWeekState,
} from "@/sports/nfl-calendar";
import { type CentralContentGenerateData, JOB_EVENTS } from "./events";

export interface PlannedCentralContentGenerateEvent {
  data: CentralContentGenerateData;
  id: string;
  name: typeof JOB_EVENTS.centralContentGenerate;
}

export interface CentralContentPlanResult {
  columns: Pick<CentralColumn, "id" | "name" | "section">[];
  nflWeekState: NflWeekState;
  planned: PlannedCentralContentGenerateEvent[];
  skippedReason: "nfl_week_unavailable" | "schedule_slot_missed" | null;
}

function nflSeasonFor(date: Date): number {
  // January and February complete the season that began the prior year.
  return date.getUTCMonth() <= 1
    ? date.getUTCFullYear() - 1
    : date.getUTCFullYear();
}

function centralCronTriggerKey({
  column,
  scheduledAt,
  season,
  week,
}: {
  column: CentralColumn;
  scheduledAt: Date;
  season: number;
  week: number;
}): string {
  const slot = scheduledAt.toISOString().slice(0, 16);
  return `central-cron:${season}:week-${week}:${slot}:${column.id}`;
}

function plannedEvent(
  data: CentralContentGenerateData,
): PlannedCentralContentGenerateEvent {
  return {
    data,
    id: `content.central.generate:${data.columnId}:${data.triggerKey}`,
    name: JOB_EVENTS.centralContentGenerate,
  };
}

/**
 * Plans one shared central publication. There is deliberately no league
 * enumeration, entitlement check, per-league cap, or league id in this path.
 */
export async function planCentralScheduledContent({
  nflCalendar,
  nflWeekState,
  now,
}: {
  nflCalendar?: NflCalendar;
  nflWeekState?: NflWeekState;
  now?: () => Date;
} = {}): Promise<CentralContentPlanResult> {
  const resolvedNow = now?.() ?? new Date();
  const resolvedNflWeekState =
    nflWeekState ??
    (await (nflCalendar ?? new HeuristicNflCalendar()).weekState(resolvedNow));
  const scheduleMatches = centralColumnScheduleMatchesAt(resolvedNow);
  const columns = scheduleMatches.map(({ column }) => column);
  const week = resolvedNflWeekState.seasonWeek;

  if (week === null) {
    return {
      columns: columns.map(({ id, name, section }) => ({ id, name, section })),
      nflWeekState: resolvedNflWeekState,
      planned: [],
      skippedReason: "nfl_week_unavailable",
    };
  }

  const season = nflSeasonFor(resolvedNow);
  const plannedData = scheduleMatches.map(({ column, scheduledAt }) => ({
    columnId: column.id,
    season,
    triggerKey: centralCronTriggerKey({
      column,
      scheduledAt,
      season,
      week,
    }),
    week,
  }));
  return {
    columns: columns.map(({ id, name, section }) => ({ id, name, section })),
    nflWeekState: resolvedNflWeekState,
    planned: plannedData.map((data) =>
      plannedEvent({
        ...data,
        queuedGenerationKeys: plannedData
          .filter((sibling) => sibling.columnId !== data.columnId)
          .map(centralGenerationKey),
      }),
    ),
    skippedReason: plannedData.length === 0 ? "schedule_slot_missed" : null,
  };
}
