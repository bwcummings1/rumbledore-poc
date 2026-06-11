CREATE TYPE "public"."ai_generation_status" AS ENUM('running', 'published', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_memory_source" AS ENUM('blog_post', 'league_fact', 'storyline');--> statement-breakpoint
CREATE TYPE "public"."ai_persona" AS ENUM('commissioner', 'analyst', 'narrator', 'trash_talker', 'betting_advisor');--> statement-breakpoint
CREATE TYPE "public"."content_item_kind" AS ENUM('news', 'blog', 'ingest_event');--> statement-breakpoint
CREATE TABLE "ai_generation_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"persona" "ai_persona" NOT NULL,
	"trigger_key" text NOT NULL,
	"status" "ai_generation_status" DEFAULT 'running' NOT NULL,
	"content_item_id" uuid,
	"skip_reason" text,
	"prompt_prefix_hash" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generation_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_generation_run" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"content_item_id" uuid,
	"source" "ai_memory_source" NOT NULL,
	"text_content" text NOT NULL,
	"embedding" vector NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dimensions" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_memory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_memory" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_persona_card" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"persona" "ai_persona" NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"tone" text NOT NULL,
	"prompt_template" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"min_words" integer DEFAULT 80 NOT NULL,
	"max_words" integer DEFAULT 220 NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_persona_card" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_persona_card" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid,
	"kind" "content_item_kind" NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"source" text,
	"source_url" text,
	"author_persona" "ai_persona",
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedup_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_generation_run" ADD CONSTRAINT "ai_generation_run_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_run" ADD CONSTRAINT "ai_generation_run_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memory" ADD CONSTRAINT "ai_memory_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_persona_card" ADD CONSTRAINT "ai_persona_card_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_generation_run_idempotency_unique" ON "ai_generation_run" USING btree ("league_id","persona","trigger_key");--> statement-breakpoint
CREATE INDEX "ai_generation_run_league_status_idx" ON "ai_generation_run" USING btree ("league_id","status");--> statement-breakpoint
CREATE INDEX "ai_memory_league_source_idx" ON "ai_memory" USING btree ("league_id","source");--> statement-breakpoint
CREATE INDEX "ai_memory_content_item_idx" ON "ai_memory" USING btree ("content_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_persona_card_league_persona_unique" ON "ai_persona_card" USING btree ("league_id","persona");--> statement-breakpoint
CREATE INDEX "ai_persona_card_league_enabled_idx" ON "ai_persona_card" USING btree ("league_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "content_item_scope_dedup_unique" ON "content_item" USING btree ("league_id","kind","dedup_key");--> statement-breakpoint
CREATE INDEX "content_item_league_published_idx" ON "content_item" USING btree ("league_id","published_at");--> statement-breakpoint
CREATE INDEX "content_item_central_published_idx" ON "content_item" USING btree ("kind","published_at");--> statement-breakpoint
CREATE POLICY "ai_generation_run_isolation" ON "ai_generation_run" AS PERMISSIVE FOR ALL TO public USING ("ai_generation_run"."league_id" = current_league_id()) WITH CHECK ("ai_generation_run"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "ai_memory_isolation" ON "ai_memory" AS PERMISSIVE FOR ALL TO public USING ("ai_memory"."league_id" = current_league_id()) WITH CHECK ("ai_memory"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "ai_persona_card_isolation" ON "ai_persona_card" AS PERMISSIVE FOR ALL TO public USING ("ai_persona_card"."league_id" = current_league_id()) WITH CHECK ("ai_persona_card"."league_id" = current_league_id());--> statement-breakpoint
CREATE POLICY "content_item_scope_policy" ON "content_item" AS PERMISSIVE FOR ALL TO public USING ("content_item"."league_id" is null or "content_item"."league_id" = current_league_id()) WITH CHECK ("content_item"."league_id" is null or "content_item"."league_id" = current_league_id());
