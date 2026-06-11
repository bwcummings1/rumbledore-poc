import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Baseline tables (spec 02 §6): users, leagues, league_members.
 * - `users` is central (cross-league by design — no restrictive RLS).
 * - `leagues` is the tenant root; `league_members` is league-scoped and will
 *   get RLS on `league_id` in the follow-up RLS migration.
 */

export const fantasyProvider = pgEnum("fantasy_provider", [
  "espn",
  "sleeper",
  "yahoo",
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
    ...timestamps,
  },
  (table) => [
    uniqueIndex("leagues_provider_league_unique").on(
      table.provider,
      table.providerLeagueId,
    ),
  ],
);

export const leagueMembers = pgTable(
  "league_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: leagueRole("role").notNull().default("member"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("league_members_league_user_unique").on(
      table.leagueId,
      table.userId,
    ),
    index("league_members_user_idx").on(table.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type NewLeagueMember = typeof leagueMembers.$inferInsert;
