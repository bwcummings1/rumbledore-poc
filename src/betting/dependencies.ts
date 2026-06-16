import type { Env } from "@/core/env/schema";
import type { Logger } from "@/core/logging";
import {
  createSpendGuard,
  logProviderUsage,
  runGuardedProviderCall,
  type SpendGuard,
} from "@/core/spend-guard";
import type { Db } from "@/db/client";
import type { OddsIngestionDependencies } from "./ingestion";
import type {
  EventResult,
  OddsEvent,
  OddsMarket,
  OddsProvider,
  OddsProviderEventInput,
  OddsProviderListInput,
  OddsQuote,
  ResultsProvider,
  ResultsProviderInput,
} from "./interfaces";
import { MockOddsProvider, MockResultsProvider } from "./mocks";
import { SportsDataIoResultsProvider, TheOddsApiProvider } from "./real";
import type { BettingSettlementDependencies } from "./settlement";

export class GuardedOddsProvider implements OddsProvider {
  private delegate: OddsProvider | null = null;
  private demotedDelegate = false;
  private recordedRealUsage = false;

  constructor(
    readonly real: OddsProvider,
    private readonly mock: OddsProvider,
    private readonly guard: SpendGuard,
    private readonly logger?: Logger,
  ) {}

  async listEvents(input: OddsProviderListInput): Promise<OddsEvent[]> {
    const operation = "odds.listEvents";
    const delegate = await this.selectDelegate();
    if (delegate !== this.real) {
      await this.logDemotion(operation);
      return delegate.listEvents(input);
    }
    const value = await delegate.listEvents(input);
    await this.recordRealUsage(operation);
    return value;
  }

  async getMarkets(input: OddsProviderEventInput): Promise<OddsMarket[]> {
    const operation = "odds.getMarkets";
    const delegate = await this.selectDelegate();
    if (delegate !== this.real) {
      await this.logDemotion(operation);
      return delegate.getMarkets(input);
    }
    const value = await delegate.getMarkets(input);
    await this.recordRealUsage(operation);
    return value;
  }

  async getOdds(input: OddsProviderEventInput): Promise<OddsQuote[]> {
    const operation = "odds.getOdds";
    const delegate = await this.selectDelegate();
    if (delegate !== this.real) {
      await this.logDemotion(operation);
      return delegate.getOdds(input);
    }
    const value = await delegate.getOdds(input);
    await this.recordRealUsage(operation);
    return value;
  }

  private async selectDelegate(): Promise<OddsProvider> {
    if (this.delegate) {
      return this.delegate;
    }

    this.demotedDelegate = (await this.guard.check("odds")) === "deny";
    this.delegate = this.demotedDelegate ? this.mock : this.real;
    return this.delegate;
  }

  private async recordRealUsage(operation: string): Promise<void> {
    if (this.recordedRealUsage) {
      return;
    }

    this.recordedRealUsage = true;
    const record = await this.guard.record("odds", { units: 1 });
    logProviderUsage({
      cap: record.cap,
      capReached: record.breached,
      cumulative: record.cumulative,
      demoted: false,
      logger: this.logger,
      operation,
      provider: "odds",
      unit: record.unit,
      units: record.units,
      window: record.window,
    });
  }

  private async logDemotion(operation: string): Promise<void> {
    if (!this.demotedDelegate) {
      return;
    }
    const snapshot = await this.guard.snapshot("odds");
    logProviderUsage({
      cap: snapshot.cap,
      cumulative: snapshot.cumulative,
      demoted: true,
      logger: this.logger,
      operation,
      provider: "odds",
      unit: snapshot.unit,
      units: 0,
      window: snapshot.window,
    });
  }
}

export class GuardedResultsProvider implements ResultsProvider {
  readonly id: string;

  constructor(
    readonly real: ResultsProvider,
    private readonly mock: ResultsProvider,
    private readonly guard: SpendGuard,
  ) {
    this.id = real.id;
  }

  async getEventResult(input: ResultsProviderInput): Promise<EventResult> {
    return runGuardedProviderCall({
      guard: this.guard,
      mockCall: () => this.mock.getEventResult(input),
      operation: "results.getEventResult",
      provider: "sportsdataio",
      realCall: async () => ({
        usage: { units: 1 },
        value: await this.real.getEventResult(input),
      }),
    });
  }
}

export interface BettingDependencyFactoryOptions {
  spendGuard?: SpendGuard;
}

export function createOddsDependencies(
  db: Db,
  env: Pick<Env, "redisUrl" | "services" | "spendGuard">,
  options: BettingDependencyFactoryOptions = {},
): OddsIngestionDependencies {
  const spendGuard = options.spendGuard ?? createSpendGuard(env);
  const mockProvider = new MockOddsProvider();

  return {
    db,
    provider: env.services.odds.mock
      ? mockProvider
      : new GuardedOddsProvider(
          new TheOddsApiProvider({ apiKey: env.services.odds.apiKey }),
          mockProvider,
          spendGuard,
        ),
  };
}

export function createBettingSettlementDependencies(
  db: Db,
  env: Pick<Env, "redisUrl" | "services" | "spendGuard">,
  options: BettingDependencyFactoryOptions = {},
): BettingSettlementDependencies {
  const spendGuard = options.spendGuard ?? createSpendGuard(env);
  const mockResultsProvider = new MockResultsProvider();

  return {
    db,
    resultsProvider: env.services.sportsdataio.mock
      ? mockResultsProvider
      : new GuardedResultsProvider(
          new SportsDataIoResultsProvider({
            apiKey: env.services.sportsdataio.apiKey,
          }),
          mockResultsProvider,
          spendGuard,
        ),
  };
}
