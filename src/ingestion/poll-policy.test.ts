import { describe, expect, it } from "vitest";
import {
  createConfiguredPollPolicy,
  parsePollPolicyConfigJson,
  resolvePollPolicyConfig,
} from "./poll-policy";

describe("poll policy", () => {
  it("resolves cadence overrides in built-in, global, league, call-site order", () => {
    const config = resolvePollPolicyConfig({
      globalConfig: {
        intervalsMs: {
          live_window: { matchups: 5_000, rosters: 6_000 },
        },
      },
      leagueConfig: {
        intervalsMs: {
          live_window: { matchups: 7_000 },
        },
      },
      callSiteConfig: {
        intervalsMs: {
          live_window: { matchups: 9_000 },
        },
      },
    });

    expect(config.intervalsMs.live_window.matchups).toBe(9_000);
    expect(config.intervalsMs.live_window.rosters).toBe(6_000);
    expect(config.intervalsMs.in_season_off_hours.matchups).toBe(60 * 60_000);
  });

  it("computes due decisions and next due timestamps from data config", () => {
    const now = new Date("2026-09-13T18:00:05Z");
    const policy = createConfiguredPollPolicy({
      callSiteConfig: {
        intervalsMs: {
          live_window: { matchups: 5_000 },
        },
      },
    });

    const due = policy.due({
      dataClass: "matchups",
      gameState: "live_window",
      lastSyncedAt: new Date("2026-09-13T18:00:00Z"),
      now,
    });
    const notDue = policy.due({
      dataClass: "matchups",
      gameState: "live_window",
      lastSyncedAt: new Date("2026-09-13T18:00:01Z"),
      now,
    });

    expect(due).toMatchObject({
      due: true,
      intervalMs: 5_000,
      nextDueAt: new Date("2026-09-13T18:00:05Z"),
    });
    expect(notDue).toMatchObject({
      due: false,
      intervalMs: 5_000,
      nextDueAt: new Date("2026-09-13T18:00:06Z"),
    });
  });

  it("parses JSON overrides and rejects malformed cadence data", () => {
    expect(
      parsePollPolicyConfigJson(
        JSON.stringify({
          intervalsMs: {
            live_window: { matchups: 5_000 },
          },
        }),
      ),
    ).toEqual({
      intervalsMs: {
        live_window: { matchups: 5_000 },
      },
    });
    expect(() =>
      parsePollPolicyConfigJson(
        JSON.stringify({
          intervalsMs: {
            live_window: { matchups: 0 },
          },
        }),
      ),
    ).toThrow();
  });
});
