import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NormalizedSeasonBundle } from "@/providers";
import { stableContentHash, stableJson } from "./hash";
import {
  replaceEmbeddedEmails,
  replaceEmbeddedGuids,
} from "./sensitive-patterns";

export const QUARANTINE_SANITIZER_VERSION = "47c-v2";

export interface QuarantineFailure {
  checkKey: string;
  detail: Record<string, unknown>;
  id: string;
  season: number | null;
}

export interface QuarantineCaptureManifestEntry {
  contentHash: string;
  path: string;
  season: number;
  view: string;
}

export interface QuarantineCaptureInput {
  attempt: number;
  bundles: readonly NormalizedSeasonBundle[];
  capturedAt: Date;
  failures: readonly QuarantineFailure[];
  provider: NormalizedSeasonBundle["league"]["provider"];
  providerLeagueId: string;
  season: number;
}

export interface QuarantineCorpusWriter {
  capture(
    input: QuarantineCaptureInput,
  ): Promise<QuarantineCaptureManifestEntry[]>;
}

interface CorpusEnvelope {
  payload: unknown;
  provenance: {
    capturedAt: string;
    contentHash: string;
    leagueIdHash: string;
    sanitizerVersion: typeof QUARANTINE_SANITIZER_VERSION;
    season: number;
    source: "shadow_run_quarantine";
    view: string;
  };
}

const REMOVED_KEYS = new Set([
  "avatar",
  "avatarUrl",
  "email",
  "emailAddress",
  "image",
  "imageUrl",
  "logo",
  "logoUrl",
  "photo",
  "picture",
]);
const NAME_KEYS = new Set([
  "displayName",
  "firstName",
  "lastName",
  "managerName",
  "memberName",
  "ownerName",
]);

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pseudonym(value: string, salt: string, prefix: string): string {
  return `${prefix}_${digest(`${salt}:${value}`).slice(0, 12)}`;
}

function sanitizeUnknown(value: unknown, salt: string, key?: string): unknown {
  if (key && REMOVED_KEYS.has(key)) {
    return undefined;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    if (key && NAME_KEYS.has(key)) {
      return pseudonym(value, salt, "manager");
    }
    return replaceEmbeddedEmails(
      replaceEmbeddedGuids(value, (guid) => pseudonym(guid, salt, "member")),
    );
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeUnknown(entry, salt));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([entryKey, entry]) => [
          entryKey,
          sanitizeUnknown(entry, salt, entryKey),
        ])
        .filter((entry): entry is [string, unknown] => entry[1] !== undefined),
    );
  }
  return String(value);
}

export function sanitizeQuarantineBundle(
  bundle: NormalizedSeasonBundle,
): NormalizedSeasonBundle {
  const salt = `${bundle.league.provider}:${bundle.league.providerId}:${bundle.league.season}`;
  const leagueProviderId = pseudonym(bundle.league.providerId, salt, "league");
  const memberIds = new Map(
    bundle.members.map((member) => [
      member.providerId,
      pseudonym(member.providerId, salt, "member"),
    ]),
  );
  const memberId = (value: string) =>
    memberIds.get(value) ?? pseudonym(value, salt, "member");

  return {
    league: {
      ...bundle.league,
      linkedProviderIds: bundle.league.linkedProviderIds?.map((value) =>
        pseudonym(value, salt, "league"),
      ),
      name: `Quarantine League ${digest(salt).slice(0, 8)}`,
      previousProviderId: bundle.league.previousProviderId
        ? pseudonym(bundle.league.previousProviderId, salt, "league")
        : undefined,
      providerId: leagueProviderId,
      teamName: bundle.league.teamName ? "Connected Team" : undefined,
    },
    teams: bundle.teams.map((team, index) => ({
      ...team,
      leagueProviderId,
      logo: undefined,
      name: `Team ${String(index + 1).padStart(2, "0")}`,
      ownerMemberIds: team.ownerMemberIds.map(memberId),
    })),
    members: bundle.members.map((member, index) => ({
      ...member,
      displayName: `Manager ${String(index + 1).padStart(2, "0")}`,
      leagueProviderId,
      providerId: memberId(member.providerId),
    })),
    matchups: bundle.matchups.map((matchup) => ({
      ...matchup,
      leagueProviderId,
    })),
    finalStandings: bundle.finalStandings.map((standing) => ({
      ...standing,
      leagueProviderId,
    })),
    players: bundle.players?.map((player) => ({
      ...player,
      leagueProviderId: player.leagueProviderId ? leagueProviderId : undefined,
      metadata: sanitizeUnknown(player.metadata, salt) as
        | Record<string, unknown>
        | undefined,
    })),
    rosters: bundle.rosters?.map((roster) => ({
      ...roster,
      entries: roster.entries.map((entry) => ({
        ...entry,
        metadata: sanitizeUnknown(entry.metadata, salt) as
          | Record<string, unknown>
          | undefined,
        player: entry.player
          ? {
              ...entry.player,
              leagueProviderId: entry.player.leagueProviderId
                ? leagueProviderId
                : undefined,
              metadata: sanitizeUnknown(entry.player.metadata, salt) as
                | Record<string, unknown>
                | undefined,
            }
          : undefined,
        statBreakdown: entry.statBreakdown?.map((stat) => ({
          ...stat,
          metadata: sanitizeUnknown(stat.metadata, salt) as
            | Record<string, unknown>
            | undefined,
        })),
      })),
    })),
    draftPicks: bundle.draftPicks?.map((pick) => ({
      ...pick,
      leagueProviderId,
      metadata: sanitizeUnknown(pick.metadata, salt) as
        | Record<string, unknown>
        | undefined,
      player: pick.player
        ? {
            ...pick.player,
            leagueProviderId: pick.player.leagueProviderId
              ? leagueProviderId
              : undefined,
            metadata: sanitizeUnknown(pick.player.metadata, salt) as
              | Record<string, unknown>
              | undefined,
          }
        : undefined,
    })),
    transactions: bundle.transactions.map((transaction) => ({
      ...transaction,
      details: sanitizeUnknown(transaction.details, salt) as Record<
        string,
        unknown
      >,
      leagueProviderId,
    })),
  };
}

function envelope({
  capturedAt,
  leagueIdHash,
  payload,
  season,
  view,
}: {
  capturedAt: Date;
  leagueIdHash: string;
  payload: unknown;
  season: number;
  view: string;
}): CorpusEnvelope {
  const contentHash = stableContentHash(payload);
  return {
    payload,
    provenance: {
      capturedAt: capturedAt.toISOString(),
      contentHash,
      leagueIdHash,
      sanitizerVersion: QUARANTINE_SANITIZER_VERSION,
      season,
      source: "shadow_run_quarantine",
      view,
    },
  };
}

export class FileSystemQuarantineCorpusWriter
  implements QuarantineCorpusWriter
{
  constructor(
    private readonly rootDir = path.join(
      process.cwd(),
      ".orchestration",
      "quarantine-corpus",
    ),
  ) {}

  async capture(
    input: QuarantineCaptureInput,
  ): Promise<QuarantineCaptureManifestEntry[]> {
    const leagueIdHash = digest(`${input.provider}:${input.providerLeagueId}`);
    const bundlePayloads = input.bundles.map((bundle) => ({
      payload: sanitizeQuarantineBundle(bundle),
      season: bundle.league.season,
      view: "normalized_bundle",
    }));
    const payloads =
      bundlePayloads.length > 0
        ? bundlePayloads
        : [
            {
              payload: sanitizeUnknown(
                input.failures,
                `${input.provider}:${input.providerLeagueId}:${input.season}`,
              ),
              season: input.season,
              view: "integrity_failures",
            },
          ];
    const captures: QuarantineCaptureManifestEntry[] = [];

    for (const capture of payloads) {
      const document = envelope({
        capturedAt: input.capturedAt,
        leagueIdHash,
        payload: capture.payload,
        season: capture.season,
        view: capture.view,
      });
      const relativePath = path.join(
        input.provider,
        leagueIdHash,
        `attempt-${input.attempt}`,
        String(capture.season),
        `${capture.view}.json`,
      );
      const filePath = path.join(this.rootDir, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${stableJson(document)}\n`, "utf8");
      captures.push({
        contentHash: document.provenance.contentHash,
        path: relativePath.split(path.sep).join("/"),
        season: capture.season,
        view: capture.view,
      });
    }

    return captures;
  }
}
