# IMPLEMENTATION_PLAN.md — Phase 3: Live & Connected

Disposable, loop-maintained backlog. The loop works `## Scope` until none unblocked + gates green (writes `.loop/SCOPE_DONE`), then auto-runs the value-ranked `## Icebox` ×10 (`PROMPT_harden.md`), then stops at the review checkpoint.
One task = one sentence, no "and". **Build toward `docs/NORTH-STAR.md` — embed the ethos in every task** (a fresh, living spectacle: the data flows, moments land in real time, the league's history is its mythology). Phases 1–2 are complete (git history + `docs/PROGRESS.md §8`). Full roadmap: `docs/ROADMAP.md`. Specs of record: `specs/19` (live ingestion), `specs/20` (realtime/notifications), `specs/21` (central news), `specs/22` (content cadence), `specs/23` (records/history), `specs/24` (mobile PWA). Many of these DEEPEN existing skeletons — search first, don't rebuild.

## Scope — Phase 3 (build in order; dependencies first)

### J. Always-on ingestion & freshness (see specs/19)
- [x] Build the `ingestion.tick` cron orchestrator that fans out per-league ingest workers. (specs/19)
- [x] Drive adaptive cadence from an injectable NFL game-state/calendar provider (live-window fast path vs off-hours). (specs/19)
- [x] Make the poll policy a pluggable config seam, with cadence as data (cost-optimization deferred to research). (specs/19)
- [x] Harden incremental sync to never downgrade finalized matchups, idempotently. (specs/19)
- [x] Wire reconnect-on-expiry into the scheduler so expired auth pauses with a CTA, not a crash. (specs/19)
- [x] Support multi-league fan-out and automatic next-season rollover on the same auth. (specs/19)

### N. Records & history surfaces (see specs/23)
- [x] Build the all-time records catalog aggregates (standings, highs/lows, streaks, blowouts) from history. (specs/23)
- [ ] Build symmetric head-to-head manager ledgers plus championship/playoff records. (specs/23)
- [ ] Deepen the league Records section and add per-manager and head-to-head pages. (specs/23)
- [ ] Materialize record aggregates with idempotent incremental refresh tied to ingestion. (specs/23)
- [ ] Add cast "record broken" and data-verifiable lore hooks sourced from records. (specs/23)

### K. Realtime & notifications (see specs/20)
- [ ] Broadcast score/standings, settlement, content, lore, and arena events on per-league RLS channels. (specs/20)
- [ ] Wire client subscription via short-lived league-scoped tokens with reconnect/backoff (mock + Supabase). (specs/20)
- [ ] Deliver Web Push end-to-end with per-league RLS scoping and VAPID config (mock until keys). (specs/20)
- [ ] Build the notification taxonomy plus an RLS-scoped preferences/opt-out enforced at fan-out. (specs/20)

### M. Weekly cadence orchestration (see specs/22)
- [ ] Add a mockable NFL calendar service that drives cadence by phase and game-state. (specs/22)
- [ ] Plan the in-season weekly slate (recaps, rankings, previews) with stable natural keys and backfill. (specs/22)
- [ ] Add a distinct offseason/quiet-week cadence. (specs/22)
- [ ] Enrich reactive event-driven pieces (game final, swing, lore canonized, bet settled), entitlement-gated. (specs/22)

### L. Central news / two-tier depth (see specs/21)
- [ ] Build the multi-source central news pipeline behind mocked adapters with provenance and dedup. (specs/21)
- [ ] Build the central Front/sections editorial layer ranked by freshness and importance. (specs/21)
- [ ] Wire the central→`league_feed_reference` tailoring hand-off into the existing rail. (specs/21)

### O. Mobile PWA shell (see specs/24)
- [ ] Add the install affordance (Android prompt plus the documented iOS Share→Add flow) over the existing manifest. (specs/24)
- [ ] Harden the service worker for RLS-cache-safety and sign-out cache clearing. (specs/24)
- [ ] Implement share-link routing into the right scope or onboarding with the destination preserved. (specs/24)
- [ ] Define and check a mobile perf budget (fast transitions, skeletons over spinners). (specs/24)

## Icebox (value-ranked; the build auto-hardens ×10 after Scope)
Carried from Phase 2 — **re-verify each before acting** ("don't assume not implemented"); several may already be fixed by the Phase 2 harden pass.
- [ ] **[correctness/MED] Bankroll rollover needs a production scheduler** — likely subsumed by the spec/19 cron layer; confirm `rolloverBankrollWeek()` is actually invoked on a schedule.
- [ ] **[correctness/LOW] Lore vote close can run before `vote_closes_at`** — guard `closeLoreVote()` on the close time.
- [ ] **[correctness/LOW] Publication section/tag filters are candidate-limited in memory** — `src/news/hub.ts` / `src/news/league-feed.ts`.
- [ ] **[maintainability/LOW] Press route param doubles as section slug and article id** — split routes or use a neutral slug.

## Discoveries / bugs (loop appends here)
- [ ] Scheduler emits due `dataClasses`, but `syncCurrentLeague()` still fetches the current league bundle as one unit; split class-specific provider calls before claiming polling-cost optimization.
- [ ] `league.connected` is wired as a force-due ingestion scheduler trigger, but onboarding appears to call `syncCurrentLeague()` directly instead of emitting `JOB_EVENTS.leagueConnected`; confirm before relying on connected-event fan-out.
- [ ] Yahoo live ingestion treats expired access tokens as `PROVIDER_AUTH_EXPIRED`; add refresh-token renewal before surfacing reconnect CTAs.
- [ ] Live ingest auth-expiry pauses via scheduler response, but pre-sync auth failures do not yet persist paused/error freshness into `data_coverage`.
- [ ] Season rollover advances the durable league root into the newly discovered season, but does not schedule historical backfill for any skipped seasons.
- [ ] Flat `all_time_record` longest-streak rows still derive from per-season `season_statistics`; future record-chain/materialized UI work should use cross-season H2H-only streaks from the catalog.
