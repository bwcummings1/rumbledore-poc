CREATE TABLE "record_book_all_time_standing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"seasons" integer DEFAULT 0 NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"win_percentage" numeric(8, 4) DEFAULT 0 NOT NULL,
	"points_for" numeric(14, 4) DEFAULT 0 NOT NULL,
	"points_against" numeric(14, 4) DEFAULT 0 NOT NULL,
	"avg_points_for" numeric(14, 4) DEFAULT 0 NOT NULL,
	"avg_points_against" numeric(14, 4) DEFAULT 0 NOT NULL,
	"point_differential" numeric(14, 4) DEFAULT 0 NOT NULL,
	"career_luck" numeric(12, 4) DEFAULT 0 NOT NULL,
	"championships" integer DEFAULT 0 NOT NULL,
	"runner_ups" integer DEFAULT 0 NOT NULL,
	"playoff_appearances" integer DEFAULT 0 NOT NULL,
	"made_championships" integer DEFAULT 0 NOT NULL,
	"regular_season_titles" integer DEFAULT 0 NOT NULL,
	"best_season" jsonb DEFAULT NULL,
	"worst_season" jsonb DEFAULT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_book_all_time_standing" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "record_book_all_time_standing" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "record_book_milestone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"milestone_key" text NOT NULL,
	"milestone_type" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"person_id" uuid,
	"provider_player_id" text,
	"season" integer,
	"label" text NOT NULL,
	"value" numeric(14, 4) DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_book_milestone" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "record_book_milestone" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "record_book_all_time_standing" ADD CONSTRAINT "record_book_all_time_standing_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_book_all_time_standing" ADD CONSTRAINT "record_book_all_time_standing_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_book_milestone" ADD CONSTRAINT "record_book_milestone_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_book_milestone" ADD CONSTRAINT "record_book_milestone_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "record_book_all_time_standing_person_unique" ON "record_book_all_time_standing" USING btree ("league_id","person_id");--> statement-breakpoint
CREATE INDEX "record_book_all_time_standing_rank_idx" ON "record_book_all_time_standing" USING btree ("league_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "record_book_milestone_key_unique" ON "record_book_milestone" USING btree ("league_id","milestone_key");--> statement-breakpoint
CREATE INDEX "record_book_milestone_type_idx" ON "record_book_milestone" USING btree ("league_id","milestone_type");--> statement-breakpoint
CREATE INDEX "record_book_milestone_person_idx" ON "record_book_milestone" USING btree ("league_id","person_id");--> statement-breakpoint
CREATE POLICY "record_book_all_time_standing_isolation" ON "record_book_all_time_standing" AS PERMISSIVE FOR ALL TO public USING ("record_book_all_time_standing"."league_id" = current_league_id()) WITH CHECK ("record_book_all_time_standing"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "record_book_milestone_isolation" ON "record_book_milestone" AS PERMISSIVE FOR ALL TO public USING ("record_book_milestone"."league_id" = current_league_id()) WITH CHECK ("record_book_milestone"."league_id" = current_league_id());
