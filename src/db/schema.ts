import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { FANTASY_PROVIDER_IDS } from "../providers/ids";

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

// Per-league roles (spec 01 §Auth). `super_admin` is global, not a league role.
export const leagueRole = pgEnum("league_role", [
  "commissioner",
  "league_admin",
  "data_steward",
  "member",
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
    logo: text("logo"),
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
    homeTeamProviderId: text("home_team_provider_id").notNull(),
    awayTeamProviderId: text("away_team_provider_id").notNull(),
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
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
