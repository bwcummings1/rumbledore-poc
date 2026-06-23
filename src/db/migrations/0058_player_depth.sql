ALTER TYPE "public"."data_integrity_check_key" ADD VALUE IF NOT EXISTS 'roster_coverage';
--> statement-breakpoint
ALTER TYPE "public"."data_integrity_check_key" ADD VALUE IF NOT EXISTS 'player_points_rollup';
--> statement-breakpoint
CREATE TABLE "fantasy_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"league_provider_id" text NOT NULL,
	"provider_player_id" text NOT NULL,
	"full_name" text NOT NULL,
	"position" text DEFAULT 'unknown' NOT NULL,
	"pro_team" text,
	"status" text,
	"nfl_player_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fantasy_players_provider_player_nonempty" CHECK (length("fantasy_players"."provider_player_id") > 0),
	CONSTRAINT "fantasy_players_full_name_nonempty" CHECK (length("fantasy_players"."full_name") > 0)
);
--> statement-breakpoint
ALTER TABLE "fantasy_players" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fantasy_players" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fantasy_players" ADD CONSTRAINT "fantasy_players_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fantasy_players" ADD CONSTRAINT "fantasy_players_nfl_player_id_nfl_players_id_fk" FOREIGN KEY ("nfl_player_id") REFERENCES "public"."nfl_players"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_players_identity_unique" ON "fantasy_players" USING btree ("league_id","provider","league_provider_id","provider_player_id");
--> statement-breakpoint
CREATE INDEX "fantasy_players_league_name_idx" ON "fantasy_players" USING btree ("league_id","full_name");
--> statement-breakpoint
CREATE INDEX "fantasy_players_nfl_player_idx" ON "fantasy_players" USING btree ("nfl_player_id");
--> statement-breakpoint
CREATE POLICY "fantasy_players_isolation" ON "fantasy_players" AS PERMISSIVE FOR ALL TO public USING ("fantasy_players"."league_id" = current_league_id()) WITH CHECK ("fantasy_players"."league_id" = current_league_id());
--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" ADD COLUMN "fantasy_player_id" uuid;
--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" ADD COLUMN "actual_points" double precision;
--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" ADD COLUMN "projected_points" double precision;
--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" ADD COLUMN "started" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "fantasy_roster_entries" ADD CONSTRAINT "fantasy_roster_entries_fantasy_player_id_fantasy_players_id_fk" FOREIGN KEY ("fantasy_player_id") REFERENCES "public"."fantasy_players"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "fantasy_roster_entries_player_idx" ON "fantasy_roster_entries" USING btree ("fantasy_player_id");
--> statement-breakpoint
CREATE TABLE "fantasy_draft_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"league_provider_id" text NOT NULL,
	"provider_pick_id" text NOT NULL,
	"season" integer NOT NULL,
	"round" integer NOT NULL,
	"pick_overall" integer,
	"pick_in_round" integer,
	"provider_team_id" text NOT NULL,
	"provider_player_id" text,
	"fantasy_player_id" uuid,
	"is_keeper" boolean DEFAULT false NOT NULL,
	"auction_value" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fantasy_draft_picks_provider_pick_nonempty" CHECK (length("fantasy_draft_picks"."provider_pick_id") > 0),
	CONSTRAINT "fantasy_draft_picks_round_positive" CHECK ("fantasy_draft_picks"."round" >= 1)
);
--> statement-breakpoint
ALTER TABLE "fantasy_draft_picks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fantasy_draft_picks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fantasy_draft_picks" ADD CONSTRAINT "fantasy_draft_picks_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fantasy_draft_picks" ADD CONSTRAINT "fantasy_draft_picks_fantasy_player_id_fantasy_players_id_fk" FOREIGN KEY ("fantasy_player_id") REFERENCES "public"."fantasy_players"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_draft_picks_identity_unique" ON "fantasy_draft_picks" USING btree ("league_id","provider","league_provider_id","season","provider_pick_id");
--> statement-breakpoint
CREATE INDEX "fantasy_draft_picks_league_season_idx" ON "fantasy_draft_picks" USING btree ("league_id","season");
--> statement-breakpoint
CREATE INDEX "fantasy_draft_picks_player_idx" ON "fantasy_draft_picks" USING btree ("fantasy_player_id");
--> statement-breakpoint
CREATE POLICY "fantasy_draft_picks_isolation" ON "fantasy_draft_picks" AS PERMISSIVE FOR ALL TO public USING ("fantasy_draft_picks"."league_id" = current_league_id()) WITH CHECK ("fantasy_draft_picks"."league_id" = current_league_id());
--> statement-breakpoint
ALTER TABLE "fantasy_transactions" ADD COLUMN "scoring_period" integer;
