ALTER TABLE "ai_generation_run" ADD COLUMN "prompt_template_id" text;--> statement-breakpoint
ALTER TABLE "ai_generation_run" ADD COLUMN "prompt_template_version" integer;--> statement-breakpoint
ALTER TABLE "ai_generation_run" ADD COLUMN "tone_version" integer;--> statement-breakpoint
ALTER TABLE "ai_generation_run" ADD COLUMN "model_provider_key" text;
