CREATE TYPE "public"."league_entitlement_tier" AS ENUM('free', 'premium');--> statement-breakpoint
CREATE TYPE "public"."user_entitlement_tier" AS ENUM('individual');--> statement-breakpoint
CREATE TYPE "public"."entitlement_status" AS ENUM('active', 'expired', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."entitlement_source" AS ENUM('granted', 'comp', 'dev', 'purchased');--> statement-breakpoint
CREATE TYPE "public"."entitlement_event_action" AS ENUM('grant', 'revoke', 'expire', 'suspend', 'resume', 'update_caps');--> statement-breakpoint
CREATE TABLE "league_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"tier" "league_entitlement_tier" DEFAULT 'free' NOT NULL,
	"status" "entitlement_status" DEFAULT 'active' NOT NULL,
	"source" "entitlement_source" DEFAULT 'granted' NOT NULL,
	"caps_override" jsonb DEFAULT NULL,
	"expires_at" timestamp with time zone,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" "user_entitlement_tier" DEFAULT 'individual' NOT NULL,
	"status" "entitlement_status" DEFAULT 'active' NOT NULL,
	"source" "entitlement_source" DEFAULT 'granted' NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_entitlement_id" uuid,
	"user_entitlement_id" uuid,
	"league_id" uuid,
	"user_id" uuid,
	"action" "entitlement_event_action" NOT NULL,
	"source" "entitlement_source",
	"actor_user_id" uuid,
	"before_state" jsonb DEFAULT NULL,
	"after_state" jsonb DEFAULT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_events_single_scope_check" CHECK (
		("league_id" IS NOT NULL AND "user_id" IS NULL AND "user_entitlement_id" IS NULL)
		OR ("user_id" IS NOT NULL AND "league_id" IS NULL AND "league_entitlement_id" IS NULL)
	)
);
--> statement-breakpoint
ALTER TABLE "league_entitlements" ADD CONSTRAINT "league_entitlements_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_entitlements" ADD CONSTRAINT "league_entitlements_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_events" ADD CONSTRAINT "entitlement_events_league_entitlement_id_league_entitlements_id_fk" FOREIGN KEY ("league_entitlement_id") REFERENCES "public"."league_entitlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_events" ADD CONSTRAINT "entitlement_events_user_entitlement_id_user_entitlements_id_fk" FOREIGN KEY ("user_entitlement_id") REFERENCES "public"."user_entitlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_events" ADD CONSTRAINT "entitlement_events_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_events" ADD CONSTRAINT "entitlement_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_events" ADD CONSTRAINT "entitlement_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_entitlements_league_unique" ON "league_entitlements" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "league_entitlements_status_idx" ON "league_entitlements" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_entitlements_user_unique" ON "user_entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_entitlements_status_idx" ON "user_entitlements" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "entitlement_events_league_created_idx" ON "entitlement_events" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE INDEX "entitlement_events_user_created_idx" ON "entitlement_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "entitlement_events_actor_created_idx" ON "entitlement_events" USING btree ("actor_user_id","created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_entitlement_events_mutation()
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

  RAISE EXCEPTION 'entitlement_events is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER entitlement_events_append_only
BEFORE UPDATE OR DELETE ON "entitlement_events"
FOR EACH ROW EXECUTE FUNCTION prevent_entitlement_events_mutation();
