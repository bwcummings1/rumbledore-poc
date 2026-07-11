# Rumbledore v2 — System Analysis & Improvement Report (delta-based)

- **Date:** 2026-07-03 · **Version:** v2 (a `…-v1.md` from a concurrent, independent session appeared in this folder mid-analysis; this report was produced without reference to it and is versioned to avoid overwriting it)
- **Repo state analyzed:** `main` @ `84f30fc` (2026-07-03), migrations through `0059`, working tree clean except seven untracked paths (which became finding QW-1)
- **Method:** reconciliation-first. All source-of-truth records were read before any finding was accepted; six parallel read-only audit agents (security & isolation · data-layer correctness · tests & CI honesty · performance & scalability · frontend/UX/a11y · DevEx/docs/ops) swept the codebase; the orchestrator re-ran the full canonical gate suite on HEAD and independently spot-verified the three highest-impact claims (`personal-agent.ts:540`, `records-page-data.ts` hollow rows, RLS catalog gaps).
- **Posture:** analysis only — no product code changed. Nothing here proposes disabling gates, weakening RLS/league isolation, or un-mocking paid services.

## Executive summary

Rumbledore v2 is in substantially better shape than any code-shape audit would guess: every claim the source-of-truth docs make that this analysis tested — gates green, hardening landed, owner critiques fixed, oracle tests running, prompt caching implemented, isolation layered and tested — verified **true** on today's HEAD (full local gate run: secret-scan ✓, typecheck ✓, lint ✓, 1,052 tests ✓/5 honestly-skipped, AI eval ✓, build ✓, PWA budget ✓; remote CI green through today's commits). Because the project tracks itself so well, **~24 findings a conventional audit would raise were dropped or reclassified here as already-landed, already-deferred, or false positives**. What remains splits into three real weakness classes: (1) **read-path scalability on the new data-foundation surfaces** — Data Book ships ~30K rows to the client, Records recomposes a 3MB+ ever-growing snapshot per request, /news is an unbounded scan awaiting real data; (2) **one genuine correctness/soul violation** — the personal agent answers from live/draft stats, contradicting the pushed-canon Record Book and the North-Star rule that AI never asserts un-ratified history; and (3) **guardrail drift at the edges** — the RLS test canary lags 7 newer tables, the flagship e2e specs never run in CI, canonical spec files sit untracked on one disk, and the "single source of truth" doc pins a head 56 commits stale. The recommendations below are a delta plan: ten quick wins (mostly ≤1 day), seven strategic tranches, and five solutions designed to make the recurring failure classes structurally impossible rather than procedurally discouraged.

---

## 1. Reconciliation Summary

**Default branch inspected.** `main` @ `84f30fc` ("docs: add docs/START-HERE.md…", 2026-07-03 02:44 +0200), matching `origin/main`. Two commits today are cold-start orientation docs; the last product-code merge is T16 (2026-06-24). Untracked working-tree paths: `specs/42-…`, `specs/43-…`, `.orchestration/{STATUS.md, ui-critiques.md, track-runner.sh, prompts/, logs/}`.

**Source-of-truth artifacts reviewed (in the project's own prescribed order).** `AGENTS.md`; `docs/START-HERE.md`; `docs/NORTH-STAR.md`; `docs/PROGRESS.md` (all 591 lines — the declared single source of truth); `docs/ROADMAP.md`; `docs/HISTORY.md`; `docs/DATA-FOUNDATION-PLAN.md` (T1–T16 task ledger with per-task completion notes) + `DATA-FOUNDATION-DESIGN.md` + `ESPN-DATA-DECODING-AUDIT.md`; `.orchestration/handoff/T1–T16, UI1, UI2` (per-task handoffs); `.orchestration/STATUS.md` (orchestrator tick ledger, historical); `.orchestration/ui-critiques.md` (owner critique ledger #1–#8); `.orchestration/import-summary.md` (verification artifacts); `IMPLEMENTATION_PLAN.md` (carries an ARCHIVED banner; honored as historical — all items `[x]`); `ORCHESTRATION.md` (operating model); `specs/00–44` (deep-read: 35, 42, 43, 44); `.github/workflows/ci.yml`.

**Active queue / milestone.** There is **no in-flight task**. Delivered and on `main`: the P0–P5 rebuild, AUSPEX overhaul, Increment 1 (specs/36–41), the specs/42 hardening (all CRIT + HIGH items), owner UI rounds (specs/43, 44), and the data-foundation arc T1–T16 (+T17 doc-sync). The live backlog is exactly: the **deferred follow-on menu** (PROGRESS §7: per-stat scoring persistence, player-level records, draft/transactions UI, Sleeper/Yahoo dictionaries, real substrate-B wiring, Phase-4 keys/capture, owner UI set-asides), **specs/42 H1-12..H1-17** (MED/LOW, explicitly deferred), and **two owner set-asides** (the rail-vs-in-page IA decision; optional news demo seeding). ROADMAP marks next work "selective, not phase-bulk."

**Validation/status commands run.** Full canonical gate suite re-run on HEAD this session: `pnpm secret-scan` ✓ · `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm test` → **1,052 passed / 5 skipped** (220 files + 1 skipped file, 98s) · `pnpm eval:ai:offline` ✓ (2) · `pnpm build` ✓ · `pnpm perf:pwa` ✓ (all 24 budgeted routes, 221.8–293.9KB gzip vs 300KB budget). Remote CI: green on the last 5 runs including today's two doc commits (~6m each). `gh pr list` / `gh issue list`: empty. The test auditor additionally ran `navigation-shell.test.tsx` in isolation (15/15 ✓ — the H2-2 acceptance the full-suite run can't prove). Read-only row counts and `EXPLAIN ANALYZE` were taken against the local dev DB holding the real 16-season league (ESPN `95050`).

**Limitations.** Paid providers are mock-pinned by design — live-path behavior deliberately not exercised (`test:live-smoke` not run; $0 posture respected). `content_item` and `odds_snapshot` are empty locally, so the news/odds read-path findings are code-shape analysis, not measurements. `pnpm test:e2e` was not re-run this session (its two default specs were analyzed statically). Subagent evidence was spot-verified for the highest-impact claims, not exhaustively re-derived. A concurrent session's v1 report appeared in `REPO-ANALYSIS/` mid-run and was not consulted.

---

## 2. Dropped or Reclassified Recommendations

Findings a conventional audit would raise, removed or reclassified after reconciliation. (This is the point of a delta analysis: **do not re-do this work.**)

| # | Candidate recommendation | Original concern | Final classification | Reconciliation evidence |
|---|---|---|---|---|
| 1 | Fix multi-week span math (all-play/luck; ESPN span ingestion) | spec-36 §D correctness | **Already Completed** | H1-1/H1-3/H1-6 landed & verified: one canonical scoring-window key `season:start:span` shared by weekly ranks (`src/stats/engine.ts:1071`) and all-play (`:1509`); ESPN span test `src/providers/espn/client.test.ts:1079` |
| 2 | Fix hollow sliced record rows | spec-42 H1-2 | **Already Completed** in `records-catalog.ts` (correct derivation `:1200–1383`) | The bug was, however, *re-implemented* in the newer `records-page-data.ts` — carried forward as **QW-4**, scoped to that file only |
| 3 | Make the fixture oracle run in CI | spec-42 H1-4 | **Already Completed** | Vendored scrubbed fixtures exist (`src/stats/__fixtures__/old-league/`, 420KB); tests default to them; scrub verified (zero real handles); numeric oracles preserved (325 / 192.7) |
| 4 | Add curation tables to the RLS canary | spec-42 H1-5 | **Already Completed** for the 3 named tables (`rls.test.ts:62-66`; canary asserts) | Drift on **7 newer** tables is a distinct follow-on → **QW-2** |
| 5 | Hash invite tokens at rest | plaintext tokens | **Already Completed** | sha256-only storage + hash lookups (`src/onboarding/invites.ts:257,681,834`) + migration-backed plaintext-column regression guard |
| 6 | Fix bet-placement balance race | lock-after-check | **Already Completed** | Advisory lock **before** balance check (`src/betting/placement.ts:590-597` → `bankroll.ts:494-518`); a narrow *rollover-side* residual is net-new → **QW-6** |
| 7 | PWA cross-user cache isolation | shared-device leakage | **Already Completed** | `private, no-store` league pages, sign-out cache/push cleanup, login-A→B e2e; the e2e's absence *from CI* is the remaining tranche → **QW-5** |
| 8 | Prompt-injection mitigations for web-grounded AI | untrusted RSS/Tavily | **Already Completed** | `<untrusted_news>` fencing (`src/ai/pipeline.ts:833-847`), instruction hierarchy (`real.ts:314`), persona guardrails (`personas.ts:63-66`), LLM-judge publish gate |
| 9 | XSS hardening for AI/user content | HTML injection | **False Positive** | Zero `dangerouslySetInnerHTML`/`innerHTML` in app code; all bodies render as JSX text nodes; URL sinks scheme-validated (`src/news/ingestion.ts:229`) |
| 10 | SQL-injection audit | raw SQL | **False Positive** | No `sql.raw` outside tests; all `` sql`` `` interpolations Drizzle-parameterized |
| 11 | Add missing DB indexes | slow queries | **False Positive** | 174 indexes; every audited hot path served (incl. the NULL-league partial dedup unique). The perf problems found are **query shape**, not schema |
| 12 | Implement Anthropic prompt caching | cost readiness | **Already Completed** | `cache_control: {type:"ephemeral"}` on the stable persona/league-facts prefix (`src/ai/real.ts:438,457`) — PROGRESS §4's claim verified true |
| 13 | Secrets/env hygiene | committed secrets | **False Positive** | Only `.env.example` tracked; `.env*` and `*.tsbuildinfo` correctly ignored (verified via `git ls-files`) |
| 14 | Un-skip hidden tests | suite dishonesty | **False Positive** | Exactly 5 skips, all `LIVE_SMOKE=1`-gated paid-provider smokes (documented $0 policy, `src/testing/provider-live-smoke.test.ts:36`); no `.only`/`.todo`/`describe.skip` anywhere |
| 15 | Repair navigation-shell tests in isolation | spec-42 H2-2 | **Already Completed** | Harness fix present (`vi.resetModules()` + post-jsdom dynamic import); re-run in isolation this session: 15/15 ✓ |
| 16 | Apply owner UI critiques #1–#8 | specs/43–44 | **Already Completed** | All verified in code: title standardization (zero `font-display` h1s), `/`→`/news` default route (`src/app/page.tsx:23`), un-clipped badge, `TabLinks`-at-bottom-of-top-card section navs, `SectionTabs` deleted with zero orphans, wire toggle as top-bar icon pair |
| 17 | Touch targets / focus traps / reduced motion | a11y basics | **Already Completed (structural)** | 44px floor baked into `.btn` (`globals.css:552-559`); Base UI overlays with trap/restore; two-layer motion gating (OS media query + persisted toggle) |
| 18 | Isolate e2e fixtures from the real league | dev-DB contamination | **Already Completed** | T13 reserved namespace `fixture-espn-95050` + `provider_identity_contamination` invariant; only a run-scoping nit remains (P3) |
| 19 | Fix era auto-detection over-segmentation | spec-42 H1-15 | **Reclassified: Effectively Completed** | The T10 detector rewrite bounds boundaries to structural signals (team count, playoff shape, reg-season weeks, lineup fingerprint; scoring settings can no longer split eras — `curation.ts:1186-1384`); real league → 6 proposals/16 seasons. PROGRESS still lists it deferred → doc correction folded into **QW-8**; residual: bench/IR slots still count in the lineup fingerprint |
| 20 | Optimize ingestion polling cost | API spend at scale | **Already Deferred (owner)** | ROADMAP cross-cutting track: explicitly "deferred, NOT a blocker," with the pluggable poll-policy seam landed (`specs/19`). Not re-recommended; only the tick's *planning-query* batching is noted (P3) |
| 21 | Build player-level records / per-stat persistence / Sleeper-Yahoo dictionaries / real substrate B / draft-transactions UI | feature gaps | **Already Tracked (deferred follow-ons)** | PROGRESS §7 deferred list; DATA-FOUNDATION-PLAN deferred notes; ROADMAP sequencing. Recommending these would duplicate the existing queue |
| 22 | Observability/Sentry, deploy, Stripe, moderation, ToS | production readiness | **Already Tracked** | ROADMAP Phase 6 owns all of it (see §5 Non-Recommendations) |
| 23 | Fix import DB routing (app writes to wrong DB) | stale suspicion | **False Positive** | PROGRESS/T16 explicitly verified product imports write to `env.databaseUrl`; only the T13 harness uses a throwaway DB |
| 24 | Make the AI eval "less mocky" | mock-judging-mock | **Reclassified: Already Tracked & honest** | The offline gate genuinely discriminates plumbing regressions (negative cases prove generic/persona-broken/leaking drafts fail); real-model judging is keyed Phase-4/5 work; `test:live-smoke` exists for that day |

---

## 3. Prioritized Net-New / Follow-On Recommendations

Matrix: **P1** = high impact + low effort · **P2** = high impact + high effort · **P3** = low impact + low effort · **P4** = low impact + high effort (avoid/defer). Items flagged **[convergent]** were found independently by ≥2 audit agents.

### Priority 1 — Quick wins

#### QW-1 · Commit the untracked source-of-truth artifacts
- **Classification:** Not Started · **Severity:** High (process/durability) · **Area:** repo hygiene / operating model
- **Why now:** the entire operating model is "handoff via docs," and two *tracked* documents cite files that exist only in this one working tree. A `git clean -fd`, worktree cleanup, or box loss silently severs the chain.
- **Current-state evidence:** `git status` — untracked: `specs/42-increment-1-hardening.md`, `specs/43-ui-ux-review-fixes.md`, `.orchestration/STATUS.md` (44K tick ledger), `.orchestration/ui-critiques.md`, `.orchestration/track-runner.sh`, `.orchestration/prompts/` (192K, prompt-A..C/H1/H2/IMP/T1..T16), `.orchestration/logs/` (272MB). Tracked references: `docs/PROGRESS.md` ("hardened per `specs/42`… Deferred MED/LOW polish: `specs/42` H1-12..H1-17"; "fixes applied per `specs/43`"), `docs/DATA-FOUNDATION-PLAN.md:311` ("specs detailed in `.orchestration/prompts/prompt-T10|T11|T12.md`"); tracked `specs/44` builds on untracked `specs/43`, which points to untracked `ui-critiques.md`.
- **Prior-work evidence:** the same artifact classes ARE tracked elsewhere (`.orchestration/handoff/T*.md`, `import-summary.md`, `specs/44`) — 42/43 untracked is accident, not policy.
- **Exact gap:** version-control the referenced files; ignore the log noise.
- **Direction:** `git add specs/42* specs/43* .orchestration/{STATUS.md,ui-critiques.md,track-runner.sh,prompts}`; add `.orchestration/logs/` to `.gitignore`.
- **Validation:** clean `git status`; every doc-referenced path resolves in a fresh clone.

#### QW-2 · Make RLS test coverage self-updating; cover the 7 lagging tables **[convergent: security + tests]**
- **Classification:** Partially Completed / Follow-on Work (to specs/42 H1-5) · **Severity:** High · **Area:** isolation guardrails
- **Why now:** the exact drift class H1-5 fixed (a CRIT) has already recurred for every league-scoped table added since that pass.
- **Current-state evidence:** runtime RLS **is present** for all of them (ENABLE+FORCE+policy in migrations `0013`/`0042`/`0058`; `pgPolicy` in `schema.ts`) — but `src/db/rls.test.ts:39-75` (`leagueScopedTables`) and the binding non-superuser canary cover none of: `fantasy_players`, `fantasy_draft_picks` (T14), `record_book_milestone`, `record_book_all_time_standing` (T9/T11), `league_feed_reference` (in the canary GRANT at `rls-canary.test.ts:151` but with zero assertions). The three `league_curation_*` tables get shape-only checks (`curated-state.test.ts:613-646`) outside catalog+canary. Verified first-hand: zero grep hits for the four newest tables in `rls.test.ts`.
- **Prior-work evidence:** H1-5 landed for `league_data_edits`/`league_season_groupings`/`league_grouping_seasons` (catalog `rls.test.ts:62-66`; canary scans/WITH CHECK at `rls-canary.test.ts:676, 804, 962-1006`); deliberately-open tables already carry explicit openness tests (`arena.test.ts:200-211`, `entitlements.test.ts:90-125`).
- **Exact gap:** coverage is hand-maintained; no completeness invariant exists, so every new table re-opens the hole.
- **Direction:** add an `information_schema`/`pg_policies`-driven completeness invariant (see **IS-1**) + add the 7 tables to catalog and canary (unfiltered-scan + WITH CHECK cases).
- **Validation:** the invariant fails when a temp league-scoped table is created without coverage; canary green under the non-superuser role.

#### QW-3 · Records/curation read-path query-shape pass **[convergent: performance + data]**
- **Classification:** Partially Completed / Follow-on Work (append-only design landed; read shape wasn't finished) · **Severity:** High (cost grows without bound) · **Area:** stats/curation read path
- **Current-state evidence (measured on the real league):** `composeCanonicalSnapshot` selects **all** `league_curation_season_pushes` rows including fat snapshot JSONB and keeps only latest-per-season in JS (`src/stats/curated-state.ts:1372-1396`); dev DB already holds **347 push rows for 16 seasons**; 16 rows = 859KB JSONB = **3.06MB as text ≈ 80ms** of pg serialize — per Records/manager/H2H request (`records-page-data.ts:1451`; `records/page.tsx:18` is force-dynamic). Every future push appends rows fetched-and-discarded forever. Data Book selects checkpoints with no column list — each row drags an **856KB** snapshot while the consumer uses 7 metadata fields (`data-book-data.ts:1045-1052` vs `:282-294`). The Bet page loads **full odds-snapshot history** for open markets to pick latest-per-market in JS (`league-bet.ts:416-443`). Compose ties on `createdAt` with no id tiebreak → same-millisecond double-push is nondeterministic (`curated-state.ts:1381-1390`).
- **Prior-work evidence:** the supporting indexes already exist (`league_curation_season_pushes(league_id,season,created_at)`; `odds_snapshot(market_id,captured_at)`) — the schema is ready; the queries aren't.
- **Direction:** `SELECT DISTINCT ON (season) … ORDER BY season, created_at DESC, id DESC` for compose; metadata-only checkpoint projection; `DISTINCT ON (market_id)` for odds; add the id tiebreak.
- **Validation:** EXPLAIN shows index-backed plans; Records request DB payload drops from ~3MB to one snapshot-set; existing compose-invariant tests stay green.

#### QW-4 · Delete the hollow season-row re-implementation in `records-page-data.ts`
- **Classification:** Partially Completed / Follow-on Work (H1-2 fixed this bug in `records-catalog.ts`; a fresh instance shipped in the newer pushed-records path) · **Severity:** High (latent correctness) · **Area:** Record Book
- **Current-state evidence (verified first-hand):** the pushed path's own `derivedSeasonRowsFromWeeklyRows` hardcodes `luck: 0`, `expectedWins: wins`, `longestWinStreak: 0`, `longestLossStreak: 0`, `currentStreakLength: 0` (`records-page-data.ts` ~`:1294-1308`); these are the **base** season rows for the default lens (`:1464-1467`) feeding `buildRecordsCatalog`, so best/worst-luck and career-luck records are computed from zeros with alphabetical holders (`:1066-1081`; `records-catalog.ts:783`). Latent only because the current view filters those record types from render; **any new consumer (UI, agent, export) inherits zeros**. The correct derivation exists unexported at `records-catalog.ts:1200-1383` — used for sliced lenses, so paradoxically slices are right while the cumulative default is hollow. `records-page-data.test.ts` asserts no luck/streak values.
- **Direction:** export the records-catalog derivation, reuse it, delete the local copy; pin one luck + one streak oracle value in the test.
- **Validation:** hand-computed fixture luck/streaks match under the default lens; screenshots unchanged.

#### QW-5 · Put the two Playwright e2e specs in CI; unit-test the service-worker cacheability predicate
- **Classification:** Partially Completed / Follow-on Work (the suite exists and is honest; CI integration was never done) · **Severity:** High (guard placement) · **Area:** CI
- **Why now:** these are the only behavioral guards for the product's #1 journey and its sacred invariant, and they currently never run at merge time.
- **Current-state evidence:** `.github/workflows/ci.yml` has no `test:e2e` step (AGENTS.md makes e2e a *conditional local* gate, relying on an agent self-diagnosing "flagship-adjacent"). The two default specs: `e2e/espn-onboarding.spec.ts:57` (signup → hosted-login frame → import → standings) and `e2e/pwa-cache-isolation.spec.ts:112` (login-A → SW page cache → sign-out clears `rumbledore-pages-*` → login-B sees nothing). Meanwhile CI-side SW safety is **string-contains assertions on `sw.js` source** (`src/app/manifest.test.ts:53-66`) — a refactor can keep the strings and break the behavior.
- **Prior-work evidence:** specs/42 already closed the two other CI-honesty gaps (oracle vendoring, canary tables); CI already provisions pg+redis; `playwright.config.ts` self-boots Next on `127.0.0.1:3100`. Estimated cost ~3–5 CI minutes.
- **Direction:** CI step after build: `pnpm exec playwright install chromium && pnpm test:e2e`; extract the sw.js cacheability predicate into an importable module unit-tested against Response objects (Vary/private/no-store/API/cross-origin).
- **Validation:** CI goes red when the predicate is inverted (local mutation check); green on main.

#### QW-6 · Serialize curation save/restore/push; take the week-ledger lock in bankroll rollover; drop the duplicate `restorePersons` call
- **Classification:** Partially Completed / Follow-on Work (the locking pattern landed for placement/settlement; capture/restore/push and rollover missed it) · **Severity:** Medium (rare-but-real races on canonical state and money paths) · **Area:** curation + betting
- **Current-state evidence:** `captureLeagueSnapshot` loops per-season selects at default READ COMMITTED (`curated-state.ts:632-659`) — an import committing mid-capture yields a **torn checkpoint** that can then be pushed as canon; `createCurationCheckpoint`/`restoreCurationCheckpoint`/`pushCurationSeason` take no lock (`:699, :1184, :1317`); `restorePersons` runs twice (`:1198`, `:1206`). `rolloverBankrollWeek` takes `lockUserWeek` but not `lockWeekLedger` (`bankroll.ts:695-778` vs `:213-217`) — a concurrent settlement can append a payout after the closing balance was read; the rollover job's pending-slip skip (`bankroll-rollover.ts:290-292`) narrows but doesn't close the commit-interleave window.
- **Prior-work evidence:** `pg_advisory_xact_lock` discipline already exists in this codebase (`bankroll.ts:213-225`) — this extends a proven pattern, not new machinery.
- **Direction:** advisory league-lock around save/restore/push; REPEATABLE READ (or the same lock) for capture; `lockWeekLedger(previousWeek.id)` in rollover; delete the duplicate call.
- **Validation:** concurrent push+push and capture-during-import integration tests; bankroll invariants stay green.

#### QW-7 · Fix the `sticky_edit_conflict` quarantine loop
- **Classification:** Partially Completed / Follow-on Work (quarantine and sticky edits both landed; their interaction is broken) · **Severity:** Medium today, **High in-season** · **Area:** data integrity framework
- **Current-state evidence:** every import **inserts a new** `fail` row while a steward edit disagrees with provider truth (`engine.ts:396-431`; `current-league.ts:240-265`) — which is the sticky-edit feature *working as designed*, i.e. a permanent condition. Any `fail` row empties the **live** records catalog (`records-catalog.ts:3202-3214`). `rerun_integrity` can never clear it (the sticky key is not re-emitted by `buildDataIntegrityCheckDrafts`, `engine.ts:3890-3903`); steward `mark_reviewed` clears it — until the next sync re-fails it. Rows accumulate unboundedly at live cadence.
- **Impact:** one preserved team-name edit + in-season hourly sync ⇒ the agent's catalog oscillates into quarantine after every sync and conflict rows grow forever. (The pushed Record Book is unaffected.)
- **Direction:** make sticky conflicts replace-on-rerun keyed by `(checkKey, target, field)`; treat an acknowledged conflict as reviewed-sticky while before/after values are unchanged.
- **Validation:** sync-twice test asserts one row, review survives re-sync, live catalog not quarantined.

#### QW-8 · Doc-truth sync pass (PROGRESS header, ORCHESTRATION posture, AGENTS pointer, H1-15 status, env parity)
- **Classification:** Partially Completed / Follow-on Work (docs are substantively current; the edges rotted) · **Severity:** Medium — these docs are the navigation system for fresh agents · **Area:** documentation
- **Current-state evidence:** `docs/PROGRESS.md` pins "`main` (head `b64af8f`)" — **56 commits stale** — plus "Last updated 2026-06-24" and "test 958✓" vs actual 1,052✓; the T17 recovery commit `04c3ece` is dangling (unreachable from any ref, GC-eligible) and `ws/t17-doc-sync` is deleted. `ORCHESTRATION.md` — declared **authoritative** by AGENTS.md — still instructs branching from `review/increment-1` and a codex1/2/3 account model, both reversed by the owner's merge-to-main posture change (recorded in PROGRESS and `ui-critiques.md`). `AGENTS.md:15` references `docs/DATA-FOUNDATION-AUDIT.md`, which doesn't exist (the real file is `ESPN-DATA-DECODING-AUDIT.md`). H1-15 is still listed deferred though the T10 rewrite effectively fixed it (see §2 row 19). `.env.example` is missing 4 vars `getEnv()` reads: `INGESTION_POLL_POLICY_JSON`, `NEWS_RSS_FEED_URLS`, `MOCK_NEWS_RSS`, `MOCK_GENERAL_STATS` (`src/core/env/schema.ts:266-269`).
- **Direction:** refresh or *remove* volatile literals (pinned hashes/test counts in prose are guaranteed to rot — see **IS-2** for the structural fix); update ORCHESTRATION.md's branch/account sections; fix the pointer; move H1-15 to done-with-residual; append the 4 env vars; tag `04c3ece` if the recovery history matters.
- **Validation:** grep for `b64af8f`/`958` returns nothing; an agent following ORCHESTRATION.md lands on the merges-to-main flow.

#### QW-9 · Baseline abuse & browser hardening: Redis-backed rate limiting + security headers (+ Inngest prod assertion, `form-data` override)
- **Classification:** Not Started · **Severity:** Medium · **Area:** security perimeter
- **Current-state evidence:** Better Auth has no `rateLimit`/`secondaryStorage` config (`src/auth/instance.ts:36-81`) — the default limiter is production-only and **in-memory/per-instance**; zero inbound throttling on `/api/auth/sign-in/email`, invite accept, or the LLM-backed `/api/personal-agent/messages` (spend-guards cap cost, but one user can drain a league's AI budget). `next.config.ts:5-8` sets only the league cache-header rule; **no** `middleware.ts`, CSP, `X-Frame-Options`/`frame-ancestors`, nosniff, Referrer-Policy, or HSTS anywhere. `INNGEST_SIGNING_KEY` stays optional in every mode while other prod secrets are enforced (`env/schema.ts:243` vs `:405-408`) — `INNGEST_DEV` alongside `NODE_ENV=production` would serve unsigned. `pnpm audit --prod`: 1 high (`form-data` via `@tavily/core→axios`; mitigated in practice by mock-pinning).
- **Prior-work evidence:** Redis is already in the stack (spend counters); the env schema already has the enforce-in-prod pattern to copy; the XSS surface is zero-sink and SameSite=Lax blunts CSRF/clickjacking — so this is perimeter completion, not firefighting.
- **Direction:** Better Auth `rateLimit` + Redis `secondaryStorage`; a small shared limiter on personal-agent + invite-accept; one static `headers()` block (frame-ancestors 'none', nosniff, Referrer-Policy, starter CSP); env-schema rejection of prod+dev-mode/keyless Inngest; `pnpm.overrides` `form-data>=4.0.6`.
- **Validation:** sign-in hammering yields 429 across two instances; headers visible on `/`; prod env parse fails with `INNGEST_DEV=1`.

#### QW-10 · Working-tree & data-asset housekeeping: dev-DB backups, `pnpm install`, worktree pruning
- **Classification:** Not Started · **Severity:** Medium (the backup) / Low (the rest) · **Area:** ops/DX
- **Current-state evidence:** zero backup/pg_dump mentions across docs+scripts; the compose volume `pgdata` is the **only copy** of the owner's hand-curated real league — raw import is re-runnable from ESPN, but steward name edits, confirmed/dismissed eras, checkpoints, pushed snapshots, and the append-only ledger are **not** re-derivable. `tsx` is declared but missing from the root `node_modules` (predates the Jun-22 package.json change) → every documented `pnpm exec tsx scripts/…` command fails in the main checkout. Nine stale `rmbl-*` worktrees linger; `ws/imp-real-league` holds a **superseded** unmerged import-harness commit (`d7c631a`) — a wrong-tree hazard. A stale `.env.local.bak` sits on disk (ignored, but a loose secrets copy).
- **Direction:** add `db:dump`/`db:restore` scripts (dated pg_dump outside the repo) + one line in START-HERE; run `pnpm install`; `git worktree remove` the merged trees and delete stale branches; delete the `.bak`.
- **Validation:** a dump restores into a scratch DB and Records renders; `pnpm exec tsx --version` succeeds.

### Priority 2 — Strategic investments

#### ST-1 · Right-size the Data Book read path **[convergent: performance + UX]**
- **Classification:** Partially Completed / Follow-on Work (to T5/T14; the ledger's pagination from UI-Polish-1 is the in-repo precedent) · **Severity:** High · **Area:** Data Book
- **Current-state evidence (measured):** one request loads the entire league — all persons/mappings/settings/season stats, **all** `weekly_statistics` (2,856), `fantasy_players` (761), **`fantasy_roster_entries` (24,433 — 320.9ms EXPLAIN ANALYZE, 2,308 buffers)**, matchups (1,525), edits, and checkpoints including 856KB blobs (`data-book-data.ts:917-1111`) — then serializes it into the RSC payload of a 2,516-line `"use client"` view (`data-book-view.tsx:1`) that *renders one season at a time*. The Weeks grain renders every team-week unbounded (`:2002-2018`): the committed real-league mobile screenshot is **390×90,582px** (~232 viewport-heights). `WeekRosterPanel` (`:1880-1968`) is the only Data Book table bypassing the shared `DataTable`/`DataCardTable` mobile-card convention.
- **Prior-work evidence:** season picker + grain tabs exist (T5); server pagination precedent exists (ledger, 25/page); the card-fallback primitive exists (`components/ui/table.tsx:91,194-200`).
- **Exact gap:** fetch granularity ≠ render granularity; no week windowing; one non-conforming table.
- **Direction:** fetch one season per request; window/paginate Weeks (mirror the ledger); lazy-load rosters per team-week; convert the roster panel to `DataTable mobileRows`; drop checkpoint blobs from the query (QW-3 overlap).
- **Validation:** Data Book RSC payload for 95050 < ~300KB; mobile Weeks screenshot height < ~6,000px; roster stacks as cards at 390px; interaction tests green.

#### ST-2 · Re-point the personal agent to pushed canon; close H1-13/H1-14 with evals
- **Classification:** Partially Completed / Follow-on Work (T9 made Records pushed-only; the agent was never re-pointed; H1-13/14 are the tracked-deferred test halves) · **Severity:** High — a product-soul correctness rule is being violated · **Area:** AI / curation boundary
- **Current-state evidence (verified first-hand):** `personal-agent.ts:540` builds league context via `getLeagueRecordsCatalog` → **live** `season_statistics`/`weekly_statistics`/materialized aggregates (`records-catalog.ts:3197-3313`) plus confirmed-but-**unpushed** groupings (`:458-479`). Draft Data Book edits recompute those live tables immediately (`curation.ts:776-826`). Net effect: replay T9's own verification scenario (edit a 2012 score 179→249, save, don't push) — the Record Book correctly still says 179, while the agent asserts 249. This contradicts specs/41 ("consumes curated/ratified data as fact and **never asserts un-ratified history**") and `docs/NORTH-STAR.md` §lore; the agent's era lens likewise uses unpushed groupings against T9's "view-only over pushed data."
- **Prior-work evidence:** the pushed-catalog build path already exists (`records-page-data.ts`); H1-13/H1-14 remain open as tracked-deferred test items (verified — see Appendix A).
- **Direction:** repoint the agent's context loader at the `composeCanonicalSnapshot`-derived catalog, with an explicitly-labeled live-scoreboard carve-out for the in-progress week; then land H1-13 (always-cites / never-unratified eval) and H1-14 (global-scope test) on top. See **IS-3** for making the rule compiler-enforced.
- **Validation:** the T9 scenario asked of the agent returns the pushed value; a draft-asserting answer fails the new offline eval case.

#### ST-3 · Introduce the caching layer (per-request dedup now, event-keyed caches next); fix league-home/lobby query shape
- **Classification:** Not Started (ROADMAP Phase 6 names "performance/caching at scale" as an umbrella; no concrete caching work exists) · **Severity:** High (posture) · **Area:** server read path
- **Current-state evidence:** zero `unstable_cache`/`revalidate`/React `cache()` anywhere in `src/`; **55 files** declare `force-dynamic`; Redis is used solely for spend counters. League home runs ~11–14 **sequential** queries per request in one tx, including a leading-wildcard `lower(…::text) LIKE '%term%'` scan over league `content_item` text+metadata for any identity-claimed member (`league-home.ts:652-920`, `:431-439`, `:871-895`) and an unLIMITed whole-season matchup load. The `/` lobby builds league cards in a **per-league transaction loop** (`your-leagues.ts:154-171`; N leagues ⇒ ~3–4N queries + N transactions; also reused by the agent's briefing path).
- **Prior-work evidence:** prompt caching landed; change-only writes + targeted incremental recompute (verified) make invalidation tractable; append-only tables provide natural cache keys (**IS-4**).
- **Direction (staged):** (1) React `cache()` for per-request dedup of session/league/persona lookups; (2) parallelize/batch league-home and lobby queries (`inArray` + group-by-league), replace the LIKE scan with the existing `league_feed_reference` matched-entities mechanism (or a trigram/FTS index); (3) Redis caches keyed by latest-push-id (records), refresh-run id (news front), and sync cursor (home aggregates).
- **Validation:** league-home round trips ≤4; lobby query count O(1) in league count; before/after p95 via the existing health metrics.

#### ST-4 · News read-path scalability before real wiring (WHERE-able section/tags + retention)
- **Classification:** Not Started (latent: 0 rows in dev; becomes real the day Phase-4 news keys land) · **Severity:** High-latent · **Area:** news pipeline
- **Current-state evidence:** the `/news` hub unconditionally sets `scanAllCandidates: true` → a `while (true)` OFFSET loop pages through **every** central `content_item` (title+summary+metadata JSONB), ranks in JS, slices to 30 (`hub.ts:127-172`); the league feed repeats the pattern under any section/tag filter (`league-feed.ts:327-412`); there is **no retention/pruning** anywhere in `src/news/`. Root cause: section/tags are derived in JS from metadata, so they can't be pushed into WHERE. OFFSET pagination makes DB reads O(n²/page).
- **Prior-work evidence:** `content_item(kind, published_at)` index + the central-dedup partial unique already exist; ranking logic is sound — only the candidate-fetch shape is wrong.
- **Direction:** persist section/tags as columns (or expression indexes) at ingest/derive time; query WHERE+ORDER BY+LIMIT; add a wire-item retention window. **Attach this as a prerequisite checklist item on the Phase-4 "un-mock news" task** so it lands before ingestion volume does.
- **Validation:** EXPLAIN shows LIMIT-bounded index scans; a 50k-row synthetic corpus keeps `/news` p95 flat.

#### ST-5 · Decompose `navigation-shell.tsx`; recover league-home bundle headroom **[convergent: UX + performance]**
- **Classification:** Not Started · **Severity:** Medium · **Area:** app shell / bundle
- **Current-state evidence:** `src/navigation/navigation-shell.tsx` is a **3,077-line `"use client"`** root-layout module containing ~30 components plus the realtime state machine (`useShellRealtime` `:1726-2260`) and wire feed logic; it is the shared JS floor under all 24 routes (**221.8KB** minimum) and was the H2-2 fragility locus. League home sits at **293.9KB of the 300KB** CI budget — ~6KB headroom; the next client dependency on the highest-traffic route fails CI. Two hand-rolled overlay panels in the same file lack outside-click dismiss/focus containment (`:1385-1449`, `:1546-1619`) while everything else uses Base UI.
- **Direction:** split into `wire/`, `menus/`, realtime-hook modules; `dynamic()` the switcher/notification subtrees; audit league home's ~72KB route delta; rebuild the two panels on the existing Base UI primitives while in there.
- **Validation:** `perf:pwa` headroom ≥ ~10% on league home; shell tests stay green in isolation.

#### ST-6 · Coverage measurement: report-only, then ratchet
- **Classification:** Not Started · **Severity:** Medium · **Area:** test infrastructure
- **Current-state evidence:** no coverage provider in any vitest config, no `@vitest/coverage-*` in the lockfile, no CI step. The predecessor's post-mortem cites "~4.8% coverage" as a disqualifier (`docs/HISTORY.md:33`), yet the rebuild cannot produce the number that would detect its own erosion.
- **Direction:** `@vitest/coverage-v8` report-only in CI (artifact + PR summary); per-directory ratchets later (a global threshold fits poorly with the DB-integration-heavy layout).
- **Validation:** coverage artifact appears on CI runs; deleting a test file visibly moves the number.

#### ST-7 · Scope (or queue) curation-edit recompute instead of full-league rebuild per edit
- **Classification:** Partially Completed / Follow-on Work (targeted recompute exists on the sync path; the curation path still full-rebuilds) · **Severity:** Low-Medium (steward-only surface) · **Area:** stats engine
- **Current-state evidence:** every `applyCuratedDataEdit` triggers `recomputeLeagueStatistics` — delete + reinsert of **all** weekly/season/H2H/records rows (2,856+ for the real league) in one transaction, per edit (`curation.ts:1007` → `engine.ts:4176-4258`; same on merge/split `:4544,:4602`). A steward's burst of 20 inline edits = 20 blocking full rebuilds; AGENTS.md already concedes recomputes legitimately exceed 10s under load.
- **Prior-work evidence:** `recomputeChangedMatchupStatistics` (verified in use for routine sync) is the scoping template.
- **Direction:** scope recompute to affected seasons/persons, or enqueue+coalesce rebuilds (Inngest) behind a pending-flag on the draft state.
- **Validation:** a single-cell edit's `stats_calculation` log shows no full rebuild; edit API p95 drops accordingly.

### Priority 3 — Nice-to-haves (each ≤ ~half a day; bundle opportunistically)

| Item | Classification | Evidence anchor |
|---|---|---|
| `global-error.tsx` + a league-subtree `error.tsx` (root layout errors currently uncaught; route errors blow away shell chrome) | Not Started | only `src/app/error.tsx` exists |
| Mount `Toaster` globally; use it for copy-link confirmations | Not Started | mounted only at `league-bet-view.tsx:1037`; bare `clipboard.writeText` at `league-invite-view.tsx:345-347` |
| Shared date/time formatter; fix the two locale-less `toLocaleString()` calls | Not Started | ~15 per-file `Intl.DateTimeFormat`s; `data-steward-review-view.tsx:1162`, `league-invite-view.tsx:217` |
| `src/app/onboarding/loading.tsx` (connect flow currently falls back to the generic root skeleton) | Partially Completed / Follow-on | 15 `loading.tsx` files cover every other family |
| League-home section → URL query param (deep-linking/back-button; keeps spec-44's in-page model) | Partially Completed / Follow-on | `league-home-view.tsx:936-938` client-only state vs arena's routed sections |
| `TabLinks` link-variant ARIA: drop `role="tab"`/`tablist` for route-nav usage (keep `aria-current`) | Not Started | `components/ui/tabs.tsx:85-103` |
| Truncation guards on records name cells, account-menu league row; narrow-width labels for the Data Book grain Segmented | Not Started | `records-tables.tsx:138-143,417-422`; `navigation-shell.tsx:1608`; screenshot shows "SETTIN…" at 390px |
| Letter-spacing tokens + extend the token-contract test to `tracking-[…]` | Partially Completed / Follow-on | 43 arbitrary `tracking-[…]` literals; contract test scope `component-token-contract.test.ts:7-33` |
| Micro-a11y: skip-target `tabindex="-1"`; wire `<output>` → `aria-live="off"` (match `spectacle.tsx:590-592`); league-home heading order | Not Started | `navigation-shell.tsx:465-466`, `:1281-1291`; `league-home-view.tsx:234` |
| `/api/health`: bare `{status}` for anonymous callers; full payload (role names, per-route metrics) for platform admins | Partially Completed / Follow-on | `api/health/route.ts:24`; `core/health.ts:121-128,520` |
| `readJsonBody`: enforce the cap on actual bytes, not the Content-Length header (chunked bypass) | Not Started | `src/onboarding/http.ts:39-51` |
| Append-only DB triggers for `identity_audit_log`, `odds_snapshot`, `bet_settlements` (7 sibling tables have them; PROGRESS §4 describes odds as append-only) | Partially Completed / Follow-on | trigger migrations 0015/0029/0031/0038/0047/0053 |
| Version + zod-validate snapshot JSONB at read (checkpoints/pushes currently cast blind) | Not Started | `curated-state.ts:270,293,1395` |
| Carry provider final standings (or engine season rows) in push snapshots — removes the title/regular-season-winner proxy tiebreaks | Partially Completed / Follow-on | `records-page-data.ts:518-576,472-516` |
| One parameterized authz smoke test over all API route modules (25/45 routes have no route-level test; services beneath are tested) | Partially Completed / Follow-on | route inventory via `find src/app/api -name route.ts` |
| Run-scope the e2e fixture cleanup to the run marker | Partially Completed / Follow-on | `e2e/espn-onboarding.spec.ts:43-55` deletes all fixture-namespace leagues |
| README: a "see it populated" paragraph (mock ESPN connect → fixture league; real-league import command); pin or drop `impeccable` | Not Started | fixture flow discoverable only from PROGRESS/e2e; `README:83` uses unpinned `npx impeccable` |
| Dependabot/renovate config; `engines` field; `@types/node` → 22 | Not Started | none exist; CI runs Node 22 with @types/node v20 |
| Ledger pagination `count(*)` from a narrow projection; reuse the arena standings superset query | Not Started | `curation.ts:2026-2127`; `arena.ts:1069-1074` |
| Drop the duplicate `bankroll_ledger_user_week_latest_idx` | Not Started | `schema.ts:2727-2738` (exactly shadows the unique index) |
| Batch the ingestion-tick coverage reads (one `inArray` query, not one tx per league per minute) | Partially Completed / Follow-on (poll-cost seam is tracked; planning-query shape isn't) | `ingestion-live.ts:1479-1534`, targets join `:743-797` |

### Priority 4 — Avoid / defer

- **Wholesale route-test backfill** for all 25 untested wrappers — the services beneath are tested; the P3 authz smoke test captures ~80% of the value for ~5% of the work.
- **Connection-pool/pgbouncer tuning and RLS-transaction-per-read rework** — blocked on the Phase-6 deploy-target decision; pointless to tune for an unknown runtime.
- **Table virtualization** (react-window et al.) — ST-1's pagination suffices at league scale.
- **Down-migrations** — roll-forward + restore-from-dump (QW-10) is the right stance; just write the one-line policy note (folded into QW-8).
- **Per-record KDF salts / credential re-encryption migration** — the single-master-key AES-256-GCM design with random IVs is sound for the threat model; revisit at the Phase-6 security review.
- **Live-provider integration lanes in CI** — blocked on keys **by design** ($0 posture); `test:live-smoke` already exists for that day.

---

## 4. Innovative Solutions (top 5)

### IS-1 · A self-updating isolation canary — "undecoded table" invariants applied to RLS *(pairs with QW-2)*
- **Proposed solution:** replace the hand-maintained `leagueScopedTables` list with an introspection-driven completeness invariant: a test queries `information_schema`/`pg_policies` for every table with a `league_id` column and asserts each is (a) FORCE-RLS'd with a `current_league_id()` policy, and (b) present in the behavioral canary's covered set — or (c) on an explicit allowlist of deliberately-open tables.
- **Innovation angle:** this project already invented the philosophy — for *data*. `provider_code_decoding` fails on **any** undecoded id it observes; `provider_identity_contamination` fails on placeholder bleed. Nobody applied coverage-invariants to the **test suite itself**. Doing so converts RLS coverage from a per-table chore (which demonstrably drifts: H1-5, then this audit's 7 tables) into a property that new tables cannot escape at creation time.
- **Implementation outline:** export the canary's covered-table registry; one invariant test introspecting the live schema; allowlist with required justification comments (the arena/entitlements openness-tests are the precedent).
- **Trade-offs:** couples the test to the `league_id` naming convention (document it); the allowlist becomes a review point — which is the point.
- **Expected outcome:** RLS test coverage moves from ~35 of 53 policy-bearing tables to 100%-by-construction; the next `fantasy_players`-class table cannot merge unguarded.

### IS-2 · Docs that verify themselves — a `pnpm state` contract gate *(pairs with QW-8)*
- **Proposed solution:** a script emits the machine-checkable facts (HEAD sha, migration head, test counts, max route budget, the open deferred-item registry) into a fenced *generated* block at the top of `docs/PROGRESS.md`; CI regenerates and diffs it — a mismatch fails like any other gate.
- **Innovation angle:** this project's operating model **is** documentation — fresh-session agents navigate purely by these files, and its per-task Definition-of-Done already mandates doc updates. Every drift instance found this audit (stale `b64af8f`, 958-vs-1,052, ORCHESTRATION's dead branch model) is the same class: prose asserting volatile facts with no checker. Making the source-of-truth doc *self-auditing* turns "reconciliation" — the hardest step of every cold start, and of this very report — from agent diligence into a CI property.
- **Implementation outline:** `scripts/state.mjs` (git + drizzle journal + cached vitest JSON reporter + the budget JSON); fenced markers in PROGRESS.md; CI step `pnpm state --check`; authors run `pnpm state --write` in the existing DoD doc-update step.
- **Trade-offs:** one extra command on doc-touching commits; keep the generated block small to avoid merge noise; volatile literals move out of prose (a feature, not a cost).
- **Expected outcome:** the doc-drift finding class disappears structurally; cold-start agents can trust the header unconditionally.

### IS-3 · Canon as a type — compiler-enforced "the cast never asserts un-ratified history" *(pairs with ST-2)*
- **Proposed solution:** introduce a branded `CanonCatalog` type producible **only** by the `composeCanonicalSnapshot`-derived builders; AI context loaders (personal agent, cast league-facts) accept exclusively that type. Live/draft reads return a separate `LiveFacts` type that prompts must label explicitly ("unofficial, as of this afternoon") and evals treat differently.
- **Innovation angle:** the product's most important editorial rule currently lives in prose (specs/41, NORTH-STAR) and one deferred eval (H1-13) — and this audit found it *actually being violated* (draft 249 vs pushed 179). Encoding **provenance in the type system** makes the rule un-writable rather than un-reviewed: a future feature that feeds draft stats to a persona fails to compile. It also sharpens H1-13 into something crisp: assert every prompt segment is `CanonCatalog`-sourced except labeled `LiveFacts`.
- **Implementation outline:** brand via unique symbol; refactor the two context loaders; carve out current-week scoreboard data as labeled `LiveFacts` (this is the design decision that keeps the spectacle fresh *and* canon honest); land the H1-13/H1-14 evals on top.
- **Trade-offs:** small refactor blast radius in `src/ai`; the agent's in-progress-week answers must route through the labeled path or they'd go stale.
- **Expected outcome:** the Record Book and the cast can never disagree about ratified history; the divergence found in this audit becomes unrepresentable, not just untested.

### IS-4 · Event-keyed caching — the append-only tables already mint perfect cache keys *(pairs with QW-3/ST-3)*
- **Proposed solution:** cache derived read models keyed by the event that produced them: records catalog keyed by the league's **latest push row id**; news front by the last **refresh-run id**; league-home aggregates by the **ingestion cursor**. Invalidation = the key changes. No TTL guessing.
- **Innovation angle:** conventional caching bolted onto CRUD apps is heuristic (TTLs) and wrong twice — stale *and* needlessly cold. This system's write side is event-sourced by design (append-only pushes, change-only content hashes, checkpointed cursors), which means every expensive read already has a monotonic version stamp. Exploiting that converts the team's write-discipline investment into read-path performance with *provable* cache correctness — and it neutralizes the "append-only grows forever" cost curve at the read layer.
- **Implementation outline:** `records:{leagueId}:{latestPushId}` in Redis (or `unstable_cache` tags) storing the **derived catalog**, not the raw 3MB snapshots; a ~0.5ms indexed latest-id probe, then get-or-compute.
- **Trade-offs:** Redis joins the read path (fall back to compute on miss/outage); store derived values to keep entries small.
- **Expected outcome:** Records/manager/H2H drop from O(full curation history) per request (3MB+ today, growing with every push) to an O(1) key probe + cached read; ST-3's league-home work gets the same key pattern for free.

### IS-5 · Turn the committed screenshot discipline into a visual regression gate
- **Proposed solution:** alongside QW-5's e2e-in-CI, run the existing screenshot harness against the fixture league and perceptual-diff the output against the committed baseline set (`docs/screenshots/`) with a per-image diff budget; failures upload the before/after/diff triptych as CI artifacts; `pnpm screens:accept` re-baselines intentionally.
- **Innovation angle:** the repo already pays the full cost of screenshot discipline — a harness, committed baselines at three viewports, and "the orchestrator *looks at* the PNGs" as a per-task DoD step — but all the checking is human and per-arc. Automating the diff turns an existing artifact pipeline into a continuous **AUSPEX-fidelity gate**: DESIGN.md is called "the authority," and this finally gives the authority an enforcer. The classes of regression that produced specs/43/44 in the first place (wrapped titles, clipped badges, wrong nav pattern, stretched grids) are exactly what pixel diffs catch and unit tests never will.
- **Implementation outline:** odiff/pixelmatch over the fixture set; loose initial thresholds (2–5%); deterministic rendering is already mostly in place (seeded fixture data, reduced-motion switch, mount-gated LiveClock).
- **Trade-offs:** baseline churn on intentional redesigns (the accept command is the workflow); screenshot determinism needs a fixed clock/viewport contract.
- **Expected outcome:** owner-critique classes get caught pre-merge instead of in owner review; the committed screenshot sets stop silently rotting between arcs.

---

## 5. Explicit Non-Recommendations

Deliberately **not** recommended, with reasons:

1. **Anything on the tracked deferred menu** — per-stat scoring persistence, player-level records, draft/transactions UI, Sleeper/Yahoo decoding dictionaries, real substrate-B wiring, Phase-4 keys/hosted capture, Phase-5 voice + visual soul, Phase-6 Stripe/moderation/infra/observability/deploy. All already queued with sequencing in PROGRESS §7 / ROADMAP; restating them would be duplicate planning. (One carve-out: **ST-4** should ride as a prerequisite on the Phase-4 news task.)
2. **Polling-cost optimization** — explicitly owner-deferred ("a near-non-factor later; NOT a Phase-3 constraint") with the pluggable seam already landed. Only the tick's planning-query batching (P3) is worth a line before then.
3. **The rail-vs-in-page IA restructure** — an open **owner decision** (ui-critiques #5), not agent work. Both substrates exist, so a runtime-flag demo is a cheap decision aid if wanted — but do not build either variant speculatively.
4. **Re-speccing H1-12..H1-17 wholesale** — already ticketed and deliberately deferred; this report elevates only H1-13/H1-14 (inside ST-2) because an actual divergence, not just a missing test, was found. H1-15 should be *closed*, not worked (see §2 row 19).
5. **Framework churn** — tRPC/GraphQL, LangChain, state libraries, monorepo splits, ORM swaps: no finding motivates any of it; the stack is locked by PROGRESS §4 and demonstrably healthy.
6. **Live-provider CI lanes / real-key smoke automation** — blocked on keys **by design**; the $0 mock-pin posture is a standing owner instruction and `test:live-smoke` is ready for when it flips.
7. **Hard coverage thresholds on day one** — report-only first (ST-6); a premature global gate would fight the DB-integration-heavy suite and invite gaming.
8. **Table virtualization, down-migrations, per-record KDF salts, pool tuning** — superseded by simpler fixes or blocked on Phase-6 decisions (see Priority 4).
9. **"Fixing" the offline AI eval before keys exist** — it is an honest plumbing gate with discriminating negative cases; pretending it can measure real content quality would be the dishonest version.

---

## Appendix A — Deferred-item & spec verification

**specs/42 Track H1 deferred items (H1-12..H1-17) — verified current status:**

| Item | Status | Evidence |
|---|---|---|
| H1-12 best_ball format test | **Open (tracked-deferred)** | `best_ball` appears only in `schema.ts:1251`; no test asserts a best-ball slice |
| H1-13 agent citation / un-ratified eval | **Open (tracked-deferred) — elevated by ST-2** | offline eval judges cast only; two ad-hoc citation asserts exist (`personal-agent.test.ts:535,604`); the underlying divergence is real (ST-2) |
| H1-14 global/no-league agent branch test | **Open (tracked-deferred)** | all three `getPersonalAgentAnswer` tests pass a leagueId; the global branch (`personal-agent.ts:693-760`) is untested |
| H1-15 era auto-detection over-sensitivity | **Effectively fixed** (T10 rewrite) — update the ledger | boundaries limited to structural signals (`curation.ts:1186-1384`); scoring tweaks can no longer split eras; residual: bench/IR slots count in the lineup fingerprint |
| H1-16 `optionalInteger` negativity guard | **Open (tracked-deferred)** | `curation.ts:193-201`; used for `period_start` + 4 boundary fields |
| H1-17 curation route trusts client `editClass` | **Open (tracked-deferred)** — nuance: mislabeled "cosmetic" edits also escape the `data_edit_ledger_completeness` audit (`engine.ts:3850-3865`), which slightly raises its value | `curation/edits/route.ts:15,73` |

**Verified landed (spot-checks):** H1-1/H1-3/H1-4/H1-5/H1-6/H1-8/H1-10 ✓; H1-7 ✓ (`validateConfirmedGroupingSeasons`, `curation.ts:1708-1770`; benign zero-season nuance); H1-9 ✓ on both live and pushed paths (empty/proposed era yields an empty slice or honest cumulative labeling, never a silent fallback). **Track H2:** H2-1..H2-6 all landed (member-reachable public ledger; shell test harness — re-run in isolation 15/15 ✓; wire toggle superseded-and-improved by specs/44 #8; 44px floor; aria-modal removed; headings consistent). **specs/43:** U1-a/b/c ✓. **specs/44:** #7 ✓ (TabLinks-at-bottom pattern, `SectionTabs` deleted, zero orphans), #8 ✓ (top-bar icon toggle, both bars, a11y-labeled).

**Owner set-asides (the concrete list behind PROGRESS §7's "minor owner-set-aside UI tweaks"):**
1. The #5/#6 **KEY IA QUESTION** — does the in-page top-card nav replace or complement the shell rail's league sections? Deferred to the owner (specs/43 non-goals). **Open decision.**
2. **News-mode demo-seeding** — "separate optional pass" (specs/43 non-goals). Not done.
3. League-home section set confirmation — Lore/Members were not added as home sections (remain rail routes). Minor open confirmation.
4. Steward review still requests a bounded ledger preview and ignores pagination metadata (`.orchestration/handoff/UI1.md:66`). Tracked.

## Appendix B — Measured facts (2026-07-03)

- **Gates on HEAD `84f30fc`:** secret-scan ✓ · typecheck ✓ · lint ✓ · test **1,052 ✓ / 5 skipped** (220 files + 1 skipped file; 98s) · eval:ai:offline ✓ (2) · build ✓ · perf:pwa ✓. Remote CI: green, last 5 runs incl. today. Open PRs/issues: none.
- **The 5 skips:** all in `src/testing/provider-live-smoke.test.ts` behind `LIVE_SMOKE=1` (Anthropic/Voyage/Tavily/Odds/SportsDataIO real-network smokes) — honest $0-policy gates.
- **Codebase:** 606 TS/TSX files, ~180K LOC in `src/`; 230 test files; 60 migrations (0000–0059); 46 API route files; 174 DB indexes across 76 tables; 55 `force-dynamic` files; 15 `loading.tsx`.
- **Real-league dev DB (ESPN 95050):** weekly_statistics 2,856 · fantasy_matchups 1,525 · fantasy_roster_entries 24,433 (table 14MB) · fantasy_players 761 · team_season 188 · league_curation_season_pushes 16 (league) / 347 (DB) · checkpoints 1 (856KB snapshot/row) · league_data_edits 18 (league) / 1,166 (DB).
- **Hot-path measurements:** full-league roster query 320.9ms / 2,308 buffers (EXPLAIN ANALYZE); 16 push rows = 859KB JSONB = 3.06MB text ≈ 80ms serialize; committed mobile Data-Book-Weeks screenshot 390×**90,582px**.
- **Bundle:** route JS floor 221.8KB gzip; league home 293.9KB vs 300KB budget; `navigation-shell.tsx` 3,077 lines (`"use client"`, root layout).
- **Deps:** `pnpm audit --prod` → 1 high (form-data via @tavily/core; mock-mitigated), 3 moderate (dev chains), 2 low; `tsx` declared-but-missing in root node_modules; no engines field; no dependabot/renovate.
- **Working tree:** 7 untracked canonical/ops paths (see QW-1); 9 stale `rmbl-*` worktrees; `ws/imp-real-league` holds superseded unmerged `d7c631a`; dangling T17 commit `04c3ece`.

## Appendix C — What is verifiably strong (keep doing this)

- **Isolation engineering:** five independent, individually-tested layers (route guards on all 46 route files → `withLeagueContext` (158 call sites) → FORCE RLS with `current_league_id()` policies on every `league_id` table → production health-check failing on superuser/BYPASSRLS → a binding non-superuser behavioral canary). Deliberately-open tables carry tests asserting the openness is intentional — rare discipline.
- **Security-by-construction content pipeline:** zero HTML sinks anywhere; scheme-validated URL sinks; genuinely implemented prompt-injection posture (fencing + instruction hierarchy + persona guardrails + judge gate); AES-256-GCM credential storage with per-encryption IVs behind a single write path; a secret-aware redacting logger; zero `NEXT_PUBLIC_*`.
- **Test honesty as a habit:** money paths tested at real-substrate level with exact-cent assertions and replay invariants; skip hygiene exemplary (the one skip cluster is an explicit $0 gate); the apparatus tests itself (canary preconditions, discriminating negative eval cases, capturing injected fetch).
- **Write-side scale discipline:** change-only writes (content hashes) end to end, targeted incremental recompute on routine sync, idempotency keys on all 14 Inngest functions, append-only event tables with real DB triggers on the highest-value ones. This is what makes IS-4's caching cheap.
- **Env/config engineering:** a single validated `getEnv()` boundary (zero stray `process.env` reads in src/), mock/real discriminated unions with cross-field validation, near-complete `.env.example`.
- **Design-system structural quality:** the 44px floor lives in `.btn` itself; Base UI overlay primitives everywhere; non-color encodings in charts/diffs/pills; two-layer reduced-motion gating; zero hex/font-size literals in contract scope; server components with client leaf primitives on the big surfaces.
- **The documentation operating model:** START-HERE → NORTH-STAR → PROGRESS → ROADMAP with retirement banners on dead docs and per-task handoffs — the reason this report could classify 24 candidate findings as already-handled. The drift found is at the edges (QW-8), not the substance.
