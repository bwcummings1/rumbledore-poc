CREATE TYPE "public"."fantasy_league_status" AS ENUM('preseason', 'in_season', 'complete', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fantasy_matchup_status" AS ENUM('scheduled', 'in_progress', 'final', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fantasy_matchup_winner" AS ENUM('home', 'away', 'tie', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fantasy_sport" AS ENUM('ffl', 'unknown');--> statement-breakpoint
CREATE TABLE "fantasy_matchups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_matchup_id" text NOT NULL,
	"league_provider_id" text NOT NULL,
	"season" integer NOT NULL,
	"scoring_period" integer NOT NULL,
	"home_team_provider_id" text NOT NULL,
	"away_team_provider_id" text NOT NULL,
	"home_score" double precision DEFAULT 0 NOT NULL,
	"away_score" double precision DEFAULT 0 NOT NULL,
	"winner" "fantasy_matchup_winner" DEFAULT 'unknown' NOT NULL,
	"status" "fantasy_matchup_status" DEFAULT 'unknown' NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_matchups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fantasy_matchups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fantasy_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_member_id" text NOT NULL,
	"league_provider_id" text NOT NULL,
	"season" integer NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'unknown' NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fantasy_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fantasy_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_team_id" text NOT NULL,
	"league_provider_id" text NOT NULL,
	"season" integer NOT NULL,
	"name" text NOT NULL,
	"abbrev" text DEFAULT '' NOT NULL,
	"logo" text,
	"owner_member_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fantasy_teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fantasy_teams" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "season" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "sport" "fantasy_sport" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "scoring_type" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "current_scoring_period" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "status" "fantasy_league_status" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_matchups" ADD CONSTRAINT "fantasy_matchups_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_members" ADD CONSTRAINT "fantasy_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_matchups_provider_identity_unique" ON "fantasy_matchups" USING btree ("provider","league_provider_id","provider_matchup_id","season","scoring_period");--> statement-breakpoint
CREATE INDEX "fantasy_matchups_league_period_idx" ON "fantasy_matchups" USING btree ("league_id","season","scoring_period");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_members_provider_identity_unique" ON "fantasy_members" USING btree ("provider","league_provider_id","provider_member_id","season");--> statement-breakpoint
CREATE INDEX "fantasy_members_league_idx" ON "fantasy_members" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "fantasy_members_provider_member_idx" ON "fantasy_members" USING btree ("provider","provider_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fantasy_teams_provider_identity_unique" ON "fantasy_teams" USING btree ("provider","league_provider_id","provider_team_id","season");--> statement-breakpoint
CREATE INDEX "fantasy_teams_league_idx" ON "fantasy_teams" USING btree ("league_id");--> statement-breakpoint
CREATE POLICY "fantasy_matchups_isolation" ON "fantasy_matchups" AS PERMISSIVE FOR ALL TO public USING ("fantasy_matchups"."league_id" = current_league_id()) WITH CHECK ("fantasy_matchups"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "fantasy_members_isolation" ON "fantasy_members" AS PERMISSIVE FOR ALL TO public USING ("fantasy_members"."league_id" = current_league_id()) WITH CHECK ("fantasy_members"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "fantasy_teams_isolation" ON "fantasy_teams" AS PERMISSIVE FOR ALL TO public USING ("fantasy_teams"."league_id" = current_league_id()) WITH CHECK ("fantasy_teams"."league_id" = current_league_id());
