import type { AiContentType, AiPersona } from "@/ai";
import type { FantasyProviderId, ProviderDataClass } from "@/providers";

export const JOB_EVENTS = {
  appPing: "app.ping",
  leagueConnected: "league.connected",
  gameFinal: "game.final",
  ingestionTick: "ingestion.tick",
  leagueIngest: "league.ingest",
  seasonRolloverCheck: "season.rollover.check",
  importRequested: "import.requested",
  bankrollRollover: "bankroll.rollover",
  oddsPoll: "odds.poll",
  newsRefresh: "news.refresh",
  weeklyDigest: "digest.weekly",
  contentGenerate: "content.generate",
  contentCorrectionNeeded: "content.correction.needed",
  instigationSeed: "instigation.seed",
  instigationSeeded: "instigation.seeded",
  transaction: "transaction",
  waiver: "waiver",
  recordBroken: "record.broken",
  pollClose: "poll.close",
  loreVoteClose: "lore.vote.close",
  loreCanonized: "lore.canonized",
  pollClosed: "poll.closed",
  loreDispute: "lore.dispute",
  betSettled: "bet.settled",
  arenaStandingsSwing: "arena.standings.swing",
} as const;

export type JobEventName = (typeof JOB_EVENTS)[keyof typeof JOB_EVENTS];

export interface AppPingData {
  message?: unknown;
  requestedAt?: unknown;
}

export interface ImportRequestedData {
  credentialId: string;
  leagueId: string;
  provider: Extract<FantasyProviderId, "espn" | "sleeper" | "yahoo">;
  providerLeagueId: string;
  season: number;
  sport: "ffl" | "unknown";
  name: string;
  teamName?: string;
  size?: number;
  seasons?: number[];
  maxSeasons?: number;
}

export interface IngestionTickData {
  leagueId?: string;
  leagueIds?: string[];
  limit?: number;
  now?: string;
}

export interface LeagueConnectedData {
  leagueId: string;
}

export interface LeagueIngestData {
  credentialId: string;
  currentScoringPeriod?: number;
  dataClasses?: ProviderDataClass[];
  leagueId: string;
  name: string;
  provider: Extract<FantasyProviderId, "espn" | "sleeper" | "yahoo">;
  providerLeagueId: string;
  season: number;
  size?: number;
  sport: "ffl" | "unknown";
}

export interface SeasonRolloverCheckData {
  credentialIds?: string[];
  leagueIds?: string[];
  limit?: number;
  now?: string;
}

export interface ContentGenerateData {
  leagueId: string;
  persona: AiPersona;
  contentType: AiContentType;
  triggerKey: string;
}

export interface ContentCorrectionNeededData {
  affectedWeeks: {
    scoringPeriod: number;
    season: number;
  }[];
  changedMatchups: {
    contentHash: string;
    id: string;
    scoringPeriod: number;
    season: number;
  }[];
  contentItemId: string;
  correctionHash: string;
  leagueId: string;
  reason?: string;
}

export interface BankrollRolloverData {
  leagueIds?: string[];
  limit?: number;
  now?: string;
}

export interface InstigationSeedData {
  closesAt?: string;
  dedupKey: string;
  groundingRefs: {
    id: string;
    label?: string;
    type: "record" | "head_to_head" | "transaction" | "team" | "member";
  }[];
  kind:
    | "settle_it_poll"
    | "villain_crown"
    | "manufactured_rivalry"
    | "user_move_reaction";
  leagueId: string;
  options: string[];
  persona: AiPersona;
  promptText: string;
}

export interface InstigationSeededData {
  contentItemId?: string;
  instigationId: string;
  leagueId: string;
  pollId?: string;
}

export interface PollCloseData {
  leagueId: string;
  pollId: string;
}

export interface LoreVoteCloseData {
  claimId: string;
  leagueId: string;
}

export interface TransactionData {
  leagueId: string;
  transactionId: string;
}

export interface WaiverData {
  leagueId: string;
  waiverId: string;
}

export interface RecordBrokenData {
  leagueId: string;
  recordKey: string;
}

export interface LoreCanonizedData {
  claimId: string;
  leagueId: string;
  sourcePollId?: string;
}

export interface PollClosedData {
  leagueId: string;
  pollId: string;
}

export interface BetSettledData {
  bettingEventId?: string;
  leagueId: string;
  settlementId: string;
  slipId?: string;
}

export interface ArenaStandingsSwingData {
  leagueId: string;
  seasonId: string;
  swingKey: string;
}

export interface GameFinalData {
  bettingEventId?: string;
  leagueId: string;
  gameId: string;
  milestoneKeys?: string[];
  sourceContentHash?: string;
}

export interface NewsRefreshData {
  topic?: string;
  limit?: number;
}

export interface WeeklyDigestData {
  leagueId?: string;
  leagueIds?: string[];
  limit?: number;
  windowEnd?: string;
  windowStart?: string;
}

export interface OddsPollData {
  limit?: number;
  sport?: "nfl";
}
