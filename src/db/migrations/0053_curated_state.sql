ALTER TYPE "public"."league_data_edit_target_kind" ADD VALUE IF NOT EXISTS 'curation_checkpoint';--> statement-breakpoint
ALTER TYPE "public"."league_data_edit_target_kind" ADD VALUE IF NOT EXISTS 'curation_push';--> statement-breakpoint
ALTER TABLE "league_data_edits" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "league_data_edits" ADD CONSTRAINT "league_data_edits_scope_valid" CHECK ("league_data_edits"."scope" IS NULL OR "league_data_edits"."scope" IN ('all_years', 'this_year_only'));--> statement-breakpoint
CREATE TABLE "league_curation_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"marker_edit_id" uuid,
	"latest_edit_id" uuid,
	"label" text,
	"note" text,
	"seasons" jsonb NOT NULL,
	"edit_ids" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_curation_checkpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_curation_checkpoints" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "league_curation_season_pushes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"checkpoint_id" uuid,
	"marker_edit_id" uuid,
	"latest_edit_id" uuid,
	"season" integer NOT NULL,
	"reason" text,
	"edit_ids" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_curation_season_pushes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_curation_season_pushes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_curation_checkpoints" ADD CONSTRAINT "league_curation_checkpoints_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_checkpoints" ADD CONSTRAINT "league_curation_checkpoints_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_checkpoints" ADD CONSTRAINT "league_curation_checkpoints_marker_edit_id_league_data_edits_id_fk" FOREIGN KEY ("marker_edit_id") REFERENCES "public"."league_data_edits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_checkpoints" ADD CONSTRAINT "league_curation_checkpoints_latest_edit_id_league_data_edits_id_fk" FOREIGN KEY ("latest_edit_id") REFERENCES "public"."league_data_edits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_season_pushes" ADD CONSTRAINT "league_curation_season_pushes_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_season_pushes" ADD CONSTRAINT "league_curation_season_pushes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_season_pushes" ADD CONSTRAINT "league_curation_season_pushes_checkpoint_id_league_curation_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."league_curation_checkpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_season_pushes" ADD CONSTRAINT "league_curation_season_pushes_marker_edit_id_league_data_edits_id_fk" FOREIGN KEY ("marker_edit_id") REFERENCES "public"."league_data_edits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_season_pushes" ADD CONSTRAINT "league_curation_season_pushes_latest_edit_id_league_data_edits_id_fk" FOREIGN KEY ("latest_edit_id") REFERENCES "public"."league_data_edits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_season_pushes" ADD CONSTRAINT "league_curation_season_pushes_season_valid" CHECK ("league_curation_season_pushes"."season" >= 1900 AND "league_curation_season_pushes"."season" <= 2200);--> statement-breakpoint
CREATE INDEX "league_curation_checkpoints_league_created_idx" ON "league_curation_checkpoints" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE INDEX "league_curation_checkpoints_marker_idx" ON "league_curation_checkpoints" USING btree ("league_id","marker_edit_id");--> statement-breakpoint
CREATE INDEX "league_curation_season_pushes_league_season_created_idx" ON "league_curation_season_pushes" USING btree ("league_id","season","created_at");--> statement-breakpoint
CREATE INDEX "league_curation_season_pushes_checkpoint_idx" ON "league_curation_season_pushes" USING btree ("league_id","checkpoint_id");--> statement-breakpoint
CREATE POLICY "league_curation_checkpoints_isolation" ON "league_curation_checkpoints" AS PERMISSIVE FOR ALL TO public USING ("league_curation_checkpoints"."league_id" = current_league_id()) WITH CHECK ("league_curation_checkpoints"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "league_curation_season_pushes_isolation" ON "league_curation_season_pushes" AS PERMISSIVE FOR ALL TO public USING ("league_curation_season_pushes"."league_id" = current_league_id()) WITH CHECK ("league_curation_season_pushes"."league_id" = current_league_id());--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_league_curation_state_mutation()
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

  RAISE EXCEPTION 'league curation state rows are append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER league_curation_checkpoints_append_only
BEFORE UPDATE OR DELETE ON "league_curation_checkpoints"
FOR EACH ROW EXECUTE FUNCTION prevent_league_curation_state_mutation();--> statement-breakpoint
CREATE TRIGGER league_curation_season_pushes_append_only
BEFORE UPDATE OR DELETE ON "league_curation_season_pushes"
FOR EACH ROW EXECUTE FUNCTION prevent_league_curation_state_mutation();
