CREATE TABLE "league_curation_season_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"season" integer NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_curation_season_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_curation_season_states" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_curation_season_states" ADD CONSTRAINT "league_curation_season_states_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_season_states" ADD CONSTRAINT "league_curation_season_states_finalized_by_user_id_users_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_curation_season_states" ADD CONSTRAINT "league_curation_season_states_mode_valid" CHECK ("league_curation_season_states"."mode" IN ('live', 'finalized'));--> statement-breakpoint
ALTER TABLE "league_curation_season_states" ADD CONSTRAINT "league_curation_season_states_season_valid" CHECK ("league_curation_season_states"."season" >= 1900 AND "league_curation_season_states"."season" <= 2200);--> statement-breakpoint
CREATE UNIQUE INDEX "league_curation_season_states_unique" ON "league_curation_season_states" USING btree ("league_id","season");--> statement-breakpoint
CREATE INDEX "league_curation_season_states_league_mode_idx" ON "league_curation_season_states" USING btree ("league_id","mode","season");--> statement-breakpoint
CREATE POLICY "league_curation_season_states_isolation" ON "league_curation_season_states" AS PERMISSIVE FOR ALL TO public USING ("league_curation_season_states"."league_id" = current_league_id()) WITH CHECK ("league_curation_season_states"."league_id" = current_league_id());
