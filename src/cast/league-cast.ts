import { and, desc, eq } from "drizzle-orm";
import {
  AI_PERSONAS,
  type AiPersona,
  DEFAULT_PERSONA_CARDS,
} from "@/ai/personas";
import { contentItemIsPublished } from "@/content/lifecycle";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  contentItems,
  leagues,
  type Member,
  members,
} from "@/db/schema";
import { articleDek } from "@/news/article-metadata";
import {
  type LeaguePublicationSectionId,
  type PublicationSection,
  resolveLeaguePublicationSection,
} from "@/news/sections";
import type { FantasyProviderId } from "@/providers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LeagueCastPersonaCard {
  beat: string;
  enabled: boolean;
  id: string | null;
  name: string;
  performsWhen: string[];
  persona: AiPersona;
  pointOfView: string;
  recentOutputCount: number;
  tone: string;
}

export interface LeagueCastInsight {
  beat: string;
  chip: {
    label: string;
    tone: "default" | "negative" | "positive" | "value";
    value: string;
  } | null;
  claim: string;
  href: string;
  id: string;
  name: string;
  persona: AiPersona;
  publishedAt: string;
  section: PublicationSection<LeaguePublicationSectionId>;
  summary: string;
  title: string;
}

type LeagueCastInsightChip = NonNullable<LeagueCastInsight["chip"]>;

export interface LeagueCastTurn {
  beat: string;
  href: string;
  id: string;
  message: string;
  name: string;
  persona: AiPersona;
  publishedAt: string;
}

export interface LeagueCastPresenceData {
  league: {
    id: string;
    name: string;
    provider: FantasyProviderId;
    providerLeagueId: string;
    season: number;
  };
  insights: LeagueCastInsight[];
  personas: LeagueCastPersonaCard[];
  turns: LeagueCastTurn[];
  userRole: Member["role"];
}

export type LeagueCastPresenceLoadResult =
  | { status: "ready"; data: LeagueCastPresenceData }
  | { status: "not_found" }
  | { status: "forbidden" };

type PersonaCardRow = Pick<
  typeof aiPersonaCards.$inferSelect,
  | "beat"
  | "enabled"
  | "id"
  | "name"
  | "performsWhen"
  | "persona"
  | "pointOfView"
  | "tone"
>;

type CastContentRow = Pick<
  typeof contentItems.$inferSelect,
  "authorPersona" | "id" | "metadata" | "publishedAt" | "summary" | "title"
>;

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function articleStructure(metadata: Record<string, unknown>) {
  const direct = metadataRecord(metadata.structure);
  if (metadataText(direct.type)) {
    return direct;
  }

  const article = metadataRecord(metadata.article);
  const nested = metadataRecord(article.structure);
  return metadataText(nested.type) ? nested : {};
}

function cleanCardString(value: string | null | undefined, fallback: string) {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function cleanPerformsWhen(
  value: readonly string[] | null | undefined,
  fallback: readonly string[],
) {
  const cleaned = (value ?? [])
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : [...fallback];
}

function contentTypeLabel(metadata: Record<string, unknown>): string {
  const direct = metadataText(metadata.content_type);
  const structure = articleStructure(metadata);
  const structured = metadataText(structure.type);
  const value = direct || structured;
  return value
    ? value
        .replaceAll("_", " ")
        .replace(/\b\w/gu, (letter) => letter.toUpperCase())
    : "";
}

function chipTone(persona: AiPersona): LeagueCastInsightChip["tone"] {
  switch (persona) {
    case "betting_advisor":
      return "value";
    case "trash_talker":
      return "negative";
    case "commissioner":
    case "narrator":
      return "positive";
    case "analyst":
    case "beat_reporter":
      return "default";
  }
}

function buildPersonaCards(
  rows: readonly PersonaCardRow[],
  recentOutputCounts: ReadonlyMap<AiPersona, number>,
): LeagueCastPersonaCard[] {
  const rowsByPersona = new Map(rows.map((row) => [row.persona, row]));

  return AI_PERSONAS.map((persona) => {
    const defaults = DEFAULT_PERSONA_CARDS[persona];
    const row = rowsByPersona.get(persona);

    return {
      beat: cleanCardString(row?.beat, defaults.beat),
      enabled: row?.enabled ?? defaults.enabled,
      id: row?.id ?? null,
      name: cleanCardString(row?.name, defaults.name),
      performsWhen: cleanPerformsWhen(row?.performsWhen, defaults.performsWhen),
      persona,
      pointOfView: cleanCardString(row?.pointOfView, defaults.pointOfView),
      recentOutputCount: recentOutputCounts.get(persona) ?? 0,
      tone: cleanCardString(row?.tone, defaults.tone),
    };
  });
}

function personaById(personas: readonly LeagueCastPersonaCard[]) {
  return new Map(personas.map((persona) => [persona.persona, persona]));
}

function buildInsights(
  leagueId: string,
  rows: readonly CastContentRow[],
  personas: readonly LeagueCastPersonaCard[],
): LeagueCastInsight[] {
  const byPersona = personaById(personas);

  return rows.flatMap((row) => {
    if (!row.authorPersona) {
      return [];
    }

    const persona = byPersona.get(row.authorPersona);
    if (!persona) {
      return [];
    }

    const metadata = row.metadata;
    const section = resolveLeaguePublicationSection({
      authorPersona: row.authorPersona,
      kind: "blog",
      metadata,
      summary: row.summary,
      title: row.title,
    });
    const chipValue = contentTypeLabel(metadata) || section.label;

    return [
      {
        beat: persona.beat,
        chip: chipValue
          ? {
              label: "Read",
              tone: chipTone(row.authorPersona),
              value: chipValue,
            }
          : null,
        claim: row.title,
        href: `/leagues/${leagueId}/press/${row.id}`,
        id: row.id,
        name: persona.name,
        persona: row.authorPersona,
        publishedAt: row.publishedAt.toISOString(),
        section,
        summary: articleDek(metadata, row.summary),
        title: row.title,
      },
    ];
  });
}

function buildTurns(
  leagueId: string,
  rows: readonly CastContentRow[],
  personas: readonly LeagueCastPersonaCard[],
): LeagueCastTurn[] {
  const byPersona = personaById(personas);

  return rows.flatMap((row) => {
    if (!row.authorPersona) {
      return [];
    }

    const persona = byPersona.get(row.authorPersona);
    if (!persona) {
      return [];
    }

    const summary = row.summary.replace(/\s+/g, " ").trim();

    return [
      {
        beat: persona.beat,
        href: `/leagues/${leagueId}/press/${row.id}`,
        id: row.id,
        message: summary || row.title,
        name: persona.name,
        persona: row.authorPersona,
        publishedAt: row.publishedAt.toISOString(),
      },
    ];
  });
}

export async function getLeagueCastPresenceData(
  db: Db,
  input: {
    leagueId: string;
    userId: string;
    userRole?: Member["role"];
  },
): Promise<LeagueCastPresenceLoadResult> {
  if (!UUID_RE.test(input.leagueId)) {
    return { status: "not_found" };
  }

  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const userRole =
    input.userRole ??
    (
      await db
        .select({ role: members.role })
        .from(members)
        .where(
          and(
            eq(members.organizationId, input.leagueId),
            eq(members.userId, input.userId),
          ),
        )
        .limit(1)
    )[0]?.role;

  if (!userRole) {
    return { status: "forbidden" };
  }

  const scoped = await withLeagueContext(db, input.leagueId, async (tx) => {
    const cardRows = await tx
      .select({
        beat: aiPersonaCards.beat,
        enabled: aiPersonaCards.enabled,
        id: aiPersonaCards.id,
        name: aiPersonaCards.name,
        performsWhen: aiPersonaCards.performsWhen,
        persona: aiPersonaCards.persona,
        pointOfView: aiPersonaCards.pointOfView,
        tone: aiPersonaCards.tone,
      })
      .from(aiPersonaCards)
      .where(eq(aiPersonaCards.leagueId, input.leagueId));

    const contentRows = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        id: contentItems.id,
        metadata: contentItems.metadata,
        publishedAt: contentItems.publishedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.kind, "blog"),
          contentItemIsPublished(),
        ),
      )
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.createdAt))
      .limit(12);

    return {
      cardRows: cardRows satisfies PersonaCardRow[],
      contentRows: contentRows satisfies CastContentRow[],
    };
  });

  const recentOutputCounts = scoped.contentRows.reduce((counts, row) => {
    if (row.authorPersona) {
      counts.set(row.authorPersona, (counts.get(row.authorPersona) ?? 0) + 1);
    }
    return counts;
  }, new Map<AiPersona, number>());
  const personas = buildPersonaCards(scoped.cardRows, recentOutputCounts);

  return {
    status: "ready",
    data: {
      insights: buildInsights(input.leagueId, scoped.contentRows, personas),
      league,
      personas,
      turns: buildTurns(input.leagueId, scoped.contentRows, personas).slice(
        0,
        6,
      ),
      userRole,
    },
  };
}
