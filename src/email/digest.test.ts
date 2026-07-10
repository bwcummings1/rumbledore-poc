// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  emailDigestDeliveryRecords,
  leagues,
  members,
  pushNotificationPreferences,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  MockEmailSender,
  sendWeeklyDigestForLeague,
  sendWeeklyDigests,
  weeklyDigestKey,
} from "./digest";

const marker = `digest-${randomUUID()}`;

let handle: DbHandle;
let leagueId: string;
let userAId: string;
let userBId: string;
let userAEmail: string;
let userBEmail: string;

async function seedLeague() {
  const [userA, userB] = await handle.db
    .insert(users)
    .values([
      {
        displayName: "Digest User A",
        email: `${marker}-a@example.test`,
      },
      {
        displayName: "Digest User B",
        email: `${marker}-b@example.test`,
      },
    ])
    .returning();
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 7,
      name: `${marker} League`,
      provider: "espn",
      providerLeagueId: marker,
      season: 2026,
      size: 12,
      sport: "ffl",
      status: "in_season",
    })
    .returning();

  if (!userA || !userB || !league) {
    throw new Error("digest test fixtures were not inserted");
  }

  userAId = userA.id;
  userBId = userB.id;
  userAEmail = userA.email;
  userBEmail = userB.email;
  leagueId = league.id;

  await handle.db.insert(members).values([
    {
      organizationId: leagueId,
      role: "member",
      userId: userAId,
    },
    {
      organizationId: leagueId,
      role: "member",
      userId: userBId,
    },
  ]);

  await withLeagueContext(handle.db, leagueId, (tx) =>
    tx.insert(pushNotificationPreferences).values({
      channel: "none",
      enabled: false,
      eventFamily: "content",
      leagueId,
      type: "league.blog.published",
      userId: userBId,
    }),
  );
}

async function insertContent(input: {
  body?: string;
  dedupSuffix: string;
  publishedAt: Date;
  status?: "published" | "retracted" | "superseded";
  summary?: string;
  title: string;
}) {
  const [content] = await withLeagueContext(handle.db, leagueId, (tx) =>
    tx
      .insert(contentItems)
      .values({
        authorPersona: "narrator",
        body: input.body ?? `${input.title} body`,
        contentHash: `${marker}-${input.dedupSuffix}-hash`,
        dedupKey: `${marker}-${input.dedupSuffix}`,
        kind: "blog",
        leagueId,
        publishedAt: input.publishedAt,
        status: input.status ?? "published",
        summary: input.summary ?? `${input.title} summary`,
        title: input.title,
      })
      .returning(),
  );
  if (!content) {
    throw new Error("digest test content was not inserted");
  }
  return content;
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
  await seedLeague();
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} = ${marker}`);
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%@example.test`}`);
  await handle.pool.end();
});

describe("weekly digest email", () => {
  it("sends an idempotent mock digest with published content and opt-out filtering", async () => {
    const published = await insertContent({
      body: "PRIVATE BODY SHOULD NOT ENTER THE DIGEST",
      dedupSuffix: "published",
      publishedAt: new Date("2026-06-10T12:00:00.000Z"),
      summary: "The week had one visible recap.",
      title: "Visible digest recap",
    });
    await insertContent({
      dedupSuffix: "retracted",
      publishedAt: new Date("2026-06-10T13:00:00.000Z"),
      status: "retracted",
      title: "Retracted digest recap",
    });
    await insertContent({
      dedupSuffix: "outside-window",
      publishedAt: new Date("2026-05-01T12:00:00.000Z"),
      title: "Old digest recap",
    });
    const sender = new MockEmailSender();
    const input = {
      leagueId,
      windowEnd: new Date("2026-06-14T00:00:00.000Z"),
      windowStart: new Date("2026-06-07T00:00:00.000Z"),
    };

    await expect(
      sendWeeklyDigestForLeague(
        {
          appUrl: "https://app.example.test",
          db: handle.db,
          emailSender: sender,
          now: () => new Date("2026-06-14T00:00:00.000Z"),
        },
        input,
      ),
    ).resolves.toMatchObject({
      contentCount: 1,
      delivered: 1,
      empty: false,
      failed: 0,
      recipientCount: 1,
      skipped: 0,
    });

    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]).toMatchObject({
      recipient: { email: userAEmail, userId: userAId },
      subject: `${marker} League weekly digest`,
    });
    expect(sender.messages[0]?.html).toContain("Visible digest recap");
    expect(sender.messages[0]?.html).not.toContain("Retracted digest recap");
    expect(sender.messages[0]?.html).not.toContain("Old digest recap");
    expect(sender.messages[0]?.html).not.toContain(
      "PRIVATE BODY SHOULD NOT ENTER THE DIGEST",
    );

    const records = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(emailDigestDeliveryRecords)
        .where(eq(emailDigestDeliveryRecords.recipientUserId, userAId)),
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      contentItemIds: [published.id],
      deliveryMode: "mock",
      deliveryStatus: "delivered",
      digestKey: `weekly:${leagueId}:2026-W24`,
      leagueId,
      recipientUserId: userAId,
    });
    expect(JSON.stringify(records[0]?.payload)).toContain(
      "Visible digest recap",
    );
    expect(JSON.stringify(records[0]?.payload)).not.toContain(userAEmail);
    expect(JSON.stringify(records[0]?.payload)).not.toContain(userBEmail);
    expect(JSON.stringify(records[0]?.payload)).not.toContain(
      "PRIVATE BODY SHOULD NOT ENTER THE DIGEST",
    );

    await expect(
      sendWeeklyDigestForLeague(
        {
          appUrl: "https://app.example.test",
          db: handle.db,
          emailSender: sender,
          now: () => new Date("2026-06-14T00:00:00.000Z"),
        },
        input,
      ),
    ).resolves.toMatchObject({
      delivered: 0,
      skipped: 1,
    });
    expect(sender.messages).toHaveLength(1);
  });

  it("does not send a digest for an empty week", async () => {
    const sender = new MockEmailSender();

    await expect(
      sendWeeklyDigestForLeague(
        {
          appUrl: "https://app.example.test",
          db: handle.db,
          emailSender: sender,
          now: () => new Date("2026-08-14T00:00:00.000Z"),
        },
        {
          leagueId,
          windowEnd: new Date("2026-08-14T00:00:00.000Z"),
          windowStart: new Date("2026-08-07T00:00:00.000Z"),
        },
      ),
    ).resolves.toMatchObject({
      contentCount: 0,
      delivered: 0,
      empty: true,
      failed: 0,
      skipped: 0,
    });
    expect(sender.messages).toHaveLength(0);
  });

  it("uses deterministic per-league ISO-week digest keys", () => {
    const window = {
      end: new Date("2026-06-14T00:00:00.999Z"),
      start: new Date("2026-06-07T00:00:00.123Z"),
    };
    expect(weeklyDigestKey({ leagueId, window })).toBe(
      `weekly:${leagueId}:2026-W24`,
    );
    expect(
      weeklyDigestKey({
        leagueId,
        window: {
          end: new Date("2026-06-14T00:00:00.001Z"),
          start: new Date("2026-06-07T00:00:00.001Z"),
        },
      }),
    ).toBe(`weekly:${leagueId}:2026-W24`);
    expect(weeklyDigestKey({ leagueId: "other-league", window })).toBe(
      "weekly:other-league:2026-W24",
    );
  });

  it("does not cap explicit digest batches to the page size", async () => {
    const rows = await handle.db
      .insert(leagues)
      .values(
        Array.from({ length: 6 }, (_, index) => ({
          currentScoringPeriod: 7,
          name: `${marker} Batch ${index}`,
          provider: "espn" as const,
          providerLeagueId: `${marker}-batch-${index}`,
          season: 2026,
          size: 12,
          sport: "ffl" as const,
          status: "in_season" as const,
        })),
      )
      .returning({ id: leagues.id });
    const sender = new MockEmailSender();

    await expect(
      sendWeeklyDigests(
        {
          appUrl: "https://app.example.test",
          db: handle.db,
          emailSender: sender,
          now: () => new Date("2026-09-14T00:00:00.000Z"),
        },
        {
          leagueIds: rows.map((row) => row.id),
          limit: 2,
          windowEnd: new Date("2026-09-14T00:00:00.000Z"),
          windowStart: new Date("2026-09-07T00:00:00.000Z"),
        },
      ),
    ).resolves.toMatchObject({
      delivered: 0,
      failed: 0,
      leagueCount: 6,
      skipped: 0,
    });
  });

  it("records mock email failures for visibility", async () => {
    await insertContent({
      dedupSuffix: "failed-window",
      publishedAt: new Date("2026-07-10T12:00:00.000Z"),
      title: "Failure digest recap",
    });
    const sender = new MockEmailSender({ failUserIds: new Set([userAId]) });

    await expect(
      sendWeeklyDigestForLeague(
        {
          appUrl: "https://app.example.test",
          db: handle.db,
          emailSender: sender,
          now: () => new Date("2026-07-14T00:00:00.000Z"),
        },
        {
          leagueId,
          windowEnd: new Date("2026-07-14T00:00:00.000Z"),
          windowStart: new Date("2026-07-07T00:00:00.000Z"),
        },
      ),
    ).resolves.toMatchObject({
      delivered: 0,
      failed: 1,
      skipped: 0,
    });

    const rows = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(emailDigestDeliveryRecords)
        .where(eq(emailDigestDeliveryRecords.recipientUserId, userAId)),
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deliveryStatus: "failed",
          errorMessage: "Mock email delivery failed",
        }),
      ]),
    );
  });

  it("strips newlines from digest subjects", async () => {
    await handle.db
      .update(leagues)
      .set({ name: `${marker}\nLeague` })
      .where(eq(leagues.id, leagueId));
    await insertContent({
      dedupSuffix: "subject-window",
      publishedAt: new Date("2026-10-10T12:00:00.000Z"),
      title: "Subject digest recap",
    });
    const sender = new MockEmailSender();

    await sendWeeklyDigestForLeague(
      {
        appUrl: "https://app.example.test",
        db: handle.db,
        emailSender: sender,
        now: () => new Date("2026-10-14T00:00:00.000Z"),
      },
      {
        leagueId,
        windowEnd: new Date("2026-10-14T00:00:00.000Z"),
        windowStart: new Date("2026-10-07T00:00:00.000Z"),
      },
    );

    expect(sender.messages[0]?.subject).toBe(`${marker} League weekly digest`);
  });
});
