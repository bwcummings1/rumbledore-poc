CREATE TABLE "ai_usage_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"generation_run_id" uuid,
	"persona" "ai_persona" NOT NULL,
	"content_type" text NOT NULL,
	"trigger_key" text NOT NULL,
	"operation" text DEFAULT 'llm.generate' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_input_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"billable_units" integer DEFAULT 0 NOT NULL,
	"estimated" boolean DEFAULT true NOT NULL,
	"cost_micros_usd" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_event_content_type_not_blank" CHECK (length(btrim("ai_usage_event"."content_type")) > 0),
	CONSTRAINT "ai_usage_event_trigger_key_not_blank" CHECK (length(btrim("ai_usage_event"."trigger_key")) > 0),
	CONSTRAINT "ai_usage_event_operation_not_blank" CHECK (length(btrim("ai_usage_event"."operation")) > 0),
	CONSTRAINT "ai_usage_event_provider_not_blank" CHECK (length(btrim("ai_usage_event"."provider")) > 0),
	CONSTRAINT "ai_usage_event_model_not_blank" CHECK (length(btrim("ai_usage_event"."model")) > 0),
	CONSTRAINT "ai_usage_event_tokens_nonnegative" CHECK ("ai_usage_event"."input_tokens" >= 0 AND "ai_usage_event"."output_tokens" >= 0 AND "ai_usage_event"."cache_creation_input_tokens" >= 0 AND "ai_usage_event"."cache_read_input_tokens" >= 0 AND "ai_usage_event"."total_tokens" >= 0 AND "ai_usage_event"."billable_units" >= 0),
	CONSTRAINT "ai_usage_event_cost_nonnegative" CHECK ("ai_usage_event"."cost_micros_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_usage_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage_event" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_generation_run_id_ai_generation_run_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."ai_generation_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_event_league_created_idx" ON "ai_usage_event" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_event_generation_run_idx" ON "ai_usage_event" USING btree ("generation_run_id");--> statement-breakpoint
CREATE INDEX "ai_usage_event_league_persona_created_idx" ON "ai_usage_event" USING btree ("league_id","persona","created_at");--> statement-breakpoint
CREATE POLICY "ai_usage_event_isolation" ON "ai_usage_event" AS PERMISSIVE FOR ALL TO public USING ("ai_usage_event"."league_id" = current_league_id()) WITH CHECK ("ai_usage_event"."league_id" = current_league_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_ai_usage_event_mutation()
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

  RAISE EXCEPTION 'ai_usage_event is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ai_usage_event_append_only
BEFORE UPDATE OR DELETE ON "ai_usage_event"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_usage_event_mutation();
