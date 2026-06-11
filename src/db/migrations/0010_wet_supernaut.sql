CREATE TABLE "provider_final_standings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_team_id" text NOT NULL,
	"league_provider_id" text NOT NULL,
	"season" integer NOT NULL,
	"final_rank" integer NOT NULL,
	"playoff_seed" integer,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"points_for" double precision DEFAULT 0 NOT NULL,
	"points_against" double precision DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_final_standings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_final_standings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_final_standings" ADD CONSTRAINT "provider_final_standings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_final_standings_identity_unique" ON "provider_final_standings" USING btree ("league_id","provider","league_provider_id","provider_team_id","season");--> statement-breakpoint
CREATE INDEX "provider_final_standings_league_rank_idx" ON "provider_final_standings" USING btree ("league_id","season","final_rank");--> statement-breakpoint
CREATE POLICY "provider_final_standings_isolation" ON "provider_final_standings" AS PERMISSIVE FOR ALL TO public USING ("provider_final_standings"."league_id" = current_league_id()) WITH CHECK ("provider_final_standings"."league_id" = current_league_id());
