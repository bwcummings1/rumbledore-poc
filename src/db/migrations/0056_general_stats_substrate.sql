CREATE TABLE "nfl_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_player_id" text NOT NULL,
	"full_name" text NOT NULL,
	"position" text NOT NULL,
	"team" text NOT NULL,
	"fantasy_provider_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfl_players_source_nonempty" CHECK (length("nfl_players"."source") > 0),
	CONSTRAINT "nfl_players_source_player_id_nonempty" CHECK (length("nfl_players"."source_player_id") > 0),
	CONSTRAINT "nfl_players_full_name_nonempty" CHECK (length("nfl_players"."full_name") > 0),
	CONSTRAINT "nfl_players_position_nonempty" CHECK (length("nfl_players"."position") > 0),
	CONSTRAINT "nfl_players_team_nonempty" CHECK (length("nfl_players"."team") > 0)
);
--> statement-breakpoint
CREATE TABLE "nfl_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_game_id" text NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"game_time" timestamp with time zone NOT NULL,
	"away_team" text NOT NULL,
	"home_team" text NOT NULL,
	"status" text NOT NULL,
	"away_score" integer,
	"home_score" integer,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfl_schedule_source_nonempty" CHECK (length("nfl_schedule"."source") > 0),
	CONSTRAINT "nfl_schedule_source_game_id_nonempty" CHECK (length("nfl_schedule"."source_game_id") > 0),
	CONSTRAINT "nfl_schedule_season_valid" CHECK ("nfl_schedule"."season" >= 1900 AND "nfl_schedule"."season" <= 2200),
	CONSTRAINT "nfl_schedule_week_positive" CHECK ("nfl_schedule"."week" >= 1),
	CONSTRAINT "nfl_schedule_away_team_nonempty" CHECK (length("nfl_schedule"."away_team") > 0),
	CONSTRAINT "nfl_schedule_home_team_nonempty" CHECK (length("nfl_schedule"."home_team") > 0),
	CONSTRAINT "nfl_schedule_distinct_teams" CHECK ("nfl_schedule"."away_team" <> "nfl_schedule"."home_team"),
	CONSTRAINT "nfl_schedule_status_valid" CHECK ("nfl_schedule"."status" IN ('scheduled', 'in_progress', 'final')),
	CONSTRAINT "nfl_schedule_scores_valid" CHECK (("nfl_schedule"."away_score" IS NULL OR "nfl_schedule"."away_score" >= 0) AND ("nfl_schedule"."home_score" IS NULL OR "nfl_schedule"."home_score" >= 0))
);
--> statement-breakpoint
CREATE TABLE "nfl_team_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_game_id" text NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"team" text NOT NULL,
	"opponent_team" text NOT NULL,
	"is_home" boolean NOT NULL,
	"points_for" integer NOT NULL,
	"points_against" integer NOT NULL,
	"passing_yards" integer DEFAULT 0 NOT NULL,
	"passing_touchdowns" integer DEFAULT 0 NOT NULL,
	"rushing_yards" integer DEFAULT 0 NOT NULL,
	"rushing_touchdowns" integer DEFAULT 0 NOT NULL,
	"receiving_yards" integer DEFAULT 0 NOT NULL,
	"receiving_touchdowns" integer DEFAULT 0 NOT NULL,
	"turnovers" integer DEFAULT 0 NOT NULL,
	"sacks" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfl_team_stats_source_nonempty" CHECK (length("nfl_team_stats"."source") > 0),
	CONSTRAINT "nfl_team_stats_source_game_id_nonempty" CHECK (length("nfl_team_stats"."source_game_id") > 0),
	CONSTRAINT "nfl_team_stats_season_valid" CHECK ("nfl_team_stats"."season" >= 1900 AND "nfl_team_stats"."season" <= 2200),
	CONSTRAINT "nfl_team_stats_week_positive" CHECK ("nfl_team_stats"."week" >= 1),
	CONSTRAINT "nfl_team_stats_team_nonempty" CHECK (length("nfl_team_stats"."team") > 0),
	CONSTRAINT "nfl_team_stats_opponent_nonempty" CHECK (length("nfl_team_stats"."opponent_team") > 0),
	CONSTRAINT "nfl_team_stats_distinct_teams" CHECK ("nfl_team_stats"."team" <> "nfl_team_stats"."opponent_team"),
	CONSTRAINT "nfl_team_stats_nonnegative" CHECK ("nfl_team_stats"."points_for" >= 0 AND "nfl_team_stats"."points_against" >= 0 AND "nfl_team_stats"."passing_touchdowns" >= 0 AND "nfl_team_stats"."rushing_touchdowns" >= 0 AND "nfl_team_stats"."receiving_touchdowns" >= 0 AND "nfl_team_stats"."turnovers" >= 0 AND "nfl_team_stats"."sacks" >= 0)
);
--> statement-breakpoint
CREATE TABLE "nfl_player_week_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_player_id" text NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"team" text NOT NULL,
	"opponent_team" text NOT NULL,
	"source_game_id" text NOT NULL,
	"passing_yards" integer DEFAULT 0 NOT NULL,
	"passing_touchdowns" integer DEFAULT 0 NOT NULL,
	"interceptions" integer DEFAULT 0 NOT NULL,
	"rushing_yards" integer DEFAULT 0 NOT NULL,
	"rushing_touchdowns" integer DEFAULT 0 NOT NULL,
	"receptions" integer DEFAULT 0 NOT NULL,
	"targets" integer DEFAULT 0 NOT NULL,
	"receiving_yards" integer DEFAULT 0 NOT NULL,
	"receiving_touchdowns" integer DEFAULT 0 NOT NULL,
	"fantasy_points" numeric(10, 2) DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfl_player_week_stats_source_nonempty" CHECK (length("nfl_player_week_stats"."source") > 0),
	CONSTRAINT "nfl_player_week_stats_source_player_id_nonempty" CHECK (length("nfl_player_week_stats"."source_player_id") > 0),
	CONSTRAINT "nfl_player_week_stats_source_game_id_nonempty" CHECK (length("nfl_player_week_stats"."source_game_id") > 0),
	CONSTRAINT "nfl_player_week_stats_season_valid" CHECK ("nfl_player_week_stats"."season" >= 1900 AND "nfl_player_week_stats"."season" <= 2200),
	CONSTRAINT "nfl_player_week_stats_week_positive" CHECK ("nfl_player_week_stats"."week" >= 1),
	CONSTRAINT "nfl_player_week_stats_team_nonempty" CHECK (length("nfl_player_week_stats"."team") > 0),
	CONSTRAINT "nfl_player_week_stats_opponent_nonempty" CHECK (length("nfl_player_week_stats"."opponent_team") > 0),
	CONSTRAINT "nfl_player_week_stats_distinct_teams" CHECK ("nfl_player_week_stats"."team" <> "nfl_player_week_stats"."opponent_team"),
	CONSTRAINT "nfl_player_week_stats_nonnegative" CHECK ("nfl_player_week_stats"."passing_touchdowns" >= 0 AND "nfl_player_week_stats"."interceptions" >= 0 AND "nfl_player_week_stats"."rushing_touchdowns" >= 0 AND "nfl_player_week_stats"."receptions" >= 0 AND "nfl_player_week_stats"."targets" >= 0 AND "nfl_player_week_stats"."receiving_touchdowns" >= 0)
);
--> statement-breakpoint
ALTER TABLE "nfl_player_week_stats" ADD CONSTRAINT "nfl_player_week_stats_player_id_nfl_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."nfl_players"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "nfl_players_source_player_unique" ON "nfl_players" USING btree ("source","source_player_id");
--> statement-breakpoint
CREATE INDEX "nfl_players_name_idx" ON "nfl_players" USING btree ("full_name");
--> statement-breakpoint
CREATE INDEX "nfl_players_team_position_idx" ON "nfl_players" USING btree ("team","position");
--> statement-breakpoint
CREATE UNIQUE INDEX "nfl_schedule_source_game_unique" ON "nfl_schedule" USING btree ("source","source_game_id");
--> statement-breakpoint
CREATE INDEX "nfl_schedule_season_week_idx" ON "nfl_schedule" USING btree ("season","week");
--> statement-breakpoint
CREATE INDEX "nfl_schedule_team_week_idx" ON "nfl_schedule" USING btree ("season","week","home_team","away_team");
--> statement-breakpoint
CREATE UNIQUE INDEX "nfl_team_stats_source_team_week_unique" ON "nfl_team_stats" USING btree ("source","season","week","team");
--> statement-breakpoint
CREATE INDEX "nfl_team_stats_game_idx" ON "nfl_team_stats" USING btree ("source","source_game_id");
--> statement-breakpoint
CREATE INDEX "nfl_team_stats_team_season_idx" ON "nfl_team_stats" USING btree ("team","season");
--> statement-breakpoint
CREATE UNIQUE INDEX "nfl_player_week_stats_source_week_unique" ON "nfl_player_week_stats" USING btree ("source","season","week","source_player_id");
--> statement-breakpoint
CREATE INDEX "nfl_player_week_stats_player_idx" ON "nfl_player_week_stats" USING btree ("player_id");
--> statement-breakpoint
CREATE INDEX "nfl_player_week_stats_team_week_idx" ON "nfl_player_week_stats" USING btree ("team","season","week");
--> statement-breakpoint
CREATE INDEX "nfl_player_week_stats_game_idx" ON "nfl_player_week_stats" USING btree ("source","source_game_id");
