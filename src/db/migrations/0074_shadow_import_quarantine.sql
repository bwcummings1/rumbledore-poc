CREATE TYPE "public"."onboarding_import_state" AS ENUM('shadow_running', 'quarantined', 'live');--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD COLUMN "imported_league_id" uuid;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD COLUMN "import_state" "onboarding_import_state";--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD COLUMN "import_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD COLUMN "integrity_failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD COLUMN "quarantine_manifest" jsonb DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD COLUMN "shadow_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD COLUMN "quarantined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD COLUMN "live_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD CONSTRAINT "onboarding_discovered_leagues_imported_league_id_leagues_id_fk" FOREIGN KEY ("imported_league_id") REFERENCES "public"."leagues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD CONSTRAINT "onboarding_discovered_leagues_import_attempts_nonnegative" CHECK ("onboarding_discovered_leagues"."import_attempts" >= 0);--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD CONSTRAINT "onboarding_discovered_leagues_integrity_failure_count_nonnegative" CHECK ("onboarding_discovered_leagues"."integrity_failure_count" >= 0);--> statement-breakpoint
CREATE INDEX "onboarding_discovered_leagues_import_state_idx" ON "onboarding_discovered_leagues" USING btree ("user_id","import_state");--> statement-breakpoint
UPDATE "onboarding_discovered_leagues" AS discovered
SET
	"imported_league_id" = imported."league_id",
	"import_state" = 'live'::"onboarding_import_state",
	"import_attempts" = 1,
	"live_at" = now()
FROM (
	SELECT DISTINCT ON (discovery."id")
		discovery."id" AS "discovery_id",
		league."id" AS "league_id"
	FROM "onboarding_discovered_leagues" AS discovery
	INNER JOIN "leagues" AS league
		ON league."provider" = discovery."provider"
		AND league."provider_league_id" = discovery."provider_league_id"
		AND league."season" = discovery."season"
	INNER JOIN "members" AS membership
		ON membership."organization_id" = league."id"
		AND membership."user_id" = discovery."user_id"
	ORDER BY discovery."id", membership."created_at" ASC
) AS imported
WHERE discovered."id" = imported."discovery_id";
