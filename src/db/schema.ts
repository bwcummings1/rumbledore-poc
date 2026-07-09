import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { FANTASY_PROVIDER_IDS } from "../providers/ids";
import {
  DATA_COVERAGE_STATUSES,
  type NormalizedFinalStandingRankConfidence,
  type NormalizedFinalStandingRankSource,
  PROVIDER_DATA_CLASSES,
  PROVIDER_DATA_SUPPORT_LEVELS,
} from "../providers/model";

/**
 * Baseline tables (spec 02 §6): users, leagues, auth members.
 * - `users` is central (cross-league by design — no restrictive RLS).
 * - `leagues` is the tenant root and Better Auth organization table.
 * - provider-normalized fantasy tables are league-scoped: RLS restricts every
 *   command to rows whose `league_id` matches the transaction-local
 *   `app.current_league_id` setting (see `src/db/rls.ts`; the
 *   `current_league_id()` SQL function lives in migration 0002).
 *
 * Every future league-scoped table must declare the same isolation policy.
 *
 * Auth plane (spec 02 §8, Better Auth): `sessions`/`accounts`/`verifications`
 * plus the organization plugin mapped league=org — `leagues` doubles as the
 * organization table, and `members`/`invitations` hold org membership. The
 * auth-plane tables are central (no restrictive RLS) by design: Better Auth
 * must read membership BEFORE a league context exists, because guards derive
 * `app.current_league_id` FROM the session's active organization (spec 01).
 */

export const fantasyProvider = pgEnum("fantasy_provider", FANTASY_PROVIDER_IDS);

export const fantasySport = pgEnum("fantasy_sport", ["ffl", "unknown"]);

export const fantasyLeagueStatus = pgEnum("fantasy_league_status", [
  "preseason",
  "in_season",
  "complete",
  "unknown",
]);

export const fantasyMatchupWinner = pgEnum("fantasy_matchup_winner", [
  "home",
  "away",
  "tie",
  "unknown",
]);

export const fantasyMatchupStatus = pgEnum("fantasy_matchup_status", [
  "scheduled",
  "in_progress",
  "final",
  "unknown",
]);

export const fantasyMatchupKind = pgEnum("fantasy_matchup_kind", [
  "head_to_head",
  "median",
  "all_play",
]);

export const historicalImportStatus = pgEnum("historical_import_status", [
  "running",
  "completed",
  "failed",
]);

export const dataCoverageClass = pgEnum(
  "data_coverage_class",
  PROVIDER_DATA_CLASSES,
);

export const dataCoverageCapability = pgEnum(
  "data_coverage_capability",
  PROVIDER_DATA_SUPPORT_LEVELS,
);

export const dataCoverageStatus = pgEnum(
  "data_coverage_status",
  DATA_COVERAGE_STATUSES,
);

export const dataIntegrityCheckKey = pgEnum("data_integrity_check_key", [
  "reconciliation_totals",
  "standings_parity",
  "postseason_derivation_confidence",
  "schedule_coverage",
  "identity_sanity",
  "no_silent_empty",
  "finalized_state_regression",
  "grouping_season_coverage",
  "matchup_span_sanity",
  "data_edit_ledger_completeness",
  "sticky_edit_conflict",
  "provider_identity_contamination",
  "provider_code_decoding",
  "roster_coverage",
  "player_points_rollup",
]);

export const dataIntegrityCheckStatus = pgEnum("data_integrity_check_status", [
  "pass",
  "fail",
  "reviewed",
]);

export const dataCorrectionAuditAction = pgEnum(
  "data_correction_audit_action",
  ["mark_reviewed", "rerun_integrity"],
);

export const leagueDataEditTargetKind = pgEnum("league_data_edit_target_kind", [
  "person",
  "team_season",
  "weekly_stat",
  "matchup",
  "season_setting",
  "grouping",
  "member",
  "curation_checkpoint",
  "curation_push",
]);

export const leagueDataEditClass = pgEnum("league_data_edit_class", [
  "cosmetic",
  "substantive",
]);

export const leagueSeasonGroupingStatus = pgEnum(
  "league_season_grouping_status",
  ["proposed", "confirmed", "dismissed"],
);

export const onboardingCredentialStatus = pgEnum(
  "onboarding_credential_status",
  ["connected", "invalid"],
);

export const onboardingConnectionFlow = pgEnum("onboarding_connection_flow", [
  "browser",
  "manual",
  "extension",
  "public",
  "oauth",
]);

export const onboardingBrowserSessionStatus = pgEnum(
  "onboarding_browser_session_status",
  ["awaiting_login", "connected", "failed", "ended"],
);

export const leagueInviteChannel = pgEnum("league_invite_channel", [
  "share",
  "sms",
  "email",
]);

export const leagueInviteStatus = pgEnum("league_invite_status", [
  "pending",
  "sent",
  "accepted",
  "canceled",
]);

export const identityMappingMethod = pgEnum("identity_mapping_method", [
  "auto",
  "fuzzy",
  "manual",
]);

export const identityAuditAction = pgEnum("identity_audit_action", [
  "create",
  "merge",
  "split",
  "remap",
  "rename",
]);

export const statisticsResult = pgEnum("statistics_result", [
  "bye",
  "win",
  "loss",
  "tie",
]);

export const statsCalculationType = pgEnum("stats_calculation_type", [
  "season",
  "head_to_head",
  "records",
  "championships",
  "all",
]);

export const statsCalculationStatus = pgEnum("stats_calculation_status", [
  "running",
  "completed",
  "failed",
]);

export const contentItemKind = pgEnum("content_item_kind", [
  "news",
  "blog",
  "ingest_event",
]);

export const contentItemStatus = pgEnum("content_item_status", [
  "published",
  "superseded",
  "retracted",
]);

export const aiPersona = pgEnum("ai_persona", [
  "commissioner",
  "analyst",
  "narrator",
  "trash_talker",
  "beat_reporter",
  "betting_advisor",
]);

export const aiGenerationStatus = pgEnum("ai_generation_status", [
  "running",
  "published",
  "skipped",
  "blocked_entitlement",
  "failed",
]);

export const aiMemorySource = pgEnum("ai_memory_source", [
  "blog_post",
  "league_fact",
  "storyline",
]);

export const instigationKind = pgEnum("instigation_kind", [
  "settle_it_poll",
  "villain_crown",
  "manufactured_rivalry",
  "user_move_reaction",
]);

export const instigationStatus = pgEnum("instigation_status", [
  "open",
  "polling",
  "resolved",
  "skipped",
]);

export const pollStatus = pgEnum("poll_status", ["open", "closed"]);

export const loreClaimKind = pgEnum("lore_claim_kind", [
  "data_verifiable",
  "opinion",
]);

export const loreClaimStatus = pgEnum("lore_claim_status", [
  "pending",
  "vote",
  "canon",
  "disputed",
  "rejected",
  "superseded",
  "withdrawn",
]);

export const loreClaimVerification = pgEnum("lore_claim_verification", [
  "verified",
  "refuted",
  "unverifiable",
  "n_a",
]);

export const loreClaimOrigin = pgEnum("lore_claim_origin", ["member", "ai"]);

export const loreClaimRatifiedBy = pgEnum("lore_claim_ratified_by", [
  "verified",
  "vote",
  "steward",
]);

export const loreClaimRelation = pgEnum("lore_claim_relation", [
  "root",
  "response",
  "addendum",
  "dispute",
  "relitigation",
]);

export const loreSubjectType = pgEnum("lore_subject_type", [
  "person",
  "rivalry",
  "season",
  "week",
  "record",
]);

export const loreVerificationResult = pgEnum("lore_verification_result", [
  "match",
  "contradiction",
  "uncheckable",
]);

export const loreVoteChoice = pgEnum("lore_vote_choice", [
  "affirm",
  "reject",
  "abstain",
]);

export const loreEventKind = pgEnum("lore_event_kind", [
  "created",
  "vote_opened",
  "voted",
  "ratified",
  "rejected",
  "disputed",
  "superseded",
  "steward_action",
  "edited",
  "withdrawn",
]);

export const bettingSport = pgEnum("betting_sport", ["nfl"]);

export const bettingEventStatus = pgEnum("betting_event_status", [
  "scheduled",
  "in_progress",
  "final",
  "postponed",
  "canceled",
]);

export const bettingMarketType = pgEnum("betting_market_type", [
  "moneyline",
  "spread",
  "total",
  "player_prop",
]);

export const bettingMarketPeriod = pgEnum("betting_market_period", [
  "full_game",
]);

export const bettingMarketStatus = pgEnum("betting_market_status", [
  "open",
  "suspended",
  "settled",
  "void",
]);

export const bankrollLedgerEntryType = pgEnum("bankroll_ledger_entry_type", [
  "week_open",
  "bet_stake",
  "bet_payout",
  "bet_refund",
  "reset_to_floor",
  "adjustment",
]);

export const betSlipKind = pgEnum("bet_slip_kind", ["single", "parlay"]);

export const betSlipStatus = pgEnum("bet_slip_status", [
  "pending",
  "won",
  "lost",
  "push",
  "void",
  "partial_void",
]);

export const betSettlementOutcome = pgEnum("bet_settlement_outcome", [
  "won",
  "lost",
  "push",
  "void",
  "partial_void",
]);

export const betLegSelection = pgEnum("bet_leg_selection", [
  "home",
  "away",
  "over",
  "under",
  "player_over",
  "player_under",
  "outcome",
]);

export const betLegStatus = pgEnum("bet_leg_status", [
  "pending",
  "won",
  "lost",
  "push",
  "void",
]);

export const arenaStandingKind = pgEnum("arena_standing_kind", [
  "league",
  "individual",
]);

export const pushSubscriptionStatus = pgEnum("push_subscription_status", [
  "active",
  "disabled",
]);

export const pushNotificationType = pgEnum("push_notification_type", [
  "league.bet.settled",
  "league.blog.published",
  "league.lore.vote.opened",
  "league.lore.canonized",
  "arena.rival.passed",
  "content.retracted",
  "content.superseded",
]);

export interface LeagueFeedMatchedEntity {
  provider: string;
  type: "player" | "team" | "member" | "storyline";
  providerId: string;
  label?: string;
}

// Per-league roles (spec 01 §Auth). `super_admin` is global, not a league role.
export const leagueRole = pgEnum("league_role", [
  "commissioner",
  "league_admin",
  "data_steward",
  "member",
]);

export const leagueEntitlementTier = pgEnum("league_entitlement_tier", [
  "free",
  "premium",
]);

export const userEntitlementTier = pgEnum("user_entitlement_tier", [
  "individual",
]);

export const entitlementStatus = pgEnum("entitlement_status", [
  "active",
  "expired",
  "suspended",
]);

export const entitlementSource = pgEnum("entitlement_source", [
  "granted",
  "comp",
  "dev",
  "purchased",
]);

export const entitlementEventAction = pgEnum("entitlement_event_action", [
  "grant",
  "revoke",
  "expire",
  "suspend",
  "resume",
  "update_caps",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const vectorColumn = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector";
  },
  fromDriver(value) {
    if (Array.isArray(value)) {
      return value.map(Number);
    }
    return String(value)
      .slice(1, -1)
      .split(",")
      .filter(Boolean)
      .map((item) => Number.parseFloat(item));
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    // Better Auth core user fields (`name` maps to displayName in src/auth).
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const platformAdmins = pgTable(
  "platform_admins",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    ...timestamps,
  },
  (table) => [index("platform_admins_granted_by_idx").on(table.grantedBy)],
);

export const leagues = pgTable(
  "leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: fantasyProvider("provider").notNull(),
    // Stable composite identity {provider, providerId} per spec 03 — never the raw numeric id alone.
    providerLeagueId: text("provider_league_id").notNull(),
    name: text("name").notNull(),
    season: integer("season").notNull().default(0),
    sport: fantasySport("sport").notNull().default("unknown"),
    scoringType: text("scoring_type").notNull().default("unknown"),
    scoringSettings: jsonb("scoring_settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    size: integer("size").notNull().default(0),
    currentScoringPeriod: integer("current_scoring_period")
      .notNull()
      .default(0),
    status: fantasyLeagueStatus("status").notNull().default("unknown"),
    // Better Auth organization fields (league=org). Slug defaults to a UUID
    // until onboarding (P1) assigns human slugs; leagues are created by
    // domain code, never via Better Auth's createOrganization (provider
    // fields are NOT NULL, and allowUserToCreateOrganization is false).
    slug: text("slug")
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    logo: text("logo"),
    metadata: text("metadata"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("leagues_provider_league_unique").on(
      table.provider,
      table.providerLeagueId,
    ),
    uniqueIndex("leagues_slug_unique").on(table.slug),
  ],
);

// ── Provider-normalized league data (league-scoped; RLS enforced) ─────────

export const fantasyTeams = pgTable(
  "fantasy_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    providerTeamId: text("provider_team_id").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    season: integer("season").notNull(),
    name: text("name").notNull(),
    abbrev: text("abbrev").notNull().default(""),
    division: text("division"),
    logo: text("logo"),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    ties: integer("ties").notNull().default(0),
    pointsFor: doublePrecision("points_for").notNull().default(0),
    pointsAgainst: doublePrecision("points_against").notNull().default(0),
    ownerMemberIds: jsonb("owner_member_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fantasy_teams_provider_identity_unique").on(
      table.provider,
      table.leagueProviderId,
      table.providerTeamId,
      table.season,
    ),
    index("fantasy_teams_league_idx").on(table.leagueId),
    pgPolicy("fantasy_teams_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const fantasyMembers = pgTable(
  "fantasy_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    providerMemberId: text("provider_member_id").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    season: integer("season").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("unknown"),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fantasy_members_provider_identity_unique").on(
      table.provider,
      table.leagueProviderId,
      table.providerMemberId,
      table.season,
    ),
    index("fantasy_members_league_idx").on(table.leagueId),
    index("fantasy_members_provider_member_idx").on(
      table.provider,
      table.providerMemberId,
    ),
    pgPolicy("fantasy_members_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const fantasyMatchups = pgTable(
  "fantasy_matchups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    providerMatchupId: text("provider_matchup_id").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    season: integer("season").notNull(),
    scoringPeriod: integer("scoring_period").notNull(),
    periodStart: integer("period_start"),
    scoringPeriodSpan: integer("scoring_period_span").notNull().default(1),
    kind: fantasyMatchupKind("kind").notNull().default("head_to_head"),
    homeTeamProviderId: text("home_team_provider_id").notNull(),
    awayTeamProviderId: text("away_team_provider_id"),
    homeScore: doublePrecision("home_score").notNull().default(0),
    awayScore: doublePrecision("away_score").notNull().default(0),
    winner: fantasyMatchupWinner("winner").notNull().default("unknown"),
    status: fantasyMatchupStatus("status").notNull().default("unknown"),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fantasy_matchups_provider_identity_unique").on(
      table.provider,
      table.leagueProviderId,
      table.providerMatchupId,
      table.season,
      table.scoringPeriod,
    ),
    index("fantasy_matchups_league_period_idx").on(
      table.leagueId,
      table.season,
      table.scoringPeriod,
    ),
    pgPolicy("fantasy_matchups_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
    check(
      "fantasy_matchups_scoring_period_span_positive",
      sql`${table.scoringPeriodSpan} >= 1`,
    ),
  ],
);

export const providerFinalStandings = pgTable(
  "provider_final_standings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    providerTeamId: text("provider_team_id").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    season: integer("season").notNull(),
    finalRank: integer("final_rank").notNull(),
    rankSource: text("rank_source")
      .$type<NormalizedFinalStandingRankSource>()
      .notNull()
      .default("provider_reported"),
    rankConfidence: text("rank_confidence")
      .$type<NormalizedFinalStandingRankConfidence>()
      .notNull()
      .default("high"),
    division: text("division"),
    divisionRank: integer("division_rank"),
    divisionWinner: boolean("division_winner").notNull().default(false),
    playoffSeed: integer("playoff_seed"),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    ties: integer("ties").notNull().default(0),
    pointsFor: doublePrecision("points_for").notNull().default(0),
    pointsAgainst: doublePrecision("points_against").notNull().default(0),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provider_final_standings_identity_unique").on(
      table.leagueId,
      table.provider,
      table.leagueProviderId,
      table.providerTeamId,
      table.season,
    ),
    index("provider_final_standings_league_rank_idx").on(
      table.leagueId,
      table.season,
      table.finalRank,
    ),
    pgPolicy("provider_final_standings_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const leagueSeasonSettings = pgTable(
  "league_season_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    season: integer("season").notNull(),
    leagueSize: integer("league_size").notNull().default(0),
    matchupPeriodCount: integer("matchup_period_count").notNull().default(1),
    regularSeasonEndScoringPeriod: integer("regular_season_end_scoring_period"),
    playoffStartScoringPeriod: integer("playoff_start_scoring_period"),
    championshipScoringPeriod: integer("championship_scoring_period"),
    playoffTeamCount: integer("playoff_team_count"),
    playoffMatchupPeriodLength: integer("playoff_matchup_period_length"),
    scoringType: text("scoring_type").notNull().default("unknown"),
    scoringSettings: jsonb("scoring_settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lineupSlotCounts: jsonb("lineup_slot_counts")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    acquisitionType: text("acquisition_type"),
    acquisitionBudget: integer("acquisition_budget"),
    acquisitionSettings: jsonb("acquisition_settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    keeperSettings: jsonb("keeper_settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    isKeeperLeague: boolean("is_keeper_league").notNull().default(false),
    isDynastyLeague: boolean("is_dynasty_league").notNull().default(false),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("league_season_settings_identity_unique").on(
      table.leagueId,
      table.provider,
      table.leagueProviderId,
      table.season,
    ),
    index("league_season_settings_league_season_idx").on(
      table.leagueId,
      table.season,
    ),
    pgPolicy("league_season_settings_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
    check(
      "league_season_settings_matchup_period_count_positive",
      sql`${table.matchupPeriodCount} >= 1`,
    ),
    check(
      "league_season_settings_league_size_nonnegative",
      sql`${table.leagueSize} >= 0`,
    ),
    check(
      "league_season_settings_playoff_matchup_period_length_positive",
      sql`${table.playoffMatchupPeriodLength} is null or ${table.playoffMatchupPeriodLength} >= 1`,
    ),
    check(
      "league_season_settings_acquisition_budget_nonnegative",
      sql`${table.acquisitionBudget} is null or ${table.acquisitionBudget} >= 0`,
    ),
  ],
);

export const fantasyPlayers = pgTable(
  "fantasy_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    providerPlayerId: text("provider_player_id").notNull(),
    fullName: text("full_name").notNull(),
    position: text("position").notNull().default("unknown"),
    proTeam: text("pro_team"),
    status: text("status"),
    nflPlayerId: uuid("nfl_player_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fantasy_players_identity_unique").on(
      table.leagueId,
      table.provider,
      table.leagueProviderId,
      table.providerPlayerId,
    ),
    index("fantasy_players_league_name_idx").on(table.leagueId, table.fullName),
    index("fantasy_players_nfl_player_idx").on(table.nflPlayerId),
    pgPolicy("fantasy_players_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
    check(
      "fantasy_players_provider_player_nonempty",
      sql`length(${table.providerPlayerId}) > 0`,
    ),
    check(
      "fantasy_players_full_name_nonempty",
      sql`length(${table.fullName}) > 0`,
    ),
  ],
);

export const fantasyRosterEntries = pgTable(
  "fantasy_roster_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    providerTeamId: text("provider_team_id").notNull(),
    providerPlayerId: text("provider_player_id").notNull(),
    fantasyPlayerId: uuid("fantasy_player_id").references(
      () => fantasyPlayers.id,
      { onDelete: "set null" },
    ),
    season: integer("season").notNull(),
    scoringPeriod: integer("scoring_period").notNull(),
    slot: text("slot").notNull().default("unknown"),
    status: text("status").notNull().default("unknown"),
    points: doublePrecision("points"),
    actualPoints: doublePrecision("actual_points"),
    projectedPoints: doublePrecision("projected_points"),
    started: boolean("started").notNull().default(false),
    isKeeper: boolean("is_keeper").notNull().default(false),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fantasy_roster_entries_identity_unique").on(
      table.leagueId,
      table.provider,
      table.leagueProviderId,
      table.providerTeamId,
      table.season,
      table.scoringPeriod,
      table.providerPlayerId,
    ),
    index("fantasy_roster_entries_team_period_idx").on(
      table.leagueId,
      table.season,
      table.scoringPeriod,
      table.providerTeamId,
    ),
    index("fantasy_roster_entries_player_idx").on(table.fantasyPlayerId),
    pgPolicy("fantasy_roster_entries_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const fantasyDraftPicks = pgTable(
  "fantasy_draft_picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    providerPickId: text("provider_pick_id").notNull(),
    season: integer("season").notNull(),
    round: integer("round").notNull(),
    pickOverall: integer("pick_overall"),
    pickInRound: integer("pick_in_round"),
    providerTeamId: text("provider_team_id").notNull(),
    providerPlayerId: text("provider_player_id"),
    fantasyPlayerId: uuid("fantasy_player_id").references(
      () => fantasyPlayers.id,
      { onDelete: "set null" },
    ),
    isKeeper: boolean("is_keeper").notNull().default(false),
    auctionValue: integer("auction_value"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fantasy_draft_picks_identity_unique").on(
      table.leagueId,
      table.provider,
      table.leagueProviderId,
      table.season,
      table.providerPickId,
    ),
    index("fantasy_draft_picks_league_season_idx").on(
      table.leagueId,
      table.season,
    ),
    index("fantasy_draft_picks_player_idx").on(table.fantasyPlayerId),
    pgPolicy("fantasy_draft_picks_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
    check(
      "fantasy_draft_picks_provider_pick_nonempty",
      sql`length(${table.providerPickId}) > 0`,
    ),
    check("fantasy_draft_picks_round_positive", sql`${table.round} >= 1`),
  ],
);

export const fantasyTransactions = pgTable(
  "fantasy_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    providerTransactionId: text("provider_transaction_id").notNull(),
    season: integer("season").notNull(),
    scoringPeriod: integer("scoring_period"),
    type: text("type").notNull().default("unknown"),
    teamProviderIds: jsonb("team_provider_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    playerProviderIds: jsonb("player_provider_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fantasy_transactions_identity_unique").on(
      table.leagueId,
      table.provider,
      table.leagueProviderId,
      table.providerTransactionId,
      table.season,
    ),
    index("fantasy_transactions_league_occurred_idx").on(
      table.leagueId,
      table.occurredAt,
    ),
    pgPolicy("fantasy_transactions_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export interface HistoricalImportCheckpointCursor {
  completedSeasons?: number[];
  exhaustedBeforeSeason?: number;
  exhaustionReason?: "provider_empty";
  requestedSeasons?: number[];
}

export const historicalImportCheckpoints = pgTable(
  "historical_import_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    providerLeagueId: text("provider_league_id").notNull(),
    startSeason: integer("start_season").notNull(),
    endSeason: integer("end_season").notNull(),
    lastCompletedSeason: integer("last_completed_season"),
    nextSeason: integer("next_season"),
    status: historicalImportStatus("status").notNull().default("running"),
    seasonsTotal: integer("seasons_total").notNull().default(0),
    seasonsCompleted: integer("seasons_completed").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    cursor: jsonb("cursor")
      .$type<HistoricalImportCheckpointCursor>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("historical_import_checkpoints_identity_unique").on(
      table.leagueId,
      table.provider,
      table.providerLeagueId,
    ),
    index("historical_import_checkpoints_league_status_idx").on(
      table.leagueId,
      table.status,
    ),
    pgPolicy("historical_import_checkpoints_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const dataCoverage = pgTable(
  "data_coverage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    providerLeagueId: text("provider_league_id").notNull(),
    season: integer("season").notNull(),
    dataClass: dataCoverageClass("data_class").notNull(),
    capability: dataCoverageCapability("capability").notNull(),
    status: dataCoverageStatus("status").notNull(),
    itemCount: integer("item_count").notNull().default(0),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("data_coverage_identity_unique").on(
      table.leagueId,
      table.provider,
      table.providerLeagueId,
      table.season,
      table.dataClass,
    ),
    index("data_coverage_league_status_idx").on(table.leagueId, table.status),
    pgPolicy("data_coverage_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const dataIntegrityChecks = pgTable(
  "data_integrity_check",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    checkKey: dataIntegrityCheckKey("check_key").notNull(),
    season: integer("season"),
    status: dataIntegrityCheckStatus("status").notNull(),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("data_integrity_check_league_status_idx").on(
      table.leagueId,
      table.status,
      table.createdAt,
    ),
    index("data_integrity_check_league_key_idx").on(
      table.leagueId,
      table.checkKey,
      table.season,
      table.createdAt,
    ),
    pgPolicy("data_integrity_check_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const dataCorrectionAuditLog = pgTable(
  "data_correction_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    action: dataCorrectionAuditAction("action").notNull(),
    integrityCheckId: uuid("integrity_check_id").references(
      () => dataIntegrityChecks.id,
      { onDelete: "set null" },
    ),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    beforeState: jsonb("before_state")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    afterState: jsonb("after_state")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("data_correction_audit_log_league_created_idx").on(
      table.leagueId,
      table.createdAt,
    ),
    pgPolicy("data_correction_audit_log_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const leagueDataEdits = pgTable(
  "league_data_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetKind: leagueDataEditTargetKind("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    field: text("field").notNull(),
    beforeValue: jsonb("before_value").$type<unknown>(),
    afterValue: jsonb("after_value").$type<unknown>(),
    editClass: leagueDataEditClass("edit_class").notNull(),
    scope: text("scope").$type<"all_years" | "this_year_only" | null>(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("league_data_edits_league_created_idx").on(
      table.leagueId,
      table.createdAt,
    ),
    index("league_data_edits_target_idx").on(
      table.leagueId,
      table.targetKind,
      table.targetId,
      table.createdAt,
    ),
    pgPolicy("league_data_edits_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
    check(
      "league_data_edits_scope_valid",
      sql`${table.scope} IS NULL OR ${table.scope} IN ('all_years', 'this_year_only')`,
    ),
  ],
);

export interface LeagueSeasonGroupingConfig {
  format_type?: "traditional" | "best_ball" | string;
  member_count_hint?: number;
  notes?: string;
  roster_format?: unknown;
  scoring_format?: unknown;
}

export const leagueSeasonGroupings = pgTable(
  "league_season_groupings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("era"),
    name: text("name").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    config: jsonb("config")
      .$type<LeagueSeasonGroupingConfig>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: leagueSeasonGroupingStatus("status").notNull().default("proposed"),
    derivedFrom: jsonb("derived_from")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("league_season_groupings_league_status_idx").on(
      table.leagueId,
      table.kind,
      table.status,
      table.ordinal,
    ),
    pgPolicy("league_season_groupings_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const leagueGroupingSeasons = pgTable(
  "league_grouping_seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    groupingId: uuid("grouping_id")
      .notNull()
      .references(() => leagueSeasonGroupings.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
  },
  (table) => [
    uniqueIndex("league_grouping_seasons_grouping_season_unique").on(
      table.leagueId,
      table.groupingId,
      table.season,
    ),
    index("league_grouping_seasons_league_season_idx").on(
      table.leagueId,
      table.season,
    ),
    pgPolicy("league_grouping_seasons_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const leagueCurationCheckpoints = pgTable(
  "league_curation_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    markerEditId: uuid("marker_edit_id").references(() => leagueDataEdits.id, {
      onDelete: "set null",
    }),
    latestEditId: uuid("latest_edit_id").references(() => leagueDataEdits.id, {
      onDelete: "set null",
    }),
    label: text("label"),
    note: text("note"),
    seasons: jsonb("seasons").$type<number[]>().notNull(),
    editIds: jsonb("edit_ids").$type<string[]>().notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    snapshot: jsonb("snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("league_curation_checkpoints_league_created_idx").on(
      table.leagueId,
      table.createdAt,
    ),
    index("league_curation_checkpoints_marker_idx").on(
      table.leagueId,
      table.markerEditId,
    ),
    pgPolicy("league_curation_checkpoints_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const leagueCurationSeasonPushes = pgTable(
  "league_curation_season_pushes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    checkpointId: uuid("checkpoint_id").references(
      () => leagueCurationCheckpoints.id,
      { onDelete: "set null" },
    ),
    markerEditId: uuid("marker_edit_id").references(() => leagueDataEdits.id, {
      onDelete: "set null",
    }),
    latestEditId: uuid("latest_edit_id").references(() => leagueDataEdits.id, {
      onDelete: "set null",
    }),
    season: integer("season").notNull(),
    reason: text("reason"),
    editIds: jsonb("edit_ids").$type<string[]>().notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    snapshot: jsonb("snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("league_curation_season_pushes_league_season_created_idx").on(
      table.leagueId,
      table.season,
      table.createdAt,
    ),
    index("league_curation_season_pushes_checkpoint_idx").on(
      table.leagueId,
      table.checkpointId,
    ),
    pgPolicy("league_curation_season_pushes_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
    check(
      "league_curation_season_pushes_season_valid",
      sql`${table.season} >= 1900 AND ${table.season} <= 2200`,
    ),
  ],
);

export const leagueCurationSeasonStates = pgTable(
  "league_curation_season_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    mode: text("mode").$type<"finalized" | "live">().notNull().default("live"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedByUserId: uuid("finalized_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("league_curation_season_states_unique").on(
      table.leagueId,
      table.season,
    ),
    index("league_curation_season_states_league_mode_idx").on(
      table.leagueId,
      table.mode,
      table.season,
    ),
    pgPolicy("league_curation_season_states_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
    check(
      "league_curation_season_states_mode_valid",
      sql`${table.mode} IN ('live', 'finalized')`,
    ),
    check(
      "league_curation_season_states_season_valid",
      sql`${table.season} >= 1900 AND ${table.season} <= 2200`,
    ),
  ],
);

// ── Statistics, identity resolution, and record book (league-scoped) ───────

export interface PersonOwnerHistoryEntry {
  providerMemberIds: string[];
  ownerNames: string[];
  startSeason: number;
  endSeason: number | null;
}

export const persons = pgTable(
  "person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    canonicalName: text("canonical_name").notNull(),
    ownerHistory: jsonb("owner_history")
      .$type<PersonOwnerHistoryEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("person_league_name_idx").on(table.leagueId, table.canonicalName),
    pgPolicy("person_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const teamSeasons = pgTable(
  "team_season",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    fantasyTeamId: uuid("fantasy_team_id")
      .notNull()
      .references(() => fantasyTeams.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    providerTeamId: text("provider_team_id").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    season: integer("season").notNull(),
    teamName: text("team_name").notNull(),
    division: text("division"),
    ownerMemberIds: jsonb("owner_member_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ownerNames: jsonb("owner_names")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("team_season_provider_identity_unique").on(
      table.leagueId,
      table.provider,
      table.providerTeamId,
      table.season,
    ),
    uniqueIndex("team_season_fantasy_team_unique").on(table.fantasyTeamId),
    index("team_season_league_season_idx").on(table.leagueId, table.season),
    pgPolicy("team_season_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const identityMappings = pgTable(
  "identity_mapping",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    teamSeasonId: uuid("team_season_id")
      .notNull()
      .references(() => teamSeasons.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    providerTeamId: text("provider_team_id").notNull(),
    leagueProviderId: text("league_provider_id").notNull(),
    season: integer("season").notNull(),
    confidence: numeric("confidence", {
      mode: "number",
      precision: 5,
      scale: 4,
    })
      .notNull()
      .default(1),
    method: identityMappingMethod("method").notNull().default("auto"),
    resolvedBy: text("resolved_by").notNull().default("system"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("identity_mapping_team_season_unique").on(table.teamSeasonId),
    uniqueIndex("identity_mapping_provider_identity_unique").on(
      table.leagueId,
      table.provider,
      table.providerTeamId,
      table.season,
    ),
    index("identity_mapping_person_idx").on(table.leagueId, table.personId),
    pgPolicy("identity_mapping_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const identityAuditLog = pgTable(
  "identity_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    action: identityAuditAction("action").notNull(),
    personId: uuid("person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    teamSeasonId: uuid("team_season_id").references(() => teamSeasons.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    beforeState: jsonb("before_state")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    afterState: jsonb("after_state")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("identity_audit_log_league_created_idx").on(
      table.leagueId,
      table.createdAt,
    ),
    pgPolicy("identity_audit_log_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const weeklyStatistics = pgTable(
  "weekly_statistics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    teamSeasonId: uuid("team_season_id")
      .notNull()
      .references(() => teamSeasons.id, { onDelete: "cascade" }),
    opponentPersonId: uuid("opponent_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    matchupId: uuid("matchup_id")
      .notNull()
      .references(() => fantasyMatchups.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    scoringPeriod: integer("scoring_period").notNull(),
    periodStart: integer("period_start"),
    scoringPeriodSpan: integer("scoring_period_span").notNull().default(1),
    pointsFor: numeric("points_for", {
      mode: "number",
      precision: 12,
      scale: 2,
    }).notNull(),
    pointsAgainst: numeric("points_against", {
      mode: "number",
      precision: 12,
      scale: 2,
    }).notNull(),
    result: statisticsResult("result").notNull(),
    margin: numeric("margin", { mode: "number", precision: 12, scale: 2 })
      .notNull()
      .default(0),
    isPlayoff: boolean("is_playoff").notNull().default(false),
    isChampionship: boolean("is_championship").notNull().default(false),
    matchupKind: fantasyMatchupKind("matchup_kind")
      .notNull()
      .default("head_to_head"),
    weeklyRank: integer("weekly_rank").notNull(),
    isTopScorer: boolean("is_top_scorer").notNull().default(false),
    isBottomScorer: boolean("is_bottom_scorer").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("weekly_statistics_identity_unique").on(
      table.leagueId,
      table.matchupId,
      table.personId,
    ),
    index("weekly_statistics_person_period_idx").on(
      table.leagueId,
      table.season,
      table.scoringPeriod,
      table.personId,
    ),
    index("weekly_statistics_matchup_idx").on(table.matchupId),
    pgPolicy("weekly_statistics_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
    check(
      "weekly_statistics_scoring_period_span_positive",
      sql`${table.scoringPeriodSpan} >= 1`,
    ),
  ],
);

export const seasonStatistics = pgTable(
  "season_statistics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    ties: integer("ties").notNull().default(0),
    winPercentage: numeric("win_percentage", {
      mode: "number",
      precision: 8,
      scale: 4,
    })
      .notNull()
      .default(0),
    pointsFor: numeric("points_for", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    pointsAgainst: numeric("points_against", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    pointDifferential: numeric("point_differential", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    avgPointsFor: numeric("avg_points_for", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    avgPointsAgainst: numeric("avg_points_against", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    medianPointsFor: numeric("median_points_for", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    medianPointsAgainst: numeric("median_points_against", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    highestScore: numeric("highest_score", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    lowestScore: numeric("lowest_score", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    scoringStdDev: numeric("scoring_std_dev", {
      mode: "number",
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default(0),
    longestWinStreak: integer("longest_win_streak").notNull().default(0),
    longestLossStreak: integer("longest_loss_streak").notNull().default(0),
    currentStreakType: statisticsResult("current_streak_type"),
    currentStreakLength: integer("current_streak_length").notNull().default(0),
    expectedWins: numeric("expected_wins", {
      mode: "number",
      precision: 10,
      scale: 4,
    })
      .notNull()
      .default(0),
    luck: numeric("luck", { mode: "number", precision: 10, scale: 4 })
      .notNull()
      .default(0),
    allPlayWins: integer("all_play_wins").notNull().default(0),
    allPlayLosses: integer("all_play_losses").notNull().default(0),
    allPlayTies: integer("all_play_ties").notNull().default(0),
    finalRank: integer("final_rank").notNull().default(0),
    playoffSeed: integer("playoff_seed"),
    finalPlacement: text("final_placement").notNull().default("out"),
    divisionWinner: boolean("division_winner").notNull().default(false),
    madePlayoffs: boolean("made_playoffs").notNull().default(false),
    madeChampionship: boolean("made_championship").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("season_statistics_identity_unique").on(
      table.leagueId,
      table.personId,
      table.season,
    ),
    index("season_statistics_league_season_rank_idx").on(
      table.leagueId,
      table.season,
      table.finalRank,
    ),
    pgPolicy("season_statistics_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const headToHeadRecords = pgTable(
  "head_to_head_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    season: integer("season").notNull().default(0),
    personAId: uuid("person_a_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    personBId: uuid("person_b_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    meetings: integer("meetings").notNull().default(0),
    personAWins: integer("person_a_wins").notNull().default(0),
    personBWins: integer("person_b_wins").notNull().default(0),
    ties: integer("ties").notNull().default(0),
    personAPoints: numeric("person_a_points", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    personBPoints: numeric("person_b_points", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    personAHighestScore: numeric("person_a_highest_score", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    personBHighestScore: numeric("person_b_highest_score", {
      mode: "number",
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default(0),
    playoffMeetings: integer("playoff_meetings").notNull().default(0),
    championshipMeetings: integer("championship_meetings").notNull().default(0),
    lastSeason: integer("last_season"),
    lastScoringPeriod: integer("last_scoring_period"),
    currentStreakPersonId: uuid("current_streak_person_id").references(
      () => persons.id,
      { onDelete: "set null" },
    ),
    currentStreakLength: integer("current_streak_length").notNull().default(0),
    longestStreakPersonId: uuid("longest_streak_person_id").references(
      () => persons.id,
      { onDelete: "set null" },
    ),
    longestStreakLength: integer("longest_streak_length").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("head_to_head_record_identity_unique").on(
      table.leagueId,
      table.season,
      table.personAId,
      table.personBId,
    ),
    index("head_to_head_record_person_a_idx").on(
      table.leagueId,
      table.personAId,
    ),
    index("head_to_head_record_person_b_idx").on(
      table.leagueId,
      table.personBId,
    ),
    pgPolicy("head_to_head_record_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const championshipRecords = pgTable(
  "championship_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    championPersonId: uuid("champion_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    runnerUpPersonId: uuid("runner_up_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    thirdPlacePersonId: uuid("third_place_person_id").references(
      () => persons.id,
      { onDelete: "set null" },
    ),
    regularSeasonWinnerPersonId: uuid(
      "regular_season_winner_person_id",
    ).references(() => persons.id, { onDelete: "set null" }),
    championshipScore: numeric("championship_score", {
      mode: "number",
      precision: 12,
      scale: 2,
    }),
    runnerUpScore: numeric("runner_up_score", {
      mode: "number",
      precision: 12,
      scale: 2,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("championship_record_season_unique").on(
      table.leagueId,
      table.season,
    ),
    pgPolicy("championship_record_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const allTimeRecords = pgTable(
  "all_time_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    recordType: text("record_type").notNull(),
    holderPersonId: uuid("holder_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    value: numeric("value", { mode: "number", precision: 14, scale: 4 })
      .notNull()
      .default(0),
    season: integer("season"),
    scoringPeriod: integer("scoring_period"),
    opponentPersonId: uuid("opponent_person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    previousRecordId: uuid("previous_record_id").references(
      (): AnyPgColumn => allTimeRecords.id,
      { onDelete: "set null" },
    ),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    isCurrent: boolean("is_current").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("all_time_record_current_idx").on(
      table.leagueId,
      table.recordType,
      table.isCurrent,
    ),
    pgPolicy("all_time_record_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const recordBookAllTimeStandings = pgTable(
  "record_book_all_time_standing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    seasons: integer("seasons").notNull().default(0),
    games: integer("games").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    ties: integer("ties").notNull().default(0),
    winPercentage: numeric("win_percentage", {
      mode: "number",
      precision: 8,
      scale: 4,
    })
      .notNull()
      .default(0),
    pointsFor: numeric("points_for", {
      mode: "number",
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default(0),
    pointsAgainst: numeric("points_against", {
      mode: "number",
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default(0),
    avgPointsFor: numeric("avg_points_for", {
      mode: "number",
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default(0),
    avgPointsAgainst: numeric("avg_points_against", {
      mode: "number",
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default(0),
    pointDifferential: numeric("point_differential", {
      mode: "number",
      precision: 14,
      scale: 4,
    })
      .notNull()
      .default(0),
    careerLuck: numeric("career_luck", {
      mode: "number",
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default(0),
    championships: integer("championships").notNull().default(0),
    runnerUps: integer("runner_ups").notNull().default(0),
    playoffAppearances: integer("playoff_appearances").notNull().default(0),
    madeChampionships: integer("made_championships").notNull().default(0),
    regularSeasonTitles: integer("regular_season_titles").notNull().default(0),
    bestSeason: jsonb("best_season")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    worstSeason: jsonb("worst_season")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("record_book_all_time_standing_person_unique").on(
      table.leagueId,
      table.personId,
    ),
    index("record_book_all_time_standing_rank_idx").on(
      table.leagueId,
      table.rank,
    ),
    pgPolicy("record_book_all_time_standing_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const recordBookMilestones = pgTable(
  "record_book_milestone",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    milestoneKey: text("milestone_key").notNull(),
    milestoneType: text("milestone_type").notNull(),
    status: text("status").notNull().default("available"),
    personId: uuid("person_id").references(() => persons.id, {
      onDelete: "cascade",
    }),
    providerPlayerId: text("provider_player_id"),
    season: integer("season"),
    label: text("label").notNull(),
    value: numeric("value", { mode: "number", precision: 14, scale: 4 })
      .notNull()
      .default(0),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("record_book_milestone_key_unique").on(
      table.leagueId,
      table.milestoneKey,
    ),
    index("record_book_milestone_type_idx").on(
      table.leagueId,
      table.milestoneType,
    ),
    index("record_book_milestone_person_idx").on(
      table.leagueId,
      table.personId,
    ),
    pgPolicy("record_book_milestone_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const statsCalculations = pgTable(
  "stats_calculation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    calculationType: statsCalculationType("calculation_type").notNull(),
    status: statsCalculationStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    rowsProcessed: integer("rows_processed").notNull().default(0),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("stats_calculation_league_started_idx").on(
      table.leagueId,
      table.startedAt,
    ),
    pgPolicy("stats_calculation_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

// ── General NFL stats substrate (cross-league; background reference data) ─

export const nflPlayers = pgTable(
  "nfl_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    sourcePlayerId: text("source_player_id").notNull(),
    fullName: text("full_name").notNull(),
    position: text("position").notNull(),
    team: text("team").notNull(),
    fantasyProviderIds: jsonb("fantasy_provider_ids")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("nfl_players_source_player_unique").on(
      table.source,
      table.sourcePlayerId,
    ),
    index("nfl_players_name_idx").on(table.fullName),
    index("nfl_players_team_position_idx").on(table.team, table.position),
    check("nfl_players_source_nonempty", sql`length(${table.source}) > 0`),
    check(
      "nfl_players_source_player_id_nonempty",
      sql`length(${table.sourcePlayerId}) > 0`,
    ),
    check("nfl_players_full_name_nonempty", sql`length(${table.fullName}) > 0`),
    check("nfl_players_position_nonempty", sql`length(${table.position}) > 0`),
    check("nfl_players_team_nonempty", sql`length(${table.team}) > 0`),
  ],
);

export const nflSchedule = pgTable(
  "nfl_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    sourceGameId: text("source_game_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    gameTime: timestamp("game_time", { withTimezone: true }).notNull(),
    awayTeam: text("away_team").notNull(),
    homeTeam: text("home_team").notNull(),
    status: text("status")
      .$type<"scheduled" | "in_progress" | "final">()
      .notNull(),
    awayScore: integer("away_score"),
    homeScore: integer("home_score"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("nfl_schedule_source_game_unique").on(
      table.source,
      table.sourceGameId,
    ),
    index("nfl_schedule_season_week_idx").on(table.season, table.week),
    index("nfl_schedule_team_week_idx").on(
      table.season,
      table.week,
      table.homeTeam,
      table.awayTeam,
    ),
    check("nfl_schedule_source_nonempty", sql`length(${table.source}) > 0`),
    check(
      "nfl_schedule_source_game_id_nonempty",
      sql`length(${table.sourceGameId}) > 0`,
    ),
    check(
      "nfl_schedule_season_valid",
      sql`${table.season} >= 1900 AND ${table.season} <= 2200`,
    ),
    check("nfl_schedule_week_positive", sql`${table.week} >= 1`),
    check(
      "nfl_schedule_away_team_nonempty",
      sql`length(${table.awayTeam}) > 0`,
    ),
    check(
      "nfl_schedule_home_team_nonempty",
      sql`length(${table.homeTeam}) > 0`,
    ),
    check(
      "nfl_schedule_distinct_teams",
      sql`${table.awayTeam} <> ${table.homeTeam}`,
    ),
    check(
      "nfl_schedule_status_valid",
      sql`${table.status} IN ('scheduled', 'in_progress', 'final')`,
    ),
    check(
      "nfl_schedule_scores_valid",
      sql`(${table.awayScore} IS NULL OR ${table.awayScore} >= 0) AND (${table.homeScore} IS NULL OR ${table.homeScore} >= 0)`,
    ),
  ],
);

export const nflTeamStats = pgTable(
  "nfl_team_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    sourceGameId: text("source_game_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    team: text("team").notNull(),
    opponentTeam: text("opponent_team").notNull(),
    isHome: boolean("is_home").notNull(),
    pointsFor: integer("points_for").notNull(),
    pointsAgainst: integer("points_against").notNull(),
    passingYards: integer("passing_yards").notNull().default(0),
    passingTouchdowns: integer("passing_touchdowns").notNull().default(0),
    rushingYards: integer("rushing_yards").notNull().default(0),
    rushingTouchdowns: integer("rushing_touchdowns").notNull().default(0),
    receivingYards: integer("receiving_yards").notNull().default(0),
    receivingTouchdowns: integer("receiving_touchdowns").notNull().default(0),
    turnovers: integer("turnovers").notNull().default(0),
    sacks: integer("sacks").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("nfl_team_stats_source_team_week_unique").on(
      table.source,
      table.season,
      table.week,
      table.team,
    ),
    index("nfl_team_stats_game_idx").on(table.source, table.sourceGameId),
    index("nfl_team_stats_team_season_idx").on(table.team, table.season),
    check("nfl_team_stats_source_nonempty", sql`length(${table.source}) > 0`),
    check(
      "nfl_team_stats_source_game_id_nonempty",
      sql`length(${table.sourceGameId}) > 0`,
    ),
    check(
      "nfl_team_stats_season_valid",
      sql`${table.season} >= 1900 AND ${table.season} <= 2200`,
    ),
    check("nfl_team_stats_week_positive", sql`${table.week} >= 1`),
    check("nfl_team_stats_team_nonempty", sql`length(${table.team}) > 0`),
    check(
      "nfl_team_stats_opponent_nonempty",
      sql`length(${table.opponentTeam}) > 0`,
    ),
    check(
      "nfl_team_stats_distinct_teams",
      sql`${table.team} <> ${table.opponentTeam}`,
    ),
    check(
      "nfl_team_stats_nonnegative",
      sql`${table.pointsFor} >= 0 AND ${table.pointsAgainst} >= 0 AND ${table.passingTouchdowns} >= 0 AND ${table.rushingTouchdowns} >= 0 AND ${table.receivingTouchdowns} >= 0 AND ${table.turnovers} >= 0 AND ${table.sacks} >= 0`,
    ),
  ],
);

export const nflPlayerWeekStats = pgTable(
  "nfl_player_week_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => nflPlayers.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourcePlayerId: text("source_player_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    team: text("team").notNull(),
    opponentTeam: text("opponent_team").notNull(),
    sourceGameId: text("source_game_id").notNull(),
    passingYards: integer("passing_yards").notNull().default(0),
    passingTouchdowns: integer("passing_touchdowns").notNull().default(0),
    interceptions: integer("interceptions").notNull().default(0),
    rushingYards: integer("rushing_yards").notNull().default(0),
    rushingTouchdowns: integer("rushing_touchdowns").notNull().default(0),
    receptions: integer("receptions").notNull().default(0),
    targets: integer("targets").notNull().default(0),
    receivingYards: integer("receiving_yards").notNull().default(0),
    receivingTouchdowns: integer("receiving_touchdowns").notNull().default(0),
    fantasyPoints: numeric("fantasy_points", {
      mode: "number",
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("nfl_player_week_stats_source_week_unique").on(
      table.source,
      table.season,
      table.week,
      table.sourcePlayerId,
    ),
    index("nfl_player_week_stats_player_idx").on(table.playerId),
    index("nfl_player_week_stats_team_week_idx").on(
      table.team,
      table.season,
      table.week,
    ),
    index("nfl_player_week_stats_game_idx").on(
      table.source,
      table.sourceGameId,
    ),
    check(
      "nfl_player_week_stats_source_nonempty",
      sql`length(${table.source}) > 0`,
    ),
    check(
      "nfl_player_week_stats_source_player_id_nonempty",
      sql`length(${table.sourcePlayerId}) > 0`,
    ),
    check(
      "nfl_player_week_stats_source_game_id_nonempty",
      sql`length(${table.sourceGameId}) > 0`,
    ),
    check(
      "nfl_player_week_stats_season_valid",
      sql`${table.season} >= 1900 AND ${table.season} <= 2200`,
    ),
    check("nfl_player_week_stats_week_positive", sql`${table.week} >= 1`),
    check(
      "nfl_player_week_stats_team_nonempty",
      sql`length(${table.team}) > 0`,
    ),
    check(
      "nfl_player_week_stats_opponent_nonempty",
      sql`length(${table.opponentTeam}) > 0`,
    ),
    check(
      "nfl_player_week_stats_distinct_teams",
      sql`${table.team} <> ${table.opponentTeam}`,
    ),
    check(
      "nfl_player_week_stats_nonnegative",
      sql`${table.passingTouchdowns} >= 0 AND ${table.interceptions} >= 0 AND ${table.rushingTouchdowns} >= 0 AND ${table.receptions} >= 0 AND ${table.targets} >= 0 AND ${table.receivingTouchdowns} >= 0`,
    ),
  ],
);

// ── Paper betting central catalog (cross-league; no restrictive RLS) ──────

export const bettingEvents = pgTable(
  "betting_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    sport: bettingSport("sport").notNull().default("nfl"),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    status: bettingEventStatus("status").notNull().default("scheduled"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    lastUpdated: timestamp("last_updated", { withTimezone: true })
      .notNull()
      .defaultNow(),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("betting_event_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    index("betting_event_sport_start_idx").on(table.sport, table.startTime),
    index("betting_event_status_start_idx").on(table.status, table.startTime),
  ],
);

export const bettingMarkets = pgTable(
  "betting_market",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => bettingEvents.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerMarketId: text("provider_market_id").notNull(),
    type: bettingMarketType("type").notNull(),
    subject: text("subject").notNull().default("game"),
    propType: text("prop_type"),
    period: bettingMarketPeriod("period").notNull().default("full_game"),
    status: bettingMarketStatus("status").notNull().default("open"),
    lastUpdated: timestamp("last_updated", { withTimezone: true })
      .notNull()
      .defaultNow(),
    contentHash: text("content_hash").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("betting_market_provider_market_unique").on(
      table.provider,
      table.providerMarketId,
    ),
    index("betting_market_event_status_idx").on(table.eventId, table.status),
    index("betting_market_type_status_idx").on(table.type, table.status),
  ],
);

export const oddsSnapshots = pgTable(
  "odds_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => bettingMarkets.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    provider: text("provider").notNull(),
    line: numeric("line", { mode: "number", precision: 10, scale: 2 }),
    overPrice: integer("over_price"),
    underPrice: integer("under_price"),
    homePrice: integer("home_price"),
    awayPrice: integer("away_price"),
    outcomePrice: integer("outcome_price"),
    sourcePayloadHash: text("source_payload_hash").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("odds_snapshot_market_captured_idx").on(
      table.marketId,
      table.capturedAt,
    ),
    index("odds_snapshot_hash_idx").on(table.marketId, table.sourcePayloadHash),
  ],
);

// ── Central arena standings (cross-league; derived from ledgers) ──────────

export const arenaSeasons = pgTable(
  "arena_season",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("arena_season_window_unique").on(table.startsAt, table.endsAt),
    index("arena_season_ends_idx").on(table.endsAt),
  ],
);

export const arenaStandings = pgTable(
  "arena_standing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => arenaSeasons.id, { onDelete: "cascade" }),
    kind: arenaStandingKind("kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    leagueId: uuid("league_id").references(() => leagues.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    rank: integer("rank").notNull(),
    previousRank: integer("previous_rank"),
    rankDelta: integer("rank_delta").notNull().default(0),
    netPnlCents: integer("net_pnl_cents").notNull(),
    roiBps: integer("roi_bps").notNull(),
    currentBalanceCents: integer("current_balance_cents").notNull(),
    totalStakeCents: integer("total_stake_cents").notNull(),
    totalReturnCents: integer("total_return_cents").notNull(),
    settledSlipCount: integer("settled_slip_count").notNull(),
    wonSlipCount: integer("won_slip_count").notNull(),
    pushVoidSlipCount: integer("push_void_slip_count").notNull(),
    weeksPlayed: integer("weeks_played").notNull(),
    weeksSurvived: integer("weeks_survived").notNull(),
    winRateBps: integer("win_rate_bps").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("arena_standing_subject_unique").on(
      table.seasonId,
      table.kind,
      table.subjectId,
    ),
    index("arena_standing_leaderboard_idx").on(
      table.seasonId,
      table.kind,
      table.rank,
    ),
    index("arena_standing_league_idx").on(table.leagueId),
    index("arena_standing_user_idx").on(table.userId),
  ],
);

// ── Paper betting bankroll state (league-scoped; RLS enforced) ────────────

export const bankrollWeeks = pgTable(
  "bankroll_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    weekEnd: timestamp("week_end", { withTimezone: true }).notNull(),
    openingBalanceCents: integer("opening_balance_cents").notNull(),
    floorCents: integer("floor_cents").notNull(),
    closingBalanceCents: integer("closing_balance_cents"),
    closed: boolean("closed").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("bankroll_weeks_user_week_unique").on(
      table.leagueId,
      table.userId,
      table.weekStart,
    ),
    index("bankroll_weeks_league_week_idx").on(table.leagueId, table.weekStart),
    index("bankroll_weeks_user_closed_idx").on(
      table.leagueId,
      table.userId,
      table.closed,
    ),
    pgPolicy("bankroll_weeks_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const betSlips = pgTable(
  "bet_slips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bankrollWeekId: uuid("bankroll_week_id")
      .notNull()
      .references(() => bankrollWeeks.id, { onDelete: "cascade" }),
    kind: betSlipKind("kind").notNull(),
    stakeCents: integer("stake_cents").notNull(),
    potentialPayoutCents: integer("potential_payout_cents").notNull(),
    combinedDecimalOdds: numeric("combined_decimal_odds", {
      mode: "number",
      precision: 14,
      scale: 6,
    }).notNull(),
    status: betSlipStatus("status").notNull().default("pending"),
    placedAt: timestamp("placed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("bet_slips_idempotency_unique").on(
      table.leagueId,
      table.userId,
      table.idempotencyKey,
    ),
    index("bet_slips_user_week_idx").on(
      table.leagueId,
      table.userId,
      table.bankrollWeekId,
    ),
    index("bet_slips_status_idx").on(table.leagueId, table.status),
    pgPolicy("bet_slips_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const bankrollLedger = pgTable(
  "bankroll_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bankrollWeekId: uuid("bankroll_week_id")
      .notNull()
      .references(() => bankrollWeeks.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    entryType: bankrollLedgerEntryType("entry_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    runningBalanceCents: integer("running_balance_cents").notNull(),
    refSlipId: uuid("ref_slip_id").references(() => betSlips.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("bankroll_ledger_week_seq_unique").on(
      table.leagueId,
      table.userId,
      table.bankrollWeekId,
      table.seq,
    ),
    index("bankroll_ledger_user_week_latest_idx").on(
      table.leagueId,
      table.userId,
      table.bankrollWeekId,
      table.seq,
    ),
    index("bankroll_ledger_ref_slip_idx").on(table.refSlipId),
    pgPolicy("bankroll_ledger_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const betLegs = pgTable(
  "bet_legs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    slipId: uuid("slip_id")
      .notNull()
      .references(() => betSlips.id, { onDelete: "cascade" }),
    marketId: uuid("market_id")
      .notNull()
      .references(() => bettingMarkets.id),
    oddsSnapshotId: uuid("odds_snapshot_id")
      .notNull()
      .references(() => oddsSnapshots.id),
    selection: betLegSelection("selection").notNull(),
    lockedLine: numeric("locked_line", {
      mode: "number",
      precision: 10,
      scale: 2,
    }),
    lockedAmericanOdds: integer("locked_american_odds").notNull(),
    lockedDecimalOdds: numeric("locked_decimal_odds", {
      mode: "number",
      precision: 14,
      scale: 6,
    }).notNull(),
    status: betLegStatus("status").notNull().default("pending"),
    resultDetail: text("result_detail"),
    ...timestamps,
  },
  (table) => [
    index("bet_legs_slip_idx").on(table.leagueId, table.slipId),
    index("bet_legs_market_status_idx").on(
      table.marketId,
      table.status,
      table.leagueId,
    ),
    index("bet_legs_snapshot_idx").on(table.oddsSnapshotId),
    pgPolicy("bet_legs_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const betSettlements = pgTable(
  "bet_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    slipId: uuid("slip_id")
      .notNull()
      .references(() => betSlips.id, { onDelete: "cascade" }),
    resultsProvider: text("results_provider").notNull(),
    resultsPayloadHash: text("results_payload_hash").notNull(),
    gradedAt: timestamp("graded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    outcome: betSettlementOutcome("outcome").notNull(),
    payoutCents: integer("payout_cents").notNull(),
    notes: text("notes").notNull().default(""),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("bet_settlements_slip_unique").on(table.slipId),
    index("bet_settlements_league_graded_idx").on(
      table.leagueId,
      table.gradedAt,
    ),
    pgPolicy("bet_settlements_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

// ── Content and AI blogger state ──────────────────────────────────────────

export const contentItems = pgTable(
  "content_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL means central/shared content. Non-null rows are league-scoped and
    // must be read under the matching RLS context.
    leagueId: uuid("league_id").references(() => leagues.id, {
      onDelete: "cascade",
    }),
    kind: contentItemKind("kind").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull().default(""),
    source: text("source"),
    sourceUrl: text("source_url"),
    authorPersona: aiPersona("author_persona"),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: contentItemStatus("status").notNull().default("published"),
    supersedesContentItemId: uuid("supersedes_content_item_id").references(
      (): AnyPgColumn => contentItems.id,
      { onDelete: "set null" },
    ),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dedupKey: text("dedup_key").notNull(),
    contentHash: text("content_hash").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("content_item_scope_dedup_unique").on(
      table.leagueId,
      table.kind,
      table.dedupKey,
    ),
    // PostgreSQL treats NULLs as distinct in normal unique indexes, so central
    // rows need their own partial dedup guard.
    uniqueIndex("content_item_central_scope_dedup_unique")
      .on(table.kind, table.dedupKey)
      .where(sql`${table.leagueId} is null`),
    index("content_item_league_published_idx").on(
      table.leagueId,
      table.publishedAt,
    ),
    index("content_item_league_status_published_idx").on(
      table.leagueId,
      table.status,
      table.publishedAt,
    ),
    index("content_item_central_published_idx").on(
      table.kind,
      table.publishedAt,
    ),
    index("content_item_central_status_published_idx").on(
      table.kind,
      table.status,
      table.publishedAt,
    ),
    pgPolicy("content_item_scope_policy", {
      for: "all",
      using: sql`${table.leagueId} is null or ${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} is null or ${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const leagueFeedReferences = pgTable(
  "league_feed_reference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    // Points at a central content_item row. The league-specific row stores
    // relevance and framing without copying or mutating the shared story.
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    relevanceScore: doublePrecision("relevance_score").notNull().default(1),
    reason: text("reason").notNull().default(""),
    framingTitle: text("framing_title"),
    framingSummary: text("framing_summary"),
    matchedEntities: jsonb("matched_entities")
      .$type<LeagueFeedMatchedEntity[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("league_feed_reference_identity_unique").on(
      table.leagueId,
      table.contentItemId,
    ),
    index("league_feed_reference_league_score_idx").on(
      table.leagueId,
      table.relevanceScore,
      table.createdAt,
    ),
    pgPolicy("league_feed_reference_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

// ── PWA web push subscriptions (league-scoped; RLS enforced) ──────────────

export const pushSubscriptions = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    endpointHash: text("endpoint_hash").notNull(),
    p256dh: text("p256dh").notNull(),
    authSecret: text("auth_secret").notNull(),
    expirationTime: timestamp("expiration_time", { withTimezone: true }),
    userAgent: text("user_agent"),
    status: pushSubscriptionStatus("status").notNull().default("active"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("push_subscription_member_endpoint_unique").on(
      table.leagueId,
      table.userId,
      table.endpointHash,
    ),
    index("push_subscription_league_active_idx").on(
      table.leagueId,
      table.status,
      table.userId,
    ),
    index("push_subscription_endpoint_hash_idx").on(table.endpointHash),
    pgPolicy("push_subscription_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const pushNotificationPreferences = pgTable(
  "push_notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: pushNotificationType("type").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("push_notification_preferences_user_type_unique").on(
      table.leagueId,
      table.userId,
      table.type,
    ),
    index("push_notification_preferences_league_type_idx").on(
      table.leagueId,
      table.type,
      table.enabled,
    ),
    pgPolicy("push_notification_preferences_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const aiPersonaCards = pgTable(
  "ai_persona_card",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    persona: aiPersona("persona").notNull(),
    name: text("name").notNull(),
    beat: text("beat").notNull(),
    pointOfView: text("point_of_view").notNull(),
    performsWhen: jsonb("performs_when")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    purpose: text("purpose").notNull(),
    tone: text("tone").notNull(),
    promptTemplate: text("prompt_template").notNull(),
    toneProfile: jsonb("tone_profile").$type<unknown>().notNull(),
    toneVersion: integer("tone_version").notNull().default(1),
    toneUpdatedBy: text("tone_updated_by"),
    toneUpdatedAt: timestamp("tone_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    enabled: boolean("enabled").notNull().default(true),
    minWords: integer("min_words").notNull().default(80),
    maxWords: integer("max_words").notNull().default(220),
    triggerConfig: jsonb("trigger_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("ai_persona_card_league_persona_unique").on(
      table.leagueId,
      table.persona,
    ),
    index("ai_persona_card_league_enabled_idx").on(
      table.leagueId,
      table.enabled,
    ),
    pgPolicy("ai_persona_card_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const aiGenerationRuns = pgTable(
  "ai_generation_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    persona: aiPersona("persona").notNull(),
    triggerKey: text("trigger_key").notNull(),
    status: aiGenerationStatus("status").notNull().default("running"),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, {
      onDelete: "set null",
    }),
    skipReason: text("skip_reason"),
    promptPrefixHash: text("prompt_prefix_hash"),
    promptTemplateId: text("prompt_template_id"),
    promptTemplateVersion: integer("prompt_template_version"),
    toneVersion: integer("tone_version"),
    modelProviderKey: text("model_provider_key"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("ai_generation_run_idempotency_unique").on(
      table.leagueId,
      table.persona,
      table.triggerKey,
    ),
    index("ai_generation_run_league_status_idx").on(
      table.leagueId,
      table.status,
    ),
    pgPolicy("ai_generation_run_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const aiMemory = pgTable(
  "ai_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, {
      onDelete: "cascade",
    }),
    source: aiMemorySource("source").notNull(),
    textContent: text("text_content").notNull(),
    embedding: vectorColumn("embedding").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingDimensions: integer("embedding_dimensions").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_memory_league_source_idx").on(table.leagueId, table.source),
    index("ai_memory_content_item_idx").on(table.contentItemId),
    pgPolicy("ai_memory_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

// ── Auth plane (Better Auth; central, no restrictive RLS) ──────────────────

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Organization plugin: the league this session is acting in; guards
    // derive the RLS context from it (spec 01 §Auth).
    activeOrganizationId: uuid("active_organization_id").references(
      () => leagues.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.token),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // providerId is the auth provider ("credential", "google"); accountId is
    // the user's id at that provider.
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [index("accounts_user_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: leagueRole("role").notNull().default("member"),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("members_organization_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    index("members_user_idx").on(table.userId),
  ],
);

export const invitationStatus = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "rejected",
  "canceled",
]);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: leagueRole("role").notNull().default("member"),
    status: invitationStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("invitations_organization_idx").on(table.organizationId)],
);

// ── Entitlements (auth plane; central, no restrictive RLS) ─────────────────

export const leagueEntitlements = pgTable(
  "league_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    tier: leagueEntitlementTier("tier").notNull().default("free"),
    status: entitlementStatus("status").notNull().default("active"),
    source: entitlementSource("source").notNull().default("granted"),
    capsOverride: jsonb("caps_override")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("league_entitlements_league_unique").on(table.leagueId),
    index("league_entitlements_status_idx").on(table.status, table.expiresAt),
  ],
);

export const userEntitlements = pgTable(
  "user_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: userEntitlementTier("tier").notNull().default("individual"),
    status: entitlementStatus("status").notNull().default("active"),
    source: entitlementSource("source").notNull().default("granted"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_entitlements_user_unique").on(table.userId),
    index("user_entitlements_status_idx").on(table.status, table.expiresAt),
  ],
);

export const entitlementEvents = pgTable(
  "entitlement_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueEntitlementId: uuid("league_entitlement_id").references(
      () => leagueEntitlements.id,
      { onDelete: "set null" },
    ),
    userEntitlementId: uuid("user_entitlement_id").references(
      () => userEntitlements.id,
      { onDelete: "set null" },
    ),
    leagueId: uuid("league_id").references(() => leagues.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    action: entitlementEventAction("action").notNull(),
    source: entitlementSource("source"),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    beforeState: jsonb("before_state")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    afterState: jsonb("after_state")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("entitlement_events_league_created_idx").on(
      table.leagueId,
      table.createdAt,
    ),
    index("entitlement_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("entitlement_events_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    check(
      "entitlement_events_single_scope_check",
      sql`(
        (${table.leagueId} is not null and ${table.userId} is null and ${table.userEntitlementId} is null)
        or (${table.userId} is not null and ${table.leagueId} is null and ${table.leagueEntitlementId} is null)
      )`,
    ),
  ],
);

// ── AI instigation and lightweight lore lifecycle (league-scoped) ─────────

export const instigations = pgTable(
  "instigations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    persona: aiPersona("persona").notNull(),
    kind: instigationKind("kind").notNull(),
    status: instigationStatus("status").notNull().default("open"),
    dedupKey: text("dedup_key").notNull(),
    promptText: text("prompt_text").notNull(),
    options: jsonb("options")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    groundingRefs: jsonb("grounding_refs")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, {
      onDelete: "set null",
    }),
    resolution: jsonb("resolution")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("instigations_dedup_unique").on(table.leagueId, table.dedupKey),
    index("instigations_league_status_idx").on(
      table.leagueId,
      table.status,
      table.createdAt,
    ),
    pgPolicy("instigations_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const polls = pgTable(
  "polls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    instigationId: uuid("instigation_id")
      .notNull()
      .references(() => instigations.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    options: jsonb("options")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: pollStatus("status").notNull().default("open"),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    winningOptionIdx: integer("winning_option_idx"),
    result: jsonb("result")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("polls_instigation_unique").on(
      table.leagueId,
      table.instigationId,
    ),
    index("polls_league_status_close_idx").on(
      table.leagueId,
      table.status,
      table.closesAt,
    ),
    pgPolicy("polls_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    optionIdx: integer("option_idx").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("poll_votes_member_unique").on(
      table.leagueId,
      table.pollId,
      table.memberId,
    ),
    index("poll_votes_poll_idx").on(table.leagueId, table.pollId),
    pgPolicy("poll_votes_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const loreClaims = pgTable(
  "lore_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    kind: loreClaimKind("kind").notNull(),
    status: loreClaimStatus("status").notNull(),
    verification: loreClaimVerification("verification")
      .notNull()
      .default("n_a"),
    origin: loreClaimOrigin("origin").notNull(),
    authorMemberId: uuid("author_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    authorPersona: aiPersona("author_persona"),
    title: text("title").notNull(),
    statement: text("statement").notNull(),
    body: text("body").notNull(),
    branchOf: uuid("branch_of").references((): AnyPgColumn => loreClaims.id, {
      onDelete: "set null",
    }),
    relation: loreClaimRelation("relation").notNull().default("root"),
    threadRootId: uuid("thread_root_id").references(
      (): AnyPgColumn => loreClaims.id,
      { onDelete: "set null" },
    ),
    evidenceRefs: jsonb("evidence_refs")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sourceInstigationId: uuid("source_instigation_id").references(
      () => instigations.id,
      { onDelete: "set null" },
    ),
    sourcePollId: uuid("source_poll_id").references(() => polls.id, {
      onDelete: "set null",
    }),
    voteOpensAt: timestamp("vote_opens_at", { withTimezone: true }),
    voteClosesAt: timestamp("vote_closes_at", { withTimezone: true }),
    ratifiedAt: timestamp("ratified_at", { withTimezone: true }),
    ratifiedBy: loreClaimRatifiedBy("ratified_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lore_claims_source_poll_unique").on(
      table.leagueId,
      table.sourcePollId,
    ),
    index("lore_claims_league_status_idx").on(
      table.leagueId,
      table.status,
      table.createdAt,
    ),
    index("lore_claims_branch_idx").on(table.leagueId, table.branchOf),
    index("lore_claims_thread_idx").on(table.leagueId, table.threadRootId),
    index("lore_claims_vote_close_idx").on(
      table.leagueId,
      table.status,
      table.voteClosesAt,
    ),
    index("lore_claims_source_instigation_idx").on(
      table.leagueId,
      table.sourceInstigationId,
    ),
    pgPolicy("lore_claims_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const loreSubjects = pgTable(
  "lore_subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => loreClaims.id, { onDelete: "cascade" }),
    subjectType: loreSubjectType("subject_type").notNull(),
    personId: uuid("person_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    personAId: uuid("person_a_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    personBId: uuid("person_b_id").references(() => persons.id, {
      onDelete: "set null",
    }),
    headToHeadRecordId: uuid("head_to_head_record_id").references(
      () => headToHeadRecords.id,
      { onDelete: "set null" },
    ),
    allTimeRecordId: uuid("all_time_record_id").references(
      () => allTimeRecords.id,
      { onDelete: "set null" },
    ),
    season: integer("season"),
    week: integer("week"),
    recordType: text("record_type"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("lore_subjects_claim_idx").on(table.leagueId, table.claimId),
    index("lore_subjects_person_idx").on(table.leagueId, table.personId),
    index("lore_subjects_rivalry_idx").on(
      table.leagueId,
      table.personAId,
      table.personBId,
    ),
    pgPolicy("lore_subjects_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const loreVerifications = pgTable(
  "lore_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => loreClaims.id, { onDelete: "cascade" }),
    result: loreVerificationResult("result").notNull(),
    assertedValue: text("asserted_value").notNull(),
    actualValue: text("actual_value"),
    weeklyStatisticId: uuid("weekly_statistic_id").references(
      () => weeklyStatistics.id,
      { onDelete: "set null" },
    ),
    seasonStatisticId: uuid("season_statistic_id").references(
      () => seasonStatistics.id,
      { onDelete: "set null" },
    ),
    allTimeRecordId: uuid("all_time_record_id").references(
      () => allTimeRecords.id,
      { onDelete: "set null" },
    ),
    matchedRefs: jsonb("matched_refs")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("lore_verifications_claim_unique").on(
      table.leagueId,
      table.claimId,
    ),
    index("lore_verifications_result_idx").on(table.leagueId, table.result),
    pgPolicy("lore_verifications_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const loreVotes = pgTable(
  "lore_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => loreClaims.id, { onDelete: "cascade" }),
    voterMemberId: uuid("voter_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    choice: loreVoteChoice("choice").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lore_votes_member_unique").on(
      table.leagueId,
      table.claimId,
      table.voterMemberId,
    ),
    index("lore_votes_claim_idx").on(table.leagueId, table.claimId),
    pgPolicy("lore_votes_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const loreEvents = pgTable(
  "lore_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => loreClaims.id, { onDelete: "cascade" }),
    kind: loreEventKind("kind").notNull(),
    actorMemberId: uuid("actor_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    beforeState: jsonb("before_state")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    afterState: jsonb("after_state")
      .$type<Record<string, unknown> | null>()
      .default(sql`NULL`),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("lore_events_claim_idx").on(table.leagueId, table.claimId),
    index("lore_events_league_created_idx").on(table.leagueId, table.createdAt),
    pgPolicy("lore_events_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

// ── Onboarding credential plane (central; no restrictive RLS) ─────────────

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    subjectProviderId: text("subject_provider_id").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    status: onboardingCredentialStatus("status").notNull().default("connected"),
    connectionFlow: onboardingConnectionFlow("connection_flow").notNull(),
    lastValidatedAt: timestamp("last_validated_at", {
      withTimezone: true,
    }).notNull(),
    invalidAt: timestamp("invalid_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("provider_credentials_user_provider_subject_unique").on(
      table.userId,
      table.provider,
      table.subjectProviderId,
    ),
    index("provider_credentials_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
  ],
);

export const onboardingBrowserSessions = pgTable(
  "onboarding_browser_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    status: onboardingBrowserSessionStatus("status")
      .notNull()
      .default("awaiting_login"),
    liveViewUrl: text("live_view_url").notNull(),
    credentialId: uuid("credential_id").references(
      () => providerCredentials.id,
      {
        onDelete: "set null",
      },
    ),
    errorCode: text("error_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("onboarding_browser_sessions_user_status_idx").on(
      table.userId,
      table.status,
    ),
  ],
);

export const onboardingDiscoveredLeagues = pgTable(
  "onboarding_discovered_leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialId: uuid("credential_id")
      .notNull()
      .references(() => providerCredentials.id, { onDelete: "cascade" }),
    provider: fantasyProvider("provider").notNull(),
    providerLeagueId: text("provider_league_id").notNull(),
    season: integer("season").notNull(),
    sport: fantasySport("sport").notNull().default("unknown"),
    name: text("name").notNull(),
    providerTeamId: text("provider_team_id"),
    teamName: text("team_name"),
    size: integer("size"),
    lastDiscoveredAt: timestamp("last_discovered_at", {
      withTimezone: true,
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("onboarding_discovered_leagues_user_identity_unique").on(
      table.userId,
      table.provider,
      table.providerLeagueId,
      table.season,
    ),
    index("onboarding_discovered_leagues_credential_idx").on(
      table.credentialId,
    ),
  ],
);

export const leagueInvites = pgTable(
  "league_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    inviterUserId: uuid("inviter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fantasyMemberId: uuid("fantasy_member_id").references(
      () => fantasyMembers.id,
      { onDelete: "set null" },
    ),
    provider: fantasyProvider("provider").notNull(),
    providerMemberId: text("provider_member_id"),
    providerTeamIds: jsonb("provider_team_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    inviteeDisplayName: text("invitee_display_name").notNull(),
    teamNames: jsonb("team_names")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    channel: leagueInviteChannel("channel").notNull(),
    targetHash: text("target_hash").notNull(),
    targetHint: text("target_hint"),
    tokenHash: text("token_hash").notNull(),
    status: leagueInviteStatus("status").notNull().default("pending"),
    acceptedUserId: uuid("accepted_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("league_invites_token_hash_unique").on(table.tokenHash),
    uniqueIndex("league_invites_target_unique").on(
      table.leagueId,
      table.provider,
      table.providerMemberId,
      table.channel,
      table.targetHash,
    ),
    index("league_invites_league_idx").on(table.leagueId),
    index("league_invites_member_idx").on(
      table.leagueId,
      table.provider,
      table.providerMemberId,
    ),
    pgPolicy("league_invites_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export const leagueMemberIdentityClaims = pgTable(
  "league_member_identity_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fantasyMemberId: uuid("fantasy_member_id").references(
      () => fantasyMembers.id,
      { onDelete: "set null" },
    ),
    sourceInviteId: uuid("source_invite_id").references(
      () => leagueInvites.id,
      { onDelete: "set null" },
    ),
    provider: fantasyProvider("provider").notNull(),
    providerMemberId: text("provider_member_id").notNull(),
    providerTeamIds: jsonb("provider_team_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("league_member_identity_user_provider_unique").on(
      table.leagueId,
      table.userId,
      table.provider,
    ),
    uniqueIndex("league_member_identity_provider_member_unique").on(
      table.leagueId,
      table.provider,
      table.providerMemberId,
    ),
    index("league_member_identity_league_idx").on(table.leagueId),
    index("league_member_identity_user_idx").on(table.userId),
    pgPolicy("league_member_identity_claims_isolation", {
      for: "all",
      using: sql`${table.leagueId} = current_league_id()`,
      withCheck: sql`${table.leagueId} = current_league_id()`,
    }),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
export type FantasyTeam = typeof fantasyTeams.$inferSelect;
export type NewFantasyTeam = typeof fantasyTeams.$inferInsert;
export type FantasyMember = typeof fantasyMembers.$inferSelect;
export type NewFantasyMember = typeof fantasyMembers.$inferInsert;
export type FantasyMatchup = typeof fantasyMatchups.$inferSelect;
export type NewFantasyMatchup = typeof fantasyMatchups.$inferInsert;
export type ProviderFinalStanding = typeof providerFinalStandings.$inferSelect;
export type NewProviderFinalStanding =
  typeof providerFinalStandings.$inferInsert;
export type FantasyPlayer = typeof fantasyPlayers.$inferSelect;
export type NewFantasyPlayer = typeof fantasyPlayers.$inferInsert;
export type FantasyRosterEntry = typeof fantasyRosterEntries.$inferSelect;
export type NewFantasyRosterEntry = typeof fantasyRosterEntries.$inferInsert;
export type FantasyDraftPick = typeof fantasyDraftPicks.$inferSelect;
export type NewFantasyDraftPick = typeof fantasyDraftPicks.$inferInsert;
export type FantasyTransaction = typeof fantasyTransactions.$inferSelect;
export type NewFantasyTransaction = typeof fantasyTransactions.$inferInsert;
export type HistoricalImportCheckpoint =
  typeof historicalImportCheckpoints.$inferSelect;
export type NewHistoricalImportCheckpoint =
  typeof historicalImportCheckpoints.$inferInsert;
export type DataCoverage = typeof dataCoverage.$inferSelect;
export type NewDataCoverage = typeof dataCoverage.$inferInsert;
export type DataIntegrityCheck = typeof dataIntegrityChecks.$inferSelect;
export type NewDataIntegrityCheck = typeof dataIntegrityChecks.$inferInsert;
export type DataCorrectionAuditLog = typeof dataCorrectionAuditLog.$inferSelect;
export type NewDataCorrectionAuditLog =
  typeof dataCorrectionAuditLog.$inferInsert;
export type BettingEvent = typeof bettingEvents.$inferSelect;
export type NewBettingEvent = typeof bettingEvents.$inferInsert;
export type BettingMarket = typeof bettingMarkets.$inferSelect;
export type NewBettingMarket = typeof bettingMarkets.$inferInsert;
export type OddsSnapshot = typeof oddsSnapshots.$inferSelect;
export type NewOddsSnapshot = typeof oddsSnapshots.$inferInsert;
export type ArenaSeason = typeof arenaSeasons.$inferSelect;
export type NewArenaSeason = typeof arenaSeasons.$inferInsert;
export type ArenaStanding = typeof arenaStandings.$inferSelect;
export type NewArenaStanding = typeof arenaStandings.$inferInsert;
export type BankrollWeek = typeof bankrollWeeks.$inferSelect;
export type NewBankrollWeek = typeof bankrollWeeks.$inferInsert;
export type BetSlip = typeof betSlips.$inferSelect;
export type NewBetSlip = typeof betSlips.$inferInsert;
export type BankrollLedgerEntry = typeof bankrollLedger.$inferSelect;
export type NewBankrollLedgerEntry = typeof bankrollLedger.$inferInsert;
export type BetLeg = typeof betLegs.$inferSelect;
export type NewBetLeg = typeof betLegs.$inferInsert;
export type BetSettlement = typeof betSettlements.$inferSelect;
export type NewBetSettlement = typeof betSettlements.$inferInsert;
export type ContentItem = typeof contentItems.$inferSelect;
export type NewContentItem = typeof contentItems.$inferInsert;
export type LeagueFeedReference = typeof leagueFeedReferences.$inferSelect;
export type NewLeagueFeedReference = typeof leagueFeedReferences.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type PushNotificationPreference =
  typeof pushNotificationPreferences.$inferSelect;
export type NewPushNotificationPreference =
  typeof pushNotificationPreferences.$inferInsert;
export type AiPersonaCard = typeof aiPersonaCards.$inferSelect;
export type NewAiPersonaCard = typeof aiPersonaCards.$inferInsert;
export type AiGenerationRun = typeof aiGenerationRuns.$inferSelect;
export type NewAiGenerationRun = typeof aiGenerationRuns.$inferInsert;
export type AiMemory = typeof aiMemory.$inferSelect;
export type NewAiMemory = typeof aiMemory.$inferInsert;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type LeagueEntitlement = typeof leagueEntitlements.$inferSelect;
export type NewLeagueEntitlement = typeof leagueEntitlements.$inferInsert;
export type UserEntitlement = typeof userEntitlements.$inferSelect;
export type NewUserEntitlement = typeof userEntitlements.$inferInsert;
export type EntitlementEvent = typeof entitlementEvents.$inferSelect;
export type NewEntitlementEvent = typeof entitlementEvents.$inferInsert;
export type Instigation = typeof instigations.$inferSelect;
export type NewInstigation = typeof instigations.$inferInsert;
export type Poll = typeof polls.$inferSelect;
export type NewPoll = typeof polls.$inferInsert;
export type PollVote = typeof pollVotes.$inferSelect;
export type NewPollVote = typeof pollVotes.$inferInsert;
export type LoreClaim = typeof loreClaims.$inferSelect;
export type NewLoreClaim = typeof loreClaims.$inferInsert;
export type LoreSubject = typeof loreSubjects.$inferSelect;
export type NewLoreSubject = typeof loreSubjects.$inferInsert;
export type LoreVerification = typeof loreVerifications.$inferSelect;
export type NewLoreVerification = typeof loreVerifications.$inferInsert;
export type LoreVote = typeof loreVotes.$inferSelect;
export type NewLoreVote = typeof loreVotes.$inferInsert;
export type LoreEvent = typeof loreEvents.$inferSelect;
export type NewLoreEvent = typeof loreEvents.$inferInsert;
export type ProviderCredential = typeof providerCredentials.$inferSelect;
export type NewProviderCredential = typeof providerCredentials.$inferInsert;
export type OnboardingBrowserSession =
  typeof onboardingBrowserSessions.$inferSelect;
export type NewOnboardingBrowserSession =
  typeof onboardingBrowserSessions.$inferInsert;
export type OnboardingDiscoveredLeague =
  typeof onboardingDiscoveredLeagues.$inferSelect;
export type NewOnboardingDiscoveredLeague =
  typeof onboardingDiscoveredLeagues.$inferInsert;
export type LeagueInvite = typeof leagueInvites.$inferSelect;
export type NewLeagueInvite = typeof leagueInvites.$inferInsert;
export type LeagueMemberIdentityClaim =
  typeof leagueMemberIdentityClaims.$inferSelect;
export type NewLeagueMemberIdentityClaim =
  typeof leagueMemberIdentityClaims.$inferInsert;
