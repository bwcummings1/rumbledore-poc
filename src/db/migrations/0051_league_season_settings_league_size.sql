ALTER TABLE "league_season_settings" ADD COLUMN IF NOT EXISTS "league_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "league_season_settings" AS settings
SET "league_size" = COALESCE(team_counts.team_count, settings."league_size", 0)
FROM (
	SELECT "league_id", "provider", "league_provider_id", "season", COUNT(*)::integer AS team_count
	FROM "fantasy_teams"
	GROUP BY "league_id", "provider", "league_provider_id", "season"
) AS team_counts
WHERE settings."league_id" = team_counts."league_id"
	AND settings."provider" = team_counts."provider"
	AND settings."league_provider_id" = team_counts."league_provider_id"
	AND settings."season" = team_counts."season";--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'league_season_settings_league_size_nonnegative'
	) THEN
		ALTER TABLE "league_season_settings" ADD CONSTRAINT "league_season_settings_league_size_nonnegative" CHECK ("league_season_settings"."league_size" >= 0);
	END IF;
END $$;
