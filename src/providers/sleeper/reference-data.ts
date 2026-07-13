// Sleeper's public API uses strings rather than numeric ids for these vocabularies.
// The shared integrity registry is numeric, so this module also exposes stable,
// kind-scoped 31-bit ids. Raw strings remain the source of truth; the ids are only
// an adapter for provider_code_decoding and persisted metadata.

export type SleeperTransactionCategory =
  | "add"
  | "commissioner"
  | "trade"
  | "waiver";

export type SleeperScoringCategory =
  | "bonus"
  | "defense"
  | "first_down"
  | "idp"
  | "kicking"
  | "misc"
  | "passing"
  | "receiving"
  | "rushing"
  | "special_teams"
  | "turnover";

export interface SleeperTransactionTypeDefinition {
  category: SleeperTransactionCategory;
  code: string;
  label: string;
}

export interface SleeperScoringSettingDefinition {
  category: SleeperScoringCategory;
  key: string;
}

export interface SleeperVocabularyEntry {
  code: string;
  source: string;
}

type SleeperRegistryCodeKind =
  | "activity"
  | "lineup_slot"
  | "position"
  | "pro_team"
  | "scoring_stat";

const SLEEPER_PLAYERS_SOURCE =
  "Sleeper GET /v1/players/nfl response captured 2026-07-13 (daily-cached)";
const SLEEPER_LEAGUE_SOURCE =
  "Sleeper API docs: GET /v1/league/<league_id> roster_positions example";
const SLEEPER_TRANSACTION_SOURCE =
  "Sleeper API docs: GET /v1/league/<league_id>/transactions/<round>";
const SLEEPER_SCORING_SOURCE =
  "Sleeper API docs sample league scoring_settings response, verified 2026-07-13";
const SLEEPER_COMMUNITY_SOURCE =
  "sleeper-api-wrapper community client scoring/roster models, cross-checked 2026-07-13";

function sourcedCodes(
  source: string,
  codes: readonly string[],
): SleeperVocabularyEntry[] {
  return codes.map((code) => ({ code, source }));
}

// The player dump supplies primary and fantasy positions. Composite positions are
// supplied by league roster_positions and community clients because they do not
// occur as a player's primary position.
export const SLEEPER_POSITION_VOCABULARY = [
  ...sourcedCodes(SLEEPER_PLAYERS_SOURCE, [
    "ATH",
    "C",
    "CB",
    "DB",
    "DE",
    "DEF",
    "DL",
    "DT",
    "FB",
    "FS",
    "G",
    "ILB",
    "K",
    "K/P",
    "LB",
    "LEO",
    "LS",
    "NT",
    "OG",
    "OL",
    "OLB",
    "OT",
    "P",
    "QB",
    "RB",
    "S",
    "SS",
    "T",
    "TE",
    "WR",
  ]),
  ...sourcedCodes(SLEEPER_COMMUNITY_SOURCE, [
    "FLEX",
    "IDP",
    "IDP_FLEX",
    "REC_FLEX",
    "SUPER_FLEX",
    "WRRB_FLEX",
  ]),
] as const satisfies readonly SleeperVocabularyEntry[];

export const SLEEPER_ROSTER_SLOT_VOCABULARY = [
  ...sourcedCodes(SLEEPER_LEAGUE_SOURCE, [
    "BN",
    "CB",
    "DB",
    "DE",
    "DEF",
    "DL",
    "DT",
    "FLEX",
    "IDP_FLEX",
    "IR",
    "K",
    "LB",
    "QB",
    "RB",
    "REC_FLEX",
    "S",
    "SUPER_FLEX",
    "TAXI",
    "TE",
    "WR",
    "WRRB_FLEX",
  ]),
  ...sourcedCodes(SLEEPER_COMMUNITY_SOURCE, [
    "ATH",
    "C",
    "FB",
    "FS",
    "G",
    "HC",
    "IDP",
    "ILB",
    "K/P",
    "LEO",
    "LS",
    "NT",
    "OG",
    "OL",
    "OLB",
    "OT",
    "P",
    "SS",
    "T",
  ]),
] as const satisfies readonly SleeperVocabularyEntry[];

export const SLEEPER_PRO_TEAM_VOCABULARY = [
  ...sourcedCodes(SLEEPER_PLAYERS_SOURCE, [
    "ARI",
    "ATL",
    "BAL",
    "BUF",
    "CAR",
    "CHI",
    "CIN",
    "CLE",
    "DAL",
    "DEN",
    "DET",
    "GB",
    "HOU",
    "IND",
    "JAX",
    "KC",
    "LAC",
    "LAR",
    "LV",
    "MIA",
    "MIN",
    "NE",
    "NO",
    "NYG",
    "NYJ",
    "OAK",
    "PHI",
    "PIT",
    "SEA",
    "SF",
    "TB",
    "TEN",
    "WAS",
  ]),
  ...sourcedCodes(SLEEPER_COMMUNITY_SOURCE, [
    "FA",
    "JAC",
    "LA",
    "SD",
    "STL",
    "WSH",
  ]),
] as const satisfies readonly SleeperVocabularyEntry[];

export const SLEEPER_TRANSACTION_TYPE_VOCABULARY = sourcedCodes(
  SLEEPER_TRANSACTION_SOURCE,
  ["commissioner", "free_agent", "trade", "waiver"],
) satisfies readonly SleeperVocabularyEntry[];

export const SLEEPER_SCORING_SETTING_VOCABULARY = [
  ...sourcedCodes(SLEEPER_SCORING_SOURCE, [
    "blk_kick",
    "blk_kick_ret_yd",
    "bonus_pass_yd_300",
    "bonus_pass_yd_400",
    "bonus_rec_yd_100",
    "bonus_rec_yd_200",
    "bonus_rush_yd_100",
    "bonus_rush_yd_200",
    "def_2pt",
    "def_pass_def",
    "def_st_ff",
    "def_st_fum_rec",
    "def_st_td",
    "def_td",
    "ff",
    "fg_ret_yd",
    "fgm",
    "fgm_0_19",
    "fgm_20_29",
    "fgm_30_39",
    "fgm_40_49",
    "fgm_50p",
    "fgmiss_0_19",
    "fgmiss_20_29",
    "fgmiss_30_39",
    "fum",
    "fum_lost",
    "fum_rec",
    "fum_ret_yd",
    "idp_blk",
    "idp_ff",
    "idp_fum_rec",
    "idp_int",
    "idp_pass_def",
    "idp_sack",
    "idp_safe",
    "idp_tkl",
    "idp_tkl_ast",
    "idp_tkl_solo",
    "int",
    "int_ret_yd",
    "kr_td",
    "kr_yd",
    "pass_2pt",
    "pass_att",
    "pass_cmp",
    "pass_int",
    "pass_sack",
    "pass_td",
    "pass_yd",
    "pr_td",
    "pr_yd",
    "pts_allow_0",
    "pts_allow_1_6",
    "pts_allow_7_13",
    "pts_allow_14_20",
    "pts_allow_21_27",
    "pts_allow_28_34",
    "pts_allow_35p",
    "qb_hit",
    "rec",
    "rec_2pt",
    "rec_td",
    "rec_yd",
    "rush_2pt",
    "rush_att",
    "rush_td",
    "rush_yd",
    "sack",
    "sack_yd",
    "safe",
    "st_ff",
    "st_fum_rec",
    "st_td",
    "st_tkl_solo",
    "tkl",
    "tkl_ast",
    "tkl_loss",
    "tkl_solo",
    "xpm",
    "xpmiss",
  ]),
  ...sourcedCodes(SLEEPER_COMMUNITY_SOURCE, [
    "bonus_fd_qb",
    "bonus_fd_rb",
    "bonus_fd_te",
    "bonus_fd_wr",
    "bonus_pass_cmp_25",
    "fgmiss",
    "fgmiss_40_49",
    "fgmiss_50p",
    "pass_fd",
    "pass_inc",
    "rec_fd",
    "rush_fd",
    "yds_allow_0_100",
    "yds_allow_100_199",
    "yds_allow_200_299",
    "yds_allow_300_349",
    "yds_allow_350_399",
    "yds_allow_400_449",
    "yds_allow_450_499",
    "yds_allow_500_549",
    "yds_allow_550p",
  ]),
] as const satisfies readonly SleeperVocabularyEntry[];

function mapFromVocabulary(
  vocabulary: readonly SleeperVocabularyEntry[],
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(vocabulary.map(({ code }) => [code, code])),
  );
}

export const SLEEPER_POSITION_MAP = mapFromVocabulary(
  SLEEPER_POSITION_VOCABULARY,
);
export const SLEEPER_ROSTER_SLOT_MAP = mapFromVocabulary(
  SLEEPER_ROSTER_SLOT_VOCABULARY,
);

export const SLEEPER_PRO_TEAM_MAP: Readonly<Record<string, string>> =
  Object.freeze({
    ...mapFromVocabulary(SLEEPER_PRO_TEAM_VOCABULARY),
    JAC: "JAX",
    LA: "LAR",
    OAK: "LV",
    SD: "LAC",
    STL: "LAR",
    WAS: "WSH",
  });

export const SLEEPER_TRANSACTION_TYPE_MAP: Readonly<
  Record<string, SleeperTransactionTypeDefinition>
> = Object.freeze({
  commissioner: {
    category: "commissioner",
    code: "commissioner",
    label: "Commissioner",
  },
  free_agent: {
    category: "add",
    code: "free_agent",
    label: "Free agent",
  },
  trade: { category: "trade", code: "trade", label: "Trade" },
  waiver: { category: "waiver", code: "waiver", label: "Waiver" },
});

function scoringCategory(key: string): SleeperScoringCategory {
  if (key.startsWith("bonus_")) return "bonus";
  if (key.endsWith("_fd")) return "first_down";
  if (key.startsWith("pass_")) return "passing";
  if (key.startsWith("rush_")) return "rushing";
  if (key === "rec" || key.startsWith("rec_")) return "receiving";
  if (key.startsWith("fg") || key.startsWith("xp")) return "kicking";
  if (key.startsWith("idp_")) return "idp";
  if (key.startsWith("st_") || key.startsWith("kr_") || key.startsWith("pr_")) {
    return "special_teams";
  }
  if (
    key.startsWith("def_") ||
    key.startsWith("pts_allow_") ||
    key.startsWith("yds_allow_") ||
    [
      "blk_kick",
      "blk_kick_ret_yd",
      "int",
      "int_ret_yd",
      "qb_hit",
      "sack",
      "sack_yd",
      "safe",
      "tkl",
      "tkl_ast",
      "tkl_loss",
      "tkl_solo",
    ].includes(key)
  ) {
    return "defense";
  }
  if (["ff", "fum", "fum_lost", "fum_rec", "fum_ret_yd"].includes(key)) {
    return "turnover";
  }
  return "misc";
}

export const SLEEPER_SCORING_SETTINGS_KEY_MAP: Readonly<
  Record<string, SleeperScoringSettingDefinition>
> = Object.freeze(
  Object.fromEntries(
    SLEEPER_SCORING_SETTING_VOCABULARY.map(({ code }) => [
      code,
      { category: scoringCategory(code), key: code },
    ]),
  ),
);

function normalizedCode(value: string, uppercase: boolean): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return uppercase ? trimmed.toUpperCase() : trimmed.toLowerCase();
}

function stableCodeId(kind: SleeperRegistryCodeKind, value: string): number {
  let hash = 2_166_136_261;
  for (const character of `${kind}:${value}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) & 0x7fff_ffff || 1;
}

function encodeCode(
  kind: SleeperRegistryCodeKind,
  value: string,
  uppercase: boolean,
): number | undefined {
  const normalized = normalizedCode(value, uppercase);
  return normalized ? stableCodeId(kind, normalized) : undefined;
}

function encodeObservedCode<T>(
  kind: SleeperRegistryCodeKind,
  value: string,
  uppercase: boolean,
  dictionary: Readonly<Record<string, T>>,
): number | undefined {
  const normalized = normalizedCode(value, uppercase);
  if (!normalized) return undefined;
  const id = stableCodeId(kind, normalized);
  return dictionary[normalized] === undefined ? -id : id;
}

function numericDictionary<T>(
  kind: SleeperRegistryCodeKind,
  dictionary: Readonly<Record<string, T>>,
  uppercase: boolean,
): Readonly<Partial<Record<number, T>>> {
  const entries: [number, T][] = [];
  const rawById = new Map<number, string>();
  for (const [rawCode, definition] of Object.entries(dictionary)) {
    const id = encodeCode(kind, rawCode, uppercase);
    if (id === undefined) continue;
    const collision = rawById.get(id);
    if (collision && collision !== rawCode) {
      throw new Error(
        `Sleeper ${kind} adapter collision: ${collision} and ${rawCode} encode to ${id}`,
      );
    }
    rawById.set(id, rawCode);
    entries.push([id, definition]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function encodeSleeperPosition(value: string): number | undefined {
  return encodeObservedCode("position", value, true, SLEEPER_POSITION_MAP);
}

export function encodeSleeperRosterSlot(value: string): number | undefined {
  return encodeObservedCode(
    "lineup_slot",
    value,
    true,
    SLEEPER_ROSTER_SLOT_MAP,
  );
}

export function encodeSleeperProTeam(value: string): number | undefined {
  return encodeObservedCode("pro_team", value, true, SLEEPER_PRO_TEAM_MAP);
}

export function encodeSleeperTransactionType(
  value: string,
): number | undefined {
  return encodeObservedCode(
    "activity",
    value,
    false,
    SLEEPER_TRANSACTION_TYPE_MAP,
  );
}

export function encodeSleeperScoringSetting(value: string): number | undefined {
  return encodeObservedCode(
    "scoring_stat",
    value,
    false,
    SLEEPER_SCORING_SETTINGS_KEY_MAP,
  );
}

export const SLEEPER_POSITION_BY_ID = numericDictionary(
  "position",
  SLEEPER_POSITION_MAP,
  true,
);
export const SLEEPER_ROSTER_SLOT_BY_ID = numericDictionary(
  "lineup_slot",
  SLEEPER_ROSTER_SLOT_MAP,
  true,
);
export const SLEEPER_PRO_TEAM_BY_ID = numericDictionary(
  "pro_team",
  SLEEPER_PRO_TEAM_MAP,
  true,
);
export const SLEEPER_TRANSACTION_TYPE_BY_ID = numericDictionary(
  "activity",
  SLEEPER_TRANSACTION_TYPE_MAP,
  false,
);
export const SLEEPER_SCORING_SETTING_BY_ID = numericDictionary(
  "scoring_stat",
  SLEEPER_SCORING_SETTINGS_KEY_MAP,
  false,
);

export const SLEEPER_PROVIDER_DECODING_DICTIONARY = {
  activities: SLEEPER_TRANSACTION_TYPE_BY_ID,
  lineupSlots: SLEEPER_ROSTER_SLOT_BY_ID,
  positions: SLEEPER_POSITION_BY_ID,
  proTeams: SLEEPER_PRO_TEAM_BY_ID,
  scoringStats: SLEEPER_SCORING_SETTING_BY_ID,
} as const;

export function decodeSleeperPosition(value: string): string | undefined {
  const normalized = normalizedCode(value, true);
  return normalized ? SLEEPER_POSITION_MAP[normalized] : undefined;
}

export function decodeSleeperRosterSlot(value: string): string | undefined {
  const normalized = normalizedCode(value, true);
  return normalized ? SLEEPER_ROSTER_SLOT_MAP[normalized] : undefined;
}

export function decodeSleeperProTeam(value: string): string | undefined {
  const normalized = normalizedCode(value, true);
  return normalized ? SLEEPER_PRO_TEAM_MAP[normalized] : undefined;
}

export function decodeSleeperTransactionType(
  value: string,
): SleeperTransactionTypeDefinition | undefined {
  const normalized = normalizedCode(value, false);
  return normalized ? SLEEPER_TRANSACTION_TYPE_MAP[normalized] : undefined;
}

export function decodeSleeperScoringSetting(
  value: string,
): SleeperScoringSettingDefinition | undefined {
  const normalized = normalizedCode(value, false);
  return normalized ? SLEEPER_SCORING_SETTINGS_KEY_MAP[normalized] : undefined;
}
