// Source vocabulary: cwendt94/espn-api espn_api/football/constant.py.

export type EspnScoringStatCategory =
  | "defense"
  | "head_coach"
  | "kicking"
  | "misc"
  | "passing"
  | "punting"
  | "receiving"
  | "rushing"
  | "turnover";

export type EspnTransactionCategory = "add" | "drop" | "trade" | "waiver";

export interface EspnActivityDefinition {
  category: EspnTransactionCategory;
  id: number;
  label: string;
}

export interface EspnScoringStatDefinition {
  category: EspnScoringStatCategory;
  id: number;
  key: string;
}

const ESPN_POSITION_MAP = {
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

const ESPN_LINEUP_SLOT_MAP = {
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
  23: "FLEX",
  24: "ER",
  25: "Rookie",
} as const;

const ESPN_PRO_TEAM_MAP = {
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

const ESPN_ACTIVITY_MAP = {
  178: { category: "add", id: 178, label: "FA ADDED" },
  179: { category: "drop", id: 179, label: "DROPPED" },
  180: { category: "waiver", id: 180, label: "WAIVER ADDED" },
  181: { category: "drop", id: 181, label: "DROPPED" },
  239: { category: "drop", id: 239, label: "DROPPED" },
  244: { category: "trade", id: 244, label: "TRADED" },
} as const satisfies Readonly<Record<number, EspnActivityDefinition>>;

const ESPN_PLAYER_STAT_KEY_MAP = {
  0: "passingAttempts",
  1: "passingCompletions",
  2: "passingIncompletions",
  3: "passingYards",
  4: "passingTouchdowns",
  15: "passing40PlusYardTD",
  16: "passing50PlusYardTD",
  17: "passing300To399YardGame",
  18: "passing400PlusYardGame",
  19: "passing2PtConversions",
  20: "passingInterceptions",
  21: "passingCompletionPercentage",
  22: "passingYards",
  23: "rushingAttempts",
  24: "rushingYards",
  25: "rushingTouchdowns",
  26: "rushing2PtConversions",
  35: "rushing40PlusYardTD",
  36: "rushing50PlusYardTD",
  37: "rushing100To199YardGame",
  38: "rushing200PlusYardGame",
  39: "rushingYardsPerAttempt",
  40: "rushingYards",
  41: "receivingReceptions",
  42: "receivingYards",
  43: "receivingTouchdowns",
  44: "receiving2PtConversions",
  45: "receiving40PlusYardTD",
  46: "receiving50PlusYardTD",
  53: "receivingReceptions",
  56: "receiving100To199YardGame",
  57: "receiving200PlusYardGame",
  58: "receivingTargets",
  59: "receivingYardsAfterCatch",
  60: "receivingYardsPerReception",
  61: "receivingYards",
  62: "2PtConversions",
  63: "fumbleRecoveredForTD",
  64: "passingTimesSacked",
  68: "fumbles",
  72: "lostFumbles",
  73: "turnovers",
  74: "madeFieldGoalsFrom50Plus",
  75: "attemptedFieldGoalsFrom50Plus",
  76: "missedFieldGoalsFrom50Plus",
  77: "madeFieldGoalsFrom40To49",
  78: "attemptedFieldGoalsFrom40To49",
  79: "missedFieldGoalsFrom40To49",
  80: "madeFieldGoalsFromUnder40",
  81: "attemptedFieldGoalsFromUnder40",
  82: "missedFieldGoalsFromUnder40",
  83: "madeFieldGoals",
  84: "attemptedFieldGoals",
  85: "missedFieldGoals",
  86: "madeExtraPoints",
  87: "attemptedExtraPoints",
  88: "missedExtraPoints",
  89: "defensive0PointsAllowed",
  90: "defensive1To6PointsAllowed",
  91: "defensive7To13PointsAllowed",
  92: "defensive14To17PointsAllowed",
  93: "defensiveBlockedKickForTouchdowns",
  94: "defensiveTouchdowns",
  95: "defensiveInterceptions",
  96: "defensiveFumbles",
  97: "defensiveBlockedKicks",
  98: "defensiveSafeties",
  99: "defensiveSacks",
  101: "kickoffReturnTouchdowns",
  102: "puntReturnTouchdowns",
  103: "interceptionReturnTouchdowns",
  104: "fumbleReturnTouchdowns",
  105: "defensivePlusSpecialTeamsTouchdowns",
  106: "defensiveForcedFumbles",
  107: "defensiveAssistedTackles",
  108: "defensiveSoloTackles",
  109: "defensiveTotalTackles",
  113: "defensivePassesDefensed",
  114: "kickoffReturnYards",
  115: "puntReturnYards",
  118: "puntsReturned",
  120: "defensivePointsAllowed",
  121: "defensive18To21PointsAllowed",
  122: "defensive22To27PointsAllowed",
  123: "defensive28To34PointsAllowed",
  124: "defensive35To45PointsAllowed",
  125: "defensive45PlusPointsAllowed",
  127: "defensiveYardsAllowed",
  128: "defensiveLessThan100YardsAllowed",
  129: "defensive100To199YardsAllowed",
  130: "defensive200To299YardsAllowed",
  131: "defensive300To349YardsAllowed",
  132: "defensive350To399YardsAllowed",
  133: "defensive400To449YardsAllowed",
  134: "defensive450To499YardsAllowed",
  135: "defensive500To549YardsAllowed",
  136: "defensive550PlusYardsAllowed",
  138: "netPunts",
  139: "puntYards",
  140: "puntsInsideThe10",
  141: "puntsInsideThe20",
  142: "blockedPunts",
  145: "puntTouchbacks",
  146: "puntFairCatches",
  147: "puntAverage",
  148: "puntAverage44.0+",
  149: "puntAverage42.0-43.9",
  150: "puntAverage40.0-41.9",
  151: "puntAverage38.0-39.9",
  152: "puntAverage36.0-37.9",
  153: "puntAverage34.0-35.9",
  154: "puntAverage33.9AndUnder",
  155: "teamWin",
  156: "teamLoss",
  157: "teamTie",
  158: "pointsScored",
  160: "pointsMargin",
  161: "25+pointWinMargin",
  162: "20-24pointWinMargin",
  163: "15-19pointWinMargin",
  164: "10-14pointWinMargin",
  165: "5-9pointWinMargin",
  166: "1-4pointWinMargin",
  167: "1-4pointLossMargin",
  168: "5-9pointLossMargin",
  169: "10-14pointLossMargin",
  170: "15-19pointLossMargin",
  171: "20-24pointLossMargin",
  172: "25+pointLossMargin",
  174: "winPercentage",
  187: "defensivePointsAllowed",
  201: "madeFieldGoalsFrom60Plus",
  202: "attemptedFieldGoalsFrom60Plus",
  203: "missedFieldGoalsFrom60Plus",
  205: "defensive2PtReturns",
  206: "defensive2PtReturns",
} as const;

export const ESPN_POSITION_BY_ID = ESPN_POSITION_MAP as Readonly<
  Partial<Record<number, string>>
>;
export const ESPN_LINEUP_SLOT_BY_ID = ESPN_LINEUP_SLOT_MAP as Readonly<
  Partial<Record<number, string>>
>;
export const ESPN_PRO_TEAM_BY_ID = ESPN_PRO_TEAM_MAP as Readonly<
  Partial<Record<number, string>>
>;
export const ESPN_ACTIVITY_BY_ID = ESPN_ACTIVITY_MAP as Readonly<
  Partial<Record<number, EspnActivityDefinition>>
>;
export const ESPN_PLAYER_STAT_KEY_BY_ID = ESPN_PLAYER_STAT_KEY_MAP as Readonly<
  Partial<Record<number, string>>
>;

export const ESPN_POSITION_IDS = numericKeys(ESPN_POSITION_MAP);
export const ESPN_LINEUP_SLOT_IDS = numericKeys(ESPN_LINEUP_SLOT_MAP);
export const ESPN_PRO_TEAM_IDS = numericKeys(ESPN_PRO_TEAM_MAP);
export const ESPN_ACTIVITY_IDS = numericKeys(ESPN_ACTIVITY_MAP);
export const ESPN_EMPTY_POSITION_IDS = [22] as const;

const ESPN_RESERVE_LINEUP_SLOT_IDS = new Set([20, 21, 22, 24]);

function numericKeys(value: Record<string, unknown>): number[] {
  return Object.keys(value)
    .map((key) => Number(key))
    .filter((key) => Number.isInteger(key))
    .sort((left, right) => left - right);
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function scoringCategoryForId(id: number): EspnScoringStatCategory | undefined {
  if ((id >= 0 && id <= 22) || (id >= 175 && id <= 178) || id === 211) {
    return "passing";
  }
  if ((id >= 23 && id <= 40) || (id >= 179 && id <= 182) || id === 212) {
    return "rushing";
  }
  if ((id >= 41 && id <= 61) || (id >= 183 && id <= 186) || id === 213) {
    return "receiving";
  }
  if (id >= 62 && id <= 73) {
    return "turnover";
  }
  if ((id >= 74 && id <= 88) || (id >= 198 && id <= 203) || id >= 214) {
    return "kicking";
  }
  if (
    (id >= 89 && id <= 137) ||
    (id >= 187 && id <= 197) ||
    id === 205 ||
    id === 206
  ) {
    return "defense";
  }
  if (id >= 138 && id <= 154) {
    return "punting";
  }
  if (id >= 155 && id <= 174) {
    return "head_coach";
  }
  if (id >= 204 && id <= 213) {
    return "misc";
  }
  return undefined;
}

function buildScoringStatMap(): Readonly<
  Record<number, EspnScoringStatDefinition>
> {
  const allSettingIds = range(0, 234);
  return Object.fromEntries(
    allSettingIds.flatMap((id) => {
      const category = scoringCategoryForId(id);
      if (!category) {
        return [];
      }
      return [
        [
          id,
          {
            category,
            id,
            key: ESPN_PLAYER_STAT_KEY_BY_ID[id] ?? `${category}Stat${id}`,
          },
        ] as const,
      ];
    }),
  );
}

export const ESPN_SCORING_STAT_BY_ID = buildScoringStatMap();
export const ESPN_SCORING_STAT_IDS = numericKeys(ESPN_SCORING_STAT_BY_ID);

export function decodeEspnPositionId(id: number): string | undefined {
  return ESPN_POSITION_BY_ID[id];
}

export function decodeEspnLineupSlotId(id: number): string | undefined {
  return ESPN_LINEUP_SLOT_BY_ID[id];
}

export function decodeEspnProTeamId(id: number): string | undefined {
  return ESPN_PRO_TEAM_BY_ID[id];
}

export function decodeEspnActivityId(
  id: number,
): EspnActivityDefinition | undefined {
  return ESPN_ACTIVITY_BY_ID[id];
}

export function decodeEspnScoringStatId(
  id: number,
): EspnScoringStatDefinition | undefined {
  return ESPN_SCORING_STAT_BY_ID[id];
}

export function espnLineupSlotIsStarted(id: number | undefined): boolean {
  return id === undefined ? false : !ESPN_RESERVE_LINEUP_SLOT_IDS.has(id);
}

export function espnLineupSlotLabel(id: string | number): string | undefined {
  const parsed = Number(id);
  if (!Number.isInteger(parsed)) {
    return undefined;
  }
  return decodeEspnLineupSlotId(parsed);
}

export function decodeEspnActivityValue(
  value: unknown,
): EspnActivityDefinition | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/u.test(value.trim())
        ? Number(value)
        : undefined;
  if (numeric !== undefined) {
    return decodeEspnActivityId(numeric);
  }

  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value
    .trim()
    .toUpperCase()
    .replaceAll(/[\s_-]+/gu, "");
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes("TRADE")) {
    return ESPN_ACTIVITY_BY_ID[244];
  }
  if (normalized.includes("WAIVER")) {
    return ESPN_ACTIVITY_BY_ID[180];
  }
  if (normalized.includes("DROP") || normalized.includes("DROPPED")) {
    return ESPN_ACTIVITY_BY_ID[179];
  }
  if (
    normalized.includes("FREEAGENT") ||
    normalized.includes("FAADDED") ||
    normalized.includes("ADDED") ||
    normalized.includes("ADD")
  ) {
    return ESPN_ACTIVITY_BY_ID[178];
  }
  return undefined;
}
