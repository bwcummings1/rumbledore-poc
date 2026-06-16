import type { SpendGuardProvider, SpendGuardUnit } from "./env/schema";

type MetricKind = "api" | "job";

export interface MetricBucketSnapshot {
  averageDurationMs: number;
  count: number;
  errorCount: number;
  p95DurationMs: number;
  successCount: number;
}

export interface ApiMetricSnapshot extends MetricBucketSnapshot {
  statusCounts: Record<string, number>;
}

export interface MetricsSnapshot {
  generatedAt: string;
  api: {
    routes: Record<string, ApiMetricSnapshot>;
    total: ApiMetricSnapshot;
  };
  jobs: {
    functions: Record<string, MetricBucketSnapshot>;
    total: MetricBucketSnapshot;
  };
  providerUsage: {
    providers: Partial<Record<SpendGuardProvider, ProviderUsageSnapshot>>;
    total: ProviderUsageTotalSnapshot;
  };
}

export interface ProviderUsageOperationSnapshot {
  callCount: number;
  demotionCount: number;
  totalUnits: number;
}

export interface ProviderUsageSnapshot {
  callCount: number;
  cap: number;
  demotionCount: number;
  latestCumulative: number;
  operations: Record<string, ProviderUsageOperationSnapshot>;
  percentConsumed: number;
  realCallCount: number;
  totalUnits: number;
  unit: SpendGuardUnit;
}

export interface ProviderUsageTotalSnapshot {
  callCount: number;
  demotionCount: number;
  realCallCount: number;
  totalUnits: number;
}

interface MetricRecord {
  durationMs: number;
  ok: boolean;
  status?: number;
}

const MAX_SAMPLES_PER_BUCKET = 500;

const apiBuckets = new Map<string, MetricRecord[]>();
const jobBuckets = new Map<string, MetricRecord[]>();
const providerUsageBuckets = new Map<
  SpendGuardProvider,
  ProviderUsageRecord[]
>();

interface ProviderUsageRecord {
  cap: number;
  cumulative: number;
  demoted: boolean;
  operation: string;
  unit: SpendGuardUnit;
  units: number;
}

function clampDuration(durationMs: number): number {
  return Math.max(0, Math.round(durationMs));
}

function appendSample(
  buckets: Map<string, MetricRecord[]>,
  key: string,
  record: MetricRecord,
) {
  const samples = buckets.get(key) ?? [];
  samples.push(record);
  if (samples.length > MAX_SAMPLES_PER_BUCKET) {
    samples.splice(0, samples.length - MAX_SAMPLES_PER_BUCKET);
  }
  buckets.set(key, samples);
}

function appendProviderUsageSample(
  provider: SpendGuardProvider,
  record: ProviderUsageRecord,
) {
  const samples = providerUsageBuckets.get(provider) ?? [];
  samples.push(record);
  if (samples.length > MAX_SAMPLES_PER_BUCKET) {
    samples.splice(0, samples.length - MAX_SAMPLES_PER_BUCKET);
  }
  providerUsageBuckets.set(provider, samples);
}

function percentile95(durations: number[]): number {
  if (durations.length === 0) {
    return 0;
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

function percentConsumed(cumulative: number, cap: number): number {
  if (cap <= 0) {
    return 0;
  }
  return Math.round((cumulative / cap) * 10_000) / 100;
}

function snapshotBucket(samples: MetricRecord[]): MetricBucketSnapshot {
  const durations = samples.map((sample) => sample.durationMs);
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  const successCount = samples.filter((sample) => sample.ok).length;
  return {
    averageDurationMs:
      samples.length === 0 ? 0 : Math.round(totalDuration / samples.length),
    count: samples.length,
    errorCount: samples.length - successCount,
    p95DurationMs: percentile95(durations),
    successCount,
  };
}

function snapshotProviderUsage(
  samples: ProviderUsageRecord[],
): ProviderUsageSnapshot {
  const latest = samples[samples.length - 1];
  const operations: Record<string, ProviderUsageOperationSnapshot> = {};
  let demotionCount = 0;
  let totalUnits = 0;
  for (const sample of samples) {
    totalUnits += sample.units;
    if (sample.demoted) {
      demotionCount += 1;
    }
    const operation = operations[sample.operation] ?? {
      callCount: 0,
      demotionCount: 0,
      totalUnits: 0,
    };
    operation.callCount += 1;
    operation.totalUnits += sample.units;
    if (sample.demoted) {
      operation.demotionCount += 1;
    }
    operations[sample.operation] = operation;
  }

  const cap = latest?.cap ?? 0;
  const latestCumulative = latest?.cumulative ?? 0;
  return {
    callCount: samples.length,
    cap,
    demotionCount,
    latestCumulative,
    operations,
    percentConsumed: percentConsumed(latestCumulative, cap),
    realCallCount: samples.length - demotionCount,
    totalUnits,
    unit: latest?.unit ?? "requests",
  };
}

function snapshotApiBucket(samples: MetricRecord[]): ApiMetricSnapshot {
  const statusCounts: Record<string, number> = {};
  for (const sample of samples) {
    const key = String(sample.status ?? 0);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }
  return {
    ...snapshotBucket(samples),
    statusCounts,
  };
}

function flattenBuckets(buckets: Map<string, MetricRecord[]>): MetricRecord[] {
  return [...buckets.values()].flat();
}

function providerUsageSnapshots(): Partial<
  Record<SpendGuardProvider, ProviderUsageSnapshot>
> {
  return Object.fromEntries(
    [...providerUsageBuckets.entries()].map(([provider, samples]) => [
      provider,
      snapshotProviderUsage(samples),
    ]),
  ) as Partial<Record<SpendGuardProvider, ProviderUsageSnapshot>>;
}

function providerUsageTotal(
  providers: Partial<Record<SpendGuardProvider, ProviderUsageSnapshot>>,
): ProviderUsageTotalSnapshot {
  const snapshots = Object.values(providers);
  return {
    callCount: snapshots.reduce((sum, snapshot) => sum + snapshot.callCount, 0),
    demotionCount: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.demotionCount,
      0,
    ),
    realCallCount: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.realCallCount,
      0,
    ),
    totalUnits: snapshots.reduce(
      (sum, snapshot) => sum + snapshot.totalUnits,
      0,
    ),
  };
}

export function metricKey({
  kind,
  method,
  name,
}: {
  kind: MetricKind;
  method?: string;
  name: string;
}): string {
  return kind === "api" ? `${method ?? "GET"} ${name}` : name;
}

export function recordApiMetric({
  durationMs,
  method,
  route,
  status,
}: {
  durationMs: number;
  method: string;
  route: string;
  status: number;
}) {
  appendSample(apiBuckets, metricKey({ kind: "api", method, name: route }), {
    durationMs: clampDuration(durationMs),
    ok: status < 500,
    status,
  });
}

export function recordJobMetric({
  durationMs,
  functionId,
  ok,
}: {
  durationMs: number;
  functionId: string;
  ok: boolean;
}) {
  appendSample(jobBuckets, metricKey({ kind: "job", name: functionId }), {
    durationMs: clampDuration(durationMs),
    ok,
  });
}

export function recordProviderUsage({
  cap,
  cumulative,
  demoted,
  operation,
  provider,
  unit,
  units,
}: {
  cap: number;
  cumulative: number;
  demoted: boolean;
  operation: string;
  provider: SpendGuardProvider;
  unit: SpendGuardUnit;
  units: number;
}): ProviderUsageSnapshot {
  appendProviderUsageSample(provider, {
    cap,
    cumulative,
    demoted,
    operation,
    unit,
    units: Math.max(0, Math.round(units)),
  });
  return snapshotProviderUsage(providerUsageBuckets.get(provider) ?? []);
}

export function getMetricsSnapshot(
  now: () => Date = () => new Date(),
): MetricsSnapshot {
  const routes = Object.fromEntries(
    [...apiBuckets.entries()].map(([key, samples]) => [
      key,
      snapshotApiBucket(samples),
    ]),
  );
  const functions = Object.fromEntries(
    [...jobBuckets.entries()].map(([key, samples]) => [
      key,
      snapshotBucket(samples),
    ]),
  );
  const providers = providerUsageSnapshots();

  return {
    api: {
      routes,
      total: snapshotApiBucket(flattenBuckets(apiBuckets)),
    },
    generatedAt: now().toISOString(),
    jobs: {
      functions,
      total: snapshotBucket(flattenBuckets(jobBuckets)),
    },
    providerUsage: {
      providers,
      total: providerUsageTotal(providers),
    },
  };
}

export async function recordJobRun<T>(
  functionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    recordJobMetric({
      durationMs: Date.now() - startedAt,
      functionId,
      ok: true,
    });
    return result;
  } catch (error) {
    recordJobMetric({
      durationMs: Date.now() - startedAt,
      functionId,
      ok: false,
    });
    throw error;
  }
}

export function recordApiHandler<Args extends unknown[]>(
  {
    method,
    route,
  }: {
    method: string;
    route: string;
  },
  handler: (...args: Args) => Response | Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    const startedAt = Date.now();
    try {
      const response = await handler(...args);
      recordApiMetric({
        durationMs: Date.now() - startedAt,
        method,
        route,
        status: response.status,
      });
      return response;
    } catch (error) {
      recordApiMetric({
        durationMs: Date.now() - startedAt,
        method,
        route,
        status: 500,
      });
      throw error;
    }
  };
}

export function resetMetricsForTests() {
  apiBuckets.clear();
  jobBuckets.clear();
  providerUsageBuckets.clear();
}
