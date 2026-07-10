// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import { accounts, leagues, members, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { type Auth, createAuth } from "./instance";

/**
 * Integration test against the local stack (`pnpm db:up`). Exercises the
 * Better Auth scaffold end-to-end on the real schema: email/password
 * sign-up/sign-in, session cookies, and the organization plugin mapped
 * league=org (membership, active league, role permissions). Rows are tagged
 * with a run-unique marker and removed afterwards.
 */

const marker = `authtest-${randomUUID()}`;
const PASSWORD = "correct-horse-battery-staple"; // ubs:ignore — test fixture
let handle: DbHandle;
let auth: Auth;

function email(tag: string): string {
  return `${marker}-${tag}@example.com`;
}

/** Sign in and return a Headers object carrying the session cookie. */
async function signInHeaders(userEmail: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email: userEmail, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_token");
  return new Headers({ cookie });
}

async function seedLeague(tag: string) {
  const [league] = await handle.db
    .insert(leagues)
    .values({
      provider: "espn",
      providerLeagueId: `${marker}-${tag}`,
      name: `Auth test league ${tag}`,
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
  auth = createAuth(handle.db, {
    secret: "auth-test-secret", // ubs:ignore — test fixture
    baseURL: "http://localhost:3000",
    google: { mock: true },
    redisUrl: parseEnv(process.env).redisUrl,
  });
});

afterAll(async () => {
  if (!handle) return;
  // Users/leagues cascade to sessions/accounts/members/invitations.
  await handle.db
    .delete(users)
    .where(sql`${users.email} like ${`${marker}-%`}`);
  await handle.db
    .delete(leagues)
    .where(sql`${leagues.providerLeagueId} like ${`${marker}-%`}`);
  await handle.pool.end();
});

describe("better auth scaffold", () => {
  it("signs up with email/password, mapping name onto display_name", async () => {
    const res = await auth.api.signUpEmail({
      body: { email: email("a"), name: "Auth A", password: PASSWORD },
    });
    expect(res.user.id).toMatch(/^[0-9a-f-]{36}$/);

    const [row] = await handle.db
      .select()
      .from(users)
      .where(sql`${users.id} = ${res.user.id}`);
    expect(row.displayName).toBe("Auth A");
    expect(row.emailVerified).toBe(false);

    const [account] = await handle.db
      .select()
      .from(accounts)
      .where(sql`${accounts.userId} = ${res.user.id}`);
    expect(account.providerId).toBe("credential");
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(PASSWORD);
  });

  it("signs in with the right password and rejects the wrong one", async () => {
    await auth.api.signUpEmail({
      body: { email: email("b"), name: "Auth B", password: PASSWORD },
    });
    const ok = await auth.api.signInEmail({
      body: { email: email("b"), password: PASSWORD },
    });
    expect(ok.user.email).toBe(email("b"));

    await expect(
      auth.api.signInEmail({
        body: { email: email("b"), password: "wrong-password-entirely" },
      }),
    ).rejects.toThrow();
  });

  it("resolves the session from the cookie", async () => {
    await auth.api.signUpEmail({
      body: { email: email("c"), name: "Auth C", password: PASSWORD },
    });
    const headers = await signInHeaders(email("c"));
    const session = await auth.api.getSession({ headers });
    expect(session?.user.email).toBe(email("c"));
    expect(session?.session.expiresAt).toBeInstanceOf(Date);
  });

  it("treats a league as the organization: membership, active league, listing", async () => {
    const { user } = await auth.api.signUpEmail({
      body: { email: email("d"), name: "Steward D", password: PASSWORD },
    });
    const league = await seedLeague("d");

    // Server-side membership grant — the P1 onboarding flow in miniature.
    await auth.api.addMember({
      body: {
        organizationId: league.id,
        userId: user.id,
        role: "data_steward",
      },
    });
    const [memberRow] = await handle.db
      .select()
      .from(members)
      .where(sql`${members.userId} = ${user.id}`);
    expect(memberRow.organizationId).toBe(league.id);
    expect(memberRow.role).toBe("data_steward");

    const headers = await signInHeaders(email("d"));
    const orgs = await auth.api.listOrganizations({ headers });
    expect(orgs.map((o) => o.id)).toContain(league.id);

    await auth.api.setActiveOrganization({
      body: { organizationId: league.id },
      headers,
    });
    const session = await auth.api.getSession({ headers });
    expect(session?.session.activeOrganizationId).toBe(league.id);
  });

  it("grants leagueData permissions to data_steward but not member", async () => {
    const steward = await auth.api.signUpEmail({
      body: { email: email("e1"), name: "Steward E", password: PASSWORD },
    });
    const plain = await auth.api.signUpEmail({
      body: { email: email("e2"), name: "Member E", password: PASSWORD },
    });
    const league = await seedLeague("e");
    await auth.api.addMember({
      body: {
        organizationId: league.id,
        userId: steward.user.id,
        role: "data_steward",
      },
    });
    await auth.api.addMember({
      body: {
        organizationId: league.id,
        userId: plain.user.id,
        role: "member",
      },
    });

    const stewardHeaders = await signInHeaders(email("e1"));
    const stewardCheck = await auth.api.hasPermission({
      headers: stewardHeaders,
      body: {
        organizationId: league.id,
        permissions: { leagueData: ["manage"] },
      },
    });
    expect(stewardCheck.success).toBe(true);

    const plainHeaders = await signInHeaders(email("e2"));
    const plainCheck = await auth.api.hasPermission({
      headers: plainHeaders,
      body: {
        organizationId: league.id,
        permissions: { leagueData: ["manage"] },
      },
    });
    expect(plainCheck.success).toBe(false);
  });

  it("blocks user-initiated organization creation — leagues come from ingestion", async () => {
    await auth.api.signUpEmail({
      body: { email: email("f"), name: "Auth F", password: PASSWORD },
    });
    const headers = await signInHeaders(email("f"));
    await expect(
      auth.api.createOrganization({
        body: { name: "Rogue league", slug: `${marker}-rogue` },
        headers,
      }),
    ).rejects.toThrow();
  });
});
