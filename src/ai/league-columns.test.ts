import { describe, expect, it } from "vitest";
import {
  LEAGUE_COLUMN_KEYS,
  LEAGUE_COLUMN_LINEUP,
  leagueColumnCronSchedule,
  leagueColumnForCadenceAndDate,
  leagueColumnForId,
} from "./league-columns";

describe("league column lineup", () => {
  it("keeps the six owner columns in one identity and day-slot config", () => {
    expect(LEAGUE_COLUMN_KEYS).toHaveLength(6);
    expect(
      LEAGUE_COLUMN_KEYS.map((key) => {
        const column = LEAGUE_COLUMN_LINEUP[key];
        return {
          contentTypes: column.candidates.map(
            (candidate) => candidate.contentType,
          ),
          day: column.day,
          id: column.id,
        };
      }),
    ).toEqual([
      {
        contentTypes: ["matchup_preview"],
        day: "friday",
        id: "fantasy-friday",
      },
      {
        contentTypes: ["power_rankings", "weekly_recap"],
        day: "tuesday",
        id: "power-rankings-summary",
      },
      {
        contentTypes: ["matchup_preview"],
        day: "sunday",
        id: "predictions",
      },
      {
        contentTypes: ["matchup_preview"],
        day: "thursday",
        id: "tale-of-the-tape",
      },
      {
        contentTypes: ["weekly_recap"],
        day: "monday",
        id: "the-wrap",
      },
      {
        contentTypes: ["transaction_reaction"],
        day: "wednesday",
        id: "waiver-summary",
      },
    ]);
    const names = LEAGUE_COLUMN_KEYS.map(
      (key) => LEAGUE_COLUMN_LINEUP[key].name,
    );
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(6);
    expect(
      LEAGUE_COLUMN_KEYS.every(
        (key) => LEAGUE_COLUMN_LINEUP[key].formatContract.length > 0,
      ),
    ).toBe(true);
    expect(leagueColumnForId("the-wrap")?.name).toBe("The Wrap");
    expect(leagueColumnForId("not-a-column")).toBeNull();
  });

  it("derives the five cron schedules from the configured column slots", () => {
    expect(leagueColumnCronSchedule("weekly-wrap")).toBe("0 14 * * 1");
    expect(leagueColumnCronSchedule("mid-week")).toBe("0 14 * * 2,3");
    expect(leagueColumnCronSchedule("weekly-preview")).toBe("0 14 * * 0,4");
    expect(leagueColumnCronSchedule("post-odds-refresh")).toBe("0 14 * * 5");
  });

  it("selects only the column assigned to the cadence's current UTC day", () => {
    expect(
      leagueColumnForCadenceAndDate(
        "mid-week",
        new Date("2026-10-13T14:00:00.000Z"),
      )?.id,
    ).toBe("power-rankings-summary");
    expect(
      leagueColumnForCadenceAndDate(
        "mid-week",
        new Date("2026-10-14T14:00:00.000Z"),
      )?.id,
    ).toBe("waiver-summary");
    expect(
      leagueColumnForCadenceAndDate(
        "mid-week",
        new Date("2026-10-15T14:00:00.000Z"),
      ),
    ).toBeNull();
  });
});
