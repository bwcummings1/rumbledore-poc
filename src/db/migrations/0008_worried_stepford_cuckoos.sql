CREATE TYPE "public"."historical_import_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "historical_import_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_league_id" text NOT NULL,
	"start_season" integer NOT NULL,
	"end_season" integer NOT NULL,
	"last_completed_season" integer,
	"next_season" integer,
	"status" "historical_import_status" DEFAULT 'running' NOT NULL,
	"seasons_total" integer DEFAULT 0 NOT NULL,
	"seasons_completed" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "historical_import_checkpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "historical_import_checkpoints" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "historical_import_checkpoints" ADD CONSTRAINT "historical_import_checkpoints_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "historical_import_checkpoints_identity_unique" ON "historical_import_checkpoints" USING btree ("league_id","provider","provider_league_id");--> statement-breakpoint
CREATE INDEX "historical_import_checkpoints_league_status_idx" ON "historical_import_checkpoints" USING btree ("league_id","status");--> statement-breakpoint
CREATE POLICY "historical_import_checkpoints_isolation" ON "historical_import_checkpoints" AS PERMISSIVE FOR ALL TO public USING ("historical_import_checkpoints"."league_id" = current_league_id()) WITH CHECK ("historical_import_checkpoints"."league_id" = current_league_id());
