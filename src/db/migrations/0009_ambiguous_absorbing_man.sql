CREATE TYPE "public"."identity_audit_action" AS ENUM('create', 'merge', 'split', 'remap', 'rename');--> statement-breakpoint
CREATE TYPE "public"."identity_mapping_method" AS ENUM('auto', 'fuzzy', 'manual');--> statement-breakpoint
CREATE TYPE "public"."statistics_result" AS ENUM('win', 'loss', 'tie');--> statement-breakpoint
CREATE TYPE "public"."stats_calculation_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."stats_calculation_type" AS ENUM('season', 'head_to_head', 'records', 'championships', 'all');--> statement-breakpoint
CREATE TABLE "all_time_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"holder_person_id" uuid,
	"value" numeric(14, 4) DEFAULT 0 NOT NULL,
	"season" integer,
	"scoring_period" integer,
	"opponent_person_id" uuid,
	"previous_record_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "all_time_record" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "all_time_record" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "championship_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season" integer NOT NULL,
	"champion_person_id" uuid,
	"runner_up_person_id" uuid,
	"third_place_person_id" uuid,
	"regular_season_winner_person_id" uuid,
	"championship_score" numeric(12, 2),
	"runner_up_score" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "championship_record" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "championship_record" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "head_to_head_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season" integer DEFAULT 0 NOT NULL,
	"person_a_id" uuid NOT NULL,
	"person_b_id" uuid NOT NULL,
	"meetings" integer DEFAULT 0 NOT NULL,
	"person_a_wins" integer DEFAULT 0 NOT NULL,
	"person_b_wins" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"person_a_points" numeric(12, 2) DEFAULT 0 NOT NULL,
	"person_b_points" numeric(12, 2) DEFAULT 0 NOT NULL,
	"person_a_highest_score" numeric(12, 2) DEFAULT 0 NOT NULL,
	"person_b_highest_score" numeric(12, 2) DEFAULT 0 NOT NULL,
	"playoff_meetings" integer DEFAULT 0 NOT NULL,
	"championship_meetings" integer DEFAULT 0 NOT NULL,
	"last_season" integer,
	"last_scoring_period" integer,
	"current_streak_person_id" uuid,
	"current_streak_length" integer DEFAULT 0 NOT NULL,
	"longest_streak_person_id" uuid,
	"longest_streak_length" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "head_to_head_record" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "head_to_head_record" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"action" "identity_audit_action" NOT NULL,
	"person_id" uuid,
	"team_season_id" uuid,
	"actor_user_id" uuid,
	"before_state" jsonb DEFAULT NULL,
	"after_state" jsonb DEFAULT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity_audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_team_id" text NOT NULL,
	"league_provider_id" text NOT NULL,
	"season" integer NOT NULL,
	"confidence" numeric(5, 4) DEFAULT 1 NOT NULL,
	"method" "identity_mapping_method" DEFAULT 'auto' NOT NULL,
	"resolved_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_mapping" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity_mapping" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"canonical_name" text NOT NULL,
	"owner_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "person" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "season_statistics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"season" integer NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"win_percentage" numeric(8, 4) DEFAULT 0 NOT NULL,
	"points_for" numeric(12, 2) DEFAULT 0 NOT NULL,
	"points_against" numeric(12, 2) DEFAULT 0 NOT NULL,
	"point_differential" numeric(12, 2) DEFAULT 0 NOT NULL,
	"avg_points_for" numeric(12, 2) DEFAULT 0 NOT NULL,
	"avg_points_against" numeric(12, 2) DEFAULT 0 NOT NULL,
	"median_points_for" numeric(12, 2) DEFAULT 0 NOT NULL,
	"median_points_against" numeric(12, 2) DEFAULT 0 NOT NULL,
	"highest_score" numeric(12, 2) DEFAULT 0 NOT NULL,
	"lowest_score" numeric(12, 2) DEFAULT 0 NOT NULL,
	"scoring_std_dev" numeric(12, 4) DEFAULT 0 NOT NULL,
	"longest_win_streak" integer DEFAULT 0 NOT NULL,
	"longest_loss_streak" integer DEFAULT 0 NOT NULL,
	"current_streak_type" "statistics_result",
	"current_streak_length" integer DEFAULT 0 NOT NULL,
	"expected_wins" numeric(10, 4) DEFAULT 0 NOT NULL,
	"luck" numeric(10, 4) DEFAULT 0 NOT NULL,
	"all_play_wins" integer DEFAULT 0 NOT NULL,
	"all_play_losses" integer DEFAULT 0 NOT NULL,
	"all_play_ties" integer DEFAULT 0 NOT NULL,
	"final_rank" integer DEFAULT 0 NOT NULL,
	"final_placement" text DEFAULT 'out' NOT NULL,
	"division_winner" boolean DEFAULT false NOT NULL,
	"made_playoffs" boolean DEFAULT false NOT NULL,
	"made_championship" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_statistics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "season_statistics" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stats_calculation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"calculation_type" "stats_calculation_type" NOT NULL,
	"status" "stats_calculation_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"rows_processed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stats_calculation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stats_calculation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"fantasy_team_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_team_id" text NOT NULL,
	"league_provider_id" text NOT NULL,
	"season" integer NOT NULL,
	"team_name" text NOT NULL,
	"owner_member_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_season" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_season" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weekly_statistics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"team_season_id" uuid NOT NULL,
	"opponent_person_id" uuid,
	"matchup_id" uuid NOT NULL,
	"season" integer NOT NULL,
	"scoring_period" integer NOT NULL,
	"points_for" numeric(12, 2) NOT NULL,
	"points_against" numeric(12, 2) NOT NULL,
	"result" "statistics_result" NOT NULL,
	"margin" numeric(12, 2) DEFAULT 0 NOT NULL,
	"is_playoff" boolean DEFAULT false NOT NULL,
	"is_championship" boolean DEFAULT false NOT NULL,
	"weekly_rank" integer NOT NULL,
	"is_top_scorer" boolean DEFAULT false NOT NULL,
	"is_bottom_scorer" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_statistics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weekly_statistics" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "all_time_record" ADD CONSTRAINT "all_time_record_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "all_time_record" ADD CONSTRAINT "all_time_record_holder_person_id_person_id_fk" FOREIGN KEY ("holder_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "all_time_record" ADD CONSTRAINT "all_time_record_opponent_person_id_person_id_fk" FOREIGN KEY ("opponent_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "all_time_record" ADD CONSTRAINT "all_time_record_previous_record_id_all_time_record_id_fk" FOREIGN KEY ("previous_record_id") REFERENCES "public"."all_time_record"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_record" ADD CONSTRAINT "championship_record_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_record" ADD CONSTRAINT "championship_record_champion_person_id_person_id_fk" FOREIGN KEY ("champion_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_record" ADD CONSTRAINT "championship_record_runner_up_person_id_person_id_fk" FOREIGN KEY ("runner_up_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_record" ADD CONSTRAINT "championship_record_third_place_person_id_person_id_fk" FOREIGN KEY ("third_place_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_record" ADD CONSTRAINT "championship_record_regular_season_winner_person_id_person_id_fk" FOREIGN KEY ("regular_season_winner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "head_to_head_record" ADD CONSTRAINT "head_to_head_record_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "head_to_head_record" ADD CONSTRAINT "head_to_head_record_person_a_id_person_id_fk" FOREIGN KEY ("person_a_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "head_to_head_record" ADD CONSTRAINT "head_to_head_record_person_b_id_person_id_fk" FOREIGN KEY ("person_b_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "head_to_head_record" ADD CONSTRAINT "head_to_head_record_current_streak_person_id_person_id_fk" FOREIGN KEY ("current_streak_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "head_to_head_record" ADD CONSTRAINT "head_to_head_record_longest_streak_person_id_person_id_fk" FOREIGN KEY ("longest_streak_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_audit_log" ADD CONSTRAINT "identity_audit_log_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_audit_log" ADD CONSTRAINT "identity_audit_log_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_audit_log" ADD CONSTRAINT "identity_audit_log_team_season_id_team_season_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_season"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_audit_log" ADD CONSTRAINT "identity_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_mapping" ADD CONSTRAINT "identity_mapping_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_mapping" ADD CONSTRAINT "identity_mapping_team_season_id_team_season_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_mapping" ADD CONSTRAINT "identity_mapping_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_statistics" ADD CONSTRAINT "season_statistics_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_statistics" ADD CONSTRAINT "season_statistics_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_calculation" ADD CONSTRAINT "stats_calculation_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season" ADD CONSTRAINT "team_season_fantasy_team_id_fantasy_teams_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_team_season_id_team_season_id_fk" FOREIGN KEY ("team_season_id") REFERENCES "public"."team_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_opponent_person_id_person_id_fk" FOREIGN KEY ("opponent_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_matchup_id_fantasy_matchups_id_fk" FOREIGN KEY ("matchup_id") REFERENCES "public"."fantasy_matchups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "all_time_record_current_idx" ON "all_time_record" USING btree ("league_id","record_type","is_current");--> statement-breakpoint
CREATE UNIQUE INDEX "championship_record_season_unique" ON "championship_record" USING btree ("league_id","season");--> statement-breakpoint
CREATE UNIQUE INDEX "head_to_head_record_identity_unique" ON "head_to_head_record" USING btree ("league_id","season","person_a_id","person_b_id");--> statement-breakpoint
CREATE INDEX "head_to_head_record_person_a_idx" ON "head_to_head_record" USING btree ("league_id","person_a_id");--> statement-breakpoint
CREATE INDEX "head_to_head_record_person_b_idx" ON "head_to_head_record" USING btree ("league_id","person_b_id");--> statement-breakpoint
CREATE INDEX "identity_audit_log_league_created_idx" ON "identity_audit_log" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_mapping_team_season_unique" ON "identity_mapping" USING btree ("team_season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_mapping_provider_identity_unique" ON "identity_mapping" USING btree ("league_id","provider","provider_team_id","season");--> statement-breakpoint
CREATE INDEX "identity_mapping_person_idx" ON "identity_mapping" USING btree ("league_id","person_id");--> statement-breakpoint
CREATE INDEX "person_league_name_idx" ON "person" USING btree ("league_id","canonical_name");--> statement-breakpoint
CREATE UNIQUE INDEX "season_statistics_identity_unique" ON "season_statistics" USING btree ("league_id","person_id","season");--> statement-breakpoint
CREATE INDEX "season_statistics_league_season_rank_idx" ON "season_statistics" USING btree ("league_id","season","final_rank");--> statement-breakpoint
CREATE INDEX "stats_calculation_league_started_idx" ON "stats_calculation" USING btree ("league_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_season_provider_identity_unique" ON "team_season" USING btree ("league_id","provider","provider_team_id","season");--> statement-breakpoint
CREATE UNIQUE INDEX "team_season_fantasy_team_unique" ON "team_season" USING btree ("fantasy_team_id");--> statement-breakpoint
CREATE INDEX "team_season_league_season_idx" ON "team_season" USING btree ("league_id","season");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_statistics_identity_unique" ON "weekly_statistics" USING btree ("league_id","season","scoring_period","person_id");--> statement-breakpoint
CREATE INDEX "weekly_statistics_matchup_idx" ON "weekly_statistics" USING btree ("matchup_id");--> statement-breakpoint
CREATE POLICY "all_time_record_isolation" ON "all_time_record" AS PERMISSIVE FOR ALL TO public USING ("all_time_record"."league_id" = current_league_id()) WITH CHECK ("all_time_record"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "championship_record_isolation" ON "championship_record" AS PERMISSIVE FOR ALL TO public USING ("championship_record"."league_id" = current_league_id()) WITH CHECK ("championship_record"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "head_to_head_record_isolation" ON "head_to_head_record" AS PERMISSIVE FOR ALL TO public USING ("head_to_head_record"."league_id" = current_league_id()) WITH CHECK ("head_to_head_record"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "identity_audit_log_isolation" ON "identity_audit_log" AS PERMISSIVE FOR ALL TO public USING ("identity_audit_log"."league_id" = current_league_id()) WITH CHECK ("identity_audit_log"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "identity_mapping_isolation" ON "identity_mapping" AS PERMISSIVE FOR ALL TO public USING ("identity_mapping"."league_id" = current_league_id()) WITH CHECK ("identity_mapping"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "person_isolation" ON "person" AS PERMISSIVE FOR ALL TO public USING ("person"."league_id" = current_league_id()) WITH CHECK ("person"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "season_statistics_isolation" ON "season_statistics" AS PERMISSIVE FOR ALL TO public USING ("season_statistics"."league_id" = current_league_id()) WITH CHECK ("season_statistics"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "stats_calculation_isolation" ON "stats_calculation" AS PERMISSIVE FOR ALL TO public USING ("stats_calculation"."league_id" = current_league_id()) WITH CHECK ("stats_calculation"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "team_season_isolation" ON "team_season" AS PERMISSIVE FOR ALL TO public USING ("team_season"."league_id" = current_league_id()) WITH CHECK ("team_season"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "weekly_statistics_isolation" ON "weekly_statistics" AS PERMISSIVE FOR ALL TO public USING ("weekly_statistics"."league_id" = current_league_id()) WITH CHECK ("weekly_statistics"."league_id" = current_league_id());
