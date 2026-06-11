ALTER TABLE "league_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "members" ("organization_id", "user_id", "role", "created_at", "updated_at")
SELECT "league_id", "user_id", "role", "created_at", "updated_at"
FROM "league_members"
ON CONFLICT ("organization_id", "user_id") DO NOTHING;--> statement-breakpoint
DROP POLICY "league_members_isolation" ON "league_members" CASCADE;--> statement-breakpoint
DROP TABLE "league_members" CASCADE;
