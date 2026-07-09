import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  contentItems,
  emailDigestDeliveryRecords,
  leagues,
  members,
  pushNotificationPreferences,
  users,
} from "@/db/schema";
import { DIGEST_NOTIFICATION_EVENT_FAMILY } from "@/push/interfaces";

const MAX_DIGEST_ERROR_LENGTH = 500;
const DEFAULT_DIGEST_LIMIT = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface EmailMessage {
  html: string;
  metadata: Record<string, unknown>;
  recipient: {
    displayName: string;
    email: string;
    userId: string;
  };
  subject: string;
  text: string;
}

export interface EmailSendOutcome {
  errorMessage?: string | null;
  status: "delivered" | "failed";
}

export interface EmailSender {
  readonly config: { mock: true } | { mock: false };
  sendEmail(message: EmailMessage): Promise<EmailSendOutcome>;
}

export interface MockEmailSenderOptions {
  failUserIds?: ReadonlySet<string>;
}

export class MockEmailSender implements EmailSender {
  readonly config = { mock: true } as const;
  readonly messages: EmailMessage[] = [];

  constructor(private readonly options: MockEmailSenderOptions = {}) {}

  async sendEmail(message: EmailMessage): Promise<EmailSendOutcome> {
    this.messages.push(message);
    if (this.options.failUserIds?.has(message.recipient.userId)) {
      return {
        errorMessage: "Mock email delivery failed",
        status: "failed",
      };
    }
    return { status: "delivered" };
  }
}

export interface WeeklyDigestWindow {
  end: Date;
  start: Date;
}

export interface WeeklyDigestLeagueInput {
  digestKey?: string;
  leagueId: string;
  windowEnd?: Date | string;
  windowStart?: Date | string;
}

export interface WeeklyDigestBatchInput {
  leagueId?: string;
  leagueIds?: readonly string[];
  limit?: number;
  windowEnd?: Date | string;
  windowStart?: Date | string;
}

export interface WeeklyDigestDependencies {
  appUrl: string;
  db: Db;
  emailSender: EmailSender;
  now?: () => Date;
}

export interface WeeklyDigestLeagueSummary {
  contentCount: number;
  delivered: number;
  empty: boolean;
  failed: number;
  leagueId: string;
  recipientCount: number;
  skipped: number;
  windowEnd: string;
  windowStart: string;
}

export interface WeeklyDigestBatchSummary {
  delivered: number;
  failed: number;
  leagueCount: number;
  results: WeeklyDigestLeagueSummary[];
  skipped: number;
  windowEnd: string;
  windowStart: string;
}

interface DigestContentRow {
  authorPersona: string | null;
  id: string;
  publishedAt: Date;
  summary: string;
  title: string;
}

interface DigestRecipientRow {
  displayName: string;
  email: string;
  userId: string;
}

interface DigestSource {
  content: DigestContentRow[];
  league: { id: string; name: string } | null;
  recipients: DigestRecipientRow[];
}

function parseDate(value: Date | string | undefined, label: string): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new AppError({
    code: "DIGEST_WINDOW_INVALID",
    message: `${label} must be a valid date`,
    status: 400,
  });
}

export function resolveWeeklyDigestWindow(
  input: {
    now?: () => Date;
    windowEnd?: Date | string;
    windowStart?: Date | string;
  } = {},
): WeeklyDigestWindow {
  const end =
    input.windowEnd === undefined
      ? new Date((input.now?.() ?? new Date()).getTime())
      : parseDate(input.windowEnd, "windowEnd");
  const start =
    input.windowStart === undefined
      ? new Date(end.getTime() - WEEK_MS)
      : parseDate(input.windowStart, "windowStart");

  if (end <= start) {
    throw new AppError({
      code: "DIGEST_WINDOW_INVALID",
      message: "Digest windowEnd must be after windowStart",
      status: 400,
    });
  }

  return { end, start };
}

export function weeklyDigestKey(window: WeeklyDigestWindow): string {
  return `weekly:${window.start.toISOString()}:${window.end.toISOString()}`;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_DIGEST_LIMIT;
  }
  return Number.isInteger(limit) && limit > 0
    ? Math.min(limit, DEFAULT_DIGEST_LIMIT)
    : DEFAULT_DIGEST_LIMIT;
}

function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plain(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function contentUrl(
  appUrl: string,
  input: { contentItemId: string; leagueId: string },
): string {
  return new URL(
    `/leagues/${input.leagueId}/press/${input.contentItemId}`,
    appUrl,
  ).toString();
}

function personaLabel(persona: string | null): string {
  if (!persona) {
    return "Rumbledore";
  }
  return persona
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function contentForPayload(
  appUrl: string,
  input: { content: DigestContentRow[]; leagueId: string },
) {
  return input.content.map((item) => ({
    authorPersona: item.authorPersona,
    id: item.id,
    publishedAt: item.publishedAt.toISOString(),
    summary: item.summary,
    title: item.title,
    url: contentUrl(appUrl, {
      contentItemId: item.id,
      leagueId: input.leagueId,
    }),
  }));
}

function composeDigestEmail(input: {
  appUrl: string;
  content: DigestContentRow[];
  digestKey: string;
  league: { id: string; name: string };
  recipient: DigestRecipientRow;
  window: WeeklyDigestWindow;
}): EmailMessage {
  const content = contentForPayload(input.appUrl, {
    content: input.content,
    leagueId: input.league.id,
  });
  const subject = `${input.league.name} weekly digest`;
  const previewText = `${input.content.length} published ${input.content.length === 1 ? "story" : "stories"} from Rumbledore this week.`;
  const htmlItems = content
    .map(
      (
        item,
      ) => `<li style="margin:0 0 18px 0;padding:0 0 18px 0;border-bottom:1px solid #d8dde8;">
  <a href="${escapeHtml(item.url)}" style="color:#111827;font-size:18px;font-weight:800;text-decoration:none;">${escapeHtml(item.title)}</a>
  <p style="margin:6px 0 8px 0;color:#475569;font-size:14px;line-height:1.45;">${escapeHtml(item.summary)}</p>
  <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;">${escapeHtml(personaLabel(item.authorPersona))}</p>
</li>`,
    )
    .join("");
  const textItems = content
    .map(
      (item) =>
        `${item.title}\n${plain(item.summary)}\n${personaLabel(item.authorPersona)} - ${item.url}`,
    )
    .join("\n\n");

  return {
    html: `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#111827;font-family:Arial,sans-serif;">
    <main style="max-width:640px;margin:0 auto;padding:28px 20px;">
      <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;">Rumbledore digest</p>
      <h1 style="margin:0 0 10px 0;font-size:28px;line-height:1.1;">${escapeHtml(input.league.name)}</h1>
      <p style="margin:0 0 24px 0;color:#475569;font-size:14px;line-height:1.45;">${escapeHtml(previewText)}</p>
      <ol style="list-style:none;margin:0;padding:0;">${htmlItems}</ol>
    </main>
  </body>
</html>`,
    metadata: {
      contentItemIds: content.map((item) => item.id),
      digestKey: input.digestKey,
      leagueId: input.league.id,
      previewText,
      windowEnd: input.window.end.toISOString(),
      windowStart: input.window.start.toISOString(),
    },
    recipient: input.recipient,
    subject,
    text: `${subject}\n${previewText}\n\n${textItems}`,
  };
}

function deliveryPayload(input: {
  appUrl: string;
  content: DigestContentRow[];
  digestKey: string;
  league: { id: string; name: string };
  message: EmailMessage;
  recipient: DigestRecipientRow;
  window: WeeklyDigestWindow;
}): Record<string, unknown> {
  const content = contentForPayload(input.appUrl, {
    content: input.content,
    leagueId: input.league.id,
  });
  return {
    contentItems: content,
    digestKey: input.digestKey,
    html: input.message.html,
    league: input.league,
    previewText: input.message.metadata.previewText,
    recipient: {
      displayName: input.recipient.displayName,
      emailHash: emailHash(input.recipient.email),
      userId: input.recipient.userId,
    },
    subject: input.message.subject,
    text: input.message.text,
    v: 1,
    window: {
      end: input.window.end.toISOString(),
      start: input.window.start.toISOString(),
    },
  };
}

function timestampsForOutcome(
  status: EmailSendOutcome["status"],
  timestamp: Date,
): { deliveredAt: Date | null; failedAt: Date | null } {
  switch (status) {
    case "delivered":
      return { deliveredAt: timestamp, failedAt: null };
    case "failed":
      return { deliveredAt: null, failedAt: timestamp };
  }
}

function errorMessageForOutcome(outcome: EmailSendOutcome): string | null {
  switch (outcome.status) {
    case "delivered":
      return null;
    case "failed":
      return (outcome.errorMessage ?? "Email delivery failed").slice(
        0,
        MAX_DIGEST_ERROR_LENGTH,
      );
  }
}

function errorMessage(value: unknown): string {
  const message =
    value instanceof Error ? value.message : "Email delivery failed";
  return message.slice(0, MAX_DIGEST_ERROR_LENGTH);
}

async function loadDigestSource(
  db: Db,
  input: { leagueId: string; window: WeeklyDigestWindow },
): Promise<DigestSource> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [league] = await tx
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(eq(leagues.id, input.leagueId))
      .limit(1);

    const content = await tx
      .select({
        authorPersona: contentItems.authorPersona,
        id: contentItems.id,
        publishedAt: contentItems.publishedAt,
        summary: contentItems.summary,
        title: contentItems.title,
      })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.leagueId, input.leagueId),
          eq(contentItems.status, "published"),
          gte(contentItems.publishedAt, input.window.start),
          lt(contentItems.publishedAt, input.window.end),
        ),
      )
      .orderBy(asc(contentItems.publishedAt), asc(contentItems.createdAt));

    const recipients = await tx
      .select({
        displayName: users.displayName,
        email: users.email,
        userId: users.id,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .leftJoin(
        pushNotificationPreferences,
        and(
          eq(pushNotificationPreferences.leagueId, input.leagueId),
          eq(pushNotificationPreferences.userId, users.id),
          eq(
            pushNotificationPreferences.eventFamily,
            DIGEST_NOTIFICATION_EVENT_FAMILY,
          ),
        ),
      )
      .where(
        and(
          eq(members.organizationId, input.leagueId),
          or(
            isNull(pushNotificationPreferences.channel),
            eq(pushNotificationPreferences.channel, "digest"),
          ),
        ),
      )
      .orderBy(asc(users.displayName), asc(users.email));

    return { content, league: league ?? null, recipients };
  });
}

async function existingDigestDelivery(
  db: Db,
  input: { digestKey: string; leagueId: string; recipientUserId: string },
): Promise<boolean> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const [existing] = await tx
      .select({ id: emailDigestDeliveryRecords.id })
      .from(emailDigestDeliveryRecords)
      .where(
        and(
          eq(emailDigestDeliveryRecords.leagueId, input.leagueId),
          eq(emailDigestDeliveryRecords.recipientUserId, input.recipientUserId),
          eq(emailDigestDeliveryRecords.digestKey, input.digestKey),
        ),
      )
      .limit(1);
    return Boolean(existing);
  });
}

async function recordDigestDelivery(
  deps: WeeklyDigestDependencies,
  input: {
    content: DigestContentRow[];
    digestKey: string;
    league: { id: string; name: string };
    message: EmailMessage;
    outcome: EmailSendOutcome;
    recipient: DigestRecipientRow;
    timestamp: Date;
    window: WeeklyDigestWindow;
  },
): Promise<boolean> {
  const timestamps = timestampsForOutcome(
    input.outcome.status,
    input.timestamp,
  );
  const [inserted] = await withLeagueContext(deps.db, input.league.id, (tx) =>
    tx
      .insert(emailDigestDeliveryRecords)
      .values({
        contentItemIds: input.content.map((item) => item.id),
        deliveredAt: timestamps.deliveredAt,
        deliveryMode: deps.emailSender.config.mock ? "mock" : "real",
        deliveryStatus: input.outcome.status,
        digestKey: input.digestKey,
        errorMessage: errorMessageForOutcome(input.outcome),
        failedAt: timestamps.failedAt,
        leagueId: input.league.id,
        payload: deliveryPayload({
          appUrl: deps.appUrl,
          content: input.content,
          digestKey: input.digestKey,
          league: input.league,
          message: input.message,
          recipient: input.recipient,
          window: input.window,
        }),
        recipientEmailHash: emailHash(input.recipient.email),
        recipientUserId: input.recipient.userId,
        windowEndAt: input.window.end,
        windowStartAt: input.window.start,
      })
      .onConflictDoNothing({
        target: [
          emailDigestDeliveryRecords.leagueId,
          emailDigestDeliveryRecords.recipientUserId,
          emailDigestDeliveryRecords.digestKey,
        ],
      })
      .returning({ id: emailDigestDeliveryRecords.id }),
  );

  return Boolean(inserted);
}

export async function sendWeeklyDigestForLeague(
  deps: WeeklyDigestDependencies,
  input: WeeklyDigestLeagueInput,
): Promise<WeeklyDigestLeagueSummary> {
  const window = resolveWeeklyDigestWindow({
    now: deps.now,
    windowEnd: input.windowEnd,
    windowStart: input.windowStart,
  });
  const digestKey = input.digestKey ?? weeklyDigestKey(window);
  const source = await loadDigestSource(deps.db, {
    leagueId: input.leagueId,
    window,
  });
  const base: WeeklyDigestLeagueSummary = {
    contentCount: source.content.length,
    delivered: 0,
    empty: source.content.length === 0,
    failed: 0,
    leagueId: input.leagueId,
    recipientCount: source.recipients.length,
    skipped: 0,
    windowEnd: window.end.toISOString(),
    windowStart: window.start.toISOString(),
  };

  if (!source.league || source.content.length === 0) {
    return base;
  }

  for (const recipient of source.recipients) {
    if (
      await existingDigestDelivery(deps.db, {
        digestKey,
        leagueId: input.leagueId,
        recipientUserId: recipient.userId,
      })
    ) {
      base.skipped += 1;
      continue;
    }

    const message = composeDigestEmail({
      appUrl: deps.appUrl,
      content: source.content,
      digestKey,
      league: source.league,
      recipient,
      window,
    });
    let outcome: EmailSendOutcome;
    try {
      outcome = await deps.emailSender.sendEmail(message);
    } catch (error) {
      outcome = { errorMessage: errorMessage(error), status: "failed" };
    }

    const recorded = await recordDigestDelivery(deps, {
      content: source.content,
      digestKey,
      league: source.league,
      message,
      outcome,
      recipient,
      timestamp: deps.now?.() ?? new Date(),
      window,
    });
    if (!recorded) {
      base.skipped += 1;
      continue;
    }
    if (outcome.status === "delivered") {
      base.delivered += 1;
    } else {
      base.failed += 1;
    }
  }

  return base;
}

async function loadDigestLeagueIds(
  db: Db,
  input: WeeklyDigestBatchInput,
): Promise<string[]> {
  const leagueIds = [
    ...(input.leagueId ? [input.leagueId] : []),
    ...(input.leagueIds ?? []),
  ].filter((leagueId, index, values) => values.indexOf(leagueId) === index);
  const limit = normalizeLimit(input.limit);

  if (leagueIds.length > 0) {
    const rows = await db
      .select({ id: leagues.id })
      .from(leagues)
      .where(inArray(leagues.id, leagueIds))
      .orderBy(asc(leagues.createdAt))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  const rows = await db
    .select({ id: leagues.id })
    .from(leagues)
    .orderBy(asc(leagues.createdAt))
    .limit(limit);
  return rows.map((row) => row.id);
}

export async function sendWeeklyDigests(
  deps: WeeklyDigestDependencies,
  input: WeeklyDigestBatchInput = {},
): Promise<WeeklyDigestBatchSummary> {
  const window = resolveWeeklyDigestWindow({
    now: deps.now,
    windowEnd: input.windowEnd,
    windowStart: input.windowStart,
  });
  const leagueIds = await loadDigestLeagueIds(deps.db, input);
  const results: WeeklyDigestLeagueSummary[] = [];

  for (const leagueId of leagueIds) {
    results.push(
      await sendWeeklyDigestForLeague(deps, {
        digestKey: weeklyDigestKey(window),
        leagueId,
        windowEnd: window.end,
        windowStart: window.start,
      }),
    );
  }

  return {
    delivered: results.reduce((sum, result) => sum + result.delivered, 0),
    failed: results.reduce((sum, result) => sum + result.failed, 0),
    leagueCount: results.length,
    results,
    skipped: results.reduce((sum, result) => sum + result.skipped, 0),
    windowEnd: window.end.toISOString(),
    windowStart: window.start.toISOString(),
  };
}

export function createMockEmailSender() {
  return new MockEmailSender();
}
