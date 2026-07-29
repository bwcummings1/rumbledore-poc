-- Delete the paper-bankroll betting engine (T-011).
--
-- The product no longer has a bankroll. Leagues compete on Pick 'em accuracy
-- against an absolute denominator, the arena ranks on that accuracy, and
-- nothing reads a stake, a payout, or a running balance any more. These five
-- tables have no remaining writer and no remaining reader.
--
-- ## Why drop rather than leave in place
--
-- A dormant schema with RLS policies, foreign keys and indexes is not free:
-- every future migration, every RLS completeness test and every reader of
-- schema.ts has to work out whether it is live. Worse, `bet_slips` still had
-- a `bankroll_week_id` FK chain that made the intended deletion order
-- non-obvious. Leaving it would have preserved the ambiguity, not the data.
--
-- ## Recovery
--
-- The engine is preserved at the `bankroll-engine-v1` git tag, whose restore
-- was verified before this migration was written. That tag -- not a dormant
-- table -- is the rollback path. Nothing in the app can reconstruct these rows
-- from Pick 'em data, and nothing needs to: no real money ever moved through
-- them, and the accuracy metric that replaced them is computed from `picks`.

-- Children first: bet_legs and bet_settlements both reference bet_slips, and
-- bankroll_ledger references bankroll_weeks.
DROP TABLE IF EXISTS "bet_settlements" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "bet_legs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "bet_slips" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "bankroll_ledger" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "bankroll_weeks" CASCADE;--> statement-breakpoint

-- Enum types that only these tables used.
DROP TYPE IF EXISTS "bankroll_ledger_entry_type";--> statement-breakpoint
DROP TYPE IF EXISTS "bet_slip_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "bet_slip_status";--> statement-breakpoint
DROP TYPE IF EXISTS "bet_leg_status";--> statement-breakpoint

-- "bet_leg_selection" is deliberately NOT dropped. It is now the Pick 'em
-- selection vocabulary: `picks.selection` is typed on it. Dropping it here
-- would take the picks table with it.
