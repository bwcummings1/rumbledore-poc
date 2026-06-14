CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
DROP INDEX "league_invites_token_unique";--> statement-breakpoint
ALTER TABLE "league_invites" RENAME COLUMN "token" TO "token_hash";--> statement-breakpoint
UPDATE "league_invites" SET "token_hash" = encode(digest('league-invite:' || "token_hash", 'sha256'), 'hex');--> statement-breakpoint
CREATE UNIQUE INDEX "league_invites_token_hash_unique" ON "league_invites" USING btree ("token_hash");
