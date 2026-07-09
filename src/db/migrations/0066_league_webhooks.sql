CREATE TYPE "public"."league_webhook_target_kind" AS ENUM('discord', 'generic');--> statement-breakpoint
CREATE TYPE "public"."league_webhook_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('delivered', 'failed');--> statement-breakpoint

CREATE TABLE "league_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"name" text NOT NULL,
	"target_kind" "league_webhook_target_kind" NOT NULL,
	"encrypted_url" text NOT NULL,
	"url_hash" text NOT NULL,
	"url_label" text DEFAULT 'encrypted endpoint' NOT NULL,
	"event_selection" jsonb DEFAULT '{"events":["content.published","content.corrected"],"contentSections":["recaps","power-rankings","trash-talk","records","previews"]}'::jsonb NOT NULL,
	"status" "league_webhook_status" DEFAULT 'active' NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_webhooks_name_not_blank" CHECK (length(btrim("league_webhooks"."name")) > 0),
	CONSTRAINT "league_webhooks_url_hash_not_blank" CHECK (length(btrim("league_webhooks"."url_hash")) > 0)
);
--> statement-breakpoint
ALTER TABLE "league_webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_webhooks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_webhooks" ADD CONSTRAINT "league_webhooks_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_webhooks" ADD CONSTRAINT "league_webhooks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_webhooks" ADD CONSTRAINT "league_webhooks_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_webhooks_league_url_hash_unique" ON "league_webhooks" USING btree ("league_id","url_hash");--> statement-breakpoint
CREATE INDEX "league_webhooks_league_status_idx" ON "league_webhooks" USING btree ("league_id","status");--> statement-breakpoint
CREATE POLICY "league_webhooks_isolation" ON "league_webhooks" AS PERMISSIVE FOR ALL TO public USING ("league_webhooks"."league_id" = current_league_id()) WITH CHECK ("league_webhooks"."league_id" = current_league_id());--> statement-breakpoint

CREATE TABLE "webhook_delivery_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"content_item_id" uuid,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"target_kind" "league_webhook_target_kind" NOT NULL,
	"delivery_status" "webhook_delivery_status" NOT NULL,
	"delivery_mode" text DEFAULT 'mock' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_delivery_records_event_key_not_blank" CHECK (length(btrim("webhook_delivery_records"."event_key")) > 0),
	CONSTRAINT "webhook_delivery_records_event_type_not_blank" CHECK (length(btrim("webhook_delivery_records"."event_type")) > 0),
	CONSTRAINT "webhook_delivery_records_attempt_count_positive" CHECK ("webhook_delivery_records"."attempt_count" > 0),
	CONSTRAINT "webhook_delivery_records_delivered_at_required" CHECK ("webhook_delivery_records"."delivery_status" <> 'delivered' OR "webhook_delivery_records"."delivered_at" IS NOT NULL),
	CONSTRAINT "webhook_delivery_records_failed_at_required" CHECK ("webhook_delivery_records"."delivery_status" <> 'failed' OR "webhook_delivery_records"."failed_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_delivery_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_delivery_records" ADD CONSTRAINT "webhook_delivery_records_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_records" ADD CONSTRAINT "webhook_delivery_records_webhook_id_league_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."league_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_records" ADD CONSTRAINT "webhook_delivery_records_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_records_webhook_event_unique" ON "webhook_delivery_records" USING btree ("webhook_id","event_key");--> statement-breakpoint
CREATE INDEX "webhook_delivery_records_league_created_idx" ON "webhook_delivery_records" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_records_content_idx" ON "webhook_delivery_records" USING btree ("league_id","content_item_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_records_status_idx" ON "webhook_delivery_records" USING btree ("league_id","delivery_status","created_at");--> statement-breakpoint
CREATE POLICY "webhook_delivery_records_isolation" ON "webhook_delivery_records" AS PERMISSIVE FOR ALL TO public USING ("webhook_delivery_records"."league_id" = current_league_id()) WITH CHECK ("webhook_delivery_records"."league_id" = current_league_id());--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_webhook_delivery_records_mutation()
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

  RAISE EXCEPTION 'webhook_delivery_records is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER webhook_delivery_records_append_only
BEFORE UPDATE OR DELETE ON "webhook_delivery_records"
FOR EACH ROW EXECUTE FUNCTION prevent_webhook_delivery_records_mutation();
