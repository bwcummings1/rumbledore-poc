CREATE TABLE "central_ai_usage_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"column_id" text NOT NULL,
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
	CONSTRAINT "central_ai_usage_event_column_id_not_blank" CHECK (length(btrim("central_ai_usage_event"."column_id")) > 0),
	CONSTRAINT "central_ai_usage_event_content_type_not_blank" CHECK (length(btrim("central_ai_usage_event"."content_type")) > 0),
	CONSTRAINT "central_ai_usage_event_trigger_key_not_blank" CHECK (length(btrim("central_ai_usage_event"."trigger_key")) > 0),
	CONSTRAINT "central_ai_usage_event_operation_not_blank" CHECK (length(btrim("central_ai_usage_event"."operation")) > 0),
	CONSTRAINT "central_ai_usage_event_provider_not_blank" CHECK (length(btrim("central_ai_usage_event"."provider")) > 0),
	CONSTRAINT "central_ai_usage_event_model_not_blank" CHECK (length(btrim("central_ai_usage_event"."model")) > 0),
	CONSTRAINT "central_ai_usage_event_tokens_nonnegative" CHECK ("central_ai_usage_event"."input_tokens" >= 0 AND "central_ai_usage_event"."output_tokens" >= 0 AND "central_ai_usage_event"."cache_creation_input_tokens" >= 0 AND "central_ai_usage_event"."cache_read_input_tokens" >= 0 AND "central_ai_usage_event"."total_tokens" >= 0 AND "central_ai_usage_event"."billable_units" >= 0),
	CONSTRAINT "central_ai_usage_event_cost_nonnegative" CHECK ("central_ai_usage_event"."cost_micros_usd" >= 0)
);
--> statement-breakpoint
CREATE INDEX "central_ai_usage_event_created_idx" ON "central_ai_usage_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "central_ai_usage_event_column_created_idx" ON "central_ai_usage_event" USING btree ("column_id","created_at");--> statement-breakpoint
CREATE INDEX "central_ai_usage_event_operation_created_idx" ON "central_ai_usage_event" USING btree ("operation","created_at");
