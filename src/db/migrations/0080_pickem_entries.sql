-- T-013 / UIX-113: inter-league Pick 'em entries and picks.
--
-- Replaces the bankroll/stake/parlay model (specs 08/15 rewrite, tagged for
-- recovery at `bankroll-engine-v1`). Scoring is "absolute denominator":
-- accuracy is graded against an entry's maximum POSSIBLE picks, so an
-- unsubmitted pick is mathematically identical to a wrong one and league size
-- normalises away. See PROJECT_CONTEXT.md 3.3.
--
-- `pick_weeks.roster_size` is SNAPSHOTTED when the week opens so a league
-- cannot shrink its own denominator by cutting inactive members mid-week.
--
-- The competitor is modelled as an ENTRY carrying its own roster size rather
-- than as "a paid league", so a future free/AMOE entrant needs no schema
-- change (PROJECT_CONTEXT.md 9, parked question P1).
--
-- A push (result landing exactly on the line) grades as 'void': it counts
-- toward neither the numerator nor that user's denominator. See DD-2.
--
-- Both tables are league-scoped, so each declares a current_league_id() policy
-- AND has FORCE ROW LEVEL SECURITY hand-added below -- drizzle-kit does not
-- emit FORCE, and on a deployment where the app connects as the table owner
-- only FORCE binds the owner (see migration 0002).

CREATE TYPE "public"."pick_status" AS ENUM('pending', 'correct', 'incorrect', 'void');--> statement-breakpoint

CREATE TABLE "pick_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"roster_size" integer NOT NULL,
	"max_picks_per_user" integer DEFAULT 10 NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pick_weeks_roster_size_positive" CHECK ("pick_weeks"."roster_size" > 0),
	CONSTRAINT "pick_weeks_max_picks_positive" CHECK ("pick_weeks"."max_picks_per_user" > 0)
);--> statement-breakpoint

CREATE TABLE "picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"pick_week_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"odds_snapshot_id" uuid NOT NULL,
	"selection" "bet_leg_selection" NOT NULL,
	"locked_line" numeric(10, 2),
	"status" "pick_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"graded_at" timestamp with time zone,
	"result_detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "pick_weeks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "picks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "pick_weeks" ADD CONSTRAINT "pick_weeks_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_pick_week_id_pick_weeks_id_fk" FOREIGN KEY ("pick_week_id") REFERENCES "public"."pick_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_market_id_betting_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."betting_market"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_odds_snapshot_id_odds_snapshot_id_fk" FOREIGN KEY ("odds_snapshot_id") REFERENCES "public"."odds_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "pick_weeks_league_season_week_unique" ON "pick_weeks" USING btree ("league_id","season","week");--> statement-breakpoint
CREATE UNIQUE INDEX "picks_idempotency_unique" ON "picks" USING btree ("league_id","user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "picks_user_market_unique" ON "picks" USING btree ("pick_week_id","user_id","market_id");--> statement-breakpoint
CREATE INDEX "picks_week_status_idx" ON "picks" USING btree ("pick_week_id","status");--> statement-breakpoint
CREATE INDEX "picks_league_user_idx" ON "picks" USING btree ("league_id","user_id");--> statement-breakpoint

CREATE POLICY "pick_weeks_isolation" ON "pick_weeks" AS PERMISSIVE FOR ALL TO public USING ("pick_weeks"."league_id" = current_league_id()) WITH CHECK ("pick_weeks"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "picks_isolation" ON "picks" AS PERMISSIVE FOR ALL TO public USING ("picks"."league_id" = current_league_id()) WITH CHECK ("picks"."league_id" = current_league_id());--> statement-breakpoint

-- drizzle-kit does not emit FORCE; hand-added per the repo convention.
ALTER TABLE "pick_weeks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "picks" FORCE ROW LEVEL SECURITY;
