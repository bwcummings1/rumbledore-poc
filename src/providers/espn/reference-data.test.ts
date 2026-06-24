import { describe, expect, it } from "vitest";
import {
  decodeEspnActivityId,
  decodeEspnLineupSlotId,
  decodeEspnPositionId,
  decodeEspnProTeamId,
  decodeEspnScoringStatId,
  ESPN_ACTIVITY_IDS,
  ESPN_EMPTY_POSITION_IDS,
  ESPN_LINEUP_SLOT_IDS,
  ESPN_PLAYER_STAT_KEY_BY_ID,
  ESPN_POSITION_IDS,
  ESPN_PRO_TEAM_IDS,
  ESPN_SCORING_STAT_IDS,
} from "./reference-data";

const expectedPositions = {
  0: "QB",
  1: "TQB",
  2: "RB",
  3: "RB/WR",
  4: "WR",
  5: "WR/TE",
  6: "TE",
  7: "OP",
  8: "DT",
  9: "DE",
  10: "LB",
  11: "DL",
  12: "CB",
  13: "S",
  14: "DB",
  15: "DP",
  16: "D/ST",
  17: "K",
  18: "P",
  19: "HC",
  20: "BE",
  21: "IR",
  22: "N/A",
  23: "RB/WR/TE",
  24: "ER",
  25: "Rookie",
} as const;

const expectedLineupSlots = {
  ...expectedPositions,
  23: "FLEX",
} as const;

const expectedProTeams = {
  0: "FA",
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WSH",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
} as const;

const expectedActivities = {
  178: "add",
  179: "drop",
  180: "waiver",
  181: "drop",
  239: "drop",
  244: "trade",
} as const;

function numericKeys(value: Record<string, unknown>): number[] {
  return Object.keys(value)
    .map(Number)
    .sort((left, right) => left - right);
}

describe("ESPN reference data", () => {
  it("covers the complete position id vocabulary and fixes 3/4/5", () => {
    expect(ESPN_POSITION_IDS).toEqual(numericKeys(expectedPositions));
    expect(ESPN_EMPTY_POSITION_IDS).toEqual([22]);
    for (const [id, expected] of Object.entries(expectedPositions)) {
      expect(decodeEspnPositionId(Number(id))).toBe(expected);
    }
    expect(decodeEspnPositionId(3)).toBe("RB/WR");
    expect(decodeEspnPositionId(4)).toBe("WR");
    expect(decodeEspnPositionId(5)).toBe("WR/TE");
  });

  it("covers the complete lineup slot vocabulary including IDP and flex slots", () => {
    expect(ESPN_LINEUP_SLOT_IDS).toEqual(numericKeys(expectedLineupSlots));
    for (const [id, expected] of Object.entries(expectedLineupSlots)) {
      expect(decodeEspnLineupSlotId(Number(id))).toBe(expected);
    }
    expect(decodeEspnLineupSlotId(7)).toBe("OP");
    expect(decodeEspnLineupSlotId(10)).toBe("LB");
    expect(decodeEspnLineupSlotId(23)).toBe("FLEX");
    expect(decodeEspnLineupSlotId(24)).toBe("ER");
  });

  it("covers the complete ESPN pro-team vocabulary including relocations", () => {
    expect(ESPN_PRO_TEAM_IDS).toEqual(numericKeys(expectedProTeams));
    for (const [id, expected] of Object.entries(expectedProTeams)) {
      expect(decodeEspnProTeamId(Number(id))).toBe(expected);
    }
    expect(decodeEspnProTeamId(13)).toBe("LV");
    expect(decodeEspnProTeamId(14)).toBe("LAR");
    expect(decodeEspnProTeamId(24)).toBe("LAC");
    expect(decodeEspnProTeamId(28)).toBe("WSH");
    expect(decodeEspnProTeamId(33)).toBe("BAL");
    expect(decodeEspnProTeamId(34)).toBe("HOU");
  });

  it("covers ESPN activity codes with canonical transaction categories", () => {
    expect(ESPN_ACTIVITY_IDS).toEqual(numericKeys(expectedActivities));
    for (const [id, expected] of Object.entries(expectedActivities)) {
      expect(decodeEspnActivityId(Number(id))?.category).toBe(expected);
    }
  });

  it("decodes every ESPN scoring-settings stat id and cwendt player stat key", () => {
    expect(ESPN_SCORING_STAT_IDS).toEqual(
      Array.from({ length: 235 }, (_, index) => index),
    );
    for (const id of ESPN_SCORING_STAT_IDS) {
      expect(decodeEspnScoringStatId(id)).toMatchObject({ id });
    }
    for (const [id, key] of Object.entries(ESPN_PLAYER_STAT_KEY_BY_ID)) {
      expect(decodeEspnScoringStatId(Number(id))?.key).toBe(key);
    }
    expect(decodeEspnScoringStatId(10)?.category).toBe("passing");
    expect(decodeEspnScoringStatId(25)?.category).toBe("rushing");
    expect(decodeEspnScoringStatId(53)?.category).toBe("receiving");
    expect(decodeEspnScoringStatId(73)?.category).toBe("turnover");
    expect(decodeEspnScoringStatId(83)?.category).toBe("kicking");
    expect(decodeEspnScoringStatId(109)?.category).toBe("defense");
    expect(decodeEspnScoringStatId(138)?.category).toBe("punting");
    expect(decodeEspnScoringStatId(155)?.category).toBe("head_coach");
    expect(decodeEspnScoringStatId(204)?.category).toBe("misc");
  });
});
