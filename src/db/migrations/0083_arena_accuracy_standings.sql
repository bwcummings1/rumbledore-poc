-- Re-point arena standings from bankroll PnL to Pick 'em accuracy (T-015).
--
-- The arena ranked leagues and individuals by net profit against a paper
-- bankroll. The product no longer has a bankroll: the redesign scores leagues
-- on collective pick accuracy against an absolute denominator. Every column
-- below that mentions cents, stakes, returns, or slips describes a subsystem
-- being deleted, so they are dropped rather than left to rot as always-zero
-- columns that a future reader would mistake for live data.
--
-- Dropping is safe here in a way it would not be for most tables:
-- `arena_standing` is a DERIVED materialization. Every row is recomputed from
-- `pick_weeks` + `picks` by `rebuildArenaStandings`, so nothing is lost that
-- cannot be rebuilt. The bankroll history itself is preserved by the
-- `bankroll-engine-v1` tag, not by this table.

-- Denominator inputs and graded counts. `scorable_picks` is the absolute
-- denominator: roster_size x max_picks_per_user - pushes for a league, and
-- max_picks_per_user - pushes for an individual. An unsubmitted pick stays in
-- the denominator on purpose -- not picking scores the same as picking wrong.
ALTER TABLE "arena_standing" ADD COLUMN "correct_picks" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "arena_standing" ADD COLUMN "scorable_picks" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "arena_standing" ADD COLUMN "submitted_picks" integer NOT NULL DEFAULT 0;--> statement-breakpoint
-- Pushes. They VOID rather than count as wrong, so they are subtracted from
-- the denominator instead of added to the numerator's complement.
ALTER TABLE "arena_standing" ADD COLUMN "void_picks" integer NOT NULL DEFAULT 0;--> statement-breakpoint
-- Accuracy in basis points, matching the integer-metric convention the dropped
-- roi_bps/win_rate_bps columns used. Storing bps rather than a float keeps
-- ranking exact: two leagues that tie really do compare equal.
ALTER TABLE "arena_standing" ADD COLUMN "accuracy_bps" integer NOT NULL DEFAULT 0;--> statement-breakpoint
-- Weeks that cleared the 90% participation floor. Reported only -- eligibility
-- gates weekly prizes and never adjusts the accuracy itself, because a league
-- that skipped picks is already punished by the denominator and deducting
-- again would punish one lapse twice.
ALTER TABLE "arena_standing" ADD COLUMN "eligible_weeks" integer NOT NULL DEFAULT 0;--> statement-breakpoint

ALTER TABLE "arena_standing" DROP COLUMN "net_pnl_cents";--> statement-breakpoint
ALTER TABLE "arena_standing" DROP COLUMN "roi_bps";--> statement-breakpoint
ALTER TABLE "arena_standing" DROP COLUMN "current_balance_cents";--> statement-breakpoint
ALTER TABLE "arena_standing" DROP COLUMN "total_stake_cents";--> statement-breakpoint
ALTER TABLE "arena_standing" DROP COLUMN "total_return_cents";--> statement-breakpoint
ALTER TABLE "arena_standing" DROP COLUMN "settled_slip_count";--> statement-breakpoint
ALTER TABLE "arena_standing" DROP COLUMN "won_slip_count";--> statement-breakpoint
ALTER TABLE "arena_standing" DROP COLUMN "push_void_slip_count";--> statement-breakpoint
ALTER TABLE "arena_standing" DROP COLUMN "win_rate_bps";--> statement-breakpoint
-- "Survived" meant "ended the week with a balance above the floor" -- a
-- bankroll concept with no accuracy analogue. eligible_weeks replaces it.
ALTER TABLE "arena_standing" DROP COLUMN "weeks_survived";--> statement-breakpoint

-- Existing rows hold PnL rankings that no longer mean anything. Leaving them
-- would show stale ranks with zeroed metrics until the next rebuild, which
-- reads as "everyone scored 0%" rather than "not computed yet".
DELETE FROM "arena_standing";

-- No index changes. `arena_standing_leaderboard_idx` is on
-- (season_id, kind, rank), and `rank` survives this migration unchanged --
-- the leaderboard still reads in rank order, it is only the metric that
-- DERIVES the rank that changed.
