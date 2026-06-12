# Rumbledore v2 — Master State & Handoff

**This is the single source of truth.** Any agent/model/tool continuing this work reads this first.
Keep it current. Last updated: 2026-06-11 (Opus planning session, pre-build).

---

## 0. TL;DR for whoever picks this up
- We are doing a **clean, first-principles rebuild** of Rumbledore on branch **`rebuild/foundation`**.
- Execution model: **Ralph loop** (autonomous agents in tmux) — see `docs/methodology` below + `AGENTS.md` + `PROMPT_build.md`.
- **Run the loop on Claude account `bxbxbxbxbxr@gmail.com`** (launch `claude` with `HOME=/home/ubuntu`). Do NOT use `bwcummings1` — that account is running other agents (`goal1c`, `dg-ui`) and shares a 5-hour limit.
- ESPN ingestion is **proven working** on a real league (95050). Creds are in gitignored `.env.local`.
- Quality gates are **ON** from day one (typecheck, lint, test, build, `ubs`). Never disable them.

## 1. What Rumbledore is (product vision)
A **sandboxed, per-league fantasy-football companion**. Connect your existing ESPN league (later Sleeper + Yahoo), ingest current + ~10 yrs history, and per league get:
- **Per-league home base** — an ESPN-fantasy-homepage-style front page; some content shared across leagues, some league-specific; as real-time as feasible.
- **Two-tier news + AI blogger** — (a) a **central** NFL/fantasy news hub open to all leagues; (b) a **league-tailored** feed; (c) a per-league **AI blogger** with personas (Commissioner, Analyst, Narrator, Trash-Talker, Betting-Advisor) blending league storylines (rivalries, managers, inside jokes from history) with real NFL news. Web-grounded.
- **Paper betting** — DraftKings/FanDuel-style markets, real odds, fake money. **Rolling-minimum weekly bankroll**: floor e.g. $10k; lose all → reset to floor next week; finish above floor → carry balance forward.
- **Central inter-league arena** — leagues are data-sandboxed, but a central plane hosts **league-vs-league + individual** paper-betting leaderboards/competition.
- **League records** — all-time records section built from ~10 yrs of history.
- **Frictionless onboarding (the #1 past failure)** — NO manual cookie/console digging. Connect once → auto-discover ALL your leagues → invite leaguemates (viral seed). Must work on **mobile**.
- **A league "data steward" role** — a designated member who can review/clean their league's data.
- **Bar:** new, snappy, mobile-first (distributed via a shareable link), desktop parity, nothing dated.

## 2. Branch reality (important — `main` is NOT current)
- `main` = 2 commits, the *oldest* checkpoint ("phase 1 complete"). Audited; mostly obsolete.
- The old "real" code reached ~Phase 5 on **`v0.62`** (linear `main→…→v1.0→v0.61→v0.62`, +238k lines) but was **never merged**. It has the same fatal patterns at scale: build gates disabled, `middleware.ts` auth disabled, ~5% test coverage, committed coverage HTML.
- `claude/ultrathink-project-review` is the newest *by date* but a **divergent dead-end** (missing ~238k lines). Ignore it.
- **Decision (user): clean rebuild, reuse only proven assets.** Mine `v0.62` on demand via `git show v0.62:<path>` (good candidates: Prisma schema/domain modeling, `lib/crypto/encryption.ts`, ESPN request/header learnings, identity-resolution logic). Do NOT carry over the disabled-gates/fake-auth patterns.

## 3. Validated facts (proven this session, not assumptions)
- **ESPN cookies work.** `SWID`+`espn_s2` (in `.env.local`) returned HTTP 200.
- **League auto-discovery works** (the onboarding thesis): `GET https://fan.api.espn.com/apis/v2/fans/{SWID}` (cookies only) returns all leagues → discovered league **95050**, season **2026**.
- **Full league ingestion works:** `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/95050?view=mTeam&view=mSettings` → 200, league **"NHS Alumni Annual"**, 12-team `H2H_POINTS`. Use this as the real test fixture.
- Headers that matter for ESPN: real `User-Agent`, `x-fantasy-source: kona`, `x-fantasy-platform: kona`, `X-Personalization-Source: ESPN.com - FAM`. Keep all cookie'd calls **server-side**.

## 4. Recommended stack (locked unless a spec says otherwise)
| Layer | Pick |
|---|---|
| App/UI | **Next.js (App Router) PWA**, mobile-first, Tailwind + shadcn/ui; installable via link |
| Auth | **Better Auth** (organization plugin → league=org; roles incl. commissioner/data-steward) |
| DB | **Neon Postgres + pgvector**, **Drizzle ORM**; local Postgres via Docker for dev |
| Isolation | **Postgres RLS** on `league_id`; central/arena tables open-read |
| Jobs | **Inngest** (cron + event-driven: odds polling, ingestion, AI gen, settlement); Trigger.dev escape-hatch for long AI jobs |
| Realtime | **Supabase Realtime Broadcast** (works with Neon) |
| Cache | **Upstash Redis** (local Redis for dev) |
| AI | **Anthropic SDK direct** (NO LangChain). Claude for flagship voice + a cheaper Claude tier for bulk; prompt-cache persona+league-facts prefix. Confirm exact model IDs/pricing via the `claude-api` skill at build time. |
| Web grounding | **Tavily** + RSS + sports feed |
| Odds/Betting | **The Odds API** (odds) + **SportsDataIO** (results/prop settlement); append-only `odds_snapshots`, odds locked at placement, event-sourced `bankroll_ledger` |
| Provider abstraction | `FantasyProvider` interface; ESPN now, Sleeper (no-auth) + Yahoo (OAuth2) later; normalized model |
Alternatives on file: Railway/Render PaaS monolith (if serverless workers bite); Expo native wrapper (if push-retention demands).

## 5. Methodology & guardrails
- **Ralph loop** (Geoffrey Huntley / Clayton Farr playbook): `specs/*` + `PROMPT_plan.md`/`PROMPT_build.md` + `AGENTS.md` + disposable `IMPLEMENTATION_PLAN.md`; loop runs `claude -p --dangerously-skip-permissions`; **tests/build/lint are mandatory backpressure gates before every commit**. No stubs/placeholders — implement completely.
- **Verification per iteration:** typecheck + lint + unit/integration tests + build + `ubs <changed files>` must pass before commit. (Optionally wire `no-mistakes` as a validated push gate.)
- **UI taste:** follow **impeccable** — maintain `DESIGN.md` + `PRODUCT.md`; run `npx impeccable detect src/` as a CI gate. (UI polish is not the immediate priority, but new UI must not be "AI slop".)
- **Secrets:** never commit. `.env*` is gitignored. Add a secret-scan gate.
- **Git:** work on `rebuild/foundation` (or child branches), commit often, push freely. NEVER force-push; NEVER touch `main`/`v0.62`.
- **Accounts (caam):** loop → `bxbxbxbxbxr` (`HOME=/home/ubuntu claude …`). `bwcummings1` is busy (`goal1c`/`dg-ui`). caam can't read live usage yet (only expired `claude2` registered) — a one-time `caam login` per account would enable `caam limits`/`monitor`.
- **Model plan:** Fable 5 at max effort for the build window (~2h), then switch to Codex 5.5 high. This doc + the specs make the handoff seamless.

## 6. Research briefs (full reasoning lives in the planning conversation; key conclusions here)
- **Onboarding/mobile:** browser extensions CAN'T read ESPN HttpOnly cookies on mobile (iOS Safari / no Android extensions). Mobile primary = **hosted live-browser login** (Browserbase-style: user logs into ESPN in an embedded cloud browser, capture session server-side). Desktop fallback = MV3 extension. `chrome-devtools-mcp` is a dev tool, NOT a consumer channel.
- **Betting:** play-money (no real prize) = low legal risk; never add real prizes, never use sportsbook trademarks, license odds (don't scrape a book). Parlays: all legs win; push/void leg drops & re-prices.
- **AI:** treat all web/RSS as untrusted (prompt-injection); enforce league isolation in SQL (`WHERE league_id`) + RLS, never trust the model; near-dup check generated posts (cosine > ~0.92).

## 7. Where the build picks up (next steps)
1. Author the control plane: `AGENTS.md`, `PROMPT_plan.md`, `PROMPT_build.md`, `specs/*`, seed `IMPLEMENTATION_PLAN.md`, `DESIGN.md`, `PRODUCT.md`, `loop.sh`.
2. Clear `rebuild/foundation` to a clean slate; scaffold the monorepo skeleton + CI + quality gates so backpressure works from iteration 1.
3. Run a PLAN loop to refine `IMPLEMENTATION_PLAN.md` from specs.
4. Launch BUILD loop (Fable, account `bxbxbxbxbxr`) in a dedicated tmux session; supervise + tune.
- **First milestone:** Foundation (P0) + the flagship vertical slice — connect league → ingest (real, via league 95050) → league home shows standings/stats — all test-backed behind green gates.

## 8. Recent (loop log; newest first)
- 2026-06-12: Bet placement landed — RLS-scoped slips/legs now lock selected odds snapshots, validate stake/freshness/distinct parlay markets, and atomically debit bankroll ledgers with idempotent retry protection.
- 2026-06-12: Bankroll ledger foundation landed — league-scoped bankroll weeks plus append-only ledger opening/rollover logic now enforce rolling-minimum resets, current-balance replay, and RLS isolation.
- 2026-06-12: Betting odds catalog landed — central events/markets/append-only odds snapshots, mock + The Odds API providers, idempotent `odds.poll`, and DB/job coverage are green.
- 2026-06-12: Realtime blog publish events landed — AI generation now emits typed `blog.published` broadcasts to `league:{leagueId}:blog` after new league posts commit, with mock/no-op local defaults and Supabase REST publishing when configured.
- 2026-06-12: League blog post details landed — league home/feed blog cards now open `/leagues/[leagueId]/posts/[postId]`, backed by membership checks plus RLS-scoped blog-only content queries.
- 2026-06-12: League-tailored feed landed — `league_feed_reference` joins scoped league posts with explicitly relevant central news, `/leagues/[leagueId]/feed` renders the mixed feed, and isolation tests are green.
- 2026-06-11: Content planning landed — scheduled weekly planners and `game.final` fan-out now emit stable idempotent `content.generate` events for AI blogger personas.
- 2026-06-11: Real AI/news clients landed — Anthropic structured blog generation, Tavily grounding/news search, and Voyage embeddings are env-selected behind mocks.
- 2026-06-11: Central news hub landed — `/news` renders central `content_item` headlines with attribution, excludes league-scoped rows, and is reachable from home and league pages.
- 2026-06-11: Central news ingestion landed — canonical source dedup, central `content_item` news persistence, `news.refresh` job wiring, and DB-level central dedup are green.
- 2026-06-11: AI blogger foundation landed — RLS content/persona/generation/memory tables, mock generation pipeline, `content.generate`, and league-home storylines are green.
- 2026-06-11: Provider final standings persistence landed — historical import now stores official final ranks/playoff seeds and stats/championship records prefer them over computed rank fallback.
- 2026-06-11: P2 stats/records landed — canonical person identity resolution, materialized weekly/season/H2H/all-time records, steward merge/split corrections, import-triggered recompute, and league-home record book are green.
- 2026-06-11: `import.requested` job wiring landed — onboarding imports now request checkpointed historical import from stored encrypted ESPN credentials through a registered Inngest handler.
- 2026-06-11: Resumable ESPN historical import landed — leagueHistory seasons normalize into persisted historical rows with RLS-protected checkpoints and resume-after-failure coverage.
- 2026-06-11: Playwright vertical-slice e2e landed — mock ESPN connect signs in, imports fixture league 95050, and opens the league home with standings assertions.
- 2026-06-11: League home landed — ESPN team records persist through ingestion, authenticated members can open `/leagues/[leagueId]` for mobile-first standings/current matchups/team cards, and onboarding imports now link to the home page.
- 2026-06-11: Durable ESPN league discovery/import screen landed — persisted discoveries reload after connect, latest FFL leagues default selected, imported state is inferred from league membership, and selected imports are covered by service/UI tests.
- 2026-06-11: ESPN onboarding connect flow landed — mock hosted-browser + manual cookie paths store encrypted credentials, persist discovered leagues, and import selected leagues through current sync with commissioner membership.
- 2026-06-11: Idempotent current-league ingestion landed — normalized ESPN league/team/member/matchup rows now upsert under RLS with deterministic content hashes, zero-write repeat syncs, and 95050 fixture-backed persistence tests.
- 2026-06-11: ESPN current-league fetch adapter landed — 95050/2026 fixture-backed league/team/member/matchup normalization, required headers, scoring-period filtering, and optional-field fallbacks are green.
- 2026-06-11: ESPN Fan API auth/discovery adapter landed — server-only cookie session validation, required ESPN headers, fixture-backed league 95050 discovery, and typed provider errors are green.
- 2026-06-11: Membership source-of-truth cleanup landed — legacy RLS `league_members` is backfilled into auth-plane `members` then dropped; RLS catalog/canary coverage now rides on real fantasy domain tables.
- 2026-06-11: P1 provider/domain model landed — `FantasyProvider` contract + typed provider errors, normalized league metadata, RLS-protected `fantasy_teams`/`fantasy_members`/`fantasy_matchups`, and focused provider/domain/RLS tests are green.
- 2026-06-11: P0 foundation docs landed — tracked `.env.example` plus clean-clone README quickstart/health/gates; P0 backlog is complete and all local gates are green.
- 2026-06-11: CI gate landed — GitHub Actions now runs secret-scan, typecheck, lint, tests, build, and changed-file UBS with pgvector/Redis services; all local gates green.
- 2026-06-11: Ops basics landed — `/api/health` checks DB+Redis, root error fallback, secret-redacting structured logger, and `AppError`/`Result` convention with focused coverage; all gates green.
- 2026-06-11: Inngest scaffold landed — `src/jobs` client/event registry + idempotent sample `app.ping` step function, `/api/inngest` serve route, `pnpm jobs:dev` wired to the local dev server, `@inngest/test` coverage; all gates green.
- 2026-06-11: Better Auth scaffold landed — email/password + Google stub (placeholder creds, drop-in real), org plugin mapped league=org onto `leagues` (+slug/logo/metadata) with central `members`/`invitations`, AC roles incl. data_steward (`leagueData` resource), lazy `/api/auth/[...all]`; 6 live-DB integration tests; all gates green.
- 2026-06-11: RLS isolation canary landed — `rls-canary.test.ts` proves two-league read/write isolation under a dedicated non-superuser role (spec 02 §7 acceptance); P0 data layer complete, all gates green.
- 2026-06-11: RLS plumbing landed — migration 0002 (current_league_id() fn, ENABLE+FORCE RLS, league_members_isolation policy) + `withLeagueContext()` tx helper; 8 integration tests; canary test next; all gates green.
- 2026-06-11: Drizzle landed — users/leagues/league_members schema + first migrations (0000 pgvector, 0001 baseline), server-only `getDb()`, 7-test live-DB integration suite; all gates green.
- 2026-06-11: `src/core/env` landed — zod-4-validated env, paid APIs default to mocks via MOCK_* discriminated unions, local-stack URL defaults; 10 unit tests; all gates green.
- 2026-06-11: docker-compose local stack (pgvector pg17 + redis 7) on ports 5440/6390 with healthchecks; verified up + vector extension; all gates green.
- 2026-06-11: PWA shell landed — manifest + service worker (offline fallback, installable), icon set, safe-area utilities; all gates green.
- 2026-06-11: Tailwind v4 + shadcn/ui (base-nova) initialized; DESIGN.md tokens wired dark-first into the Tailwind theme; all gates green.
- 2026-06-11: P0 scaffold landed — Next 16.2.9 App Router + TS strict + Biome + Vitest(+RTL); all gates (typecheck/lint/test/build/ubs/impeccable) green.
