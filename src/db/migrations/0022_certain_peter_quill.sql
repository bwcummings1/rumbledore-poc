CREATE TYPE "public"."league_invite_channel" AS ENUM('share', 'sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."league_invite_status" AS ENUM('pending', 'sent', 'accepted', 'canceled');--> statement-breakpoint
CREATE TABLE "league_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"inviter_user_id" uuid NOT NULL,
	"fantasy_member_id" uuid,
	"provider" "fantasy_provider" NOT NULL,
	"provider_member_id" text NOT NULL,
	"provider_team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invitee_display_name" text NOT NULL,
	"team_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channel" "league_invite_channel" NOT NULL,
	"target_hash" text NOT NULL,
	"target_hint" text,
	"token" text NOT NULL,
	"status" "league_invite_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_fantasy_member_id_fantasy_members_id_fk" FOREIGN KEY ("fantasy_member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_invites_token_unique" ON "league_invites" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "league_invites_target_unique" ON "league_invites" USING btree ("league_id","provider","provider_member_id","channel","target_hash");--> statement-breakpoint
CREATE INDEX "league_invites_league_idx" ON "league_invites" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "league_invites_member_idx" ON "league_invites" USING btree ("league_id","provider","provider_member_id");--> statement-breakpoint
CREATE POLICY "league_invites_isolation" ON "league_invites" AS PERMISSIVE FOR ALL TO public USING ("league_invites"."league_id" = current_league_id()) WITH CHECK ("league_invites"."league_id" = current_league_id());
