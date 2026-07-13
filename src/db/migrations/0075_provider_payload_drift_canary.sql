CREATE TYPE "public"."provider_payload_view" AS ENUM('settings', 'scoreboard');--> statement-breakpoint
CREATE TYPE "public"."provider_payload_observation_outcome" AS ENUM('baseline', 'stable', 'alert');--> statement-breakpoint
CREATE TABLE "provider_payload_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_league_id" text NOT NULL,
	"season" integer NOT NULL,
	"view" "provider_payload_view" NOT NULL,
	"scoring_period" integer,
	"schema_shape" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schema_hash" text NOT NULL,
	"content_hash" text NOT NULL,
	"outcome" "provider_payload_observation_outcome" NOT NULL,
	"drift_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"added_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"removed_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"previous_observation_id" uuid,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_payload_observation_scoring_period_positive" CHECK ("provider_payload_observation"."scoring_period" IS NULL OR "provider_payload_observation"."scoring_period" >= 1),
	CONSTRAINT "provider_payload_observation_view_period_consistent" CHECK (("provider_payload_observation"."view" = 'settings' AND "provider_payload_observation"."scoring_period" IS NULL) OR ("provider_payload_observation"."view" = 'scoreboard' AND "provider_payload_observation"."scoring_period" IS NOT NULL))
);--> statement-breakpoint
ALTER TABLE "provider_payload_observation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_payload_observation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_payload_observation" ADD CONSTRAINT "provider_payload_observation_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_payload_observation" ADD CONSTRAINT "provider_payload_observation_previous_observation_id_provider_payload_observation_id_fk" FOREIGN KEY ("previous_observation_id") REFERENCES "public"."provider_payload_observation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_payload_observation_latest_idx" ON "provider_payload_observation" USING btree ("league_id","provider","provider_league_id","season","view","scoring_period","observed_at","created_at");--> statement-breakpoint
CREATE INDEX "provider_payload_observation_alert_idx" ON "provider_payload_observation" USING btree ("league_id","outcome","observed_at");--> statement-breakpoint
CREATE POLICY "provider_payload_observation_isolation" ON "provider_payload_observation" AS PERMISSIVE FOR ALL TO public USING ("provider_payload_observation"."league_id" = current_league_id()) WITH CHECK ("provider_payload_observation"."league_id" = current_league_id());--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_provider_payload_observation_mutation()
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

  RAISE EXCEPTION 'provider_payload_observation is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER provider_payload_observation_append_only
BEFORE UPDATE OR DELETE ON "provider_payload_observation"
FOR EACH ROW EXECUTE FUNCTION prevent_provider_payload_observation_mutation();
