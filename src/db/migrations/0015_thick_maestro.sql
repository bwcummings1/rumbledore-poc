CREATE TYPE "public"."bankroll_ledger_entry_type" AS ENUM('week_open', 'bet_stake', 'bet_payout', 'bet_refund', 'reset_to_floor', 'adjustment');--> statement-breakpoint
CREATE TABLE "bankroll_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"bankroll_week_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"entry_type" "bankroll_ledger_entry_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"running_balance_cents" integer NOT NULL,
	"ref_slip_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bankroll_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bankroll_ledger" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bankroll_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"week_end" timestamp with time zone NOT NULL,
	"opening_balance_cents" integer NOT NULL,
	"floor_cents" integer NOT NULL,
	"closing_balance_cents" integer,
	"closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bankroll_weeks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bankroll_weeks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bankroll_ledger" ADD CONSTRAINT "bankroll_ledger_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankroll_ledger" ADD CONSTRAINT "bankroll_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankroll_ledger" ADD CONSTRAINT "bankroll_ledger_bankroll_week_id_bankroll_weeks_id_fk" FOREIGN KEY ("bankroll_week_id") REFERENCES "public"."bankroll_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankroll_weeks" ADD CONSTRAINT "bankroll_weeks_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankroll_weeks" ADD CONSTRAINT "bankroll_weeks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bankroll_ledger_week_seq_unique" ON "bankroll_ledger" USING btree ("league_id","user_id","bankroll_week_id","seq");--> statement-breakpoint
CREATE INDEX "bankroll_ledger_user_week_latest_idx" ON "bankroll_ledger" USING btree ("league_id","user_id","bankroll_week_id","seq");--> statement-breakpoint
CREATE INDEX "bankroll_ledger_ref_slip_idx" ON "bankroll_ledger" USING btree ("ref_slip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bankroll_weeks_user_week_unique" ON "bankroll_weeks" USING btree ("league_id","user_id","week_start");--> statement-breakpoint
CREATE INDEX "bankroll_weeks_league_week_idx" ON "bankroll_weeks" USING btree ("league_id","week_start");--> statement-breakpoint
CREATE INDEX "bankroll_weeks_user_closed_idx" ON "bankroll_weeks" USING btree ("league_id","user_id","closed");--> statement-breakpoint
CREATE POLICY "bankroll_ledger_isolation" ON "bankroll_ledger" AS PERMISSIVE FOR ALL TO public USING ("bankroll_ledger"."league_id" = current_league_id()) WITH CHECK ("bankroll_ledger"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "bankroll_weeks_isolation" ON "bankroll_weeks" AS PERMISSIVE FOR ALL TO public USING ("bankroll_weeks"."league_id" = current_league_id()) WITH CHECK ("bankroll_weeks"."league_id" = current_league_id());--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_bankroll_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'bankroll_ledger is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER bankroll_ledger_append_only
BEFORE UPDATE OR DELETE ON "bankroll_ledger"
FOR EACH ROW EXECUTE FUNCTION prevent_bankroll_ledger_mutation();
