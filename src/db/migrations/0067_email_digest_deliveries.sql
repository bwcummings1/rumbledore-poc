CREATE TYPE "public"."email_digest_delivery_status" AS ENUM('delivered', 'failed');--> statement-breakpoint

CREATE TABLE "email_digest_delivery_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"digest_key" text NOT NULL,
	"window_start_at" timestamp with time zone NOT NULL,
	"window_end_at" timestamp with time zone NOT NULL,
	"recipient_email_hash" text NOT NULL,
	"delivery_status" "email_digest_delivery_status" NOT NULL,
	"delivery_mode" text DEFAULT 'mock' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"content_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_digest_delivery_records_digest_key_not_blank" CHECK (length(btrim("email_digest_delivery_records"."digest_key")) > 0),
	CONSTRAINT "email_digest_delivery_records_email_hash_not_blank" CHECK (length(btrim("email_digest_delivery_records"."recipient_email_hash")) > 0),
	CONSTRAINT "email_digest_delivery_records_attempt_count_positive" CHECK ("email_digest_delivery_records"."attempt_count" > 0),
	CONSTRAINT "email_digest_delivery_records_window_order" CHECK ("email_digest_delivery_records"."window_end_at" > "email_digest_delivery_records"."window_start_at"),
	CONSTRAINT "email_digest_delivery_records_delivered_at_required" CHECK ("email_digest_delivery_records"."delivery_status" <> 'delivered' OR "email_digest_delivery_records"."delivered_at" IS NOT NULL),
	CONSTRAINT "email_digest_delivery_records_failed_at_required" CHECK ("email_digest_delivery_records"."delivery_status" <> 'failed' OR "email_digest_delivery_records"."failed_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "email_digest_delivery_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_digest_delivery_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_digest_delivery_records" ADD CONSTRAINT "email_digest_delivery_records_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_digest_delivery_records" ADD CONSTRAINT "email_digest_delivery_records_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_digest_delivery_records_user_window_unique" ON "email_digest_delivery_records" USING btree ("league_id","recipient_user_id","digest_key");--> statement-breakpoint
CREATE INDEX "email_digest_delivery_records_league_created_idx" ON "email_digest_delivery_records" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE INDEX "email_digest_delivery_records_user_idx" ON "email_digest_delivery_records" USING btree ("league_id","recipient_user_id");--> statement-breakpoint
CREATE INDEX "email_digest_delivery_records_status_idx" ON "email_digest_delivery_records" USING btree ("league_id","delivery_status","created_at");--> statement-breakpoint
CREATE POLICY "email_digest_delivery_records_isolation" ON "email_digest_delivery_records" AS PERMISSIVE FOR ALL TO public USING ("email_digest_delivery_records"."league_id" = current_league_id()) WITH CHECK ("email_digest_delivery_records"."league_id" = current_league_id());--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_email_digest_delivery_records_mutation()
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

  RAISE EXCEPTION 'email_digest_delivery_records is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER email_digest_delivery_records_append_only
BEFORE UPDATE OR DELETE ON "email_digest_delivery_records"
FOR EACH ROW EXECUTE FUNCTION prevent_email_digest_delivery_records_mutation();
