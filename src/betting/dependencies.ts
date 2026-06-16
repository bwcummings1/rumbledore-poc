import type { Env } from "@/core/env/schema";
import {
  createSpendGuard,
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
  private recordedRealUsage = false;

  constructor(
    readonly real: OddsProvider,
    private readonly mock: OddsProvider,
    private readonly guard: SpendGuard,
  ) {}

  async listEvents(input: OddsProviderListInput): Promise<OddsEvent[]> {
    const delegate = await this.selectDelegate();
    const value = await delegate.listEvents(input);
    await this.recordRealUsage(delegate);
    return value;
  }

  async getMarkets(input: OddsProviderEventInput): Promise<OddsMarket[]> {
    const delegate = await this.selectDelegate();
    const value = await delegate.getMarkets(input);
    await this.recordRealUsage(delegate);
    return value;
  }

  async getOdds(input: OddsProviderEventInput): Promise<OddsQuote[]> {
    const delegate = await this.selectDelegate();
    const value = await delegate.getOdds(input);
    await this.recordRealUsage(delegate);
    return value;
  }

  private async selectDelegate(): Promise<OddsProvider> {
    if (this.delegate) {
      return this.delegate;
    }

    this.delegate =
      (await this.guard.check("odds")) === "deny" ? this.mock : this.real;
    return this.delegate;
  }

  private async recordRealUsage(delegate: OddsProvider): Promise<void> {
    if (delegate !== this.real || this.recordedRealUsage) {
      return;
    }

    this.recordedRealUsage = true;
    await this.guard.record("odds", { units: 1 });
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
