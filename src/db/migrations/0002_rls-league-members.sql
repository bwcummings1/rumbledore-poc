-- League isolation (spec 02 §6/§7). Hand-extended around the generated
-- ENABLE/CREATE POLICY statements:
--  * current_league_id() — single source of truth for reading the
--    transaction-local `app.current_league_id` setting (set via
--    src/db/rls.ts). NULL when unset/empty, so policies match nothing.
--  * FORCE ROW LEVEL SECURITY — the policy must bind the table OWNER too
--    (on Neon the app connects as the owning role). Note: superusers and
--    BYPASSRLS roles still bypass; never connect the app as one.
CREATE FUNCTION current_league_id() RETURNS uuid
LANGUAGE sql STABLE
RETURN nullif(current_setting('app.current_league_id', true), '')::uuid;--> statement-breakpoint
ALTER TABLE "league_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "league_members_isolation" ON "league_members" AS PERMISSIVE FOR ALL TO public USING ("league_members"."league_id" = current_league_id()) WITH CHECK ("league_members"."league_id" = current_league_id());
