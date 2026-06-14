CREATE TYPE "public"."data_correction_audit_action" AS ENUM('mark_reviewed', 'rerun_integrity');--> statement-breakpoint
CREATE TYPE "public"."data_integrity_check_key" AS ENUM('reconciliation_totals', 'standings_parity', 'schedule_coverage', 'identity_sanity', 'no_silent_empty');--> statement-breakpoint
CREATE TYPE "public"."data_integrity_check_status" AS ENUM('pass', 'fail', 'reviewed');--> statement-breakpoint
CREATE TABLE "data_correction_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"action" "data_correction_audit_action" NOT NULL,
	"integrity_check_id" uuid,
	"actor_user_id" uuid,
	"before_state" jsonb DEFAULT NULL,
	"after_state" jsonb DEFAULT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_correction_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_correction_audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "data_integrity_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"check_key" "data_integrity_check_key" NOT NULL,
	"season" integer,
	"status" "data_integrity_check_status" NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_integrity_check" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_integrity_check" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_correction_audit_log" ADD CONSTRAINT "data_correction_audit_log_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_correction_audit_log" ADD CONSTRAINT "data_correction_audit_log_integrity_check_id_data_integrity_check_id_fk" FOREIGN KEY ("integrity_check_id") REFERENCES "public"."data_integrity_check"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_correction_audit_log" ADD CONSTRAINT "data_correction_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_integrity_check" ADD CONSTRAINT "data_integrity_check_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_integrity_check" ADD CONSTRAINT "data_integrity_check_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_correction_audit_log_league_created_idx" ON "data_correction_audit_log" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE INDEX "data_integrity_check_league_status_idx" ON "data_integrity_check" USING btree ("league_id","status","created_at");--> statement-breakpoint
CREATE INDEX "data_integrity_check_league_key_idx" ON "data_integrity_check" USING btree ("league_id","check_key","season","created_at");--> statement-breakpoint
CREATE POLICY "data_correction_audit_log_isolation" ON "data_correction_audit_log" AS PERMISSIVE FOR ALL TO public USING ("data_correction_audit_log"."league_id" = current_league_id()) WITH CHECK ("data_correction_audit_log"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "data_integrity_check_isolation" ON "data_integrity_check" AS PERMISSIVE FOR ALL TO public USING ("data_integrity_check"."league_id" = current_league_id()) WITH CHECK ("data_integrity_check"."league_id" = current_league_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_data_correction_audit_log_mutation()
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

  RAISE EXCEPTION 'data_correction_audit_log is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER data_correction_audit_log_append_only
BEFORE UPDATE OR DELETE ON "data_correction_audit_log"
FOR EACH ROW EXECUTE FUNCTION prevent_data_correction_audit_log_mutation();
