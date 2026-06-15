import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { AiContentType, AiPersona } from "@/ai";
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
  planned: PlannedContentGenerateEvent[];
  skippedEntitlement: SkippedContentGenerationLeague | null;
  skippedReason: string | null;
}

export interface ContentPlanTriggerResult {
  eventName: ContentPlanTriggerEventName;
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

const POST_GAMES_CANDIDATES = [
  { contentType: "weekly_recap", persona: "narrator" },
  { contentType: "power_rankings", persona: "analyst" },
  { contentType: "awards_superlatives", persona: "trash_talker" },
] as const satisfies readonly ContentCandidate[];

const MIDWEEK_CANDIDATES = [
  { contentType: "power_rankings", persona: "analyst" },
  { contentType: "awards_superlatives", persona: "beat_reporter" },
  { contentType: "instigation_column", persona: "trash_talker" },
  { contentType: "season_arc", persona: "narrator" },
] as const satisfies readonly ContentCandidate[];

const PRE_KICKOFF_CANDIDATES = [
  { contentType: "matchup_preview", persona: "commissioner" },
  { contentType: "matchup_preview", persona: "analyst" },
] as const satisfies readonly ContentCandidate[];

const PRE_KICKOFF_ODDS_CANDIDATES = [
  { contentType: "matchup_preview", persona: "betting_advisor" },
  { contentType: "arena_recap", persona: "betting_advisor" },
] as const satisfies readonly ContentCandidate[];

const OFFSEASON_BEAT_CANDIDATES = [
  { contentType: "season_arc", persona: "narrator" },
  { contentType: "awards_superlatives", persona: "beat_reporter" },
  { contentType: "instigation_column", persona: "trash_talker" },
] as const satisfies readonly ContentCandidate[];

const PRESEASON_COUNTDOWN_CANDIDATES = [
  { contentType: "season_arc", persona: "commissioner" },
  { contentType: "power_rankings", persona: "analyst" },
] as const satisfies readonly ContentCandidate[];

const CALENDAR_CANDIDATES: Record<
  ContentPlanCronCadence,
  readonly ContentCandidate[]
> = {
  "mid-week": [...MIDWEEK_CANDIDATES],
  "offseason-beat": [...OFFSEASON_BEAT_CANDIDATES],
  "post-odds-refresh": [...PRE_KICKOFF_ODDS_CANDIDATES],
  "weekly-preview": [...PRE_KICKOFF_CANDIDATES],
  "weekly-wrap": [...POST_GAMES_CANDIDATES],
};

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
      return null;
    }

    const generatedThisWeek = await countThisWeekAiGenerationRuns({
      db,
      leagueId,
      now: resolvedAt,
    });
    if (generatedThisWeek >= resolution.caps.aiPostsPerWeek) {
      return {
        capability: "ai.cadence.schedule",
        leagueId,
        reason: "CAP_EXCEEDED",
        requiredTier: resolution.requiredTier,
        tier: resolution.tier,
      };
    }

    return null;
  }

  return {
    capability: "ai.cadence.schedule",
    leagueId,
    reason: resolution.reason,
    requiredTier: resolution.requiredTier,
    tier: resolution.tier,
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

function cronTriggerKey(
  cadence: ContentPlanCronCadence,
  now: Date,
  weekState: NflWeekState,
): string {
  return `cron:${cadence}:${weekState.phase}:${nflWeekToken(weekState, now)}`;
}

function gameFinalTriggerKey(matchup: GameFinalMatchup): string {
  return `game-final:${matchup.season}:${matchup.scoringPeriod}:${matchup.gameId}`;
}

function recordBrokenTriggerKey(recordKey: string): string {
  return `record-broken:${recordKey}`;
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
        ? `poll-closed:${loreData.sourcePollId}`
        : `lore-canonized:${loreData.claimId}`;
    }
    case JOB_EVENTS.pollClosed:
      return `poll-closed:${(data as PollClosedData).pollId}`;
    case JOB_EVENTS.betSettled: {
      const betData = data as BetSettledData;
      return `bet-settled:${betData.settlementId}`;
    }
    case JOB_EVENTS.arenaStandingsSwing: {
      const swingData = data as ArenaStandingsSwingData;
      return `arena-swing:${swingData.seasonId}:${swingData.swingKey}`;
    }
  }
}

function scheduledCandidatesFor({
  cadence,
  hasRivalryWeek,
  weekState,
}: {
  cadence: ContentPlanCronCadence;
  hasRivalryWeek: boolean;
  weekState: NflWeekState;
}): ContentCandidate[] {
  if (!cadenceMatchesWeekState({ cadence, weekState })) {
    return [];
  }

  const candidates: ContentCandidate[] =
    cadence === "offseason-beat" && weekState.phase === "preseason"
      ? [...PRESEASON_COUNTDOWN_CANDIDATES]
      : [...CALENDAR_CANDIDATES[cadence]];
  if (
    cadence === "weekly-preview" &&
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
  weekState,
}: {
  cadence: ContentPlanCronCadence;
  weekState: NflWeekState;
}): boolean {
  if (cadence === "offseason-beat") {
    return isOffseasonBeatPhase(weekState);
  }

  if (!hasScheduledGamesPhase(weekState.phase)) {
    return false;
  }

  switch (cadence) {
    case "weekly-wrap":
      return weekState.gamePhase === "post_games";
    case "mid-week":
      return weekState.gamePhase === "quiet";
    case "weekly-preview":
    case "post-odds-refresh":
      return weekState.gamePhase === "pre_kickoff";
  }
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
      cadence === "weekly-preview" &&
      cadenceMatchesWeekState({ cadence, weekState: resolvedNflWeekState })
        ? await hasRivalrySignal({ db, leagueId: league.id })
        : false;
    const triggerKey = cronTriggerKey(
      cadence,
      resolvedNow,
      resolvedNflWeekState,
    );
    for (const candidate of scheduledCandidatesFor({
      cadence,
      hasRivalryWeek,
      weekState: resolvedNflWeekState,
    })) {
      planned.push(
        toPlannedEvent({
          contentType: candidate.contentType,
          leagueId: league.id,
          persona: candidate.persona,
          triggerKey,
        }),
      );
    }
  }

  return { cadence, nflWeekState: resolvedNflWeekState, planned, skipped };
}

function gameFinalTriggerReasons({
  matchup,
  milestoneKeys,
  teams,
}: {
  matchup: GameFinalMatchup;
  milestoneKeys: readonly string[];
  teams: ReadonlyMap<string, GameFinalTeam>;
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

  return reasons;
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
      toPlannedEvent({
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
  now,
}: {
  data: GameFinalData;
  db: Db;
  env: EntitlementResolverEnv;
  now?: () => Date;
}): Promise<ContentPlanGameFinalResult> {
  const skippedEntitlement = await resolveCadenceEntitlement({
    db,
    env,
    leagueId: data.leagueId,
    now,
  });
  if (skippedEntitlement) {
    return {
      game: null,
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
        planned: [],
        skippedEntitlement: null,
        skippedReason: "game_not_final",
      };
    }

    const teamProviderIds = [
      ...new Set([matchup.homeTeamProviderId, matchup.awayTeamProviderId]),
    ];
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
      matchup,
      milestoneKeys: data.milestoneKeys ?? [],
      teams,
    });
    const triggerKey = gameFinalTriggerKey(matchup);
    const planned = [
      ...gameFinalCandidates(triggerReasons).map((candidate) =>
        toPlannedEvent({
          contentType: candidate.contentType,
          leagueId: data.leagueId,
          persona: candidate.persona,
          triggerKey,
        }),
      ),
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
      planned,
      skippedEntitlement: null,
      skippedReason: null,
    };
  });
}

function planTriggeredContentEvents({
  data,
  eventName,
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
}): PlannedContentGenerateEvent[] {
  const triggerKey = contentTriggerKey(eventName, data);
  const candidates =
    eventName === JOB_EVENTS.loreCanonized &&
    (data as LoreCanonizedData).sourcePollId
      ? ([{ contentType: "verdict_column", persona: "commissioner" }] as const)
      : TRIGGER_CANDIDATES[eventName];
  return candidates.map((candidate) =>
    toPlannedEvent({
      contentType: candidate.contentType,
      leagueId: data.leagueId,
      persona: candidate.persona,
      triggerKey,
    }),
  );
}

export async function planTriggeredContent({
  data,
  db,
  env,
  eventName,
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
  now?: () => Date;
}): Promise<ContentPlanTriggerResult> {
  const skippedEntitlement = await resolveCadenceEntitlement({
    db,
    env,
    leagueId: data.leagueId,
    now,
  });
  if (skippedEntitlement) {
    return {
      eventName,
      planned: [],
      skippedEntitlement,
      skippedReason: entitlementSkippedReason(skippedEntitlement),
    };
  }

  const planned = planTriggeredContentEvents({ data, eventName });

  return {
    eventName,
    planned,
    skippedEntitlement: null,
    skippedReason: null,
  };
}
