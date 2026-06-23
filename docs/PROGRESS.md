# Rumbledore v2 — Master State & Handoff

**This is the single source of truth.** Any agent/model/tool continuing this work reads this first.
Keep it current. Last updated: 2026-06-23 — **Task T13 on
`ws/t13-import-clean-guarantee`**: provider imports now have a general clean-import guarantee. Fixture ESPN data uses
the reserved non-real provider league id `fixture-espn-95050` instead of colliding with real ESPN league `95050`, and
the onboarding/screenshot e2e seeds delete that reserved league after use. Current and historical imports now
reconcile each fetched `(league, season)` to the fresh provider truth, removing stale/foreign `fantasy_members`,
`fantasy_teams`, `team_season`, orphan `identity_mapping`, and orphan `persons` rows for that season only. Identity
resolution refreshes known placeholder canonical names even if an old manual edit exists. A new
`provider_identity_contamination` data-integrity check gates real provider namespaces: ESPN real imports require
braced GUID member ids, known fixture/screenshot placeholder names fail, mixed real+invalid identities fail, and stale
pass/fail integrity snapshots are replaced on rerun. Verification in `.orchestration/import-summary.md` proves both a
fresh empty DB import and contaminated-to-clean dev DB reconciliation for real league 95050, with stable re-import
counts and zero placeholder/invalid residue. Prior state: **Data Foundation T12 on
`ws/t12-general-stats-substrate`**: the league-agnostic general fantasy-stats substrate B now exists as shared,
non-editable NFL reference data. New central tables `nfl_players`, `nfl_schedule`, `nfl_team_stats`, and
`nfl_player_week_stats` store typed player identity, schedule, team box-score, and player-week facts with
`source`, `fetched_at`, and `content_hash` provenance. The T12 mock/$0 ingest reads the committed
`src/fixtures/general-stats/mock-nfl-2026.json` fixture, validates no-silent-empty/coverage/reference integrity before
writing, upserts idempotently, and stays behind `generalStats: { mock: true }` (`MOCK_GENERAL_STATS=false` is rejected
until a real source is intentionally wired). `src/general-stats` exposes read-only consumer functions for player
lookup by source/provider/name, player season/week stats, team box scores, schedules, and league-roster enrichment.
Functional verification appended `.orchestration/import-summary.md` with PASS checks for integrity, idempotency,
provenance, consumer reads, and enrichment. No News/AI generation flow is wired to B yet; future work should consume
the `@/general-stats` API. Prior state: **Data Foundation T11 on
`ws/t11-records-catalog`**: the Record Book catalog is expanded into typed categories (All-time, Regular, Playoff,
Head-to-head, Achievements, Lowlights) while still reading only `composeCanonicalSnapshot` pushed data. The Records
page now uses the league-feed `PublicationMasthead`/`TabLinks` pattern for category section anchors, with the
segment×era lens kept as a view control inside the top card. New record types cover playoff leaders, runner-ups,
regular-season titles, top/bottom scoring weeks, worst career/season win%, lowest season average, biggest/narrowest
losses, most last-place finishes, and related lowlights. Real 95050 verification appended `.orchestration/import-summary.md`
with sample records (for example highest weekly score 198.40, lowest weekly score 38, biggest loss 138.20), and
screenshots were captured at `docs/screenshots/{mobile,tablet,desktop}/10-records-t11-categories.png` with duplicate-key
grep = `0`.
Prior state: **Data Foundation T10 on
`ws/t10-era-autopropose`**: the Data Book Settings grain now auto-surfaces era proposals derived from persisted
`league_season_settings` signatures (league size, playoff length/count, regular-season weeks, and lineup slot counts).
Stewards can Confirm, Adjust name/seasons, or Dismiss; dismissed proposals are durable, confirmed proposals remain
data-layer draft definitions until save/push, and the existing Record Book lens picks them up only from the pushed
snapshot. Real 95050 verification produced six proposals, confirmed `12-team era (2013-2014)`, pushed all 16 seasons,
and wrote `.orchestration/import-summary.md`; screenshots captured
`docs/screenshots/{mobile,tablet,desktop}/17-data-book-t10-era-proposals.png` and
`10-records-t10-era-lens.png` with duplicate-key grep = `0`.
Prior state: **UI-Polish-2 owner IA fixes on `ws/ui2-league-data-nav`**: the left-rail data IA is now two relevant
destinations, **League Data** and **Records**. League Data points to `/leagues/[leagueId]/data` and is active for both
`/data` and `/ledger`; the standalone left-rail Edit Ledger item is gone. Data Book and Edit Ledger now share the same
League Data `PublicationMasthead` with bottom tabs `[Data Book | Edit Ledger]`, while the People/Settings/Weeks
selector moved into Data Book content as a secondary segmented control. Refreshed full screenshot set:
`docs/screenshots/{mobile,tablet,desktop}/`, including `17-data-book.png`, `18-edit-ledger.png`, and
`18-edit-ledger-expanded.png`; `/tmp/ui2-screenshots.log` reports `grep -c 'same key'` = `0`.
Prior state: **UI-Polish-1 owner review fixes on `ws/ui1-databook-ledger-polish`**: the Data Book masthead is compact
again, with the year picker plus small Save/Publish actions relocated to the `{season} {grain}` section toolbar and
the detailed curation state tucked into a collapsed "Curation details" disclosure. The Edit Ledger is now
server-paginated (`limit`/`offset`, default page size 25) and renders entries inside a contained panel with page
controls at the bottom. Remaining Record Book duplicate-key paths were hardened. Prior state: **Data Foundation Phase
2 complete through T9
on `ws/t9-record-repoint`**: the Record Book is now a read-only projection of the pushed canonical state. Records load
`composeCanonicalSnapshot(db, { leagueId })`, the composition of each season's latest pushed version, and derive the
catalog/page data from those pushed snapshots instead of live draft/materialized facts. Saved-but-unpushed edits are
invisible to Records; a league with no pushed seasons shows "No pushed data yet — push from the Data Book." Person
display collapses to one row per person using the latest pushed team name plus the person's canonical real name, and
segment/era pills remain view-only over data-defined pushed groupings. Real 95050 verification proved
data→edit→save→push→record on 2012 while preserving all 16 pushed seasons; screenshots captured
`docs/screenshots/{mobile,tablet,desktop}/10-records-t9-pushed.png`. Prior T8 state: T8 extended the Data Book with steward-only save/restore/push controls, persisted per-season live/finalized mode,
and explicit state indicators for unsaved draft edits, saved-but-unpushed checkpoints, and pushed canonical snapshots.
`SAVE` calls `/curation/checkpoints` and remains a restorable draft checkpoint; `PUSH` calls `/curation/push` and
promotes a saved checkpoint into the canonical per-season snapshot. Finalized seasons are curate-and-push and show
locked-until-pushed language; live seasons stream provider updates and show an auto-finalize suggestion when provider
data reports the season complete. Prior T7 state: T7 added the Edit Ledger / Change Log as its own league navigation destination at `/leagues/[leagueId]/ledger`.
It reads the existing `league_data_edits` timeline, including T4's checkpoint-save and season-push marker rows,
joins actor display names when available, and renders newest-first notification-style entries. Each row expands
with keyboard-accessible button semantics into a red/green diff using non-color `[-] Before` / `[+] After` labels,
plus field, scope, actor, target, timestamp, reason, and covered seasons for saves/pushes. The shared
`EditLedgerFeed` component also powers the existing steward public-ledger preview/drawer. No save/push controls
were added. Prior T6 state: T6 extended the existing Data Book at `/leagues/[leagueId]/data` with permission-gated editable dimension cells for
person real names and team-season team names. Steward-level users edit inline, then confirm in a shared AUSPEX scope
dialog defaulted to all-years for real names and this-year-only for team names; the chosen scope is posted to
`POST /api/leagues/[leagueId]/curation/edits` with `season` for this-year-only edits. Successful edits update the
Data Book draft view immediately and mark affected cells as Draft; they still do **not** affect the Record Book until
future save/push work. Non-stewards see the same Data Book read-only. Prior T5 state: the Data Book is its own league
navigation destination, uses the league-feed masthead pattern (`PublicationMasthead` with `TabLinks` at the bottom),
a shared AUSPEX `Select` season picker, and responsive DataTable/card fallbacks for the three live draft grains:
People, per-season Settings and summary, and Week-by-week facts including one-sided byes and stored matchup spans.
It reads the live substrate tables (`persons`, `identity_mapping`, `team_season`, `league_season_settings`,
`season_statistics`, `weekly_statistics`, `fantasy_matchups`) and deliberately does **not** read
`composeCanonicalSnapshot`, which remains T9's record-book input. Prior T4 state: T4 added the curated-state
service/API layer: every save is an append-only
whole-league checkpoint anchored by a
`league_data_edits` marker; every push is an append-only per-season pushed version; `composeCanonicalSnapshot(leagueId)`
returns the composition of each season's latest pushed version so pushing 2012 preserves 2011 and every other
previously pushed season. `applyCuratedDataEdit` now implements the dimension edit-scope primitive (real name smart
default = all-years; team name smart default = this-year-only; both overridable) and writes scoped ledger rows with
before/after. Saved checkpoints remain invisible to the composed canonical snapshot until pushed; the current Record
Book is **not** re-pointed yet (T9). Prior T3 substrate state:
bye weeks now persist as one-sided matchup facts (`away_team_provider_id NULL`) whose scores count toward PF and
single-week scoring records without awarding W/L/T by default; ESPN one-sided schedule rows are no longer filtered
out. `schedule_coverage` is bye-aware and clean 95050 verification now reports **0 integrity failures**. Playoff
matchup spans are derived from `league_season_settings.playoff_matchup_period_length`; 2011-2012 playoff matchups
store span=2, including over-broad ESPN windows clamped to the setting, so the 325 two-week playoff total is no
longer the single-week record. The real import artifact shows 72 record rows, 15 record-book aggregate rows, and the
current highest single-week score is 198.4 by w hardy in 2020 week 16. Prior T2 state: provider-derived member
display names refresh non-manual `persons.canonical_name` values during identity resolution, targeted current sync
resolves identities even when no finalized matchup rows changed, and the real-league import harness writes a
league-scoped Persons summary. Prior T1 state: per-season `league_season_settings` persists ESPN `mSettings`
schedule, roster-slot, scoring, acquisition, and league-size fields for current and historical imports; explicit
historical season requests can import 16 seasons in one run (hard-bounded at 25). Prior state: **Increment
1 (specs 36–41) DELIVERED + HARDENED on branch `review/increment-1`** (data curation foundation, record-book lenses,
commissioner/edit/public-ledger, News+Arena environments, news pipeline + general↔personal wire toggle, ambient
agent + WizKit tier). Built via the orchestrated 3-track model (`ORCHESTRATION.md`) across 3 Codex accounts, then
hardened per `specs/42` after a 4-dimension audit: **3 critical correctness bugs fixed** (multi-week span math,
hollow sliced records, ESPN span ingestion) + **CI-honesty gaps closed** (the fixture oracle now RUNS in CI — vendored,
scrubbed — and the RLS canary covers the 3 new tables; the shell test harness repaired). Final integrated gates green:
**typecheck/lint/build, test 953✓/5 skipped, ubs 0-critical**; oracle + `navigation-shell` tests verified running,
not skipping. (Deferred MED/LOW polish: `specs/42` H1-12..H1-17.) Then **owner UI/UX review fixes applied** per
`specs/43` (6 critiques: page titles → uppercase Michroma at card scale; default route → `/news` for signed-in users;
notification badge un-clipped; league-home + arena rebuilt as in-page top-card section-nav via a shared
`section-tabs` component). Gates green; `docs/screenshots/*` refreshed. **Posture changed (owner): everything now
commits/pushes/merges to `main`** — `review/increment-1` was merged to `main`. Then `specs/44` round-2 fixes applied
on `main` (#7 league-home + arena section nav now reuse the league-feed `TabLinks`-at-bottom-of-top-card pattern,
`SectionTabs` removed; #8 wire toggle moved to the top bar right of search as a compact icon toggle); gates green
(test 958✓/5 skipped), screenshots refreshed, **screenshot-verified by orchestrator**. **`main` (head `b64af8f`) is
the live, up-to-date branch.**

---

## 0. TL;DR for whoever picks this up
- The clean, first-principles rebuild is **delivered**; the live/integration branch is now **`main`** (it carries the full build + the AUSPEX UI overhaul). `rebuild/foundation` was the autonomous-build branch (historical).
- The autonomous **Ralph loop** is retired (`loop.sh` guarded). Increment 1 was built via the **orchestrated-tracks** model (`ORCHESTRATION.md`): an orchestrator + file-disjoint workstream agents in git worktrees, balanced across 3 Codex accounts (A=specs 36/37/38, B=39/40, C=41), each branch merged into `review/increment-1` only after gates green. **`main` was never touched.** Branch `review/increment-1` is ready for owner review; per-tick status in `.orchestration/STATUS.md`.
- **Account routing:** the build runs on `bxbxbxbxbxr`, but the Claude account is set by the CONFIG DIR (`CLAUDE_CONFIG_DIR`/`XDG_CONFIG_HOME`), **not** `HOME` — `loop.sh` pins it via `CLAUDE_CONFIG_DIR=/home/ubuntu/.claude`. Use launchers `cbx`/`cbw`/`cx`. Never run heavy work on `bwcummings1` (other agents + shared 5h limit). See `docs/HISTORY.md §3`.
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
- **UI taste:** the authoritative design source is `DESIGN.md` (AUSPEX) + `docs/screenshots/reference-images/` — build to near-pixel fidelity. (The `impeccable` gate / `DESIGN.md` + `PRODUCT.md` "anti-slop" rules are removed: they contradicted the AUSPEX design and caused a bad build.)
- **Secrets:** never commit. `.env*` is gitignored. Add a secret-scan gate.
- **Git:** work on `rebuild/foundation` (or child branches), commit often, push freely. NEVER force-push; NEVER touch `main`/`v0.62`.
- **Accounts:** the Claude account is the CONFIG DIR, not `HOME` (this run's Fable phase mistakenly used `bwcummings1` because only `HOME` was set — now fixed). Launchers in `~/.local/bin`: `cbx` (Claude bxbxbxbxbxr), `cbw` (Claude bwcummings1 — reserved), `cx` (Codex). `loop.sh` pins Fable via `CLAUDE_CONFIG_DIR=/home/ubuntu/.claude`.
- **Model plan:** Fable 5 at max effort for the build window (~2h), then switch to Codex 5.5 high. This doc + the specs make the handoff seamless.

## 6. Research briefs (full reasoning lives in the planning conversation; key conclusions here)
- **Onboarding/mobile:** browser extensions CAN'T read ESPN HttpOnly cookies on mobile (iOS Safari / no Android extensions). Mobile primary = **hosted live-browser login** (Browserbase-style: user logs into ESPN in an embedded cloud browser, capture session server-side). Desktop fallback = MV3 extension. `chrome-devtools-mcp` is a dev tool, NOT a consumer channel.
- **Betting:** play-money (no real prize) = low legal risk; never add real prizes, never use sportsbook trademarks, license odds (don't scrape a book). Parlays: all legs win; push/void leg drops & re-prices.
- **AI:** treat all web/RSS as untrusted (prompt-injection); enforce league isolation in SQL (`WHERE league_id`) + RLS, never trust the model; near-dup check generated posts (cosine > ~0.92).

## 7. Current state & next steps (build + Scope hardening complete 2026-06-16)
All planned product scope (P0–P5) and the 2026-06-16 audit-hardening Scope are built on `rebuild/foundation`, with gates kept as commit backpressure (typecheck/lint/test/build/ubs; DB-backed tests against local Postgres). See §8 for the build log and `docs/HISTORY.md` for the trajectory + independent review.
- **Data Foundation T1 delivered (2026-06-22):** `league_season_settings` now captures `league_size`,
  matchup/regular/playoff/championship schedule fields, `playoff_matchup_period_length`, playoff teams, scoring type
  + full scoring JSON, lineup slot counts, acquisition type/budget + full acquisition JSON, and keeper fields. ESPN
  current sync and `leagueHistory` both persist it idempotently; explicit 16-season history requests are no longer
  clamped to 10. Real verification for league 95050 is in `.orchestration/import-summary.md`.
- **Data Foundation T2 delivered (2026-06-22):** identity resolution now refreshes provider-derived canonical person
  names from the latest mapped owner names unless a user/steward has manually named that person; current sync refreshes
  identities even when no finalized matchup changed; the real import harness resets only ESPN 95050, imports current +
  15 historical seasons, recomputes stats, and writes a league-scoped Persons section. The latest summary has 14 real
  identities, 188 team seasons/mappings, max identity span 16, and no `Fixture Manager NN` names. The 13 remaining
  integrity failures are the known bye/coverage issue owned by T3.
- **Data Foundation T3 delivered (2026-06-22):** bye weeks are stored as one-sided matchup facts and weekly `bye`
  results; bye PF feeds season/scoring records while W/L/T, streaks, H2H, all-play comparisons, and game-final content
  skip the no-opponent side. ESPN one-sided rows are preserved, `schedule_coverage` treats expected playoff byes as
  coverage rather than gaps, and span derivation now uses `league_season_settings.playoff_matchup_period_length` for
  playoff windows. Clean 95050 verification has 0 `schedule_coverage` failures, 0 total integrity failures, 72 all-time
  record rows, 15 record-book aggregate rows, 2011/2012 span=2 playoff rows (10 each), and the single-week score record
  is now 198.4 by w hardy in 2020 week 16 instead of the 325 two-week 2012 playoff total. **T1+T2+T3 substrate is
  complete; Phase 2 can build the Data layer/push pipeline on this substrate after the owner checkpoint.**
- **Data Foundation T4 delivered (2026-06-22):** curated-state schema/service/API now exists. `league_curation_checkpoints`
  keeps all saved draft snapshots, `league_curation_season_pushes` keeps all per-season pushed versions, and
  `composeCanonicalSnapshot` composes the latest pushed version for each season so no pushed season can fall out when
  another season is pushed. Scoped edits are ledgered through `applyCuratedDataEdit`; save/restore, push, and pushAll
  are exposed under `/api/leagues/[leagueId]/curation/*`. T9 still owns re-pointing record-book reads to this composed
  snapshot.
- **Data Foundation T5 delivered (2026-06-22):** the Data Book read view now exists as a separate league destination
  (`/leagues/[leagueId]/data`) and shell nav peer. It renders one selected season at a time with a year dropdown and
  in-masthead grain tabs for People, Settings, and Weeks. Tables use AUSPEX DataTable/mobile-card treatment and show
  plain empty states for clean leagues. T6 later extended this read view with editable dimension cells and scope
  prompts.
- **Data Foundation T6 delivered (2026-06-22):** the Data Book People grid now exposes steward-level inline edits
  for person real names and team-season team names, and Weeks exposes team-name edits where team names appear. The
  scope prompt uses the shared Dialog/Field/Input/Select/Button primitives, defaults real names to all-years and team
  names to this-year-only, always allows override, and calls `/curation/edits` with `scope` plus `season` for
  this-year-only edits. Successful edits update the draft Data Book state and mark affected cells as Draft; ordinary
  members see no edit affordance. Ledger before/after/scope remains written by `applyCuratedDataEdit`.
- **Data Foundation T7 delivered (2026-06-23):** `/leagues/[leagueId]/ledger` now exists as a separate league
  navigation peer between Data Book and Records. It renders the read-only curation change log from existing ledger
  rows, including edits, checkpoint saves, and season pushes, with newest-first expandable rows and accessible
  before/after diff panels. The steward public-ledger drawer reuses the same feed component.
- **Data Foundation T8 delivered (2026-06-23):** the Data Book now owns the save/push state machine UI. Stewards can
  save checkpoints, restore prior checkpoints, push the selected finalized season, push all finalized saved seasons,
  and toggle a season between live-stream and finalized curate-and-push mode. A new RLS-scoped
  `league_curation_season_states` table stores the explicit owner-finalized state. The Data Book masthead shows
  per-season and overall indicators for unsaved draft edits, saved-but-unpushed checkpoints, and pushed canonical
  snapshots; push confirmation dialogs preserve the T4 per-season composition invariant.
- **Data Foundation T9 delivered (2026-06-23):** the Record Book now reads pushed canonical state only via
  `composeCanonicalSnapshot(db, { leagueId })` and derives records from pushed person/team/weekly/settings/grouping
  snapshots. Saved checkpoints do not affect Records until pushed, and nothing-pushed leagues render the explicit
  Data Book push empty state instead of falling back to live facts. The display rule is latest pushed team name plus
  real name, one row per person; era/segment controls are view-only over confirmed groupings present in the pushed
  data. Real 95050 verification reset/imported 16 seasons, pushed a baseline, edited a 2012 weekly score 179→249,
  saved a checkpoint, confirmed Records still showed the prior 198.4 high score, pushed only 2012, then confirmed
  Records showed 249 while preserving all pushed seasons. Artifact: `.orchestration/import-summary.md`.
- **Data Foundation T10 delivered (2026-06-23):** era proposals now come from a pure settings-signature detector over
  `league_season_settings` plus season structure: team-count boundaries, playoff matchup length, playoff team count,
  regular-season week count, and normalized lineup slot changes (including OP-to-FLEX). Single-format leagues get zero
  proposals, and regular/playoff segments are not proposed as eras. The Data Book Settings grain shows proposed and
  confirmed eras with Confirm, Adjust, and Dismiss controls gated at `data_steward`; dismissed proposals persist via
  `league_season_grouping_status='dismissed'`. Confirmed groupings still need save/push before Records receives them.
  Real 95050 verification produced six proposals, confirmed `12-team era (2013-2014)`, pushed all 16 seasons, and
  screenshot-verified the Data Book proposal UI plus Record Book lens pill.
- **Data Foundation T11 delivered (2026-06-23):** the pushed-snapshot Record Book catalog now exposes owner-facing
  categories for All-time, Regular season, Playoff, Head-to-head, Achievements, and Lowlights. The catalog adds
  playoff record leaders, H2H streak summaries, top/bottom weekly milestone counts, most last-place finishes, worst
  win-rate/average records, lowest PF season, biggest/narrowest losses, and category registry metadata used by the
  page. The Records page renders those categories as sections under a `PublicationMasthead` section-anchor tab row,
  with the existing segment×confirmed-era lens preserved as a view control. Real 95050 verification and T11 screenshots
  passed.
- **Data Foundation T12 delivered (2026-06-23):** substrate B now exists for shared, non-editable general NFL fantasy
  stats. `nfl_players`, `nfl_schedule`, `nfl_team_stats`, and `nfl_player_week_stats` are central tables with
  source/fetch-time/content-hash provenance; the committed mock fixture ingests idempotently after integrity checks;
  and `src/general-stats` provides read-only player/team/schedule/stat lookups plus roster-fact enrichment. Verification
  is in `.orchestration/import-summary.md`; live News/AI wiring remains future consumer work.
- **Task T13 delivered (2026-06-23):** imports converge per season to the provider payload. The ESPN fixture offender
  now lives in a reserved non-real namespace and cleans up after e2e runs; current and historical import paths delete
  stale member/team rows only for fetched seasons, then re-resolve identities and remove orphan people. The new
  `provider_identity_contamination` integrity invariant blocks real-provider leagues with invalid member ids or known
  placeholder names. The T13 verifier proves fresh 95050 import, re-import idempotency, and contaminated-to-clean dev
  DB reconciliation with no 95050-specific product code.
- **Real & verified:** per-league RLS isolation (binding non-superuser canary), Better Auth, ESPN/Sleeper/Yahoo ingestion (vs the 95050 fixture), stats/records/identity, AI content pipeline, betting engine + rolling-min bankroll + central arena, realtime + push.
- **Mocked (drop-in keys later):** Anthropic, The Odds API, SportsDataIO, Tavily, Voyage, Browserbase. Real Browserbase cookie-capture is the one un-wired seam (ESPN onboarding runs fixture-backed by default).
- **Resolved review bugs:** AI near-dup now uses a league/content-type/model-filtered pgvector nearest-neighbor query (`f380946`); postseason and championship stats derive from season settings/finals with low-confidence integrity failures (`dfa85a9`, `cd6cbe2`); Sleeper co-owner overlap no longer merges distinct same-season team slots (`485e467`); invite tokens persist only hashes (`7a92dfa`); bet placement takes the bankroll-week lock before balance checks (`22a4333`).
- **Hardening pass delivered:** live ingestion calendar cadence, schedule-backed NFL calendar fallback, Anthropic LLM judge gate, lore steward tiebreak constraints, DB role privilege health, PWA league-page cache isolation, transaction/waiver content emitters, records-catalog fixture coverage, and spend-guard fallback coverage are all landed and tested (`0a2f543`, `43a030b`, `4cc4a5b`, `aa80043`, `8cd3b76`, `e208349`, `060aab8`, `e0cf000`).
- **Next:** wire substrate B into News/AI factual grounding and league-data roster enrichment where those consumers
  need it.

## 8. Recent (loop log; newest first)
- 2026-06-23: Task T13 landed — provider imports now reconcile each fetched season to provider truth, test fixtures
  use a reserved non-real ESPN namespace, and the `provider_identity_contamination` invariant gates invalid ids and
  placeholder identities. Fresh and contaminated 95050 verification passed.
- 2026-06-23: Data Foundation T12 landed — substrate B now stores league-agnostic NFL players, schedule, team box
  scores, and player-week stats in central provenance-stamped tables, ingests the committed mock/$0 fixture
  idempotently after integrity checks, and exposes `src/general-stats` read/enrichment APIs for future News/AI
  grounding.
- 2026-06-23: Data Foundation T11 landed — Records now renders category sections for All-time, Regular season,
  Playoff, Head-to-head, Achievements, and Lowlights from a typed pushed-snapshot catalog, including new worst/lowlight
  records. Real 95050 verification and T11 screenshots passed with duplicate-key grep = 0.
- 2026-06-23: Data Foundation T10 landed — settings-derived era proposals now surface in the Data Book Settings grain
  with Confirm/Adjust/Dismiss, durable dismissal status, `data_steward`-gated grouping API actions, and pushed
  confirmed groupings reflected by the existing Record Book era lens. Real 95050 verification and T10 screenshots
  passed.
- 2026-06-23: UI-Polish-2 owner IA fix landed — the league rail now exposes **League Data** as the single data
  destination plus **Records** as its own destination; `/data` and `/ledger` share a League Data masthead with
  `[Data Book | Edit Ledger]` tabs, and the Data Book People/Settings/Weeks grain selector is now a secondary
  segmented control inside the Data Book content. Full screenshots were regenerated and duplicate-key grep returned 0.
- 2026-06-23: Data Foundation T9 landed — Record Book reads `composeCanonicalSnapshot` pushed seasons only; saved
  edits stay draft-only until push; nothing-pushed leagues get the Data Book push empty state; person display uses
  latest pushed team name plus real name; the 2012 real-league vertical slice proved data→edit→save→push→record.
- 2026-06-23: Data Foundation T7 landed — `/leagues/[leagueId]/ledger` is now a separate Edit Ledger destination
  with a shared expandable feed for data edits, checkpoint saves, and season pushes; rows show accessible
  `[-] Before` / `[+] After` red/green diffs and the steward public-ledger drawer reuses the same renderer.
- 2026-06-22: Data Foundation T6 landed — steward-level Data Book dimension cells are editable inline, scope
  confirmation is defaulted/overridable, edits post to `/curation/edits` with `scope`/`season`, draft cells update
  immediately, and non-stewards remain read-only.
- 2026-06-22: Data Foundation T5 landed — `/leagues/[leagueId]/data` now renders the read-only Data Book with
  People, Settings, and Weeks grains, year dropdown season switching, shell navigation, component interaction tests,
  and screenshot harness coverage.
- 2026-06-22: Data Foundation T4 landed — append-only curated checkpoints and per-season pushes now back the
  save/push state machine, scoped dimension edits are ledgered with smart defaults/overrides, and
  `composeCanonicalSnapshot` preserves every season's latest pushed contribution while keeping saved-only edits
  invisible.
- 2026-06-22: Data Foundation T3 landed — ESPN byes persist as one-sided facts with `weekly_statistics.result='bye'`,
  span derivation uses per-season playoff settings, `schedule_coverage` is bye-aware, and clean 95050 verification has
  0 integrity failures with the 325 playoff total excluded from single-week records.
- 2026-06-22: Data Foundation T2 landed — person canonical names now refresh from provider owner names without
  overwriting manual/steward renames, targeted current sync resolves identities on no-matchup-change runs, and the
  real 95050 import summary is league-scoped with a Persons section (14 real identities, 188 mappings/team seasons,
  max 16-season span, no fixture-manager bleed).
- 2026-06-22: Data Foundation T1 landed — per-season ESPN settings now persist to `league_season_settings` for
  current and historical imports, explicit 16-season history requests import in one run, and live 95050 verification
  confirms 16 settings rows plus the expected 2013 size, 2011–2012 playoff-length, 2021 regular-week, and OP/FLEX
  signatures.
- 2026-06-16: Audit-hardening docs reconciled — `docs/PROGRESS.md` and `docs/HISTORY.md` now mark fixed review bugs resolved and reflect completed Scope hardening.
- 2026-06-16: Spend-guard fallback coverage landed — rolling-24h TTL expiry is now covered for memory and Redis counters, and guarded Anthropic, Tavily, Voyage, Odds, SportsDataIO, and central-news unavailable paths fall back to deterministic mocks under tests.
- 2026-06-16: Records catalog coverage landed — `records-catalog.ts` now has a direct seeded multi-season fixture test suite covering standings reconciliation, deterministic tied record ordering, H2H mirror ledgers, cross-season streaks, championship summaries, keeper milestones, and co-owner identity separation.
- 2026-06-16: Transaction/waiver content emitters landed — live ingestion now fetches supported provider transactions, persists changed rows idempotently, and fans out transaction/waiver Beat Reporter trigger events.
- 2026-06-16: PWA cache hardening landed — `/leagues/:path*` pages now declare `Cache-Control: private, no-store`, and a shared-device login-A → logout → login-B e2e guards against cached league-page leakage.
- 2026-06-16: DB role privilege health assertion landed — `/api/health` now reports current/session DB role privileges and production health fails if the app role is superuser or has BYPASSRLS.
- 2026-06-16: Invite token-at-rest hardening verified — `league_invites` persists only `token_hash`, preview/acceptance look up by SHA-256 hash, and a migration-backed regression test guards against plaintext token columns returning.
- 2026-06-16: Schedule-backed NFL calendar landed — the default calendar now reads ESPN public scoreboard windows for week/phase/game-state, maps playoff tokens, keeps the heuristic fallback for outages, and live ingestion consumes the fixture-backed source in cadence tests.
- 2026-06-16: Anthropic LLM judge publish gate landed — generation now scores validated drafts before publish, regenerates once or skips on low authenticity/persona/leakage, and selects a guarded real Anthropic judge only when Anthropic is unmocked.
- 2026-06-16: ESPN postseason derivation confidence landed — live 95050 history validation confirmed recent `rankCalculatedFinal` title-game alignment, final standings now persist rank provenance, and low-confidence fallback finals/title-game misses surface as integrity failures.
- 2026-06-16: Lore steward tiebreak hardening landed — steward ratify/reject now requires tie, quorum-short, or expired vote conditions, and open-vote commissioner overrides are a separate audited action.
- 2026-06-16: Live ingestion calendar cadence hardening landed — ingestion tick now uses the NFL calendar default game-state provider so live game windows hit the 1-min matchup poll tier while off-hours stay relaxed.
- 2026-06-16: AUSPEX onboarding flows landed — provider connect, hosted ESPN frame, unified discovery/import inventory, roster invite path, and claim-your-team previews now use the shared mobile-first onboarding register.
- 2026-06-16: AUSPEX lore mechanic UI landed — lore submit, canon ledger, shared quorum voting, claim verification, steward controls, and challenge/dispute lineage now use tokenized panels, exact result states, semantic meters, and nested-list lineage.
- 2026-06-16: AUSPEX instigator and shared voting landed — lore now renders AI provocation/verdict cards, poll-backed cast instigations vote through `/api/leagues/[leagueId]/polls/[pollId]/votes`, and lore claims share one accessible vote widget.
- 2026-06-16: AUSPEX AI cast presence landed — `/leagues/[leagueId]/cast` now renders the six persona cards from league/default persona data, persona-tinted orb bylines, persisted-content insight cards, a collapsible cast thread, and league-home Cast entry points.
- 2026-06-16: AUSPEX entitlement/upgrade gated-state composition landed — locked cards now map typed entitlement reasons to accessible preview-backed copy, League Home resolves the cast gate server-side without hiding the substrate, and `/you` includes a no-pricing FREE/PREMIUM/INDIVIDUAL tier explainer.
- 2026-06-16: AUSPEX Records/News/Settings surface composition landed — Records gained anchored catalog navigation plus responsive sortable manager/H2H tables, Central News was verified on the existing editorial register, and You/data-steward/lore-steward surfaces now use provider reconnect rows, locked states, banners, and confirm-gated queues.
- 2026-06-16: AUSPEX Sportsbook surface landed — `/leagues/[leagueId]/bet` now frames event-grouped markets, a locked-price Parlay Console with mobile sheet trigger, amber rolling-bankroll LCD loop, open/history slip ledger tabs, offline read-only treatment, and a sportsbook-shaped skeleton.
- 2026-06-16: AUSPEX Arena surface landed — `/arena` now frames league-vs-league and individual competition with a Central Arena HUD, honest as-of state, rivalry duel metrics, aggregate rank/P&L/ROI charts, movement rail, route-specific skeletons, and `season` query compatibility.
- 2026-06-16: AUSPEX League Home dashboard landed — league home now composes the matchup hero, local wire, scoreboard, sortable standings, Press rail, bankroll preview, records, teams, and responsive empty states without changing the scoped loader.
- 2026-06-16: AUSPEX article page landed — publication articles now carry sticky reading progress, orb/source bylines, pull quotes, structured inline data blocks, canon/tags, and non-dead-end related/next reading paths.
- 2026-06-16: AUSPEX publication fronts landed — Rumbledore News and The Press now share a mastheaded editorial grid with section-front context, responsive rail/river hierarchy, empty states, and publication-shaped loading skeletons.
- 2026-06-16: AUSPEX editorial reading register landed — PublicationStoryCard now supports hero/secondary/river/rail/compact/inFeed variants with cast-orb bylines, and article bodies share the `prose-auspex` long-form skin.
- 2026-06-16: Realtime shell/PWA affordances landed — the WIRE ticker and notifications now consume scoped realtime events, league presence is surfaced in the switcher/chrome, and the boot, install, and offline states use AUSPEX treatment.
- 2026-06-16: AUSPEX scope switcher landed — the unified MRU league switcher now promotes the Global Your Leagues row, uses provider-tagged scope rows with optional presence labels, supports keyboard row navigation, and opens as a focus-managed mobile Sheet.
- 2026-06-16: Responsive AUSPEX app shell landed — desktop rail/topbar, tablet collapse persistence, mobile header/tabs, WIRE strip/sheet, notification/account chrome, live clock, skip link, and persisted motion controls now compose the existing two-scope IA.
- 2026-06-16: Live AUSPEX spectacle primitives landed — WIRE ticker, scoreboard strip, count-up readouts, live pulse dots, cast orb states, stingers, vote/canon moments, and a deterministic conductor now share the reduced-motion master switch.
- 2026-06-16: Rumbledore-native viz catalog landed — bankroll equity, standings bump, playoff-odds cone, win-probability timeline, odds drift, season arc, H2H flow, activity calendar, power ladder, leverage gauge, record chase, projection violin, and season dial now share the typed AUSPEX chart contract with table fallbacks and focused fixtures.
- 2026-06-16: AUSPEX chart library landed — a typed shared SVG primitive now formalizes the 18 canonical generators with non-color encodings, focusable marks, table fallbacks, responsive reductions, state handling, and reduced-motion CSS.
- 2026-06-16: AUSPEX navigation atoms landed — shared breadcrumbs, tabs, pagination, wizard steps, and a Ctrl/Cmd-K command palette now ship with focused tests and real shell/news/press/onboarding/arena adoption.
- 2026-06-16: AUSPEX feedback/overlay components landed — shared alerts, banners, toasts, dialogs, responsive sheets, tooltips, popovers, skeletons, and empty/gated states now ship with focused tests and route-safe adoption.
- 2026-06-16: AUSPEX data-display components landed — table-to-mobile-card primitives, status/badge/tag/edge labels, KV rows, avatars/presence, meters/pips, and stat tiles now ship with focused tests and are adopted by the Arena leaderboard.
- 2026-06-16: AUSPEX control library landed — shared Button, Field/Input/Search/Textarea/Select/Stepper/Switch/Segmented/Slider/Checkbox/Radio/Chip primitives now carry tokenized states, a11y wiring, and adoption in league switcher, push toggle, lore, and bet flows.
- 2026-06-16: AUSPEX motion and a11y foundation landed — named motion/easing tokens now cover atmosphere, orb, count-up, draw-in, staged process, hover-lift, focus bloom, and marquee flows, with audited focus contrast plus global reduced-motion-safe keyboard focus.
- 2026-06-16: AUSPEX signature primitives landed — global foundation utilities now cover the conic AI orb with motion-safe states, Y2K bezel/chip chrome, and glass panel/cell surfaces with opaque fallbacks.
- 2026-06-16: AUSPEX atmosphere foundation landed — the app now mounts one decorative starfield/scanline/grain/vignette layer tree behind content, with desktop-only drift plus tablet, mobile, and reduced-motion static fallbacks.
- 2026-06-16: AUSPEX typography system landed — Michroma/Saira/JetBrains Mono/Inter now load through `next/font`, the theme contract exposes display/body/3xl/prose/numeric tokens, and global utilities cover gradient-clipped headings, LCD numerics, keyboard glyphs, and the reading register.
- 2026-06-16: AUSPEX theme registration landed — canonical AUSPEX raw tokens now populate the Phase 4 theme framework, `auspex` is the default active theme, neutral-dark remains selectable as fallback, and the contrast gate audits the new hex palette.
- 2026-06-16: Component token migration landed — shared UI, app badges, and navigation shell literals now resolve through token utilities, default transitions route through motion tokens, and a token-contract test blocks raw component color/font/radius/duration literals.
- 2026-06-16: Token accessibility gates landed — registered themes now run WCAG contrast checks over semantic foreground/background pairs, prove bad palettes fail, and verify reduced-motion CSS collapses all motion duration tokens.
- 2026-06-16: ThemeProvider swap landed — registered neutral-light plus palette-a/palette-b slots now cascade through `data-theme`, with SSR cookie resolution, a pre-paint theme script, and persisted runtime switching.
- 2026-06-16: Design-token system landed — the neutral-dark baseline now lives as typed primitives plus semantic aliases, generated into CSS vars and bridged through Tailwind utilities for type, spacing, radii, elevation, motion, and colors.
- 2026-06-16: AI variant A/B eval harness landed — `pnpm eval:ai:variants` now scores deterministic model×tone variants across golden fixtures/content types, writes a machine-readable scorecard, names a winner, and disqualifies leaking variants.
- 2026-06-16: Versioned prompt-template management landed — AI generation now renders ordered prompt sections with template id/version metadata, feeds rendered system/user instructions to real providers, and records template/tone/model provenance on generation runs.
- 2026-06-16: Versioned AI tone-profile records landed — persona cards now persist editable tone profiles with version/attribution, render tone/guardrail framing from data, and deterministic mocks prove tone edits change prompts and drafts.
- 2026-06-16: Data-driven AI model routing landed — generation now resolves bulk/flagship/custom providers per persona/content-type route config, supports exact task overrides, and falls back safely when optional custom routes are unavailable.
- 2026-06-16: Pluggable AI model-provider seam landed — generation can now use the existing Anthropic path, an Anthropic-compatible custom endpoint, or an OpenAI-compatible custom endpoint selected by validated env config while preserving the pipeline's `LlmClient` contract.
- 2026-06-16: Fixture-first paid-provider VCR harness landed — Anthropic, Tavily, Voyage, The Odds API, and SportsDataIO now replay scrubbed cassettes offline, live smoke is gated by `LIVE_SMOKE=1`, and Anthropic structured output now uses per-content schemas small enough for real Haiku validation.
- 2026-06-16: Provider usage observability landed — guarded real provider calls now emit secret-free usage logs with token/request counts and expose provider usage totals through health metrics.
- 2026-06-16: Per-provider spend guard landed — real Anthropic, Tavily, Voyage, Odds, and SportsDataIO paths now cap Redis-backed usage and demote to deterministic mocks on breach.
- 2026-06-16: Cheap AI model-tier defaults landed — Anthropic now defaults every persona to Haiku with an opt-in mixed tier, and Voyage embedding model selection is env-overridable while defaulting to voyage-4-lite.
- 2026-06-16: Clean provider mock→real selection verification landed — env parsing and dependency factories now assert key-present real paths plus forced-mock paths for Anthropic, Odds, SportsDataIO, Tavily, and Voyage.
- 2026-06-16: Mobile PWA perf budget landed — App Router skeleton loading states now cover the mobile shell route families, CI runs a post-build route JS budget check, and the budget locks FCP/repeat-start/transition/CLS/INP/tap-target targets.
- 2026-06-15: Share-link deep routing landed — unauthenticated league-scope links now bounce through onboarding with a safe preserved destination, invite links return after provider connection, and matching league imports continue to the saved destination.
- 2026-06-15: PWA cache-safety hardening landed — service worker runtime caches now skip API/cross-origin/auth/private/no-store/Vary responses, sign-out clears page caches, and browser push is unsubscribed before session exit.
- 2026-06-15: PWA install affordance landed — `/you` now exposes Android `beforeinstallprompt` install flow, iOS Safari Share→Add instructions, standalone hiding, and persisted dismissal.
- 2026-06-15: Central news tailoring hand-off landed — refreshes now carry provider-player refs into central metadata, match them against latest league rosters, and upsert league-scoped feed references for the existing `/news` rail and Press blend.
- 2026-06-15: Central News editorial front hardening landed — `/news` and section fronts now rank the full central corpus by freshness plus editorial importance before tiering into lead, secondaries, and river.
- 2026-06-15: Multi-source central news pipeline landed — central refresh now fans in mocked web-grounding plus RSS adapters, carries publication metadata/provenance, and merges duplicate citations across refreshes.
- 2026-06-15: Reactive cadence enrichment landed — game-final pieces now share weekly-wrap idempotency, reactive lore/bet/arena keys carry NFL-week framing, and generation prompts receive structured cadence stakes.
- 2026-06-15: Offseason/quiet-week cadence landed — scheduled AI planning now has a weekly offseason beat, preseason countdown slate, explicit quiet-week signal, complete-season offseason eligibility, stable keys, and gated tests.
- 2026-06-15: In-season weekly cadence slate landed — scheduled AI planning now supports explicit missed-week NFL state for backfill, phase-specific cast pairings are locked by tests, and the cron wrapper path is covered.
- 2026-06-15: NFL calendar cadence seam landed — scheduled AI cadence now uses a mockable league-agnostic week state for phase/game-state slates and calendar-stable cron keys.
- 2026-06-15: Notification taxonomy/preferences landed — Web Push now has lore and arena-rival event types, per-league RLS opt-outs, a guarded preferences API, and fan-out filtering before delivery.
- 2026-06-15: Web Push end-to-end scoping landed — league notification toggles now verify per-league endpoint rows before showing enabled, empty personal recipient sets no longer fan out league-wide, and VAPID public-key exposure is covered.
- 2026-06-15: Realtime client reconnect hardening landed — league-scoped subscriptions now refetch short-lived grants before expiry and recover from Supabase channel failures or token fetch errors with fallback backoff.
- 2026-06-15: Lore realtime broadcast fan-out landed — lore vote-opened/canonized events now publish on league-scoped realtime channels from member submissions, steward actions, poll instigations, vote closes, and record-broken verified hooks.
- 2026-06-15: Record-broken cast/lore hooks landed — incremental record displacements now emit stable record-broken cast events, seed idempotent AI-origin data-verifiable lore claims, and give milestone generation the displaced prior holder.
- 2026-06-15: Record-book aggregate materialization landed — all-time standings and keeper milestones now persist as RLS-scoped aggregates, full and targeted stats recomputes refresh them idempotently, and live finalized-score changes run a distinct records pass.
- 2026-06-15: League Records surface deepening landed — `/records` now renders a structured record book with standings, records, championships, rivalries, and dedicated per-manager plus canonical head-to-head pages.
- 2026-06-15: Symmetric H2H and postseason records catalog landed — record-book reads now expose all-time/per-season rivalry ledgers, mirrored manager H2H lines, championship seasons, and playoff/title records from trusted materialized stats.
- 2026-06-15: All-time records catalog aggregates landed — standings, highs/lows, head-to-head-only blowouts/closest wins, and cross-season streaks now assemble behind an integrity-quarantined records catalog service.
- 2026-06-15: Same-auth season rollover landed — live ingestion now re-discovers connected credentials, persists newly exposed seasons, advances durable league roots, and fans out next-season ingest events without re-onboarding.
- 2026-06-15: Reconnect-on-expiry scheduler pause landed — live ingestion now reports invalid credential targets with provider reconnect CTAs, skips fan-out until reconnect, and still treats auth expiry as non-retriable.
- 2026-06-15: Finalized-state ingestion hardening landed — current sync now rejects final-to-non-final matchup flaps with steward-visible integrity notes, preserves completed league seasons, allows final score corrections, and fans out hash-keyed `game.final` events from live ingest.
- 2026-06-15: Pluggable ingestion poll policy landed — cadence now lives in a validated data config with env/global and explicit override seams, while `ingestion.tick` consumes the injectable policy interface.
- 2026-06-15: Adaptive ingestion cadence landed — `ingestion.tick` now consults an injectable game-state provider and `data_coverage` freshness to fast-path live matchup polling while skipping off-hours rows before their window.
- 2026-06-15: Live ingestion heartbeat landed — `ingestion.tick` now cron-plans connected discovered leagues into provider-scoped `league.ingest` workers that reuse stored credentials and current sync.
- 2026-06-15: First-bet bankroll opening landed — bet placement now atomically opens the current rolling-minimum week when no active week exists, the Bet surface submits first slips against the floor, and settlement/rollover arena rebuilds now fan out only to affected arena seasons.
- 2026-06-15: Lore challenge/citation round-trip landed — claim pages now create response/addendum/dispute/re-litigation branches, AI-origin votes show cast bylines, and Press articles link canon citations back to lore claims.
- 2026-06-15: Lore canon browsing landed — the Lore front now tiers ratified canon with publication Story Cards and subject filters, while claim pages render full branch/dispute lineage with superseded/upheld annotations.
- 2026-06-15: Lore vote experience landed — open claims now expose live tally/quorum/window state, members can recast votes through guarded APIs, and stewards can ratify/reject/extend quorum-short votes from a lore review surface.
- 2026-06-15: Lore IA submit surface landed — league navigation now includes Lore, Records/Press cross-link to the canon ledger, and members can submit opinion or structured data-verifiable lore claims through a guarded API route.
- 2026-06-15: Entitlement caps/admin path landed — cadence planning now enforces weekly AI post caps with league overrides, personal-agent league caps remain server-side, and platform admins can grant league/user entitlements with append-only audit.
- 2026-06-15: Individual personal-agent gate landed — `/you` now resolves `ai.individual.agent` before cross-league briefing work, renders a locked individual-tier state for free users, and caps active coverage from entitlement config.
- 2026-06-15: Premium AI gate landed — league cast generation now blocks before web/LLM/embed spend for free leagues and cadence planners skip free-league fan-out while preserving dev/test override.
- 2026-06-15: Entitlement resolver landed — capability checks now resolve league premium, user individual, dev override, expiry/suspension, caps, and advisory arena gating from one injectable server-side path.
- 2026-06-15: Entitlement model landed — auth-plane league/user entitlement rows now represent FREE/PREMIUM league access and INDIVIDUAL user access with append-only audit events.
- 2026-06-15: Data-steward doorway landed — commissioners can appoint league-scoped stewards, flagged imports deep-link to review, and stewards can confirm fuzzy links or mark integrity flags reviewed.
- 2026-06-15: Invite activation hook landed — claimed members now see their team, current matchup, all-time stats/record hits, and cast coverage on league home with latest-headline fallback.
- 2026-06-15: Claim-your-team invite flow landed — Members can copy a reusable roster claim link, invitees can pick an unclaimed imported team, and acceptance now maps user→provider-member before granting league access.
- 2026-06-15: Primary roster invites landed — Members now bulk-copy roster invite links, keep SMS as the prominent contact-supplied path, and keep email behind an entered-address fallback with hashed/hinted destinations.
- 2026-06-15: Leaguemate detection surface landed — imports now carry provider-aware "we found your N leaguemates" summaries, exclude the connector's known team slot, and link directly into roster invites.
- 2026-06-15: Unified onboarding inventory landed — ESPN, Sleeper, and Yahoo discovered leagues now aggregate in one persisted "Your leagues" list with provider-aware import from any connect screen.
- 2026-06-15: Arena recap narration landed — the AI cast now has a structured `arena_recap` content type, aggregate arena context in prompts, post-odds-refresh and standings-swing planning, and settlement-driven swing fanout.
- 2026-06-15: Settlement reactions landed — settled slips now send member-specific outcome/payout/bankroll push notifications, refresh league/arena realtime leaderboards, and emit idempotent arena standings-swing signals from materialized rank deltas.
- 2026-06-15: Arena rivalry framing landed — `/arena` now carries focused league context, computes league head-to-head leaders/margins from aggregate standings, and renders compare-against rivalry links.
- 2026-06-15: Arena season movement landed — `/arena` now defaults to the active arena season, links prior seasons, stamps prior-rank deltas on materialized league/individual standings, and surfaces biggest risers/fallers.
- 2026-06-15: Mock market depth landed — every mocked NFL event now carries moneyline, spread, total, and player-prop markets with matching mock player stats, plus placement/settlement coverage for prop parlays.
- 2026-06-15: Bankroll loop surface landed — league Bet now shows this-week balance, open exposure, open upside, best-case balance, and auditable reset/carryover opening context from the append-only ledger.
- 2026-06-14: Bet slip placement landed — league Bet now builds singles/parlays from locked snapshot selections, previews stake/payout against live bankroll, submits through an authenticated idempotent placement route, and surfaces stale-line/balance errors.
- 2026-06-14: Sportsbook board grouping landed — league Bet now groups mocked odds by event, renders market rows with selectable locked-price buttons, and stages picks for the slip flow.
- 2026-06-14: Bidirectional AI-lore contract landed — AI context now carries canon/pending/disputed/refuted lore buckets with canon-only assertion rules, and planned instigations now seed poll-backed AI-origin lore claims before verdict canonization.
- 2026-06-14: Challengeable canon landed — dispute/relitigation branches now mark canon as contested, supersede it on successful challenges, restore it as upheld on failed challenges, and preserve thread lineage with append-only events.
- 2026-06-14: Lore two-type submission landed — data-verifiable claims now resolve synchronously against league stats into verified canon/refuted rejection/unverifiable vote fallback, while pure opinion claims stay vote-ratified.
- 2026-06-14: Lore vote lifecycle landed — opinion claims now open first-class votes, one-vote-per-member tallies enforce quorum/majority canonization, and commissioners/data stewards can ratify/reject/extend/veto with append-only audit plus `lore.vote.close` fan-out.
- 2026-06-14: League lore data model landed — claims now carry verification/body/branch/thread/vote metadata, claim-native subjects/verifications/votes are RLS-scoped, and the canary covers cross-league isolation plus one-vote-per-member.
- 2026-06-14: Offline LLM-judge eval gate landed — deterministic mock judge scores generated cast output for authenticity, persona match, and cross-league leakage across all content types in CI.
- 2026-06-14: Authenticity engine landed — AI prompts now carry league-scoped canonical people, rivalries, record facts, and ratified canon; generic drafts retry/skip, and near-dup checks query nearest same-content vectors before publishing.
- 2026-06-14: Instigator engine landed — grounded settle-it seeds now create first-class instigations, polls, one-vote-per-member tallies, poll-derived canon claims, and idempotent Commissioner verdict columns with RLS/append-only coverage.
- 2026-06-14: AI cadence and trigger framework landed — mid-week cadence, event-driven planners for transactions/waivers/records/lore/polls/bet settlements, rivalry/milestone/instigation/verdict templates, and bet-settled fan-out now emit idempotent content generation candidates.
- 2026-06-14: Structured AI content templates landed — generation jobs now carry content types, persist typed template structures, and mock/real LLM contracts cover recaps, rankings, previews, awards, reactions, and arcs.
- 2026-06-14: Persona cast contract landed — six AI cast cards now include Beat Reporter plus explicit beat, POV, and performance triggers in persisted persona cards and cached generation prompts.
- 2026-06-14: AI article-shape generation landed — league blog generation now emits/persists headline, dek, persona byline metadata, league section, tags, and structured body blocks for Press articles.
- 2026-06-14: For-your-league central News rail landed — `/news` can now carry an active-league rail of matched central stories via league feed references without reframing the central Front.
- 2026-06-14: Publication Story Card/register separation landed — fronts, article rails, central/league teasers, and League Home's small From the Press module now share one story-card contract with optional thumbnails and relative time.
- 2026-06-14: Publication Article archetype landed — league Press and central News stories now open full article pages with bylines, dek, structured body rendering, tag links, and related-story rails.
- 2026-06-14: Publication section fronts landed — central News and league Press now expose typed section taxonomies with section-filtered Front routes and empty-state-safe beat navigation.
- 2026-06-14: Publication Front archetype landed — `/news` and league Press now render ranked lead/secondary/river tiers from a shared story-card contract, with editorial importance able to beat pure recency.
- 2026-06-14: Targeted incremental stats recompute landed — changed finalized matchups now refresh only affected season/championship rows plus affected H2H pairs, with `stats_calculation` logs proving no full all-time rebuild on routine sync.
- 2026-06-14: Data integrity and stewardship landed — recomputes now record reconciliation/standings/schedule/identity/coverage checks, unresolved failures quarantine trusted record reads, and steward actions can review/rerun/rename/reassign with audit.
- 2026-06-14: League edge-case substrate landed — normalized scoring settings, keeper markers, divisions, matchup kind, and roster keeper metadata now persist across providers, with stats keeping median/all-play rows out of H2H records.
- 2026-06-14: Postseason stats hardening landed — provider postseason settings now persist per league-season, weekly playoff/championship flags derive from settings plus finals, and championship records use title-game scores when identified.
- 2026-06-14: Co-owner identity hardening landed — identity resolution now scopes shared owner-member overlap to provider team slots, preserves co-owner owner history, and guards weekly stats against cross-slot over-merge.
- 2026-06-14: Historical depth hardening landed — imports now default through 10 prior seasons, extend shorter completed checkpoints without reprocessing, and remember provider history exhaustion in checkpoint cursors.
- 2026-06-14: Provider parity/coverage landed — ESPN/Sleeper/Yahoo now declare per-data-class capability matrices, ingestion persists roster entries/transactions where normalized, and RLS `data_coverage` records complete/partial/stale/unavailable/error states instead of treating missing classes as empty-complete.
- 2026-06-14: IA route migration landed — `/you`, league Press/Bet/Records/Members routes now exist with auth guards, legacy feed/posts/invite URLs redirect into the new IA, and the full gate suite plus e2e is green.
- 2026-06-14: Your Leagues landing landed — `/` now renders the authenticated cross-league lobby with MRU-ordered league cards, matchup score context, latest league Press headlines, and logged-out/zero-league connect states.
- 2026-06-14: Responsive nav shell landed — root chrome now derives scope from URL, exposes mobile top/scope sheet plus bottom tabs, desktop/tablet collapsible sidebar, and client-loaded unified league switcher data.
- 2026-06-14: Unified league switcher landed — membership MRU persistence, all-provider provider-badged list data, searchable/groupable switcher UI, and active-league recency bumps are covered.
- 2026-06-14: Phase 1 IA foundation landed — Global-vs-League section taxonomy, provider-badge labels, URL-derived active navigation state, and legacy feed/post/invite section mapping are now typed and covered.
- 2026-06-12: Scores realtime publishing landed — current sync now emits typed `scores.updated` broadcasts for changed matchup rows after commit, with Supabase and in-process publish/subscribe coverage.
- 2026-06-12: Invite acceptance landed — share-token invites now grant member access, persist RLS-scoped provider-member identity claims, and turn accepted invite targets off across active invite links.
- 2026-06-12: Leaguemate invite MVP landed — league home now opens an invite screen populated from imported fantasy members/teams, creating RLS-scoped share links with public previews plus mock-recorded SMS/email sends.
- 2026-06-12: Provider reconnect CTAs landed — invalid ESPN/Sleeper/Yahoo credentials now surface provider-specific reconnect actions on onboarding/import screens and only true auth-expired errors mark stored credentials invalid.
- 2026-06-12: Shared auth guards landed — `requireSession`/`requireLeagueRole` now centralize protected league access for league pages, realtime grants, push subscriptions, and onboarding session wrappers.
- 2026-06-12: Yahoo onboarding/import landed — Yahoo OAuth connect now persists encrypted credentials, discovers Yahoo Fantasy leagues, imports selected leagues through provider-generic sync/history dispatch, and runs fixture-backed by default without live Yahoo credentials.
- 2026-06-12: Yahoo provider landed — a server-only OAuth2 adapter now normalizes Yahoo Fantasy leagues, teams, members, rosters, scoreboards, historical season bundles, and transactions behind the `FantasyProvider` interface with fixture-backed coverage.
- 2026-06-12: Sleeper onboarding/import landed — public username/user-id connect now discovers Sleeper leagues, imports selected leagues through provider-generic current sync, and dispatches historical import jobs to Sleeper.
- 2026-06-12: Sleeper provider landed — a server-only no-auth adapter now normalizes public Sleeper leagues, teams, members, rosters, matchups, historical seasons, and transactions behind the `FantasyProvider` interface with fixture-backed coverage.
- 2026-06-12: Observability health/metrics landed; `/api/health` now checks DB, Redis, configured Supabase Realtime and Inngest reachability, exposes process-local API/job metrics, and app-owned API routes plus registered Inngest functions record status/duration without leaking secrets.
- 2026-06-12: PWA push notifications landed — league members can opt into Web Push from league home, subscriptions are RLS-scoped and membership-checked, and fresh blog posts plus finalized betting settlements now fan out through mock-by-default/real VAPID delivery.
- 2026-06-12: Client realtime subscriptions landed — league, feed, central news, and arena pages now use guarded Supabase grants to subscribe to typed broadcast channels and refresh server-rendered data on live updates.
- 2026-06-12: Realtime subscription grants landed — `/api/realtime/token` now issues membership-guarded, short-lived channel grants for league and central broadcasts without exposing Supabase service credentials.
- 2026-06-12: Central arena leaderboard landed — central arena seasons/standings now materialize league and individual paper-betting rankings from RLS-scoped bankroll ledgers, rebuild after finalized settlements, and render at `/arena`.
- 2026-06-12: Betting settlement landed — `game.final` now grades pending singles/parlays from results providers, handles push/void repricing/refunds, writes idempotent settlement audits, and credits bankroll ledgers exactly once.
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
