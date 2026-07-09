CREATE TYPE "public"."content_reaction_emoji" AS ENUM('fire', 'skull', 'laugh', 'trash');--> statement-breakpoint
CREATE TYPE "public"."member_roast_level" AS ENUM('full_send', 'light', 'off_limits');--> statement-breakpoint
ALTER TYPE "public"."editorial_action" ADD VALUE IF NOT EXISTS 'roast_consent';--> statement-breakpoint
ALTER TABLE "fantasy_members" ADD COLUMN "roast_level" "member_roast_level" DEFAULT 'light' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "roast_level" "member_roast_level" DEFAULT 'light' NOT NULL;--> statement-breakpoint
CREATE TABLE "content_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"emoji" "content_reaction_emoji" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_reactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_reactions" ADD CONSTRAINT "content_reactions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reactions" ADD CONSTRAINT "content_reactions_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reactions" ADD CONSTRAINT "content_reactions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reactions_member_content_unique" ON "content_reactions" USING btree ("league_id","content_item_id","member_id");--> statement-breakpoint
CREATE INDEX "content_reactions_content_idx" ON "content_reactions" USING btree ("league_id","content_item_id");--> statement-breakpoint
CREATE INDEX "content_reactions_member_idx" ON "content_reactions" USING btree ("league_id","member_id");--> statement-breakpoint
CREATE POLICY "content_reactions_isolation" ON "content_reactions" AS PERMISSIVE FOR ALL TO public USING ("content_reactions"."league_id" = current_league_id()) WITH CHECK ("content_reactions"."league_id" = current_league_id());--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD COLUMN "target_member_id" uuid;--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD COLUMN "target_fantasy_member_id" uuid;--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_target_member_id_members_id_fk" FOREIGN KEY ("target_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_target_fantasy_member_id_fantasy_members_id_fk" FOREIGN KEY ("target_fantasy_member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editorial_actions_member_idx" ON "editorial_actions" USING btree ("league_id","target_member_id","created_at");--> statement-breakpoint
CREATE INDEX "editorial_actions_fantasy_member_idx" ON "editorial_actions" USING btree ("league_id","target_fantasy_member_id","created_at");--> statement-breakpoint
ALTER TABLE "editorial_actions" DROP CONSTRAINT "editorial_actions_target_required";--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_target_required" CHECK (
	"editorial_actions"."target_content_item_id" IS NOT NULL
	OR "editorial_actions"."target_persona_card_id" IS NOT NULL
	OR "editorial_actions"."target_member_id" IS NOT NULL
	OR "editorial_actions"."target_fantasy_member_id" IS NOT NULL
);
