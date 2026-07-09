// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import type { AppError } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import {
  contentItems,
  contentReactions,
  leagues,
  members,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { setContentReaction } from "./reactions";

const marker = `reaction-${randomUUID()}`;

let handle: DbHandle;
let leagueId: string;
let userId: string;
let secondUserId: string;
let contentItemId: string;

function countFor(
  summary: Awaited<ReturnType<typeof setContentReaction>>,
  emoji: "fire" | "skull" | "laugh" | "trash",
) {
  return summary.counts.find((count) => count.emoji === emoji)?.count ?? 0;
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await migrateSerialized(handle);

  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: `${marker} league`,
      provider: "espn",
      providerLeagueId: marker,
    })
    .returning({ id: leagues.id });
  if (!league) throw new Error("league insert failed");
  leagueId = league.id;

  const [user, secondUser] = await handle.db
    .insert(users)
    .values([
      { displayName: "Reaction One", email: `${marker}-one@example.test` },
      { displayName: "Reaction Two", email: `${marker}-two@example.test` },
    ])
    .returning({ id: users.id });
  if (!user || !secondUser) throw new Error("user insert failed");
  userId = user.id;
  secondUserId = secondUser.id;

  await handle.db.insert(members).values([
    { organizationId: leagueId, role: "member", userId },
    { organizationId: leagueId, role: "member", userId: secondUserId },
  ]);

  const [post] = await handle.db
    .insert(contentItems)
    .values({
      authorPersona: "trash_talker",
      body: "Reaction body",
      contentHash: `${marker}-post-hash`,
      dedupKey: `${marker}-post`,
      kind: "blog",
      leagueId,
      summary: "Reaction summary",
      title: "Reaction post",
    })
    .returning({ id: contentItems.id });
  if (!post) throw new Error("content insert failed");
  contentItemId = post.id;
});

afterAll(async () => {
  await handle?.pool.end();
});

describe("content reactions", () => {
  it("casts and recasts one reaction per member", async () => {
    const cast = await setContentReaction(
      { db: handle.db, now: () => new Date("2026-07-09T12:00:00.000Z") },
      { contentItemId, emoji: "fire", leagueId, userId },
    );

    expect(cast.currentEmoji).toBe("fire");
    expect(cast.total).toBe(1);
    expect(countFor(cast, "fire")).toBe(1);

    const recast = await setContentReaction(
      { db: handle.db, now: () => new Date("2026-07-09T12:01:00.000Z") },
      { contentItemId, emoji: "skull", leagueId, userId },
    );

    expect(recast.currentEmoji).toBe("skull");
    expect(recast.total).toBe(1);
    expect(countFor(recast, "fire")).toBe(0);
    expect(countFor(recast, "skull")).toBe(1);

    const rows = await handle.db
      .select()
      .from(contentReactions)
      .where(eq(contentReactions.contentItemId, contentItemId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.emoji).toBe("skull");
  });

  it("aggregates multiple members while returning the actor's current emoji", async () => {
    const summary = await setContentReaction(
      { db: handle.db },
      { contentItemId, emoji: "laugh", leagueId, userId: secondUserId },
    );

    expect(summary.currentEmoji).toBe("laugh");
    expect(summary.total).toBe(2);
    expect(countFor(summary, "skull")).toBe(1);
    expect(countFor(summary, "laugh")).toBe(1);
  });

  it("rejects reactions against retracted content", async () => {
    const [post] = await handle.db
      .insert(contentItems)
      .values({
        authorPersona: "trash_talker",
        body: "Retracted body",
        contentHash: `${marker}-retracted-hash`,
        dedupKey: `${marker}-retracted`,
        kind: "blog",
        leagueId,
        status: "retracted",
        summary: "Retracted summary",
        title: "Retracted post",
      })
      .returning({ id: contentItems.id });
    if (!post) throw new Error("retracted content insert failed");

    await expect(
      setContentReaction(
        { db: handle.db },
        { contentItemId: post.id, emoji: "trash", leagueId, userId },
      ),
    ).rejects.toMatchObject({
      code: "CONTENT_REACTION_TARGET_NOT_FOUND",
      status: 404,
    } satisfies Partial<AppError>);
  });
});
