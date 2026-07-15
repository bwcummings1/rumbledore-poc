import { z } from "zod";
import { AppError } from "@/core/result";
import type { CentralColumnContentType } from "./central-columns";
import type { CentralGenerationContext } from "./interfaces";

export const CENTRAL_DATA_STATUSES = [
  "available",
  "partial",
  "unavailable",
] as const;

const dataStatusSchema = z.enum(CENTRAL_DATA_STATUSES);
const evidenceRefsSchema = z.array(z.string().min(1)).min(1);
const nullableTextSchema = z.string().min(1).nullable();
const nullableNumberSchema = z.number().finite().nullable();

export const centralWireBlurbStructureSchema = z.object({
  dataStatus: dataStatusSchema,
  event: z
    .object({
      category: z.enum([
        "contract",
        "injury",
        "roster_move",
        "signing",
        "trade",
        "other",
      ]),
      headline: z.string().min(1),
      occurredAt: z.string().min(1).nullable(),
      sourceItemId: z.string().min(1),
    })
    .nullable(),
  fantasyImplicationIncluded: z.literal(false),
  type: z.literal("central_wire_blurb"),
  whatHappened: nullableTextSchema,
  whyItMatters: nullableTextSchema,
});

export const centralRundownReportStructureSchema = z.object({
  dataStatus: dataStatusSchema,
  findings: z.array(
    z.object({
      evidenceRefs: evidenceRefsSchema,
      finding: z.string().min(1),
      heading: z.string().min(1),
      metric: nullableNumberSchema,
      unit: nullableTextSchema,
    }),
  ),
  reportCategory: z.string().min(1),
  thesis: nullableTextSchema,
  type: z.literal("central_rundown_report"),
  uncertainties: z.array(z.string().min(1)),
});

const fantasyPlayerOutcomeSchema = z.object({
  evidenceRefs: evidenceRefsSchema,
  fantasyPoints: nullableNumberSchema,
  player: z.string().min(1),
  summary: z.string().min(1),
  team: z.string().min(1),
});

export const centralWeekendRecapMnfProjectionStructureSchema = z.object({
  completedGames: z.array(
    z.object({
      awayScore: nullableNumberSchema,
      awayTeam: z.string().min(1),
      evidenceRefs: evidenceRefsSchema,
      fantasyStandouts: z.array(fantasyPlayerOutcomeSchema),
      homeScore: nullableNumberSchema,
      homeTeam: z.string().min(1),
      sourceGameId: z.string().min(1),
      takeaway: nullableTextSchema,
    }),
  ),
  dataStatus: dataStatusSchema,
  mnfProjection: z
    .object({
      awayProjectedScore: nullableNumberSchema,
      awayTeam: z.string().min(1),
      evidenceRefs: evidenceRefsSchema,
      homeProjectedScore: nullableNumberSchema,
      homeTeam: z.string().min(1),
      label: z.literal("computed"),
      methodology: z.string().min(1),
      sourceGameId: z.string().min(1),
    })
    .nullable(),
  projectionStatus: z.enum(["computed", "unavailable"]),
  type: z.literal("central_weekend_recap_mnf_projection"),
});

export const centralMnfRecapStructureSchema = z.object({
  dataStatus: dataStatusSchema,
  fantasyOutcomes: z.array(fantasyPlayerOutcomeSchema),
  game: z
    .object({
      awayScore: nullableNumberSchema,
      awayTeam: z.string().min(1),
      evidenceRefs: evidenceRefsSchema,
      homeScore: nullableNumberSchema,
      homeTeam: z.string().min(1),
      sourceGameId: z.string().min(1),
    })
    .nullable(),
  type: z.literal("central_mnf_recap"),
});

const waiverTargetSchema = z.object({
  evidenceRefs: evidenceRefsSchema,
  player: z.string().min(1),
  position: z.string().min(1),
  recommendation: z.string().min(1),
  recommendedBidPercent: nullableNumberSchema,
  rosterAvailabilityPercent: nullableNumberSchema,
  team: z.string().min(1),
});

export const centralPreWaiverStructureSchema = z.object({
  availabilityScope: z.string().min(1),
  dataStatus: dataStatusSchema,
  recommendations: z.array(
    waiverTargetSchema.extend({
      priority: z.number().int().positive(),
    }),
  ),
  type: z.literal("central_pre_waiver"),
});

export const centralPostWaiverStructureSchema = z.object({
  dataStatus: dataStatusSchema,
  fallbackTargets: z.array(waiverTargetSchema),
  outcomesAvailable: z.boolean(),
  processedOutcomes: z.array(
    z.object({
      evidenceRefs: evidenceRefsSchema,
      outcome: z.string().min(1),
      player: z.string().min(1),
      rosterAvailabilityPercent: nullableNumberSchema,
      team: z.string().min(1),
    }),
  ),
  type: z.literal("central_post_waiver"),
});

export const centralMatchupsStructureSchema = z.object({
  dataStatus: dataStatusSchema,
  matchups: z.array(
    z.object({
      awayTeam: z.string().min(1),
      computedProjection: z
        .object({
          awayScore: nullableNumberSchema,
          homeScore: nullableNumberSchema,
          label: z.literal("computed"),
          methodology: z.string().min(1),
        })
        .nullable(),
      evidenceRefs: evidenceRefsSchema,
      gameTime: z.string().min(1),
      homeTeam: z.string().min(1),
      marketLine: nullableNumberSchema,
      playerAngles: z.array(fantasyPlayerOutcomeSchema),
      sourceGameId: z.string().min(1),
      status: z.enum(["scheduled", "in_progress", "final"]),
    }),
  ),
  type: z.literal("central_matchups"),
});

export const centralRankingsProjectionsStructureSchema = z.object({
  dataStatus: dataStatusSchema,
  methodology: z.string().min(1),
  outputLabel: z.literal("computed"),
  rankings: z.array(
    z.object({
      evidenceRefs: evidenceRefsSchema,
      player: z.string().min(1),
      position: z.string().min(1),
      projectedPoints: nullableNumberSchema,
      rank: z.number().int().positive(),
      recentFantasyPoints: nullableNumberSchema,
      team: z.string().min(1),
    }),
  ),
  type: z.literal("central_rankings_projections"),
});

export const centralStartSitStructureSchema = z.object({
  dataStatus: dataStatusSchema,
  recommendations: z.array(
    z.object({
      conditions: z.array(z.string().min(1)),
      evidenceRefs: evidenceRefsSchema,
      player: z.string().min(1),
      position: z.string().min(1),
      projectedPoints: nullableNumberSchema,
      rationale: z.string().min(1),
      team: z.string().min(1),
      verdict: z.enum(["start", "sit", "conditional"]),
    }),
  ),
  type: z.literal("central_start_sit"),
});

export const centralInjuriesStructureSchema = z.object({
  dataStatus: dataStatusSchema,
  type: z.literal("central_injuries"),
  updates: z.array(
    z.object({
      evidenceRefs: evidenceRefsSchema,
      eventSummary: z.string().min(1),
      fantasyImplication: nullableTextSchema,
      player: z.string().min(1).nullable(),
      replacementOptions: z.array(z.string().min(1)),
      sourceItemId: z.string().min(1),
      status: nullableTextSchema,
      team: z.string().min(1).nullable(),
    }),
  ),
});

export type CentralWireBlurbStructure = z.infer<
  typeof centralWireBlurbStructureSchema
>;
export type CentralRundownReportStructure = z.infer<
  typeof centralRundownReportStructureSchema
>;
export type CentralWeekendRecapMnfProjectionStructure = z.infer<
  typeof centralWeekendRecapMnfProjectionStructureSchema
>;
export type CentralMnfRecapStructure = z.infer<
  typeof centralMnfRecapStructureSchema
>;
export type CentralPreWaiverStructure = z.infer<
  typeof centralPreWaiverStructureSchema
>;
export type CentralPostWaiverStructure = z.infer<
  typeof centralPostWaiverStructureSchema
>;
export type CentralMatchupsStructure = z.infer<
  typeof centralMatchupsStructureSchema
>;
export type CentralRankingsProjectionsStructure = z.infer<
  typeof centralRankingsProjectionsStructureSchema
>;
export type CentralStartSitStructure = z.infer<
  typeof centralStartSitStructureSchema
>;
export type CentralInjuriesStructure = z.infer<
  typeof centralInjuriesStructureSchema
>;

export type CentralContentStructure =
  | CentralWireBlurbStructure
  | CentralRundownReportStructure
  | CentralWeekendRecapMnfProjectionStructure
  | CentralMnfRecapStructure
  | CentralPreWaiverStructure
  | CentralPostWaiverStructure
  | CentralMatchupsStructure
  | CentralRankingsProjectionsStructure
  | CentralStartSitStructure
  | CentralInjuriesStructure;

export const CENTRAL_CONTENT_STRUCTURE_SCHEMAS = {
  central_injuries: centralInjuriesStructureSchema,
  central_matchups: centralMatchupsStructureSchema,
  central_mnf_recap: centralMnfRecapStructureSchema,
  central_post_waiver: centralPostWaiverStructureSchema,
  central_pre_waiver: centralPreWaiverStructureSchema,
  central_rankings_projections: centralRankingsProjectionsStructureSchema,
  central_rundown_report: centralRundownReportStructureSchema,
  central_start_sit: centralStartSitStructureSchema,
  central_weekend_recap_mnf_projection:
    centralWeekendRecapMnfProjectionStructureSchema,
  central_wire_blurb: centralWireBlurbStructureSchema,
} as const satisfies Record<
  CentralColumnContentType,
  z.ZodType<CentralContentStructure>
>;

export interface CentralContentTypeTemplate {
  contentType: CentralColumnContentType;
  label: string;
  maxWords: number;
  minWords: number;
  promptContract: string;
}

export const CENTRAL_CONTENT_TYPE_TEMPLATES = {
  central_injuries: {
    contentType: "central_injuries",
    label: "Injuries",
    maxWords: 500,
    minWords: 180,
    promptContract:
      "Separate the supplied injury event from its fantasy implication; preserve uncertainty and keep unavailable replacement or status fields nullable.",
  },
  central_matchups: {
    contentType: "central_matchups",
    label: "Matchups",
    maxWords: 900,
    minWords: 350,
    promptContract:
      "Preview only supplied games and players; any projection is labeled computed, explains its method, and remains nullable when inputs are insufficient.",
  },
  central_mnf_recap: {
    contentType: "central_mnf_recap",
    label: "MNF Recap",
    maxWords: 650,
    minWords: 250,
    promptContract:
      "Recap the supplied Monday-night final and its recorded fantasy outcomes; return a null game instead of treating a projection or another game as final.",
  },
  central_post_waiver: {
    contentType: "central_post_waiver",
    label: "Post-waiver",
    maxWords: 650,
    minWords: 250,
    promptContract:
      "Distinguish supplied processed outcomes from fallback targets and never imply universal roster availability; availability and bid fields are nullable.",
  },
  central_pre_waiver: {
    contentType: "central_pre_waiver",
    label: "Pre-waiver",
    maxWords: 750,
    minWords: 300,
    promptContract:
      "Prioritize supplied players using recorded production and usage; never invent roster percentages or bid guidance when those inputs are absent.",
  },
  central_rankings_projections: {
    contentType: "central_rankings_projections",
    label: "Rankings & Projections",
    maxWords: 900,
    minWords: 300,
    promptContract:
      "Label the entire output computed, state the methodology, rank only supplied players, and leave projection values null when no projection model input exists.",
  },
  central_rundown_report: {
    contentType: "central_rundown_report",
    label: "The Rundown",
    maxWords: 1_000,
    minWords: 400,
    promptContract:
      "Answer the configured report request with evidence-backed findings and explicit uncertainty; every finding cites supplied evidence references.",
  },
  central_start_sit: {
    contentType: "central_start_sit",
    label: "Start/Sit",
    maxWords: 850,
    minWords: 350,
    promptContract:
      "Give start, sit, or conditional recommendations only for supplied players, hedge them, and keep absent projections nullable.",
  },
  central_weekend_recap_mnf_projection: {
    contentType: "central_weekend_recap_mnf_projection",
    label: "Weekend Recap + MNF Projection",
    maxWords: 1_000,
    minWords: 400,
    promptContract:
      "Keep completed-game facts separate from the Monday-night computed projection; label the projection and return it null when no Monday-night game is supplied.",
  },
  central_wire_blurb: {
    contentType: "central_wire_blurb",
    label: "The Wire",
    maxWords: 220,
    minWords: 80,
    promptContract:
      "File one concise news-and-so-what blurb from the supplied source event; injury coverage here is event-only and fantasyImplicationIncluded is always false.",
  },
} as const satisfies Record<
  CentralColumnContentType,
  CentralContentTypeTemplate
>;

function structureError(message: string, cause?: unknown): never {
  throw new AppError({
    cause,
    code: "CENTRAL_AI_DRAFT_STRUCTURE_INVALID",
    message,
    status: 422,
  });
}

function evidenceRefSet(context: CentralGenerationContext): Set<string> {
  return new Set([
    ...context.evidence.news.map((item) => `news:${item.id}`),
    ...context.evidence.games.map((game) => `game:${game.sourceGameId}`),
    ...context.evidence.players.map(
      (player) => `player:${player.sourcePlayerId}`,
    ),
    ...context.evidence.teamStats.map(
      (team) => `team:${team.sourceGameId}:${team.team}`,
    ),
    ...context.evidence.odds.map((market) => `odds:${market.marketId}`),
  ]);
}

function ensureEvidenceRefs(
  refs: readonly string[],
  context: CentralGenerationContext,
  field: string,
): void {
  const allowed = evidenceRefSet(context);
  for (const ref of refs) {
    if (!allowed.has(ref)) {
      structureError(`${field} referenced evidence that was not supplied`);
    }
  }
}

function knownPlayers(context: CentralGenerationContext): Set<string> {
  return new Set([
    ...context.evidence.players.map((player) => player.fullName),
    ...context.evidence.news.flatMap((item) =>
      item.playerRefs.flatMap((ref) => (ref.label ? [ref.label] : [])),
    ),
  ]);
}

function knownTeams(context: CentralGenerationContext): Set<string> {
  return new Set([
    ...context.evidence.games.flatMap((game) => [game.awayTeam, game.homeTeam]),
    ...context.evidence.players.map((player) => player.team),
    ...context.evidence.teamStats.flatMap((team) => [
      team.team,
      team.opponentTeam,
    ]),
    ...context.evidence.odds.flatMap((market) => [
      market.awayTeam,
      market.homeTeam,
    ]),
  ]);
}

function ensurePlayer(
  value: string | null,
  context: CentralGenerationContext,
  field: string,
): void {
  if (value && !knownPlayers(context).has(value)) {
    structureError(`${field} must reference a supplied player`);
  }
}

function suppliedPlayer(value: string, context: CentralGenerationContext) {
  return context.evidence.players.find((player) => player.fullName === value);
}

function suppliedGame(sourceGameId: string, context: CentralGenerationContext) {
  return context.evidence.games.find(
    (game) => game.sourceGameId === sourceGameId,
  );
}

function ensureRecordedPlayerOutcome(
  player: {
    fantasyPoints: number | null;
    player: string;
    team: string;
  },
  context: CentralGenerationContext,
  field: string,
): void {
  ensurePlayer(player.player, context, `${field}.player`);
  ensureTeam(player.team, context, `${field}.team`);
  const supplied = suppliedPlayer(player.player, context);
  if (
    supplied &&
    (player.team !== supplied.team ||
      (player.fantasyPoints !== null &&
        player.fantasyPoints !== supplied.fantasyPoints))
  ) {
    structureError(`${field} must preserve supplied player facts`);
  }
}

function ensureTeam(
  value: string | null,
  context: CentralGenerationContext,
  field: string,
): void {
  if (value && !knownTeams(context).has(value)) {
    structureError(`${field} must reference a supplied NFL team`);
  }
}

function validateSemanticGrounding(
  structure: CentralContentStructure,
  context: CentralGenerationContext,
): void {
  switch (structure.type) {
    case "central_wire_blurb": {
      if (structure.event) {
        const supplied = context.evidence.news.find(
          (item) => item.id === structure.event?.sourceItemId,
        );
        if (!supplied) {
          structureError("central_wire_blurb.event must use a supplied item");
        }
        if (
          structure.event.headline !== supplied.title ||
          structure.event.occurredAt !== supplied.publishedAt
        ) {
          structureError(
            "central_wire_blurb.event must preserve supplied event facts",
          );
        }
      }
      return;
    }
    case "central_rundown_report":
      for (const finding of structure.findings) {
        ensureEvidenceRefs(finding.evidenceRefs, context, "findings");
      }
      return;
    case "central_weekend_recap_mnf_projection":
      for (const game of structure.completedGames) {
        const supplied = suppliedGame(game.sourceGameId, context);
        if (
          !supplied ||
          game.awayTeam !== supplied.awayTeam ||
          game.homeTeam !== supplied.homeTeam ||
          game.awayScore !== supplied.awayScore ||
          game.homeScore !== supplied.homeScore
        ) {
          structureError("completedGames must preserve supplied game facts");
        }
        ensureTeam(game.awayTeam, context, "completedGames.awayTeam");
        ensureTeam(game.homeTeam, context, "completedGames.homeTeam");
        ensureEvidenceRefs(game.evidenceRefs, context, "completedGames");
        for (const player of game.fantasyStandouts) {
          ensureRecordedPlayerOutcome(player, context, "fantasyStandouts");
          ensureEvidenceRefs(player.evidenceRefs, context, "fantasyStandouts");
        }
      }
      if (structure.mnfProjection) {
        const supplied = suppliedGame(
          structure.mnfProjection.sourceGameId,
          context,
        );
        if (
          !supplied ||
          structure.mnfProjection.awayTeam !== supplied.awayTeam ||
          structure.mnfProjection.homeTeam !== supplied.homeTeam
        ) {
          structureError("mnfProjection must use a supplied game");
        }
        ensureTeam(
          structure.mnfProjection.awayTeam,
          context,
          "mnfProjection.awayTeam",
        );
        ensureTeam(
          structure.mnfProjection.homeTeam,
          context,
          "mnfProjection.homeTeam",
        );
        ensureEvidenceRefs(
          structure.mnfProjection.evidenceRefs,
          context,
          "mnfProjection",
        );
      }
      return;
    case "central_mnf_recap":
      if (structure.game) {
        const supplied = suppliedGame(structure.game.sourceGameId, context);
        if (
          !supplied ||
          supplied.status !== "final" ||
          structure.game.awayTeam !== supplied.awayTeam ||
          structure.game.homeTeam !== supplied.homeTeam ||
          structure.game.awayScore !== supplied.awayScore ||
          structure.game.homeScore !== supplied.homeScore
        ) {
          structureError("MNF recap must preserve a supplied final game");
        }
        ensureTeam(structure.game.awayTeam, context, "game.awayTeam");
        ensureTeam(structure.game.homeTeam, context, "game.homeTeam");
        ensureEvidenceRefs(structure.game.evidenceRefs, context, "game");
      }
      for (const player of structure.fantasyOutcomes) {
        ensureRecordedPlayerOutcome(player, context, "fantasyOutcomes");
        ensureEvidenceRefs(player.evidenceRefs, context, "fantasyOutcomes");
      }
      return;
    case "central_pre_waiver":
      for (const player of structure.recommendations) {
        ensurePlayer(player.player, context, "recommendations.player");
        ensureTeam(player.team, context, "recommendations.team");
        ensureEvidenceRefs(player.evidenceRefs, context, "recommendations");
        const supplied = suppliedPlayer(player.player, context);
        if (
          !supplied ||
          player.position !== supplied.position ||
          player.team !== supplied.team ||
          player.rosterAvailabilityPercent !== null ||
          player.recommendedBidPercent !== null
        ) {
          structureError(
            "pre-waiver recommendations must preserve supplied facts and nullable unavailable fields",
          );
        }
      }
      return;
    case "central_post_waiver":
      if (!structure.outcomesAvailable && structure.processedOutcomes.length) {
        structureError(
          "processed waiver outcomes require supplied outcome availability",
        );
      }
      for (const player of [
        ...structure.processedOutcomes,
        ...structure.fallbackTargets,
      ]) {
        ensurePlayer(player.player, context, "waiver player");
        ensureTeam(player.team, context, "waiver team");
        ensureEvidenceRefs(player.evidenceRefs, context, "waiver evidence");
        if (player.rosterAvailabilityPercent !== null) {
          structureError(
            "post-waiver roster availability must remain null without an availability source",
          );
        }
      }
      for (const player of structure.fallbackTargets) {
        const supplied = suppliedPlayer(player.player, context);
        if (
          !supplied ||
          player.position !== supplied.position ||
          player.team !== supplied.team ||
          player.recommendedBidPercent !== null
        ) {
          structureError(
            "post-waiver fallback targets must preserve supplied player facts",
          );
        }
      }
      return;
    case "central_matchups":
      for (const matchup of structure.matchups) {
        const supplied = suppliedGame(matchup.sourceGameId, context);
        if (
          !supplied ||
          matchup.awayTeam !== supplied.awayTeam ||
          matchup.homeTeam !== supplied.homeTeam ||
          matchup.gameTime !== supplied.gameTime ||
          matchup.status !== supplied.status
        ) {
          structureError("matchups must preserve supplied schedule facts");
        }
        ensureTeam(matchup.awayTeam, context, "matchups.awayTeam");
        ensureTeam(matchup.homeTeam, context, "matchups.homeTeam");
        ensureEvidenceRefs(matchup.evidenceRefs, context, "matchups");
        for (const player of matchup.playerAngles) {
          ensureRecordedPlayerOutcome(player, context, "playerAngles");
          ensureEvidenceRefs(player.evidenceRefs, context, "playerAngles");
        }
        if (matchup.marketLine !== null) {
          const citedOdds = context.evidence.odds.find(
            (market) =>
              matchup.evidenceRefs.includes(`odds:${market.marketId}`) &&
              market.line === matchup.marketLine,
          );
          if (!citedOdds) {
            structureError("matchup marketLine must match cited supplied odds");
          }
        }
      }
      return;
    case "central_rankings_projections":
      structure.rankings.forEach((player, index) => {
        if (player.rank !== index + 1) {
          structureError("rankings must be ordered sequentially from 1");
        }
        ensurePlayer(player.player, context, "rankings.player");
        ensureTeam(player.team, context, "rankings.team");
        ensureEvidenceRefs(player.evidenceRefs, context, "rankings");
        const supplied = suppliedPlayer(player.player, context);
        if (
          !supplied ||
          player.position !== supplied.position ||
          player.team !== supplied.team ||
          (player.recentFantasyPoints !== null &&
            player.recentFantasyPoints !== supplied.fantasyPoints)
        ) {
          structureError("rankings must preserve supplied player facts");
        }
      });
      return;
    case "central_start_sit":
      for (const player of structure.recommendations) {
        ensurePlayer(player.player, context, "recommendations.player");
        ensureTeam(player.team, context, "recommendations.team");
        ensureEvidenceRefs(player.evidenceRefs, context, "recommendations");
        const supplied = suppliedPlayer(player.player, context);
        if (
          !supplied ||
          player.position !== supplied.position ||
          player.team !== supplied.team ||
          player.projectedPoints !== null
        ) {
          structureError(
            "start/sit must preserve supplied facts and null unavailable projections",
          );
        }
      }
      return;
    case "central_injuries":
      for (const update of structure.updates) {
        if (
          !context.evidence.news.some((item) => item.id === update.sourceItemId)
        ) {
          structureError("injury update must use a supplied news item");
        }
        ensurePlayer(update.player, context, "updates.player");
        ensureTeam(update.team, context, "updates.team");
        ensureEvidenceRefs(update.evidenceRefs, context, "updates");
        const supplied = update.player
          ? suppliedPlayer(update.player, context)
          : null;
        if (
          update.status !== null ||
          (supplied && update.team !== supplied.team)
        ) {
          structureError(
            "injury status must remain nullable and player teams must preserve supplied facts",
          );
        }
        for (const replacement of update.replacementOptions) {
          ensurePlayer(replacement, context, "updates.replacementOptions");
        }
      }
  }
}

export function centralContentTypePromptContract(
  contentType: CentralColumnContentType,
): CentralContentTypeTemplate {
  return CENTRAL_CONTENT_TYPE_TEMPLATES[contentType];
}

export function validateCentralContentStructure({
  contentType,
  context,
  structure,
}: {
  contentType: CentralColumnContentType;
  context: CentralGenerationContext;
  structure: unknown;
}): CentralContentStructure {
  const parsed =
    CENTRAL_CONTENT_STRUCTURE_SCHEMAS[contentType].safeParse(structure);
  if (!parsed.success) {
    structureError(
      "central content structure did not match its configured format",
      parsed.error,
    );
  }
  const normalized = parsed.data as CentralContentStructure;
  validateSemanticGrounding(normalized, context);
  return normalized;
}
