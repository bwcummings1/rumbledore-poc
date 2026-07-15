import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { AiContentType, AiPersona } from "@/ai";
import {
  type LeagueColumn,
  leagueColumnForCadenceAndDate,
} from "@/ai/league-columns";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiGenerationRuns,
  fantasyMatchups,
  fantasyTeams,
  headToHeadRecords,
  leagues,
} from "@/db/schema";
import {
  type EntitlementReason,
  type EntitlementRequiredTier,
  type EntitlementResolverEnv,
  type EntitlementTier,
  resolveEntitlement,
} from "@/entitlements";
import { LEAGUE_EDITORIAL_IMPORTANCE_LEAD } from "@/news/front";
import {
  defaultNflCalendar,
  type NflCalendar,
  type NflWeekState,
  nflWeekToken,
} from "@/sports/nfl-calendar";
import {
  type ArenaStandingsSwingData,
  type BetSettledData,
  type ContentGenerateData,
  type GameFinalData,
  JOB_EVENTS,
  type LeagueConnectedData,
  type LoreCanonizedData,
  type PollClosedData,
  type RecordBrokenData,
  type TransactionData,
  type WaiverData,
} from "./events";

export const CONTENT_PLAN_CRON_CADENCES = [
  "weekly-preview",
  "weekly-wrap",
  "mid-week",
  "post-odds-refresh",
  "offseason-beat",
] as const;

export type ContentPlanCronCadence =
  (typeof CONTENT_PLAN_CRON_CADENCES)[number];

export const CONTENT_PLAN_TRIGGER_EVENTS = [
  JOB_EVENTS.transaction,
  JOB_EVENTS.waiver,
  JOB_EVENTS.recordBroken,
  JOB_EVENTS.loreCanonized,
  JOB_EVENTS.pollClosed,
  JOB_EVENTS.betSettled,
  JOB_EVENTS.arenaStandingsSwing,
] as const;

export type ContentPlanTriggerEventName =
  (typeof CONTENT_PLAN_TRIGGER_EVENTS)[number];

export interface PlannedContentGenerateEvent {
  id: string;
  name: typeof JOB_EVENTS.contentGenerate;
  data: ContentGenerateData;
}

export interface SkippedContentGenerationLeague {
  capability: "ai.cadence.schedule";
  leagueId: string;
  reason: EntitlementReason;
  requiredTier: EntitlementRequiredTier;
  tier: EntitlementTier;
}

export interface ContentPlanCronResult {
  cadence: ContentPlanCronCadence;
  column: Pick<LeagueColumn, "day" | "id" | "name"> | null;
  nflWeekState: NflWeekState;
  planned: PlannedContentGenerateEvent[];
  skipped: SkippedContentGenerationLeague[];
}

export interface ContentPlanGameFinalResult {
  game: {
    gameId: string;
    leagueId: string;
    season: number;
    scoringPeriod: number;
    triggerReasons: string[];
  } | null;
  nflWeekState: NflWeekState;
  planned: PlannedContentGenerateEvent[];
  skippedEntitlement: SkippedContentGenerationLeague | null;
  skippedReason: string | null;
}

export interface ContentPlanTriggerResult {
  eventName: ContentPlanTriggerEventName;
  nflWeekState: NflWeekState;
  planned: PlannedContentGenerateEvent[];
  skippedEntitlement: SkippedContentGenerationLeague | null;
  skippedReason: string | null;
}

export interface ContentPlanLaunchEditionResult {
  eventName: typeof JOB_EVENTS.leagueConnected;
  league: {
    id: string;
    status: string;
  } | null;
  planned: PlannedContentGenerateEvent[];
  skippedEntitlement: SkippedContentGenerationLeague | null;
  skippedReason: string | null;
}

const ACTIVE_LEAGUE_STATUSES = ["preseason", "in_season"] as const;
const CAP_COUNTED_GENERATION_STATUSES = ["running", "published"] as const;
const BLOWOUT_MARGIN = 25;
const RIVALRY_MEETINGS_THRESHOLD = 5;
interface ContentCandidate {
  persona: AiPersona;
  contentType: AiContentType;
}

const OFFSEASON_BEAT_CANDIDATES = [
  { contentType: "season_arc", persona: "narrator" },
] as const satisfies readonly ContentCandidate[];

const PRESEASON_COUNTDOWN_CANDIDATES = [
  { contentType: "season_arc", persona: "commissioner" },
  { contentType: "power_rankings", persona: "analyst" },
] as const satisfies readonly ContentCandidate[];

const LAUNCH_EDITION_TRIGGER_KEY = "launch-edition:v1";
const LAUNCH_EDITION_CANDIDATES = [
  { contentType: "season_arc", persona: "narrator" },
  { contentType: "rivalry_piece", persona: "trash_talker" },
  { contentType: "milestone_record", persona: "analyst" },
] as const satisfies readonly ContentCandidate[];

const TRIGGER_CANDIDATES: Record<
  ContentPlanTriggerEventName,
  readonly ContentCandidate[]
> = {
  [JOB_EVENTS.betSettled]: [
    { contentType: "awards_superlatives", persona: "trash_talker" },
    { contentType: "matchup_preview", persona: "betting_advisor" },
  ],
  [JOB_EVENTS.arenaStandingsSwing]: [
    { contentType: "arena_recap", persona: "narrator" },
  ],
  [JOB_EVENTS.loreCanonized]: [
    { contentType: "verdict_column", persona: "commissioner" },
    { contentType: "milestone_record", persona: "narrator" },
  ],
  [JOB_EVENTS.pollClosed]: [
    { contentType: "verdict_column", persona: "commissioner" },
  ],
  [JOB_EVENTS.recordBroken]: [
    { contentType: "milestone_record", persona: "analyst" },
    { contentType: "milestone_record", persona: "narrator" },
  ],
  [JOB_EVENTS.transaction]: [
    { contentType: "transaction_reaction", persona: "beat_reporter" },
  ],
  [JOB_EVENTS.waiver]: [
    { contentType: "transaction_reaction", persona: "beat_reporter" },
  ],
};

interface GameFinalMatchup {
  awayScore: number;
  awayTeamProviderId: string;
  gameId: string;
  homeScore: number;
  homeTeamProviderId: string;
  leagueId: string;
  scoringPeriod: number;
  season: number;
  status: string;
  winner: "home" | "away" | "tie" | "unknown";
}

interface GameFinalTeam {
  pointsFor: number;
  providerTeamId: string;
  wins: number;
}

function startOfUtcWeek(date: Date): Date {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

function endOfUtcWeek(date: Date): Date {
  const end = new Date(startOfUtcWeek(date));
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

async function countThisWeekAiGenerationRuns({
  db,
  leagueId,
  now,
}: {
  db: Db;
  leagueId: string;
  now: Date;
}): Promise<number> {
  const weekStart = startOfUtcWeek(now);
  const weekEnd = endOfUtcWeek(now);

  return withLeagueContext(db, leagueId, async (tx) => {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(aiGenerationRuns)
      .where(
        and(
          eq(aiGenerationRuns.leagueId, leagueId),
          inArray(aiGenerationRuns.status, CAP_COUNTED_GENERATION_STATUSES),
          gte(aiGenerationRuns.createdAt, weekStart),
          lt(aiGenerationRuns.createdAt, weekEnd),
        ),
      );

    return row?.count ?? 0;
  });
}

async function resolveCadenceEntitlement({
  db,
  env,
  leagueId,
  now,
}: {
  db: Db;
  env: EntitlementResolverEnv;
  leagueId: string;
  now?: () => Date;
}): Promise<SkippedContentGenerationLeague | null> {
  const budget = await resolveContentPlanningBudget({
    db,
    env,
    leagueId,
    now,
  });
  return budget.skippedEntitlement;
}

async function resolveContentPlanningBudget({
  db,
  env,
  leagueId,
  now,
}: {
  db: Db;
  env: EntitlementResolverEnv;
  leagueId: string;
  now?: () => Date;
}): Promise<{
  remainingSlots: number;
  skippedEntitlement: SkippedContentGenerationLeague | null;
}> {
  const resolvedAt = now?.() ?? new Date();
  const resolution = await resolveEntitlement({
    capability: "ai.cadence.schedule",
    db,
    env,
    leagueId,
    now: () => resolvedAt,
  });

  if (resolution.allowed) {
    if (resolution.reason === "DEV_OVERRIDE") {
      return {
        remainingSlots: Number.POSITIVE_INFINITY,
        skippedEntitlement: null,
      };
    }

    const generatedThisWeek = await countThisWeekAiGenerationRuns({
      db,
      leagueId,
      now: resolvedAt,
    });
    if (generatedThisWeek >= resolution.caps.aiPostsPerWeek) {
      return {
        remainingSlots: 0,
        skippedEntitlement: {
          capability: "ai.cadence.schedule",
          leagueId,
          reason: "CAP_EXCEEDED",
          requiredTier: resolution.requiredTier,
          tier: resolution.tier,
        },
      };
    }

    return {
      remainingSlots: resolution.caps.aiPostsPerWeek - generatedThisWeek,
      skippedEntitlement: null,
    };
  }

  return {
    remainingSlots: 0,
    skippedEntitlement: {
      capability: "ai.cadence.schedule",
      leagueId,
      reason: resolution.reason,
      requiredTier: resolution.requiredTier,
      tier: resolution.tier,
    },
  };
}

function entitlementSkippedReason(
  skipped: SkippedContentGenerationLeague,
): string {
  return `entitlement:${skipped.reason}:requires_${skipped.requiredTier}`;
}

function contentGenerateEventId(data: ContentGenerateData): string {
  return `content.generate:${data.leagueId}:${data.persona}:${data.contentType}:${data.triggerKey}`;
}

function toPlannedEvent(
  data: ContentGenerateData,
): PlannedContentGenerateEvent {
  return {
    data,
    id: contentGenerateEventId(data),
    name: JOB_EVENTS.contentGenerate,
  };
}

function leadStoryCandidate(
  data: ContentGenerateData,
): PlannedContentGenerateEvent {
  return toPlannedEvent({
    ...data,
    editorialImportance: LEAGUE_EDITORIAL_IMPORTANCE_LEAD,
  });
}

function cronTriggerKey(
  cadence: ContentPlanCronCadence,
  now: Date,
  weekState: NflWeekState,
  column?: LeagueColumn | null,
): string {
  const base = `cron:${cadence}:${weekState.phase}:${nflWeekToken(weekState, now)}`;
  return column ? `${base}:${column.id}` : base;
}

function gameFinalTriggerKey({
  matchup,
  now,
  weekState,
}: {
  matchup: GameFinalMatchup;
  now: Date;
  weekState: NflWeekState;
}): string {
  if (hasScheduledGamesPhase(weekState.phase)) {
    return cronTriggerKey("weekly-wrap", now, weekState);
  }

  return `game-final:${weekState.phase}:${nflWeekToken(weekState, now)}:${matchup.season}:${matchup.scoringPeriod}:${matchup.gameId}`;
}

function recordBrokenTriggerKey(recordKey: string): string {
  return `record-broken:${recordKey}`;
}

function framedReactiveTriggerKey({
  prefix,
  sourceKey,
  now,
  weekState,
}: {
  prefix: string;
  sourceKey: string;
  now: Date;
  weekState: NflWeekState;
}): string {
  return `${prefix}:${weekState.phase}:${nflWeekToken(weekState, now)}:${sourceKey}`;
}

function contentTriggerKey(
  eventName: ContentPlanTriggerEventName,
  data:
    | BetSettledData
    | ArenaStandingsSwingData
    | LoreCanonizedData
    | PollClosedData
    | RecordBrokenData
    | TransactionData
    | WaiverData,
  now: Date,
  weekState: NflWeekState,
): string {
  switch (eventName) {
    case JOB_EVENTS.transaction:
      return `transaction:${(data as TransactionData).transactionId}`;
    case JOB_EVENTS.waiver:
      return `waiver:${(data as WaiverData).waiverId}`;
    case JOB_EVENTS.recordBroken:
      return recordBrokenTriggerKey((data as RecordBrokenData).recordKey);
    case JOB_EVENTS.loreCanonized: {
      const loreData = data as LoreCanonizedData;
      return loreData.sourcePollId
        ? framedReactiveTriggerKey({
            now,
            prefix: "poll-closed",
            sourceKey: loreData.sourcePollId,
            weekState,
          })
        : framedReactiveTriggerKey({
            now,
            prefix: "lore-canonized",
            sourceKey: loreData.claimId,
            weekState,
          });
    }
    case JOB_EVENTS.pollClosed:
      return framedReactiveTriggerKey({
        now,
        prefix: "poll-closed",
        sourceKey: (data as PollClosedData).pollId,
        weekState,
      });
    case JOB_EVENTS.betSettled: {
      const betData = data as BetSettledData;
      return framedReactiveTriggerKey({
        now,
        prefix: "bet-settled",
        sourceKey: betData.settlementId,
        weekState,
      });
    }
    case JOB_EVENTS.arenaStandingsSwing: {
      const swingData = data as ArenaStandingsSwingData;
      return framedReactiveTriggerKey({
        now,
        prefix: "arena-swing",
        sourceKey: `${swingData.seasonId}:${swingData.swingKey}`,
        weekState,
      });
    }
  }
}

function scheduledCandidatesFor({
  cadence,
  column,
  hasRivalryWeek,
  weekState,
}: {
  cadence: ContentPlanCronCadence;
  column: LeagueColumn | null;
  hasRivalryWeek: boolean;
  weekState: NflWeekState;
}): ContentCandidate[] {
  if (!cadenceMatchesWeekState({ cadence, column, weekState })) {
    return [];
  }

  const candidates: ContentCandidate[] =
    cadence === "offseason-beat" && weekState.phase === "preseason"
      ? [...PRESEASON_COUNTDOWN_CANDIDATES]
      : cadence === "offseason-beat"
        ? [...OFFSEASON_BEAT_CANDIDATES]
        : [...(column?.candidates ?? [])];
  if (
    column?.id === "tale-of-the-tape" &&
    (hasRivalryWeek || weekState.isRivalryWindow)
  ) {
    candidates.push({
      contentType: "rivalry_piece",
      persona: "trash_talker",
    });
  }
  return candidates;
}

function cadenceMatchesWeekState({
  cadence,
  column,
  weekState,
}: {
  cadence: ContentPlanCronCadence;
  column: LeagueColumn | null;
  weekState: NflWeekState;
}): boolean {
  if (cadence === "offseason-beat") {
    return isOffseasonBeatPhase(weekState);
  }

  if (!hasScheduledGamesPhase(weekState.phase)) {
    return false;
  }

  return Boolean(
    column?.gamePhases.some((gamePhase) => gamePhase === weekState.gamePhase),
  );
}

function isOffseasonBeatPhase(weekState: NflWeekState): boolean {
  return (
    weekState.gamePhase === "quiet" &&
    (weekState.phase === "offseason" ||
      weekState.phase === "preseason" ||
      weekState.isQuietWeek === true)
  );
}

function includesCompleteLeaguesForQuietCadence(
  weekState: NflWeekState,
): boolean {
  return (
    weekState.gamePhase === "quiet" &&
    (weekState.phase === "offseason" || weekState.phase === "preseason")
  );
}

function leagueStatusesForCadence({
  cadence,
  weekState,
}: {
  cadence: ContentPlanCronCadence;
  weekState: NflWeekState;
}): ("preseason" | "in_season" | "complete")[] {
  if (
    cadence === "offseason-beat" &&
    includesCompleteLeaguesForQuietCadence(weekState)
  ) {
    return [...ACTIVE_LEAGUE_STATUSES, "complete"];
  }

  return [...ACTIVE_LEAGUE_STATUSES];
}

function hasScheduledGamesPhase(phase: NflWeekState["phase"]): boolean {
  return (
    phase === "regular" || phase === "playoffs" || phase === "superbowl_week"
  );
}

async function hasRivalrySignal({
  db,
  leagueId,
}: {
  db: Db;
  leagueId: string;
}): Promise<boolean> {
  return withLeagueContext(db, leagueId, async (tx) => {
    const [row] = await tx
      .select({ id: headToHeadRecords.id })
      .from(headToHeadRecords)
      .where(
        and(
          eq(headToHeadRecords.leagueId, leagueId),
          sql`${headToHeadRecords.meetings} >= ${RIVALRY_MEETINGS_THRESHOLD}`,
        ),
      )
      .limit(1);

    return Boolean(row);
  });
}

export async function planCronContent({
  cadence,
  db,
  env,
  nflCalendar,
  nflWeekState,
  now,
}: {
  cadence: ContentPlanCronCadence;
  db: Db;
  env: EntitlementResolverEnv;
  nflCalendar?: NflCalendar;
  nflWeekState?: NflWeekState;
  now?: () => Date;
}): Promise<ContentPlanCronResult> {
  const resolvedNow = now?.() ?? new Date();
  const resolvedNflWeekState =
    nflWeekState ??
    (await (nflCalendar ?? defaultNflCalendar).weekState(resolvedNow));
  const column =
    cadence === "offseason-beat"
      ? null
      : leagueColumnForCadenceAndDate(cadence, resolvedNow);
  if (cadence !== "offseason-beat" && !column) {
    return {
      cadence,
      column: null,
      nflWeekState: resolvedNflWeekState,
      planned: [],
      skipped: [],
    };
  }
  const activeLeagues = await db
    .select({
      id: leagues.id,
    })
    .from(leagues)
    .where(
      inArray(
        leagues.status,
        leagueStatusesForCadence({
          cadence,
          weekState: resolvedNflWeekState,
        }),
      ),
    )
    .orderBy(asc(leagues.id));

  const planned: PlannedContentGenerateEvent[] = [];
  const skipped: SkippedContentGenerationLeague[] = [];
  for (const league of activeLeagues) {
    const skippedEntitlement = await resolveCadenceEntitlement({
      db,
      env,
      leagueId: league.id,
      now: () => resolvedNow,
    });
    if (skippedEntitlement) {
      skipped.push(skippedEntitlement);
      continue;
    }

    const hasRivalryWeek =
      column?.id === "tale-of-the-tape" &&
      cadenceMatchesWeekState({
        cadence,
        column,
        weekState: resolvedNflWeekState,
      })
        ? await hasRivalrySignal({ db, leagueId: league.id })
        : false;
    const triggerKey = cronTriggerKey(
      cadence,
      resolvedNow,
      resolvedNflWeekState,
      column,
    );
    for (const candidate of scheduledCandidatesFor({
      cadence,
      column,
      hasRivalryWeek,
      weekState: resolvedNflWeekState,
    })) {
      const data = {
        contentType: candidate.contentType,
        leagueId: league.id,
        persona: candidate.persona,
        triggerKey,
      };
      planned.push(
        candidate.contentType === "rivalry_piece"
          ? leadStoryCandidate(data)
          : toPlannedEvent(data),
      );
    }
  }

  return {
    cadence,
    column: column
      ? { day: column.day, id: column.id, name: column.name }
      : null,
    nflWeekState: resolvedNflWeekState,
    planned,
    skipped,
  };
}

function gameFinalTriggerReasons({
  matchup,
  milestoneKeys,
  teams,
  weekState,
}: {
  matchup: GameFinalMatchup;
  milestoneKeys: readonly string[];
  teams: ReadonlyMap<string, GameFinalTeam>;
  weekState: NflWeekState;
}): string[] {
  const reasons: string[] = [];
  const margin = Math.abs(matchup.homeScore - matchup.awayScore);
  if (margin >= BLOWOUT_MARGIN) {
    reasons.push("blowout");
  }

  const winnerTeamId =
    matchup.winner === "home"
      ? matchup.homeTeamProviderId
      : matchup.winner === "away"
        ? matchup.awayTeamProviderId
        : null;
  const loserTeamId =
    matchup.winner === "home"
      ? matchup.awayTeamProviderId
      : matchup.winner === "away"
        ? matchup.homeTeamProviderId
        : null;
  const winner = winnerTeamId ? teams.get(winnerTeamId) : null;
  const loser = loserTeamId ? teams.get(loserTeamId) : null;
  if (
    winner &&
    loser &&
    (winner.wins < loser.wins ||
      (winner.wins === loser.wins && winner.pointsFor < loser.pointsFor))
  ) {
    reasons.push("upset");
  }

  for (const milestoneKey of milestoneKeys) {
    reasons.push(`milestone:${milestoneKey}`);
  }

  for (const reason of weekStateTriggerReasons(weekState)) {
    reasons.push(reason);
  }

  return reasons;
}

function weekStateTriggerReasons(weekState: NflWeekState): string[] {
  if (weekState.phase === "playoffs") {
    return ["stakes:playoffs"];
  }

  if (weekState.phase === "superbowl_week") {
    return ["stakes:championship"];
  }

  if (weekState.phase === "preseason") {
    return ["stakes:preseason_countdown"];
  }

  if (weekState.phase === "offseason") {
    return ["stakes:offseason"];
  }

  return weekState.isQuietWeek ? ["stakes:quiet_week"] : [];
}

function gameFinalCandidates(
  triggerReasons: readonly string[],
): ContentCandidate[] {
  return triggerReasons.length > 0
    ? [
        { contentType: "weekly_recap", persona: "narrator" },
        { contentType: "power_rankings", persona: "analyst" },
        { contentType: "awards_superlatives", persona: "trash_talker" },
      ]
    : [
        { contentType: "weekly_recap", persona: "narrator" },
        { contentType: "power_rankings", persona: "analyst" },
      ];
}

function milestoneContentEvents({
  leagueId,
  milestoneKeys,
}: {
  leagueId: string;
  milestoneKeys: readonly string[];
}): PlannedContentGenerateEvent[] {
  return milestoneKeys.flatMap((recordKey) =>
    TRIGGER_CANDIDATES[JOB_EVENTS.recordBroken].map((candidate) =>
      leadStoryCandidate({
        contentType: candidate.contentType,
        leagueId,
        persona: candidate.persona,
        triggerKey: recordBrokenTriggerKey(recordKey),
      }),
    ),
  );
}

export async function planGameFinalContent({
  data,
  db,
  env,
  nflCalendar,
  nflWeekState,
  now,
}: {
  data: GameFinalData;
  db: Db;
  env: EntitlementResolverEnv;
  nflCalendar?: NflCalendar;
  nflWeekState?: NflWeekState;
  now?: () => Date;
}): Promise<ContentPlanGameFinalResult> {
  const resolvedNow = now?.() ?? new Date();
  const resolvedNflWeekState =
    nflWeekState ??
    (await (nflCalendar ?? defaultNflCalendar).weekState(resolvedNow));
  const skippedEntitlement = await resolveCadenceEntitlement({
    db,
    env,
    leagueId: data.leagueId,
    now: () => resolvedNow,
  });
  if (skippedEntitlement) {
    return {
      game: null,
      nflWeekState: resolvedNflWeekState,
      planned: [],
      skippedEntitlement,
      skippedReason: entitlementSkippedReason(skippedEntitlement),
    };
  }

  return withLeagueContext(db, data.leagueId, async (tx) => {
    const [matchup] = await tx
      .select({
        awayScore: fantasyMatchups.awayScore,
        awayTeamProviderId: fantasyMatchups.awayTeamProviderId,
        gameId: fantasyMatchups.id,
        homeScore: fantasyMatchups.homeScore,
        homeTeamProviderId: fantasyMatchups.homeTeamProviderId,
        leagueId: fantasyMatchups.leagueId,
        scoringPeriod: fantasyMatchups.scoringPeriod,
        season: fantasyMatchups.season,
        status: fantasyMatchups.status,
        winner: fantasyMatchups.winner,
      })
      .from(fantasyMatchups)
      .where(
        and(
          eq(fantasyMatchups.id, data.gameId),
          eq(fantasyMatchups.leagueId, data.leagueId),
        ),
      )
      .limit(1);

    if (!matchup) {
      return {
        game: null,
        nflWeekState: resolvedNflWeekState,
        planned: [],
        skippedEntitlement: null,
        skippedReason: "game_not_found",
      };
    }

    if (matchup.status !== "final") {
      return {
        game: {
          gameId: matchup.gameId,
          leagueId: matchup.leagueId,
          scoringPeriod: matchup.scoringPeriod,
          season: matchup.season,
          triggerReasons: [],
        },
        nflWeekState: resolvedNflWeekState,
        planned: [],
        skippedEntitlement: null,
        skippedReason: "game_not_final",
      };
    }

    const awayTeamProviderId = matchup.awayTeamProviderId;
    if (!awayTeamProviderId) {
      return {
        game: {
          gameId: matchup.gameId,
          leagueId: matchup.leagueId,
          scoringPeriod: matchup.scoringPeriod,
          season: matchup.season,
          triggerReasons: [],
        },
        nflWeekState: resolvedNflWeekState,
        planned: [],
        skippedEntitlement: null,
        skippedReason: "game_has_bye",
      };
    }

    const teamProviderIds = [
      ...new Set([matchup.homeTeamProviderId, awayTeamProviderId]),
    ];
    const twoSidedMatchup: GameFinalMatchup = {
      ...matchup,
      awayTeamProviderId,
    };
    const teamRows =
      teamProviderIds.length > 0
        ? await tx
            .select({
              pointsFor: fantasyTeams.pointsFor,
              providerTeamId: fantasyTeams.providerTeamId,
              wins: fantasyTeams.wins,
            })
            .from(fantasyTeams)
            .where(
              and(
                eq(fantasyTeams.leagueId, data.leagueId),
                eq(fantasyTeams.season, matchup.season),
                inArray(fantasyTeams.providerTeamId, teamProviderIds),
              ),
            )
        : [];
    const teams = new Map(teamRows.map((team) => [team.providerTeamId, team]));
    const triggerReasons = gameFinalTriggerReasons({
      matchup: twoSidedMatchup,
      milestoneKeys: data.milestoneKeys ?? [],
      teams,
      weekState: resolvedNflWeekState,
    });
    const triggerKey = gameFinalTriggerKey({
      matchup: twoSidedMatchup,
      now: resolvedNow,
      weekState: resolvedNflWeekState,
    });
    const planned = [
      ...gameFinalCandidates(triggerReasons).map((candidate) => {
        const eventData = {
          contentType: candidate.contentType,
          leagueId: data.leagueId,
          persona: candidate.persona,
          triggerKey,
        };
        const isLeadRecap =
          candidate.contentType === "weekly_recap" &&
          triggerReasons.some(
            (reason) => reason === "blowout" || reason === "upset",
          );
        return isLeadRecap
          ? leadStoryCandidate(eventData)
          : toPlannedEvent(eventData);
      }),
      ...milestoneContentEvents({
        leagueId: data.leagueId,
        milestoneKeys: data.milestoneKeys ?? [],
      }),
    ];

    return {
      game: {
        gameId: matchup.gameId,
        leagueId: matchup.leagueId,
        scoringPeriod: matchup.scoringPeriod,
        season: matchup.season,
        triggerReasons,
      },
      nflWeekState: resolvedNflWeekState,
      planned,
      skippedEntitlement: null,
      skippedReason: null,
    };
  });
}

function planTriggeredContentEvents({
  data,
  eventName,
  now,
  weekState,
}: {
  data:
    | BetSettledData
    | ArenaStandingsSwingData
    | LoreCanonizedData
    | PollClosedData
    | RecordBrokenData
    | TransactionData
    | WaiverData;
  eventName: ContentPlanTriggerEventName;
  now: Date;
  weekState: NflWeekState;
}): PlannedContentGenerateEvent[] {
  const triggerKey = contentTriggerKey(eventName, data, now, weekState);
  const candidates =
    eventName === JOB_EVENTS.loreCanonized &&
    (data as LoreCanonizedData).sourcePollId
      ? ([{ contentType: "verdict_column", persona: "commissioner" }] as const)
      : TRIGGER_CANDIDATES[eventName];
  return candidates.map((candidate) => {
    const eventData = {
      contentType: candidate.contentType,
      leagueId: data.leagueId,
      persona: candidate.persona,
      triggerKey,
    };
    return eventName === JOB_EVENTS.recordBroken
      ? leadStoryCandidate(eventData)
      : toPlannedEvent(eventData);
  });
}

export async function planTriggeredContent({
  data,
  db,
  env,
  eventName,
  nflCalendar,
  nflWeekState,
  now,
}: {
  data:
    | BetSettledData
    | ArenaStandingsSwingData
    | LoreCanonizedData
    | PollClosedData
    | RecordBrokenData
    | TransactionData
    | WaiverData;
  db: Db;
  env: EntitlementResolverEnv;
  eventName: ContentPlanTriggerEventName;
  nflCalendar?: NflCalendar;
  nflWeekState?: NflWeekState;
  now?: () => Date;
}): Promise<ContentPlanTriggerResult> {
  const resolvedNow = now?.() ?? new Date();
  const resolvedNflWeekState =
    nflWeekState ??
    (await (nflCalendar ?? defaultNflCalendar).weekState(resolvedNow));
  const skippedEntitlement = await resolveCadenceEntitlement({
    db,
    env,
    leagueId: data.leagueId,
    now: () => resolvedNow,
  });
  if (skippedEntitlement) {
    return {
      eventName,
      nflWeekState: resolvedNflWeekState,
      planned: [],
      skippedEntitlement,
      skippedReason: entitlementSkippedReason(skippedEntitlement),
    };
  }

  const planned = planTriggeredContentEvents({
    data,
    eventName,
    now: resolvedNow,
    weekState: resolvedNflWeekState,
  });

  return {
    eventName,
    nflWeekState: resolvedNflWeekState,
    planned,
    skippedEntitlement: null,
    skippedReason: null,
  };
}

export async function planLaunchEditionContent({
  data,
  db,
  env,
  now,
}: {
  data: LeagueConnectedData;
  db: Db;
  env: EntitlementResolverEnv;
  now?: () => Date;
}): Promise<ContentPlanLaunchEditionResult> {
  const [league] = await db
    .select({
      id: leagues.id,
      status: leagues.status,
    })
    .from(leagues)
    .where(eq(leagues.id, data.leagueId))
    .limit(1);

  if (!league) {
    return {
      eventName: JOB_EVENTS.leagueConnected,
      league: null,
      planned: [],
      skippedEntitlement: null,
      skippedReason: "league_not_found",
    };
  }

  const budget = await resolveContentPlanningBudget({
    db,
    env,
    leagueId: data.leagueId,
    now,
  });
  if (budget.skippedEntitlement) {
    return {
      eventName: JOB_EVENTS.leagueConnected,
      league,
      planned: [],
      skippedEntitlement: budget.skippedEntitlement,
      skippedReason: entitlementSkippedReason(budget.skippedEntitlement),
    };
  }

  const candidateLimit = Number.isFinite(budget.remainingSlots)
    ? Math.max(
        0,
        Math.min(LAUNCH_EDITION_CANDIDATES.length, budget.remainingSlots),
      )
    : LAUNCH_EDITION_CANDIDATES.length;
  const planned = LAUNCH_EDITION_CANDIDATES.slice(0, candidateLimit).map(
    (candidate) =>
      toPlannedEvent({
        contentType: candidate.contentType,
        leagueId: data.leagueId,
        persona: candidate.persona,
        triggerKey: LAUNCH_EDITION_TRIGGER_KEY,
      }),
  );

  return {
    eventName: JOB_EVENTS.leagueConnected,
    league,
    planned,
    skippedEntitlement: null,
    skippedReason:
      planned.length < LAUNCH_EDITION_CANDIDATES.length
        ? "launch_edition_capped"
        : null,
  };
}
