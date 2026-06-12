import { createHmac, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Env, RealtimeConfig } from "@/core/env/schema";
import { AppError, err, ok, type Result } from "@/core/result";
import type { Db } from "@/db/client";
import { members } from "@/db/schema";
import {
  LEAGUE_REALTIME_CHANNEL_KINDS,
  leagueRealtimeChannel,
  PUBLIC_REALTIME_CHANNELS,
  type RealtimeChannel,
} from "./interfaces";

const DEFAULT_TOKEN_TTL_SECONDS = 5 * 60;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RealtimeCapability =
  | "broadcast:read"
  | "presence:read"
  | "presence:write";

export interface RealtimeChannelGrant {
  topic: RealtimeChannel;
  private: true;
  capabilities: RealtimeCapability[];
}

export interface RealtimeSubscriptionGrant {
  token: string;
  issuedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  channels: RealtimeChannelGrant[];
  transport:
    | { kind: "mock" }
    | { kind: "supabase"; url: string; publishableKey: string };
}

export interface RealtimeSession {
  user: { id: string };
}

interface GrantDeps {
  db: Db;
  getSession(headers: Headers): Promise<RealtimeSession | null>;
  realtime: RealtimeConfig;
  fallbackSigningSecret: string;
  now?: () => Date;
  tokenId?: () => string;
}

interface JwtClaims {
  aud: "authenticated";
  exp: number;
  iat: number;
  iss: "rumbledore";
  jti: string;
  realtime_channels: RealtimeChannel[];
  realtime_permissions: Record<RealtimeChannel, RealtimeCapability[]>;
  role: "authenticated";
  sub: string;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signJwt(claims: JwtClaims, secret: string): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson(claims);
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function parseRequestedLeagueIds(
  searchParams: URLSearchParams,
): Result<string[], AppError> {
  const requested = [
    ...new Set(
      searchParams
        .getAll("leagueId")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ].sort();

  const invalid = requested.find((leagueId) => !UUID_RE.test(leagueId));
  if (invalid) {
    return err(
      new AppError({
        code: "INVALID_LEAGUE_ID",
        message: "Realtime leagueId must be a UUID",
        status: 400,
      }),
    );
  }

  return ok(requested);
}

async function resolveMemberLeagueIds(
  db: Db,
  input: { requestedLeagueIds: readonly string[]; userId: string },
): Promise<Result<string[], AppError>> {
  const filters = [eq(members.userId, input.userId)];
  if (input.requestedLeagueIds.length > 0) {
    filters.push(inArray(members.organizationId, input.requestedLeagueIds));
  }

  const rows = await db
    .select({ leagueId: members.organizationId })
    .from(members)
    .where(and(...filters));

  const memberLeagueIds = [...new Set(rows.map((row) => row.leagueId))].sort();
  if (input.requestedLeagueIds.length === 0) {
    return ok(memberLeagueIds);
  }

  if (memberLeagueIds.length !== input.requestedLeagueIds.length) {
    return err(
      new AppError({
        code: "REALTIME_LEAGUE_FORBIDDEN",
        message: "Realtime league channel access requires membership",
        status: 403,
      }),
    );
  }

  return ok(memberLeagueIds);
}

function channelGrant(topic: RealtimeChannel): RealtimeChannelGrant {
  const capabilities: RealtimeCapability[] = topic.endsWith(":presence")
    ? ["presence:read", "presence:write"]
    : ["broadcast:read"];
  return { capabilities, private: true, topic };
}

function channelsForLeagues(
  leagueIds: readonly string[],
): RealtimeChannelGrant[] {
  const publicChannels = PUBLIC_REALTIME_CHANNELS.map((topic) =>
    channelGrant(topic),
  );
  const leagueChannels = leagueIds.flatMap((leagueId) =>
    LEAGUE_REALTIME_CHANNEL_KINDS.map((kind) =>
      channelGrant(leagueRealtimeChannel(leagueId, kind)),
    ),
  );
  return [...publicChannels, ...leagueChannels];
}

function transportForRealtime(
  realtime: RealtimeConfig,
): RealtimeSubscriptionGrant["transport"] {
  return realtime.mock
    ? { kind: "mock" }
    : {
        kind: "supabase",
        publishableKey: realtime.publishableKey,
        url: realtime.url,
      };
}

function signingSecretForRealtime(
  realtime: RealtimeConfig,
  fallbackSigningSecret: string,
): string {
  return realtime.mock ? fallbackSigningSecret : realtime.jwtSecret;
}

export async function createRealtimeSubscriptionGrant(
  deps: GrantDeps,
  input: {
    headers: Headers;
    searchParams: URLSearchParams;
  },
): Promise<Result<RealtimeSubscriptionGrant, AppError>> {
  const session = await deps.getSession(input.headers);
  if (!session?.user.id) {
    return err(
      new AppError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
        status: 401,
      }),
    );
  }

  const requestedLeagueIds = parseRequestedLeagueIds(input.searchParams);
  if (!requestedLeagueIds.ok) {
    return requestedLeagueIds;
  }

  const memberLeagueIds = await resolveMemberLeagueIds(deps.db, {
    requestedLeagueIds: requestedLeagueIds.value,
    userId: session.user.id,
  });
  if (!memberLeagueIds.ok) {
    return memberLeagueIds;
  }

  const issuedAtDate = deps.now?.() ?? new Date();
  const issuedAtSeconds = Math.floor(issuedAtDate.getTime() / 1000);
  const expiresAtSeconds = issuedAtSeconds + DEFAULT_TOKEN_TTL_SECONDS;
  const channels = channelsForLeagues(memberLeagueIds.value);
  const topics = channels.map((channel) => channel.topic);
  const claims: JwtClaims = {
    aud: "authenticated",
    exp: expiresAtSeconds,
    iat: issuedAtSeconds,
    iss: "rumbledore",
    jti: deps.tokenId?.() ?? randomUUID(),
    realtime_channels: topics,
    realtime_permissions: Object.fromEntries(
      channels.map((channel) => [channel.topic, channel.capabilities]),
    ) as Record<RealtimeChannel, RealtimeCapability[]>,
    role: "authenticated",
    sub: session.user.id,
  };

  return ok({
    channels,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    issuedAt: new Date(issuedAtSeconds * 1000).toISOString(),
    token: signJwt(
      claims,
      signingSecretForRealtime(deps.realtime, deps.fallbackSigningSecret),
    ),
    transport: transportForRealtime(deps.realtime),
    ttlSeconds: DEFAULT_TOKEN_TTL_SECONDS,
  });
}

export function createRealtimeGrantDeps(env: Env, db: Db): GrantDeps {
  return {
    db,
    fallbackSigningSecret: env.auth.secret,
    getSession: async (headers) => {
      const { getAuth } = await import("@/auth");
      return getAuth().api.getSession({ headers });
    },
    realtime: env.realtime,
  };
}
