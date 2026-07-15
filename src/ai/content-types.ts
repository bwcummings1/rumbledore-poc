import { AppError } from "@/core/result";
import type { LeaguePublicationSectionId } from "@/news/sections";
import type { LeagueColumnId } from "./league-columns";
import type { AiPersona } from "./personas";

export const AI_CONTENT_TYPES = [
  "weekly_recap",
  "power_rankings",
  "matchup_preview",
  "awards_superlatives",
  "transaction_reaction",
  "season_arc",
  "rivalry_piece",
  "arena_recap",
  "milestone_record",
  "instigation_column",
  "verdict_column",
] as const;

export type AiContentType = (typeof AI_CONTENT_TYPES)[number];

export interface WeeklyRecapStructure {
  type: "weekly_recap";
  lead: string;
  topResult: string;
  upsetOrBlowout: string;
  standingsShift: string;
  kicker: string;
  mondayNightOutlook?: {
    matchups: {
      matters: boolean;
      opponent: string;
      reason: string;
      team: string;
    }[];
    summary: string;
  };
}

export interface PowerRankingEntry {
  rank: number;
  delta: number;
  team: string;
  record: string;
  rationale: string;
}

export interface PowerRankingsStructure {
  type: "power_rankings";
  rankings: PowerRankingEntry[];
}

export interface MatchupPreviewEntry {
  team: string;
  opponent: string;
  edge: string;
  keyNumber: string;
  xFactor: string;
  prediction: string;
}

export interface FantasyFridayStructure {
  flashback: {
    available: boolean;
    fact: string;
    season: number | null;
  };
  oddsOrPercentageChanges: {
    after: number;
    before: number;
    market: string;
    matchup: string;
    summary: string;
    unit: "implied_percentage" | "line";
  }[];
  thursdayNightSummaries: {
    awayScore: number | null;
    awayTeam: string;
    homeScore: number | null;
    homeTeam: string;
    summary: string;
  }[];
}

export interface PredictionsStructure {
  matchups: {
    endScore: {
      opponentScore: number | null;
      teamScore: number | null;
    };
    opponent: string;
    playerPerformances: {
      leagueTeam: string;
      player: string;
      predictedPerformance: string;
      projectedPoints: number | null;
    }[];
    team: string;
    writtenPrediction: string;
  }[];
}

export interface MatchupPreviewStructure {
  type: "matchup_preview";
  matchups: MatchupPreviewEntry[];
  fantasyFriday?: FantasyFridayStructure;
  predictions?: PredictionsStructure;
}

export interface AwardSuperlativeEntry {
  award: string;
  recipient: string;
  fact: string;
}

export interface AwardsSuperlativesStructure {
  type: "awards_superlatives";
  awards: AwardSuperlativeEntry[];
}

export interface TransactionReactionStructure {
  type: "transaction_reaction";
  move: string;
  grade: string;
  winner: string;
  loser: string;
  sourcesSay: string;
  waiverSummary?: {
    fabBudget: number | null;
    moves: {
      fabRemaining: number | null;
      fabSpent: number | null;
      rosterChanges: string[];
      team: string;
    }[];
    summary: string;
  };
}

export interface SeasonArcStructure {
  type: "season_arc";
  actSoFar: string;
  turningPoint: string;
  teamToBeat: string;
  stakes: string;
}

export interface RivalryPieceStructure {
  type: "rivalry_piece";
  history: string;
  score: string;
  stakes: string;
  needle: string;
}

export interface ArenaRecapStructure {
  type: "arena_recap";
  leaguePosition: string;
  fieldLeader: string;
  rivalWatch: string;
  biggestMovers: string[];
  needle: string;
}

export interface MilestoneRecordStructure {
  type: "milestone_record";
  record: string;
  previousHolder: string;
  newHolder: string;
  math: string;
  legend: string;
}

export interface InstigationColumnStructure {
  type: "instigation_column";
  provocation: string;
  twoSides: string[];
  settleItCta: string;
  stakes: string;
}

export interface VerdictColumnStructure {
  type: "verdict_column";
  question: string;
  vote: string;
  ruling: string;
  newCanon: string;
}

export type BlogContentStructure =
  | WeeklyRecapStructure
  | PowerRankingsStructure
  | MatchupPreviewStructure
  | AwardsSuperlativesStructure
  | TransactionReactionStructure
  | SeasonArcStructure
  | RivalryPieceStructure
  | ArenaRecapStructure
  | MilestoneRecordStructure
  | InstigationColumnStructure
  | VerdictColumnStructure;

export interface ContentStructureValidationContext {
  league: {
    name: string;
  };
  teams: readonly {
    name: string;
    managerNames: readonly string[];
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
  }[];
  records?: readonly {
    holderName: string | null;
    previousHolderName?: string | null;
  }[];
  players?: readonly string[];
}

export interface ContentTypeTemplate {
  contentType: AiContentType;
  label: string;
  defaultPersonas: readonly AiPersona[];
  section: LeaguePublicationSectionId;
  promptContract: string;
}

export const CONTENT_TYPE_TEMPLATES: Record<
  AiContentType,
  ContentTypeTemplate
> = {
  awards_superlatives: {
    contentType: "awards_superlatives",
    defaultPersonas: ["beat_reporter", "trash_talker"],
    label: "Awards and Superlatives",
    promptContract:
      "Return 3-5 named awards; each award must name a real manager or team and cite the fact that earned it.",
    section: "trash-talk",
  },
  matchup_preview: {
    contentType: "matchup_preview",
    defaultPersonas: ["analyst"],
    label: "Matchup Preview",
    promptContract:
      "Return per-matchup previews with edge, key number, x-factor, and a hedged prediction.",
    section: "previews",
  },
  power_rankings: {
    contentType: "power_rankings",
    defaultPersonas: ["analyst"],
    label: "Power Rankings",
    promptContract:
      "Return an ordered rankings array exactly sized to the league team count; every row must cite team record and a one-line rationale.",
    section: "power-rankings",
  },
  season_arc: {
    contentType: "season_arc",
    defaultPersonas: ["narrator"],
    label: "Season Arc",
    promptContract:
      "Return act so far, turning point, team to beat, and what's at stake for the league story.",
    section: "recaps",
  },
  instigation_column: {
    contentType: "instigation_column",
    defaultPersonas: ["trash_talker", "beat_reporter", "commissioner"],
    label: "Instigation Column",
    promptContract:
      "Return the provocation, two named sides, a settle-it call to action, and the league stakes; the provocation must be tied to supplied league facts.",
    section: "trash-talk",
  },
  milestone_record: {
    contentType: "milestone_record",
    defaultPersonas: ["analyst", "narrator"],
    label: "Milestone Record",
    promptContract:
      "Return the record, previous holder, new holder, the math, and the legend without inventing unsupplied history.",
    section: "records",
  },
  rivalry_piece: {
    contentType: "rivalry_piece",
    defaultPersonas: ["trash_talker", "narrator"],
    label: "Rivalry Piece",
    promptContract:
      "Return the rivalry history, current score, stakes this week, and an affectionate needle grounded in supplied head-to-head or team facts.",
    section: "trash-talk",
  },
  arena_recap: {
    contentType: "arena_recap",
    defaultPersonas: ["betting_advisor", "narrator"],
    label: "Arena Recap",
    promptContract:
      "Return the active league's arena position, the field leader, head-to-head rival watch, biggest aggregate movers, and one play-money needle without exposing raw bets from other leagues.",
    section: "recaps",
  },
  transaction_reaction: {
    contentType: "transaction_reaction",
    defaultPersonas: ["beat_reporter"],
    label: "Transaction Reaction",
    promptContract:
      "Return the move, grade, winner, loser, and a sources-say kicker tied to league-owned facts.",
    section: "previews",
  },
  verdict_column: {
    contentType: "verdict_column",
    defaultPersonas: ["commissioner"],
    label: "Verdict Column",
    promptContract:
      "Return the question, vote result, ruling, and new canon phrased as a league verdict; never assert unratified claims outside the supplied trigger.",
    section: "records",
  },
  weekly_recap: {
    contentType: "weekly_recap",
    defaultPersonas: ["narrator"],
    label: "Weekly Recap",
    promptContract:
      "Return lead, top result, upset or blowout, standings shift, and kicker sections.",
    section: "recaps",
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableNumberValue(value: unknown, field: string): number | null {
  if (value === null) {
    return null;
  }
  const number = numberValue(value);
  if (number === null) {
    throwStructureError(`${field} must be a finite number or null`);
  }
  return number;
}

function nullableNonnegativeNumberValue(
  value: unknown,
  field: string,
): number | null {
  const number = nullableNumberValue(value, field);
  if (number !== null && number < 0) {
    throwStructureError(`${field} must be nonnegative or null`);
  }
  return number;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function throwStructureError(message: string): never {
  throw new AppError({
    code: "AI_DRAFT_STRUCTURE_INVALID",
    message,
    status: 422,
  });
}

function knownEntityNames(
  context: ContentStructureValidationContext,
): Set<string> {
  const names = new Set<string>();
  for (const team of context.teams) {
    names.add(team.name);
    for (const manager of team.managerNames) {
      names.add(manager);
    }
  }
  for (const record of context.records ?? []) {
    if (record.holderName) {
      names.add(record.holderName);
    }
    if (record.previousHolderName) {
      names.add(record.previousHolderName);
    }
  }
  return names;
}

function ensureKnownEntity(
  value: string,
  context: ContentStructureValidationContext,
  field: string,
): void {
  if (!knownEntityNames(context).has(value)) {
    throwStructureError(
      `${field} must reference a real league team or manager`,
    );
  }
}

function ensureKnownPlayer(
  value: string,
  context: ContentStructureValidationContext,
  field: string,
): void {
  if (context.players && !context.players.includes(value)) {
    throwStructureError(`${field} must reference a supplied player`);
  }
}

function normalizeMondayNightOutlook(
  value: unknown,
  context: ContentStructureValidationContext,
): NonNullable<WeeklyRecapStructure["mondayNightOutlook"]> {
  const record = asRecord(value);
  const summary = cleanText(record.summary);
  const matchups = arrayValue(record.matchups).map((value) => {
    const matchup = asRecord(value);
    const normalized = {
      matters: matchup.matters,
      opponent: cleanText(matchup.opponent),
      reason: cleanText(matchup.reason),
      team: cleanText(matchup.team),
    };
    if (
      typeof normalized.matters !== "boolean" ||
      !normalized.team ||
      !normalized.opponent ||
      !normalized.reason
    ) {
      throwStructureError(
        "weekly_recap mondayNightOutlook matchups must be fully populated",
      );
    }
    ensureKnownEntity(
      normalized.team,
      context,
      "weekly_recap.mondayNightOutlook.team",
    );
    ensureKnownEntity(
      normalized.opponent,
      context,
      "weekly_recap.mondayNightOutlook.opponent",
    );
    return {
      matters: normalized.matters,
      opponent: normalized.opponent,
      reason: normalized.reason,
      team: normalized.team,
    };
  });
  if (!summary) {
    throwStructureError("weekly_recap mondayNightOutlook requires a summary");
  }
  return { matchups, summary };
}

function normalizeWeeklyRecap(
  structure: unknown,
  context: ContentStructureValidationContext,
  columnFormat: LeagueColumnId | null,
): WeeklyRecapStructure {
  const record = asRecord(structure);
  const mondayNightOutlook = record.mondayNightOutlook
    ? normalizeMondayNightOutlook(record.mondayNightOutlook, context)
    : null;
  const normalized = {
    kicker: cleanText(record.kicker),
    lead: cleanText(record.lead),
    standingsShift: cleanText(record.standingsShift),
    topResult: cleanText(record.topResult),
    type: "weekly_recap" as const,
    upsetOrBlowout: cleanText(record.upsetOrBlowout),
  };
  if (
    !normalized.lead ||
    !normalized.topResult ||
    !normalized.upsetOrBlowout ||
    !normalized.standingsShift ||
    !normalized.kicker
  ) {
    throwStructureError("weekly_recap structure is missing a required section");
  }
  if (columnFormat === "the-wrap" && !mondayNightOutlook) {
    throwStructureError(
      "The Wrap weekly_recap requires a mondayNightOutlook section",
    );
  }
  return mondayNightOutlook
    ? { ...normalized, mondayNightOutlook }
    : normalized;
}

function normalizePowerRankings(
  structure: unknown,
  context: ContentStructureValidationContext,
): PowerRankingsStructure {
  const record = asRecord(structure);
  const rankings = arrayValue(record.rankings).map((value) => {
    const row = asRecord(value);
    const normalized = {
      delta: numberValue(row.delta),
      rank: numberValue(row.rank),
      rationale: cleanText(row.rationale),
      record: cleanText(row.record),
      team: cleanText(row.team),
    };
    if (
      normalized.rank === null ||
      normalized.delta === null ||
      !normalized.team ||
      !normalized.record ||
      !normalized.rationale
    ) {
      throwStructureError("power_rankings entries must be fully populated");
    }
    ensureKnownEntity(normalized.team, context, "power_rankings.team");
    return {
      delta: normalized.delta,
      rank: normalized.rank,
      rationale: normalized.rationale,
      record: normalized.record,
      team: normalized.team,
    };
  });

  if (rankings.length !== context.teams.length) {
    throwStructureError(
      "power_rankings length must match the league team count",
    );
  }

  rankings.forEach((row, index) => {
    if (row.rank !== index + 1) {
      throwStructureError("power_rankings ranks must be ordered from 1");
    }
  });

  return { rankings, type: "power_rankings" };
}

function normalizeFantasyFriday(
  value: unknown,
  context: ContentStructureValidationContext,
): FantasyFridayStructure {
  const record = asRecord(value);
  const flashbackRecord = asRecord(record.flashback);
  const flashback = {
    available: flashbackRecord.available,
    fact: cleanText(flashbackRecord.fact),
    season: nullableNonnegativeNumberValue(
      flashbackRecord.season,
      "matchup_preview.fantasyFriday.flashback.season",
    ),
  };
  if (typeof flashback.available !== "boolean" || !flashback.fact) {
    throwStructureError(
      "Fantasy Friday requires a fully populated league flashback",
    );
  }
  if (!flashback.available && flashback.season !== null) {
    throwStructureError(
      "Fantasy Friday unavailable flashbacks cannot claim a season",
    );
  }
  if (
    flashback.available &&
    context.teams.length > 0 &&
    ![...knownEntityNames(context)].some((name) =>
      flashback.fact.includes(name),
    )
  ) {
    throwStructureError(
      "Fantasy Friday flashback must reference a supplied league entity",
    );
  }

  const oddsOrPercentageChanges = arrayValue(
    record.oddsOrPercentageChanges,
  ).map<FantasyFridayStructure["oddsOrPercentageChanges"][number]>((value) => {
    const change = asRecord(value);
    const normalized = {
      after: numberValue(change.after),
      before: numberValue(change.before),
      market: cleanText(change.market),
      matchup: cleanText(change.matchup),
      summary: cleanText(change.summary),
      unit: change.unit,
    };
    if (
      normalized.after === null ||
      normalized.before === null ||
      !normalized.market ||
      !normalized.matchup ||
      !normalized.summary ||
      (normalized.unit !== "line" && normalized.unit !== "implied_percentage")
    ) {
      throwStructureError(
        "Fantasy Friday odds or percentage changes must be fully populated",
      );
    }
    return {
      after: normalized.after,
      before: normalized.before,
      market: normalized.market,
      matchup: normalized.matchup,
      summary: normalized.summary,
      unit: normalized.unit === "line" ? "line" : "implied_percentage",
    };
  });

  const thursdayNightSummaries = arrayValue(record.thursdayNightSummaries).map(
    (value) => {
      const game = asRecord(value);
      const normalized = {
        awayScore: nullableNonnegativeNumberValue(
          game.awayScore,
          "matchup_preview.fantasyFriday.thursdayNightSummaries.awayScore",
        ),
        awayTeam: cleanText(game.awayTeam),
        homeScore: nullableNonnegativeNumberValue(
          game.homeScore,
          "matchup_preview.fantasyFriday.thursdayNightSummaries.homeScore",
        ),
        homeTeam: cleanText(game.homeTeam),
        summary: cleanText(game.summary),
      };
      if (!normalized.awayTeam || !normalized.homeTeam || !normalized.summary) {
        throwStructureError(
          "Fantasy Friday Thursday-night summaries must be fully populated",
        );
      }
      if ((normalized.awayScore === null) !== (normalized.homeScore === null)) {
        throwStructureError(
          "Fantasy Friday Thursday-night scores must be both known or both null",
        );
      }
      return normalized;
    },
  );

  return {
    flashback: {
      available: flashback.available,
      fact: flashback.fact,
      season: flashback.season,
    },
    oddsOrPercentageChanges,
    thursdayNightSummaries,
  };
}

function normalizePredictions(
  value: unknown,
  context: ContentStructureValidationContext,
): PredictionsStructure {
  const record = asRecord(value);
  const matchups = arrayValue(record.matchups).map((value) => {
    const matchup = asRecord(value);
    const endScoreRecord = asRecord(matchup.endScore);
    const team = cleanText(matchup.team);
    const opponent = cleanText(matchup.opponent);
    const writtenPrediction = cleanText(matchup.writtenPrediction);
    const endScore = {
      opponentScore: nullableNonnegativeNumberValue(
        endScoreRecord.opponentScore,
        "matchup_preview.predictions.matchups.endScore.opponentScore",
      ),
      teamScore: nullableNonnegativeNumberValue(
        endScoreRecord.teamScore,
        "matchup_preview.predictions.matchups.endScore.teamScore",
      ),
    };
    if (!team || !opponent || !writtenPrediction) {
      throwStructureError(
        "Predictions matchup entries must be fully populated",
      );
    }
    if ((endScore.teamScore === null) !== (endScore.opponentScore === null)) {
      throwStructureError(
        "Predictions end scores must be both known or both null",
      );
    }
    ensureKnownEntity(team, context, "matchup_preview.predictions.team");
    ensureKnownEntity(
      opponent,
      context,
      "matchup_preview.predictions.opponent",
    );
    const playerPerformances = arrayValue(matchup.playerPerformances).map(
      (value) => {
        const player = asRecord(value);
        const normalized = {
          leagueTeam: cleanText(player.leagueTeam),
          player: cleanText(player.player),
          predictedPerformance: cleanText(player.predictedPerformance),
          projectedPoints: nullableNonnegativeNumberValue(
            player.projectedPoints,
            "matchup_preview.predictions.playerPerformances.projectedPoints",
          ),
        };
        if (
          !normalized.leagueTeam ||
          !normalized.player ||
          !normalized.predictedPerformance
        ) {
          throwStructureError(
            "Predictions player-performance entries must be fully populated",
          );
        }
        ensureKnownEntity(
          normalized.leagueTeam,
          context,
          "matchup_preview.predictions.playerPerformances.leagueTeam",
        );
        ensureKnownPlayer(
          normalized.player,
          context,
          "matchup_preview.predictions.playerPerformances.player",
        );
        return normalized;
      },
    );
    return {
      endScore,
      opponent,
      playerPerformances,
      team,
      writtenPrediction,
    };
  });
  if (matchups.length === 0 && context.teams.length > 0) {
    throwStructureError("Predictions must include at least one matchup");
  }
  return { matchups };
}

function normalizeMatchupPreview(
  structure: unknown,
  context: ContentStructureValidationContext,
  columnFormat: LeagueColumnId | null,
): MatchupPreviewStructure {
  const record = asRecord(structure);
  const matchups = arrayValue(record.matchups).map((value) => {
    const row = asRecord(value);
    const normalized = {
      edge: cleanText(row.edge),
      keyNumber: cleanText(row.keyNumber),
      opponent: cleanText(row.opponent),
      prediction: cleanText(row.prediction),
      team: cleanText(row.team),
      xFactor: cleanText(row.xFactor),
    };
    if (
      !normalized.team ||
      !normalized.opponent ||
      !normalized.edge ||
      !normalized.keyNumber ||
      !normalized.xFactor ||
      !normalized.prediction
    ) {
      throwStructureError("matchup_preview entries must be fully populated");
    }
    ensureKnownEntity(normalized.team, context, "matchup_preview.team");
    ensureKnownEntity(normalized.opponent, context, "matchup_preview.opponent");
    return normalized;
  });

  if (matchups.length === 0 && context.teams.length > 0) {
    throwStructureError("matchup_preview must include at least one matchup");
  }

  const fantasyFriday = record.fantasyFriday
    ? normalizeFantasyFriday(record.fantasyFriday, context)
    : null;
  const predictions = record.predictions
    ? normalizePredictions(record.predictions, context)
    : null;
  if (columnFormat === "fantasy-friday" && !fantasyFriday) {
    throwStructureError(
      "Fantasy Friday matchup_preview requires a fantasyFriday section",
    );
  }
  if (columnFormat === "predictions" && !predictions) {
    throwStructureError(
      "Predictions matchup_preview requires a predictions section",
    );
  }
  return {
    matchups,
    ...(fantasyFriday ? { fantasyFriday } : {}),
    ...(predictions ? { predictions } : {}),
    type: "matchup_preview",
  };
}

function normalizeAwardsSuperlatives(
  structure: unknown,
  context: ContentStructureValidationContext,
): AwardsSuperlativesStructure {
  const record = asRecord(structure);
  const awards = arrayValue(record.awards).map((value) => {
    const row = asRecord(value);
    const normalized = {
      award: cleanText(row.award),
      fact: cleanText(row.fact),
      recipient: cleanText(row.recipient),
    };
    if (!normalized.award || !normalized.recipient || !normalized.fact) {
      throwStructureError(
        "awards_superlatives entries must be fully populated",
      );
    }
    ensureKnownEntity(
      normalized.recipient,
      context,
      "awards_superlatives.recipient",
    );
    return normalized;
  });

  if (awards.length < 3 || awards.length > 5) {
    throwStructureError("awards_superlatives must include 3 to 5 awards");
  }

  return { awards, type: "awards_superlatives" };
}

function normalizeTransactionReaction(
  structure: unknown,
  context: ContentStructureValidationContext,
  columnFormat: LeagueColumnId | null,
): TransactionReactionStructure {
  const record = asRecord(structure);
  const waiverSummaryRecord = record.waiverSummary
    ? asRecord(record.waiverSummary)
    : null;
  const waiverSummary = waiverSummaryRecord
    ? {
        fabBudget: nullableNumberValue(
          waiverSummaryRecord.fabBudget,
          "transaction_reaction.waiverSummary.fabBudget",
        ),
        moves: arrayValue(waiverSummaryRecord.moves).map((value) => {
          const move = asRecord(value);
          const normalizedMove = {
            fabRemaining: nullableNumberValue(
              move.fabRemaining,
              "transaction_reaction.waiverSummary.moves.fabRemaining",
            ),
            fabSpent: nullableNumberValue(
              move.fabSpent,
              "transaction_reaction.waiverSummary.moves.fabSpent",
            ),
            rosterChanges: arrayValue(move.rosterChanges)
              .map(cleanText)
              .filter(Boolean),
            team: cleanText(move.team),
          };
          if (!normalizedMove.team) {
            throwStructureError(
              "transaction_reaction waiverSummary moves require a team",
            );
          }
          ensureKnownEntity(
            normalizedMove.team,
            context,
            "transaction_reaction.waiverSummary.moves.team",
          );
          return normalizedMove;
        }),
        summary: cleanText(waiverSummaryRecord.summary),
      }
    : null;
  const normalized = {
    grade: cleanText(record.grade),
    loser: cleanText(record.loser),
    move: cleanText(record.move),
    sourcesSay: cleanText(record.sourcesSay),
    type: "transaction_reaction" as const,
    winner: cleanText(record.winner),
  };
  if (
    !normalized.move ||
    !normalized.grade ||
    !normalized.winner ||
    !normalized.loser ||
    !normalized.sourcesSay
  ) {
    throwStructureError(
      "transaction_reaction structure is missing a required section",
    );
  }
  ensureKnownEntity(normalized.winner, context, "transaction_reaction.winner");
  ensureKnownEntity(normalized.loser, context, "transaction_reaction.loser");
  if (waiverSummary && !waiverSummary.summary) {
    throwStructureError(
      "transaction_reaction waiverSummary requires a summary",
    );
  }
  if (columnFormat === "waiver-summary" && !waiverSummary) {
    throwStructureError(
      "Waiver Summary transaction_reaction requires a waiverSummary section",
    );
  }
  return waiverSummary ? { ...normalized, waiverSummary } : normalized;
}

function normalizeSeasonArc(
  structure: unknown,
  context: ContentStructureValidationContext,
): SeasonArcStructure {
  const record = asRecord(structure);
  const normalized = {
    actSoFar: cleanText(record.actSoFar),
    stakes: cleanText(record.stakes),
    teamToBeat: cleanText(record.teamToBeat),
    turningPoint: cleanText(record.turningPoint),
    type: "season_arc" as const,
  };
  if (
    !normalized.actSoFar ||
    !normalized.turningPoint ||
    !normalized.teamToBeat ||
    !normalized.stakes
  ) {
    throwStructureError("season_arc structure is missing a required section");
  }
  ensureKnownEntity(normalized.teamToBeat, context, "season_arc.teamToBeat");
  return normalized;
}

function normalizeRivalryPiece(
  structure: unknown,
  context: ContentStructureValidationContext,
): RivalryPieceStructure {
  const record = asRecord(structure);
  const normalized = {
    history: cleanText(record.history),
    needle: cleanText(record.needle),
    score: cleanText(record.score),
    stakes: cleanText(record.stakes),
    type: "rivalry_piece" as const,
  };
  if (
    !normalized.history ||
    !normalized.score ||
    !normalized.stakes ||
    !normalized.needle
  ) {
    throwStructureError(
      "rivalry_piece structure is missing a required section",
    );
  }
  if (
    context.teams.length > 0 &&
    ![...knownEntityNames(context)].some((name) =>
      `${normalized.history} ${normalized.score} ${normalized.stakes} ${normalized.needle}`.includes(
        name,
      ),
    )
  ) {
    throwStructureError("rivalry_piece must reference a real league entity");
  }
  return normalized;
}

function normalizeArenaRecap(structure: unknown): ArenaRecapStructure {
  const record = asRecord(structure);
  const biggestMovers = arrayValue(record.biggestMovers)
    .map((value) => cleanText(value))
    .filter(Boolean);
  const normalized = {
    biggestMovers,
    fieldLeader: cleanText(record.fieldLeader),
    leaguePosition: cleanText(record.leaguePosition),
    needle: cleanText(record.needle),
    rivalWatch: cleanText(record.rivalWatch),
    type: "arena_recap" as const,
  };
  if (
    !normalized.leaguePosition ||
    !normalized.fieldLeader ||
    !normalized.rivalWatch ||
    normalized.biggestMovers.length === 0 ||
    !normalized.needle
  ) {
    throwStructureError("arena_recap structure is missing a required section");
  }
  return normalized;
}

function normalizeMilestoneRecord(
  structure: unknown,
  context: ContentStructureValidationContext,
): MilestoneRecordStructure {
  const record = asRecord(structure);
  const normalized = {
    legend: cleanText(record.legend),
    math: cleanText(record.math),
    newHolder: cleanText(record.newHolder),
    previousHolder: cleanText(record.previousHolder),
    record: cleanText(record.record),
    type: "milestone_record" as const,
  };
  if (
    !normalized.record ||
    !normalized.previousHolder ||
    !normalized.newHolder ||
    !normalized.math ||
    !normalized.legend
  ) {
    throwStructureError(
      "milestone_record structure is missing a required section",
    );
  }
  ensureKnownEntity(
    normalized.newHolder,
    context,
    "milestone_record.newHolder",
  );
  return normalized;
}

function normalizeInstigationColumn(
  structure: unknown,
  context: ContentStructureValidationContext,
): InstigationColumnStructure {
  const record = asRecord(structure);
  const twoSides = arrayValue(record.twoSides)
    .map((value) => cleanText(value))
    .filter(Boolean);
  const normalized = {
    provocation: cleanText(record.provocation),
    settleItCta: cleanText(record.settleItCta),
    stakes: cleanText(record.stakes),
    twoSides,
    type: "instigation_column" as const,
  };
  if (
    !normalized.provocation ||
    normalized.twoSides.length < 2 ||
    !normalized.settleItCta ||
    !normalized.stakes
  ) {
    throwStructureError(
      "instigation_column structure is missing a required section",
    );
  }
  for (const side of normalized.twoSides.slice(0, 2)) {
    ensureKnownEntity(side, context, "instigation_column.twoSides");
  }
  return normalized;
}

function normalizeVerdictColumn(
  structure: unknown,
  context: ContentStructureValidationContext,
): VerdictColumnStructure {
  const record = asRecord(structure);
  const normalized = {
    newCanon: cleanText(record.newCanon),
    question: cleanText(record.question),
    ruling: cleanText(record.ruling),
    type: "verdict_column" as const,
    vote: cleanText(record.vote),
  };
  if (
    !normalized.question ||
    !normalized.vote ||
    !normalized.ruling ||
    !normalized.newCanon
  ) {
    throwStructureError(
      "verdict_column structure is missing a required section",
    );
  }
  if (
    context.teams.length > 0 &&
    ![...knownEntityNames(context)].some((name) =>
      `${normalized.question} ${normalized.vote} ${normalized.ruling} ${normalized.newCanon}`.includes(
        name,
      ),
    )
  ) {
    throwStructureError("verdict_column must reference a real league entity");
  }
  return normalized;
}

export function isAiContentType(value: string): value is AiContentType {
  return (AI_CONTENT_TYPES as readonly string[]).includes(value);
}

export function parseAiContentType(value: unknown): AiContentType {
  if (typeof value === "string" && isAiContentType(value)) {
    return value;
  }
  throw new AppError({
    code: "AI_CONTENT_TYPE_INVALID",
    message: "AI content type is invalid",
    status: 400,
  });
}

export function defaultLeagueArticleSectionForContentType(
  contentType: AiContentType,
): LeaguePublicationSectionId {
  return CONTENT_TYPE_TEMPLATES[contentType].section;
}

export function contentTypePromptContract(
  contentType: AiContentType,
): ContentTypeTemplate {
  return CONTENT_TYPE_TEMPLATES[contentType];
}

export function validateContentStructure({
  columnFormat = null,
  contentType,
  context,
  structure,
}: {
  columnFormat?: LeagueColumnId | null;
  contentType: AiContentType;
  context: ContentStructureValidationContext;
  structure: unknown;
}): BlogContentStructure {
  const record = asRecord(structure);
  if (record.type !== contentType) {
    throwStructureError("content structure type must match content_type");
  }

  switch (contentType) {
    case "weekly_recap":
      return normalizeWeeklyRecap(record, context, columnFormat);
    case "power_rankings":
      return normalizePowerRankings(record, context);
    case "matchup_preview":
      return normalizeMatchupPreview(record, context, columnFormat);
    case "awards_superlatives":
      return normalizeAwardsSuperlatives(record, context);
    case "transaction_reaction":
      return normalizeTransactionReaction(record, context, columnFormat);
    case "season_arc":
      return normalizeSeasonArc(record, context);
    case "rivalry_piece":
      return normalizeRivalryPiece(record, context);
    case "arena_recap":
      return normalizeArenaRecap(record);
    case "milestone_record":
      return normalizeMilestoneRecord(record, context);
    case "instigation_column":
      return normalizeInstigationColumn(record, context);
    case "verdict_column":
      return normalizeVerdictColumn(record, context);
  }
}
