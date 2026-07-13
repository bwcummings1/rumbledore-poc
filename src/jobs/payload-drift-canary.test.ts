// @vitest-environment node
import { randomUUID } from "node:crypto";
import { InngestTestEngine } from "@inngest/test";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { createDb, type DbHandle } from "@/db/client";
import {
  leagues,
  members,
  onboardingDiscoveredLeagues,
  providerCredentials,
  users,
} from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import { createCredentialCipher } from "@/onboarding/credential-crypto";
import { createFixtureEspnProvider } from "@/onboarding/fixture-espn";
import { JOB_EVENTS } from "./events";
import {
  createPayloadDriftCanaryTickFunction,
  payloadDriftCanary,
  payloadDriftCanaryLeague,
  runPayloadDriftCanaryLeague,
  runPayloadDriftCanaryTick,
} from "./functions/payload-drift-canary";
import { functions } from "./index";

const marker = `payload-drift-job-${randomUUID()}`;
const encryptionKey = "fixture-payload-drift-key-32-characters"; // ubs:ignore — local fixture-only encryption key
const cipher = createCredentialCipher(encryptionKey);
let handle: DbHandle;
let leagueId: string;
let userId: string;

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await migrateSerialized(handle);
  const [user] = await handle.db
    .insert(users)
    .values({
      displayName: "Payload Drift Job Steward",
      email: `${marker}@example.test`,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("payload drift job user was not created");
  }
  userId = user.id;

  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: "Payload Drift Job League",
      provider: "espn",
      providerLeagueId: marker,
      season: 2026,
      size: 12,
      sport: "ffl",
      status: "preseason",
    })
    .returning({ id: leagues.id });
  if (!league) {
    throw new Error("payload drift job league was not created");
  }
  leagueId = league.id;

  await handle.db.insert(members).values({
    organizationId: leagueId,
    role: "data_steward",
    userId,
  });
  const [credential] = await handle.db
    .insert(providerCredentials)
    .values({
      connectionFlow: "manual",
      encryptedPayload: cipher.encryptJson({
        espn_s2: "fixture-session-value", // ubs:ignore — fake ESPN cookie value for fixture isolation
        swid: "{00000000-0000-4000-8000-000000000001}",
      }),
      lastValidatedAt: new Date("2026-07-13T09:00:00.000Z"),
      provider: "espn",
      status: "connected",
      subjectProviderId: `${marker}-subject`,
      userId,
    })
    .returning({ id: providerCredentials.id });
  if (!credential) {
    throw new Error("payload drift job credential was not created");
  }

  await handle.db.insert(onboardingDiscoveredLeagues).values({
    credentialId: credential.id,
    importAttempts: 1,
    importedLeagueId: leagueId,
    importState: "live",
    lastDiscoveredAt: new Date("2026-07-13T09:00:00.000Z"),
    liveAt: new Date("2026-07-13T09:30:00.000Z"),
    name: "Payload Drift Job League",
    provider: "espn",
    providerLeagueId: marker,
    season: 2026,
    size: 12,
    sport: "ffl",
    userId,
  });
});

afterAll(async () => {
  if (handle) {
    if (leagueId) {
      await handle.db.delete(leagues).where(eq(leagues.id, leagueId));
    }
    if (userId) {
      await handle.db.delete(users).where(eq(users.id, userId));
    }
    await handle.pool.end();
  }
});

describe("payload drift canary Inngest functions", () => {
  it("plans connected leagues through the Inngest planning step", async () => {
    const fn = createPayloadDriftCanaryTickFunction(() => ({ db: handle.db }));
    const testEngine = new InngestTestEngine({ function: fn });
    const event = {
      data: {
        leagueIds: [leagueId],
        observedAt: "2026-07-13T10:00:00.000Z",
      },
      id: `${marker}-planner`,
      name: JOB_EVENTS.payloadDriftCanary,
    };

    const stepRun = await testEngine.executeStep(
      "plan-payload-drift-canaries",
      { events: [event] },
    );
    const plan = stepRun.result as Awaited<
      ReturnType<typeof runPayloadDriftCanaryTick>
    >;

    expect(plan).toMatchObject({ ok: true, plannedCount: 1, sentCount: 0 });
    expect(plan.planned[0]).toMatchObject({
      data: {
        leagueId,
        observedAt: "2026-07-13T10:00:00.000Z",
        provider: "espn",
        providerLeagueId: marker,
      },
      name: JOB_EVENTS.payloadDriftCanaryLeague,
    });
  });

  it("runs fixture-backed league probes without alerting on identical payloads", async () => {
    const firstPlan = await runPayloadDriftCanaryTick({
      data: {
        leagueIds: [leagueId],
        observedAt: "2026-07-13T10:05:00.000Z",
      },
      deps: { db: handle.db },
      eventId: `${marker}-first`,
    });
    const firstEvent = firstPlan.planned[0];
    if (!firstEvent) {
      throw new Error("payload drift job did not plan the fixture league");
    }
    const deps = {
      cipher,
      db: handle.db,
      providerFor: () => createFixtureEspnProvider(),
    };
    const first = await runPayloadDriftCanaryLeague({
      data: firstEvent.data,
      deps,
    });
    expect(first).toMatchObject({ alertCount: 0, observationCount: 2 });

    const second = await runPayloadDriftCanaryLeague({
      data: {
        ...firstEvent.data,
        observedAt: "2026-07-13T10:10:00.000Z",
      },
      deps,
    });
    expect(second).toMatchObject({ alertCount: 0, observationCount: 2 });
  });

  it("registers the scheduled planner and per-league runner", () => {
    expect(functions).toContain(payloadDriftCanary);
    expect(functions).toContain(payloadDriftCanaryLeague);
  });
});
