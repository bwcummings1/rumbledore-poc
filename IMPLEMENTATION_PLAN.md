# IMPLEMENTATION_PLAN.md

Disposable, Ralph-maintained backlog. Phase order P0→P5. One task = one sentence, no "and". Mark done when gates pass + committed.
Seeded by the planning session; the loop refines it. Nothing is done yet (greenfield on `rebuild/foundation`).

## P0 — Foundation (build first; see specs/02-foundation.md)
- [ ] Initialize Next.js App Router + TypeScript strict + pnpm with scripts typecheck/lint/test/build (next.config must NOT ignore type/lint errors).
- [ ] Add Biome wired into `pnpm lint` and format.
- [ ] Add Vitest with one real passing unit test.
- [ ] Initialize Tailwind + shadcn/ui and wire tokens from DESIGN.md.
- [ ] Add PWA manifest + service worker producing an installable mobile-first app shell.
- [ ] Add docker-compose for local Postgres (pgvector) + Redis.
- [ ] Add `src/core/env` zod-validated env with MOCK_* toggles defaulting paid APIs to mocks.
- [ ] Set up Drizzle client + first migration for users, leagues, league_members.
- [ ] Add an RLS helper that sets `app.current_league_id` and enable RLS on league-scoped tables. (blocked-by: Drizzle migration)
- [ ] Write the two-league RLS isolation canary integration test. (blocked-by: RLS helper)
- [ ] Scaffold Better Auth with email + a social stub and the organization plugin (league=org) including a data_steward role.
- [ ] Scaffold Inngest with one sample function plus its test.
- [ ] Add `/api/health` (db+redis), a root error boundary, a secret-safe structured logger, and a Result/error convention.
- [ ] Add GitHub Actions CI running typecheck+lint+test+build+ubs plus a secret-scan that fails on committed secrets.
- [ ] Write a complete `.env.example` and a README quickstart that works from a clean clone.

## P1 — Ingestion + Onboarding (flagship vertical slice; see specs/03, specs/04)
- [ ] Define the FantasyProvider interface and the normalized league/team/member/matchup model. (blocked-by: P0)
- [ ] Implement the ESPN adapter auth + league discovery via the Fan API (server-side, spoofed headers). (blocked-by: provider interface)
- [ ] Implement ESPN league/teams/members/matchups fetch for league 95050 season 2026. (blocked-by: ESPN adapter auth)
- [ ] Normalize and upsert ingested ESPN data idempotently with fixture-based tests. (blocked-by: ESPN fetch)
- [ ] Build the onboarding connect flow behind a Browserbase-style interface (mocked) with a manual-cookie fallback that stores creds encrypted and triggers ingest. (blocked-by: ESPN adapter auth)
- [ ] Build the league auto-discovery screen listing a user's discovered leagues to import. (blocked-by: ESPN adapter auth)
- [ ] Build the league home page showing real standings + teams from ingested data, mobile-first. (blocked-by: normalize/upsert)
- [ ] Add a Playwright e2e proving connect(mock) → ingest(fixture) → home shows standings. (blocked-by: league home)

## P2 — Intelligence & Records (see specs/06 — to be written)
- [ ] Statistics engine; cross-season identity resolution; all-time league records section.

## P3 — AI content & news (see specs/07, specs/05 — to be written)
- [ ] Per-league blogger + personas; web-grounded generation pipeline; central news hub; league-tailored feed; pgvector memory with isolation.

## P4 — Paper betting + arena (see specs/08 — to be written)
- [ ] Odds ingest; bet slips (single+parlay) with locked odds; settlement; rolling-minimum bankroll ledger; central inter-league arena + leaderboards.

## P5 — Realtime, scale, multi-provider (see specs/09 — to be written)
- [ ] Realtime live updates; push notifications; performance/observability; Sleeper then Yahoo providers.

## Discoveries / bugs (loop appends here)
- (none yet)
