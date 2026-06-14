import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { withLeagueContext } from "@/db/rls";
import {
  type BetSlip,
  type BettingEvent,
  type BettingMarket,
  betSlips,
  bettingEvents,
  bettingMarkets,
  leagues,
  oddsSnapshots,
} from "@/db/schema";
import { getProviderBadgeLabel } from "@/navigation";
import type { FantasyProviderId } from "@/providers";
import { getCurrentBankrollBalance } from "./bankroll";
import type { BetLegSelection } from "./placement";

const MARKET_LIMIT = 24;
const RECENT_SLIP_LIMIT = 5;

export interface LeagueBetData {
  readonly balance: LeagueBetBalance | null;
  readonly league: {
    readonly id: string;
    readonly name: string;
    readonly provider: FantasyProviderId;
    readonly providerLabel: string;
    readonly season: number;
  };
  readonly markets: LeagueBetMarket[];
  readonly recentSlips: LeagueBetSlip[];
}

export interface LeagueBetBalance {
  readonly balanceCents: number;
  readonly floorCents: number;
  readonly weekEnd: string;
  readonly weekStart: string;
}

export interface LeagueBetSlip {
  readonly id: string;
  readonly kind: BetSlip["kind"];
  readonly placedAt: string;
  readonly potentialPayoutCents: number;
  readonly stakeCents: number;
  readonly status: BetSlip["status"];
}

export interface LeagueBetMarket {
  readonly awayTeam: string;
  readonly capturedAt: string;
  readonly eventId: string;
  readonly eventStatus: BettingEvent["status"];
  readonly homeTeam: string;
  readonly line: number | null;
  readonly marketId: string;
  readonly marketStatus: BettingMarket["status"];
  readonly marketType: BettingMarket["type"];
  readonly period: BettingMarket["period"];
  readonly propType: string | null;
  readonly selections: LeagueBetSelection[];
  readonly snapshotId: string;
  readonly startTime: string;
  readonly subject: string;
  readonly subjectLabel: string;
}

export interface LeagueBetSelection {
  readonly label: string;
  readonly line: number | null;
  readonly price: number;
  readonly selection: BetLegSelection;
}

export type LeagueBetLoadResult =
  | { readonly status: "ready"; readonly data: LeagueBetData }
  | { readonly status: "not_found" };

type MarketRow = {
  awayTeam: string;
  eventId: string;
  eventStatus: LeagueBetMarket["eventStatus"];
  homeTeam: string;
  marketId: string;
  marketStatus: LeagueBetMarket["marketStatus"];
  marketType: LeagueBetMarket["marketType"];
  metadata: Record<string, unknown>;
  period: LeagueBetMarket["period"];
  propType: string | null;
  startTime: Date;
  subject: string;
};

type SnapshotRow = {
  awayPrice: number | null;
  capturedAt: Date;
  homePrice: number | null;
  line: number | null;
  marketId: string;
  oddsSnapshotId: string;
  outcomePrice: number | null;
  overPrice: number | null;
  underPrice: number | null;
};

export async function getLeagueBetData(
  db: Db,
  input: { leagueId: string; userId: string },
): Promise<LeagueBetLoadResult> {
  const [league] = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      provider: leagues.provider,
      season: leagues.season,
    })
    .from(leagues)
    .where(eq(leagues.id, input.leagueId))
    .limit(1);

  if (!league) {
    return { status: "not_found" };
  }

  const balance = await getCurrentBankrollBalance(db, {
    leagueId: input.leagueId,
    userId: input.userId,
  });
  const recentSlips = await listRecentSlips(db, input);
  const markets = await listCurrentMarkets(db);

  return {
    data: {
      balance: balance
        ? {
            balanceCents: balance.balanceCents,
            floorCents: balance.week.floorCents,
            weekEnd: balance.week.weekEnd.toISOString(),
            weekStart: balance.week.weekStart.toISOString(),
          }
        : null,
      league: {
        ...league,
        providerLabel: getProviderBadgeLabel(league.provider),
      },
      markets,
      recentSlips,
    },
    status: "ready",
  };
}

async function listRecentSlips(
  db: Db,
  input: { leagueId: string; userId: string },
): Promise<LeagueBetSlip[]> {
  return withLeagueContext(db, input.leagueId, async (tx) => {
    const rows = await tx
      .select({
        id: betSlips.id,
        kind: betSlips.kind,
        placedAt: betSlips.placedAt,
        potentialPayoutCents: betSlips.potentialPayoutCents,
        stakeCents: betSlips.stakeCents,
        status: betSlips.status,
      })
      .from(betSlips)
      .where(
        and(
          eq(betSlips.leagueId, input.leagueId),
          eq(betSlips.userId, input.userId),
        ),
      )
      .orderBy(desc(betSlips.placedAt))
      .limit(RECENT_SLIP_LIMIT);

    return rows.map((row) => ({
      ...row,
      placedAt: row.placedAt.toISOString(),
    }));
  });
}

async function listCurrentMarkets(db: Db): Promise<LeagueBetMarket[]> {
  const marketRows = await db
    .select({
      awayTeam: bettingEvents.awayTeam,
      eventId: bettingEvents.id,
      eventStatus: bettingEvents.status,
      homeTeam: bettingEvents.homeTeam,
      marketId: bettingMarkets.id,
      marketStatus: bettingMarkets.status,
      marketType: bettingMarkets.type,
      metadata: bettingMarkets.metadata,
      period: bettingMarkets.period,
      propType: bettingMarkets.propType,
      startTime: bettingEvents.startTime,
      subject: bettingMarkets.subject,
    })
    .from(bettingMarkets)
    .innerJoin(bettingEvents, eq(bettingEvents.id, bettingMarkets.eventId))
    .where(eq(bettingMarkets.status, "open"))
    .orderBy(
      asc(bettingEvents.startTime),
      asc(bettingMarkets.type),
      asc(bettingMarkets.subject),
    )
    .limit(MARKET_LIMIT);

  if (marketRows.length === 0) {
    return [];
  }

  const snapshotsByMarketId = await latestSnapshotsByMarketId(
    db,
    marketRows.map((row) => row.marketId),
  );

  return marketRows
    .map((row) =>
      toLeagueBetMarket(row, snapshotsByMarketId.get(row.marketId) ?? null),
    )
    .filter((market): market is LeagueBetMarket => market !== null);
}

async function latestSnapshotsByMarketId(
  db: Db,
  marketIds: readonly string[],
): Promise<Map<string, SnapshotRow>> {
  const rows = await db
    .select({
      awayPrice: oddsSnapshots.awayPrice,
      capturedAt: oddsSnapshots.capturedAt,
      homePrice: oddsSnapshots.homePrice,
      line: oddsSnapshots.line,
      marketId: oddsSnapshots.marketId,
      oddsSnapshotId: oddsSnapshots.id,
      outcomePrice: oddsSnapshots.outcomePrice,
      overPrice: oddsSnapshots.overPrice,
      underPrice: oddsSnapshots.underPrice,
    })
    .from(oddsSnapshots)
    .where(inArray(oddsSnapshots.marketId, [...marketIds]))
    .orderBy(desc(oddsSnapshots.capturedAt), desc(oddsSnapshots.createdAt));

  const latest = new Map<string, SnapshotRow>();
  for (const row of rows) {
    if (!latest.has(row.marketId)) {
      latest.set(row.marketId, row);
    }
  }
  return latest;
}

function toLeagueBetMarket(
  row: MarketRow,
  snapshot: SnapshotRow | null,
): LeagueBetMarket | null {
  if (!snapshot) {
    return null;
  }

  const selections = marketSelections(row, snapshot);
  if (selections.length === 0) {
    return null;
  }

  return {
    awayTeam: row.awayTeam,
    capturedAt: snapshot.capturedAt.toISOString(),
    eventId: row.eventId,
    eventStatus: row.eventStatus,
    homeTeam: row.homeTeam,
    line: snapshot.line,
    marketId: row.marketId,
    marketStatus: row.marketStatus,
    marketType: row.marketType,
    period: row.period,
    propType: row.propType,
    selections,
    snapshotId: snapshot.oddsSnapshotId,
    startTime: row.startTime.toISOString(),
    subject: row.subject,
    subjectLabel: subjectLabel(row),
  };
}

function marketSelections(
  row: Pick<MarketRow, "awayTeam" | "homeTeam" | "marketType" | "subject">,
  snapshot: SnapshotRow,
): LeagueBetSelection[] {
  switch (row.marketType) {
    case "moneyline":
      return compactSelections([
        priceSelection(row.homeTeam, snapshot.homePrice, "home", null),
        priceSelection(row.awayTeam, snapshot.awayPrice, "away", null),
      ]);
    case "spread":
      return compactSelections([
        priceSelection(row.homeTeam, snapshot.homePrice, "home", snapshot.line),
        priceSelection(
          row.awayTeam,
          snapshot.awayPrice,
          "away",
          inverseLine(snapshot.line),
        ),
      ]);
    case "total":
      return compactSelections([
        priceSelection("Over", snapshot.overPrice, "over", snapshot.line),
        priceSelection("Under", snapshot.underPrice, "under", snapshot.line),
      ]);
    case "player_prop":
      return compactSelections([
        priceSelection(
          "Over",
          snapshot.overPrice,
          "player_over",
          snapshot.line,
        ),
        priceSelection(
          "Under",
          snapshot.underPrice,
          "player_under",
          snapshot.line,
        ),
      ]);
  }
}

function priceSelection(
  label: string,
  price: number | null,
  selection: BetLegSelection,
  line: number | null,
): LeagueBetSelection | null {
  if (price === null) {
    return null;
  }
  return { label, line, price, selection };
}

function inverseLine(line: number | null): number | null {
  return typeof line === "number" ? -line : null;
}

function subjectLabel(
  row: Pick<MarketRow, "marketType" | "metadata" | "subject">,
): string {
  if (row.marketType !== "player_prop") {
    return "Game";
  }
  const playerName = row.metadata.playerName;
  return typeof playerName === "string" && playerName.trim()
    ? playerName.trim()
    : row.subject;
}

function compactSelections(
  selections: readonly (LeagueBetSelection | null)[],
): LeagueBetSelection[] {
  return selections.filter(
    (selection): selection is LeagueBetSelection => selection !== null,
  );
}
