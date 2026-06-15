import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { fantasyRosterEntries, leagues } from "@/db/schema";
import type { CentralNewsPlayerRef } from "./interfaces";

export interface CentralNewsPlayerRefExtractionInput {
  body?: string;
  summary?: string;
  title: string;
  topics?: readonly string[];
}

export interface CentralNewsPlayerRefExtractor {
  extract(
    input: CentralNewsPlayerRefExtractionInput,
  ): Promise<CentralNewsPlayerRef[]>;
}

export interface CentralNewsPlayerDictionaryEntry extends CentralNewsPlayerRef {
  aliases?: readonly string[];
}

export const EMPTY_PLAYER_REF_EXTRACTOR: CentralNewsPlayerRefExtractor = {
  async extract() {
    return [];
  },
};

type LeagueRow = {
  id: string;
  provider: (typeof leagues.$inferSelect)["provider"];
  providerLeagueId: string;
  season: number;
};

type RosterDictionaryRow = {
  metadata: Record<string, unknown>;
  provider: string;
  providerPlayerId: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(input: CentralNewsPlayerRefExtractionInput): string {
  return ` ${normalizePhrase(
    [input.title, input.summary, input.body, ...(input.topics ?? [])].join(" "),
  )} `;
}

function stripNameSuffix(value: string): string | null {
  const stripped = value.replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "").trim();
  return stripped && stripped !== value ? stripped : null;
}

function compactInitialsAlias(alias: string): string | null {
  const parts = normalizePhrase(alias).split(" ").filter(Boolean);
  if (parts.length < 3 || parts[0]?.length !== 1 || parts[1]?.length !== 1) {
    return null;
  }

  return [parts[0] + parts[1], ...parts.slice(2)].join(" ");
}

function searchableAliases(entry: CentralNewsPlayerDictionaryEntry): string[] {
  const rawAliases = [entry.label, ...(entry.aliases ?? [])].flatMap(
    (alias) => {
      const cleaned = cleanText(alias);
      if (!cleaned) {
        return [];
      }

      return [
        cleaned,
        stripNameSuffix(cleaned),
        compactInitialsAlias(cleaned),
      ].flatMap((value) => (value ? [value] : []));
    },
  );

  return uniqueSorted(
    rawAliases
      .map(normalizePhrase)
      .filter((alias) => alias.length >= 4 && /\D/.test(alias)),
  );
}

function refKey(ref: Pick<CentralNewsPlayerRef, "provider" | "providerId">) {
  return `${ref.provider}\n${ref.providerId}`;
}

function normalizeEntry(
  entry: CentralNewsPlayerDictionaryEntry,
): CentralNewsPlayerDictionaryEntry | null {
  const provider = cleanText(entry.provider).toLowerCase();
  const providerId = cleanText(entry.providerId);
  const label = cleanText(entry.label);
  const aliases = uniqueSorted((entry.aliases ?? []).map(cleanText));
  if (!provider || !providerId || !label) {
    return null;
  }

  return {
    provider,
    providerId,
    label,
    ...(aliases.length > 0 ? { aliases } : {}),
  };
}

export function createDictionaryPlayerRefExtractor(
  entries: readonly CentralNewsPlayerDictionaryEntry[],
): CentralNewsPlayerRefExtractor {
  const dictionary = entries.flatMap((entry) => {
    const normalized = normalizeEntry(entry);
    if (!normalized) {
      return [];
    }

    const aliases = searchableAliases(normalized);
    if (aliases.length === 0) {
      return [];
    }

    return [{ aliases, entry: normalized }];
  });

  return {
    async extract(input) {
      const text = normalizedText(input);
      const byRef = new Map<string, CentralNewsPlayerRef>();

      for (const candidate of dictionary) {
        if (!candidate.aliases.some((alias) => text.includes(` ${alias} `))) {
          continue;
        }

        byRef.set(refKey(candidate.entry), {
          label: candidate.entry.label,
          provider: candidate.entry.provider,
          providerId: candidate.entry.providerId,
        });
      }

      return [...byRef.values()].sort(
        (left, right) =>
          left.provider.localeCompare(right.provider) ||
          left.providerId.localeCompare(right.providerId),
      );
    },
  };
}

function playerLabelFromMetadata(
  metadata: Record<string, unknown>,
): string | null {
  for (const key of ["playerName", "fullName", "name", "displayName"]) {
    const label = cleanText(metadata[key]);
    if (label) {
      return label;
    }
  }

  return null;
}

async function latestScoringPeriod(
  db: Db,
  league: LeagueRow,
): Promise<number | null> {
  return withLeagueContext(db, league.id, async (tx) => {
    const [row] = await tx
      .select({
        scoringPeriod: sql<
          number | null
        >`max(${fantasyRosterEntries.scoringPeriod})`,
      })
      .from(fantasyRosterEntries)
      .where(
        and(
          eq(fantasyRosterEntries.leagueId, league.id),
          eq(fantasyRosterEntries.provider, league.provider),
          eq(fantasyRosterEntries.leagueProviderId, league.providerLeagueId),
          eq(fantasyRosterEntries.season, league.season),
        ),
      );

    const value = Number(row?.scoringPeriod ?? Number.NaN);
    return Number.isFinite(value) ? value : null;
  });
}

async function rosterRowsForLeague(
  db: Db,
  league: LeagueRow,
): Promise<RosterDictionaryRow[]> {
  const scoringPeriod = await latestScoringPeriod(db, league);
  if (scoringPeriod === null) {
    return [];
  }

  return withLeagueContext(db, league.id, (tx) =>
    tx
      .select({
        metadata: fantasyRosterEntries.metadata,
        provider: fantasyRosterEntries.provider,
        providerPlayerId: fantasyRosterEntries.providerPlayerId,
      })
      .from(fantasyRosterEntries)
      .where(
        and(
          eq(fantasyRosterEntries.leagueId, league.id),
          eq(fantasyRosterEntries.provider, league.provider),
          eq(fantasyRosterEntries.leagueProviderId, league.providerLeagueId),
          eq(fantasyRosterEntries.season, league.season),
          eq(fantasyRosterEntries.scoringPeriod, scoringPeriod),
        ),
      )
      .orderBy(
        desc(fantasyRosterEntries.scoringPeriod),
        fantasyRosterEntries.provider,
        fantasyRosterEntries.providerPlayerId,
      ),
  );
}

async function leagueRows(db: Db): Promise<LeagueRow[]> {
  return db
    .select({
      id: leagues.id,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues);
}

export class RosteredPlayerRefExtractor
  implements CentralNewsPlayerRefExtractor
{
  private loaded: Promise<CentralNewsPlayerRefExtractor> | null = null;

  constructor(private readonly db: Db) {}

  async extract(
    input: CentralNewsPlayerRefExtractionInput,
  ): Promise<CentralNewsPlayerRef[]> {
    const extractor = await this.load();
    return extractor.extract(input);
  }

  private load(): Promise<CentralNewsPlayerRefExtractor> {
    this.loaded ??= this.loadDictionary();
    return this.loaded;
  }

  private async loadDictionary(): Promise<CentralNewsPlayerRefExtractor> {
    const entriesByRef = new Map<string, CentralNewsPlayerDictionaryEntry>();

    for (const league of await leagueRows(this.db)) {
      for (const row of await rosterRowsForLeague(this.db, league)) {
        const metadata = asRecord(row.metadata);
        const label = playerLabelFromMetadata(metadata);
        if (!label) {
          continue;
        }

        const entry = normalizeEntry({
          aliases: [
            cleanText(metadata.shortName),
            cleanText(metadata.nickName),
            cleanText(metadata.firstLastName),
          ],
          label,
          provider: row.provider,
          providerId: row.providerPlayerId,
        });
        if (!entry) {
          continue;
        }

        const entryAliases = entry.aliases ?? [];
        const entryLabel = entry.label;
        const key = refKey(entry);
        const existing = entriesByRef.get(key);
        entriesByRef.set(key, {
          ...entry,
          aliases: uniqueSorted([
            ...(existing?.aliases ?? []),
            ...entryAliases,
            existing?.label ?? "",
          ]),
          label: existing?.label ?? entryLabel,
        });
      }
    }

    return createDictionaryPlayerRefExtractor([...entriesByRef.values()]);
  }
}
