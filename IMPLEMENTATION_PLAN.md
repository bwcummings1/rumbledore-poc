# IMPLEMENTATION_PLAN.md — Phase 1: Spectacle Core

Disposable, loop-maintained backlog. The loop works `## Scope` until none unblocked + gates green (writes `.loop/SCOPE_DONE`), then auto-runs the value-ranked `## Icebox` ×10 (`PROMPT_harden.md`), then stops. One task = one sentence, no "and". Mark done when gates pass + committed.
**Build toward `docs/NORTH-STAR.md` (the soul) — embed the ethos in every task** (e.g. "the Narrator mythologizes the collapse citing canon lore," not "generate a post"). The round-1 build (P0–P5) is complete; its record lives in git history + `docs/PROGRESS.md §8`. This is the next phase.

## Scope — Phase 1 (spectacle core; build in order)

### A. Information architecture & navigation (see specs/10)
- [x] Implement the Global-vs-League scope model with section taxonomy and active-scope-from-URL state. (specs/10)
- [x] Build the unified league switcher: all leagues MRU-first, provider as a badge (not a nav level), search + group toggle. (specs/10)
- [x] Build the responsive nav shell: mobile bottom tabs + scope-switcher sheet; desktop/tablet collapsible sidebar. (specs/10)
- [x] Build the cross-league "Your Leagues" landing with per-league cards (this-week + latest Press headline). (specs/10)
- [x] Migrate the current flat routes onto the new IA with auth guards and redirects. (specs/10)

### B. Data-foundation depth (bedrock — see specs/14)
- [x] Achieve ESPN/Sleeper/Yahoo normalized-model parity with honest partial-data handling. (specs/14)
- [x] Implement full resumable ~10-year canonical history depth, idempotent. (specs/14)
- [x] Handle co-owner teams correctly, fixing the identity over-merge with per-slot person scoping. (specs/14)
- [x] Derive playoff/championship flags from provider settings/finals, fixing the hardcoded-false bug. (specs/14)
- [x] Handle dynasty/keeper, divisions, and varied/IDP scoring per the edge-case table. (specs/14)
- [x] Build the data-integrity checks plus the data-steward correction flow. (specs/14)
- [x] Implement targeted incremental recompute triggered by new data. (specs/14)

### C. Publication system (see specs/11)
- [x] Build the Front archetype with an edited lead + secondaries + card river (not a flat list). (specs/11)
- [x] Build section fronts plus the league/central section taxonomies. (specs/11)
- [x] Build the article page with persona byline, dek, typographic body, tags, related. (specs/11)
- [x] Build the reusable story card and enforce the three-register separation. (specs/11)
- [x] Implement the "for your league" central-news tailoring rail. (specs/11)
- [x] Make AI generation emit structured articles with headline/dek/byline/section/tags/body. (specs/11)

### D. AI cast / spectacle engine (see specs/12)
- [x] Implement the persona cast with distinct beats, POV, and when-they-perform. (specs/12)
- [x] Implement the structured content-type templates (recap/power-rankings/previews/awards/reactions/arcs). (specs/12)
- [x] Implement the cadence and trigger framework (scheduled plus event-driven). (specs/12)
- [x] Implement the instigator engine: seed a debate, run a poll, open a lore claim, write the verdict column. (specs/12)
- [x] Implement the authenticity engine grounded in canon/history/rivalries, fixing the AI near-dup vector ordering. (specs/12)
- [x] Implement the LLM-judge eval gate scoring authenticity-to-this-league. (specs/12)

### E. League lore (see specs/13)
- [x] Build the lore data model and RLS for claims/votes/canon/branches/disputes. (specs/13)
- [x] Implement claim → vote → canon transitions with threshold and steward tiebreak. (specs/13)
- [x] Implement the two lore types: data-verifiable auto-confirm versus opinion-vote. (specs/13)
- [x] Implement challengeable canon plus dispute and branch threads. (specs/13)
- [x] Implement the bidirectional AI↔lore contract: consume canon as fact and instigate claims. (specs/13)

## Icebox (value-ranked; the build auto-hardens ×10 after Scope, or run `./loop.sh harden N`)
- [ ] **[security/MED] Invite tokens stored plaintext at rest** — store `sha256(token)`, look up by hash. `src/db/schema.ts` (league_invites) + `src/onboarding/invites.ts`.
- [ ] **[correctness/MED] Bet placement reads balance before the week lock** — acquire `lockWeekLedger` before the balance read. `src/betting/placement.ts`.
- [ ] **[correctness/MED] Current sync can downgrade finalized matchups** — preserve `final` over transient provider re-reads that return scheduled/in-progress. `src/ingestion/current-league.ts`.

## Discoveries / bugs (loop appends here)
- [ ] **[observability/LOW] Historical import progress is DB-queryable but not published to realtime** — checkpoints/data coverage expose progress, but onboarding cannot subscribe to a live history-build channel yet.
- [ ] **[correctness/LOW] Publication section/tag filters are candidate-limited in memory** — `src/news/hub.ts` and `src/news/league-feed.ts` fetch a bounded candidate set before applying section/tag filters, so sparse older beats can disappear once archives grow.
- [ ] **[maintainability/LOW] Press dynamic route param doubles as section slug and article id** — `/leagues/[leagueId]/press/[postId]` handles both section fronts and articles; rename to a neutral slug or split routes when the publication routes are hardened.
- [ ] **[correctness/LOW] Lore vote close can run before `vote_closes_at`** — `closeLoreVote()` assumes the scheduler timing is correct and will tally an open vote early if called directly.
- [ ] **[product/LOW] Lore mechanics are service-only** — no public API/UI yet for members to submit claims, branch disputes, vote, or browse branch trees.
