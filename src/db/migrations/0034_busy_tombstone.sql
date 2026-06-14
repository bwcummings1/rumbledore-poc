ALTER TABLE "arena_standing" ADD COLUMN "previous_rank" integer;--> statement-breakpoint
ALTER TABLE "arena_standing" ADD COLUMN "rank_delta" integer DEFAULT 0 NOT NULL;