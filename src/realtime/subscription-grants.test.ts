// @vitest-environment node
import { createHmac, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { leagues, members, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  LEAGUE_REALTIME_CHANNEL_KINDS,
  leagueRealtimeChannel,
  PUBLIC_REALTIME_CHANNELS,
} from "./interfaces";
import { createRealtimeSubscriptionGrant } from "./subscription-grants";

const marker = `rtgrant-${randomUUID()}`;
const fixtureValue = (...parts: string[]) => parts.join("-");
const fallbackSigningSecret = fixtureValue("test", "realtime", "fallback");
const jwtSecret = fixtureValue("test", "supabase", "jwt");
const publishableKey = fixtureValue("test", "supabase", "publishable");
const serviceRoleKey = fixtureValue("test", "supabase", "service-role");
const now = new Date("2026-06-12T12:00:00.000Z");

let handle: DbHandle;
let userId: string;
let otherUserId: string;
let leagueAId: string;
let leagueBId: string;

function decodePayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  if (!payload) {
    throw new Error("token has no payload");
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("token payload is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (cause) {
    throw new Error("token payload is not valid JSON", { cause });
  }
}

function jwtSignature(token: string, secret: string): string {
  const [header, payload] = token.split(".");
  return createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
}

function requestFor(path: string): {
  headers: Headers;
  searchParams: URLSearchParams;
} {
  const url = new URL(path, "http://localhost");
  return { headers: new Headers(), searchParams: url.searchParams };
}

async function grantFor(path: string, sessionUserId: string | null) {
  return createRealtimeSubscriptionGrant(
    {
      db: handle.db,
      fallbackSigningSecret,
      getSession: async () =>
        sessionUserId ? { user: { id: sessionUserId } } : null,
      now: () => now,
      realtime: {
        jwtSecret,
        mock: false,
        publishableKey,
        serviceRoleKey,
        url: "https://project.supabase.co",
      },
      tokenId: () => "test-token-id",
    },
    requestFor(path),
  );
}

async function seedUser(tag: string) {
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: `Realtime ${tag}`,
      email: `${marker}-${tag}@example.com`,
    })
    .returning();
  return user;
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      name: `Realtime league ${tag}`,
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
      slug: `${marker}-${tag}`,
    })
    .returning();
  return league;
}

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  try {
    await handle.pool.query("select 1");
  } catch (cause) {
    throw new Error(
      "Postgres is unreachable — start the local stack with `pnpm db:up` before running tests.",
      { cause },
    );
  }
  await migrateSerialized(handle);

  const [user, otherUser, leagueA, leagueB] = await Promise.all([
    seedUser("member"),
    seedUser("other"),
    seedLeague("a"),
    seedLeague("b"),
  ]);
  userId = user.id;
  otherUserId = otherUser.id;
  leagueAId = leagueA.id;
  leagueBId = leagueB.id;

  await handle.db.insert(members).values({
    organizationId: leagueAId,
    role: "member",
    userId,
  });
});

afterAll(async () => {
  if (!handle) return;
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("realtime subscription grants", () => {
  it("requires a session before resolving channel grants", async () => {
    const result = await grantFor("/api/realtime/token", null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(401);
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("grants public central channels to authenticated users without league membership", async () => {
    const result = await grantFor("/api/realtime/token", otherUserId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.channels.map((channel) => channel.topic)).toEqual([
      ...PUBLIC_REALTIME_CHANNELS,
    ]);
    expect(result.value.transport).toEqual({
      kind: "supabase",
      publishableKey,
      url: "https://project.supabase.co",
    });
    expect(JSON.stringify(result.value)).not.toContain(serviceRoleKey);
  });

  it("grants all league channels for a requested member league", async () => {
    const result = await grantFor(
      `/api/realtime/token?leagueId=${leagueAId}`,
      userId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const topics = result.value.channels.map((channel) => channel.topic);
    expect(topics).toEqual([
      ...PUBLIC_REALTIME_CHANNELS,
      ...LEAGUE_REALTIME_CHANNEL_KINDS.map((kind) =>
        leagueRealtimeChannel(leagueAId, kind),
      ),
    ]);
    expect(
      result.value.channels.find(
        (channel) => channel.topic === leagueRealtimeChannel(leagueAId, "blog"),
      )?.capabilities,
    ).toEqual(["broadcast:read"]);
    expect(
      result.value.channels.find(
        (channel) =>
          channel.topic === leagueRealtimeChannel(leagueAId, "presence"),
      )?.capabilities,
    ).toEqual(["presence:read", "presence:write"]);

    const payload = decodePayload(result.value.token);
    expect(payload).toMatchObject({
      aud: "authenticated",
      exp: Math.floor(now.getTime() / 1000) + 300,
      iat: Math.floor(now.getTime() / 1000),
      iss: "rumbledore",
      jti: "test-token-id",
      role: "authenticated",
      sub: userId,
    });
    expect(payload.realtime_channels).toEqual(topics);

    const [, , signature] = result.value.token.split(".");
    expect(signature).toBe(jwtSignature(result.value.token, jwtSecret));
  });

  it("rejects requested league channels when the user is not a member", async () => {
    const result = await grantFor(
      `/api/realtime/token?leagueId=${leagueBId}`,
      userId,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(403);
    expect(result.error.code).toBe("REALTIME_LEAGUE_FORBIDDEN");
  });

  it("rejects malformed requested league ids before membership lookup", async () => {
    const result = await grantFor(
      "/api/realtime/token?leagueId=not-a-uuid",
      userId,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(400);
    expect(result.error.code).toBe("INVALID_LEAGUE_ID");
  });
});
