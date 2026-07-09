CREATE TYPE "public"."notification_event_family" AS ENUM('content', 'lore', 'bets', 'arena');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'digest', 'none');--> statement-breakpoint

ALTER TABLE "push_notification_preferences" ADD COLUMN "event_family" "notification_event_family";--> statement-breakpoint
ALTER TABLE "push_notification_preferences" ADD COLUMN "channel" "notification_channel" DEFAULT 'push' NOT NULL;--> statement-breakpoint

UPDATE "push_notification_preferences"
SET
  "event_family" = CASE
    WHEN "type" = 'league.blog.published' THEN 'content'::"notification_event_family"
    WHEN "type" IN ('content.retracted', 'content.superseded') THEN 'content'::"notification_event_family"
    WHEN "type" IN ('league.lore.vote.opened', 'league.lore.canonized') THEN 'lore'::"notification_event_family"
    WHEN "type" = 'league.bet.settled' THEN 'bets'::"notification_event_family"
    WHEN "type" = 'arena.rival.passed' THEN 'arena'::"notification_event_family"
  END,
  "channel" = CASE
    WHEN "enabled" THEN 'push'::"notification_channel"
    ELSE 'none'::"notification_channel"
  END;
--> statement-breakpoint

WITH ranked_preferences AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "league_id", "user_id", "event_family"
      ORDER BY
        CASE "channel"
          WHEN 'none' THEN 0
          WHEN 'push' THEN 1
          WHEN 'digest' THEN 2
        END,
        "updated_at" DESC,
        "id" DESC
    ) AS row_number
  FROM "push_notification_preferences"
)
DELETE FROM "push_notification_preferences"
USING ranked_preferences
WHERE "push_notification_preferences"."id" = ranked_preferences."id"
  AND ranked_preferences.row_number > 1;
--> statement-breakpoint

ALTER TABLE "push_notification_preferences" ALTER COLUMN "event_family" SET NOT NULL;--> statement-breakpoint
DROP INDEX "push_notification_preferences_user_type_unique";--> statement-breakpoint
DROP INDEX "push_notification_preferences_league_type_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "push_notification_preferences_user_family_unique" ON "push_notification_preferences" USING btree ("league_id","user_id","event_family");--> statement-breakpoint
CREATE INDEX "push_notification_preferences_league_family_channel_idx" ON "push_notification_preferences" USING btree ("league_id","event_family","channel");--> statement-breakpoint
ALTER TABLE "push_notification_preferences" ADD CONSTRAINT "push_notification_preferences_enabled_matches_channel" CHECK ("enabled" = ("channel" <> 'none'));
