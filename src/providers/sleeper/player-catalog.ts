import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { err, ok } from "@/core/result";
import {
  ProviderBlockedError,
  ProviderNotFoundError,
  ProviderParseError,
  type ProviderResult,
  RateLimitedError,
} from "../model";

const SLEEPER_PROVIDER_ID = "sleeper";
const SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl";
const SLEEPER_USER_AGENT = "Rumbledore/2.0 (+https://rumbledore.app)";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const CACHE_VERSION = 1;

const nullableString = z.string().nullable().optional();
const rawPlayerSchema = z
  .object({
    active: z.boolean().optional(),
    fantasy_positions: z.array(z.string()).nullable().optional(),
    first_name: nullableString,
    full_name: nullableString,
    last_name: nullableString,
    player_id: z.union([z.string(), z.number()]).optional(),
    position: nullableString,
    status: nullableString,
    team: nullableString,
  })
  .passthrough();
const rawPlayerDumpSchema = z.record(
  z.string(),
  z.union([rawPlayerSchema, z.null()]),
);

const cachedPlayerSchema = z.object({
  active: z.boolean().optional(),
  fantasyPositions: z.array(z.string()),
  fullName: z.string(),
  playerId: z.string(),
  position: z.string().optional(),
  proTeam: z.string().optional(),
  status: z.string().optional(),
});
const cacheSchema = z.object({
  fetchedAt: z.string(),
  players: z.record(z.string(), cachedPlayerSchema),
  refreshAttemptedAt: z.string().optional(),
  version: z.literal(CACHE_VERSION),
});

export interface SleeperCatalogPlayer {
  active?: boolean;
  fantasyPositions: string[];
  fullName: string;
  playerId: string;
  position?: string;
  proTeam?: string;
  status?: string;
}

export interface SleeperPlayerCatalog {
  load(): Promise<ProviderResult<ReadonlyMap<string, SleeperCatalogPlayer>>>;
}

export type SleeperCatalogFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface SleeperPlayerCatalogOptions {
  cacheFilePath?: string;
  cacheTtlMs?: number;
  fetch?: SleeperCatalogFetch;
  now?: () => Date;
  timeoutMs?: number;
}

const inFlightLoads = new Map<
  string,
  Promise<ProviderResult<ReadonlyMap<string, SleeperCatalogPlayer>>>
>();

interface CachedCatalog {
  fetchedAt: Date;
  players: ReadonlyMap<string, SleeperCatalogPlayer>;
  refreshAttemptedAt: Date;
}

function trimmed(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function playerId(
  value: string | number | undefined,
  fallback: string,
): string | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  return trimmed(value) ?? trimmed(fallback);
}

function normalizePositionCodes(
  values: readonly string[] | null | undefined,
): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => trimmed(value)?.toUpperCase())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function normalizePlayerDump(
  raw: z.infer<typeof rawPlayerDumpSchema>,
): Map<string, SleeperCatalogPlayer> {
  const players = new Map<string, SleeperCatalogPlayer>();
  for (const [fallbackId, player] of Object.entries(raw)) {
    if (!player) continue;
    const id = playerId(player.player_id, fallbackId);
    if (!id || id === "0") continue;
    const fantasyPositions = normalizePositionCodes(player.fantasy_positions);
    const position =
      trimmed(player.position)?.toUpperCase() ?? fantasyPositions[0];
    const proTeam = trimmed(player.team)?.toUpperCase();
    const componentName = [
      trimmed(player.first_name),
      trimmed(player.last_name),
    ]
      .filter((part): part is string => Boolean(part))
      .join(" ");
    const fullName =
      trimmed(player.full_name) || componentName || `Sleeper Player ${id}`;
    players.set(id, {
      ...(player.active === undefined ? {} : { active: player.active }),
      fantasyPositions,
      fullName,
      playerId: id,
      ...(position ? { position } : {}),
      ...(proTeam ? { proTeam } : {}),
      ...(trimmed(player.status) ? { status: trimmed(player.status) } : {}),
    });
  }
  return players;
}

function cachedPlayerRecord(
  players: ReadonlyMap<string, SleeperCatalogPlayer>,
): Record<string, SleeperCatalogPlayer> {
  return Object.fromEntries(
    [...players.entries()].sort(([left], [right]) =>
      left.localeCompare(right, undefined, { numeric: true }),
    ),
  );
}

function defaultCacheFilePath(): string {
  return join(tmpdir(), "rumbledore", "sleeper-players-nfl.json");
}

function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const parsed = Number(header);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function responseError(response: Response) {
  if (response.status === 404) {
    return new ProviderNotFoundError(SLEEPER_PROVIDER_ID, {
      resource: "players-nfl",
    });
  }
  if (response.status === 429) {
    return new RateLimitedError(
      SLEEPER_PROVIDER_ID,
      retryAfterSeconds(response),
    );
  }
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status >= 500
  ) {
    return new ProviderBlockedError(SLEEPER_PROVIDER_ID);
  }
  return new ProviderParseError(
    SLEEPER_PROVIDER_ID,
    `Sleeper players-nfl API returned HTTP ${response.status}`,
  );
}

export class CachedSleeperPlayerCatalog implements SleeperPlayerCatalog {
  private readonly cacheFilePath: string;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: SleeperCatalogFetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private loadPromise?: Promise<
    ProviderResult<ReadonlyMap<string, SleeperCatalogPlayer>>
  >;

  constructor(options: SleeperPlayerCatalogOptions = {}) {
    this.cacheFilePath = options.cacheFilePath ?? defaultCacheFilePath();
    this.cacheTtlMs = Math.max(1, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  load(): Promise<ProviderResult<ReadonlyMap<string, SleeperCatalogPlayer>>> {
    this.loadPromise ??= this.sharedLoad();
    return this.loadPromise;
  }

  private sharedLoad(): Promise<
    ProviderResult<ReadonlyMap<string, SleeperCatalogPlayer>>
  > {
    const existing = inFlightLoads.get(this.cacheFilePath);
    if (existing) return existing;
    const current = this.loadOnce();
    inFlightLoads.set(this.cacheFilePath, current);
    const clear = () => {
      if (inFlightLoads.get(this.cacheFilePath) === current) {
        inFlightLoads.delete(this.cacheFilePath);
      }
    };
    void current.then(clear, clear);
    return current;
  }

  private async loadOnce(): Promise<
    ProviderResult<ReadonlyMap<string, SleeperCatalogPlayer>>
  > {
    const cached = await this.readCache();
    if (cached && this.refreshAttemptIsRecent(cached)) {
      return ok(cached.players);
    }

    const remote = await this.fetchRemote();
    if (!remote.ok) {
      if (!cached) return remote;
      await this.writeCache({
        fetchedAt: cached.fetchedAt,
        players: cached.players,
        refreshAttemptedAt: this.now(),
      });
      return ok(cached.players);
    }

    const fetchedAt = this.now();
    await this.writeCache({
      fetchedAt,
      players: remote.value,
      refreshAttemptedAt: fetchedAt,
    });
    return ok(remote.value);
  }

  private refreshAttemptIsRecent(cached: CachedCatalog): boolean {
    const ageMs = this.now().getTime() - cached.refreshAttemptedAt.getTime();
    return ageMs <= this.cacheTtlMs;
  }

  private async readCache(): Promise<CachedCatalog | undefined> {
    try {
      const parsed = cacheSchema.safeParse(
        JSON.parse(await readFile(this.cacheFilePath, "utf8")) as unknown,
      );
      if (!parsed.success) return undefined;
      const fetchedAt = new Date(parsed.data.fetchedAt);
      if (!Number.isFinite(fetchedAt.getTime())) return undefined;
      const refreshAttemptedAt = new Date(
        parsed.data.refreshAttemptedAt ?? parsed.data.fetchedAt,
      );
      if (!Number.isFinite(refreshAttemptedAt.getTime())) return undefined;
      return {
        fetchedAt,
        players: new Map(Object.entries(parsed.data.players)),
        refreshAttemptedAt,
      };
    } catch {
      return undefined;
    }
  }

  private async fetchRemote(): Promise<
    ProviderResult<Map<string, SleeperCatalogPlayer>>
  > {
    try {
      const response = await this.fetchImpl(SLEEPER_PLAYERS_URL, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": SLEEPER_USER_AGENT,
        },
        method: "GET",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) return err(responseError(response));

      const parsed = rawPlayerDumpSchema.safeParse(
        (await response.json()) as unknown,
      );
      if (!parsed.success) {
        return err(
          new ProviderParseError(
            SLEEPER_PROVIDER_ID,
            "Sleeper players-nfl API returned an unexpected shape",
            parsed.error,
          ),
        );
      }
      return ok(normalizePlayerDump(parsed.data));
    } catch (cause) {
      return err(new ProviderBlockedError(SLEEPER_PROVIDER_ID, cause));
    }
  }

  private async writeCache(cached: CachedCatalog): Promise<void> {
    const document = JSON.stringify({
      fetchedAt: cached.fetchedAt.toISOString(),
      players: cachedPlayerRecord(cached.players),
      refreshAttemptedAt: cached.refreshAttemptedAt.toISOString(),
      version: CACHE_VERSION,
    });
    const temporaryPath = `${this.cacheFilePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await mkdir(dirname(this.cacheFilePath), { recursive: true });
      await writeFile(temporaryPath, `${document}\n`, "utf8");
      await rename(temporaryPath, this.cacheFilePath);
    } catch {
      // The in-memory catalog still prevents repeated large downloads for this
      // provider instance when a serverless filesystem cannot persist /tmp.
    }
  }
}

export function createSleeperPlayerCatalog(
  options?: SleeperPlayerCatalogOptions,
): SleeperPlayerCatalog {
  return new CachedSleeperPlayerCatalog(options);
}
