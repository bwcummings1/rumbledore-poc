import { and, desc, eq } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  aiPersonaToneHistory,
  editorialActions,
  fantasyTeams,
  leagues,
  type NewEditorialAction,
} from "@/db/schema";
import type { FantasyProviderId } from "@/providers";
import type {
  BlogDraftBodyBlock,
  LeagueBlogContext,
  LeagueContextTeam,
  LeaguePersonaCard,
} from "./interfaces";
import { MockLlmClient } from "./mocks";
import {
  AI_PERSONAS,
  type AiPersona,
  DEFAULT_PERSONA_CARDS,
  DEFAULT_TONE_PROFILES,
  normalizeToneProfile,
  type ToneProfile,
} from "./personas";
import { buildPromptParts } from "./pipeline";

const MAX_TONE_REASON_LENGTH = 500;
type PersonaToneHistorySource = "edit" | "rollback" | "seed";

type PersonaCardRow = Omit<LeaguePersonaCard, "toneProfile"> & {
  toneProfile: unknown;
};

interface LeagueRow {
  currentScoringPeriod: number;
  id: string;
  name: string;
  provider: FantasyProviderId;
  providerLeagueId: string;
  scoringType: string;
  season: number;
  status: string;
}

export interface PersonaToneHistoryEntry {
  id: string;
  persona: AiPersona;
  reason: string;
  source: PersonaToneHistorySource;
  sourceToneVersion: number | null;
  toneProfile: ToneProfile;
  toneUpdatedAt: string;
  toneUpdatedBy: string | null;
  toneVersion: number;
}

export interface PersonaToneEditorCard {
  beat: string;
  enabled: boolean;
  history: PersonaToneHistoryEntry[];
  id: string | null;
  name: string;
  performsWhen: string[];
  persona: AiPersona;
  pointOfView: string;
  promptTemplate: string;
  purpose: string;
  tone: string;
  toneProfile: ToneProfile;
  toneUpdatedAt: string | null;
  toneUpdatedBy: string | null;
  toneVersion: number;
}

export interface LeagueToneProfileEditorData {
  cards: PersonaToneEditorCard[];
  league: {
    id: string;
    name: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    season: number;
  };
}

export type LeagueToneProfileEditorLoadResult =
  | { status: "ready"; data: LeagueToneProfileEditorData }
  | { status: "not_found" };

export interface PersonaToneMutationDeps {
  db: Db;
  now?: () => Date;
}

export interface EditPersonaToneProfileInput {
  actorUserId: string | null;
  expectedToneVersion?: number;
  leagueId: string;
  persona: AiPersona;
  reason?: string;
  toneProfile: unknown;
}

export interface RollbackPersonaToneProfileInput {
  actorUserId: string | null;
  leagueId: string;
  persona: AiPersona;
  reason?: string;
  toneVersion: number;
}

export interface PersonaToneMutationResult {
  actionId: string;
  card: PersonaToneEditorCard;
  previousToneVersion: number;
  status: "changed";
}

export interface PreviewPersonaToneProfileInput {
  leagueId: string;
  persona: AiPersona;
  toneProfile?: unknown;
}

export interface PersonaTonePreviewResult {
  body: string;
  promptSectionNames: string[];
  sampleParagraph: string;
  title: string;
  toneVersion: number;
}

function cleanReason(value: string | undefined): string {
  const reason = (value ?? "").replace(/\s+/g, " ").trim();
  if (reason.length > MAX_TONE_REASON_LENGTH) {
    throw new AppError({
      code: "PERSONA_TONE_REASON_TOO_LONG",
      message: "Tone editor reasons must be 500 characters or fewer",
      status: 400,
    });
  }
  return reason;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeGuardrails(
  current: ToneProfile["guardrails"],
  raw: unknown,
): ToneProfile["guardrails"] {
  return isRecord(raw) ? { ...current, ...raw } : current;
}

function mergeToneProfileInput(
  current: ToneProfile,
  persona: AiPersona,
  value: unknown,
): ToneProfile {
  if (!isRecord(value)) {
    return normalizeToneProfile(current, persona);
  }

  return normalizeToneProfile(
    {
      ...current,
      ...value,
      guardrails: mergeGuardrails(current.guardrails, value.guardrails),
    },
    persona,
  );
}

function personaCardFromRow(row: PersonaCardRow): LeaguePersonaCard {
  return {
    ...row,
    toneProfile: normalizeToneProfile(row.toneProfile, row.persona),
  };
}

function defaultPersonaCard(persona: AiPersona): LeaguePersonaCard {
  const defaults = DEFAULT_PERSONA_CARDS[persona];
  return {
    enabled: defaults.enabled,
    beat: defaults.beat,
    id: "",
    maxWords: defaults.maxWords,
    minWords: defaults.minWords,
    name: defaults.name,
    performsWhen: defaults.performsWhen,
    persona,
    pointOfView: defaults.pointOfView,
    promptTemplate: defaults.promptTemplate,
    purpose: defaults.purpose,
    tone: defaults.tone,
    toneProfile: DEFAULT_TONE_PROFILES[persona],
    toneUpdatedAt: new Date(0),
    toneUpdatedBy: null,
    toneVersion: defaults.toneVersion,
  };
}

function selectPersonaCardFields(table = aiPersonaCards) {
  return {
    enabled: table.enabled,
    beat: table.beat,
    id: table.id,
    maxWords: table.maxWords,
    minWords: table.minWords,
    name: table.name,
    performsWhen: table.performsWhen,
    persona: table.persona,
    pointOfView: table.pointOfView,
    promptTemplate: table.promptTemplate,
    purpose: table.purpose,
    tone: table.tone,
    toneProfile: table.toneProfile,
    toneUpdatedAt: table.toneUpdatedAt,
    toneUpdatedBy: table.toneUpdatedBy,
    toneVersion: table.toneVersion,
  };
}

async function loadLeague(db: Db, leagueId: string): Promise<LeagueRow | null> {
  const [league] = await db
    .select({
      currentScoringPeriod: leagues.currentScoringPeriod,
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      scoringType: leagues.scoringType,
      season: leagues.season,
      status: leagues.status,
    })
    .from(leagues)
    .where(eq(leagues.id, leagueId))
    .limit(1);

  return league ?? null;
}

async function loadPersonaCard(
  tx: LeagueScopedTx,
  input: { leagueId: string; persona: AiPersona },
): Promise<LeaguePersonaCard | null> {
  const [row] = await tx
    .select(selectPersonaCardFields())
    .from(aiPersonaCards)
    .where(
      and(
        eq(aiPersonaCards.leagueId, input.leagueId),
        eq(aiPersonaCards.persona, input.persona),
      ),
    )
    .limit(1);

  return row ? personaCardFromRow(row) : null;
}

async function getOrCreatePersonaCard(
  tx: LeagueScopedTx,
  input: { leagueId: string; persona: AiPersona },
): Promise<LeaguePersonaCard> {
  const defaults = DEFAULT_PERSONA_CARDS[input.persona];
  const [inserted] = await tx
    .insert(aiPersonaCards)
    .values({
      enabled: defaults.enabled,
      beat: defaults.beat,
      leagueId: input.leagueId,
      maxWords: defaults.maxWords,
      minWords: defaults.minWords,
      name: defaults.name,
      performsWhen: defaults.performsWhen,
      persona: input.persona,
      pointOfView: defaults.pointOfView,
      promptTemplate: defaults.promptTemplate,
      purpose: defaults.purpose,
      tone: defaults.tone,
      toneProfile: defaults.toneProfile,
      toneVersion: defaults.toneVersion,
      triggerConfig: defaults.triggerConfig,
    })
    .onConflictDoNothing({
      target: [aiPersonaCards.leagueId, aiPersonaCards.persona],
    })
    .returning(selectPersonaCardFields());

  if (inserted) {
    return personaCardFromRow(inserted);
  }

  const existing = await loadPersonaCard(tx, input);
  if (!existing) {
    throw new AppError({
      code: "PERSONA_TONE_CARD_MISSING",
      message: "Persona card could not be loaded",
      status: 500,
    });
  }
  return existing;
}

async function insertHistoryVersion(
  tx: LeagueScopedTx,
  input: {
    card: LeaguePersonaCard;
    leagueId: string;
    reason: string;
    source: PersonaToneHistorySource;
    sourceToneVersion?: number | null;
    toneUpdatedAt: Date;
    toneUpdatedBy: string | null;
  },
): Promise<string> {
  const [inserted] = await tx
    .insert(aiPersonaToneHistory)
    .values({
      leagueId: input.leagueId,
      persona: input.card.persona,
      personaCardId: input.card.id,
      reason: input.reason,
      source: input.source,
      sourceToneVersion: input.sourceToneVersion ?? null,
      toneProfile: input.card.toneProfile,
      toneUpdatedAt: input.toneUpdatedAt,
      toneUpdatedBy: input.toneUpdatedBy,
      toneVersion: input.card.toneVersion,
    })
    .onConflictDoNothing({
      target: [
        aiPersonaToneHistory.leagueId,
        aiPersonaToneHistory.persona,
        aiPersonaToneHistory.toneVersion,
      ],
    })
    .returning({ id: aiPersonaToneHistory.id });

  if (inserted) {
    return inserted.id;
  }

  const [existing] = await tx
    .select({ id: aiPersonaToneHistory.id })
    .from(aiPersonaToneHistory)
    .where(
      and(
        eq(aiPersonaToneHistory.leagueId, input.leagueId),
        eq(aiPersonaToneHistory.persona, input.card.persona),
        eq(aiPersonaToneHistory.toneVersion, input.card.toneVersion),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new AppError({
      code: "PERSONA_TONE_HISTORY_NOT_RECORDED",
      message: "Persona tone history could not be recorded",
      status: 500,
    });
  }
  return existing.id;
}

async function insertEditorialAction(
  tx: LeagueScopedTx,
  values: NewEditorialAction,
): Promise<string> {
  const [row] = await tx
    .insert(editorialActions)
    .values(values)
    .returning({ id: editorialActions.id });
  if (!row) {
    throw new AppError({
      code: "EDITORIAL_ACTION_NOT_RECORDED",
      message: "Editorial action could not be recorded",
      status: 500,
    });
  }
  return row.id;
}

function toEditorCard(
  card: LeaguePersonaCard,
  history: readonly PersonaToneHistoryEntry[],
): PersonaToneEditorCard {
  return {
    beat: card.beat,
    enabled: card.enabled,
    history: [...history],
    id: card.id || null,
    name: card.name,
    performsWhen: card.performsWhen,
    persona: card.persona,
    pointOfView: card.pointOfView,
    promptTemplate: card.promptTemplate,
    purpose: card.purpose,
    tone: card.tone,
    toneProfile: card.toneProfile,
    toneUpdatedAt:
      card.toneUpdatedAt.getTime() > 0
        ? card.toneUpdatedAt.toISOString()
        : null,
    toneUpdatedBy: card.toneUpdatedBy,
    toneVersion: card.toneVersion,
  };
}

function historyEntryFromRow(row: {
  id: string;
  persona: AiPersona;
  reason: string;
  source: string;
  sourceToneVersion: number | null;
  toneProfile: unknown;
  toneUpdatedAt: Date;
  toneUpdatedBy: string | null;
  toneVersion: number;
}): PersonaToneHistoryEntry {
  const source: PersonaToneHistorySource =
    row.source === "rollback" || row.source === "seed" ? row.source : "edit";
  return {
    id: row.id,
    persona: row.persona,
    reason: row.reason,
    source,
    sourceToneVersion: row.sourceToneVersion,
    toneProfile: normalizeToneProfile(row.toneProfile, row.persona),
    toneUpdatedAt: row.toneUpdatedAt.toISOString(),
    toneUpdatedBy: row.toneUpdatedBy,
    toneVersion: row.toneVersion,
  };
}

export async function getLeagueToneProfileEditorData(
  db: Db,
  input: { leagueId: string },
): Promise<LeagueToneProfileEditorLoadResult> {
  const league = await loadLeague(db, input.leagueId);
  if (!league) {
    return { status: "not_found" };
  }

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const cardRows = await tx
      .select(selectPersonaCardFields())
      .from(aiPersonaCards)
      .where(eq(aiPersonaCards.leagueId, input.leagueId));

    const historyRows = await tx
      .select({
        id: aiPersonaToneHistory.id,
        persona: aiPersonaToneHistory.persona,
        reason: aiPersonaToneHistory.reason,
        source: aiPersonaToneHistory.source,
        sourceToneVersion: aiPersonaToneHistory.sourceToneVersion,
        toneProfile: aiPersonaToneHistory.toneProfile,
        toneUpdatedAt: aiPersonaToneHistory.toneUpdatedAt,
        toneUpdatedBy: aiPersonaToneHistory.toneUpdatedBy,
        toneVersion: aiPersonaToneHistory.toneVersion,
      })
      .from(aiPersonaToneHistory)
      .where(eq(aiPersonaToneHistory.leagueId, input.leagueId))
      .orderBy(
        desc(aiPersonaToneHistory.toneVersion),
        desc(aiPersonaToneHistory.createdAt),
      );

    return { cardRows, historyRows };
  });

  const rowsByPersona = new Map(
    scoped.cardRows.map((row) => [row.persona, personaCardFromRow(row)]),
  );
  const historyByPersona = scoped.historyRows.reduce((groups, row) => {
    const entries = groups.get(row.persona) ?? [];
    entries.push(historyEntryFromRow(row));
    groups.set(row.persona, entries);
    return groups;
  }, new Map<AiPersona, PersonaToneHistoryEntry[]>());

  return {
    status: "ready",
    data: {
      cards: AI_PERSONAS.map((persona) =>
        toEditorCard(
          rowsByPersona.get(persona) ?? defaultPersonaCard(persona),
          historyByPersona.get(persona) ?? [],
        ),
      ),
      league: {
        id: league.id,
        name: league.name,
        provider: league.provider,
        providerLeagueId: league.providerLeagueId,
        season: league.season,
      },
    },
  };
}

export async function editPersonaToneProfile(
  deps: PersonaToneMutationDeps,
  input: EditPersonaToneProfileInput,
): Promise<PersonaToneMutationResult> {
  const reason = cleanReason(input.reason);
  const now = deps.now?.() ?? new Date();

  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const current = await getOrCreatePersonaCard(tx, input);
    if (
      input.expectedToneVersion !== undefined &&
      input.expectedToneVersion !== current.toneVersion
    ) {
      throw new AppError({
        code: "PERSONA_TONE_VERSION_CONFLICT",
        message: "Persona tone changed before this edit could be saved",
        status: 409,
      });
    }
    await insertHistoryVersion(tx, {
      card: current,
      leagueId: input.leagueId,
      reason: "Snapshot before tone edit.",
      source: "seed",
      toneUpdatedAt: current.toneUpdatedAt,
      toneUpdatedBy: current.toneUpdatedBy,
    });

    const nextProfile = mergeToneProfileInput(
      current.toneProfile,
      input.persona,
      input.toneProfile,
    );
    const nextVersion = current.toneVersion + 1;

    const [updated] = await tx
      .update(aiPersonaCards)
      .set({
        pointOfView: nextProfile.pointOfView,
        toneProfile: nextProfile,
        toneUpdatedAt: now,
        toneUpdatedBy: input.actorUserId,
        toneVersion: nextVersion,
      })
      .where(
        and(
          eq(aiPersonaCards.leagueId, input.leagueId),
          eq(aiPersonaCards.persona, input.persona),
          eq(aiPersonaCards.toneVersion, current.toneVersion),
        ),
      )
      .returning(selectPersonaCardFields());

    if (!updated) {
      const raced = await loadPersonaCard(tx, input);
      if (raced) {
        throw new AppError({
          code: "PERSONA_TONE_VERSION_CONFLICT",
          message: "Persona tone changed before this edit could be saved",
          status: 409,
        });
      }
      throw new AppError({
        code: "PERSONA_TONE_CARD_MISSING",
        message: "Persona card could not be updated",
        status: 404,
      });
    }
    const updatedCard = personaCardFromRow(updated);

    await insertHistoryVersion(tx, {
      card: updatedCard,
      leagueId: input.leagueId,
      reason,
      source: "edit",
      toneUpdatedAt: now,
      toneUpdatedBy: input.actorUserId,
    });

    const actionId = await insertEditorialAction(tx, {
      action: "tone_edit",
      actorUserId: input.actorUserId,
      leagueId: input.leagueId,
      metadata: {
        afterToneVersion: nextVersion,
        beforeToneVersion: current.toneVersion,
        persona: input.persona,
      },
      reason,
      targetPersonaCardId: updatedCard.id,
    });

    return {
      actionId,
      card: toEditorCard(updatedCard, []),
      previousToneVersion: current.toneVersion,
      status: "changed",
    };
  });
}

export async function rollbackPersonaToneProfile(
  deps: PersonaToneMutationDeps,
  input: RollbackPersonaToneProfileInput,
): Promise<PersonaToneMutationResult> {
  const reason = cleanReason(input.reason);
  const now = deps.now?.() ?? new Date();

  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const current = await getOrCreatePersonaCard(tx, input);
    if (input.toneVersion >= current.toneVersion) {
      throw new AppError({
        code: "PERSONA_TONE_ROLLBACK_TARGET_INVALID",
        message: "Rollback target must be an earlier tone version",
        status: 409,
      });
    }

    const [target] = await tx
      .select({
        id: aiPersonaToneHistory.id,
        toneProfile: aiPersonaToneHistory.toneProfile,
        toneVersion: aiPersonaToneHistory.toneVersion,
      })
      .from(aiPersonaToneHistory)
      .where(
        and(
          eq(aiPersonaToneHistory.leagueId, input.leagueId),
          eq(aiPersonaToneHistory.persona, input.persona),
          eq(aiPersonaToneHistory.toneVersion, input.toneVersion),
        ),
      )
      .limit(1);

    if (!target) {
      throw new AppError({
        code: "PERSONA_TONE_HISTORY_NOT_FOUND",
        message: "Rollback target tone version could not be found",
        status: 404,
      });
    }

    await insertHistoryVersion(tx, {
      card: current,
      leagueId: input.leagueId,
      reason: "Snapshot before tone rollback.",
      source: "seed",
      toneUpdatedAt: current.toneUpdatedAt,
      toneUpdatedBy: current.toneUpdatedBy,
    });

    const rollbackProfile = mergeToneProfileInput(
      current.toneProfile,
      input.persona,
      target.toneProfile,
    );
    const nextVersion = current.toneVersion + 1;
    const [updated] = await tx
      .update(aiPersonaCards)
      .set({
        pointOfView: rollbackProfile.pointOfView,
        toneProfile: rollbackProfile,
        toneUpdatedAt: now,
        toneUpdatedBy: input.actorUserId,
        toneVersion: nextVersion,
      })
      .where(
        and(
          eq(aiPersonaCards.leagueId, input.leagueId),
          eq(aiPersonaCards.persona, input.persona),
          eq(aiPersonaCards.toneVersion, current.toneVersion),
        ),
      )
      .returning(selectPersonaCardFields());

    if (!updated) {
      const raced = await loadPersonaCard(tx, input);
      if (raced) {
        throw new AppError({
          code: "PERSONA_TONE_VERSION_CONFLICT",
          message: "Persona tone changed before this rollback could be saved",
          status: 409,
        });
      }
      throw new AppError({
        code: "PERSONA_TONE_CARD_MISSING",
        message: "Persona card could not be updated",
        status: 404,
      });
    }
    const updatedCard = personaCardFromRow(updated);

    await insertHistoryVersion(tx, {
      card: updatedCard,
      leagueId: input.leagueId,
      reason,
      source: "rollback",
      sourceToneVersion: target.toneVersion,
      toneUpdatedAt: now,
      toneUpdatedBy: input.actorUserId,
    });

    const actionId = await insertEditorialAction(tx, {
      action: "tone_rollback",
      actorUserId: input.actorUserId,
      leagueId: input.leagueId,
      metadata: {
        afterToneVersion: nextVersion,
        beforeToneVersion: current.toneVersion,
        persona: input.persona,
        rollbackFromToneVersion: target.toneVersion,
      },
      reason,
      targetPersonaCardId: updatedCard.id,
    });

    return {
      actionId,
      card: toEditorCard(updatedCard, []),
      previousToneVersion: current.toneVersion,
      status: "changed",
    };
  });
}

function previewSampleParagraph(blocks: readonly BlogDraftBodyBlock[]) {
  const toneParagraph = blocks.find(
    (block) =>
      block.type === "paragraph" && block.text.includes("Tone profile"),
  );
  if (toneParagraph?.type === "paragraph") {
    return toneParagraph.text;
  }
  const paragraph = blocks.find((block) => block.type === "paragraph");
  if (paragraph?.type === "paragraph") {
    return paragraph.text;
  }
  const heading = blocks.find((block) => block.type === "heading");
  return heading?.type === "heading" ? heading.text : "";
}

async function loadPreviewTeams(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<LeagueContextTeam[]> {
  const rows = await tx
    .select({
      losses: fantasyTeams.losses,
      name: fantasyTeams.name,
      ownerMemberIds: fantasyTeams.ownerMemberIds,
      pointsAgainst: fantasyTeams.pointsAgainst,
      pointsFor: fantasyTeams.pointsFor,
      ties: fantasyTeams.ties,
      wins: fantasyTeams.wins,
    })
    .from(fantasyTeams)
    .where(eq(fantasyTeams.leagueId, leagueId))
    .limit(6);

  return rows.map((row) => ({
    losses: row.losses,
    managerNames:
      row.ownerMemberIds.length > 0 ? row.ownerMemberIds : [row.name],
    name: row.name,
    pointsAgainst: Number(row.pointsAgainst),
    pointsFor: Number(row.pointsFor),
    ties: row.ties,
    wins: row.wins,
  }));
}

function emptyArena(): LeagueBlogContext["arena"] {
  return {
    computedAt: null,
    fieldLeader: null,
    headToHead: null,
    leagueStanding: null,
    movers: { fallers: [], risers: [] },
    season: null,
    topLeagueStandings: [],
  };
}

function emptyTrigger(): LeagueBlogContext["trigger"] {
  return {
    cadence: null,
    correction: null,
    instigation: null,
    loreClaim: null,
    poll: null,
  };
}

function buildPreviewContext(input: {
  card: LeaguePersonaCard;
  league: LeagueRow;
  teams: LeagueContextTeam[];
}): LeagueBlogContext {
  return {
    arena: emptyArena(),
    authenticity: {
      canonLore: [],
      entityTokens: input.teams.flatMap((team) => [
        team.name,
        ...team.managerNames,
      ]),
      lore: { canon: [], disputed: [], pending: [], refuted: [] },
      people: [],
      rivalries: [],
      roastConsent: { full_send: [], light: [], off_limits: [] },
    },
    league: {
      currentScoringPeriod: input.league.currentScoringPeriod,
      id: input.league.id,
      name: input.league.name,
      providerLeagueId: input.league.providerLeagueId,
      scoringType: input.league.scoringType,
      season: input.league.season,
      status: input.league.status,
    },
    generalNfl: {
      boundary: "general_nfl_context_not_league_canon",
      facts: [],
      source: null,
    },
    memory: [],
    persona: input.card,
    priorPosts: [],
    preGenerationContext: null,
    records: [],
    teams: input.teams,
    trigger: emptyTrigger(),
  };
}

export async function previewPersonaToneProfile(
  deps: Pick<PersonaToneMutationDeps, "db">,
  input: PreviewPersonaToneProfileInput,
): Promise<PersonaTonePreviewResult> {
  const league = await loadLeague(deps.db, input.leagueId);
  if (!league) {
    throw new AppError({
      code: "PERSONA_TONE_LEAGUE_NOT_FOUND",
      message: "League could not be found",
      status: 404,
    });
  }

  const { card, teams } = await withLeagueContext(
    deps.db,
    input.leagueId,
    async (tx) => {
      const existing =
        (await loadPersonaCard(tx, input)) ?? defaultPersonaCard(input.persona);
      return {
        card: existing,
        teams: await loadPreviewTeams(tx, input.leagueId),
      };
    },
  );
  const nextProfile = mergeToneProfileInput(
    card.toneProfile,
    input.persona,
    input.toneProfile ?? card.toneProfile,
  );
  const previewCard: LeaguePersonaCard = {
    ...card,
    pointOfView: nextProfile.pointOfView,
    toneProfile: nextProfile,
    toneVersion: card.toneVersion + 1,
  };
  const context = buildPreviewContext({ card: previewCard, league, teams });
  const prompt = buildPromptParts({
    contentType: "weekly_recap",
    context,
    newsItems: [],
    triggerKey: `tone-preview:${input.persona}`,
  });
  const llm = new MockLlmClient();
  const draft = await llm.generate({
    attempt: 1,
    contentType: "weekly_recap",
    context,
    newsItems: [],
    persona: input.persona,
    prompt,
  });

  return {
    body: draft.body,
    promptSectionNames: prompt.promptSectionNames ?? [],
    sampleParagraph: previewSampleParagraph(draft.bodyBlocks),
    title: draft.title,
    toneVersion: previewCard.toneVersion,
  };
}
