// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "@/core/env/schema";
import { ok } from "@/core/result";
import { createDb, type DbHandle } from "@/db/client";
import { leagues, users } from "@/db/schema";
import { migrateSerialized } from "@/db/test-support";
import {
  createFixtureEspnProvider,
  FIXTURE_ESPN_PROVIDER_LEAGUE_ID,
} from "@/onboarding/fixture-espn";
import type { FantasyProviderSession } from "@/providers/model";
import {
  acknowledgeProviderPayloadDriftAlert,
  listDataStewardReview,
} from "@/stats";
import {
  type ProviderPayloadCanaryProvider,
  providerPayloadSchemaShape,
  runProviderPayloadCanary,
} from "./drift-canary";

const marker = `drift-canary-${randomUUID()}`;
const fixtureCredentials = {
  espn_s2: "fixture-session-value", // ubs:ignore — fake ESPN cookie value for fixture isolation
  swid: "{00000000-0000-4000-8000-000000000001}",
};
let handle: DbHandle;
let leagueId: string;
let session: FantasyProviderSession;
let stewardUserId: string;

beforeAll(async () => {
  handle = createDb(parseEnv(process.env).databaseUrl);
  await migrateSerialized(handle);
  const [league] = await handle.db
    .insert(leagues)
    .values({
      currentScoringPeriod: 1,
      name: "Payload Drift Fixture",
      provider: "espn",
      providerLeagueId: marker,
      season: 2026,
      size: 12,
      sport: "ffl",
      status: "preseason",
    })
    .returning({ id: leagues.id });
  if (!league) {
    throw new Error("drift canary fixture league was not created");
  }
  leagueId = league.id;
  const [steward] = await handle.db
    .insert(users)
    .values({
      displayName: "Payload Drift Steward",
      email: `${marker}@example.test`,
    })
    .returning({ id: users.id });
  if (!steward) {
    throw new Error("drift canary steward was not created");
  }
  stewardUserId = steward.id;

  const auth =
    await createFixtureEspnProvider().authenticate(fixtureCredentials);
  if (!auth.ok) {
    throw auth.error;
  }
  session = auth.value;
});

afterAll(async () => {
  if (handle) {
    if (leagueId) {
      await handle.db.delete(leagues).where(eq(leagues.id, leagueId));
    }
    if (stewardUserId) {
      await handle.db.delete(users).where(eq(users.id, stewardUserId));
    }
    await handle.pool.end();
  }
});

function ref() {
  return {
    name: "Payload Drift Fixture",
    provider: "espn" as const,
    providerId: FIXTURE_ESPN_PROVIDER_LEAGUE_ID,
    season: 2026,
    size: 12,
    sport: "ffl" as const,
  };
}

function settingsMutatedProvider(
  base: ProviderPayloadCanaryProvider,
): ProviderPayloadCanaryProvider {
  return {
    ...base,
    async getLeague(providerSession, providerRef) {
      const result = await base.getLeague(providerSession, providerRef);
      if (!result.ok) {
        return result;
      }
      return ok({
        ...result.value,
        scoringSettings: {
          ...result.value.scoringSettings,
          canaryAddedScoringField: 3,
        },
      });
    },
  };
}

function scoreboardMutatedProvider(
  base: ProviderPayloadCanaryProvider,
): ProviderPayloadCanaryProvider {
  const withSettingsMutation = settingsMutatedProvider(base);
  return {
    ...withSettingsMutation,
    async getMatchups(providerSession, providerRef, scoringPeriod) {
      const result = await base.getMatchups(
        providerSession,
        providerRef,
        scoringPeriod,
      );
      if (!result.ok) {
        return result;
      }
      return ok(
        result.value.map((matchup, index) =>
          index === 0
            ? { ...matchup, homeScore: matchup.homeScore + 1 }
            : matchup,
        ),
      );
    },
  };
}

describe("provider payload drift canary", () => {
  it("projects deterministic schema paths", () => {
    expect(
      providerPayloadSchemaShape({ rows: [{ score: 1 }, { score: 2 }] }),
    ).toEqual([
      "$:object",
      '$["rows"]:array',
      '$["rows"][]:object',
      '$["rows"][]["score"]:number',
    ]);
  });

  it("keeps alerts visible through stable ticks until acknowledgement and re-alerts on new drift", async () => {
    const provider = createFixtureEspnProvider();
    const first = await runProviderPayloadCanary({
      db: handle.db,
      leagueId,
      observedAt: new Date("2026-07-13T10:00:00.000Z"),
      provider,
      providerId: "espn",
      providerLeagueId: marker,
      ref: ref(),
      session,
    });
    expect(first.alerts).toBe(0);
    expect(first.observations.map((row) => row.outcome)).toEqual([
      "baseline",
      "baseline",
    ]);

    const identical = await runProviderPayloadCanary({
      db: handle.db,
      leagueId,
      observedAt: new Date("2026-07-13T10:05:00.000Z"),
      provider,
      providerId: "espn",
      providerLeagueId: marker,
      ref: ref(),
      session,
    });
    expect(identical.alerts).toBe(0);
    expect(identical.observations.map((row) => row.outcome)).toEqual([
      "stable",
      "stable",
    ]);

    const shapeMutation = await runProviderPayloadCanary({
      db: handle.db,
      leagueId,
      observedAt: new Date("2026-07-13T10:10:00.000Z"),
      provider: settingsMutatedProvider(provider),
      providerId: "espn",
      providerLeagueId: marker,
      ref: ref(),
      session,
    });
    const settingsAlert = shapeMutation.observations.find(
      (row) => row.view === "settings",
    );
    expect(settingsAlert).toMatchObject({
      driftKinds: ["shape_additive", "semantic"],
      outcome: "alert",
    });
    expect(settingsAlert?.addedPaths).toContain(
      '$["scoringSettings"]["canaryAddedScoringField"]:number',
    );

    const stableAfterAlert = await runProviderPayloadCanary({
      db: handle.db,
      leagueId,
      observedAt: new Date("2026-07-13T10:12:00.000Z"),
      provider: settingsMutatedProvider(provider),
      providerId: "espn",
      providerLeagueId: marker,
      ref: ref(),
      session,
    });
    expect(stableAfterAlert.alerts).toBe(0);
    expect(stableAfterAlert.observations.map((row) => row.outcome)).toEqual([
      "stable",
      "stable",
    ]);

    const shapeReview = await listDataStewardReview(handle.db, { leagueId });
    expect(shapeReview.ok).toBe(true);
    if (!shapeReview.ok) {
      throw shapeReview.error;
    }
    expect(shapeReview.value.payloadDriftAlerts).toEqual([
      expect.objectContaining({
        driftKinds: ["shape_additive", "semantic"],
        view: "settings",
      }),
    ]);
    if (!settingsAlert) {
      throw new Error("settings drift alert was not recorded");
    }

    const acknowledged = await acknowledgeProviderPayloadDriftAlert(handle.db, {
      actorUserId: stewardUserId,
      alertId: settingsAlert.id,
      leagueId,
      reason: "provider field addition reviewed",
    });
    expect(acknowledged).toMatchObject({
      ok: true,
      value: {
        acknowledgedByUserId: stewardUserId,
        acknowledgementReason: "provider field addition reviewed",
        id: settingsAlert.id,
      },
    });
    const afterAcknowledgement = await listDataStewardReview(handle.db, {
      leagueId,
    });
    expect(afterAcknowledgement).toMatchObject({
      ok: true,
      value: { payloadDriftAlerts: [] },
    });

    const semanticMutation = await runProviderPayloadCanary({
      db: handle.db,
      leagueId,
      observedAt: new Date("2026-07-13T10:15:00.000Z"),
      provider: scoreboardMutatedProvider(provider),
      providerId: "espn",
      providerLeagueId: marker,
      ref: ref(),
      session,
    });
    expect(
      semanticMutation.observations.find((row) => row.view === "scoreboard"),
    ).toMatchObject({ driftKinds: ["semantic"], outcome: "alert" });

    const semanticReview = await listDataStewardReview(handle.db, {
      leagueId,
    });
    expect(semanticReview.ok).toBe(true);
    if (!semanticReview.ok) {
      throw semanticReview.error;
    }
    expect(semanticReview.value.payloadDriftAlerts).toEqual([
      expect.objectContaining({
        driftKinds: ["semantic"],
        scoringPeriod: 1,
        view: "scoreboard",
      }),
    ]);
  });
});
