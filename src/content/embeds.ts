export const CONTENT_EMBED_KINDS = [
  "scoreboard_strip",
  "standings_movement",
  "h2h_sparkline",
] as const;

export type ContentEmbedKind = (typeof CONTENT_EMBED_KINDS)[number];

export interface ScoreboardStripContentEmbed {
  kind: "scoreboard_strip";
  scoringPeriod?: number;
  season?: number;
  title?: string;
}

export interface StandingsMovementContentEmbed {
  kind: "standings_movement";
  limit?: number;
  season?: number;
  title?: string;
}

export interface H2HSparklineContentEmbed {
  kind: "h2h_sparkline";
  personAName: string;
  personBName: string;
  season?: number;
  title?: string;
}

export type ContentEmbed =
  | H2HSparklineContentEmbed
  | ScoreboardStripContentEmbed
  | StandingsMovementContentEmbed;

export interface ContentEmbedBodyBlock {
  embed: ContentEmbed;
  type: "embed";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function boundedInteger(
  value: unknown,
  input: { max: number; min: number },
): number | undefined {
  const parsed = positiveInteger(value);
  if (parsed === undefined) {
    return undefined;
  }
  return Math.min(Math.max(parsed, input.min), input.max);
}

function optionalTitle(value: unknown): string | undefined {
  const title = cleanText(value);
  return title ? title.slice(0, 96) : undefined;
}

export function isContentEmbedKind(value: string): value is ContentEmbedKind {
  return (CONTENT_EMBED_KINDS as readonly string[]).includes(value);
}

export function normalizeContentEmbed(value: unknown): ContentEmbed | null {
  const record = asRecord(value);
  const kind = cleanText(record.kind ?? record.type ?? record.embedType);
  if (!isContentEmbedKind(kind)) {
    return null;
  }

  const season = positiveInteger(record.season);
  const title = optionalTitle(record.title);

  switch (kind) {
    case "scoreboard_strip": {
      return {
        kind,
        ...(season ? { season } : {}),
        ...(positiveInteger(record.scoringPeriod)
          ? { scoringPeriod: positiveInteger(record.scoringPeriod) }
          : {}),
        ...(title ? { title } : {}),
      };
    }
    case "standings_movement": {
      return {
        kind,
        ...(boundedInteger(record.limit, { max: 12, min: 3 })
          ? { limit: boundedInteger(record.limit, { max: 12, min: 3 }) }
          : {}),
        ...(season ? { season } : {}),
        ...(title ? { title } : {}),
      };
    }
    case "h2h_sparkline": {
      const personAName = cleanText(
        record.personAName ?? record.personA ?? record.managerA,
      );
      const personBName = cleanText(
        record.personBName ?? record.personB ?? record.managerB,
      );
      if (!personAName || !personBName || personAName === personBName) {
        return null;
      }
      return {
        kind,
        personAName,
        personBName,
        ...(season ? { season } : {}),
        ...(title ? { title } : {}),
      };
    }
  }
}

export function defaultContentEmbedForArticle(input: {
  contentType: string;
  league: {
    currentScoringPeriod: number;
    name: string;
    season: number;
  };
}): ContentEmbed | null {
  if (input.contentType === "weekly_recap") {
    const scoringPeriod =
      input.league.currentScoringPeriod > 0
        ? input.league.currentScoringPeriod
        : undefined;
    return {
      kind: "scoreboard_strip",
      ...(scoringPeriod ? { scoringPeriod } : {}),
      season: input.league.season,
      title: scoringPeriod
        ? `Week ${scoringPeriod} scoreboard`
        : `${input.league.name} scoreboard`,
    };
  }

  if (input.contentType === "power_rankings") {
    return {
      kind: "standings_movement",
      limit: 8,
      season: input.league.season,
      title: "Standings movement",
    };
  }

  return null;
}

export function contentEmbedKey(embed: ContentEmbed, index: number): string {
  switch (embed.kind) {
    case "scoreboard_strip":
      return [
        embed.kind,
        embed.season ?? "current",
        embed.scoringPeriod ?? "latest",
        index,
      ].join(":");
    case "standings_movement":
      return [
        embed.kind,
        embed.season ?? "current",
        embed.limit ?? "default",
        index,
      ].join(":");
    case "h2h_sparkline":
      return [
        embed.kind,
        embed.season ?? "all",
        embed.personAName,
        embed.personBName,
        index,
      ].join(":");
  }
}
