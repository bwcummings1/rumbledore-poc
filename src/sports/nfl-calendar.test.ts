// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  defaultNflCalendar,
  MockNflCalendar,
  type NflWeekState,
  nflWeekToken,
} from "./nfl-calendar";

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

  it("defaults June to offseason and September to the regular season", () => {
    expect(
      defaultNflCalendar.weekState(new Date("2026-06-15T12:00:00.000Z")),
    ).toEqual({
      gamePhase: "quiet",
      phase: "offseason",
      seasonWeek: null,
    });
    expect(
      defaultNflCalendar.weekState(new Date("2026-09-17T12:00:00.000Z")),
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
});
