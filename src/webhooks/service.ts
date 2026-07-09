import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AiPersona } from "@/ai";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { type LeagueScopedTx, withLeagueContext } from "@/db/rls";
import {
  contentItems,
  leagues,
  leagueWebhooks,
  webhookDeliveryRecords,
} from "@/db/schema";
import type { LeaguePublicationSectionId } from "@/news";
import {
  LEAGUE_PUBLICATION_SECTIONS,
  resolveLeaguePublicationSection,
} from "@/news/sections";
import {
  type CredentialCipher,
  createCredentialCipher,
} from "@/onboarding/credential-crypto";

export const WEBHOOK_TARGET_KINDS = ["discord", "generic"] as const;
export type LeagueWebhookTargetKind = (typeof WEBHOOK_TARGET_KINDS)[number];

export const WEBHOOK_CONTENT_EVENTS = [
  "content.published",
  "content.corrected",
] as const;
export type LeagueWebhookContentEvent = (typeof WEBHOOK_CONTENT_EVENTS)[number];

export interface LeagueWebhookEventSelection {
  contentSections: LeaguePublicationSectionId[];
  events: LeagueWebhookContentEvent[];
}

export const DEFAULT_WEBHOOK_EVENT_SELECTION = {
  contentSections: LEAGUE_PUBLICATION_SECTIONS.map((section) => section.id),
  events: [...WEBHOOK_CONTENT_EVENTS],
} as const satisfies LeagueWebhookEventSelection;

export interface LeagueWebhookSummary {
  id: string;
  name: string;
  targetKind: LeagueWebhookTargetKind;
  status: "active" | "disabled";
  urlLabel: string;
  urlHash: string;
  eventSelection: LeagueWebhookEventSelection;
  lastDeliveryAt: string | null;
  lastFailureAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeagueWebhookDeliverySummary {
  id: string;
  webhookId: string;
  webhookName: string;
  contentItemId: string | null;
  contentTitle: string | null;
  eventType: string;
  deliveryStatus: "delivered" | "failed";
  deliveryMode: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface LeagueWebhookManagerData {
  league: {
    id: string;
    name: string;
    provider: string;
    providerLeagueId: string;
    season: number;
  };
  summary: {
    active: number;
    disabled: number;
    delivered: number;
    failed: number;
  };
  webhooks: LeagueWebhookSummary[];
  deliveries: LeagueWebhookDeliverySummary[];
}

export interface CreateLeagueWebhookInput {
  actorUserId: string;
  eventSelection?: Partial<LeagueWebhookEventSelection>;
  leagueId: string;
  name: string;
  targetKind: LeagueWebhookTargetKind;
  url: string;
}

export interface UpdateLeagueWebhookInput {
  actorUserId: string;
  eventSelection?: Partial<LeagueWebhookEventSelection>;
  leagueId: string;
  name?: string;
  status?: "active" | "disabled";
  targetKind?: LeagueWebhookTargetKind;
  url?: string;
  webhookId: string;
}

export interface LeagueWebhookMutationResult {
  status: "created" | "deleted" | "not_found" | "updated";
  webhook: LeagueWebhookSummary | null;
}

export interface WebhookDeliveryAttempt {
  contentItemId: string;
  eventKey: string;
  eventType: LeagueWebhookContentEvent;
  leagueId: string;
  payload: Record<string, unknown>;
  targetKind: LeagueWebhookTargetKind;
  webhookId: string;
  webhookName: string;
}

export interface WebhookDeliveryOutcome {
  errorMessage?: string | null;
  status: "delivered" | "failed";
}

export interface WebhookDeliverer {
  readonly config: { mock: true } | { mock: false };
  deliver(attempt: WebhookDeliveryAttempt): Promise<WebhookDeliveryOutcome>;
  deliverPublishedContent(input: {
    contentItemId: string;
    leagueId: string;
  }): Promise<LeagueWebhookFanoutSummary>;
}

export interface LeagueWebhookFanoutSummary {
  delivered: number;
  failed: number;
  skipped: number;
}

interface LeagueWebhookRow {
  createdAt: Date;
  eventSelection: unknown;
  id: string;
  lastDeliveryAt: Date | null;
  lastFailureAt: Date | null;
  name: string;
  status: "active" | "disabled";
  targetKind: LeagueWebhookTargetKind;
  updatedAt: Date;
  urlHash: string;
  urlLabel: string;
}

interface WebhookContentRow {
  authorPersona: AiPersona | null;
  id: string;
  kind: "blog" | "ingest_event" | "news";
  leagueId: string | null;
  metadata: Record<string, unknown>;
  publishedAt: Date;
  status: "published" | "superseded" | "retracted";
  summary: string;
  title: string;
}

const MAX_WEBHOOK_NAME_LENGTH = 80;
const MAX_WEBHOOK_ERROR_LENGTH = 500;

function now(): Date {
  return new Date();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanName(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0 || cleaned.length > MAX_WEBHOOK_NAME_LENGTH) {
    throw new AppError({
      code: "WEBHOOK_NAME_INVALID",
      message: "Webhook name must be between 1 and 80 characters",
      status: 400,
    });
  }
  return cleaned;
}

function parseTargetKind(value: string): LeagueWebhookTargetKind {
  if ((WEBHOOK_TARGET_KINDS as readonly string[]).includes(value)) {
    return value as LeagueWebhookTargetKind;
  }
  throw new AppError({
    code: "WEBHOOK_TARGET_KIND_INVALID",
    message: "Webhook target kind is invalid",
    status: 400,
  });
}

function parseWebhookUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new AppError({
      cause,
      code: "WEBHOOK_URL_INVALID",
      message: "Webhook URL must be a valid HTTPS URL",
      status: 400,
    });
  }

  if (!parsed.protocol.startsWith("https:")) {
    throw new AppError({
      code: "WEBHOOK_URL_INVALID",
      message: "Webhook URL must use HTTPS",
      status: 400,
    });
  }

  return parsed;
}

function validateUrlForTargetKind(
  url: string,
  targetKind: LeagueWebhookTargetKind,
): URL {
  const parsed = parseWebhookUrl(url);
  if (
    targetKind === "discord" &&
    !/(^|\.)discord(?:app)?\.com$/u.test(parsed.hostname)
  ) {
    throw new AppError({
      code: "WEBHOOK_DISCORD_URL_INVALID",
      message: "Discord webhooks must point at discord.com",
      status: 400,
    });
  }
  return parsed;
}

function urlLabel(parsed: URL): string {
  return `${parsed.hostname} / encrypted endpoint`;
}

export function webhookUrlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function createCipher(encryptionKey: string): CredentialCipher {
  return createCredentialCipher(encryptionKey);
}

function encryptWebhookUrl(cipher: CredentialCipher, url: string): string {
  return cipher.encryptJson({ url });
}

function normalizeEventSelection(
  input?: Partial<LeagueWebhookEventSelection> | null,
): LeagueWebhookEventSelection {
  const sectionIds = new Set(
    LEAGUE_PUBLICATION_SECTIONS.map((section) => section.id),
  );
  const eventIds = new Set(WEBHOOK_CONTENT_EVENTS);
  const contentSections = (input?.contentSections ?? [])
    .filter((section): section is LeaguePublicationSectionId =>
      sectionIds.has(section as LeaguePublicationSectionId),
    )
    .filter((section, index, values) => values.indexOf(section) === index);
  const events = (input?.events ?? [])
    .filter((event): event is LeagueWebhookContentEvent =>
      eventIds.has(event as LeagueWebhookContentEvent),
    )
    .filter((event, index, values) => values.indexOf(event) === index);

  return {
    contentSections:
      contentSections.length > 0
        ? contentSections
        : [...DEFAULT_WEBHOOK_EVENT_SELECTION.contentSections],
    events:
      events.length > 0 ? events : [...DEFAULT_WEBHOOK_EVENT_SELECTION.events],
  };
}

function parseStoredEventSelection(
  value: unknown,
): LeagueWebhookEventSelection {
  const record = asRecord(value);
  return normalizeEventSelection({
    contentSections: Array.isArray(record.contentSections)
      ? record.contentSections
      : undefined,
    events: Array.isArray(record.events) ? record.events : undefined,
  });
}

function toWebhookSummary(row: LeagueWebhookRow): LeagueWebhookSummary {
  return {
    createdAt: row.createdAt.toISOString(),
    eventSelection: parseStoredEventSelection(row.eventSelection),
    id: row.id,
    lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
    lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
    name: row.name,
    status: row.status,
    targetKind: row.targetKind,
    updatedAt: row.updatedAt.toISOString(),
    urlHash: row.urlHash,
    urlLabel: row.urlLabel,
  };
}

function contentEventType(
  content: WebhookContentRow,
): LeagueWebhookContentEvent {
  const editorial = asRecord(content.metadata.editorial);
  return editorial.kind === "correction"
    ? "content.corrected"
    : "content.published";
}

function contentSection(
  content: WebhookContentRow,
): LeaguePublicationSectionId {
  return resolveLeaguePublicationSection({
    authorPersona: content.authorPersona,
    kind: content.kind,
    metadata: content.metadata,
    summary: content.summary,
    title: content.title,
  }).id;
}

function webhookWantsContent(
  webhook: LeagueWebhookSummary,
  input: { eventType: LeagueWebhookContentEvent; section: string },
): boolean {
  const webhookIsActive = ["active"].includes(webhook.status);
  return (
    webhookIsActive &&
    webhook.eventSelection.events.includes(input.eventType) &&
    webhook.eventSelection.contentSections.includes(
      input.section as LeaguePublicationSectionId,
    )
  );
}

function appShareUrl(
  appUrl: string,
  input: { leagueId: string; contentItemId: string },
) {
  return new URL(
    `/leagues/${input.leagueId}/press/${input.contentItemId}`,
    appUrl,
  ).toString();
}

function deliveryPayload(input: {
  appUrl: string;
  content: WebhookContentRow;
  eventType: LeagueWebhookContentEvent;
  league: { id: string; name: string };
  section: LeaguePublicationSectionId;
}) {
  const section = LEAGUE_PUBLICATION_SECTIONS.find(
    (candidate) => candidate.id === input.section,
  );
  return {
    content: {
      id: input.content.id,
      publishedAt: input.content.publishedAt.toISOString(),
      section: section?.label ?? input.section,
      shareUrl: appShareUrl(input.appUrl, {
        contentItemId: input.content.id,
        leagueId: input.league.id,
      }),
      summary: input.content.summary,
      title: input.content.title,
    },
    eventType: input.eventType,
    league: input.league,
    v: 1,
  };
}

async function loadWebhook(
  tx: LeagueScopedTx,
  input: { leagueId: string; webhookId: string },
): Promise<LeagueWebhookSummary | null> {
  const [row] = await tx
    .select({
      createdAt: leagueWebhooks.createdAt,
      eventSelection: leagueWebhooks.eventSelection,
      id: leagueWebhooks.id,
      lastDeliveryAt: leagueWebhooks.lastDeliveryAt,
      lastFailureAt: leagueWebhooks.lastFailureAt,
      name: leagueWebhooks.name,
      status: leagueWebhooks.status,
      targetKind: leagueWebhooks.targetKind,
      updatedAt: leagueWebhooks.updatedAt,
      urlHash: leagueWebhooks.urlHash,
      urlLabel: leagueWebhooks.urlLabel,
    })
    .from(leagueWebhooks)
    .where(
      and(
        eq(leagueWebhooks.id, input.webhookId),
        eq(leagueWebhooks.leagueId, input.leagueId),
      ),
    )
    .limit(1);

  return row ? toWebhookSummary(row) : null;
}

async function listWebhookRows(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<LeagueWebhookSummary[]> {
  const rows = await tx
    .select({
      createdAt: leagueWebhooks.createdAt,
      eventSelection: leagueWebhooks.eventSelection,
      id: leagueWebhooks.id,
      lastDeliveryAt: leagueWebhooks.lastDeliveryAt,
      lastFailureAt: leagueWebhooks.lastFailureAt,
      name: leagueWebhooks.name,
      status: leagueWebhooks.status,
      targetKind: leagueWebhooks.targetKind,
      updatedAt: leagueWebhooks.updatedAt,
      urlHash: leagueWebhooks.urlHash,
      urlLabel: leagueWebhooks.urlLabel,
    })
    .from(leagueWebhooks)
    .where(eq(leagueWebhooks.leagueId, leagueId))
    .orderBy(desc(leagueWebhooks.createdAt));

  return rows.map(toWebhookSummary);
}

async function listRecentDeliveries(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<LeagueWebhookDeliverySummary[]> {
  const rows = await tx
    .select({
      contentItemId: webhookDeliveryRecords.contentItemId,
      contentTitle: contentItems.title,
      createdAt: webhookDeliveryRecords.createdAt,
      deliveryMode: webhookDeliveryRecords.deliveryMode,
      deliveryStatus: webhookDeliveryRecords.deliveryStatus,
      errorMessage: webhookDeliveryRecords.errorMessage,
      eventType: webhookDeliveryRecords.eventType,
      id: webhookDeliveryRecords.id,
      webhookId: webhookDeliveryRecords.webhookId,
      webhookName: leagueWebhooks.name,
    })
    .from(webhookDeliveryRecords)
    .innerJoin(
      leagueWebhooks,
      eq(webhookDeliveryRecords.webhookId, leagueWebhooks.id),
    )
    .leftJoin(
      contentItems,
      eq(webhookDeliveryRecords.contentItemId, contentItems.id),
    )
    .where(eq(webhookDeliveryRecords.leagueId, leagueId))
    .orderBy(desc(webhookDeliveryRecords.createdAt))
    .limit(20);

  return rows.map((row) => ({
    contentItemId: row.contentItemId,
    contentTitle: row.contentTitle,
    createdAt: row.createdAt.toISOString(),
    deliveryMode: row.deliveryMode,
    deliveryStatus: row.deliveryStatus,
    errorMessage: row.errorMessage,
    eventType: row.eventType,
    id: row.id,
    webhookId: row.webhookId,
    webhookName: row.webhookName,
  }));
}

export async function getLeagueWebhookManagerData(
  db: Db,
  input: { leagueId: string },
): Promise<LeagueWebhookManagerData | null> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      providerLeagueId: leagues.providerLeagueId,
      season: leagues.season,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return null;
  }

  return withLeagueContext(db, input.leagueId, async (tx) => {
    const webhooks = await listWebhookRows(tx, input.leagueId);
    const deliveries = await listRecentDeliveries(tx, input.leagueId);

    return {
      deliveries,
      league,
      summary: {
        active: webhooks.filter((webhook) => webhook.status === "active")
          .length,
        delivered: deliveries.filter(
          (delivery) => delivery.deliveryStatus === "delivered",
        ).length,
        disabled: webhooks.filter((webhook) => webhook.status === "disabled")
          .length,
        failed: deliveries.filter(
          (delivery) => delivery.deliveryStatus === "failed",
        ).length,
      },
      webhooks,
    };
  });
}

export async function createLeagueWebhook(
  deps: { db: Db; encryptionKey: string; now?: () => Date },
  input: CreateLeagueWebhookInput,
): Promise<LeagueWebhookMutationResult> {
  const targetKind = parseTargetKind(input.targetKind);
  const parsedUrl = validateUrlForTargetKind(input.url, targetKind);
  const cipher = createCipher(deps.encryptionKey);
  const timestamp = deps.now?.() ?? now();

  const [row] = await withLeagueContext(deps.db, input.leagueId, (tx) =>
    tx
      .insert(leagueWebhooks)
      .values({
        createdByUserId: input.actorUserId,
        encryptedUrl: encryptWebhookUrl(cipher, parsedUrl.toString()),
        eventSelection: normalizeEventSelection(input.eventSelection),
        leagueId: input.leagueId,
        name: cleanName(input.name),
        targetKind,
        updatedAt: timestamp,
        updatedByUserId: input.actorUserId,
        urlHash: webhookUrlHash(parsedUrl.toString()),
        urlLabel: urlLabel(parsedUrl),
      })
      .returning({
        createdAt: leagueWebhooks.createdAt,
        eventSelection: leagueWebhooks.eventSelection,
        id: leagueWebhooks.id,
        lastDeliveryAt: leagueWebhooks.lastDeliveryAt,
        lastFailureAt: leagueWebhooks.lastFailureAt,
        name: leagueWebhooks.name,
        status: leagueWebhooks.status,
        targetKind: leagueWebhooks.targetKind,
        updatedAt: leagueWebhooks.updatedAt,
        urlHash: leagueWebhooks.urlHash,
        urlLabel: leagueWebhooks.urlLabel,
      }),
  );

  if (!row) {
    throw new AppError({
      code: "WEBHOOK_CREATE_FAILED",
      message: "Webhook could not be created",
      status: 500,
    });
  }

  return { status: "created", webhook: toWebhookSummary(row) };
}

export async function updateLeagueWebhook(
  deps: { db: Db; encryptionKey: string; now?: () => Date },
  input: UpdateLeagueWebhookInput,
): Promise<LeagueWebhookMutationResult> {
  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const [existing] = await tx
      .select({ targetKind: leagueWebhooks.targetKind })
      .from(leagueWebhooks)
      .where(
        and(
          eq(leagueWebhooks.id, input.webhookId),
          eq(leagueWebhooks.leagueId, input.leagueId),
        ),
      )
      .limit(1);

    if (!existing) {
      return { status: "not_found", webhook: null };
    }

    const timestamp = deps.now?.() ?? now();
    const update: Partial<typeof leagueWebhooks.$inferInsert> = {
      updatedAt: timestamp,
      updatedByUserId: input.actorUserId,
    };
    if (input.name !== undefined) {
      update.name = cleanName(input.name);
    }
    if (input.status !== undefined) {
      update.status = input.status;
    }
    if (input.eventSelection !== undefined) {
      update.eventSelection = normalizeEventSelection(input.eventSelection);
    }

    const targetKind =
      input.targetKind !== undefined
        ? parseTargetKind(input.targetKind)
        : existing.targetKind;
    if (input.targetKind !== undefined) {
      update.targetKind = targetKind;
    }
    if (targetKind !== existing.targetKind && input.url === undefined) {
      throw new AppError({
        code: "WEBHOOK_URL_REQUIRED_FOR_TARGET_CHANGE",
        message: "Changing a webhook target kind requires a new webhook URL",
        status: 400,
      });
    }
    if (input.url !== undefined) {
      const parsedUrl = validateUrlForTargetKind(input.url, targetKind);
      const cipher = createCipher(deps.encryptionKey);
      update.encryptedUrl = encryptWebhookUrl(cipher, parsedUrl.toString());
      update.urlHash = webhookUrlHash(parsedUrl.toString());
      update.urlLabel = urlLabel(parsedUrl);
    }

    const [row] = await tx
      .update(leagueWebhooks)
      .set(update)
      .where(
        and(
          eq(leagueWebhooks.id, input.webhookId),
          eq(leagueWebhooks.leagueId, input.leagueId),
        ),
      )
      .returning({
        createdAt: leagueWebhooks.createdAt,
        eventSelection: leagueWebhooks.eventSelection,
        id: leagueWebhooks.id,
        lastDeliveryAt: leagueWebhooks.lastDeliveryAt,
        lastFailureAt: leagueWebhooks.lastFailureAt,
        name: leagueWebhooks.name,
        status: leagueWebhooks.status,
        targetKind: leagueWebhooks.targetKind,
        updatedAt: leagueWebhooks.updatedAt,
        urlHash: leagueWebhooks.urlHash,
        urlLabel: leagueWebhooks.urlLabel,
      });

    return row
      ? { status: "updated", webhook: toWebhookSummary(row) }
      : { status: "not_found", webhook: null };
  });
}

export async function deleteLeagueWebhook(
  deps: { db: Db },
  input: { leagueId: string; webhookId: string },
): Promise<LeagueWebhookMutationResult> {
  return withLeagueContext(deps.db, input.leagueId, async (tx) => {
    const webhook = await loadWebhook(tx, input);
    if (!webhook) {
      return { status: "not_found", webhook: null };
    }

    await tx
      .delete(leagueWebhooks)
      .where(
        and(
          eq(leagueWebhooks.id, input.webhookId),
          eq(leagueWebhooks.leagueId, input.leagueId),
        ),
      );

    return { status: "deleted", webhook };
  });
}

function errorMessage(value: unknown): string {
  const message =
    value instanceof Error ? value.message : "Webhook delivery failed";
  return message.slice(0, MAX_WEBHOOK_ERROR_LENGTH);
}

function timestampsForOutcome(
  status: WebhookDeliveryOutcome["status"],
  timestamp: Date,
): { deliveredAt: Date | null; failedAt: Date | null } {
  switch (status) {
    case "delivered":
      return { deliveredAt: timestamp, failedAt: null };
    case "failed":
      return { deliveredAt: null, failedAt: timestamp };
  }
}

function errorMessageForOutcome(
  outcome: WebhookDeliveryOutcome,
): string | null {
  switch (outcome.status) {
    case "delivered":
      return null;
    case "failed":
      return (outcome.errorMessage ?? "Webhook delivery failed").slice(
        0,
        MAX_WEBHOOK_ERROR_LENGTH,
      );
  }
}

export class MockWebhookDeliverer implements WebhookDeliverer {
  readonly config = { mock: true } as const;

  constructor(
    private readonly options: {
      appUrl: string;
      db: Db;
      failWebhookIds?: ReadonlySet<string>;
      now?: () => Date;
    },
  ) {}

  async deliver(
    attempt: WebhookDeliveryAttempt,
  ): Promise<WebhookDeliveryOutcome> {
    if (this.options.failWebhookIds?.has(attempt.webhookId)) {
      return {
        errorMessage: "Mock webhook delivery failed",
        status: "failed",
      };
    }
    return { status: "delivered" };
  }

  async deliverPublishedContent(input: {
    contentItemId: string;
    leagueId: string;
  }): Promise<LeagueWebhookFanoutSummary> {
    return deliverPublishedContentToWebhooks({
      appUrl: this.options.appUrl,
      db: this.options.db,
      deliverer: this,
      input,
      now: this.options.now,
    });
  }
}

async function deliverPublishedContentToWebhooks({
  appUrl,
  db,
  deliverer,
  input,
  now: nowFn,
}: {
  appUrl: string;
  db: Db;
  deliverer: WebhookDeliverer;
  input: { contentItemId: string; leagueId: string };
  now?: () => Date;
}): Promise<LeagueWebhookFanoutSummary> {
  const timestamp = nowFn?.() ?? now();
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [league] = await tx
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(eq(leagues.id, input.leagueId))
      .limit(1);
    const [content] = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        id: contentItems.id,
        kind: contentItems.kind,
        leagueId: contentItems.leagueId,
        metadata: contentItems.metadata,
        publishedAt: contentItems.publishedAt,
        status: contentItems.status,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.id, input.contentItemId),
          eq(contentItems.leagueId, input.leagueId),
        ),
      )
      .limit(1);

    if (!league || !content || content.status !== "published") {
      return { delivered: 0, failed: 0, skipped: 0 };
    }

    const eventType = contentEventType(content);
    const section = contentSection(content);
    const payload = deliveryPayload({
      appUrl,
      content,
      eventType,
      league,
      section,
    });
    const eventKey = `content:${content.id}`;
    const webhooks = (await listWebhookRows(tx, input.leagueId)).filter(
      (webhook) => webhookWantsContent(webhook, { eventType, section }),
    );
    const summary: LeagueWebhookFanoutSummary = {
      delivered: 0,
      failed: 0,
      skipped: 0,
    };

    for (const webhook of webhooks) {
      const [existing] = await tx
        .select({ id: webhookDeliveryRecords.id })
        .from(webhookDeliveryRecords)
        .where(
          and(
            eq(webhookDeliveryRecords.webhookId, webhook.id),
            eq(webhookDeliveryRecords.eventKey, eventKey),
          ),
        )
        .limit(1);
      if (existing) {
        summary.skipped += 1;
        continue;
      }

      let outcome: WebhookDeliveryOutcome;
      try {
        outcome = await deliverer.deliver({
          contentItemId: content.id,
          eventKey,
          eventType,
          leagueId: input.leagueId,
          payload,
          targetKind: webhook.targetKind,
          webhookId: webhook.id,
          webhookName: webhook.name,
        });
      } catch (error) {
        outcome = { errorMessage: errorMessage(error), status: "failed" };
      }

      const timestamps = timestampsForOutcome(outcome.status, timestamp);
      const values = {
        contentItemId: content.id,
        deliveredAt: timestamps.deliveredAt,
        deliveryMode: deliverer.config.mock ? "mock" : "real",
        deliveryStatus: outcome.status,
        errorMessage: errorMessageForOutcome(outcome),
        eventKey,
        eventType,
        failedAt: timestamps.failedAt,
        leagueId: input.leagueId,
        payload,
        targetKind: webhook.targetKind,
        webhookId: webhook.id,
      };

      const [inserted] = await tx
        .insert(webhookDeliveryRecords)
        .values(values)
        .onConflictDoNothing({
          target: [
            webhookDeliveryRecords.webhookId,
            webhookDeliveryRecords.eventKey,
          ],
        })
        .returning({ id: webhookDeliveryRecords.id });

      if (!inserted) {
        summary.skipped += 1;
        continue;
      }

      if (outcome.status === "delivered") {
        summary.delivered += 1;
        await tx
          .update(leagueWebhooks)
          .set({ lastDeliveryAt: timestamp, updatedAt: timestamp })
          .where(
            and(
              eq(leagueWebhooks.id, webhook.id),
              eq(leagueWebhooks.leagueId, input.leagueId),
            ),
          );
      } else {
        summary.failed += 1;
        await tx
          .update(leagueWebhooks)
          .set({ lastFailureAt: timestamp, updatedAt: timestamp })
          .where(
            and(
              eq(leagueWebhooks.id, webhook.id),
              eq(leagueWebhooks.leagueId, input.leagueId),
            ),
          );
      }
    }

    return summary;
  });
}

export function createMockWebhookDeliverer(input: {
  appUrl: string;
  db: Db;
  encryptionKey?: string;
}) {
  // The encryption key is accepted here so dependency factories can pass the
  // same credential config used by CRUD; mock delivery never decrypts URLs.
  void input.encryptionKey;
  return new MockWebhookDeliverer({ appUrl: input.appUrl, db: input.db });
}
