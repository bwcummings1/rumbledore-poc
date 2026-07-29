-- T-008a: collapse `league_admin` into `commissioner` in the `league_role` enum.
--
-- WHY: the two values named one authority level. `ROLE_RANK` (src/auth/guards.ts)
-- already ranked `league_admin` immediately below `commissioner`, and T-008 gave
-- it the identical `leagueData` grant in the ACL (src/auth/permissions.ts), per the
-- maintainer ruling that an admin may do anything an assigned role can
-- (PROJECT_CONTEXT.md Q16/§7.1, DD-5). Two names for one level is a drift hazard:
-- the next edit that touches one and not the other silently reintroduces the
-- disagreement T-008 had just removed.
--
-- DECISION — recreate the type rather than orphan the value. Postgres cannot drop
-- an enum label, so the choices were (a) remap the rows and leave `league_admin`
-- present-but-unused, or (b) remap the rows and rebuild the type without it. We
-- chose (b) deliberately: under (a) the database would still accept a write the
-- TypeScript `LeagueRole` union has no member for, and such a row would read back
-- as a role `ROLE_RANK` cannot score — `ROLE_RANK[role]` would be `undefined`, so
-- `canSatisfyRole` would return false and the guard would deny a user who is in
-- fact a commissioner. Removing the label makes that row unrepresentable instead
-- of merely unexpected. The cost is that this migration is not reversible by a
-- down-migration alone (the pre-image is gone once rows are remapped); that is
-- acceptable because the remap is information-preserving in the only sense that
-- matters — both values granted the same authority.
--
-- The two `league_role` columns are `members.role` and `invitations.role`, both
-- auth-plane tables with no RLS policies, so no policy or FORCE ROW LEVEL
-- SECURITY handling is required here. Names are intentionally left unqualified:
-- migrations run with `search_path = public`, and src/db/db.test.ts replays this
-- file verbatim against a scratch schema to prove the remap.

ALTER TABLE "members" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint

UPDATE "members" SET "role" = 'commissioner' WHERE "role" = 'league_admin';--> statement-breakpoint
UPDATE "invitations" SET "role" = 'commissioner' WHERE "role" = 'league_admin';--> statement-breakpoint

ALTER TYPE "league_role" RENAME TO "league_role__pre_0082";--> statement-breakpoint
CREATE TYPE "league_role" AS ENUM('commissioner', 'data_steward', 'member');--> statement-breakpoint

ALTER TABLE "members" ALTER COLUMN "role" TYPE "league_role" USING "role"::text::"league_role";--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "role" TYPE "league_role" USING "role"::text::"league_role";--> statement-breakpoint

ALTER TABLE "members" ALTER COLUMN "role" SET DEFAULT 'member';--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "role" SET DEFAULT 'member';--> statement-breakpoint

DROP TYPE "league_role__pre_0082";
