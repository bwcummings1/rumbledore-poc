// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { NormalizedSeasonBundle } from "@/providers";
import {
  FileSystemQuarantineCorpusWriter,
  QUARANTINE_SANITIZER_VERSION,
  sanitizeQuarantineBundle,
} from "./quarantine-corpus";

const memberGuid = "{11111111-1111-4111-8111-111111111111}";

function privateBundle(): NormalizedSeasonBundle {
  return {
    league: {
      currentScoringPeriod: 14,
      name: "Private Alumni League",
      provider: "espn",
      providerId: "95050-private",
      season: 2025,
      scoringType: "H2H_POINTS",
      size: 2,
      sport: "ffl",
      status: "complete",
      teamName: "The Private Team",
    },
    teams: [
      {
        abbrev: "PVT",
        leagueProviderId: "95050-private",
        logo: "https://private.example/avatar.png",
        name: "Alex's Private Team",
        ownerMemberIds: [memberGuid],
        provider: "espn",
        providerId: "1",
        record: {
          losses: 0,
          pointsAgainst: 100,
          pointsFor: 120,
          ties: 0,
          wins: 1,
        },
        season: 2025,
      },
    ],
    members: [
      {
        displayName: "Alex Private",
        leagueProviderId: "95050-private",
        provider: "espn",
        providerId: memberGuid,
        role: "commissioner",
        season: 2025,
      },
    ],
    matchups: [],
    finalStandings: [],
    transactions: [
      {
        details: {
          avatar: "https://private.example/avatar.png",
          email: "alex.private@example.com",
          memberGuid,
          ownerName: "Alex Private",
        },
        leagueProviderId: "95050-private",
        playerRefs: [],
        provider: "espn",
        providerId: "transaction-1",
        season: 2025,
        teamRefs: [],
        timestamp: new Date("2025-09-01T12:00:00.000Z"),
        type: "add",
      },
    ],
  };
}

describe("shadow quarantine corpus", () => {
  it("deterministically pseudonymizes member identities and removes contact assets", () => {
    const first = sanitizeQuarantineBundle(privateBundle());
    const second = sanitizeQuarantineBundle(privateBundle());
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(serialized).not.toContain(memberGuid);
    expect(serialized).not.toContain("Alex Private");
    expect(serialized).not.toContain("Alex's Private Team");
    expect(serialized).not.toContain("Private Alumni League");
    expect(serialized).not.toContain("alex.private@example.com");
    expect(serialized).not.toContain("avatar.png");
    expect(first.members[0]?.providerId).toMatch(/^member_[a-f0-9]{12}$/);
    expect(first.teams[0]?.ownerMemberIds).toEqual([
      first.members[0]?.providerId,
    ]);
  });

  it("writes a corpus-compatible provenance envelope with sanitized payload only", async () => {
    const rootDir = path.join("/tmp", `rumbledore-quarantine-${randomUUID()}`);
    const writer = new FileSystemQuarantineCorpusWriter(rootDir);
    const captures = await writer.capture({
      attempt: 1,
      bundles: [privateBundle()],
      capturedAt: new Date("2026-07-13T12:00:00.000Z"),
      failures: [
        {
          checkKey: "schedule_coverage",
          detail: { ownerName: "Alex Private" },
          id: randomUUID(),
          season: 2025,
        },
      ],
      provider: "espn",
      providerLeagueId: "95050-private",
      season: 2026,
    });

    expect(captures).toHaveLength(1);
    const capture = captures[0];
    if (!capture) throw new Error("quarantine capture was not written");
    const document = JSON.parse(
      await readFile(path.join(rootDir, capture.path), "utf8"),
    ) as {
      payload: unknown;
      provenance: Record<string, unknown>;
    };
    const serialized = JSON.stringify(document);
    expect(document.provenance).toMatchObject({
      capturedAt: "2026-07-13T12:00:00.000Z",
      contentHash: capture.contentHash,
      sanitizerVersion: QUARANTINE_SANITIZER_VERSION,
      season: 2025,
      source: "shadow_run_quarantine",
      view: "normalized_bundle",
    });
    expect(serialized).not.toContain(memberGuid);
    expect(serialized).not.toContain("Alex Private");
    expect(serialized).not.toContain("alex.private@example.com");
  });
});
