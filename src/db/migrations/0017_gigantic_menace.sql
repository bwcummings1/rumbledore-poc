CREATE TYPE "public"."bet_settlement_outcome" AS ENUM('won', 'lost', 'push', 'void', 'partial_void');--> statement-breakpoint
CREATE TABLE "bet_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"slip_id" uuid NOT NULL,
	"results_provider" text NOT NULL,
	"results_payload_hash" text NOT NULL,
	"graded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "bet_settlement_outcome" NOT NULL,
	"payout_cents" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bet_settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bet_settlements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bet_settlements" ADD CONSTRAINT "bet_settlements_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bet_settlements" ADD CONSTRAINT "bet_settlements_slip_id_bet_slips_id_fk" FOREIGN KEY ("slip_id") REFERENCES "public"."bet_slips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bet_settlements_slip_unique" ON "bet_settlements" USING btree ("slip_id");--> statement-breakpoint
CREATE INDEX "bet_settlements_league_graded_idx" ON "bet_settlements" USING btree ("league_id","graded_at");--> statement-breakpoint
CREATE POLICY "bet_settlements_isolation" ON "bet_settlements" AS PERMISSIVE FOR ALL TO public USING ("bet_settlements"."league_id" = current_league_id()) WITH CHECK ("bet_settlements"."league_id" = current_league_id());
