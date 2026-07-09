// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  leagues,
  leagueWebhooks,
  users,
  webhookDeliveryRecords,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { createCredentialCipher } from "@/onboarding/credential-crypto";
import {
  createLeagueWebhook,
  deleteLeagueWebhook,
  getLeagueWebhookManagerData,
  MockWebhookDeliverer,
  updateLeagueWebhook,
} from "./service";

const marker = `webhooks-${randomUUID()}`;
const encryptionKey = Array.from(
  { length: 4 },
  (_, index) => `webhook-fixture-part-${index}`,
).join("-");
const actorEmail = `${marker}@example.test`;

let handle: DbHandle;
let actorUserId: string;
let leagueId: string;

async function seedLeague() {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: "Webhook Test User",
      email: actorEmail,
    })
    .returning();
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: `${marker} League`,
      provider: "espn",
      providerLeagueId: marker,
      season: 2026,
      size: 10,
      sport: "ffl",
      status: "in_season",
    })
    .returning();

  if (!user || !league) {
    throw new Error("webhook test league was not inserted");
  }

  actorUserId = user.id;
  leagueId = league.id;
}

async function insertContent(input: {
  dedupSuffix: string;
  metadata?: Record<string, unknown>;
  status?: "published" | "retracted";
  title?: string;
}) {
  const [content] = await withLeagueContext(handle.db, leagueId, (tx) =>
    tx
      .insert(contentItems)
      .values({
        authorPersona: "commissioner",
        body: `Webhook body ${input.dedupSuffix}`,
        contentHash: `${marker}-${input.dedupSuffix}-hash`,
        dedupKey: `${marker}-${input.dedupSuffix}`,
        kind: "blog",
        leagueId,
        metadata: input.metadata ?? { leagueSection: "recaps" },
        status: input.status ?? "published",
        summary: `Webhook summary ${input.dedupSuffix}`,
        title: input.title ?? `Webhook story ${input.dedupSuffix}`,
      })
      .returning(),
  );

  if (!content) {
    throw new Error("webhook test content was not inserted");
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
  await handle.db.delete(users).where(eq(users.email, actorEmail));
  await handle.pool.end();
});

describe("league webhook CRUD", () => {
  it("stores encrypted URLs and exposes only redacted manager summaries", async () => {
    const secretUrl =
      "https://chat.example.test/hooks/super-secret-token?room=league";

    const result = await createLeagueWebhook(
      { db: handle.db, encryptionKey },
      {
        actorUserId,
        eventSelection: {
          contentSections: ["recaps"],
          events: ["content.published"],
        },
        leagueId,
        name: "League group chat",
        targetKind: "generic",
        url: secretUrl,
      },
    );

    expect(result).toMatchObject({
      status: "created",
      webhook: {
        eventSelection: {
          contentSections: ["recaps"],
          events: ["content.published"],
        },
        name: "League group chat",
        status: "active",
        targetKind: "generic",
        urlLabel: "chat.example.test / encrypted endpoint",
      },
    });
    expect(result.webhook?.urlHash).not.toContain("super-secret-token");

    const [stored] = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(leagueWebhooks)
        .where(eq(leagueWebhooks.id, result.webhook?.id ?? "")),
    );
    expect(stored?.encryptedUrl).toBeDefined();
    expect(stored?.encryptedUrl).not.toContain("super-secret-token");
    expect(stored?.encryptedUrl).not.toContain(secretUrl);
    expect(
      createCredentialCipher(encryptionKey).decryptJson<{ url: string }>(
        stored?.encryptedUrl ?? "",
      ),
    ).toEqual({ url: secretUrl });

    const data = await getLeagueWebhookManagerData(handle.db, { leagueId });
    expect(data?.webhooks).toEqual([
      expect.objectContaining({
        id: result.webhook?.id,
        name: "League group chat",
        urlLabel: "chat.example.test / encrypted endpoint",
      }),
    ]);
    expect(JSON.stringify(data)).not.toContain("super-secret-token");

    const updated = await updateLeagueWebhook(
      { db: handle.db, encryptionKey },
      {
        actorUserId,
        eventSelection: {
          contentSections: ["records"],
          events: ["content.corrected"],
        },
        leagueId,
        name: "League alerts",
        status: "disabled",
        webhookId: result.webhook?.id ?? "",
      },
    );
    expect(updated).toMatchObject({
      status: "updated",
      webhook: {
        eventSelection: {
          contentSections: ["records"],
          events: ["content.corrected"],
        },
        name: "League alerts",
        status: "disabled",
      },
    });

    await expect(
      deleteLeagueWebhook(
        { db: handle.db },
        { leagueId, webhookId: result.webhook?.id ?? "" },
      ),
    ).resolves.toMatchObject({ status: "deleted" });
  });

  it("rejects non-HTTPS URLs and Discord targets outside Discord hosts", async () => {
    await expect(
      createLeagueWebhook(
        { db: handle.db, encryptionKey },
        {
          actorUserId,
          leagueId,
          name: "Bad generic",
          targetKind: "generic",
          url: "http://chat.example.test/hooks/token",
        },
      ),
    ).rejects.toMatchObject({ code: "WEBHOOK_URL_INVALID" });

    await expect(
      createLeagueWebhook(
        { db: handle.db, encryptionKey },
        {
          actorUserId,
          leagueId,
          name: "Bad Discord",
          targetKind: "discord",
          url: "https://chat.example.test/hooks/token",
        },
      ),
    ).rejects.toMatchObject({ code: "WEBHOOK_DISCORD_URL_INVALID" });
  });

  it("validates URL rotation against the stored target kind", async () => {
    const webhook = await createLeagueWebhook(
      { db: handle.db, encryptionKey },
      {
        actorUserId,
        leagueId,
        name: "Discord rotation",
        targetKind: "discord",
        url: "https://discord.com/api/webhooks/original",
      },
    );
    const webhookId = webhook.webhook?.id ?? "";

    await expect(
      updateLeagueWebhook(
        { db: handle.db, encryptionKey },
        {
          actorUserId,
          leagueId,
          url: "https://chat.example.test/hooks/not-discord",
          webhookId,
        },
      ),
    ).rejects.toMatchObject({ code: "WEBHOOK_DISCORD_URL_INVALID" });

    await expect(
      updateLeagueWebhook(
        { db: handle.db, encryptionKey },
        {
          actorUserId,
          leagueId,
          targetKind: "generic",
          webhookId,
        },
      ),
    ).rejects.toMatchObject({
      code: "WEBHOOK_URL_REQUIRED_FOR_TARGET_CHANGE",
    });

    await expect(
      updateLeagueWebhook(
        { db: handle.db, encryptionKey },
        {
          actorUserId,
          leagueId,
          targetKind: "generic",
          url: "https://chat.example.test/hooks/rotated",
          webhookId,
        },
      ),
    ).resolves.toMatchObject({
      status: "updated",
      webhook: {
        targetKind: "generic",
        urlLabel: "chat.example.test / encrypted endpoint",
      },
    });

    await deleteLeagueWebhook({ db: handle.db }, { leagueId, webhookId });
  });
});

describe("mock webhook fan-out", () => {
  it("records idempotent mock deliveries for published content only", async () => {
    const webhook = await createLeagueWebhook(
      { db: handle.db, encryptionKey },
      {
        actorUserId,
        leagueId,
        name: "Published fan-out",
        targetKind: "generic",
        url: "https://chat.example.test/hooks/published",
      },
    );
    const content = await insertContent({
      dedupSuffix: "published-delivery",
      metadata: { leagueSection: "recaps" },
      title: "Published webhook post",
    });
    const deliverer = new MockWebhookDeliverer({
      appUrl: "https://app.example.test",
      db: handle.db,
    });

    await expect(
      deliverer.deliverPublishedContent({
        contentItemId: content.id,
        leagueId,
      }),
    ).resolves.toEqual({ delivered: 1, failed: 0, skipped: 0 });
    await expect(
      deliverer.deliverPublishedContent({
        contentItemId: content.id,
        leagueId,
      }),
    ).resolves.toEqual({ delivered: 0, failed: 0, skipped: 1 });

    const deliveries = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(webhookDeliveryRecords)
        .where(eq(webhookDeliveryRecords.webhookId, webhook.webhook?.id ?? "")),
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      deliveryMode: "mock",
      deliveryStatus: "delivered",
      eventKey: `content:${content.id}`,
      eventType: "content.published",
      targetKind: "generic",
    });
    expect(deliveries[0]?.payload).toMatchObject({
      content: {
        id: content.id,
        shareUrl: `https://app.example.test/leagues/${leagueId}/press/${content.id}`,
        title: "Published webhook post",
      },
      eventType: "content.published",
    });
    expect(JSON.stringify(deliveries[0]?.payload)).not.toContain("/hooks/");
  });

  it("does not deliver retracted content", async () => {
    await createLeagueWebhook(
      { db: handle.db, encryptionKey },
      {
        actorUserId,
        leagueId,
        name: "Retracted fan-out",
        targetKind: "generic",
        url: "https://chat.example.test/hooks/retracted",
      },
    );
    const content = await insertContent({
      dedupSuffix: "retracted-delivery",
      status: "retracted",
    });
    const deliverer = new MockWebhookDeliverer({
      appUrl: "https://app.example.test",
      db: handle.db,
    });

    await expect(
      deliverer.deliverPublishedContent({
        contentItemId: content.id,
        leagueId,
      }),
    ).resolves.toEqual({ delivered: 0, failed: 0, skipped: 0 });

    const rows = await withLeagueContext(handle.db, leagueId, (tx) =>
      tx
        .select()
        .from(webhookDeliveryRecords)
        .where(eq(webhookDeliveryRecords.contentItemId, content.id)),
    );
    expect(rows).toHaveLength(0);
  });

  it("records failed mock deliveries for manager visibility", async () => {
    const webhook = await createLeagueWebhook(
      { db: handle.db, encryptionKey },
      {
        actorUserId,
        leagueId,
        name: "Failing fan-out",
        targetKind: "generic",
        url: "https://chat.example.test/hooks/failing",
      },
    );
    const content = await insertContent({
      dedupSuffix: "failed-delivery",
      title: "Failed webhook post",
    });
    const webhookId = webhook.webhook?.id ?? "";
    const deliverer = new MockWebhookDeliverer({
      appUrl: "https://app.example.test",
      db: handle.db,
      failWebhookIds: new Set([webhookId]),
    });

    const fanout = await deliverer.deliverPublishedContent({
      contentItemId: content.id,
      leagueId,
    });
    expect(fanout.failed).toBe(1);
    expect(fanout.skipped).toBe(0);

    const data = await getLeagueWebhookManagerData(handle.db, { leagueId });
    const deliveriesByWebhookId = new Map(
      (data?.deliveries ?? []).map((delivery) => [
        delivery.webhookId,
        delivery,
      ]),
    );
    expect(data?.summary.failed).toBeGreaterThanOrEqual(1);
    expect(deliveriesByWebhookId.get(webhookId)).toMatchObject({
      contentTitle: "Failed webhook post",
      deliveryStatus: "failed",
      errorMessage: "Mock webhook delivery failed",
      webhookId,
      webhookName: "Failing fan-out",
    });
  });
});
