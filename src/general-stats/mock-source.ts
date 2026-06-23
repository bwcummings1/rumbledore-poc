import mockNfl2026Fixture from "@/fixtures/general-stats/mock-nfl-2026.json";
import { parseGeneralStatsFixture } from "./source";
import type { GeneralStatsFixture } from "./types";

export function loadMockGeneralStatsFixture(): GeneralStatsFixture {
  return parseGeneralStatsFixture(mockNfl2026Fixture);
}
