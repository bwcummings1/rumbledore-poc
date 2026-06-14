CREATE TYPE "public"."instigation_kind" AS ENUM('settle_it_poll', 'villain_crown', 'manufactured_rivalry', 'user_move_reaction');--> statement-breakpoint
CREATE TYPE "public"."instigation_status" AS ENUM('open', 'polling', 'resolved', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."lore_claim_kind" AS ENUM('data_verifiable', 'opinion');--> statement-breakpoint
CREATE TYPE "public"."lore_claim_origin" AS ENUM('member', 'ai');--> statement-breakpoint
CREATE TYPE "public"."lore_claim_ratified_by" AS ENUM('verified', 'vote', 'steward');--> statement-breakpoint
CREATE TYPE "public"."lore_claim_status" AS ENUM('draft', 'voting', 'canon', 'rejected', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."lore_event_kind" AS ENUM('created', 'vote_opened', 'ratified', 'rejected', 'disputed', 'steward_action');--> statement-breakpoint
CREATE TYPE "public"."poll_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "instigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"persona" "ai_persona" NOT NULL,
	"kind" "instigation_kind" NOT NULL,
	"status" "instigation_status" DEFAULT 'open' NOT NULL,
	"dedup_key" text NOT NULL,
	"prompt_text" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grounding_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_item_id" uuid,
	"resolution" jsonb DEFAULT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instigations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "instigations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lore_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"kind" "lore_claim_kind" NOT NULL,
	"status" "lore_claim_status" NOT NULL,
	"origin" "lore_claim_origin" NOT NULL,
	"author_member_id" uuid,
	"author_persona" "ai_persona",
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_instigation_id" uuid,
	"source_poll_id" uuid,
	"ratified_at" timestamp with time zone,
	"ratified_by" "lore_claim_ratified_by",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lore_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lore_claims" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lore_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"kind" "lore_event_kind" NOT NULL,
	"actor_member_id" uuid,
	"before_state" jsonb DEFAULT NULL,
	"after_state" jsonb DEFAULT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lore_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lore_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"poll_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"option_idx" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poll_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "poll_votes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"instigation_id" uuid NOT NULL,
	"question" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "poll_status" DEFAULT 'open' NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"winning_option_idx" integer,
	"result" jsonb DEFAULT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "polls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "polls" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "instigations" ADD CONSTRAINT "instigations_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instigations" ADD CONSTRAINT "instigations_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD CONSTRAINT "lore_claims_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD CONSTRAINT "lore_claims_author_member_id_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD CONSTRAINT "lore_claims_source_instigation_id_instigations_id_fk" FOREIGN KEY ("source_instigation_id") REFERENCES "public"."instigations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD CONSTRAINT "lore_claims_source_poll_id_polls_id_fk" FOREIGN KEY ("source_poll_id") REFERENCES "public"."polls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_events" ADD CONSTRAINT "lore_events_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_events" ADD CONSTRAINT "lore_events_claim_id_lore_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."lore_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_events" ADD CONSTRAINT "lore_events_actor_member_id_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_instigation_id_instigations_id_fk" FOREIGN KEY ("instigation_id") REFERENCES "public"."instigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instigations_dedup_unique" ON "instigations" USING btree ("league_id","dedup_key");--> statement-breakpoint
CREATE INDEX "instigations_league_status_idx" ON "instigations" USING btree ("league_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lore_claims_source_poll_unique" ON "lore_claims" USING btree ("league_id","source_poll_id");--> statement-breakpoint
CREATE INDEX "lore_claims_league_status_idx" ON "lore_claims" USING btree ("league_id","status","created_at");--> statement-breakpoint
CREATE INDEX "lore_claims_source_instigation_idx" ON "lore_claims" USING btree ("league_id","source_instigation_id");--> statement-breakpoint
CREATE INDEX "lore_events_claim_idx" ON "lore_events" USING btree ("league_id","claim_id");--> statement-breakpoint
CREATE INDEX "lore_events_league_created_idx" ON "lore_events" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "poll_votes_member_unique" ON "poll_votes" USING btree ("league_id","poll_id","member_id");--> statement-breakpoint
CREATE INDEX "poll_votes_poll_idx" ON "poll_votes" USING btree ("league_id","poll_id");--> statement-breakpoint
CREATE UNIQUE INDEX "polls_instigation_unique" ON "polls" USING btree ("league_id","instigation_id");--> statement-breakpoint
CREATE INDEX "polls_league_status_close_idx" ON "polls" USING btree ("league_id","status","closes_at");--> statement-breakpoint
CREATE POLICY "instigations_isolation" ON "instigations" AS PERMISSIVE FOR ALL TO public USING ("instigations"."league_id" = current_league_id()) WITH CHECK ("instigations"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "lore_claims_isolation" ON "lore_claims" AS PERMISSIVE FOR ALL TO public USING ("lore_claims"."league_id" = current_league_id()) WITH CHECK ("lore_claims"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "lore_events_isolation" ON "lore_events" AS PERMISSIVE FOR ALL TO public USING ("lore_events"."league_id" = current_league_id()) WITH CHECK ("lore_events"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "poll_votes_isolation" ON "poll_votes" AS PERMISSIVE FOR ALL TO public USING ("poll_votes"."league_id" = current_league_id()) WITH CHECK ("poll_votes"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "polls_isolation" ON "polls" AS PERMISSIVE FOR ALL TO public USING ("polls"."league_id" = current_league_id()) WITH CHECK ("polls"."league_id" = current_league_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_lore_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'lore_events is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER lore_events_append_only
BEFORE UPDATE OR DELETE ON "lore_events"
FOR EACH ROW EXECUTE FUNCTION prevent_lore_events_mutation();
