// @vitest-environment node
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createMockAiDependencies,
  DEFAULT_TONE_PROFILES,
  editPersonaToneProfile,
  generateLeagueBlogPost,
  previewPersonaToneProfile,
  rollbackPersonaToneProfile,
} from "@/ai";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  aiPersonaCards,
  aiPersonaToneHistory,
  contentItems,
  editorialActions,
  fantasyMembers,
  fantasyTeams,
  leagues,
  members,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";

const marker = `toneeditor-${randomUUID()}`;
let handle: DbHandle;

async function seedLeague(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `${tag} Steward`,
      email: `${marker}-${tag}@example.test`,
    })
    .returning();
  if (!user) {
    throw new Error("user was not inserted");
  }

  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 7,
      name: `${marker} ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
      scoringType: "H2H_POINTS",
      season: 2026,
      size: 2,
      sport: "ffl",
      status: "in_season",
    })
    .returning();
  if (!league) {
    throw new Error("league was not inserted");
  }

  await handle.db.insert(members).values({
    organizationId: league.id,
    role: "data_steward",
    userId: user.id,
  });

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
      ownerMemberIds: [`${tag} Manager`],
      pointsAgainst: 95,
      pointsFor: 130,
      provider: "espn",
      providerTeamId: `${tag}-team`,
      season: 2026,
      ties: 0,
      wins: 2,
    });
  });

  return { league, user };
}

async function postBody(leagueId: string, dedupKey: string): Promise<string> {
  const [post] = await withLeagueContext(handle.db, leagueId, (tx) =>
    tx
      .select({ body: contentItems.body })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.leagueId, leagueId),
          eq(contentItems.dedupKey, dedupKey),
        ),
      )
      .limit(1),
  );
  return post?.body ?? "";
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
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("persona tone editor", () => {
  it("previews, saves, ledgers, and rolls back tone versions used by generation", async () => {
    const { league, user } = await seedLeague("narrator");
    const deps = createMockAiDependencies(handle.db);
    deps.duplicateThreshold = 1.1;

    const first = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "narrator",
        triggerKey: "tone-editor:default",
      },
    });
    expect(first).toMatchObject({ reused: false, status: "published" });

    const markerText = "tone-editor-marker";
    const customProfile = {
      ...DEFAULT_TONE_PROFILES.narrator,
      beats: [`${markerText} mythology desk`],
      diction: [markerText, "ledger mythology"],
      dosAndDonts: [`Do include ${markerText} in mock output.`],
      styleDirectives: [`${markerText} directive`],
    };

    const contentCountBeforePreview = await withLeagueContext(
      handle.db,
      league.id,
      (tx) =>
        tx
          .select({ id: contentItems.id })
          .from(contentItems)
          .where(eq(contentItems.leagueId, league.id)),
    );
    const preview = await previewPersonaToneProfile(
      { db: handle.db },
      {
        leagueId: league.id,
        persona: "narrator",
        toneProfile: customProfile,
      },
    );
    expect(preview.sampleParagraph).toContain(markerText);
    const contentCountAfterPreview = await withLeagueContext(
      handle.db,
      league.id,
      (tx) =>
        tx
          .select({ id: contentItems.id })
          .from(contentItems)
          .where(eq(contentItems.leagueId, league.id)),
    );
    expect(contentCountAfterPreview).toHaveLength(
      contentCountBeforePreview.length,
    );

    const edit = await editPersonaToneProfile(
      {
        db: handle.db,
        now: () => new Date("2026-07-09T12:00:00.000Z"),
      },
      {
        actorUserId: user.id,
        leagueId: league.id,
        persona: "narrator",
        reason: "Sharpen the myth desk.",
        toneProfile: customProfile,
      },
    );
    expect(edit).toMatchObject({
      previousToneVersion: 1,
      status: "changed",
    });
    expect(edit.card.toneVersion).toBe(2);

    const second = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "narrator",
        triggerKey: "tone-editor:custom",
      },
    });
    expect(second).toMatchObject({ reused: false, status: "published" });
    expect(
      await postBody(
        league.id,
        "blog:narrator:weekly_recap:tone-editor:custom",
      ),
    ).toContain(markerText);

    const rollback = await rollbackPersonaToneProfile(
      {
        db: handle.db,
        now: () => new Date("2026-07-09T13:00:00.000Z"),
      },
      {
        actorUserId: user.id,
        leagueId: league.id,
        persona: "narrator",
        reason: "Return to the baseline voice.",
        toneVersion: 1,
      },
    );
    expect(rollback).toMatchObject({
      previousToneVersion: 2,
      status: "changed",
    });
    expect(rollback.card.toneVersion).toBe(3);

    const third = await generateLeagueBlogPost({
      deps,
      input: {
        contentType: "weekly_recap",
        leagueId: league.id,
        persona: "narrator",
        triggerKey: "tone-editor:rollback",
      },
    });
    expect(third).toMatchObject({ reused: false, status: "published" });
    expect(
      await postBody(
        league.id,
        "blog:narrator:weekly_recap:tone-editor:rollback",
      ),
    ).not.toContain(markerText);

    const state = await withLeagueContext(handle.db, league.id, async (tx) => {
      const [card] = await tx
        .select({
          id: aiPersonaCards.id,
          toneVersion: aiPersonaCards.toneVersion,
        })
        .from(aiPersonaCards)
        .where(
          and(
            eq(aiPersonaCards.leagueId, league.id),
            eq(aiPersonaCards.persona, "narrator"),
          ),
        )
        .limit(1);
      const history = await tx
        .select({
          source: aiPersonaToneHistory.source,
          sourceToneVersion: aiPersonaToneHistory.sourceToneVersion,
          toneVersion: aiPersonaToneHistory.toneVersion,
        })
        .from(aiPersonaToneHistory)
        .where(eq(aiPersonaToneHistory.leagueId, league.id));
      const actions = await tx
        .select({
          action: editorialActions.action,
          metadata: editorialActions.metadata,
          reason: editorialActions.reason,
          targetPersonaCardId: editorialActions.targetPersonaCardId,
        })
        .from(editorialActions)
        .where(eq(editorialActions.leagueId, league.id));
      return { actions, card, history };
    });

    expect(state.card).toMatchObject({ toneVersion: 3 });
    expect(state.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "seed", toneVersion: 1 }),
        expect.objectContaining({ source: "edit", toneVersion: 2 }),
        expect.objectContaining({
          source: "rollback",
          sourceToneVersion: 1,
          toneVersion: 3,
        }),
      ]),
    );
    expect(state.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "tone_edit",
          reason: "Sharpen the myth desk.",
          targetPersonaCardId: state.card?.id,
        }),
        expect.objectContaining({
          action: "tone_rollback",
          reason: "Return to the baseline voice.",
          targetPersonaCardId: state.card?.id,
        }),
      ]),
    );
  });
});
