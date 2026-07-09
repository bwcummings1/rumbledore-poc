// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  LlmClient,
  LlmGenerateRequest,
  LlmJudge,
  LlmJudgeRequest,
  LlmJudgeScore,
} from "@/ai";
import { createMockAiDependencies, MockLlmClient, MockLlmJudge } from "@/ai";
import { detectContentCorrectionsNeeded } from "@/content/corrections";
import { supersedingContentDedupKey } from "@/content/lifecycle";
import { DEFAULT_ENTITLEMENT_CAPS, parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiGenerationRuns,
  contentItems,
  editorialActions,
  fantasyMatchups,
  fantasyMembers,
  fantasyTeams,
  leagues,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { NoopPushNotifier } from "@/push";
import { NoopRealtimePublisher } from "@/realtime";
import {
  correctEditorialContentItem,
  regenerateEditorialContentItem,
  retractEditorialContentItem,
} from "./editorial";

const marker = `editorial-${randomUUID()}`;

let handle: DbHandle;
let actorUserId: string;

class FailingJudge implements LlmJudge {
  readonly requests: LlmJudgeRequest[] = [];

  async score(request: LlmJudgeRequest): Promise<LlmJudgeScore> {
    this.requests.push(request);
    return {
      authenticity: 0,
      leakedTokens: [],
      leakage: false,
      matchedLeagueFacts: [],
      matchedPersonaMarkers: [],
      notes: ["Forced failure for editorial regenerate."],
      personaMatch: 0,
      targetedOffLimits: [],
      targetingConsent: true,
    };
  }
}

class RaceRetractLlmClient implements LlmClient {
  private readonly delegate = new MockLlmClient();

  constructor(
    private readonly input: { contentItemId: string; leagueId: string },
  ) {}

  async generate(request: LlmGenerateRequest) {
    await withLeagueContext(handle.db, this.input.leagueId, async (tx) => {
      await tx
        .update(contentItems)
        .set({
          status: "retracted",
          statusChangedAt: new Date("2026-07-09T14:00:30.000Z"),
        })
        .where(eq(contentItems.id, this.input.contentItemId));
    });
    return this.delegate.generate(request);
  }
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: `${marker} ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 2,
      sport: "ffl",
      status: "in_season",
    })
    .returning({ id: leagues.id, providerLeagueId: leagues.providerLeagueId });
  if (!league) {
    throw new Error("league was not inserted");
  }

  await withLeagueContext(handle.db, league.id, async (tx) => {
    await tx.insert(fantasyMembers).values({
      contentHash: `${marker}-${tag}-member-hash`,
      displayName: `${tag} Manager`,
      leagueId: league.id,
      leagueProviderId: league.providerLeagueId,
      provider: "espn",
      providerMemberId: `${tag}-manager`,
      role: "member",
      season: 2026,
    });
    await tx.insert(fantasyTeams).values({
      abbrev: tag.slice(0, 3).toUpperCase(),
      contentHash: `${marker}-${tag}-team-hash`,
      leagueId: league.id,
      leagueProviderId: league.providerLeagueId,
      losses: 1,
      name: `${tag} Team`,
      ownerMemberIds: [`${tag}-manager`],
      pointsAgainst: 92,
      pointsFor: 130,
      provider: "espn",
      providerTeamId: `${tag}-team`,
      season: 2026,
      ties: 0,
      wins: 3,
    });
  });

  return league;
}

async function seedPost(
  leagueId: string,
  tag: string,
  metadata: Record<string, unknown> = {
    contentType: "weekly_recap",
    section: "recaps",
    tags: [`${tag} Team`],
  },
) {
  const [post] = await withLeagueContext(handle.db, leagueId, (tx) =>
    tx
      .insert(contentItems)
      .values({
        authorPersona: "narrator",
        body: `${tag} original body`,
        contentHash: `${marker}-${tag}-post-hash`,
        dedupKey: `${marker}-${tag}-post`,
        kind: "blog",
        leagueId,
        metadata,
        publishedAt: new Date("2026-07-09T12:00:00.000Z"),
        summary: `${tag} original summary`,
        title: `${tag} original title`,
      })
      .returning({
        dedupKey: contentItems.dedupKey,
        id: contentItems.id,
      }),
  );
  if (!post) {
    throw new Error("post was not inserted");
  }
  return post;
}

async function seedFinalMatchup(
  league: { id: string; providerLeagueId: string },
  tag: string,
) {
  const [matchup] = await withLeagueContext(handle.db, league.id, (tx) =>
    tx
      .insert(fantasyMatchups)
      .values({
        awayScore: 98,
        awayTeamProviderId: null,
        contentHash: `${marker}-${tag}-matchup-hash`,
        homeScore: 122,
        homeTeamProviderId: `${tag}-team`,
        leagueId: league.id,
        leagueProviderId: league.providerLeagueId,
        provider: "espn",
        providerMatchupId: `${tag}-matchup-1`,
        scoringPeriod: 3,
        season: 2026,
        status: "final",
        winner: "home",
      })
      .returning({ id: fantasyMatchups.id }),
  );
  if (!matchup) {
    throw new Error("matchup was not inserted");
  }
  return matchup;
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable - start the local stack with `pnpm db:up` before running tests.",
      { cause },
    );
  }
  await migrateSerialized(handle);

  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: "Editorial Actor",
      email: `${marker}-actor@example.test`,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("actor user was not inserted");
  }
  actorUserId = user.id;
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(contentItems)
    .where(sql`${contentItems.dedupKey} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("editorial content actions", () => {
  it("retracts once, requires a reason, and records one append-only action", async () => {
    const league = await seedLeague("retract");
    const post = await seedPost(league.id, "retract");

    const first = await retractEditorialContentItem(
      {
        db: handle.db,
        now: () => new Date("2026-07-09T13:00:00.000Z"),
        push: new NoopPushNotifier(),
        realtime: new NoopRealtimePublisher(),
      },
      {
        actorUserId,
        contentItemId: post.id,
        leagueId: league.id,
        reason: "Score correction changed the premise.",
      },
    );
    const second = await retractEditorialContentItem(
      {
        db: handle.db,
        now: () => new Date("2026-07-09T13:05:00.000Z"),
        push: new NoopPushNotifier(),
        realtime: new NoopRealtimePublisher(),
      },
      {
        actorUserId,
        contentItemId: post.id,
        leagueId: league.id,
        reason: "Score correction changed the premise.",
      },
    );

    expect(first).toMatchObject({ status: "changed" });
    expect(second).toMatchObject({
      actionId: first.actionId,
      status: "already_current",
    });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      actions: await tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
      posts: await tx
        .select({ status: contentItems.status })
        .from(contentItems)
        .where(eq(contentItems.id, post.id)),
    }));

    expect(rows.posts).toEqual([{ status: "retracted" }]);
    expect(rows.actions).toHaveLength(1);
    expect(rows.actions[0]).toMatchObject({
      action: "retract",
      actorUserId,
      beforeContentItemId: post.id,
      reason: "Score correction changed the premise.",
      targetContentItemId: post.id,
    });

    await expect(
      retractEditorialContentItem(
        { db: handle.db },
        {
          actorUserId,
          contentItemId: post.id,
          leagueId: league.id,
          reason: "",
        },
      ),
    ).rejects.toMatchObject({ code: "EDITORIAL_REASON_REQUIRED" });
  });

  it("regenerates through the judge gate, then supersedes with replacement lineage", async () => {
    const league = await seedLeague("regen");
    const post = await seedPost(league.id, "regen");
    const judge = new MockLlmJudge();
    const deps = {
      ...createMockAiDependencies(handle.db),
      duplicateThreshold: 1.1,
      judge,
      now: () => new Date("2026-07-09T14:00:00.000Z"),
    };

    const first = await regenerateEditorialContentItem(deps, {
      actorUserId,
      contentItemId: post.id,
      leagueId: league.id,
      reason: "Redo with corrected score framing.",
    });
    const second = await regenerateEditorialContentItem(deps, {
      actorUserId,
      contentItemId: post.id,
      leagueId: league.id,
      reason: "Redo with corrected score framing.",
    });

    expect(first.status).toBe("published");
    expect(first.generation?.status).toBe("published");
    expect(second).toMatchObject({
      actionId: first.actionId,
      replacementContentItemId: first.replacementContentItemId,
      status: "already_current",
    });
    expect(judge.requests.length).toBeGreaterThanOrEqual(1);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      actions: await tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
      posts: await tx
        .select({
          dedupKey: contentItems.dedupKey,
          id: contentItems.id,
          status: contentItems.status,
          supersedesContentItemId: contentItems.supersedesContentItemId,
        })
        .from(contentItems)
        .where(eq(contentItems.leagueId, league.id)),
    }));
    const original = rows.posts.find((row) => row.id === post.id);
    const replacement = rows.posts.find(
      (row) => row.id === first.replacementContentItemId,
    );

    expect(original).toMatchObject({ status: "superseded" });
    expect(replacement).toMatchObject({
      dedupKey: supersedingContentDedupKey(post),
      status: "published",
      supersedesContentItemId: post.id,
    });
    expect(rows.actions).toHaveLength(1);
    expect(rows.actions[0]).toMatchObject({
      action: "regenerate",
      afterContentItemId: first.replacementContentItemId,
      beforeContentItemId: post.id,
      reason: "Redo with corrected score framing.",
    });
  });

  it("leaves the original published when regenerate fails the judge", async () => {
    const league = await seedLeague("judge-fail");
    const post = await seedPost(league.id, "judge-fail");
    const judge = new FailingJudge();
    const deps = {
      ...createMockAiDependencies(handle.db),
      duplicateThreshold: 1.1,
      judge,
      now: () => new Date("2026-07-09T15:00:00.000Z"),
    };

    const result = await regenerateEditorialContentItem(deps, {
      actorUserId,
      contentItemId: post.id,
      leagueId: league.id,
      reason: "Try a safer version.",
    });

    expect(result).toMatchObject({
      replacementContentItemId: null,
      status: "skipped",
    });
    expect(judge.requests).toHaveLength(2);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      actions: await tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
      posts: await tx
        .select({
          id: contentItems.id,
          status: contentItems.status,
          supersedesContentItemId: contentItems.supersedesContentItemId,
        })
        .from(contentItems)
        .where(eq(contentItems.leagueId, league.id)),
      runs: await tx
        .select({
          skipReason: aiGenerationRuns.skipReason,
          status: aiGenerationRuns.status,
        })
        .from(aiGenerationRuns)
        .where(
          and(
            eq(aiGenerationRuns.leagueId, league.id),
            sql`${aiGenerationRuns.triggerKey} like ${`weekly_recap:editorial-regenerate:${post.id}:%`}`,
          ),
        ),
    }));

    expect(rows.posts).toEqual([
      { id: post.id, status: "published", supersedesContentItemId: null },
    ]);
    expect(rows.runs).toEqual([
      {
        skipReason: expect.stringMatching(/^llm_judge:/),
        status: "skipped",
      },
    ]);
    expect(rows.actions).toHaveLength(1);
    expect(rows.actions[0]).toMatchObject({
      action: "regenerate",
      afterContentItemId: null,
      beforeContentItemId: post.id,
      reason: "Try a safer version.",
    });
  });

  it("records a new successful regenerate action after an earlier blocked attempt", async () => {
    const league = await seedLeague("blocked-then-success");
    const post = await seedPost(league.id, "blocked-then-success");
    const gatedDeps = {
      ...createMockAiDependencies(handle.db),
      entitlements: {
        entitlements: {
          caps: DEFAULT_ENTITLEMENT_CAPS,
          devOverride: false,
          gateArenaAdvanced: false,
        },
      },
      now: () => new Date("2026-07-09T16:00:00.000Z"),
    };

    const blocked = await regenerateEditorialContentItem(gatedDeps, {
      actorUserId,
      contentItemId: post.id,
      leagueId: league.id,
      reason: "Blocked until premium is enabled.",
    });
    expect(blocked).toMatchObject({
      replacementContentItemId: null,
      status: "blocked",
    });

    const successful = await regenerateEditorialContentItem(
      {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        now: () => new Date("2026-07-09T16:05:00.000Z"),
      },
      {
        actorUserId,
        contentItemId: post.id,
        leagueId: league.id,
        reason: "Premium enabled; publish the replacement.",
      },
    );

    expect(successful.status).toBe("published");
    expect(successful.actionId).not.toBe(blocked.actionId);

    const actions = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({
          afterContentItemId: editorialActions.afterContentItemId,
          id: editorialActions.id,
          reason: editorialActions.reason,
        })
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          afterContentItemId: null,
          id: blocked.actionId,
          reason: "Blocked until premium is enabled.",
        }),
        expect.objectContaining({
          afterContentItemId: successful.replacementContentItemId,
          id: successful.actionId,
          reason: "Premium enabled; publish the replacement.",
        }),
      ]),
    );
  });

  it("detects score corrections and publishes one labeled superseding correction", async () => {
    const league = await seedLeague("correction");
    const matchup = await seedFinalMatchup(league, "correction");
    const post = await seedPost(league.id, "correction", {
      contentType: "weekly_recap",
      references: {
        matchupWeeks: [{ scoringPeriod: 3, season: 2026 }],
      },
      section: "recaps",
      tags: ["correction Team"],
    });
    const correctedHash = "a".repeat(64);

    const corrections = await detectContentCorrectionsNeeded({
      changedFinalMatchups: [{ contentHash: correctedHash, id: matchup.id }],
      db: handle.db,
      leagueId: league.id,
    });

    expect(corrections).toEqual([
      expect.objectContaining({
        affectedWeeks: [{ scoringPeriod: 3, season: 2026 }],
        changedMatchups: [
          {
            contentHash: correctedHash,
            id: matchup.id,
            scoringPeriod: 3,
            season: 2026,
          },
        ],
        contentItemId: post.id,
        correctionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        leagueId: league.id,
      }),
    ]);

    const judge = new MockLlmJudge();
    const deps = {
      ...createMockAiDependencies(handle.db),
      duplicateThreshold: 1.1,
      judge,
      now: () => new Date("2026-07-09T17:00:00.000Z"),
    };
    const correction = corrections[0];
    if (!correction) {
      throw new Error("expected a correction candidate");
    }
    const first = await correctEditorialContentItem(deps, correction);
    const second = await correctEditorialContentItem(deps, correction);

    expect(first).toMatchObject({
      originalContentItemId: post.id,
      status: "published",
    });
    expect(second).toMatchObject({
      actionId: first.actionId,
      replacementContentItemId: first.replacementContentItemId,
      status: "already_current",
    });
    expect(judge.requests.length).toBeGreaterThanOrEqual(1);
    expect(judge.requests[0]?.piece.title).toMatch(/^Correction:/);

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      actions: await tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
      posts: await tx
        .select({
          id: contentItems.id,
          metadata: contentItems.metadata,
          status: contentItems.status,
          supersedesContentItemId: contentItems.supersedesContentItemId,
          title: contentItems.title,
        })
        .from(contentItems)
        .where(eq(contentItems.leagueId, league.id)),
    }));
    const original = rows.posts.find((row) => row.id === post.id);
    const replacement = rows.posts.find(
      (row) => row.id === first.replacementContentItemId,
    );

    expect(original).toMatchObject({ status: "superseded" });
    expect(replacement).toMatchObject({
      status: "published",
      supersedesContentItemId: post.id,
      title: expect.stringMatching(/^Correction:/),
    });
    expect(replacement?.metadata).toMatchObject({
      editorial: {
        correctionHash: correction.correctionHash,
        kind: "correction",
        originalContentItemId: post.id,
      },
      references: {
        matchupWeeks: [{ scoringPeriod: 3, season: 2026 }],
      },
    });
    expect(rows.actions).toHaveLength(1);
    expect(rows.actions[0]).toMatchObject({
      action: "correct",
      afterContentItemId: first.replacementContentItemId,
      beforeContentItemId: post.id,
      reason: correction.reason,
      targetContentItemId: post.id,
    });
    expect(rows.actions[0]?.metadata).toMatchObject({
      correctionHash: correction.correctionHash,
      triggerKey: expect.stringMatching(
        new RegExp(`^correction:${post.id}:${correction.correctionHash}:`),
      ),
    });

    const afterLedger = await detectContentCorrectionsNeeded({
      changedFinalMatchups: [{ contentHash: correctedHash, id: matchup.id }],
      db: handle.db,
      leagueId: league.id,
    });
    expect(afterLedger).toEqual([]);
  });

  it("withdraws a raced replacement and skips the ledger when supersede conflicts", async () => {
    const league = await seedLeague("regen-race");
    const post = await seedPost(league.id, "regen-race");
    const deps = {
      ...createMockAiDependencies(handle.db),
      duplicateThreshold: 1.1,
      llm: new RaceRetractLlmClient({
        contentItemId: post.id,
        leagueId: league.id,
      }),
      now: () => new Date("2026-07-09T14:00:00.000Z"),
    };

    const result = await regenerateEditorialContentItem(deps, {
      actorUserId,
      contentItemId: post.id,
      leagueId: league.id,
      reason: "Race the original state.",
    });

    expect(result).toMatchObject({
      actionId: null,
      replacementContentItemId: null,
      status: "conflict",
    });

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      actions: await tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
      posts: await tx
        .select({
          id: contentItems.id,
          status: contentItems.status,
          supersedesContentItemId: contentItems.supersedesContentItemId,
        })
        .from(contentItems)
        .where(eq(contentItems.leagueId, league.id)),
    }));
    expect(rows.actions).toEqual([]);
    expect(rows.posts.find((row) => row.id === post.id)).toMatchObject({
      status: "retracted",
    });
    expect(
      rows.posts.find((row) => row.supersedesContentItemId === post.id),
    ).toMatchObject({ status: "retracted" });
  });

  it("regenerates a dead-end superseded original and permits retracting it", async () => {
    const league = await seedLeague("dead-end");
    const post = await seedPost(league.id, "dead-end");
    const deps = {
      ...createMockAiDependencies(handle.db),
      duplicateThreshold: 1.1,
      now: () => new Date("2026-07-09T18:00:00.000Z"),
    };

    const first = await regenerateEditorialContentItem(deps, {
      actorUserId,
      contentItemId: post.id,
      leagueId: league.id,
      reason: "First replacement.",
    });
    expect(first.status).toBe("published");
    if (!first.replacementContentItemId) {
      throw new Error("expected first replacement");
    }

    await retractEditorialContentItem(
      {
        db: handle.db,
        now: () => new Date("2026-07-09T18:05:00.000Z"),
      },
      {
        actorUserId,
        contentItemId: first.replacementContentItemId,
        leagueId: league.id,
        reason: "Replacement crossed a line.",
      },
    );

    const second = await regenerateEditorialContentItem(
      {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        now: () => new Date("2026-07-09T18:10:00.000Z"),
      },
      {
        actorUserId,
        contentItemId: post.id,
        leagueId: league.id,
        reason: "Replace the retracted replacement.",
      },
    );
    expect(second.status).toBe("published");
    expect(second.replacementContentItemId).not.toBe(
      first.replacementContentItemId,
    );

    const retractOriginal = await retractEditorialContentItem(
      {
        db: handle.db,
        now: () => new Date("2026-07-09T18:15:00.000Z"),
      },
      {
        actorUserId,
        contentItemId: post.id,
        leagueId: league.id,
        reason: "Hide the superseded original too.",
      },
    );
    expect(retractOriginal.status).toBe("changed");

    const rows = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({
          id: contentItems.id,
          status: contentItems.status,
          supersedesContentItemId: contentItems.supersedesContentItemId,
        })
        .from(contentItems)
        .where(eq(contentItems.leagueId, league.id)),
    );
    expect(rows.find((row) => row.id === post.id)).toMatchObject({
      status: "retracted",
    });
    expect(
      rows.find((row) => row.id === first.replacementContentItemId),
    ).toMatchObject({ status: "retracted" });
    expect(
      rows.find((row) => row.id === second.replacementContentItemId),
    ).toMatchObject({ status: "published", supersedesContentItemId: post.id });
  });

  it("does not ledger skipped corrections and allows a later correction attempt", async () => {
    const league = await seedLeague("skipped-correction");
    const post = await seedPost(league.id, "skipped-correction", {
      contentType: "weekly_recap",
      references: {
        matchupWeeks: [{ scoringPeriod: 4, season: 2026 }],
      },
      section: "recaps",
      tags: ["skipped-correction Team"],
    });
    const correction = {
      affectedWeeks: [{ scoringPeriod: 4, season: 2026 }],
      changedMatchups: [
        {
          contentHash: "d".repeat(64),
          id: randomUUID(),
          scoringPeriod: 4,
          season: 2026,
        },
      ],
      contentItemId: post.id,
      correctionHash: "c".repeat(64),
      leagueId: league.id,
      reason: "Correct a skipped post.",
    };

    const skipped = await correctEditorialContentItem(
      {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        judge: new FailingJudge(),
        now: () => new Date("2026-07-09T19:00:00.000Z"),
      },
      correction,
    );
    expect(skipped).toMatchObject({ actionId: null, status: "skipped" });

    const afterSkipped = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
    );
    expect(afterSkipped).toEqual([]);

    const published = await correctEditorialContentItem(
      {
        ...createMockAiDependencies(handle.db),
        duplicateThreshold: 1.1,
        now: () => new Date("2026-07-09T19:05:00.000Z"),
      },
      correction,
    );
    expect(published.status).toBe("published");

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      actions: await tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
      runs: await tx
        .select({ triggerKey: aiGenerationRuns.triggerKey })
        .from(aiGenerationRuns)
        .where(eq(aiGenerationRuns.leagueId, league.id)),
    }));
    expect(rows.actions).toHaveLength(1);
    expect(rows.actions[0]).toMatchObject({ action: "correct" });
    expect(
      rows.runs.filter((run) =>
        run.triggerKey.startsWith(`weekly_recap:correction:${post.id}:`),
      ),
    ).toHaveLength(2);
  });

  it("rolls back a lifecycle status change when the audit row cannot insert", async () => {
    const league = await seedLeague("atomic-retract");
    const post = await seedPost(league.id, "atomic-retract");

    await expect(
      retractEditorialContentItem(
        {
          db: handle.db,
          now: () => new Date("2026-07-09T20:00:00.000Z"),
        },
        {
          actorUserId: randomUUID(),
          contentItemId: post.id,
          leagueId: league.id,
          reason: "This should roll back.",
        },
      ),
    ).rejects.toThrow();

    const rows = await withLeagueContext(handle.db, league.id, async (tx) => ({
      actions: await tx
        .select()
        .from(editorialActions)
        .where(eq(editorialActions.targetContentItemId, post.id)),
      posts: await tx
        .select({ status: contentItems.status })
        .from(contentItems)
        .where(eq(contentItems.id, post.id)),
    }));
    expect(rows.posts).toEqual([{ status: "published" }]);
    expect(rows.actions).toEqual([]);
  });

  it("keeps editorial audit rows when a target content item is hard-deleted", async () => {
    const league = await seedLeague("audit-set-null");
    const post = await seedPost(league.id, "audit-set-null");

    const retracted = await retractEditorialContentItem(
      {
        db: handle.db,
        now: () => new Date("2026-07-09T21:00:00.000Z"),
      },
      {
        actorUserId,
        contentItemId: post.id,
        leagueId: league.id,
        reason: "Keep the audit trail.",
      },
    );
    expect(retracted.actionId).toEqual(expect.any(String));

    await withLeagueContext(handle.db, league.id, async (tx) => {
      await tx.delete(contentItems).where(eq(contentItems.id, post.id));
    });

    const rows = await withLeagueContext(handle.db, league.id, (tx) =>
      tx
        .select({
          action: editorialActions.action,
          beforeContentItemId: editorialActions.beforeContentItemId,
          reason: editorialActions.reason,
          targetContentItemId: editorialActions.targetContentItemId,
        })
        .from(editorialActions)
        .where(eq(editorialActions.id, retracted.actionId ?? "")),
    );

    expect(rows).toEqual([
      {
        action: "retract",
        beforeContentItemId: null,
        reason: "Keep the audit trail.",
        targetContentItemId: null,
      },
    ]);
  });
});
