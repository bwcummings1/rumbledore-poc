CREATE TYPE "public"."push_subscription_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"endpoint_hash" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_secret" text NOT NULL,
	"expiration_time" timestamp with time zone,
	"user_agent" text,
	"status" "push_subscription_status" DEFAULT 'active' NOT NULL,
	"disabled_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscription" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_member_endpoint_unique" ON "push_subscription" USING btree ("league_id","user_id","endpoint_hash");--> statement-breakpoint
CREATE INDEX "push_subscription_league_active_idx" ON "push_subscription" USING btree ("league_id","status","user_id");--> statement-breakpoint
CREATE INDEX "push_subscription_endpoint_hash_idx" ON "push_subscription" USING btree ("endpoint_hash");--> statement-breakpoint
CREATE POLICY "push_subscription_isolation" ON "push_subscription" AS PERMISSIVE FOR ALL TO public USING ("push_subscription"."league_id" = current_league_id()) WITH CHECK ("push_subscription"."league_id" = current_league_id());
