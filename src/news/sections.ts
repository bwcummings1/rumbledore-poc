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

export type CentralPublicationBranchId = "news" | "fantasy";

export type CentralPublicationSectionId =
  | "wire"
  | "rundown"
  | "weekend-recap-mnf-projection"
  | "mnf-recap"
  | "pre-waiver"
  | "post-waiver"
  | "matchups"
  | "rankings-projections"
  | "start-sit"
  | "injuries";

export interface CentralPublicationSection
  extends PublicationSection<CentralPublicationSectionId> {
  branch: CentralPublicationBranchId;
}

export interface CentralPublicationBranch {
  id: CentralPublicationBranchId;
  label: string;
  sections: readonly CentralPublicationSection[];
}

export const CENTRAL_PUBLICATION_BRANCHES = [
  {
    id: "news",
    label: "News",
    sections: [
      {
        branch: "news",
        id: "wire",
        label: "The Wire",
        slug: "wire",
      },
      {
        branch: "news",
        id: "rundown",
        label: "The Rundown",
        slug: "rundown",
      },
    ],
  },
  {
    id: "fantasy",
    label: "Fantasy",
    sections: [
      {
        branch: "fantasy",
        id: "weekend-recap-mnf-projection",
        label: "Weekend Recap + MNF Projection",
        slug: "weekend-recap-mnf-projection",
      },
      {
        branch: "fantasy",
        id: "mnf-recap",
        label: "MNF Recap",
        slug: "mnf-recap",
      },
      {
        branch: "fantasy",
        id: "pre-waiver",
        label: "Pre-waiver",
        slug: "pre-waiver",
      },
      {
        branch: "fantasy",
        id: "post-waiver",
        label: "Post-waiver",
        slug: "post-waiver",
      },
      {
        branch: "fantasy",
        id: "matchups",
        label: "Matchups",
        slug: "matchups",
      },
      {
        branch: "fantasy",
        id: "rankings-projections",
        label: "Rankings & Projections",
        slug: "rankings-projections",
      },
      {
        branch: "fantasy",
        id: "start-sit",
        label: "Start/Sit",
        slug: "start-sit",
      },
      {
        branch: "fantasy",
        id: "injuries",
        label: "Injuries",
        slug: "injuries",
      },
    ],
  },
] as const satisfies readonly CentralPublicationBranch[];

export const CENTRAL_PUBLICATION_SECTIONS: readonly CentralPublicationSection[] =
  CENTRAL_PUBLICATION_BRANCHES.flatMap(
    (branch): readonly CentralPublicationSection[] => branch.sections,
  );

export type LeaguePublicationSectionId =
  | "recaps"
  | "power-rankings"
  | "trash-talk"
  | "records"
  | "previews";

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

const CENTRAL_DEFAULT_SECTION_ID: CentralPublicationSectionId = "wire";
const LEAGUE_DEFAULT_SECTION_ID: LeaguePublicationSectionId = "recaps";

const CENTRAL_SECTION_BY_ID: ReadonlyMap<
  CentralPublicationSectionId,
  CentralPublicationSection
> = new Map(
  CENTRAL_PUBLICATION_SECTIONS.map((section) => [section.id, section]),
);
const CENTRAL_SECTION_BY_SLUG: ReadonlyMap<string, CentralPublicationSection> =
  new Map(
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
  ["wire", "wire"],
  ["the-wire", "wire"],
  ["rundown", "rundown"],
  ["the-rundown", "rundown"],
  ["report", "rundown"],
  ["reports", "rundown"],
  ["analysis", "rundown"],
  ["weekend-recap-mnf-projection", "weekend-recap-mnf-projection"],
  ["weekend-recap", "weekend-recap-mnf-projection"],
  ["sunday-recap", "weekend-recap-mnf-projection"],
  ["mnf-projection", "weekend-recap-mnf-projection"],
  ["mnf-recap", "mnf-recap"],
  ["monday-night-football-recap", "mnf-recap"],
  ["pre-waiver", "pre-waiver"],
  ["pre-waivers", "pre-waiver"],
  ["waiver", "pre-waiver"],
  ["waivers", "pre-waiver"],
  ["waiver-wire", "pre-waiver"],
  ["waiver_wire", "pre-waiver"],
  ["add-drop", "pre-waiver"],
  ["add_drop", "pre-waiver"],
  ["post-waiver", "post-waiver"],
  ["post-waivers", "post-waiver"],
  ["waiver-results", "post-waiver"],
  ["matchup", "matchups"],
  ["matchups", "matchups"],
  ["matchup-preview", "matchups"],
  ["rankings-projections", "rankings-projections"],
  ["rankings-and-projections", "rankings-projections"],
  ["projection", "rankings-projections"],
  ["projections", "rankings-projections"],
  ["rank", "rankings-projections"],
  ["ranks", "rankings-projections"],
  ["ranking", "rankings-projections"],
  ["rankings", "rankings-projections"],
  ["injury", "injuries"],
  ["injuries", "injuries"],
  ["injured", "injuries"],
  ["practice-report", "injuries"],
  ["practice_report", "injuries"],
  ["questionable", "injuries"],
  ["inactive", "injuries"],
  ["start-sit", "start-sit"],
  ["start_sit", "start-sit"],
  ["startsit", "start-sit"],
  ["start", "start-sit"],
  ["sit", "start-sit"],
  ["lineup", "start-sit"],
  ["flex", "start-sit"],
  ["headlines", "wire"],
  ["headline", "wire"],
  ["breaking", "wire"],
  ["players", "wire"],
  ["player", "wire"],
  ["depth-chart", "wire"],
  ["depth_chart", "wire"],
  ["rookie", "wire"],
  ["quarterback", "wire"],
  ["running-back", "wire"],
  ["running_back", "wire"],
  ["receiver", "wire"],
  ["wide-receiver", "wire"],
  ["wide_receiver", "wire"],
  ["tight-end", "wire"],
  ["tight_end", "wire"],
  ["trade", "wire"],
  ["signing", "wire"],
  ["contract", "wire"],
  ["nfl", "wire"],
  ["league", "wire"],
  ["football", "wire"],
  ["coach", "wire"],
  ["team", "wire"],
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
    let bestMatch: { aliasLength: number; sectionId: Id } | null = null;
    for (const [alias, sectionId] of aliases) {
      if (
        normalized.includes(alias) &&
        alias.length > (bestMatch?.aliasLength ?? 0)
      ) {
        bestMatch = { aliasLength: alias.length, sectionId };
      }
    }
    if (bestMatch) {
      return bestMatch.sectionId;
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
): CentralPublicationSection | null {
  return CENTRAL_SECTION_BY_SLUG.get(normalizedKey(slug)) ?? null;
}

export function getLeaguePublicationSectionBySlug(
  slug: string,
): PublicationSection<LeaguePublicationSectionId> | null {
  return LEAGUE_SECTION_BY_SLUG.get(normalizedKey(slug)) ?? null;
}

export function centralPublicationSectionById(
  id: CentralPublicationSectionId,
): CentralPublicationSection {
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
}): CentralPublicationSection {
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
