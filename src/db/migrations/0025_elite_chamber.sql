CREATE TYPE "public"."data_coverage_capability" AS ENUM('full', 'partial', 'none');--> statement-breakpoint
CREATE TYPE "public"."data_coverage_class" AS ENUM('league', 'teams', 'members', 'rosters', 'matchups', 'final_standings', 'transactions', 'history', 'divisions', 'keeper_dynasty', 'scoring_detail');--> statement-breakpoint
CREATE TYPE "public"."data_coverage_status" AS ENUM('complete', 'partial', 'stale', 'unavailable', 'error');--> statement-breakpoint
CREATE TABLE "data_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_league_id" text NOT NULL,
	"season" integer NOT NULL,
	"data_class" "data_coverage_class" NOT NULL,
	"capability" "data_coverage_capability" NOT NULL,
	"status" "data_coverage_status" NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"error_message" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_coverage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_coverage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fantasy_roster_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"league_provider_id" text NOT NULL,
	"provider_team_id" text NOT NULL,
	"provider_player_id" text NOT NULL,
	"season" integer NOT NULL,
	"scoring_period" integer NOT NULL,
	"slot" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"points" double precision,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fantasy_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"league_provider_id" text NOT NULL,
	"provider_transaction_id" text NOT NULL,
	"season" integer NOT NULL,
	"type" text DEFAULT 'unknown' NOT NULL,
	"team_provider_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"player_provider_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fantasy_transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_coverage" ADD CONSTRAINT "data_coverage_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" ADD CONSTRAINT "fantasy_roster_entries_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_transactions" ADD CONSTRAINT "fantasy_transactions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_coverage_identity_unique" ON "data_coverage" USING btree ("league_id","provider","provider_league_id","season","data_class");--> statement-breakpoint
CREATE INDEX "data_coverage_league_status_idx" ON "data_coverage" USING btree ("league_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_roster_entries_identity_unique" ON "fantasy_roster_entries" USING btree ("league_id","provider","league_provider_id","provider_team_id","season","scoring_period","provider_player_id");--> statement-breakpoint
CREATE INDEX "fantasy_roster_entries_team_period_idx" ON "fantasy_roster_entries" USING btree ("league_id","season","scoring_period","provider_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_transactions_identity_unique" ON "fantasy_transactions" USING btree ("league_id","provider","league_provider_id","provider_transaction_id","season");--> statement-breakpoint
CREATE INDEX "fantasy_transactions_league_occurred_idx" ON "fantasy_transactions" USING btree ("league_id","occurred_at");--> statement-breakpoint
CREATE POLICY "data_coverage_isolation" ON "data_coverage" AS PERMISSIVE FOR ALL TO public USING ("data_coverage"."league_id" = current_league_id()) WITH CHECK ("data_coverage"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "fantasy_roster_entries_isolation" ON "fantasy_roster_entries" AS PERMISSIVE FOR ALL TO public USING ("fantasy_roster_entries"."league_id" = current_league_id()) WITH CHECK ("fantasy_roster_entries"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "fantasy_transactions_isolation" ON "fantasy_transactions" AS PERMISSIVE FOR ALL TO public USING ("fantasy_transactions"."league_id" = current_league_id()) WITH CHECK ("fantasy_transactions"."league_id" = current_league_id());
