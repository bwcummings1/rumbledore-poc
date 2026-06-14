CREATE TYPE "public"."fantasy_matchup_kind" AS ENUM('head_to_head', 'median', 'all_play');--> statement-breakpoint
DROP INDEX "weekly_statistics_identity_unique";--> statement-breakpoint
ALTER TABLE "fantasy_matchups" ADD COLUMN "kind" "fantasy_matchup_kind" DEFAULT 'head_to_head' NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" ADD COLUMN "is_keeper" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD COLUMN "division" text;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "scoring_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "keeper_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "is_keeper_league" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "is_dynasty_league" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "scoring_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_final_standings" ADD COLUMN "division" text;--> statement-breakpoint
ALTER TABLE "provider_final_standings" ADD COLUMN "division_rank" integer;--> statement-breakpoint
ALTER TABLE "provider_final_standings" ADD COLUMN "division_winner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "season_statistics" ADD COLUMN "playoff_seed" integer;--> statement-breakpoint
ALTER TABLE "team_season" ADD COLUMN "division" text;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD COLUMN "matchup_kind" "fantasy_matchup_kind" DEFAULT 'head_to_head' NOT NULL;--> statement-breakpoint
CREATE INDEX "weekly_statistics_person_period_idx" ON "weekly_statistics" USING btree ("league_id","season","scoring_period","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_statistics_identity_unique" ON "weekly_statistics" USING btree ("league_id","matchup_id","person_id");