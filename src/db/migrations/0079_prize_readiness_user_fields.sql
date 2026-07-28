-- T-006 / UIX-119: prize-readiness user fields.
--
-- Collected but NOT enforced (PROJECT_CONTEXT.md DD-6). If the inter-league
-- competition ever attaches a prize it becomes a promotional sweepstakes, which
-- requires per-user geographic eligibility and a verified human behind every
-- entry. Both are captured from first signup because adding a column later is
-- trivial while obtaining a user ACTION later is not -- you cannot retroactively
-- ask an existing member base to verify phone numbers.
--
-- Nothing reads these yet. Enforcement (geo-blocking, SMS 2FA) is a separate,
-- owner-gated decision documented in PROJECT_CONTEXT.md 3.4.
--
-- `users` is Better Auth's auth plane and deliberately carries no restrictive
-- RLS (membership must be readable before a league context exists), so no
-- pgPolicy / FORCE ROW LEVEL SECURITY applies here.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "geo_state" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verified" boolean DEFAULT false NOT NULL;
