ALTER TYPE "public"."data_integrity_check_key" ADD VALUE IF NOT EXISTS 'postseason_derivation_confidence';--> statement-breakpoint
ALTER TABLE "provider_final_standings" ADD COLUMN "rank_source" text DEFAULT 'provider_reported' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_final_standings" ADD COLUMN "rank_confidence" text DEFAULT 'high' NOT NULL;
