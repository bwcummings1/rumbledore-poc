ALTER TYPE "public"."data_integrity_check_key" ADD VALUE IF NOT EXISTS 'stat_breakdown_coverage';
--> statement-breakpoint
CREATE TABLE "fantasy_player_week_stat_breakdowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"league_provider_id" text NOT NULL,
	"provider_team_id" text NOT NULL,
	"provider_player_id" text NOT NULL,
	"fantasy_player_id" uuid,
	"season" integer NOT NULL,
	"scoring_period" integer NOT NULL,
	"stat_source" text DEFAULT 'actual' NOT NULL,
	"provider_stat_id" integer NOT NULL,
	"stat_category" text NOT NULL,
	"stat_key" text NOT NULL,
	"stat_value" double precision NOT NULL,
	"fantasy_points" double precision NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fantasy_player_week_stat_breakdowns_provider_player_nonempty" CHECK (length("fantasy_player_week_stat_breakdowns"."provider_player_id") > 0),
	CONSTRAINT "fantasy_player_week_stat_breakdowns_stat_source_valid" CHECK ("fantasy_player_week_stat_breakdowns"."stat_source" in ('actual', 'projected')),
	CONSTRAINT "fantasy_player_week_stat_breakdowns_provider_stat_nonnegative" CHECK ("fantasy_player_week_stat_breakdowns"."provider_stat_id" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fantasy_player_week_stat_breakdowns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fantasy_player_week_stat_breakdowns" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fantasy_player_week_stat_breakdowns" ADD CONSTRAINT "fantasy_player_week_stat_breakdowns_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fantasy_player_week_stat_breakdowns" ADD CONSTRAINT "fantasy_player_week_stat_breakdowns_fantasy_player_id_fantasy_players_id_fk" FOREIGN KEY ("fantasy_player_id") REFERENCES "public"."fantasy_players"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_player_week_stat_breakdowns_identity_unique" ON "fantasy_player_week_stat_breakdowns" USING btree ("league_id","provider","league_provider_id","provider_team_id","season","scoring_period","provider_player_id","stat_source","provider_stat_id");
--> statement-breakpoint
CREATE INDEX "fantasy_player_week_stat_breakdowns_team_period_idx" ON "fantasy_player_week_stat_breakdowns" USING btree ("league_id","season","scoring_period","provider_team_id");
--> statement-breakpoint
CREATE INDEX "fantasy_player_week_stat_breakdowns_player_idx" ON "fantasy_player_week_stat_breakdowns" USING btree ("fantasy_player_id");
--> statement-breakpoint
CREATE INDEX "fantasy_player_week_stat_breakdowns_stat_idx" ON "fantasy_player_week_stat_breakdowns" USING btree ("league_id","provider_stat_id");
--> statement-breakpoint
CREATE POLICY "fantasy_player_week_stat_breakdowns_isolation" ON "fantasy_player_week_stat_breakdowns" AS PERMISSIVE FOR ALL TO public USING ("fantasy_player_week_stat_breakdowns"."league_id" = current_league_id()) WITH CHECK ("fantasy_player_week_stat_breakdowns"."league_id" = current_league_id());
