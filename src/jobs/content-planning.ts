import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { AiContentType, AiPersona } from "@/ai";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  fantasyMatchups,
  fantasyTeams,
  headToHeadRecords,
  leagues,
} from "@/db/schema";
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

export interface ContentPlanCronResult {
  cadence: ContentPlanCronCadence;
  planned: PlannedContentGenerateEvent[];
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
  skippedReason: string | null;
}

export interface ContentPlanTriggerResult {
  eventName: ContentPlanTriggerEventName;
  planned: PlannedContentGenerateEvent[];
  skippedReason: string | null;
}

const ACTIVE_LEAGUE_STATUSES = ["preseason", "in_season"] as const;
const BLOWOUT_MARGIN = 25;
const RIVALRY_MEETINGS_THRESHOLD = 5;
interface ContentCandidate {
  persona: AiPersona;
  contentType: AiContentType;
}

const CRON_CANDIDATES: Record<
  ContentPlanCronCadence,
  readonly ContentCandidate[]
> = {
  "mid-week": [
    { contentType: "transaction_reaction", persona: "beat_reporter" },
    { contentType: "instigation_column", persona: "trash_talker" },
  ],
  "post-odds-refresh": [
    { contentType: "matchup_preview", persona: "betting_advisor" },
    { contentType: "arena_recap", persona: "betting_advisor" },
  ],
  "weekly-preview": [
    { contentType: "matchup_preview", persona: "commissioner" },
    { contentType: "matchup_preview", persona: "analyst" },
  ],
  "weekly-wrap": [
    { contentType: "weekly_recap", persona: "narrator" },
    { contentType: "power_rankings", persona: "analyst" },
    { contentType: "awards_superlatives", persona: "beat_reporter" },
    { contentType: "season_arc", persona: "narrator" },
  ],
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

interface LeaguePlanRow {
  id: string;
  currentScoringPeriod: number;
  season: number;
}

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
  league: LeaguePlanRow,
): string {
  return `cron:${cadence}:${league.season}:${league.currentScoringPeriod}`;
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
}: {
  cadence: ContentPlanCronCadence;
  hasRivalryWeek: boolean;
}): ContentCandidate[] {
  const candidates = [...CRON_CANDIDATES[cadence]];
  if (cadence === "weekly-preview" && hasRivalryWeek) {
    candidates.push({
      contentType: "rivalry_piece",
      persona: "trash_talker",
    });
  }
  return candidates;
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
}: {
  cadence: ContentPlanCronCadence;
  db: Db;
}): Promise<ContentPlanCronResult> {
  const activeLeagues = await db
    .select({
      currentScoringPeriod: leagues.currentScoringPeriod,
      id: leagues.id,
      season: leagues.season,
    })
    .from(leagues)
    .where(inArray(leagues.status, ACTIVE_LEAGUE_STATUSES))
    .orderBy(asc(leagues.id));

  const planned: PlannedContentGenerateEvent[] = [];
  for (const league of activeLeagues) {
    const hasRivalryWeek =
      cadence === "weekly-preview"
        ? await hasRivalrySignal({ db, leagueId: league.id })
        : false;
    const triggerKey = cronTriggerKey(cadence, league);
    for (const candidate of scheduledCandidatesFor({
      cadence,
      hasRivalryWeek,
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

  return { cadence, planned };
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
}: {
  data: GameFinalData;
  db: Db;
}): Promise<ContentPlanGameFinalResult> {
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
      skippedReason: null,
    };
  });
}

export function planTriggeredContent({
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
}): ContentPlanTriggerResult {
  const triggerKey = contentTriggerKey(eventName, data);
  const candidates =
    eventName === JOB_EVENTS.loreCanonized &&
    (data as LoreCanonizedData).sourcePollId
      ? ([{ contentType: "verdict_column", persona: "commissioner" }] as const)
      : TRIGGER_CANDIDATES[eventName];
  const planned = candidates.map((candidate) =>
    toPlannedEvent({
      contentType: candidate.contentType,
      leagueId: data.leagueId,
      persona: candidate.persona,
      triggerKey,
    }),
  );

  return {
    eventName,
    planned,
    skippedReason: null,
  };
}
