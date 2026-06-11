import { and, desc, eq } from "drizzle-orm";
import { AppError } from "@/core/result";
import type { Db } from "@/db/client";
import {
  bettingEvents,
  bettingMarkets,
  type NewBettingEvent,
  type NewBettingMarket,
  type NewOddsSnapshot,
  oddsSnapshots,
} from "@/db/schema";
import { stableContentHash } from "@/ingestion/hash";
import type {
  BettingSport,
  OddsEvent,
  OddsMarket,
  OddsProvider,
  OddsQuote,
} from "./interfaces";
import { MockOddsProvider } from "./mocks";

const DEFAULT_SPORT: BettingSport = "nfl";
const DEFAULT_EVENT_LIMIT = 50;
const MAX_EVENT_LIMIT = 200;

export interface RefreshOddsCatalogInput {
  limit?: number;
  sport?: BettingSport;
}

export interface OddsIngestionDependencies {
  db: Db;
  now?: () => Date;
  provider: OddsProvider;
}

export interface PersistStats {
  inserted: number;
  unchanged: number;
  updated: number;
}

export interface RefreshOddsCatalogResult {
  events: PersistStats & { fetched: number; skipped: number };
  markets: PersistStats & { fetched: number; skipped: number };
  snapshots: { inserted: number; skipped: number };
  sport: BettingSport;
}

type PersistStatus = "inserted" | "unchanged" | "updated";

interface NormalizedEvent {
  contentHash: string;
  values: NewBettingEvent;
}

interface NormalizedMarket {
  contentHash: string;
  providerEventId: string;
  values: Omit<NewBettingMarket, "eventId">;
}

interface NormalizedQuote {
  sourcePayloadHash: string;
  values: Omit<NewOddsSnapshot, "marketId">;
}

function timestamp(deps: Pick<OddsIngestionDependencies, "now">): Date {
  return deps.now?.() ?? new Date();
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function validDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function limitFor(input: RefreshOddsCatalogInput): number {
  return Math.min(
    Math.max(input.limit ?? DEFAULT_EVENT_LIMIT, 1),
    MAX_EVENT_LIMIT,
  );
}

function eventHash(values: Omit<NewBettingEvent, "contentHash">): string {
  return stableContentHash({
    awayScore: values.awayScore,
    awayTeam: values.awayTeam,
    homeScore: values.homeScore,
    homeTeam: values.homeTeam,
    provider: values.provider,
    providerEventId: values.providerEventId,
    sport: values.sport,
    startTime: values.startTime,
    status: values.status,
  });
}

function marketHash(
  values: Omit<NewBettingMarket, "contentHash" | "eventId">,
): string {
  return stableContentHash({
    metadata: values.metadata,
    period: values.period,
    propType: values.propType,
    provider: values.provider,
    providerMarketId: values.providerMarketId,
    status: values.status,
    subject: values.subject,
    type: values.type,
  });
}

function quoteHash(quote: OddsQuote): string {
  return stableContentHash(
    quote.sourcePayload ?? {
      awayPrice: quote.awayPrice,
      homePrice: quote.homePrice,
      line: quote.line,
      outcomePrice: quote.outcomePrice,
      overPrice: quote.overPrice,
      provider: quote.provider,
      providerMarketId: quote.providerMarketId,
      underPrice: quote.underPrice,
    },
  );
}

function hasAnyPrice(quote: OddsQuote): boolean {
  return [
    quote.awayPrice,
    quote.homePrice,
    quote.outcomePrice,
    quote.overPrice,
    quote.underPrice,
  ].some((value) => Number.isInteger(value));
}

function normalizeEvent(event: OddsEvent, at: Date): NormalizedEvent | null {
  const provider = cleanText(event.provider);
  const providerEventId = cleanText(event.providerEventId);
  const homeTeam = cleanText(event.homeTeam);
  const awayTeam = cleanText(event.awayTeam);
  if (
    !provider ||
    !providerEventId ||
    !homeTeam ||
    !awayTeam ||
    !validDate(event.startTime)
  ) {
    return null;
  }

  const values = {
    awayScore: event.awayScore ?? null,
    awayTeam,
    homeScore: event.homeScore ?? null,
    homeTeam,
    lastUpdated:
      event.lastUpdated && validDate(event.lastUpdated)
        ? event.lastUpdated
        : at,
    provider,
    providerEventId,
    sport: event.sport,
    startTime: event.startTime,
    status: event.status,
    updatedAt: at,
  } satisfies Omit<NewBettingEvent, "contentHash">;

  return {
    contentHash: eventHash(values),
    values: { ...values, contentHash: eventHash(values) },
  };
}

function normalizeMarket(
  market: OddsMarket,
  at: Date,
): NormalizedMarket | null {
  const provider = cleanText(market.provider);
  const providerEventId = cleanText(market.providerEventId);
  const providerMarketId = cleanText(market.providerMarketId);
  const subject = cleanText(market.subject) || "game";
  if (!provider || !providerEventId || !providerMarketId) {
    return null;
  }

  const values = {
    lastUpdated: at,
    metadata: market.metadata ?? {},
    period: market.period,
    propType: market.propType ?? null,
    provider,
    providerMarketId,
    status: market.status,
    subject,
    type: market.type,
  } satisfies Omit<NewBettingMarket, "contentHash" | "eventId">;

  return {
    contentHash: marketHash(values),
    providerEventId,
    values: { ...values, contentHash: marketHash(values) },
  };
}

function normalizeQuote(quote: OddsQuote, at: Date): NormalizedQuote | null {
  const provider = cleanText(quote.provider);
  const providerMarketId = cleanText(quote.providerMarketId);
  if (!provider || !providerMarketId || !hasAnyPrice(quote)) {
    return null;
  }

  const sourcePayloadHash = quoteHash(quote);
  return {
    sourcePayloadHash,
    values: {
      awayPrice: quote.awayPrice ?? null,
      capturedAt:
        quote.capturedAt && validDate(quote.capturedAt) ? quote.capturedAt : at,
      homePrice: quote.homePrice ?? null,
      line: quote.line ?? null,
      metadata: quote.metadata ?? {},
      outcomePrice: quote.outcomePrice ?? null,
      overPrice: quote.overPrice ?? null,
      provider,
      sourcePayloadHash,
      underPrice: quote.underPrice ?? null,
    },
  };
}

async function findExistingEvent(
  db: Db,
  provider: string,
  providerEventId: string,
) {
  const [existing] = await db
    .select({
      contentHash: bettingEvents.contentHash,
      id: bettingEvents.id,
    })
    .from(bettingEvents)
    .where(
      and(
        eq(bettingEvents.provider, provider),
        eq(bettingEvents.providerEventId, providerEventId),
      ),
    )
    .limit(1);

  return existing ?? null;
}

async function persistEvent({
  db,
  item,
}: {
  db: Db;
  item: NormalizedEvent;
}): Promise<{ id: string; status: PersistStatus }> {
  const existing = await findExistingEvent(
    db,
    item.values.provider,
    item.values.providerEventId,
  );
  if (existing?.contentHash === item.contentHash) {
    return { id: existing.id, status: "unchanged" };
  }

  if (existing) {
    const [updated] = await db
      .update(bettingEvents)
      .set(item.values)
      .where(eq(bettingEvents.id, existing.id))
      .returning({ id: bettingEvents.id });
    if (!updated) {
      throw new AppError({
        code: "ODDS_EVENT_UPDATE_FAILED",
        message: "Betting event could not be updated",
        status: 500,
      });
    }
    return { id: updated.id, status: "updated" };
  }

  const [inserted] = await db
    .insert(bettingEvents)
    .values(item.values)
    .onConflictDoNothing({
      target: [bettingEvents.provider, bettingEvents.providerEventId],
    })
    .returning({ id: bettingEvents.id });

  if (inserted) {
    return { id: inserted.id, status: "inserted" };
  }

  const conflicted = await findExistingEvent(
    db,
    item.values.provider,
    item.values.providerEventId,
  );
  if (!conflicted) {
    throw new AppError({
      code: "ODDS_EVENT_INSERT_FAILED",
      message: "Betting event could not be inserted or reloaded",
      status: 500,
    });
  }

  return { id: conflicted.id, status: "unchanged" };
}

async function findExistingMarket(
  db: Db,
  provider: string,
  providerMarketId: string,
) {
  const [existing] = await db
    .select({
      contentHash: bettingMarkets.contentHash,
      id: bettingMarkets.id,
    })
    .from(bettingMarkets)
    .where(
      and(
        eq(bettingMarkets.provider, provider),
        eq(bettingMarkets.providerMarketId, providerMarketId),
      ),
    )
    .limit(1);

  return existing ?? null;
}

async function persistMarket({
  db,
  eventId,
  item,
}: {
  db: Db;
  eventId: string;
  item: NormalizedMarket;
}): Promise<{ id: string; status: PersistStatus }> {
  const values = {
    ...item.values,
    eventId,
  } satisfies NewBettingMarket;
  const existing = await findExistingMarket(
    db,
    values.provider,
    values.providerMarketId,
  );

  if (existing?.contentHash === item.contentHash) {
    return { id: existing.id, status: "unchanged" };
  }

  if (existing) {
    const [updated] = await db
      .update(bettingMarkets)
      .set(values)
      .where(eq(bettingMarkets.id, existing.id))
      .returning({ id: bettingMarkets.id });
    if (!updated) {
      throw new AppError({
        code: "ODDS_MARKET_UPDATE_FAILED",
        message: "Betting market could not be updated",
        status: 500,
      });
    }
    return { id: updated.id, status: "updated" };
  }

  const [inserted] = await db
    .insert(bettingMarkets)
    .values(values)
    .onConflictDoNothing({
      target: [bettingMarkets.provider, bettingMarkets.providerMarketId],
    })
    .returning({ id: bettingMarkets.id });

  if (inserted) {
    return { id: inserted.id, status: "inserted" };
  }

  const conflicted = await findExistingMarket(
    db,
    values.provider,
    values.providerMarketId,
  );
  if (!conflicted) {
    throw new AppError({
      code: "ODDS_MARKET_INSERT_FAILED",
      message: "Betting market could not be inserted or reloaded",
      status: 500,
    });
  }

  return { id: conflicted.id, status: "unchanged" };
}

async function persistSnapshot({
  db,
  item,
  marketId,
}: {
  db: Db;
  item: NormalizedQuote;
  marketId: string;
}): Promise<"inserted" | "skipped"> {
  const [latest] = await db
    .select({ sourcePayloadHash: oddsSnapshots.sourcePayloadHash })
    .from(oddsSnapshots)
    .where(eq(oddsSnapshots.marketId, marketId))
    .orderBy(desc(oddsSnapshots.capturedAt), desc(oddsSnapshots.createdAt))
    .limit(1);

  if (latest?.sourcePayloadHash === item.sourcePayloadHash) {
    return "skipped";
  }

  await db.insert(oddsSnapshots).values({
    ...item.values,
    marketId,
  });
  return "inserted";
}

function bump(stats: PersistStats, status: PersistStatus): void {
  stats[status] += 1;
}

export function createMockOddsDependencies(db: Db): OddsIngestionDependencies {
  return {
    db,
    provider: new MockOddsProvider(),
  };
}

export async function refreshOddsCatalog({
  deps,
  input = {},
}: {
  deps: OddsIngestionDependencies;
  input?: RefreshOddsCatalogInput;
}): Promise<RefreshOddsCatalogResult> {
  const at = timestamp(deps);
  const sport = input.sport ?? DEFAULT_SPORT;
  const eventLimit = limitFor(input);
  const eventStats = { inserted: 0, unchanged: 0, updated: 0 };
  const marketStats = { inserted: 0, unchanged: 0, updated: 0 };
  const snapshotStats = { inserted: 0, skipped: 0 };
  let skippedEvents = 0;
  let skippedMarkets = 0;
  let fetchedMarkets = 0;

  const sourceEvents = await deps.provider.listEvents({ now: at, sport });
  const eventIds = new Map<string, string>();

  for (const event of sourceEvents.slice(0, eventLimit)) {
    const normalized = normalizeEvent(event, at);
    if (!normalized) {
      skippedEvents += 1;
      continue;
    }

    const persisted = await persistEvent({ db: deps.db, item: normalized });
    bump(eventStats, persisted.status);
    eventIds.set(
      `${normalized.values.provider}:${normalized.values.providerEventId}`,
      persisted.id,
    );

    const marketInput = {
      now: at,
      providerEventId: normalized.values.providerEventId,
      sport,
    };
    const sourceMarkets = await deps.provider.getMarkets(marketInput);
    const marketIds = new Map<string, string>();
    fetchedMarkets += sourceMarkets.length;

    for (const market of sourceMarkets) {
      const normalizedMarket = normalizeMarket(market, at);
      if (!normalizedMarket) {
        skippedMarkets += 1;
        continue;
      }

      const marketEventId = eventIds.get(
        `${normalizedMarket.values.provider}:${normalizedMarket.providerEventId}`,
      );
      if (!marketEventId) {
        skippedMarkets += 1;
        continue;
      }

      const persistedMarket = await persistMarket({
        db: deps.db,
        eventId: marketEventId,
        item: normalizedMarket,
      });
      bump(marketStats, persistedMarket.status);
      marketIds.set(
        `${normalizedMarket.values.provider}:${normalizedMarket.values.providerMarketId}`,
        persistedMarket.id,
      );
    }

    const sourceQuotes = await deps.provider.getOdds(marketInput);
    for (const quote of sourceQuotes) {
      const normalizedQuote = normalizeQuote(quote, at);
      if (!normalizedQuote) {
        snapshotStats.skipped += 1;
        continue;
      }

      const marketId = marketIds.get(
        `${normalizedQuote.values.provider}:${quote.providerMarketId}`,
      );
      if (!marketId) {
        snapshotStats.skipped += 1;
        continue;
      }

      const status = await persistSnapshot({
        db: deps.db,
        item: normalizedQuote,
        marketId,
      });
      snapshotStats[status] += 1;
    }
  }

  return {
    events: {
      fetched: sourceEvents.length,
      skipped: skippedEvents,
      ...eventStats,
    },
    markets: {
      fetched: fetchedMarkets,
      skipped: skippedMarkets,
      ...marketStats,
    },
    snapshots: snapshotStats,
    sport,
  };
}
