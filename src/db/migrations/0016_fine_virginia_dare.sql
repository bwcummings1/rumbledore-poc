CREATE TYPE "public"."bet_leg_selection" AS ENUM('home', 'away', 'over', 'under', 'player_over', 'player_under', 'outcome');--> statement-breakpoint
CREATE TYPE "public"."bet_leg_status" AS ENUM('pending', 'won', 'lost', 'push', 'void');--> statement-breakpoint
CREATE TYPE "public"."bet_slip_kind" AS ENUM('single', 'parlay');--> statement-breakpoint
CREATE TYPE "public"."bet_slip_status" AS ENUM('pending', 'won', 'lost', 'push', 'void', 'partial_void');--> statement-breakpoint
CREATE TABLE "bet_legs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"slip_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"odds_snapshot_id" uuid NOT NULL,
	"selection" "bet_leg_selection" NOT NULL,
	"locked_line" numeric(10, 2),
	"locked_american_odds" integer NOT NULL,
	"locked_decimal_odds" numeric(14, 6) NOT NULL,
	"status" "bet_leg_status" DEFAULT 'pending' NOT NULL,
	"result_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bet_legs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bet_legs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bet_slips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"bankroll_week_id" uuid NOT NULL,
	"kind" "bet_slip_kind" NOT NULL,
	"stake_cents" integer NOT NULL,
	"potential_payout_cents" integer NOT NULL,
	"combined_decimal_odds" numeric(14, 6) NOT NULL,
	"status" "bet_slip_status" DEFAULT 'pending' NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bet_slips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bet_slips" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_slip_id_bet_slips_id_fk" FOREIGN KEY ("slip_id") REFERENCES "public"."bet_slips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_market_id_betting_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."betting_market"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_legs" ADD CONSTRAINT "bet_legs_odds_snapshot_id_odds_snapshot_id_fk" FOREIGN KEY ("odds_snapshot_id") REFERENCES "public"."odds_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_slips" ADD CONSTRAINT "bet_slips_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_slips" ADD CONSTRAINT "bet_slips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_slips" ADD CONSTRAINT "bet_slips_bankroll_week_id_bankroll_weeks_id_fk" FOREIGN KEY ("bankroll_week_id") REFERENCES "public"."bankroll_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bet_legs_slip_idx" ON "bet_legs" USING btree ("league_id","slip_id");--> statement-breakpoint
CREATE INDEX "bet_legs_market_status_idx" ON "bet_legs" USING btree ("market_id","status","league_id");--> statement-breakpoint
CREATE INDEX "bet_legs_snapshot_idx" ON "bet_legs" USING btree ("odds_snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bet_slips_idempotency_unique" ON "bet_slips" USING btree ("league_id","user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "bet_slips_user_week_idx" ON "bet_slips" USING btree ("league_id","user_id","bankroll_week_id");--> statement-breakpoint
CREATE INDEX "bet_slips_status_idx" ON "bet_slips" USING btree ("league_id","status");--> statement-breakpoint
ALTER TABLE "bankroll_ledger" ADD CONSTRAINT "bankroll_ledger_ref_slip_id_bet_slips_id_fk" FOREIGN KEY ("ref_slip_id") REFERENCES "public"."bet_slips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "bet_legs_isolation" ON "bet_legs" AS PERMISSIVE FOR ALL TO public USING ("bet_legs"."league_id" = current_league_id()) WITH CHECK ("bet_legs"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "bet_slips_isolation" ON "bet_slips" AS PERMISSIVE FOR ALL TO public USING ("bet_slips"."league_id" = current_league_id()) WITH CHECK ("bet_slips"."league_id" = current_league_id());
