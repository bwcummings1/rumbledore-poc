ALTER TABLE "provider_payload_observation" ADD COLUMN "acknowledged_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "provider_payload_observation" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_payload_observation" ADD COLUMN "acknowledgement_reason" text;--> statement-breakpoint
ALTER TABLE "provider_payload_observation" ADD CONSTRAINT "provider_payload_observation_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_payload_observation_unacknowledged_alert_idx" ON "provider_payload_observation" USING btree ("league_id","observed_at") WHERE "provider_payload_observation"."outcome" = 'alert' AND "provider_payload_observation"."acknowledged_at" IS NULL;--> statement-breakpoint
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

  IF TG_OP = 'UPDATE'
    AND OLD.acknowledged_at IS NULL
    AND OLD.acknowledged_by_user_id IS NULL
    AND NEW.acknowledged_at IS NOT NULL
    AND NEW.acknowledged_by_user_id IS NOT NULL
    AND (to_jsonb(NEW) - ARRAY['acknowledged_at', 'acknowledged_by_user_id', 'acknowledgement_reason']::text[])
      = (to_jsonb(OLD) - ARRAY['acknowledged_at', 'acknowledged_by_user_id', 'acknowledgement_reason']::text[])
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'provider_payload_observation is append-only'
    USING ERRCODE = '55000';
END;
$$;
