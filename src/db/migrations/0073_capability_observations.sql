CREATE TYPE "public"."provider_probe_verdict" AS ENUM('returned_data', 'returned_empty', 'not_requested', 'unsupported', 'request_failed');--> statement-breakpoint
CREATE TABLE "data_capability_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_league_id" text NOT NULL,
	"season" integer NOT NULL,
	"data_class" "data_coverage_class" NOT NULL,
	"availability" "data_coverage_capability" NOT NULL,
	"provider_support" "data_coverage_capability" NOT NULL,
	"provider_verdict" "provider_probe_verdict" NOT NULL,
	"status" "data_coverage_status" NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"probed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"error_message" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_capability_observation_row_count_nonnegative" CHECK ("data_capability_observation"."row_count" >= 0)
);--> statement-breakpoint
ALTER TABLE "data_capability_observation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_capability_observation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_capability_observation" ADD CONSTRAINT "data_capability_observation_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_capability_observation_latest_idx" ON "data_capability_observation" USING btree ("league_id","provider","provider_league_id","season","data_class","probed_at","created_at");--> statement-breakpoint
CREATE INDEX "data_capability_observation_league_status_idx" ON "data_capability_observation" USING btree ("league_id","status");--> statement-breakpoint
CREATE POLICY "data_capability_observation_isolation" ON "data_capability_observation" AS PERMISSIVE FOR ALL TO public USING ("data_capability_observation"."league_id" = current_league_id()) WITH CHECK ("data_capability_observation"."league_id" = current_league_id());--> statement-breakpoint
INSERT INTO "data_capability_observation" (
	"id",
	"league_id",
	"provider",
	"provider_league_id",
	"season",
	"data_class",
	"availability",
	"provider_support",
	"provider_verdict",
	"status",
	"row_count",
	"probed_at",
	"error_code",
	"error_message",
	"details",
	"created_at"
)
SELECT
	"id",
	"league_id",
	"provider",
	"provider_league_id",
	"season",
	"data_class",
	CASE
		WHEN "status" IN ('error', 'stale', 'unavailable') THEN 'none'::"data_coverage_capability"
		WHEN "status" = 'partial' THEN 'partial'::"data_coverage_capability"
		ELSE "capability"
	END,
	"capability",
	CASE
		WHEN "status" = 'error' THEN 'request_failed'::"provider_probe_verdict"
		WHEN "status" = 'stale' THEN 'not_requested'::"provider_probe_verdict"
		WHEN "status" = 'unavailable' AND "capability" = 'none' THEN 'unsupported'::"provider_probe_verdict"
		WHEN "status" = 'unavailable' OR "item_count" = 0 THEN 'returned_empty'::"provider_probe_verdict"
		ELSE 'returned_data'::"provider_probe_verdict"
	END,
	"status",
	"item_count",
	"observed_at",
	"error_code",
	"error_message",
	"details",
	"created_at"
FROM "data_coverage";--> statement-breakpoint
DROP TABLE "data_coverage";--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_data_capability_observation_mutation()
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

  RAISE EXCEPTION 'data_capability_observation is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER data_capability_observation_append_only
BEFORE UPDATE OR DELETE ON "data_capability_observation"
FOR EACH ROW EXECUTE FUNCTION prevent_data_capability_observation_mutation();
