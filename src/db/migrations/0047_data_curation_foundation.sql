ALTER TYPE "public"."data_integrity_check_key" ADD VALUE IF NOT EXISTS 'grouping_season_coverage';--> statement-breakpoint
ALTER TYPE "public"."data_integrity_check_key" ADD VALUE IF NOT EXISTS 'matchup_span_sanity';--> statement-breakpoint
ALTER TYPE "public"."data_integrity_check_key" ADD VALUE IF NOT EXISTS 'data_edit_ledger_completeness';--> statement-breakpoint
CREATE TYPE "public"."league_data_edit_target_kind" AS ENUM('person', 'team_season', 'weekly_stat', 'matchup', 'season_setting', 'grouping');--> statement-breakpoint
CREATE TYPE "public"."league_data_edit_class" AS ENUM('cosmetic', 'substantive');--> statement-breakpoint
CREATE TYPE "public"."league_season_grouping_status" AS ENUM('proposed', 'confirmed');--> statement-breakpoint
ALTER TABLE "fantasy_matchups" ADD COLUMN "period_start" integer;--> statement-breakpoint
ALTER TABLE "fantasy_matchups" ADD COLUMN "scoring_period_span" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD COLUMN "matchup_period_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD COLUMN "period_start" integer;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD COLUMN "scoring_period_span" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE "league_data_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"target_kind" "league_data_edit_target_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"field" text NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"edit_class" "league_data_edit_class" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_data_edits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_data_edits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "league_season_groupings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"kind" text DEFAULT 'era' NOT NULL,
	"name" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "league_season_grouping_status" DEFAULT 'proposed' NOT NULL,
	"derived_from" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_season_groupings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_season_groupings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "league_grouping_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"grouping_id" uuid NOT NULL,
	"season" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_grouping_seasons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_grouping_seasons" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_data_edits" ADD CONSTRAINT "league_data_edits_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_data_edits" ADD CONSTRAINT "league_data_edits_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_season_groupings" ADD CONSTRAINT "league_season_groupings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_season_groupings" ADD CONSTRAINT "league_season_groupings_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_grouping_seasons" ADD CONSTRAINT "league_grouping_seasons_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_grouping_seasons" ADD CONSTRAINT "league_grouping_seasons_grouping_id_league_season_groupings_id_fk" FOREIGN KEY ("grouping_id") REFERENCES "public"."league_season_groupings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_matchups" ADD CONSTRAINT "fantasy_matchups_scoring_period_span_positive" CHECK ("fantasy_matchups"."scoring_period_span" >= 1);--> statement-breakpoint
ALTER TABLE "league_season_settings" ADD CONSTRAINT "league_season_settings_matchup_period_count_positive" CHECK ("league_season_settings"."matchup_period_count" >= 1);--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_scoring_period_span_positive" CHECK ("weekly_statistics"."scoring_period_span" >= 1);--> statement-breakpoint
CREATE INDEX "league_data_edits_league_created_idx" ON "league_data_edits" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE INDEX "league_data_edits_target_idx" ON "league_data_edits" USING btree ("league_id","target_kind","target_id","created_at");--> statement-breakpoint
CREATE INDEX "league_season_groupings_league_status_idx" ON "league_season_groupings" USING btree ("league_id","kind","status","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "league_grouping_seasons_grouping_season_unique" ON "league_grouping_seasons" USING btree ("league_id","grouping_id","season");--> statement-breakpoint
CREATE INDEX "league_grouping_seasons_league_season_idx" ON "league_grouping_seasons" USING btree ("league_id","season");--> statement-breakpoint
CREATE POLICY "league_data_edits_isolation" ON "league_data_edits" AS PERMISSIVE FOR ALL TO public USING ("league_data_edits"."league_id" = current_league_id()) WITH CHECK ("league_data_edits"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "league_season_groupings_isolation" ON "league_season_groupings" AS PERMISSIVE FOR ALL TO public USING ("league_season_groupings"."league_id" = current_league_id()) WITH CHECK ("league_season_groupings"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "league_grouping_seasons_isolation" ON "league_grouping_seasons" AS PERMISSIVE FOR ALL TO public USING ("league_grouping_seasons"."league_id" = current_league_id()) WITH CHECK ("league_grouping_seasons"."league_id" = current_league_id());--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_league_data_edits_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'league_data_edits is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER league_data_edits_append_only
BEFORE UPDATE OR DELETE ON "league_data_edits"
FOR EACH ROW EXECUTE FUNCTION prevent_league_data_edits_mutation();
