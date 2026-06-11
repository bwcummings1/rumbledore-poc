ALTER TABLE "fantasy_teams" ADD COLUMN "wins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD COLUMN "losses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD COLUMN "ties" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD COLUMN "points_for" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD COLUMN "points_against" double precision DEFAULT 0 NOT NULL;