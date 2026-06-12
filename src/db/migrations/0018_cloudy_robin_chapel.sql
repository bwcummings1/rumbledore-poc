CREATE TYPE "public"."arena_standing_kind" AS ENUM('league', 'individual');--> statement-breakpoint
CREATE TABLE "arena_season" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_standing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"kind" "arena_standing_kind" NOT NULL,
	"subject_id" uuid NOT NULL,
	"league_id" uuid,
	"user_id" uuid,
	"rank" integer NOT NULL,
	"net_pnl_cents" integer NOT NULL,
	"roi_bps" integer NOT NULL,
	"current_balance_cents" integer NOT NULL,
	"total_stake_cents" integer NOT NULL,
	"total_return_cents" integer NOT NULL,
	"settled_slip_count" integer NOT NULL,
	"won_slip_count" integer NOT NULL,
	"push_void_slip_count" integer NOT NULL,
	"weeks_played" integer NOT NULL,
	"weeks_survived" integer NOT NULL,
	"win_rate_bps" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arena_season" ADD CONSTRAINT "arena_season_valid_window" CHECK ("starts_at" < "ends_at");--> statement-breakpoint
ALTER TABLE "arena_standing" ADD CONSTRAINT "arena_standing_subject_shape" CHECK (
	("kind" = 'league' AND "league_id" = "subject_id" AND "user_id" IS NULL)
	OR ("kind" = 'individual' AND "user_id" = "subject_id" AND "league_id" IS NULL)
);--> statement-breakpoint
ALTER TABLE "arena_standing" ADD CONSTRAINT "arena_standing_season_id_arena_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."arena_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_standing" ADD CONSTRAINT "arena_standing_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_standing" ADD CONSTRAINT "arena_standing_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "arena_season_window_unique" ON "arena_season" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "arena_season_ends_idx" ON "arena_season" USING btree ("ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "arena_standing_subject_unique" ON "arena_standing" USING btree ("season_id","kind","subject_id");--> statement-breakpoint
CREATE INDEX "arena_standing_leaderboard_idx" ON "arena_standing" USING btree ("season_id","kind","rank");--> statement-breakpoint
CREATE INDEX "arena_standing_league_idx" ON "arena_standing" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "arena_standing_user_idx" ON "arena_standing" USING btree ("user_id");
