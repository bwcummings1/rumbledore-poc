ALTER TABLE "ai_generation_run" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "editorial_actions" DROP CONSTRAINT IF EXISTS "editorial_actions_target_required";
--> statement-breakpoint
ALTER TABLE "editorial_actions" DROP CONSTRAINT "editorial_actions_target_content_item_id_content_item_id_fk";
--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_target_content_item_id_content_item_id_fk" FOREIGN KEY ("target_content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;
