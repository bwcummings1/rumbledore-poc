# Spec 01 — Architecture

> Outcomes + structure. The loop chooses implementation details consistent with this.

## Shape
A single **Next.js (App Router) PWA** with well-organized internal modules (NOT a multi-package monorepo yet — extract later if needed). Server-side route handlers + server actions are the API/BFF. Durable/scheduled work runs on **Inngest**. One Postgres (Neon; local Docker in dev) with **pgvector** and **RLS**.

## Repo layout (target)
```
app/                      # Next.js App Router (routes, server actions)
  (marketing)/ (app)/ api/
src/
  db/                     # Drizzle schema, migrations, RLS helpers, client
  providers/              # FantasyProvider abstraction + espn/ (sleeper/ yahoo/ later)
  ingestion/              # sync orchestration, normalization, dedup
  onboarding/             # connect flows (browserbase live-login), discovery, invites, steward
  ai/                     # content pipeline, personas, memory (pgvector), web-grounding
  news/                   # central + league-tailored feeds
  stats/                  # statistics engine, identity resolution, records
  betting/                # odds ingest, slips, settlement, bankroll ledger, arena
  realtime/               # supabase realtime publish/subscribe
  jobs/                   # inngest function definitions
  auth/                   # better-auth config, roles, guards
  core/                   # config, env validation, errors, logging, result types
  ui/                     # shared components (shadcn), design-system primitives
test/                     # unit + integration; fixtures (incl. ESPN league 95050)
```

## Tenancy & isolation
- **Tenant = league.** League-scoped tables carry `league_id`; access is enforced by **Postgres RLS** (session var `app.current_league_id`) AND explicit `WHERE league_id` in queries (defense in depth).
- **Central tables** (users, central_news, arena_*, leaderboards, provider catalogs) are cross-league by design — no restrictive RLS.
- A user ∈ many leagues; the central arena aggregates per-user across leagues.

## Provider abstraction
`FantasyProvider` interface: `authenticate(creds) → Session`, `discoverLeagues(session) → League[]`, `getLeague/Teams/Rosters/Matchups/Members/History(...)`. ESPN adapter first (cookies SWID/espn_s2, host `lm-api-reads.fantasy.espn.com`, discovery via `fan.api.espn.com`). Everything normalizes to a provider-agnostic model keyed by `{provider, providerId}`.

## Jobs (Inngest)
Scheduled: odds polling, news refresh, scheduled blog generation, sync refresh. Event-driven: `league.connected` → ingest+discover; `game.final` → settle bets + generate recaps; `import.requested` → historical import (resumable, checkpointed). All idempotent.

## AI content pipeline
`trigger → retrieve league context (pgvector, WHERE league_id) → ground with web (Tavily/RSS) → generate (Anthropic SDK, persona system prompt, prompt-cached prefix) → near-dup check (cosine) → publish → embed to memory`. Web/RSS content is UNTRUSTED (prompt-injection): wrap as data, no tools/secrets in the generation step.

## Betting engine
Append-only `odds_snapshots`; bet placement copies (locks) the odds; **event-sourced `bankroll_ledger`** computes weekly rolling-minimum (`opening = max(prior_balance, floor)`); settlement grades singles+parlays (push/void handling) from authoritative results (SportsDataIO). Central arena reads ledgers for leaderboards.

## Realtime
Supabase Realtime Broadcast: workers publish (scores, odds, leaderboard, blog-published); clients subscribe per-league + central channels.

## Auth & roles
Better Auth with the organization plugin: org = league. Roles: `super_admin`, `league_owner`/`commissioner`, `league_admin`, `data_steward`, `member`. Route + data guards derive `current_league_id` and set the RLS session var.

## Config & secrets
All config via env, validated at boot (`src/core/env`) — fail fast on missing required keys. Secrets only in `.env.local` (gitignored). Paid integrations sit behind interfaces with mock implementations so the app runs fully on local Postgres/Redis + fixtures until keys are added.

## Cross-cutting
- Errors: typed `Result`/error classes; never swallow; structured logging (no secrets).
- Testing: unit (logic), integration (db + providers against fixtures/mocks), a few e2e (Playwright) for the flagship slice. Gates ON in CI.
- Performance budgets: API p95 < 200ms (cached), home interactive < 2s on mobile.
