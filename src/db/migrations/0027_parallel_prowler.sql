CREATE TABLE "league_season_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"league_provider_id" text NOT NULL,
	"season" integer NOT NULL,
	"regular_season_end_scoring_period" integer,
	"playoff_start_scoring_period" integer,
	"championship_scoring_period" integer,
	"playoff_team_count" integer,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_season_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_season_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD CONSTRAINT "league_season_settings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_season_settings_identity_unique" ON "league_season_settings" USING btree ("league_id","provider","league_provider_id","season");--> statement-breakpoint
CREATE INDEX "league_season_settings_league_season_idx" ON "league_season_settings" USING btree ("league_id","season");--> statement-breakpoint
CREATE POLICY "league_season_settings_isolation" ON "league_season_settings" AS PERMISSIVE FOR ALL TO public USING ("league_season_settings"."league_id" = current_league_id()) WITH CHECK ("league_season_settings"."league_id" = current_league_id());
