CREATE TABLE "league_member_identity_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"fantasy_member_id" uuid,
	"source_invite_id" uuid,
	"provider" "fantasy_provider" NOT NULL,
	"provider_member_id" text NOT NULL,
	"provider_team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_member_identity_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_member_identity_claims" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_invites" ADD COLUMN "accepted_user_id" uuid;--> statement-breakpoint
ALTER TABLE "league_invites" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "league_member_identity_claims" ADD CONSTRAINT "league_member_identity_claims_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_member_identity_claims" ADD CONSTRAINT "league_member_identity_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_member_identity_claims" ADD CONSTRAINT "league_member_identity_claims_fantasy_member_id_fantasy_members_id_fk" FOREIGN KEY ("fantasy_member_id") REFERENCES "public"."fantasy_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_member_identity_claims" ADD CONSTRAINT "league_member_identity_claims_source_invite_id_league_invites_id_fk" FOREIGN KEY ("source_invite_id") REFERENCES "public"."league_invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_member_identity_user_provider_unique" ON "league_member_identity_claims" USING btree ("league_id","user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "league_member_identity_provider_member_unique" ON "league_member_identity_claims" USING btree ("league_id","provider","provider_member_id");--> statement-breakpoint
CREATE INDEX "league_member_identity_league_idx" ON "league_member_identity_claims" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "league_member_identity_user_idx" ON "league_member_identity_claims" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "league_member_identity_claims_isolation" ON "league_member_identity_claims" AS PERMISSIVE FOR ALL TO public USING ("league_member_identity_claims"."league_id" = current_league_id()) WITH CHECK ("league_member_identity_claims"."league_id" = current_league_id());
