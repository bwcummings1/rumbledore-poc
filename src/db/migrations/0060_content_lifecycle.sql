CREATE TYPE "public"."content_item_status" AS ENUM('published', 'superseded', 'retracted');--> statement-breakpoint
ALTER TYPE "public"."push_notification_type" ADD VALUE IF NOT EXISTS 'content.retracted';--> statement-breakpoint
ALTER TYPE "public"."push_notification_type" ADD VALUE IF NOT EXISTS 'content.superseded';--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "status" "content_item_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "supersedes_content_item_id" uuid;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_supersedes_content_item_id_content_item_id_fk" FOREIGN KEY ("supersedes_content_item_id") REFERENCES "public"."content_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_item_league_status_published_idx" ON "content_item" USING btree ("league_id","status","published_at");--> statement-breakpoint
CREATE INDEX "content_item_central_status_published_idx" ON "content_item" USING btree ("kind","status","published_at");
