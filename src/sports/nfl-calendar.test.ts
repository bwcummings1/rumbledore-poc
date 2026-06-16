// @vitest-environment node
import { describe, expect, it } from "vitest";
import espnWeekWindowFixture from "./__fixtures__/espn-nfl-scoreboard-2025-week2-window.json";
import {
  defaultNflCalendar,
  EspnScoreboardNflScheduleSource,
  HeuristicNflCalendar,
  MockNflCalendar,
  type NflScheduleFetch,
  type NflScheduleSnapshot,
  type NflScheduleSource,
  type NflWeekState,
  nflScheduleSnapshotFromEspnScoreboard,
  nflWeekToken,
  ScheduleBackedNflCalendar,
} from "./nfl-calendar";

function jsonFetch(body: unknown, requests: string[] = []): NflScheduleFetch {
  return async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status: 200,
      statusText: "OK",
    });
  };
}

describe("NFL calendar", () => {
  it("uses a fixed mock week state for deterministic cadence tests", () => {
    const state = {
      gamePhase: "pre_kickoff",
      phase: "regular",
      seasonWeek: 7,
    } as const satisfies NflWeekState;
    const calendar = new MockNflCalendar(state);

    expect(calendar.weekState(new Date("2026-10-15T12:00:00.000Z"))).toEqual(
      state,
    );
  });

  it("can override mock week state by ISO date", () => {
    const regular = {
      gamePhase: "quiet",
      phase: "regular",
      seasonWeek: 3,
    } as const satisfies NflWeekState;
    const playoffs = {
      gamePhase: "post_games",
      phase: "playoffs",
      seasonWeek: 20,
    } as const satisfies NflWeekState;
    const calendar = new MockNflCalendar({
      defaultState: regular,
      statesByDate: {
        "2027-01-18": playoffs,
      },
    });

    expect(calendar.weekState(new Date("2026-09-22T12:00:00.000Z"))).toEqual(
      regular,
    );
    expect(calendar.weekState(new Date("2027-01-18T12:00:00.000Z"))).toEqual(
      playoffs,
    );
  });

  it("keeps the default calendar schedule-backed with heuristic fallback", () => {
    expect(defaultNflCalendar).toBeInstanceOf(ScheduleBackedNflCalendar);
  });

  it("keeps the heuristic fallback available offline", () => {
    const calendar = new HeuristicNflCalendar();

    expect(calendar.weekState(new Date("2026-06-15T12:00:00.000Z"))).toEqual({
      gamePhase: "quiet",
      phase: "offseason",
      seasonWeek: null,
    });
    expect(
      calendar.weekState(new Date("2026-09-17T12:00:00.000Z")),
    ).toMatchObject({
      gamePhase: "pre_kickoff",
      phase: "regular",
      seasonWeek: 3,
    });
  });

  it("uses an ISO week token for offseason calendar keys", () => {
    expect(
      nflWeekToken(
        {
          gamePhase: "quiet",
          phase: "offseason",
          seasonWeek: null,
        },
        new Date("2026-06-15T12:00:00.000Z"),
      ),
    ).toBe("2026-w25");
  });

  it("derives live, post-game, and pre-kickoff state from an ESPN schedule fixture", async () => {
    const requests: string[] = [];
    const source = new EspnScoreboardNflScheduleSource({
      fetcher: jsonFetch(espnWeekWindowFixture, requests),
    });
    const calendar = new ScheduleBackedNflCalendar({ source });

    await expect(
      calendar.weekState(new Date("2025-09-16T03:00:00.000Z")),
    ).resolves.toEqual({
      gamePhase: "games_live",
      phase: "regular",
      seasonWeek: 2,
    });
    await expect(
      calendar.weekState(new Date("2025-09-16T18:00:00.000Z")),
    ).resolves.toEqual({
      gamePhase: "post_games",
      phase: "regular",
      seasonWeek: 2,
    });
    await expect(
      calendar.weekState(new Date("2025-09-18T18:00:00.000Z")),
    ).resolves.toEqual({
      gamePhase: "pre_kickoff",
      phase: "regular",
      seasonWeek: 3,
    });

    expect(requests[0]).toContain(
      "/apis/site/v2/sports/football/nfl/scoreboard",
    );
    expect(requests[0]).toContain("dates=20250913-20250920");
  });

  it("maps postseason ESPN schedule weeks into the existing playoff tokens", () => {
    const snapshot = nflScheduleSnapshotFromEspnScoreboard({
      events: [
        {
          date: "2026-02-08T23:30Z",
          id: "super-bowl-fixture",
          season: { type: 3 },
          status: { type: { completed: false, state: "pre" } },
          week: { number: 5 },
        },
      ],
      week: { number: 5 },
    });

    expect(snapshot.games[0]).toMatchObject({
      phase: "superbowl_week",
      seasonWeek: 22,
    });
  });

  it("falls back to the heuristic calendar when the schedule source is unavailable", async () => {
    const fallbackState = {
      gamePhase: "quiet",
      phase: "offseason",
      seasonWeek: null,
    } as const satisfies NflWeekState;
    const failingSource: NflScheduleSource = {
      async scheduleForWindow(): Promise<NflScheduleSnapshot> {
        throw new Error("fixture outage");
      },
    };
    const calendar = new ScheduleBackedNflCalendar({
      fallback: new MockNflCalendar(fallbackState),
      source: failingSource,
    });

    await expect(
      calendar.weekState(new Date("2026-09-13T18:00:00.000Z")),
    ).resolves.toEqual(fallbackState);
  });
});
