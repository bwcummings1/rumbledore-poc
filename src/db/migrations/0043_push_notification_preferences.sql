CREATE TYPE "public"."push_notification_type" AS ENUM('league.bet.settled', 'league.blog.published', 'league.lore.vote.opened', 'league.lore.canonized', 'arena.rival.passed');--> statement-breakpoint
CREATE TABLE "push_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "push_notification_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_notification_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_notification_preferences" ADD CONSTRAINT "push_notification_preferences_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_preferences" ADD CONSTRAINT "push_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_preferences_user_type_unique" ON "push_notification_preferences" USING btree ("league_id","user_id","type");--> statement-breakpoint
CREATE INDEX "push_notification_preferences_league_type_idx" ON "push_notification_preferences" USING btree ("league_id","type","enabled");--> statement-breakpoint
CREATE POLICY "push_notification_preferences_isolation" ON "push_notification_preferences" AS PERMISSIVE FOR ALL TO public USING ("push_notification_preferences"."league_id" = current_league_id()) WITH CHECK ("push_notification_preferences"."league_id" = current_league_id());
