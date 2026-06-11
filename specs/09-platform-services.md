# Spec 09 — Platform Services (cross-cutting)

> Outcomes spec. The cross-cutting plane every feature spec leans on: **auth & roles**, **realtime**,
> **jobs**, **observability/ops**. Foundation (`02-foundation.md`) scaffolds the skeleton; this spec
> defines the full target behavior. Tenancy model and stack are locked in `01-architecture.md` / `docs/PROGRESS.md` §4.

## Purpose
Make league isolation, real-time updates, background work, and operability **first-class and uniform** so feature
specs (onboarding, ingestion, AI, betting, arena) compose without re-inventing auth, channels, or job plumbing.
Three invariants govern everything here:
- **Isolation is sacred.** Every league-scoped path sets the Postgres RLS session var `app.current_league_id` AND filters `WHERE league_id` (defense in depth). Central/arena tables are the only cross-league ones.
- **Secrets never leak.** Cookies/tokens/keys are never logged, never sent to clients, never committed.
- **Everything degrades to mocks.** Paid integrations sit behind interfaces; `MOCK_*` toggles let the whole platform run on local Postgres/Redis + fixtures with no external keys.

---

## Auth & roles

**Library:** Better Auth with the **organization plugin** — `organization = league`. A user belongs to **many** orgs (leagues); each membership carries a role. Sessions are cookie-based, secure, HttpOnly, SameSite=Lax, and **mobile-friendly** (long-lived refresh, works inside the PWA and the hosted live-login browser flow).

**Login methods:** email/password + email magic-link, and at least one social provider (Google) via OAuth. New providers add without schema change. Email verification required before a league action that mutates data.

**Roles (per league, escalating):**
| Role | Capability |
|---|---|
| `super_admin` | Platform-wide (global, not per-league); manage any league, run ops, impersonate for support (audited). |
| `league_owner` / `commissioner` | Full control of their league: settings, members, roles, invites, trigger imports, delete league. |
| `league_admin` | Manage members/content/jobs for the league; cannot delete the league or change owner. |
| `data_steward` | Review/clean **this** league's ingested data (identity resolution, corrections); read-all within league, write to curation surfaces. |
| `member` | Read league surfaces; place paper bets; read/post in chat; no admin. |

`super_admin` is a platform attribute (on the user / a platform-admins table), not an org role. `commissioner` is the canonical owner alias for fantasy users; treat as synonym of `league_owner`.

**Route guards (server):** a single `requireSession()` / `requireLeagueRole(leagueId, minRole)` helper used by every protected route handler and server action. It (1) resolves the session, (2) resolves the user's membership+role in the target league, (3) rejects with **401** (no session) or **403** (not a member / insufficient role) *before* any query runs. No protected handler reaches the DB without passing a guard.

**Data guards + RLS var wiring (the canary's backbone):**
- A `withLeagueContext(leagueId, fn)` helper opens a DB transaction and issues `SET LOCAL app.current_league_id = <uuid>` (transaction-scoped — never bleeds across pooled connections) before running `fn`. All league-scoped reads/writes go through it.
- The league id fed to the RLS var is **derived from the verified session membership**, never from a raw client-supplied body field. A request for a league the user doesn't belong to fails the guard and the var is never set.
- A `clearLeagueContext()` / central-context path explicitly omits the var (or sets it null) for cross-league/central queries, so central reads are deliberate, not accidental leakage.
- RLS policies on league-scoped tables: `USING (league_id = current_setting('app.current_league_id', true)::uuid)`. The `true` (missing_ok) means a query with no var set sees **zero** league-scoped rows (fail-closed), never all of them.

**Acceptance (auth):**
- Calling a protected league route with no session → 401; with a session but no membership → 403; the DB is not touched on rejection.
- `withLeagueContext` sets `app.current_league_id` inside a transaction; the **isolation canary** (two leagues, query under context A cannot see league B's rows) passes purely because the var is set from the session-derived id.
- A query run with **no** league context returns zero league-scoped rows (fail-closed), proving RLS missing-var behavior.
- A `data_steward` can write to curation surfaces for their league and is 403'd on another league; a `member` is 403'd on admin routes.

---

## Realtime

**Transport:** Supabase Realtime **Broadcast** (works alongside Neon — Supabase used only for realtime, not as the DB). Servers/jobs are the **publishers**; clients **subscribe**. No client ever publishes authoritative state; broadcast carries notifications/deltas, the DB remains source of truth.

**Channel naming (stable, namespaced):**
- Per-league: `league:{leagueId}:scores`, `league:{leagueId}:odds`, `league:{leagueId}:leaderboard`, `league:{leagueId}:blog`, `league:{leagueId}:presence` (chat/online).
- Central (cross-league, open subscribe): `central:news`, `arena:leaderboard`, `arena:competition:{competitionId}`.
- Event payloads are small, typed, versioned (`{ v, type, ... , at }`); consumers fetch detail from the API if needed.

**Who publishes what:**
| Channel | Published by | Trigger |
|---|---|---|
| `league:*:scores` | ingestion/sync job | score refresh / `game.final` |
| `league:*:odds` | odds poll job | odds snapshot change |
| `league:*:leaderboard` | settlement job | bankroll/standings change |
| `league:*:blog` | content pipeline | blog-published |
| `central:news` | news-refresh job | central feed update |
| `arena:leaderboard` | settlement/arena job | arena standing change |

**Subscription auth (a user only subscribes to leagues they belong to):**
- Clients never connect with the Supabase service key. They obtain a **short-lived, per-league realtime token** from a server endpoint that runs the same `requireLeagueRole(leagueId, member)` guard; the endpoint returns a token scoped to exactly the channels for leagues the user is a member of (+ the public central/arena channels).
- Central/arena channels are subscribable by any authenticated user; per-league channels require proven membership. Token TTL is short; the client refreshes via the guarded endpoint.
- The publish side uses the server/service credential (server-only env), never exposed to the browser.

**Acceptance (realtime):**
- A publish/subscribe **smoke test**: a server publishes to `league:{A}:scores`; a subscribed test client receives the typed payload (`type`, `v`, `at` present).
- A user who is a member of league A but not B is **denied** a realtime token for `league:{B}:*` (guarded endpoint returns 403), and can obtain one for `central:news`.
- No client-side code references the Supabase service key (secret-scan + code check).

---

## Jobs (Inngest)

**Library:** Inngest for all durable/scheduled work. Two kinds: **scheduled** (cron) and **event-driven**. The Inngest dev server is wired locally; functions are testable in isolation.

**Canonical events (the platform's job vocabulary):**
| Event | Kind | Effect | League-scoped? |
|---|---|---|---|
| `league.connected` | event | ingest current + discover leagues; kick history | yes (`{ leagueId }`) |
| `game.final` | event | settle bets + generate recap; publish leaderboard/scores | yes |
| `import.requested` | event | resumable, checkpointed historical import | yes |
| `odds.poll` | cron + event | fetch odds snapshots; publish odds deltas | central fetch → fans per-league |
| `news.refresh` | cron | refresh central NFL/fantasy feed; publish `central:news` | central |
| `content.generate` | event (+ cron for scheduled posts) | run AI content pipeline for a league/persona | yes |

Every job carries the `leagueId` in its event data for league-scoped work and runs its DB access inside `withLeagueContext(leagueId, …)` so RLS applies **inside jobs too** (jobs are not exempt from isolation).

**Conventions (mandatory for every function):**
- **Idempotency:** each function declares an idempotency key (Inngest `idempotency` / a natural dedup key like `${event}:${leagueId}:${gameId}` or a content hash). Re-delivery or retry **must not** double-write — settlement, ledger entries, imports, and published posts are guarded by unique keys / append-only-with-dedup so the same logical event produces one effect.
- **Retries + backoff:** transient failures (provider 5xx, rate limits) retry with exponential backoff; permanent failures (auth invalid, 4xx) fail fast and surface, not silently swallowed. Respect ESPN/Odds rate limits (token-bucket / concurrency caps).
- **Scheduling vs event-driven:** cron for polling cadences (`odds.poll`, `news.refresh`, scheduled `content.generate`, sync refresh); events for reactive flows (`league.connected`, `game.final`, `import.requested`). No business logic in cron handlers that isn't also reachable by event for testing.
- **Long jobs:** very long AI/import work may fan out to step functions / the Trigger.dev escape-hatch (per `docs/PROGRESS.md`); checkpoint progress so a retry resumes, not restarts.
- **Mock mode:** when `MOCK_*` is on, jobs call the mock provider implementations (deterministic fixtures) so the full job graph runs with no external keys.

**Acceptance (jobs):**
- An **idempotency test**: firing the same `game.final` (same `leagueId`+`gameId`) twice (simulated retry) produces exactly one settlement / one ledger delta / one recap — verified by row counts.
- A job that does league-scoped DB work fails the isolation canary if it skips `withLeagueContext` (i.e., the helper is the only sanctioned path; a test asserts cross-league rows are unreachable inside a job).
- A scheduled function (`odds.poll`) and an event function (`league.connected`) each have a passing unit/integration test using mock providers.

---

## Observability / deploy

**Structured logging:** one logger (`src/core/logging`) emitting JSON `{ level, msg, time, requestId?, leagueId?, userId? }`. **Never** log cookies, `espn_s2`/`SWID`, tokens, API keys, or full request bodies — a redaction allowlist/denylist enforces this, and there is a test that asserts a known secret string never appears in emitted logs. `requestId` propagates request→job for tracing.

**Error tracking:** typed `Result`/error classes (`src/core`); errors are reported to an error tracker (Sentry-style, behind a `MOCK_*`/no-DSN no-op so dev needs no account) with PII/secret scrubbing. Unhandled errors hit a root error boundary (web) and a job-failure handler (Inngest), never silently dropped.

**Health & metrics:** `GET /api/health` checks DB + Redis (+ realtime/inngest reachability when configured) and returns `{ status, checks: { db, redis, … } }` with a non-200 when a dependency is down. Basic metrics: job success/failure counts + durations, API p95 latency, cache hit ratio, ESPN/Odds call counts vs rate-limit budget (exported or logged; full dashboards are out of scope).

**Deployment topology:**
| Concern | Service |
|---|---|
| Web (PWA, route handlers, server actions) | **Vercel** |
| Jobs | **Inngest** (cloud; dev server locally) |
| Database | **Neon Postgres** + pgvector (local Docker in dev) |
| Cache / rate-limit buckets | **Upstash Redis** (local Redis in dev) |
| Realtime | **Supabase Realtime** Broadcast |

**Env management:** all config via `src/core/env`, **zod-validated at boot**, fail-fast on missing required keys. Required (DB, auth secret, realtime publish creds) vs optional (paid API keys). `.env.example` documents every var (no values); secrets only in gitignored `.env.local`; production secrets in Vercel/Inngest env. **`MOCK_*` strategy:** one toggle per paid integration (`MOCK_ANTHROPIC`, `MOCK_ODDS`, `MOCK_SPORTSDATA`, `MOCK_TAVILY`, `MOCK_BROWSERBASE`); each defaults to mock when its key is absent, so the platform runs end-to-end locally with zero paid accounts and CI never makes a paid call.

**Acceptance (observability/deploy):**
- A log-redaction test: a request/job carrying a known secret emits logs where that secret string is absent.
- `/api/health` returns ok with local Postgres+Redis up, and a non-200 with a dependency stopped.
- With all `MOCK_*` on and no paid keys, `pnpm build` + the full test suite pass and the app boots (gates green) — no external call is attempted.
- Boot fails fast with a clear error when a **required** env var is missing.

---

## Acceptance criteria (rollup, testable)
1. **Protected route rejects a non-member:** request to a league route without session → 401; with session but no membership → 403; DB untouched on rejection.
2. **RLS var from session → canary passes:** `withLeagueContext` sets `app.current_league_id` from the session-derived league id; the two-league isolation test cannot read the other league's rows; a no-context query returns zero league-scoped rows (fail-closed).
3. **Publish/subscribe smoke:** server publishes to `league:{A}:scores`; subscribed client receives the typed payload; a non-member is denied a realtime token for league B but allowed for `central:news`.
4. **Job idempotent on retry:** the same `game.final` fired twice yields exactly one settlement/ledger/recap (row-count verified); jobs do league-scoped DB work only via `withLeagueContext`.
5. **Secrets never logged:** redaction test passes; no client bundle references service keys.

## Dependencies / blocked-by
- **Blocked-by `02-foundation.md`:** Better Auth scaffold + roles enum, `withLeagueContext`/RLS helper, env validation + `MOCK_*`, Inngest scaffold, `/api/health`, structured logger, `users`/`leagues`/auth-plane `members` baseline. This spec **completes** those into the full platform behavior above.
- **Consumed by:** onboarding (`league.connected`, invites, steward role), ingestion (`game.final`, scores channel, sync jobs), AI (`content.generate`, blog channel), betting/arena (`odds.poll`, settlement, leaderboard/arena channels). Those specs must use these guards/events/channels rather than rolling their own.
- **External:** Supabase project (realtime), Inngest account (cloud jobs), Vercel project, Neon + Upstash. All have local/mock equivalents so build proceeds without them.

## Non-goals
- No feature business logic (settlement math, AI prompts, ingestion normalization) — those live in their own specs; this defines the plumbing they ride on.
- No SSO/SAML, org-to-org hierarchies, or fine-grained per-field ACLs beyond the role table.
- No full APM dashboards/alerting infra, log aggregation backend, or multi-region/HA topology (single-region Vercel+Neon for MVP).
- No real-money/KYC, no native push infrastructure (PWA + realtime only for MVP).
