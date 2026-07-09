CREATE TYPE "public"."editorial_action" AS ENUM('retract', 'regenerate', 'correct', 'tone_edit', 'tone_rollback');--> statement-breakpoint
CREATE TABLE "editorial_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" "editorial_action" NOT NULL,
	"target_content_item_id" uuid,
	"target_persona_card_id" uuid,
	"reason" text DEFAULT '' NOT NULL,
	"before_content_item_id" uuid,
	"after_content_item_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_actions_target_required" CHECK ("editorial_actions"."target_content_item_id" IS NOT NULL OR "editorial_actions"."target_persona_card_id" IS NOT NULL),
	CONSTRAINT "editorial_actions_retract_reason_required" CHECK ("editorial_actions"."action" <> 'retract' OR length(btrim("editorial_actions"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "editorial_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "editorial_actions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_target_content_item_id_content_item_id_fk" FOREIGN KEY ("target_content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_target_persona_card_id_ai_persona_card_id_fk" FOREIGN KEY ("target_persona_card_id") REFERENCES "public"."ai_persona_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_before_content_item_id_content_item_id_fk" FOREIGN KEY ("before_content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_after_content_item_id_content_item_id_fk" FOREIGN KEY ("after_content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editorial_actions_league_created_idx" ON "editorial_actions" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE INDEX "editorial_actions_content_idx" ON "editorial_actions" USING btree ("league_id","target_content_item_id","created_at");--> statement-breakpoint
CREATE INDEX "editorial_actions_persona_idx" ON "editorial_actions" USING btree ("league_id","target_persona_card_id","created_at");--> statement-breakpoint
CREATE POLICY "editorial_actions_isolation" ON "editorial_actions" AS PERMISSIVE FOR ALL TO public USING ("editorial_actions"."league_id" = current_league_id()) WITH CHECK ("editorial_actions"."league_id" = current_league_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_editorial_actions_mutation()
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

  RAISE EXCEPTION 'editorial_actions is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER editorial_actions_append_only
BEFORE UPDATE OR DELETE ON "editorial_actions"
FOR EACH ROW EXECUTE FUNCTION prevent_editorial_actions_mutation();
