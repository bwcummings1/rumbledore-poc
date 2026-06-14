ALTER TYPE "public"."ai_persona" ADD VALUE 'beat_reporter' BEFORE 'betting_advisor';--> statement-breakpoint
ALTER TABLE "ai_persona_card" ADD COLUMN "beat" text;--> statement-breakpoint
ALTER TABLE "ai_persona_card" ADD COLUMN "point_of_view" text;--> statement-breakpoint
ALTER TABLE "ai_persona_card" ADD COLUMN "performs_when" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
UPDATE "ai_persona_card"
SET
	"beat" = CASE "persona"::text
		WHEN 'commissioner' THEN 'League-official framing, standings, schedule, rulings/adjudication.'
		WHEN 'analyst' THEN 'Matchups, projections-vs-results, trends, start/sit, and record math.'
		WHEN 'narrator' THEN 'Editorial recaps that weave results, history, rivalry, and canon into story.'
		WHEN 'trash_talker' THEN 'Roasts, rivalry needling, callbacks to past failures, and affectionate antagonism.'
		WHEN 'betting_advisor' THEN 'Paper-betting markets, odds movement, bankroll context, and value angles.'
		ELSE 'League-specific editorial coverage.'
	END,
	"point_of_view" = CASE "persona"::text
		WHEN 'commissioner' THEN 'Warm, authoritative, and league-first; speaks for the room and settles disputes without grandstanding.'
		WHEN 'analyst' THEN 'Dry, credible, and numbers-first; undercuts narrative with data and never hypes.'
		WHEN 'narrator' THEN 'Editorial and literary; mythologizes the week''s biggest beat without inventing facts.'
		WHEN 'trash_talker' THEN 'Irreverent and punchy; antagonizes affectionately, crowns villains, and names chokers without cruelty.'
		WHEN 'betting_advisor' THEN 'Confident but hedged; treats every angle as play-money only and never invokes real sportsbooks.'
		ELSE 'Grounded in this league and explicit about its beat.'
	END,
	"performs_when" = CASE "persona"::text
		WHEN 'commissioner' THEN '["pre-week cron", "lore.dispute", "transaction controversies", "settle-it poll verdicts"]'::jsonb
		WHEN 'analyst' THEN '["pre-week cron previews", "game.final performance reviews", "milestone and record math"]'::jsonb
		WHEN 'narrator' THEN '["game.final recaps", "lore.canonized legend pieces", "milestone and record pieces"]'::jsonb
		WHEN 'trash_talker' THEN '["game.final blowouts and upsets", "rivalry-week cron", "bad roster or paper-bet move reactions"]'::jsonb
		WHEN 'betting_advisor' THEN '["post-odds-refresh cron", "bet.settled reactions"]'::jsonb
		ELSE '[]'::jsonb
	END;--> statement-breakpoint
ALTER TABLE "ai_persona_card" ALTER COLUMN "beat" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_persona_card" ALTER COLUMN "point_of_view" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_persona_card" ALTER COLUMN "performs_when" SET NOT NULL;
