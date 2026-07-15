ALTER TYPE "public"."ai_memory_source" ADD VALUE IF NOT EXISTS 'central_article';--> statement-breakpoint
ALTER TABLE "ai_memory" ALTER COLUMN "league_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_scope_source_check" CHECK (("ai_memory"."league_id" IS NULL AND "ai_memory"."source"::text = 'central_article' AND "ai_memory"."content_item_id" IS NOT NULL) OR ("ai_memory"."league_id" IS NOT NULL AND "ai_memory"."source"::text <> 'central_article'));--> statement-breakpoint
DROP POLICY "ai_memory_isolation" ON "ai_memory";--> statement-breakpoint
CREATE POLICY "ai_memory_scope_policy" ON "ai_memory" AS PERMISSIVE FOR ALL TO public USING (("ai_memory"."league_id" IS NULL AND "ai_memory"."source"::text = 'central_article') OR "ai_memory"."league_id" = current_league_id()) WITH CHECK (("ai_memory"."league_id" IS NULL AND "ai_memory"."source"::text = 'central_article') OR "ai_memory"."league_id" = current_league_id());--> statement-breakpoint
CREATE UNIQUE INDEX "ai_memory_central_content_item_unique" ON "ai_memory" USING btree ("content_item_id") WHERE "ai_memory"."league_id" IS NULL;--> statement-breakpoint
CREATE INDEX "ai_memory_central_source_model_idx" ON "ai_memory" USING btree ("source","embedding_model","embedding_dimensions","created_at") WHERE "ai_memory"."league_id" IS NULL;
