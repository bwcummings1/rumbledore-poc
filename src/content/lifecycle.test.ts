// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import { contentItems, leagues } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { RecordingPushNotifier } from "@/push";
import { REALTIME_EVENTS, RecordingRealtimePublisher } from "@/realtime";
import {
  retractContentItem,
  supersedeContentItem,
  supersedingContentDedupKey,
} from "./lifecycle";

const marker = `content-lifecycle-${randomUUID()}`;

let handle: DbHandle;
let leagueId: string;

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

  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: "Content Lifecycle League",
      provider: "espn",
      providerLeagueId: marker,
      season: 2026,
      sport: "ffl",
    })
    .returning({ id: leagues.id });
  if (!league) {
    throw new Error("league was not inserted");
  }
  leagueId = league.id;
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(contentItems)
    .where(sql`${contentItems.dedupKey} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} = ${marker}`);
  await handle.pool.end();
});

describe("content lifecycle", () => {
  it("retracts a published content item once and emits lifecycle fan-out", async () => {
    const realtime = new RecordingRealtimePublisher();
    const push = new RecordingPushNotifier();
    const now = new Date("2026-07-09T12:00:00.000Z");
    const [post] = await withLeagueContext(handle.db, leagueId, async (tx) =>
      tx
        .insert(contentItems)
        .values({
          authorPersona: "commissioner",
          body: "Retracted body",
          contentHash: `${marker}-retract-hash`,
          dedupKey: `${marker}-retract`,
          kind: "blog",
          leagueId,
          publishedAt: new Date("2026-07-09T11:00:00.000Z"),
          summary: "Retracted summary",
          title: "Retracted column",
        })
        .returning({ id: contentItems.id }),
    );
    if (!post) {
      throw new Error("post was not inserted");
    }

    const first = await retractContentItem(
      {
        db: handle.db,
        now: () => now,
        push,
        realtime,
      },
      {
        contentItemId: post.id,
        leagueId,
      },
    );

    expect(first).toMatchObject({
      contentItemId: post.id,
      previousStatus: "published",
      status: "changed",
      statusChangedAt: now.toISOString(),
    });
    expect(realtime.contentRetracted).toEqual([
      {
        at: now.toISOString(),
        contentItemId: post.id,
        leagueId,
        statusChangedAt: now.toISOString(),
        title: "Retracted column",
        type: REALTIME_EVENTS.contentRetracted,
        v: 1,
      },
    ]);
    expect(push.notifications).toEqual([
      expect.objectContaining({
        leagueId,
        title: "Post retracted",
        type: "content.retracted",
        url: `/leagues/${leagueId}/press/${post.id}`,
      }),
    ]);

    const second = await retractContentItem(
      {
        db: handle.db,
        now: () => new Date("2026-07-09T12:05:00.000Z"),
        push,
        realtime,
      },
      {
        contentItemId: post.id,
        leagueId,
      },
    );

    expect(second).toMatchObject({
      contentItemId: post.id,
      previousStatus: "retracted",
      status: "already_current",
      statusChangedAt: now.toISOString(),
    });
    expect(realtime.contentRetracted).toHaveLength(1);
    expect(push.notifications).toHaveLength(1);
  });

  it("supersedes a published item idempotently with a deterministic replacement dedup key", async () => {
    const realtime = new RecordingRealtimePublisher();
    const push = new RecordingPushNotifier();
    const now = new Date("2026-07-09T13:00:00.000Z");

    const [original] = await withLeagueContext(
      handle.db,
      leagueId,
      async (tx) =>
        tx
          .insert(contentItems)
          .values({
            authorPersona: "analyst",
            body: "Original body",
            contentHash: `${marker}-supersede-original-hash`,
            dedupKey: `${marker}-supersede-original`,
            kind: "blog",
            leagueId,
            publishedAt: new Date("2026-07-09T12:30:00.000Z"),
            summary: "Original summary",
            title: "Original column",
          })
          .returning({ dedupKey: contentItems.dedupKey, id: contentItems.id }),
    );
    if (!original) {
      throw new Error("original post was not inserted");
    }
    const replacementDedupKey = supersedingContentDedupKey(original);
    expect(supersedingContentDedupKey(original)).toBe(replacementDedupKey);

    const [replacement] = await withLeagueContext(
      handle.db,
      leagueId,
      async (tx) =>
        tx
          .insert(contentItems)
          .values({
            authorPersona: "analyst",
            body: "Replacement body",
            contentHash: `${marker}-supersede-replacement-hash`,
            dedupKey: replacementDedupKey,
            kind: "blog",
            leagueId,
            publishedAt: new Date("2026-07-09T12:45:00.000Z"),
            summary: "Replacement summary",
            supersedesContentItemId: original.id,
            title: "Replacement column",
          })
          .returning({ id: contentItems.id }),
    );
    if (!replacement) {
      throw new Error("replacement post was not inserted");
    }

    const first = await supersedeContentItem(
      {
        db: handle.db,
        now: () => now,
        push,
        realtime,
      },
      {
        contentItemId: original.id,
        leagueId,
        replacementContentItemId: replacement.id,
      },
    );

    expect(first).toMatchObject({
      contentItemId: original.id,
      previousStatus: "published",
      status: "changed",
      statusChangedAt: now.toISOString(),
    });
    expect(realtime.contentSuperseded).toEqual([
      {
        at: now.toISOString(),
        contentItemId: original.id,
        leagueId,
        replacementContentItemId: replacement.id,
        statusChangedAt: now.toISOString(),
        title: "Original column",
        type: REALTIME_EVENTS.contentSuperseded,
        v: 1,
      },
    ]);
    expect(push.notifications).toEqual([
      expect.objectContaining({
        leagueId,
        title: "Post updated",
        type: "content.superseded",
        url: `/leagues/${leagueId}/press/${replacement.id}`,
      }),
    ]);

    const second = await supersedeContentItem(
      {
        db: handle.db,
        now: () => new Date("2026-07-09T13:05:00.000Z"),
        push,
        realtime,
      },
      {
        contentItemId: original.id,
        leagueId,
        replacementContentItemId: replacement.id,
      },
    );

    expect(second).toMatchObject({
      contentItemId: original.id,
      previousStatus: "superseded",
      status: "already_current",
      statusChangedAt: now.toISOString(),
    });
    expect(realtime.contentSuperseded).toHaveLength(1);
    expect(push.notifications).toHaveLength(1);
  });
});
