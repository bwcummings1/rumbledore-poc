ALTER TABLE "league_season_settings" ADD COLUMN "playoff_matchup_period_length" integer;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "league_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "scoring_type" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "lineup_slot_counts" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "acquisition_type" text;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "acquisition_budget" integer;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "acquisition_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "league_season_settings"
SET "scoring_type" = COALESCE(NULLIF("scoring_settings"->>'scoringType', ''), 'unknown')
WHERE "scoring_type" = 'unknown';--> statement-breakpoint
UPDATE "league_season_settings" AS settings
SET "league_size" = COALESCE(team_counts.team_count, 0)
FROM (
	SELECT "league_id", "provider", "league_provider_id", "season", COUNT(*)::integer AS team_count
	FROM "fantasy_teams"
	GROUP BY "league_id", "provider", "league_provider_id", "season"
) AS team_counts
WHERE settings."league_id" = team_counts."league_id"
	AND settings."provider" = team_counts."provider"
	AND settings."league_provider_id" = team_counts."league_provider_id"
	AND settings."season" = team_counts."season";--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD CONSTRAINT "league_season_settings_playoff_matchup_period_length_positive" CHECK ("league_season_settings"."playoff_matchup_period_length" IS NULL OR "league_season_settings"."playoff_matchup_period_length" >= 1);--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD CONSTRAINT "league_season_settings_league_size_nonnegative" CHECK ("league_season_settings"."league_size" >= 0);--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD CONSTRAINT "league_season_settings_acquisition_budget_nonnegative" CHECK ("league_season_settings"."acquisition_budget" IS NULL OR "league_season_settings"."acquisition_budget" >= 0);
