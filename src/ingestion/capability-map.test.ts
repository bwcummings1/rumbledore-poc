import { describe, expect, it } from "vitest";
import { buildDeclaredCapabilityBasis } from "./capability-map";

describe("buildDeclaredCapabilityBasis", () => {
  it("states measured provider-limited player-depth seasons compactly", () => {
    const observations = Array.from({ length: 16 }, (_, index) => {
      const season = 2011 + index;
      const available = season <= 2017 || season === 2026;
      return {
        availability: available ? ("partial" as const) : ("none" as const),
        dataClass: "rosters" as const,
        rowCount: available ? 120 : 0,
        season,
      };
    });

    expect(
      buildDeclaredCapabilityBasis({
        currentSeason: 2026,
        dataClass: "rosters",
        label: "Player depth",
        observations,
      }),
    ).toEqual({
      absentSeasons: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
      availableSeasons: [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2026],
      dataClass: "rosters",
      label:
        "Player depth: 2011\u20132017 + current \u2014 measured, provider-limited",
      measuredSeasons: [
        2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022,
        2023, 2024, 2025, 2026,
      ],
      partialSeasons: [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2026],
      providerLimited: true,
      seasonBasis: "2011\u20132017 + current",
    });
  });

  it("distinguishes an unmeasured class from measured empty coverage", () => {
    expect(
      buildDeclaredCapabilityBasis({
        currentSeason: 2026,
        dataClass: "rosters",
        label: "Player depth",
        observations: [],
      }).label,
    ).toBe("Player depth: not measured");

    expect(
      buildDeclaredCapabilityBasis({
        currentSeason: 2026,
        dataClass: "rosters",
        label: "Player depth",
        observations: [
          {
            availability: "none",
            dataClass: "rosters",
            rowCount: 0,
            season: 2026,
          },
        ],
      }).label,
    ).toBe("Player depth: none \u2014 measured, provider-limited");
  });
});
