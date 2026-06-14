CREATE TYPE "public"."lore_claim_relation" AS ENUM('root', 'response', 'addendum', 'dispute', 'relitigation');--> statement-breakpoint
CREATE TYPE "public"."lore_claim_verification" AS ENUM('verified', 'refuted', 'unverifiable', 'n_a');--> statement-breakpoint
CREATE TYPE "public"."lore_subject_type" AS ENUM('person', 'rivalry', 'season', 'week', 'record');--> statement-breakpoint
CREATE TYPE "public"."lore_verification_result" AS ENUM('match', 'contradiction', 'uncheckable');--> statement-breakpoint
CREATE TYPE "public"."lore_vote_choice" AS ENUM('affirm', 'reject', 'abstain');--> statement-breakpoint
ALTER TYPE "public"."lore_event_kind" ADD VALUE 'voted' BEFORE 'ratified';--> statement-breakpoint
ALTER TYPE "public"."lore_event_kind" ADD VALUE 'superseded' BEFORE 'steward_action';--> statement-breakpoint
ALTER TYPE "public"."lore_event_kind" ADD VALUE 'edited';--> statement-breakpoint
ALTER TYPE "public"."lore_event_kind" ADD VALUE 'withdrawn';--> statement-breakpoint
CREATE TABLE "lore_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"subject_type" "lore_subject_type" NOT NULL,
	"person_id" uuid,
	"person_a_id" uuid,
	"person_b_id" uuid,
	"head_to_head_record_id" uuid,
	"all_time_record_id" uuid,
	"season" integer,
	"week" integer,
	"record_type" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lore_subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lore_subjects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lore_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"result" "lore_verification_result" NOT NULL,
	"asserted_value" text NOT NULL,
	"actual_value" text,
	"weekly_statistic_id" uuid,
	"season_statistic_id" uuid,
	"all_time_record_id" uuid,
	"matched_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lore_verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lore_verifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lore_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"voter_member_id" uuid NOT NULL,
	"choice" "lore_vote_choice" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lore_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lore_votes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lore_claims" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "lore_claims"
SET "status" = CASE "status"
	WHEN 'draft' THEN 'pending'
	WHEN 'voting' THEN 'vote'
	ELSE "status"
END;--> statement-breakpoint
DROP TYPE "public"."lore_claim_status";--> statement-breakpoint
CREATE TYPE "public"."lore_claim_status" AS ENUM('pending', 'vote', 'canon', 'disputed', 'rejected', 'superseded', 'withdrawn');--> statement-breakpoint
ALTER TABLE "lore_claims" ALTER COLUMN "status" SET DATA TYPE "public"."lore_claim_status" USING "status"::"public"."lore_claim_status";--> statement-breakpoint
ALTER TABLE "lore_claims" ADD COLUMN "verification" "lore_claim_verification" DEFAULT 'n_a' NOT NULL;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD COLUMN "body" text;--> statement-breakpoint
UPDATE "lore_claims" SET "body" = "statement";--> statement-breakpoint
ALTER TABLE "lore_claims" ALTER COLUMN "body" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD COLUMN "branch_of" uuid;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD COLUMN "relation" "lore_claim_relation" DEFAULT 'root' NOT NULL;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD COLUMN "thread_root_id" uuid;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD COLUMN "vote_opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD COLUMN "vote_closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lore_subjects" ADD CONSTRAINT "lore_subjects_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_subjects" ADD CONSTRAINT "lore_subjects_claim_id_lore_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."lore_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_subjects" ADD CONSTRAINT "lore_subjects_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_subjects" ADD CONSTRAINT "lore_subjects_person_a_id_person_id_fk" FOREIGN KEY ("person_a_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_subjects" ADD CONSTRAINT "lore_subjects_person_b_id_person_id_fk" FOREIGN KEY ("person_b_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_subjects" ADD CONSTRAINT "lore_subjects_head_to_head_record_id_head_to_head_record_id_fk" FOREIGN KEY ("head_to_head_record_id") REFERENCES "public"."head_to_head_record"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_subjects" ADD CONSTRAINT "lore_subjects_all_time_record_id_all_time_record_id_fk" FOREIGN KEY ("all_time_record_id") REFERENCES "public"."all_time_record"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_verifications" ADD CONSTRAINT "lore_verifications_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_verifications" ADD CONSTRAINT "lore_verifications_claim_id_lore_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."lore_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_verifications" ADD CONSTRAINT "lore_verifications_weekly_statistic_id_weekly_statistics_id_fk" FOREIGN KEY ("weekly_statistic_id") REFERENCES "public"."weekly_statistics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_verifications" ADD CONSTRAINT "lore_verifications_season_statistic_id_season_statistics_id_fk" FOREIGN KEY ("season_statistic_id") REFERENCES "public"."season_statistics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_verifications" ADD CONSTRAINT "lore_verifications_all_time_record_id_all_time_record_id_fk" FOREIGN KEY ("all_time_record_id") REFERENCES "public"."all_time_record"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_votes" ADD CONSTRAINT "lore_votes_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_votes" ADD CONSTRAINT "lore_votes_claim_id_lore_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."lore_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_votes" ADD CONSTRAINT "lore_votes_voter_member_id_members_id_fk" FOREIGN KEY ("voter_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lore_subjects_claim_idx" ON "lore_subjects" USING btree ("league_id","claim_id");--> statement-breakpoint
CREATE INDEX "lore_subjects_person_idx" ON "lore_subjects" USING btree ("league_id","person_id");--> statement-breakpoint
CREATE INDEX "lore_subjects_rivalry_idx" ON "lore_subjects" USING btree ("league_id","person_a_id","person_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lore_verifications_claim_unique" ON "lore_verifications" USING btree ("league_id","claim_id");--> statement-breakpoint
CREATE INDEX "lore_verifications_result_idx" ON "lore_verifications" USING btree ("league_id","result");--> statement-breakpoint
CREATE UNIQUE INDEX "lore_votes_member_unique" ON "lore_votes" USING btree ("league_id","claim_id","voter_member_id");--> statement-breakpoint
CREATE INDEX "lore_votes_claim_idx" ON "lore_votes" USING btree ("league_id","claim_id");--> statement-breakpoint
ALTER TABLE "lore_claims" ADD CONSTRAINT "lore_claims_branch_of_lore_claims_id_fk" FOREIGN KEY ("branch_of") REFERENCES "public"."lore_claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_claims" ADD CONSTRAINT "lore_claims_thread_root_id_lore_claims_id_fk" FOREIGN KEY ("thread_root_id") REFERENCES "public"."lore_claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lore_claims_branch_idx" ON "lore_claims" USING btree ("league_id","branch_of");--> statement-breakpoint
CREATE INDEX "lore_claims_thread_idx" ON "lore_claims" USING btree ("league_id","thread_root_id");--> statement-breakpoint
CREATE INDEX "lore_claims_vote_close_idx" ON "lore_claims" USING btree ("league_id","status","vote_closes_at");--> statement-breakpoint
CREATE POLICY "lore_subjects_isolation" ON "lore_subjects" AS PERMISSIVE FOR ALL TO public USING ("lore_subjects"."league_id" = current_league_id()) WITH CHECK ("lore_subjects"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "lore_verifications_isolation" ON "lore_verifications" AS PERMISSIVE FOR ALL TO public USING ("lore_verifications"."league_id" = current_league_id()) WITH CHECK ("lore_verifications"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "lore_votes_isolation" ON "lore_votes" AS PERMISSIVE FOR ALL TO public USING ("lore_votes"."league_id" = current_league_id()) WITH CHECK ("lore_votes"."league_id" = current_league_id());
