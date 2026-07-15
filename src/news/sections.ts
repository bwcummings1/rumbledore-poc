import type { AiContentType } from "@/ai/content-types";
import {
  defaultLeagueArticleSectionForContentType,
  isAiContentType,
} from "@/ai/content-types";
import type { AiPersona } from "@/ai/personas";

export type PublicationScope = "central" | "league";

export interface PublicationSection<Id extends string = string> {
  id: Id;
  label: string;
  slug: string;
}

export type CentralPublicationSectionId =
  | "headlines"
  | "players"
  | "injuries"
  | "rankings"
  | "start-sit"
  | "waivers"
  | "analysis";

export type LeaguePublicationSectionId =
  | "recaps"
  | "power-rankings"
  | "trash-talk"
  | "records"
  | "previews";

export const CENTRAL_PUBLICATION_SECTIONS = [
  { id: "headlines", label: "Headlines", slug: "headlines" },
  { id: "players", label: "Players", slug: "players" },
  { id: "rankings", label: "Rankings", slug: "rankings" },
  { id: "start-sit", label: "Start/Sit", slug: "start-sit" },
  { id: "injuries", label: "Injuries", slug: "injuries" },
  { id: "waivers", label: "Waivers", slug: "waivers" },
  { id: "analysis", label: "Analysis", slug: "analysis" },
] as const satisfies readonly PublicationSection<CentralPublicationSectionId>[];

export const LEAGUE_PUBLICATION_SECTIONS = [
  { id: "recaps", label: "Recaps", slug: "recaps" },
  {
    id: "power-rankings",
    label: "Power Rankings",
    slug: "power-rankings",
  },
  { id: "trash-talk", label: "Trash Talk", slug: "trash-talk" },
  { id: "records", label: "Records", slug: "records" },
  { id: "previews", label: "Previews", slug: "previews" },
] as const satisfies readonly PublicationSection<LeaguePublicationSectionId>[];

const CENTRAL_DEFAULT_SECTION_ID: CentralPublicationSectionId = "headlines";
const LEAGUE_DEFAULT_SECTION_ID: LeaguePublicationSectionId = "recaps";

const CENTRAL_SECTION_BY_ID: ReadonlyMap<
  CentralPublicationSectionId,
  PublicationSection<CentralPublicationSectionId>
> = new Map(
  CENTRAL_PUBLICATION_SECTIONS.map((section) => [section.id, section]),
);
const CENTRAL_SECTION_BY_SLUG: ReadonlyMap<
  string,
  PublicationSection<CentralPublicationSectionId>
> = new Map(
  CENTRAL_PUBLICATION_SECTIONS.map((section) => [section.slug, section]),
);
const LEAGUE_SECTION_BY_ID: ReadonlyMap<
  LeaguePublicationSectionId,
  PublicationSection<LeaguePublicationSectionId>
> = new Map(
  LEAGUE_PUBLICATION_SECTIONS.map((section) => [section.id, section]),
);
const LEAGUE_SECTION_BY_SLUG: ReadonlyMap<
  string,
  PublicationSection<LeaguePublicationSectionId>
> = new Map(
  LEAGUE_PUBLICATION_SECTIONS.map((section) => [section.slug, section]),
);

const CENTRAL_SECTION_ALIASES = new Map<string, CentralPublicationSectionId>([
  ["injury", "injuries"],
  ["injuries", "injuries"],
  ["injured", "injuries"],
  ["practice-report", "injuries"],
  ["practice_report", "injuries"],
  ["questionable", "injuries"],
  ["inactive", "injuries"],
  ["waiver", "waivers"],
  ["waivers", "waivers"],
  ["waiver-wire", "waivers"],
  ["waiver_wire", "waivers"],
  ["add-drop", "waivers"],
  ["add_drop", "waivers"],
  ["start-sit", "start-sit"],
  ["start_sit", "start-sit"],
  ["startsit", "start-sit"],
  ["start", "start-sit"],
  ["sit", "start-sit"],
  ["lineup", "start-sit"],
  ["flex", "start-sit"],
  ["rank", "rankings"],
  ["ranks", "rankings"],
  ["ranking", "rankings"],
  ["rankings", "rankings"],
  ["players", "players"],
  ["player", "players"],
  ["depth-chart", "players"],
  ["depth_chart", "players"],
  ["rookie", "players"],
  ["quarterback", "players"],
  ["running-back", "players"],
  ["running_back", "players"],
  ["receiver", "players"],
  ["wide-receiver", "players"],
  ["wide_receiver", "players"],
  ["tight-end", "players"],
  ["tight_end", "players"],
  ["analysis", "analysis"],
  ["fantasy", "analysis"],
  ["fantasy-football", "analysis"],
  ["fantasy_football", "analysis"],
  ["matchup", "analysis"],
  ["trade", "analysis"],
  ["usage", "analysis"],
  ["targets", "analysis"],
  ["snap", "analysis"],
  ["trend", "analysis"],
  ["headlines", "headlines"],
  ["headline", "headlines"],
  ["breaking", "headlines"],
  ["nfl", "headlines"],
  ["league", "headlines"],
  ["football", "headlines"],
  ["coach", "headlines"],
  ["team", "headlines"],
]);

const LEAGUE_SECTION_ALIASES = new Map<string, LeaguePublicationSectionId>([
  ["recap", "recaps"],
  ["recaps", "recaps"],
  ["reaction", "recaps"],
  ["reactions", "recaps"],
  ["power-rankings", "power-rankings"],
  ["power_rankings", "power-rankings"],
  ["power-ranking", "power-rankings"],
  ["power_ranking", "power-rankings"],
  ["rankings", "power-rankings"],
  ["trash-talk", "trash-talk"],
  ["trash_talk", "trash-talk"],
  ["trash", "trash-talk"],
  ["roast", "trash-talk"],
  ["records", "records"],
  ["record", "records"],
  ["history", "records"],
  ["lore", "records"],
  ["preview", "previews"],
  ["previews", "previews"],
  ["week-ahead", "previews"],
  ["week_ahead", "previews"],
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const text = textValue(item);
    return text ? [text] : [];
  });
}

function normalizedKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstSectionId<Id extends string>(
  candidates: readonly string[],
  aliases: ReadonlyMap<string, Id>,
): Id | null {
  for (const candidate of candidates) {
    const normalized = normalizedKey(candidate);
    const direct = aliases.get(normalized);
    if (direct) {
      return direct;
    }
  }

  for (const candidate of candidates) {
    const normalized = normalizedKey(candidate);
    for (const [alias, sectionId] of aliases) {
      if (normalized.includes(alias)) {
        return sectionId;
      }
    }
  }

  return null;
}

function metadataSectionCandidates(
  metadata: Record<string, unknown>,
  scope: PublicationScope,
): string[] {
  const scopedKey = scope === "central" ? "centralSection" : "leagueSection";
  const values = [
    textValue(metadata[scopedKey]),
    textValue(metadata.publicationSection),
    textValue(metadata.section),
    textValue(metadata.beat),
    ...stringArrayValue(metadata.tags),
    ...stringArrayValue(metadata.topics),
  ];

  return values.flatMap((value) => (value ? [value] : []));
}

function leagueContentType(
  metadata: Record<string, unknown>,
): AiContentType | null {
  const article = asRecord(metadata.article);
  const candidates = [
    metadata.contentType,
    metadata.content_type,
    article.contentType,
  ];

  return (
    candidates.find(
      (candidate): candidate is AiContentType =>
        typeof candidate === "string" && isAiContentType(candidate),
    ) ?? null
  );
}

function centralSectionForText(values: readonly string[]) {
  return (
    firstSectionId(values, CENTRAL_SECTION_ALIASES) ??
    CENTRAL_DEFAULT_SECTION_ID
  );
}

function leagueSectionForPersona(
  persona: AiPersona | null | undefined,
): LeaguePublicationSectionId | null {
  switch (persona) {
    case "analyst":
      return "power-rankings";
    case "beat_reporter":
    case "betting_advisor":
    case "commissioner":
      return "previews";
    case "narrator":
      return "recaps";
    case "trash_talker":
      return "trash-talk";
    case null:
    case undefined:
      return null;
  }
}

export function getCentralPublicationSectionBySlug(
  slug: string,
): PublicationSection<CentralPublicationSectionId> | null {
  return CENTRAL_SECTION_BY_SLUG.get(normalizedKey(slug)) ?? null;
}

export function getLeaguePublicationSectionBySlug(
  slug: string,
): PublicationSection<LeaguePublicationSectionId> | null {
  return LEAGUE_SECTION_BY_SLUG.get(normalizedKey(slug)) ?? null;
}

export function centralPublicationSectionById(
  id: CentralPublicationSectionId,
): PublicationSection<CentralPublicationSectionId> {
  const fallback = CENTRAL_SECTION_BY_ID.get(CENTRAL_DEFAULT_SECTION_ID);
  if (!fallback) {
    throw new Error("Central publication default section is not configured");
  }

  return CENTRAL_SECTION_BY_ID.get(id) ?? fallback;
}

export function leaguePublicationSectionById(
  id: LeaguePublicationSectionId,
): PublicationSection<LeaguePublicationSectionId> {
  const fallback = LEAGUE_SECTION_BY_ID.get(LEAGUE_DEFAULT_SECTION_ID);
  if (!fallback) {
    throw new Error("League publication default section is not configured");
  }

  return LEAGUE_SECTION_BY_ID.get(id) ?? fallback;
}

export function resolveCentralPublicationSection({
  metadata,
  summary,
  title,
}: {
  metadata: unknown;
  summary?: string;
  title?: string;
}): PublicationSection<CentralPublicationSectionId> {
  const record = asRecord(metadata);
  const sectionId = centralSectionForText([
    ...metadataSectionCandidates(record, "central"),
    title ?? "",
    summary ?? "",
  ]);

  return centralPublicationSectionById(sectionId);
}

export function resolveLeaguePublicationSection({
  authorPersona,
  kind,
  metadata,
  summary,
  title,
}: {
  authorPersona?: AiPersona | null;
  kind: "blog" | "ingest_event" | "news";
  metadata: unknown;
  summary?: string;
  title?: string;
}): PublicationSection<LeaguePublicationSectionId> {
  const record = asRecord(metadata);
  const contentType = kind === "blog" ? leagueContentType(record) : null;
  if (contentType) {
    return leaguePublicationSectionById(
      defaultLeagueArticleSectionForContentType(contentType),
    );
  }

  const metadataSectionId = firstSectionId(
    [
      ...metadataSectionCandidates(record, "league"),
      title ?? "",
      summary ?? "",
    ],
    LEAGUE_SECTION_ALIASES,
  );
  if (metadataSectionId) {
    return leaguePublicationSectionById(metadataSectionId);
  }

  const personaSectionId = leagueSectionForPersona(authorPersona);
  if (personaSectionId) {
    return leaguePublicationSectionById(personaSectionId);
  }

  if (kind === "ingest_event") {
    return leaguePublicationSectionById("records");
  }

  if (kind === "news") {
    return leaguePublicationSectionById("previews");
  }

  return leaguePublicationSectionById(LEAGUE_DEFAULT_SECTION_ID);
}
