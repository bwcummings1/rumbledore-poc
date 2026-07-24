# Rumbledore v2 — Codebase Deep-Dive Analysis

- **Date of analysis:** 2026-07-23
- **Snapshot:** branch `main` @ `96eaf7cc4436a286c648004965396a170cea7d6b` ("merge: P3-FIX — Phase-3 central-hub review remediation", 2026-07-15 18:38:10 +0200). `main` == `origin/main`; working tree clean; no git tags (version history lives in read-only branches `v0.21`…`v1.0`, the *old abandoned v1 build*).
- **Analyzer:** Claude (Fable 5) via Claude Code, orchestrating seven read-only subsystem mapping agents + a full local gate run. Evidence labels: **[V]** = verified by reading code or executing commands this session; **[I]** = inferred from evidence (shown); **[U]** = unverified/assumption.
- **Environment caveats:** local Docker stack (pgvector Postgres @5440, Redis @6390) was already up and healthy; the full gate suite **was executed** (results in §8). GitHub has **zero PRs and zero issues** [V: `gh pr list`/`gh issue list` empty] — this repo's "conversation" is deliberately local (worktree branches merged by an orchestrator; ledgers in `docs/PROGRESS.md` and untracked `.orchestration/`), so "mine the PR/issue history" resolves to mining those ledgers instead.
- **Prior analyses:** `docs/archive/REPO-ANALYSIS/CLAUDE-Analysis-and-Improvement-2026-07-03-{v1,v2}.md` (pinned @ `84f30fc`, migrations 0059). Treated as hypotheses; 116 commits have landed since [V: `git log --since=2026-07-03 --oneline | wc -l`]. Their headline findings were re-checked at HEAD: personal-agent canon violation fixed, e2e now in CI, specs tracked, read-path concerns partially addressed (§9.1, §9.12, §8).

---

## 1. Executive summary

Rumbledore v2 is a **mobile-first, per-league fantasy-football companion PWA** — "the league as an ongoing spectacle": a faithful multi-provider **data substrate** (ESPN live today; Sleeper at fixture-parity; Yahoo scaffolding), an **AI cast** of personas that writes a league-specific publication about the members, and a **league-vs-league competition layer** (paper betting + central arena) — built as a single Next.js 16 App Router app over Drizzle/Postgres with row-level security, Inngest jobs, and mock-pinned paid providers ([V: `docs/NORTH-STAR.md`, `specs/01-architecture.md`, code]). It is remarkable operationally: essentially the entire codebase (~150K non-test TS LOC, 279 test files, 85 tables, 79 hand-journaled migrations [V: counts run this session]) was written June–July 2026 by an **orchestrated fleet of AI coding agents** working single-spec worktree branches under a strict gate regime (typecheck/lint/tests/build/AI-eval/design-fidelity/UBS/secret-scan), with a human owner making product decisions and a Claude orchestrator reviewing and merging ([V: `ORCHESTRATION.md`, `docs/HISTORY.md`, `.orchestration/`]). Current state: functionally complete through the specs/49 editorial architecture (Phase 3, merged at HEAD), validated against one real ESPN league (95050, 16 seasons) and two public Sleeper leagues; **every paid integration is mock-pinned ($0 — no real LLM/odds/news/embedding call has ever been made)**, there is **no production deployment**, and the next moves (real keys, hosted cookie capture, real news/stats sources, delivery providers) are explicitly **owner-gated** behind `docs/PHASE-4-ACTIVATION-CHECKLIST.md` [V]. All gates are green at HEAD (§8; two arena/bankroll DB tests time out under heavy parallel load but pass in isolation — a documented flake class).

## 2. What this is (product, in three layers)

From `docs/NORTH-STAR.md` [V, read in full]:

1. **Substrate** — connect any fantasy league (ESPN/Sleeper/Yahoo), store its full history, keep recording. "Its truth is sacred" — everything else acts on it.
2. **Spectacle** — an AI **cast** (six personas in code: Commissioner, Narrator, Trash-Talker, Beat Reporter, Analyst, Betting Advisor) that *performs*, instigates, and mythologizes: recaps, power rankings, awards, manufactured rivalries, "settle-it" polls. The bar: content should read like it was written by someone who's been in the league for a decade. A league-authored **lore** mechanic (claim → league vote → ratified canon) feeds the cast; the AI consumes canon as fact and never asserts un-ratified history.
3. **New competition** — paper betting + a central **arena** re-frames fantasy as league-vs-league as well as member-vs-member.

The UI is a distinctive, authoritative design system (**AUSPEX/HASHMARK**: near-black void, glass panels, lilac/amber accents, LCD numerals, near-pixel fidelity gate) [V: `DESIGN.md`, `PRODUCT.md`].

## 3. System map

```
                       ┌───────────────────────────────────────────────────────────┐
                       │                     Next.js 16 App Router                 │
                       │  src/app (pages + API routes; server components read DB)  │
                       │  src/navigation (shell) · src/components (AUSPEX UI)      │
                       └────────┬──────────────────────────────┬───────────────────┘
                                │ route handlers/server comps  │ /api/inngest (serve)
                                ▼                              ▼
     ┌──────────────┐   ┌──────────────────┐        ┌────────────────────────────┐
     │ src/auth     │   │ Domain modules   │        │ src/jobs — 33 Inngest fns  │
     │ Better Auth  │   │ onboarding ·     │◄──────►│ ingestion ticks · imports  │
     │ orgs=leagues │   │ stats/curation · │ events │ content planning/generate  │
     │ platform_    │   │ betting · lore · │        │ betting settle · digests   │
     │ admins       │   │ news · content · │        │ drift canaries · rollover  │
     └──────┬───────┘   │ ai (pipeline) ·  │        └─────────────┬──────────────┘
            │           │ realtime · push  │                      │
            ▼           └────────┬─────────┘                      │
     ┌────────────────────────── ▼ ──────────────────────────────▼─────────────┐
     │                    src/db — Drizzle schema (85 tables)                   │
     │  withLeagueContext() → SET app.current_league_id → RLS policies (62)     │
     │  league-scoped tables (FORCE RLS) · central tables (league_id NULL /     │
     │  arena/betting_event/news) · auth plane (Better Auth, no restrictive RLS)│
     │  Postgres 17 + pgvector (ai_memory embeddings) · 79 SQL migrations       │
     └──────────────────────────────────────────────────────────────────────────┘
            ▲                          ▲                             ▲
            │ normalized rows          │ pushed canon snapshots      │ counters
     ┌──────┴─────────┐        ┌───────┴────────┐            ┌───────┴────────┐
     │ src/ingestion  │        │ src/stats      │            │ src/core/redis │
     │ sync/reconcile │        │ engine · save→ │            │ hand-rolled    │
     │ capability map │        │ push canon ·   │            │ RESP client:   │
     │ shadow quarant.│        │ records catalog│            │ rate limits +  │
     │ drift canaries │        │ CanonCatalog   │            │ spend guards   │
     └──────┬─────────┘        └────────────────┘            └────────────────┘
            │ provider-agnostic NormalizedSeasonBundle
     ┌──────┴──────────────────────────────────────────────┐
     │ src/providers — FantasyProvider abstraction          │
     │ espn/ (real HTTP, cookie auth, full decode dicts)    │
     │ sleeper/ (dict parity, fixture-backed) · yahoo/ (OAuth│
     │ scaffold, fixture mock) · vocabulary corpus + closure │
     └──────────────────────────────────────────────────────┘

     Paid/external boundary (ALL currently mock-pinned, $0):
     Anthropic (src/ai/real.ts) · Voyage embeddings · Tavily · The Odds API ·
     SportsDataIO · Browserbase (src/onboarding/browserbase-session.ts) ·
     Supabase Realtime (src/realtime) · Web Push (src/push) · webhooks/email mocks
```

**Component responsibilities** (all [V] unless noted):

| Component | Responsibility | Key files |
|---|---|---|
| `src/core` | Validated env (`getEnv()`, discriminated mock/real unions), logging, metrics, typed `Result`, rate limits, spend guards, health, dependency-free Redis RESP client | `core/env/schema.ts` (32KB), `core/redis.ts:95-158`, `core/rate-limit.ts`, `core/spend-guard.ts`, `core/health.ts` |
| `src/db` | Drizzle schema (85 `pgTable`, 62 `pgPolicy`), RLS helper, migrations 0000–0078, test-only serialized migrator | `db/schema.ts` (155KB), `db/rls.ts:24-40`, `db/test-support.ts:13-25`, `db/migrations/` |
| `src/auth` | Better Auth (drizzle adapter, Redis secondary storage, built-in auth rate limits 100/60s, sign-in 5/60s); **leagues-as-organizations** (`allowUserToCreateOrganization:false` — only domain code creates leagues); custom RBAC (commissioner/league_admin/data_steward/member) + separate `platform_admins` plane; Better Auth's own `invitations` table is **dormant** — real invites are the custom hashed-token `league_invites` flow | `auth/instance.ts:38-93`, `auth/guards.ts:44-49,165-186`, `auth/permissions.ts`, `onboarding/invites.ts:266-272` (sha256 tokens, 30d TTL) |
| `src/providers` | Provider-agnostic model + per-provider clients & decoding dictionaries; vocabulary-closure tests | `providers/model.ts`, `providers/espn/client.ts` (78KB), `providers/espn/reference-data.ts`, `providers/decoding.ts` |
| `src/ingestion` | Sync + persistence + reconciliation of normalized seasons; capability map; shadow-import quarantine; payload drift canaries; poll policy | `ingestion/current-league.ts` (104KB; `syncCurrentLeague` :3254, `persistNormalizedLeagueRows` :2770), `historical-import.ts`, `capability-map.ts`, `quarantine-corpus.ts`, `poll-policy.ts` |
| `src/onboarding` | Connect/discover/import flows per provider; credential crypto; invites; stewards; BrowserSession seam (Browserbase adapter) | `onboarding/provider-service.ts` (35KB), `credential-crypto.ts`, `invites.ts` (31KB), `browserbase-session.ts` |
| `src/stats` | Stats engine over imported facts; curated save→push state machine; eras; edit ledger; records catalog; branded `CanonCatalog` | `stats/engine.ts` (149KB), `curated-state.ts` (54KB), `curation.ts` (64KB), `records-catalog.ts` (107KB), `canon-catalog.ts` |
| `src/ai` | League + central content pipelines, personas, model routing/tiering, mock/real providers, editorial recall, near-dup gates, judge, usage attribution, personal agent | `ai/pipeline.ts` (104KB; `generateLeagueBlogPost` :3420), `ai/central-pipeline.ts`, `ai/interfaces.ts`, `ai/real.ts` (40KB), `ai/mocks.ts` (62KB), `ai/editorial-recall.ts` |
| `src/content` | Content lifecycle state machine, editorial ledger, corrections | `content/lifecycle.ts`, `content/editorial.ts`, `content/corrections.ts` |
| `src/news` | Publication front (lead/secondaries/river), league feed + central→league reference bridge, central news article assembly, sections | `news/front.ts`, `news/league-feed.ts` (bridge insert/read :243-262,:387), `news/article.ts` |
| `src/jobs` | 33 Inngest functions: ingestion ticks, historical imports, content plan/generate (league + central), settlement, digests, canaries | `jobs/index.ts:91-125`, `jobs/events.ts:4-33`, `jobs/functions/` |
| `src/betting` + arena | Paper sportsbook: odds snapshots, slips/legs (league-scoped, RLS), event-sourced bankroll ledger + weekly rollover, settlement serialized by `pg_advisory_xact_lock` per (league,event) (`settlement.ts:288-296`); **`betting_event`/`betting_market` are central, league-agnostic, no RLS by design** (one canonical NFL game shared across leagues); arena standings are central, derived from league ledgers (`arena.ts`, 31KB). Note the dual-id convention on `game.final`: `gameId` is a `fantasy_matchups.id` from ingestion producers, `bettingEventId` names the central `betting_event.id` (AGENTS.md rule; `jobs/events.ts:220-226`) | `betting/`, `jobs/functions/betting-settle-game-final.ts` |
| `src/realtime`, `src/push`, `src/webhooks`, `src/email` | Supabase Realtime token grants: 5-min HS256 JWTs hand-signed with `SUPABASE_JWT_SECRET` (mock mode falls back to the auth secret), channels scoped to actual league memberships (`league:{id}:{scores\|odds\|leaderboard\|blog\|lore\|history\|presence}` + public `central:news`/`arena:leaderboard`); server-only logic vs client-safe DTO split. Web Push: VAPID, per-league RLS subscription rows, sha256 endpoint keys, auto-disable on 404/410; preference matrix push/digest/none per event family. Webhooks + weekly digest email are **mock-only deliverers** (hashed URLs/emails, append-only delivery records) | `realtime/subscription-grants.ts:22,51-58,87-117`, `realtime/grants.ts`, `push/notifier.ts:141-185`, `webhooks/service.ts`, `email/digest.ts:49-62` |
| `src/lore`, `src/instigator`, `src/cast`, `src/members`, `src/share`, `src/entitlements`, `src/general-stats` | Lore claims/votes/canon; instigation seeds; persona display; membership; OG/share cards; entitlement gates + caps; mock "substrate B" general NFL stats | respective dirs |
| `src/app` | **36 page routes + 57 API routes** (no route groups, no middleware): league surfaces (`/leagues/[leagueId]/…` press/records/data/bet/lore/cast/members/ledger + legacy redirects), central hub (`/news[/section]`, `/news/articles/[id]`, `/arena[/section]`), onboarding per provider, `/you`, `/invite/[leagueId]/[token]`, `/offline`. 31/36 pages `force-dynamic`; authenticated root `/` redirects to `/news`. Server components fetch data directly (league pages: `requireLeagueRole` → data module → view component) | `src/app/**`, `src/navigation/scope.ts` |
| `e2e`, `test/` | Playwright specs (onboarding, PWA cache isolation, screenshots); offline AI eval harness; provider fixtures + sanitized ESPN corpus | `e2e/`, `test/evals/ai/`, `test/fixtures/` |

*(Subsystem detail from the seven mapping agents is integrated throughout §§4–10.)*

## 4. Critical flows (end-to-end, file:symbol at each hop)

### Flow A — Connect → import → canon → Record Book (the substrate)

1. **Connect (ESPN):** `POST /api/onboarding/espn` stores cookie credentials (SWID/espn_s2) encrypted via `src/onboarding/credential-crypto.ts` (AES-256-GCM under `CREDENTIAL_ENCRYPTION_KEY`) [V]; discovery lists the member's leagues (`src/providers/espn/client.ts`, `fan.api.espn.com` discovery per `specs/01`) [V].
2. **Import request:** `POST /api/onboarding/import` (`src/app/api/onboarding/import/route.ts:22-53`) → `importDiscoveredLeague` (`src/onboarding/provider-service.ts`) → enqueues Inngest `import.requested` (`src/jobs/events.ts:13`) [V].
3. **Shadow-gated import job:** `importRequested` (`src/jobs/functions/import-requested.ts:657-859`) runs the historical import through the **shadow-run quarantine** (spec 47C): the discovery row is claimed under a `pg_advisory_xact_lock` (concurrent import ⇒ 409), state `shadow_running`; the full-history import + integrity suite then either **quarantines** (failures ⇒ sanitized payload corpus captured via `src/ingestion/quarantine-corpus.ts`, state `quarantined`) or **promotes** — `promoteShadowImport` flips state to `live`, inserts the connector's commissioner `members` row, and fires `league.connected`. Stale shadows (>6h) are re-claimable; Inngest `onFailure` quarantines exhausted runs [V].
4. **Fetch + normalize:** provider client fetches season views (`mBoxscore`, `mRoster`, `kona_player_info`, `mDraftDetail`, …) and decodes **every** provider code through canonical dictionaries (`src/providers/espn/reference-data.ts`; unknown codes fail the `provider_code_decoding` integrity check loudly) [V].
5. **Persist + reconcile:** `persistNormalizedLeagueRows` (`src/ingestion/current-league.ts:2770`) upserts inside `withLeagueContext()` (`src/db/rls.ts:24-40` — transaction-local `set_config('app.current_league_id', …)`) using **content-hash conditional upserts** (`where contentHash is distinct from excluded` — a clean re-import reports 0 changed rows), chunked at 1,000 rows to stay under Postgres's 65,535 bind-param cap (regression-tested after the 2026-07-10 incident) [V]; per-(league, season) reconciliation deletes rows absent from fresh provider truth; steward "sticky edits" are re-applied over provider truth before upsert; no raw provider payloads are stored anywhere; `recordDataCoverage` (`:3004`) writes the measured **capability map** every surface later reads [V].
6. **Curate → push:** the commissioner-facing curation plane (`src/stats/curated-state.ts`, `curation.ts`) applies edits (each a ledger row), era boundaries, identity mappings; **push** freezes a canonical season snapshot. The **Record Book reads pushed canon only** (`src/stats/records-catalog.ts`), surfaced at `/leagues/[leagueId]/records`; the Data Book reads season-scoped substrate at `/leagues/[leagueId]/data` (`data/page.tsx:41` `?season` param) [V].
7. **Ongoing:** cron `ingestionTick` → per-league `league.ingest` events → `syncCurrentLeague` (`src/ingestion/current-league.ts:3254`) with adaptive `poll-policy.ts`; season rollover check; payload-drift canaries (`src/jobs/functions/payload-drift-canary.ts`) alert stewards on provider shape drift [V].

### Flow B — Cadence → AI generation → judge → publish → feed (the spectacle)

1. **Plan:** NFL-phase-aware crons (`src/jobs/functions/content-plan-cron.ts` → `src/jobs/content-planning.ts`, calendar in `src/sports/nfl-calendar.ts`) and reactive triggers (`content-plan-trigger.ts`: transaction/waiver/record-broken/lore-canonized/poll-closed/bet-settled/arena-swing; `content-plan-game-final.ts`) emit `content.generate` events with persona/type/triggerKey (`src/jobs/events.ts:106-112`) [V].
2. **Generate:** `contentGenerate` (`src/jobs/functions/content-generate.ts`) validates the payload (zod), resolves entitlements, then `generateLeagueBlogPost` (`src/ai/pipeline.ts:3420`): assembles context from **pushed canon only** via branded `CanonCatalog` (`src/stats/canon-catalog.ts`) + ratified lore + explicitly non-canon substrate-B general-NFL context; builds persona prompt (`src/ai/personas.ts`, versioned tone via `persona-tone-editor.ts`); calls the provider union — mock (`src/ai/mocks.ts`) or real Anthropic with prompt-cached prefix (`src/ai/real.ts`) — through model routing (`src/ai/model-routing.ts`, `ANTHROPIC_MODEL_TIER`/`AI_MODEL_ROUTE_JSON`) [V].
3. **Gate:** three publish gates sharing one retry budget (max 2 attempts): generic-slop/authenticity (draft must reference real league entities), near-duplicate (embedding cosine vs `DEFAULT_DUPLICATE_THRESHOLD = 0.92`, `src/ai/pipeline.ts:157`), and the LLM judge (authenticity/persona/roast-consent rubric, `src/ai/judge.ts:4-8`); failures mark the run `skipped:<reason>` and surface in the generation-failure queue (`src/ai/generation-failure-queue.ts`) with steward-visible retry [V].
4. **Publish:** content row persisted with lifecycle state (`src/content/lifecycle.ts`), editorial actions append-only (`src/content/editorial.ts`); embeddings stored to `ai_memory` (pgvector) for future recall (`src/ai/editorial-recall.ts`) [V].
5. **Read:** league feed/press pages assemble the publication front — lead/secondaries/river by editorial importance + freshness (`src/news/front.ts:1-31`) — and include **central** items only via `league_feed_reference` rows (`src/news/league-feed.ts:243-262`) [V].
6. **Central variant (Phase 3):** cron `centralContentPlanCron` → `content.central.generate` → `runCentralContentGenerate` (`src/jobs/functions/central-content-generate.ts`) → `generateCentralColumn` (`src/ai/central-pipeline.ts:602`): a 5-journalist / 10-column engine, evidence-validated formats (`central-content-types.ts`), write-time freshness (`central-freshness.ts`), pgvector near-dup gate over the `league_id IS NULL` memory pool with one retry (migration `0078`), and server-side rebuild of reader bodies from validated structures so model prose can't publish ungrounded facts (P3-FIX; `central-article-draft.ts:144-178`) [V code+`.orchestration/reviews/phase3-central-review.md`]. Central publishes with **no LLM judge and no consent/entitlement gates** (structural validation only), and reaches league feeds only via `tailorCentralNewsToLeagues` player-ref matching (`news/tailoring.ts:380-445`) [V]. **Note:** the central dependency factory is *hard-pinned to mocks by contract* — `createMockCentralAiDependencies(getDb())`, "P3 is mock-only by contract. Phase 4 replaces this dependency factory" (`central-content-generate.ts:55-58`) [V].

## 5. Tech stack & dependencies

[V: `package.json`, lockfile present (`pnpm-lock.yaml`), configs read]

- **Runtime/framework:** Next.js **16.2.9** (App Router, Turbopack build), React **19.2.4**, TypeScript 5 strict, Node 22 (pnpm **10.28.2** pinned via `packageManager`). PWA: hand-written `public/sw.js` service worker; no next-pwa.
- **Data:** Drizzle ORM **0.45.2** + drizzle-kit 0.31 (config `drizzle.config.ts` reuses the app's validated env parser [V]), `pg` 8.21 pool, Postgres 17 + **pgvector** (`pgvector/pgvector:pg17` in compose and CI), **Postgres RLS** as the tenancy backbone. Prod intent: Neon (per compose comment + `AGENTS.md`); code is any-`DATABASE_URL`.
- **Auth:** Better Auth **1.6.16** (organization plugin; leagues-as-orgs).
- **Jobs:** Inngest **4.5.1** (+ `@inngest/test`), served at `/api/inngest`; three env modes (empty=mock/no-enqueue, `INNGEST_DEV`=dev server, event key=cloud) [V env schema + `.env.example`].
- **AI:** `@anthropic-ai/sdk` **0.104.1** direct (explicitly **no LangChain**); models pinned in `src/ai/model-config.ts:3-5` — flagship `claude-opus-4-8`, bulk `claude-haiku-4-5-20251001`, embeddings `voyage-4-lite` (`ANTHROPIC_MODEL_TIER=cheap` default keeps all six personas on Haiku; `mixed` promotes commissioner/narrator/trash_talker/beat_reporter to Opus). Voyage via REST, `@tavily/core` for web grounding, zod **4.4.3** everywhere including `zodOutputFormat` structured outputs (convention: no zod transforms in output schemas — held repo-wide, zero `.transform` in `src/ai` [V]); an OpenAI-compatible custom-endpoint escape hatch exists behind `AI_MODEL_ROUTE_JSON`.
- **Realtime/notifications:** `@supabase/supabase-js` 2.108 (Realtime Broadcast; token-grant model), `web-push` 3.6.7.
- **Redis:** **no client dependency** — a deliberate hand-rolled minimal RESP client over `node:net`/`node:tls` (`src/core/redis.ts:95-158`), consumed by exactly four things [V]: Better Auth secondary storage (`src/auth/redis-secondary-storage.ts`), spend-guard counters, API rate-limit counters, and the health ping. No caching layer. The RESP implementation is **triplicated** (near-identical copies in `core/redis.ts`, `core/spend-guard.ts:62-211`, `core/health.ts:163-252`) — divergence risk; it also uses `GETDEL` (requires Redis ≥ 6.2), opens one socket per command, no pooling. Prod intent per comments: Upstash (`rediss://` supported); nothing Upstash-specific in code.
- **UI:** Tailwind CSS **4.3** (+ `@tailwindcss/postcss`), `@base-ui/react` 1.5, `shadcn` 4.11, `class-variance-authority`, `lucide-react`, `tw-animate-css`; AUSPEX tokens in `src/theme`/`globals.css`; fonts declared in root `auspex-fonts.ts` (Next/font literal-string constraint) [V].
- **Quality tooling:** Biome **2.2.0** (lint+format; no ESLint/Prettier), Vitest **3.2** (jsdom, 30s timeouts, three configs: unit/integration, `ai-eval`, `ai-variants`), Playwright **1.60** (port 3100, `workers:1`, auto dev-server), `fast-check` 4.9 property tests, `sharp` (icons), `tsx`, UBS (external bug scanner, CI-installed).
- **Notable/unusual choices:** hand-rolled RESP client (dependency minimalism); zod v4 (early adopter); hand-authored SQL migrations with frozen drizzle meta (see §9.3); `server-only` package to fence server modules; Biome over ESLint; no monorepo (single app with strong internal module boundaries per `specs/01`).

## 6. Navigation guide (if you need X, look in Y)

| Need | Look in |
|---|---|
| Any env var, mock/real switching, spend caps | `src/core/env/schema.ts` (+ `.env.example` as the catalog) |
| Add/change a table, RLS policy | `src/db/schema.ts`; then hand-write `src/db/migrations/00XX_*.sql` **and** journal it in `migrations/meta/_journal.json`; add FORCE RLS + canary (see §9.3 — never `pnpm db:generate`) |
| League isolation mechanics | `src/db/rls.ts` (`withLeagueContext`), `src/db/rls-canary.test.ts` (per-table canaries), `rls.test.ts` |
| Provider HTTP/decoding (ESPN/Sleeper/Yahoo) | `src/providers/<provider>/client.ts`, `reference-data.ts` (dictionaries), `src/providers/decoding.ts` (unknown-code invariant) |
| Import/sync/reconciliation logic | `src/ingestion/current-league.ts`, `historical-import.ts`; job wrappers in `src/jobs/functions/{import-requested,ingestion-live}.ts` |
| Connect/onboarding flows, credentials, invites | `src/onboarding/` (+ routes under `src/app/api/onboarding/`) |
| Stats math, records, eras, identity resolution | `src/stats/engine.ts`, `records-catalog.ts`, `curation.ts` |
| Save→push canon, edit ledger | `src/stats/curated-state.ts`; push API route under `leagues/[leagueId]/curation/` |
| What the AI is allowed to know | `src/stats/canon-catalog.ts` (branded type), `src/ai/pipeline.ts` context assembly |
| Personas/voice/tone | `src/ai/personas.ts`, `persona-tone-editor.ts` (versioned; platform-admin-gated) |
| League content formats & cadence | `src/ai/content-types.ts` (11 types), `league-columns.ts`, `src/jobs/content-planning.ts`, `src/sports/nfl-calendar.ts` |
| Central hub engine (Phase 3) | `src/ai/central-{pipeline,columns,content-types,freshness}.ts`, `src/jobs/functions/central-content-*.ts` |
| Content lifecycle/retract/corrections | `src/content/` |
| Feed/front-page composition | `src/news/front.ts`, `league-feed.ts`, `article.ts` |
| Betting/bankroll/arena | `src/betting/` (placement, bankroll ledger, arena), settle job `src/jobs/functions/betting-settle-game-final.ts` |
| Jobs & events catalog | `src/jobs/index.ts` (registration), `src/jobs/events.ts` (names+payloads) |
| Realtime/push/webhooks/email | `src/realtime/`, `src/push/`, `src/webhooks/`, `src/email/` |
| Rate limits / spend guards / health | `src/core/{rate-limit,spend-guard,health}.ts` |
| Security headers / cache headers | `src/app/security-headers.ts`, `league-cache-headers.ts` (wired in `next.config.ts`) [V] |
| UI primitives & design tokens | `src/components/`, `src/theme/` (+ token-contract test), `DESIGN.md` |
| Route pages | `src/app/leagues/[leagueId]/*` (league), `src/app/news|arena` (central), `src/app/onboarding/*`, `/you` |
| E2E + AI eval harnesses | `e2e/`, `test/evals/ai/` (offline judge = CI gate) |
| Ops scripts | `scripts/` (`import-real-league.ts` **destructive, guarded**; `repush-all-seasons.ts`; `dev-db-{dump,restore}.sh`; `harvest-public-leagues.ts` guarded harvester; `verify-*.ts` per-task oracles) |
| Live project state / history / operating model | `docs/PROGRESS.md` (SSOT), `docs/HANDOFF-NEXT-AGENT.md`, `docs/HISTORY.md`, `ORCHESTRATION.md`, `.orchestration/` (untracked ledgers/reviews/prompts) |
| Why the top-level layout looks like this | `specs/01-architecture.md` "Repo layout (target)" — the actual `src/` matches it nearly 1:1 [V]; `app/` lives at `src/app`, `ui/` became `src/components`+`src/theme`, and later arcs added `content/`, `general-stats/`, `lore/`, `share/`, `instigator/`, `cast/`, `entitlements/`, `webhooks/`, `email/`, `pwa/` as sibling modules in the same spirit |

## 7. Conventions & working agreements (as actually practiced)

**Operating model** [V: `ORCHESTRATION.md` + `.orchestration/` scripts + git topology]:
- An **orchestrator agent** (Claude) plans, reviews, merges; **workstream agents** (Codex `gpt-5.6-sol` via `codex exec`, per-track tmux sessions, own `CODEX_HOME` accounts) each build ONE spec in their **own git worktree** on `ws/<track>-<spec>`, within a **file-ownership boundary**; they commit+push every round and **never merge**. The orchestrator re-runs the full gate suite and merges to `main`. The 30 local `ws/*` branches and `[47A]`/`[P3-FIX]`-style commit prefixes are this model's fossil record [V: `git branch -a`].
- **Post-merge adversarial review waves** are standard: 3 parallel read-only reviewers with distinct lenses; findings consolidated in `.orchestration/reviews/` and fixed as tranches (T18: 25 findings; wave-1 F47: 13; Phase-3 central: 1 HIGH + 1 must-fix, both remediated at HEAD) [V: review files + merge commits].
- The old autonomous "Ralph loop" is **retired** (`loop.sh` refuses to run; archived prompts in `docs/archive/`) [V: `loop.sh:16-20` guard].

**Engineering conventions** [V: `AGENTS.md` cross-checked against code — no material drift found]:
- **Gates before every commit, never disabled:** `pnpm typecheck · lint (biome) · test · build`, `ubs <changed>`, `pnpm secret-scan`; + `eval:ai:offline` when AI changes; + `test:e2e` for flagship flows; + `perf:pwa` for shell/routes; + AUSPEX design fidelity for UI. CI (`.github/workflows/ci.yml`) runs the same suite plus an **ESPN corpus privacy tripwire** (fails on GUIDs/emails/the real league's name inside `test/fixtures/espn-corpus`) and UBS over changed files [V].
- **League isolation is sacred:** every league-scoped query filters `league_id` **and** runs under RLS via `withLeagueContext()`; new league tables get `pgPolicy` + hand-added `FORCE ROW LEVEL SECURITY` + a canary in `rls-canary.test.ts`. Central content is `content_item.league_id IS NULL` with a partial unique index for dedup; league feeds may reference it only through `league_feed_reference`.
- **Env discipline:** server code reads env **only** via `getEnv()`; paid services are `{mock:true}|{mock:false,…}` unions — branch on `.mock`, never read key vars directly. Never call `getEnv()`/`getAuth()` at module scope in routes (build-time evaluation). DB-backed static-looking pages must `export const dynamic = "force-dynamic"`.
- **Migrations:** meta snapshots frozen at 0034; 0035–0078 are **hand-authored SQL** journaled manually; `pnpm db:generate` is effectively banned (§9.3).
- **Testing:** DB tests use `migrateSerialized()` (advisory-lock serialization, `db/test-support.ts:13-25`); don't reuse a transaction after an expected error; don't `Promise.all` on one transaction; fixture leagues use reserved non-real provider ids (`fixture-espn-95050`); cross-league fan-out tests never assert global counts; 30s timeout budget is intentional for arena/bankroll/stat recomputes.
- **Secrets:** only in gitignored `.env.local`; ESPN calls server-side only; never log cookies/tokens; real league is referenced by provider id `95050`, never a stored UUID.
- **Environment gotchas that will bite you** [V: `AGENTS.md` + README, confirmed live]: `node` on PATH is a bun shim — run `PATH=/usr/bin:$PATH pnpm …`; `rm -rf` is blocked by a command guard (use `mv` to /tmp); zsh needs array-expansion for multi-file `ubs` args.

## 8. Build/test/CI ground truth (executed this session)

Local full gate run at HEAD [V: executed 2026-07-23, logs in session scratchpad]:

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm lint` (biome) | ✅ exit 0 |
| `pnpm secret-scan` | ✅ exit 0 |
| `pnpm test` (vitest, local pg+redis stack) | ⚠️ 1,405 passed / 2 failed / 5 skipped (279 files). Both failures are **timeouts** in `src/betting/arena.test.ts` (45s cap) and `src/jobs/bankroll-rollover.test.ts` (30s cap) — the exact load-sensitive class `AGENTS.md` documents; this run competed with 7 parallel analysis agents. **Both files pass in isolation: 7/7 ✅** (re-run this session). The 5 skips are the documented `LIVE_SMOKE=1` paid-provider smokes. |
| `pnpm eval:ai:offline` | ✅ 8/8 (offline mock LLM/judge gate) |
| `pnpm build` (Next 16 / Turbopack) | ✅ exit 0 — compiled 34.7s, 26 static pages |

CI (`.github/workflows/ci.yml`) [V read]: single `Verify` job on push/PR — pgvector:pg17 + redis:7 services on the same ports as local; secret scan → corpus privacy tripwire → typecheck → lint → test → offline AI eval → build → Playwright chromium install → **flagship e2e** (`espn-onboarding`, `pwa-cache-isolation`) → PWA perf budget → UBS over changed files. Note: CI can only run when someone pushes; there are no PRs — the orchestrator pushes merged `main`.

**Delivery reality:** there is **no deployment workflow and no production environment** — shipping = merging to `main` on this dev box; the app runs via `pnpm dev`/`pnpm start` locally [V: only `ci.yml` exists under `.github/workflows/`; `HANDOFF §3` "no production deployment exists at all"].

## 9. Key insights & risks (the load-bearing knowledge)

### 9.1 The canon boundary is the architecture — but it is enforced unevenly [V]
The intended invariant (spec 45 §A / North Star): AI never asserts un-ratified league history. The strong form exists: a **branded `CanonCatalog`** (`src/stats/canon-catalog.ts:32-36` — `unique symbol` brand, sole producer `getLeagueCanonRecordsContext:860`, test-only forge in `src/testing/canon.ts`) whose values provably derive from pushed season snapshots; the Record Book pages and the **member Q&A personal agent** (`src/ai/personal-agent.ts:481,504`) consume it, so saved-but-unpushed edits and live provider rows are invisible to them *by construction*. **However, the league blogger pipeline does not use it**: `src/ai/pipeline.ts` never imports `CanonCatalog` and reads **live** `all_time_records` (`isCurrent=true`) and `head_to_head_records` directly at `pipeline.ts:2617-2660` [V — confirmed by two independent readers this session]. Its guard is different and weaker: records context is emptied whenever any `data_integrity_checks` row is failing (`:2606-2620`). The central pipeline sits in between (server-rebuilt bodies from validated structures, P3-FIX). So there are **three provenance regimes** — canon-branded (personal agent, Record Book), integrity-gated live (league blogger), structure-validated (central) — while `docs/START-HERE.md §2`/`HANDOFF §0` describe a single "compiler-enforced pushed-canon AI context." Either the blogger is an intended live carve-out (recaps of the *current* week necessarily use live data) or this is the largest remaining gap against the North-Star rule. **Surface to the owner before building any new AI surface; when in doubt, consume `CanonCatalog`.**

### 9.2 RLS + explicit filters + canaries, and the auth-plane exception
Tenancy is Postgres RLS keyed on `app.current_league_id` (set per-transaction in `withLeagueContext`, `src/db/rls.ts:34-39`; the `current_league_id()` SQL function from migration `0002` returns NULL when unset, so league tables are *invisible outside any context*) **and** explicit `WHERE league_id` (defense in depth). `FORCE ROW LEVEL SECURITY` is hand-added in 33 migrations because drizzle-kit doesn't emit it — the 0002 comment explains why: on Neon the app connects as the table **owner**, and only FORCE binds owners [V]. Scope tally [V]: 85 tables = 60 `_isolation`-policied league tables + 2 mixed-scope (`content_item`, `ai_memory` — `league_id IS NULL OR = current_league_id()`) + 23 central/auth-plane tables with no restrictive RLS. Proof comes in two layers: `rls.test.ts` asserts catalog state (`relforcerowsecurity`, policy shape), and `rls-canary.test.ts` (64KB, 63 tests) provisions a dedicated `NOSUPERUSER NOBYPASSRLS` role and proves zero cross-league visibility and WITH CHECK write rejection through it [V]. **Two caveats:** (a) the Better Auth plane deliberately has no restrictive RLS (membership must be readable before a league context exists) — treat auth-plane↔league-plane joins as review hotspots; (b) **the guard lists are hand-maintained and incomplete** — `rls.test.ts`'s catalog check names only 39 of the 60 policied tables, and no test derives "every table with a `league_id` column must be policied+forced" from the schema itself, so a future league table added without a policy and omitted from both lists would pass CI silently [V — db audit]. A schema-driven completeness test is the single highest-value hardening this layer could get.

### 9.3 The migration workflow is inverted from stock Drizzle — biggest uninformed-change trap
Drizzle-kit **meta snapshots are frozen at 0034**; migrations **0035–0078 are hand-written SQL** appended manually to `meta/_journal.json` [V: journal entries vs `meta/` snapshots; `AGENTS.md`]. Running `pnpm db:generate` (still present in `package.json`) would diff live schema against a 40-migrations-stale snapshot and emit garbage. The safe recipe: edit `schema.ts` → hand-write `00XX_*.sql` → journal it → hand-add FORCE RLS → canary test. An uninformed agent running `db:generate` is the single most likely way to corrupt this repo.

### 9.4 $0 mock-pinning is enforced in layers — but the default is *spend*
Layer 1: `MOCK_*` env pins (`.env.local` sets all true; real keys present but inert [V names-only check + memory]). Layer 2: env-level discriminated unions (`ServiceConfig = {mock:true}|{mock:false;apiKey}`, `schema.ts:33`) make "is this mock?" a compile-visible branch, and `createAiDependencies` never even constructs `AnthropicLlmClient` when mock (`dependencies.ts:253-266`) [V]. Layer 3: **spend guards** — rolling-24h Redis counters with per-provider caps (anthropic 2M tokens, browserbase 25 sessions, odds/sportsdataio/tavily 250 req, voyage 25k; `schema.ts:160-167`) that demote to mock at cap [V]. Layer 4: contractual pins — the central pipeline's dependency factory returns mocks unconditionally (`central-content-generate.ts:55-58`) [V]. **The sharp edge:** the resolution rule is `mockFlag !== true && key present ⇒ REAL` (`schema.ts:712-719`) — an *unset/blank* `MOCK_*` next to a live key means real spend. There is no explicit opt-in-to-spend gate; the $0 posture rests on `.env.local` keeping every `MOCK_*=true` beside the staged keys, CI having no keys, and the spend-guard ceiling. Documented behavior (README), but anyone editing `.env.local` should treat blanking a `MOCK_*` line as flipping a paid switch. Browserbase additionally sits outside unit-level spend-guard wiring (session cap only) [I: `PHASE-4-ACTIVATION-CHECKLIST`].

### 9.5 Sticky degraded modes (quiet footguns)
- Rate limiting: on first Redis error, `usingFallback = true` **permanently** switches the process to per-instance in-memory counting until restart (`src/core/rate-limit.ts:53-62`) [V] — under multi-instance deployment this silently weakens limits; one log line (`api_rate_limit_store_fallback`) is the only signal. The **same latch pattern exists in the spend guard** (`core/spend-guard.ts:310,387-407` per platform audit) — a transient Redis blip demotes cost caps to per-process memory too.
- Realtime/push/webhooks/email fail soft (warn + continue) by design in mock mode — fine today, but the same softness must not survive Phase-4 flips unaudited.

### 9.6 Entitlements are open-by-default — including in production [V, confirmed twice]
`defaultEntitlementDevOverride()` returns `true` for **every** NODE_ENV including `production`, with an explicit "TEMPORARY (pre-pricing testing)… Re-gate when the pricing plan lands" comment (`src/core/env/schema.ts:352-363`); the production hardening block only rejects an *explicit* `ENTITLEMENTS_DEV_OVERRIDE=true` (`:474-486`), not the silent default. The resolver short-circuits every capability to `allowed` under the override (`src/entitlements/resolver.ts:275-283` per platform audit). **Intended** (free tier = everything, pre-pricing), but it means Stripe/pricing launch has a hard prerequisite: restore the production case to `false` — nothing else in the codebase will remind you.

### 9.7 Inngest config is partially theater [V]
`src/jobs/client.ts` is a bare `new Inngest({ id, name })` — the carefully-parsed `getEnv().jobs.inngest` union (mock/dev/cloud, base URLs, keys) is consumed only by the onboarding mock-gate (skip `.send()` in mock mode), health reporting, and the drift-canary gate. Event/signing keys reach the SDK only via its own `process.env` auto-read; `INNGEST_BASE_URL`/`INNGEST_DEVSERVER_URL` overrides are **not honored** by the client/serve path. Works today (mock + default dev server); will surprise whoever wires real Inngest cloud with non-default URLs in Phase 4.

### 9.8 Security-header posture is early-stage [V]
No `middleware.ts`; headers come from `next.config.ts` → `src/app/security-headers.ts`. CSP allows `script-src 'unsafe-inline' 'unsafe-eval'` and inline styles (`security-headers.ts:6-7`); **no HSTS**; `/onboarding/espn/mock-browser` is deliberately exempted from CSP + X-Frame-Options (the mock cookie-capture iframe). Good bones (nosniff, DENY, referrer/permissions policies, signed OG URLs, hashed invite tokens/webhook URLs/digest emails), but the CSP would be the first thing a production security review flags — tracked as Phase-6 territory.

### 9.9 Two authority models coexist in auth [I — review hotspot]
`src/auth/guards.ts:44-49` uses a linear `ROLE_RANK` (member < data_steward < league_admin < commissioner) while the Better Auth access-control statements (`src/auth/permissions.ts:31-39`) give `data_steward` the `leagueData:manage` capability that `league_admin` lacks — rank and capability disagree about who outranks whom. Nothing observed broken, but any new guard that assumes "higher rank ⇒ superset of capabilities" will be wrong for these two roles.

### 9.10 The dev DB is shared state with a loaded gun nearby
The shared local Postgres holds the owner's real imported league (ESPN 95050, 16 seasons). `scripts/import-real-league.ts` is a **reset-and-verify harness that DELETES the league row first** (cascading away curated snapshots/ledger/content); it wiped the dev league on 2026-07-10 and simultaneously exposed the unchunked-insert bind-param crash. Both are fixed (`--reset-league` ack required, `b300879`; 1,000-row chunking + regression test, `e60842e`) [V], and `pnpm db:dump`/`db:restore` exist — but **no backup cron is installed** (owner-gated). Routine refreshes should use product import/sync APIs, never the harness.

### 9.11 Ingestion trusts nothing (spec 47's posture) — but is validated against few leagues
Bulletproofing machinery: vendored+independently-rederived ESPN vocabulary corpus with CI closure tests; unknown-code invariant fails imports loudly; property-based suite (fast-check) proving idempotence/reconciliation/volume/co-owner-identity invariants; measured per-(season × data-class) **capability map** all surfaces read; shadow-run quarantine for new connects; payload-drift canaries with steward acknowledgement [V: `src/ingestion/*`, `providers/espn/vocabulary-closure.test.ts`, migrations 0073–0077]. Honest limits (documented and true): ESPN validated deeply against **one** real league shape; Sleeper against two public leagues via fixtures; **Yahoo is scaffolding (0% real)**; ESPN player depth exists only 2011–2017 + current season for the validation league (provider limitation, proven twice); per-stat breakdowns current-season-only.

### 9.12 Read-path scale is only partially solved [now V, was I]
The 2026-07-03 audit flagged three read-path scalability issues. At HEAD: Data Book is season-scoped (`?season`, `data/page.tsx:41`) [V]. The Records read path, however, **re-derives at every request**: `getLeagueCanonRecordsContext` does not read the persisted `season_statistics`/`championship_records` rows — it recomputes championship/season/player records from the pushed snapshots' frozen weekly rows on each read (`canon-catalog.ts:413-703`), with no caching layer [V — stats audit]. That is also a *correctness* seam: the read-time derivation and `engine.ts`'s write-time computation are two implementations of the same math with no shared function — if they drift, canon Record Book and live Data Book disagree on identical data [I risk]. `/news`-style scans remain unproven against real content volume (tables are dev-scale). Arena/bankroll recomputes legitimately run 20–90s in tests — batch-shaped work (full-league stats recompute also runs inline in the import job, `import-requested.ts:742`) that needs attention before real concurrency. There is no Redis/materialized caching anywhere — by design so far, by limitation at scale.

### 9.13 Docs are load-bearing infrastructure — with known staleness
The operating model routes ALL continuity through docs (`PROGRESS.md` SSOT → `ROADMAP` → `HANDOFF` → per-task ledgers). Current drift, confirmed this session: (1) `PROGRESS.md:4-5` still says P3-FIX is "pending orchestrator merge" — it **is merged** at HEAD; (2) `docs/START-HERE.md` is two waves stale ("through T19; migrations 0072" vs reality 0078 + specs 47/48/49); (3) `docs/HISTORY.md` ends at 2026-06-24 (T16); (4) `HANDOFF §5` "NO Browserbase key exists" contradicts the newer `PHASE-4-ACTIVATION-CHECKLIST` (key names ARE in `.env.local` [V]); (5) `.orchestration/` (ledgers/reviews/prompts) is deliberately **untracked** (owner decision) — a continuity single-point-of-failure on this box, mitigated only by the archived analyses and tracked docs.

### 9.14 Subsystem findings from the deep audits (verified unless marked)

**Database (full report: db audit):**
- `arena_standing` carries a nullable real `league_id` but **no RLS policy** — cross-league by design (leaderboards), but any authenticated DB connection can read every league's standings/PnL; isolation rests entirely on the app layer [V]. Same posture on `league_entitlements`/`entitlement_events` (documented auth-plane-central).
- Append-only integrity uses a `pg_trigger_depth() > 1` trigger pattern (allows FK-cascade maintenance, rejects direct UPDATE/DELETE) across 14 migrations — e.g. `0061_editorial_actions.sql` [V].
- `createDb` applies **no pool tuning** (node-postgres defaults, max 10 connections, no statement timeout) [V] — fine locally, will need attention for Neon/serverless.
- Deleting a `leagues` row cascades across the entire fantasy/stats/content graph — maximally destructive by construction (this is what the 2026-07-10 incident exercised).

**Ingestion/providers (full report: ingestion audit):**
- Idempotency is **content-hash conditional upserts**: every entity computes `stableContentHash` and upserts `where contentHash is distinct from excluded` — a clean re-import reports 0 changed rows (`current-league.ts:1323-1349`, `hash.ts:53-72`) [V]. No raw provider payloads are stored anywhere.
- Shadow-import promotion mechanics: discovery row claimed via `pg_advisory_xact_lock` + optimistic state match → `shadow_running` → full import + integrity suite → failures ⇒ `quarantined` with sanitized corpus capture; clean ⇒ `promoteShadowImport` inserts the commissioner `members` row and fires `league.connected` (`provider-service.ts:868-1090`, `import-requested.ts:657-859`) [V]. Stale shadows re-claimable after 6h; Inngest `onFailure` quarantines exhausted runs.
- **`server-only` is enforced only in provider barrels**, not in `client.ts` files, and `import-requested.ts:36` already imports `@/providers/espn/client` directly — one future client-side import would ship ESPN cookie logic to the browser [V].
- `espn_s2` is only trimmed, then interpolated into the `Cookie` header (`espn/client.ts:324,524`) — no `;`/newline sanitization; a header-injection surface if a malformed value ever arrives via manual entry [V].
- Credentials are AES-256-GCM encrypted at rest (scrypt-derived key, versioned envelope, `credential-crypto.ts:43-96`); only `PROVIDER_AUTH_EXPIRED` invalidates a credential (Yahoo gets one token-refresh retry first) [V].
- Sleeper's provider is **always real** (public API, no mock branch in `deps.ts:105,151`); ESPN's real-vs-fixture switch is keyed on the **Browserbase** mock flag, not an ESPN flag [V] — surprising coupling worth knowing.
- Yahoo has **no decoding dictionary** (`providers/decoding.ts:50-61`) — observed Yahoo codes would fail `provider_code_decoding` as `dictionary_missing`, quarantining shadow imports by design.

**Stats/curation (full report: stats audit):**
- Stats are computed at **ingest time only** (full recompute in the import job; incremental on live sync; never on page load). "Push" is per-season and append-only; canon = latest push per season composed at read (`curated-state.ts:1694-1762`) [V].
- Era proposals key on durable structure only (league size, playoff shape, weeks, lineup mode — scoring tweaks deliberately excluded, `curation.ts:1328-1356`); identity resolution uses hard-coded 0.6 merge / 0.59 co-owner-cap thresholds (`engine.ts:491-541`) [V].
- A commissioner who edits but never re-pushes leaves Record Book + personal agent silently stale — `hasSavedUnpushed` in the Data Book is the only signal [V mechanics, I risk]. Per-season pushes have no cross-season consistency lock, so era-spanning records can transiently mix pushed generations [I].
- The un-branded live records path `getLeagueRecordsCatalog` (`records-catalog.ts:3616`) has **zero production callers** — dead-ish API kept alive by tests [V].

**AI internals (full report: ai audit + direct verification):**
- The cast is **6 personas** (commissioner, narrator, trash_talker, beat_reporter, analyst, betting_advisor — `personas.ts:1-8`), each with guardrailed tone profiles and per-league versioned tone cards; **6 named league columns** (P2) and a central engine of **5 journalists × 10 columns** (P3) [V].
- League generation runs a 3-gate publish path with **one shared retry (max 2 attempts total)**: (a) generic-slop/authenticity — draft must reference actual league entities via case-insensitive ≥3-char token match (weak: substring-based); (b) near-duplicate — embedding similarity vs 0.92 threshold; (c) **LLM judge** — rubric 0.7 authenticity / 0.7 persona-match / roast-consent enforcement (`pipeline.ts:1746-1859,3613-3691`, `judge.ts:4-8`) [V]. **Central generation has near-dup + evidence-validated structure but NO judge, no consent, no entitlement gate** [V] — its quality bar is structural, not judged.
- Anthropic prompt caching is real: `cache_control: { type: "ephemeral" }` on the stable persona/league-facts prefix (`real.ts:668-751`); usage attribution weights cache reads at 1/10 and writes one `ai_usage_event` per attempt — but **`costMicrosUsd` is summed yet never populated** (dollar economics need Phase-4 wiring) [V].
- Prompt-injection defense is layered **for news**: web/RSS grounding is fenced as inert JSON in `<untrusted_news>` blocks (`pipeline.ts:1879-1892`), declared untrusted in the system prompt (`real.ts:488`), with standing persona guardrails (`personas.ts:63-65`) [V]. **But member-authored lore is NOT fenced**: canonized claim titles/statements are injected into the *trusted, cached* system prefix (`pipeline.ts:753-799`) — a league that votes an injection-bearing claim into canon puts attacker text in trusted context; only the judge's leakage/consent checks stand in the way [V mechanics, I exploitability]. The most interesting security seam in the app.
- Failure visibility has a gap: a generation that *throws* leaves its run in `running` (never `failed`) until the 30-minute `stale_pending` sweep surfaces it in the failure queue [V].
- Vector memory: single `ai_memory` pgvector table, **no ANN index** (fine — the only `<=>` query scans ≤20 rows); mock embeddings are deterministic-non-semantic, so **production-quality semantic dedup has never been exercised** [V/I].
- Structured outputs use `zodOutputFormat` for generation **and** judge (`real.ts:679,743,815`); no zod transforms anywhere in `src/ai` [V]. The offline eval gate includes true negative cases (generic content, broken persona, cross-league leakage, consent violations must all fail) — it discriminates plumbing regressions honestly; the variants harness is not in CI [V].

**Routes/UI/PWA (full report: ui audit):**
- **36 page routes + 57 API routes**, no route groups, no middleware; 31/36 pages are `force-dynamic` (session reads); the root `/` redirects authenticated league members to `/news` — the central hub is the de-facto home [V].
- The navigation shell is a single **3,163-line, 90KB `"use client"` component** wrapping every shell route (`src/navigation/navigation-shell.tsx`) — scope-aware (global/league/news/arena), league switcher, ⌘K palette, realtime wire ticker. Hydration + bundle weight land on every page [V].
- PWA budgets enforced post-build (`perf:pwa`): route JS ≤ **300KB gzip** per shell route, FCP ≤ 1800ms, transition ≤ 300ms, CLS ≤ 0.1, INP ≤ 200ms, ≥44px taps, **spinners banned** (skeletons required) [V].
- Service worker registers **in production only** — Playwright runs `next dev`, so SW runtime behavior (offline fallback, network-first) is never exercised end-to-end; league cache isolation holds anyway via `private, no-store` headers + sign-out purge layers [V].
- `sleeper-onboarding.spec.ts` exists but is **not in CI** (only espn-onboarding + pwa-cache-isolation are); 5 of 8 Playwright specs are env-gated screenshot tools, not gates [V].
- Five themes ship (`auspex` default + neutral-dark/light + palette-a/b); Tailwind v4 with no config file (`@theme inline` in `globals.css`); fonts load from root `auspex-fonts.ts` to keep `next/font` out of route bundles [V].

### 9.15 Deferred-by-design gaps a newcomer might mistake for bugs
- The Wire / Rundown / Injuries **central reactive/queued producers don't exist** — generation contracts are built+tested, but no Inngest producer fires them (explicitly deferred; `PROGRESS` banner) [V doc, I code-absence].
- Blended league columns (Tale of the Tape, Fantasy Friday, Predictions) are structurally complete but **truthful only once substrate-B becomes real** (mock projections/odds today).
- Sleeper/Yahoo real-user paths, real delivery (webhooks/email), hosted cookie capture, Stripe/entitlements enforcement-as-billing, production infra: all tracked Phase 4–6 work, not regressions.
- `TQB`→QB record attribution is an **open owner curation question**, not a data bug.

## 10. Recent trajectory (what the last 30 days actually were)

140 commits in 30 days [V: git log]. Arcs, each merged with its own adversarial review wave:
1. **2026-07-09/10 — T18+T19:** editorial control plane (`specs/45/46`: CanonCatalog provenance, lifecycle, ledgered commissioner controls, tone editor, OG/share/teasers, mock webhooks/digest, notification prefs) + records substance (player records from pushed canon, per-stat breakdown persistence, substrate-B AI consumption, per-league AI usage attribution) + hardening batch (rate limits, security headers, CI e2e, dev-DB backup scripts). Then the **dev-DB incident** (§9.10) and its structural fixes.
2. **2026-07-13 — specs/47+48 fleet day** (the "full backlog in one day" run): ingestion bulletproofing (vocab corpus 47A, property suite 47B, capability map + shadow quarantine + drift canaries 47C), 13-finding review remediation (F47), Sleeper parity (48S, two real public leagues 14/14 integrity PASS), guarded Browserbase adapter (BB), polish batch. Migrations → 0077.
3. **2026-07-15 — specs/49 editorial architecture P0–P3:** league lead-story signal + section-assignment unification + platform-admin curation gating (P1); six named league columns on a weekly cadence (P2); the central 10-column journalist engine + editorial recall + P3-FIX grounding/near-dup remediation (P3). Migrations → 0078. **This is HEAD.**
4. **Since 07-15: quiet** (8 days, no commits) — consistent with the owner-gated Phase-4 checkpoint: everything agent-buildable in the current plan is merged; next moves need owner decisions (real keys, sources, live smokes, backup cron, deployment).

Direction: the project has finished "build everything mockable" and is parked at the **Reality gate** (`docs/PHASE-4-ACTIVATION-CHECKLIST.md` items A–G: real Anthropic, real substrate-B source, real news source, real odds, real embeddings, Browserbase live smoke, measured-week economics).

**Branch hygiene note:** the ~30 local `ws/*` branches are merged fossils of the fleet model (safe to prune). Two stray remote `claude/*` branches exist; notably `origin/claude/fix-service-worker-inactive-…` is **not a fix for this app's service worker** — it is an unrelated browser-extension codebase (~1,461 files different from `main`, "browser extension service worker activation" commits) that happens to share the repo [V — ui audit inspected its diff]. Do not merge or mine it for the PWA.

## 11. Open questions & unverified areas (ranked for the next agent)

1. **Is the league blogger's live-records read an intended carve-out?** (§9.1) The biggest unresolved semantic question: `pipeline.ts:2617-2660` reads live `all_time_records` under an integrity-gate while docs claim compiler-enforced pushed canon. Owner/orchestrator should rule; if unintended, route the blogger's records context through `CanonCatalog`.
2. **Records read-path cost under real load** — re-derivation-per-request is now verified (§9.12); profile `/leagues/[id]/records` against the 95050 dataset and consider materializing, plus unify the duplicated records math (read-time vs engine).
3. **RLS completeness test gap** (§9.2) — add a schema-driven test: every table with a `league_id` column must have an enabled+forced policy or an explicit allowlist entry. Until then, treat "new league-scoped table" PRs as the highest-scrutiny change class.
4. **Central "no reactive producers" code-absence** — documented as deferred; before building them, confirm no stray `content.central.generate` emitter exists beyond `centralContentPlanCron`.
5. **Browserbase key presence vs `HANDOFF §5` contradiction** — reconcile which doc is right about `.env.local` values (key *names* verified present; values not inspected on principle).
6. **Multi-instance behavior** of the sticky memory-fallback rate limiter/spend guard (§9.5) and of the bare Inngest client's env auto-read (§9.7) — both are single-box assumptions today; Phase-4/6 deployment must revisit.
7. **Yahoo path** — fixture-backed OAuth scaffold, no decoding dictionary; treat every Yahoo surface as untested against reality (docs agree: "effectively 0% for a real user today").
8. **Live-week soak** — the system has never run during a real NFL week; poll cadence, event storms, settlement timing, and webhook/digest fan-out are fixture-proven only.
9. **Doc staleness fixes** (§9.13) — PROGRESS header, START-HERE, HISTORY endpoint, HANDOFF Browserbase claim: trivial edits, but they belong to the orchestrator/owner because `PROGRESS.md` is the SSOT ledger; flagged, not edited, per this mission's scope.
10. **Test-suite coupling to the shared dev DB** — parallel vitest + one Postgres produced the observed timeout flakes; per-worker or dedicated test DBs would decouple gates from box load.
11. **Do AI-generated central columns actually reach league feeds?** The central→league bridge (`news/tailoring.ts:380-445`) only references central items that match **rostered-player refs**, and skips rows with no player refs; whether the central journalist engine's output carries such refs is unverified [I — ai audit]. If not, Phase-3 central content may never surface in league feeds despite the bridge existing.
12. **Sanitize lore before it enters the trusted prompt prefix** (§9.14 AI block) — member-authored canon is the one untrusted input that bypasses the `<untrusted_news>` fencing; decide fence-vs-sanitize before real-model activation.
13. **Wire `costMicrosUsd`** in usage attribution before the Phase-4 "measured week" — the rollups sum a field nothing populates; token counts alone won't answer the owner's unit-economics question precisely.

## 12. Documentation upkeep performed

Per the mission brief ("if `AGENTS.md` or `README.md` is missing, stale, or contradicted by the code, create or update it"): **both were audited section-by-section against code this session** — commands, ports, env semantics, conventions, and gotchas all check out [V]. One drift matters: `AGENTS.md`'s stack line says "Drizzle + **Neon** Postgres … **Upstash** Redis", but the code is provider-generic — the only PG driver is `pg`/node-postgres, there is no Neon or Upstash SDK anywhere, and Redis is a hand-rolled RESP client [V: package.json + grep]. The compose file frames Neon/Upstash as *production intent* ("Dev-only credentials — production uses Neon/Upstash via env"), and no production exists — so the line is aspirational, not descriptive, and could mislead an infra-provisioning agent into hunting for Neon/Upstash integration that isn't there. README.md is accurate as written. **No edits were made** — `AGENTS.md` carries owner-decision weight here (the same sentence names the whole intended stack), so this is flagged for the orchestrator with suggested wording: "Neon-compatible Postgres (any `DATABASE_URL`; Neon intended for prod) · Redis via minimal built-in RESP client (Upstash-compatible `rediss://`)". The staleness that does exist lives in `docs/START-HERE.md`, `docs/PROGRESS.md`'s header, `docs/HISTORY.md`'s endpoint, and `HANDOFF §5`'s Browserbase claim (§9.13) — deliberately left to the orchestrator/owner because `PROGRESS.md` is the project's single source of truth and this analysis is read-only toward it. One navigation hazard for future agents: the **workspace-level** `/home/ubuntu/CLAUDE.md` directs readers to `/home/ubuntu/AGENTS.md` and `/home/ubuntu/environments/AGENTS.md`, which are Prime-Lab/Verifiers boilerplate unrelated to this repo (only the UBS section applies); the real conventions live in `rumbledore-poc/AGENTS.md`. This report (in `REPO-ANALYSIS/`) is the durable artifact; note that a previous `REPO-ANALYSIS/` was archived to `docs/archive/REPO-ANALYSIS/` after its recommendations were closed — expect the same lifecycle for this file.

---

*Appendix — evidence of execution: full gate log retained in the analysis session scratchpad (`gates.log`); isolation re-run of the two timed-out test files passed 7/7; row/table/migration counts produced by commands quoted inline above.*
