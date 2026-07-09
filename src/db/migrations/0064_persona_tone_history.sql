CREATE TABLE "ai_persona_tone_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"persona_card_id" uuid NOT NULL,
	"persona" "ai_persona" NOT NULL,
	"tone_version" integer NOT NULL,
	"tone_profile" jsonb NOT NULL,
	"tone_updated_by" text,
	"tone_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'edit' NOT NULL,
	"source_tone_version" integer,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_persona_tone_history_version_positive" CHECK ("ai_persona_tone_history"."tone_version" > 0),
	CONSTRAINT "ai_persona_tone_history_source_valid" CHECK ("ai_persona_tone_history"."source" IN ('seed', 'edit', 'rollback'))
);
--> statement-breakpoint
ALTER TABLE "ai_persona_tone_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_persona_tone_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_persona_tone_history" ADD CONSTRAINT "ai_persona_tone_history_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_persona_tone_history" ADD CONSTRAINT "ai_persona_tone_history_persona_card_id_ai_persona_card_id_fk" FOREIGN KEY ("persona_card_id") REFERENCES "public"."ai_persona_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_persona_tone_history_league_persona_version_unique" ON "ai_persona_tone_history" USING btree ("league_id","persona","tone_version");--> statement-breakpoint
CREATE INDEX "ai_persona_tone_history_card_created_idx" ON "ai_persona_tone_history" USING btree ("league_id","persona_card_id","created_at");--> statement-breakpoint
CREATE POLICY "ai_persona_tone_history_isolation" ON "ai_persona_tone_history" AS PERMISSIVE FOR ALL TO public USING ("ai_persona_tone_history"."league_id" = current_league_id()) WITH CHECK ("ai_persona_tone_history"."league_id" = current_league_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_ai_persona_tone_history_mutation()
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

  RAISE EXCEPTION 'ai_persona_tone_history is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ai_persona_tone_history_append_only
BEFORE UPDATE OR DELETE ON "ai_persona_tone_history"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_persona_tone_history_mutation();
