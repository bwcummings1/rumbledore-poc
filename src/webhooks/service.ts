import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AiPersona } from "@/ai";
import { DEV_CREDENTIAL_ENCRYPTION_KEY } from "@/core/env/schema";
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
  target: ValidatedWebhookTarget;
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
  /**
   * Delivery is intentionally at-least-once: the transport call happens before
   * the append-only delivery record is inserted, so a crash can duplicate a
   * future real send. Real Discord delivery must also set
   * `allowed_mentions: { parse: [] }`; payload text is sanitized here as a
   * defense-in-depth layer.
   */
  deliver(attempt: WebhookDeliveryAttempt): Promise<WebhookDeliveryOutcome>;
  /**
   * Known limitation: this T18/T19 mock contract fans out publish/correct
   * events only. Retract/supersede notices currently travel over realtime and
   * push; real webhook activation must add an explicit retraction event shape.
   */
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

interface LeagueWebhookFanoutRow extends LeagueWebhookRow {
  encryptedUrl: string;
}

interface WebhookFanoutPlan {
  content: WebhookContentRow;
  eventKey: string;
  eventType: LeagueWebhookContentEvent;
  league: { id: string; name: string };
  payload: Record<string, unknown>;
  webhooks: LeagueWebhookFanoutRow[];
}

interface WebhookDeliveryRetryState {
  attemptCount: number;
  delivered: boolean;
}

export interface ValidatedWebhookTarget {
  hostname: string;
  redirectPolicy: "none";
  targetKind: LeagueWebhookTargetKind;
  url: string;
  urlHash: string;
  urlLabel: string;
}

export type WebhookHostnameResolver = (
  hostname: string,
) => Promise<readonly string[]>;

const MAX_WEBHOOK_NAME_LENGTH = 80;
const MAX_WEBHOOK_ERROR_LENGTH = 500;
const MAX_WEBHOOK_DELIVERY_ATTEMPTS = 3;

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
  if (parsed.username || parsed.password) {
    throw new AppError({
      code: "WEBHOOK_URL_INVALID",
      message: "Webhook URL must not include credentials",
      status: 400,
    });
  }

  return parsed;
}

function invalidWebhookTarget(
  code:
    | "WEBHOOK_URL_HOST_PRIVATE"
    | "WEBHOOK_URL_INVALID"
    | "WEBHOOK_URL_IP_LITERAL"
    | "WEBHOOK_URL_UNRESOLVABLE",
  message: string,
  cause?: unknown,
): AppError {
  return new AppError({
    cause,
    code,
    message,
    status: 400,
  });
}

function normalizedHostname(parsed: URL): string {
  const raw = parsed.hostname.replace(/^\[/u, "").replace(/\]$/u, "");
  const ascii = domainToASCII(raw).toLowerCase();
  if (!ascii || ascii.includes("%")) {
    throw invalidWebhookTarget(
      "WEBHOOK_URL_INVALID",
      "Webhook URL hostname is invalid",
    );
  }
  return ascii;
}

function ipv4Octets(address: string): number[] | null {
  const octets = address.split(".");
  if (octets.length !== 4) {
    return null;
  }
  const parsed = octets.map((part) => Number(part));
  return parsed.every(
    (part) => Number.isInteger(part) && part >= 0 && part <= 255,
  )
    ? parsed
    : null;
}

function isBlockedIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) {
    return true;
  }
  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function firstIpv6Group(address: string): number {
  const first = address.split(":", 1)[0] ?? "0";
  return Number.parseInt(first || "0", 16);
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u);
  if (mappedIpv4?.[1]) {
    return isBlockedIpv4(mappedIpv4[1]);
  }
  if (normalized === "::" || normalized === "::1") {
    return true;
  }
  const first = firstIpv6Group(normalized);
  return (
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    first === 0
  );
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = address.replace(/^\[/u, "").replace(/\]$/u, "");
  switch (isIP(normalized)) {
    case 4:
      return isBlockedIpv4(normalized);
    case 6:
      return isBlockedIpv6(normalized);
    default:
      return true;
  }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

async function defaultResolveHostname(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function resolvePublicAddresses(
  hostname: string,
  resolver: WebhookHostnameResolver,
): Promise<void> {
  let addresses: readonly string[];
  try {
    addresses = await resolver(hostname);
  } catch (cause) {
    throw invalidWebhookTarget(
      "WEBHOOK_URL_UNRESOLVABLE",
      "Webhook URL hostname could not be resolved",
      cause,
    );
  }
  if (addresses.length === 0) {
    throw invalidWebhookTarget(
      "WEBHOOK_URL_UNRESOLVABLE",
      "Webhook URL hostname could not be resolved",
    );
  }
  for (const address of addresses) {
    if (isBlockedIpAddress(address)) {
      throw invalidWebhookTarget(
        "WEBHOOK_URL_HOST_PRIVATE",
        "Webhook URL must resolve to public internet addresses",
      );
    }
  }
}

export async function validateWebhookTargetUrl(
  url: string,
  targetKind: LeagueWebhookTargetKind,
  options: { resolveHostname?: WebhookHostnameResolver } = {},
): Promise<ValidatedWebhookTarget> {
  const parsed = parseWebhookUrl(url);
  const hostname = normalizedHostname(parsed);
  if (isIP(hostname)) {
    throw invalidWebhookTarget(
      "WEBHOOK_URL_IP_LITERAL",
      "Webhook URL must use a public hostname, not an IP literal",
    );
  }
  if (isLocalHostname(hostname)) {
    throw invalidWebhookTarget(
      "WEBHOOK_URL_HOST_PRIVATE",
      "Webhook URL must not target localhost",
    );
  }
  switch (targetKind) {
    case "discord":
      if (!/(^|\.)discord(?:app)?\.com$/u.test(hostname)) {
        throw new AppError({
          code: "WEBHOOK_DISCORD_URL_INVALID",
          message: "Discord webhooks must point at discord.com",
          status: 400,
        });
      }
      break;
    case "generic":
      break;
  }
  parsed.hostname = hostname;
  parsed.hash = "";
  await resolvePublicAddresses(
    hostname,
    options.resolveHostname ?? defaultResolveHostname,
  );
  const normalizedUrl = parsed.toString();
  return {
    hostname,
    redirectPolicy: "none",
    targetKind,
    url: normalizedUrl,
    urlHash: webhookUrlHash(normalizedUrl),
    urlLabel: urlLabel(parsed),
  };
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

function decryptWebhookUrl(
  cipher: CredentialCipher,
  encryptedUrl: string,
): string {
  const payload = cipher.decryptJson<{ url?: unknown }>(encryptedUrl);
  switch (typeof payload.url) {
    case "string":
      if (payload.url.trim().length > 0) {
        return payload.url;
      }
      break;
    default:
      break;
  }
  throw new AppError({
    code: "WEBHOOK_URL_INVALID",
    message: "Stored webhook URL payload is invalid",
    status: 400,
  });
}

async function validateStoredWebhookTarget(input: {
  encryptedUrl: string;
  encryptionKey: string;
  resolveHostname?: WebhookHostnameResolver;
  targetKind: LeagueWebhookTargetKind;
}): Promise<ValidatedWebhookTarget> {
  const cipher = createCipher(input.encryptionKey);
  return validateWebhookTargetUrl(
    decryptWebhookUrl(cipher, input.encryptedUrl),
    input.targetKind,
    { resolveHostname: input.resolveHostname },
  );
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
      summary: sanitizeWebhookMentionText(input.content.summary),
      title: sanitizeWebhookMentionText(input.content.title),
    },
    eventType: input.eventType,
    league: {
      id: input.league.id,
      name: sanitizeWebhookMentionText(input.league.name),
    },
    v: 1,
  };
}

export function sanitizeWebhookMentionText(value: string): string {
  return value
    .replace(/@(everyone|here)\b/giu, "@\u200b$1")
    .replace(/<@([!&]?\d+)>/gu, "<@\u200b$1>")
    .replace(/<#(\d+)>/gu, "<#\u200b$1>");
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

async function listWebhookFanoutRows(
  tx: LeagueScopedTx,
  leagueId: string,
): Promise<LeagueWebhookFanoutRow[]> {
  const rows = await tx
    .select({
      createdAt: leagueWebhooks.createdAt,
      encryptedUrl: leagueWebhooks.encryptedUrl,
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

  return rows;
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
  deps: {
    db: Db;
    encryptionKey: string;
    now?: () => Date;
    resolveHostname?: WebhookHostnameResolver;
  },
  input: CreateLeagueWebhookInput,
): Promise<LeagueWebhookMutationResult> {
  const targetKind = parseTargetKind(input.targetKind);
  const validatedTarget = await validateWebhookTargetUrl(
    input.url,
    targetKind,
    {
      resolveHostname: deps.resolveHostname,
    },
  );
  const cipher = createCipher(deps.encryptionKey);
  const timestamp = deps.now?.() ?? now();

  const [row] = await withLeagueContext(deps.db, input.leagueId, (tx) =>
    tx
      .insert(leagueWebhooks)
      .values({
        createdByUserId: input.actorUserId,
        encryptedUrl: encryptWebhookUrl(cipher, validatedTarget.url),
        eventSelection: normalizeEventSelection(input.eventSelection),
        leagueId: input.leagueId,
        name: cleanName(input.name),
        targetKind,
        updatedAt: timestamp,
        updatedByUserId: input.actorUserId,
        urlHash: validatedTarget.urlHash,
        urlLabel: validatedTarget.urlLabel,
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
  deps: {
    db: Db;
    encryptionKey: string;
    now?: () => Date;
    resolveHostname?: WebhookHostnameResolver;
  },
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

    const targetKind = input.targetKind
      ? parseTargetKind(input.targetKind)
      : existing.targetKind;
    if (input.targetKind) {
      update.targetKind = targetKind;
    }
    if (Boolean(targetKind.localeCompare(existing.targetKind)) && !input.url) {
      throw new AppError({
        code: "WEBHOOK_URL_REQUIRED_FOR_TARGET_CHANGE",
        message: "Changing a webhook target kind requires a new webhook URL",
        status: 400,
      });
    }
    if (input.url) {
      const validatedTarget = await validateWebhookTargetUrl(
        input.url,
        targetKind,
        { resolveHostname: deps.resolveHostname },
      );
      const cipher = createCipher(deps.encryptionKey);
      update.encryptedUrl = encryptWebhookUrl(cipher, validatedTarget.url);
      update.urlHash = validatedTarget.urlHash;
      update.urlLabel = validatedTarget.urlLabel;
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
  return redactDeliveryError(message).slice(0, MAX_WEBHOOK_ERROR_LENGTH);
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
      return redactDeliveryError(
        outcome.errorMessage ?? "Webhook delivery failed",
      ).slice(0, MAX_WEBHOOK_ERROR_LENGTH);
  }
}

export function redactDeliveryError(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/giu, "[redacted-url]");
}

export class MockWebhookDeliverer implements WebhookDeliverer {
  readonly config = { mock: true } as const;

  constructor(
    private readonly options: {
      appUrl: string;
      db: Db;
      encryptionKey?: string;
      failWebhookIds?: ReadonlySet<string>;
      now?: () => Date;
      resolveHostname?: WebhookHostnameResolver;
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
      encryptionKey:
        this.options.encryptionKey ?? DEV_CREDENTIAL_ENCRYPTION_KEY,
      input,
      now: this.options.now,
      resolveHostname: this.options.resolveHostname,
    });
  }
}

async function loadWebhookFanoutPlan({
  appUrl,
  db,
  input,
}: {
  appUrl: string;
  db: Db;
  input: { contentItemId: string; leagueId: string };
}): Promise<WebhookFanoutPlan | null> {
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
      return null;
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
    const webhooks = (await listWebhookFanoutRows(tx, input.leagueId)).filter(
      (webhook) =>
        webhookWantsContent(toWebhookSummary(webhook), { eventType, section }),
    );
    return { content, eventKey, eventType, league, payload, webhooks };
  });
}

async function loadDeliveryRetryState(
  db: Db,
  input: { eventKey: string; leagueId: string; webhookId: string },
): Promise<WebhookDeliveryRetryState> {
  const [state] = await withLeagueContext(db, input.leagueId, (tx) =>
    tx
      .select({
        attemptCount: sql<number>`coalesce(max(${webhookDeliveryRecords.attemptCount}), 0)::int`,
        delivered: sql<boolean>`coalesce(bool_or(${webhookDeliveryRecords.deliveryStatus} = 'delivered'), false)`,
      })
      .from(webhookDeliveryRecords)
      .where(
        and(
          eq(webhookDeliveryRecords.webhookId, input.webhookId),
          eq(webhookDeliveryRecords.eventKey, input.eventKey),
        ),
      ),
  );

  return {
    attemptCount: state?.attemptCount ?? 0,
    delivered: state?.delivered ?? false,
  };
}

async function recordWebhookDelivery(input: {
  content: WebhookContentRow;
  db: Db;
  deliveryMode: "mock" | "real";
  eventKey: string;
  eventType: LeagueWebhookContentEvent;
  leagueId: string;
  outcome: WebhookDeliveryOutcome;
  payload: Record<string, unknown>;
  targetKind: LeagueWebhookTargetKind;
  timestamp: Date;
  webhookId: string;
}): Promise<"inserted" | "skipped"> {
  const timestamps = timestampsForOutcome(
    input.outcome.status,
    input.timestamp,
  );
  const values = {
    attemptCount:
      (
        await loadDeliveryRetryState(input.db, {
          eventKey: input.eventKey,
          leagueId: input.leagueId,
          webhookId: input.webhookId,
        })
      ).attemptCount + 1,
    contentItemId: input.content.id,
    deliveredAt: timestamps.deliveredAt,
    deliveryMode: input.deliveryMode,
    deliveryStatus: input.outcome.status,
    errorMessage: errorMessageForOutcome(input.outcome),
    eventKey: input.eventKey,
    eventType: input.eventType,
    failedAt: timestamps.failedAt,
    leagueId: input.leagueId,
    payload: input.payload,
    targetKind: input.targetKind,
    webhookId: input.webhookId,
  };

  const [inserted] = await withLeagueContext(
    input.db,
    input.leagueId,
    async (tx) => {
      if (input.outcome.status === "failed") {
        const [delivered] = await tx
          .select({ id: webhookDeliveryRecords.id })
          .from(webhookDeliveryRecords)
          .where(
            and(
              eq(webhookDeliveryRecords.webhookId, input.webhookId),
              eq(webhookDeliveryRecords.eventKey, input.eventKey),
              eq(webhookDeliveryRecords.deliveryStatus, "delivered"),
            ),
          )
          .limit(1);
        if (delivered) {
          return [];
        }
      }

      return tx
        .insert(webhookDeliveryRecords)
        .values(values)
        .onConflictDoNothing({
          target: [
            webhookDeliveryRecords.webhookId,
            webhookDeliveryRecords.eventKey,
          ],
          where: sql`${webhookDeliveryRecords.deliveryStatus} = 'delivered'`,
        })
        .returning({ id: webhookDeliveryRecords.id });
    },
  );

  if (!inserted) {
    return "skipped";
  }

  await withLeagueContext(input.db, input.leagueId, (tx) =>
    tx
      .update(leagueWebhooks)
      .set(
        input.outcome.status === "delivered"
          ? { lastDeliveryAt: input.timestamp, updatedAt: input.timestamp }
          : { lastFailureAt: input.timestamp, updatedAt: input.timestamp },
      )
      .where(
        and(
          eq(leagueWebhooks.id, input.webhookId),
          eq(leagueWebhooks.leagueId, input.leagueId),
        ),
      ),
  );

  return "inserted";
}

async function deliverPublishedContentToWebhooks({
  appUrl,
  db,
  deliverer,
  encryptionKey,
  input,
  now: nowFn,
  resolveHostname,
}: {
  appUrl: string;
  db: Db;
  deliverer: WebhookDeliverer;
  encryptionKey: string;
  input: { contentItemId: string; leagueId: string };
  now?: () => Date;
  resolveHostname?: WebhookHostnameResolver;
}): Promise<LeagueWebhookFanoutSummary> {
  const timestamp = nowFn?.() ?? now();
  const plan = await loadWebhookFanoutPlan({ appUrl, db, input });
  if (!plan) {
    return { delivered: 0, failed: 0, skipped: 0 };
  }

  const summary: LeagueWebhookFanoutSummary = {
    delivered: 0,
    failed: 0,
    skipped: 0,
  };

  for (const webhook of plan.webhooks) {
    const retryState = await loadDeliveryRetryState(db, {
      eventKey: plan.eventKey,
      leagueId: input.leagueId,
      webhookId: webhook.id,
    });
    if (
      retryState.delivered ||
      retryState.attemptCount >= MAX_WEBHOOK_DELIVERY_ATTEMPTS
    ) {
      summary.skipped += 1;
      continue;
    }

    let outcome: WebhookDeliveryOutcome;
    try {
      const target = await validateStoredWebhookTarget({
        encryptedUrl: webhook.encryptedUrl,
        encryptionKey,
        resolveHostname,
        targetKind: webhook.targetKind,
      });
      outcome = await deliverer.deliver({
        contentItemId: plan.content.id,
        eventKey: plan.eventKey,
        eventType: plan.eventType,
        leagueId: input.leagueId,
        payload: plan.payload,
        target,
        targetKind: webhook.targetKind,
        webhookId: webhook.id,
        webhookName: webhook.name,
      });
    } catch (error) {
      outcome = { errorMessage: errorMessage(error), status: "failed" };
    }

    const recorded = await recordWebhookDelivery({
      content: plan.content,
      db,
      deliveryMode: deliverer.config.mock ? "mock" : "real",
      eventKey: plan.eventKey,
      eventType: plan.eventType,
      leagueId: input.leagueId,
      outcome,
      payload: plan.payload,
      targetKind: webhook.targetKind,
      timestamp,
      webhookId: webhook.id,
    });
    switch (recorded) {
      case "skipped":
        summary.skipped += 1;
        continue;
      case "inserted":
        break;
    }
    switch (outcome.status) {
      case "delivered":
        summary.delivered += 1;
        break;
      case "failed":
        summary.failed += 1;
        break;
    }
  }

  return summary;
}

export function createMockWebhookDeliverer(input: {
  appUrl: string;
  db: Db;
  encryptionKey?: string;
  resolveHostname?: WebhookHostnameResolver;
}) {
  // The encryption key is accepted here so dependency factories can pass the
  // same credential config used by CRUD; mock delivery never sends network IO.
  return new MockWebhookDeliverer({
    appUrl: input.appUrl,
    db: input.db,
    encryptionKey: input.encryptionKey,
    resolveHostname: input.resolveHostname,
  });
}
