# Data Foundation — Implementation Plan

> **Source of truth for design:** `docs/DATA-FOUNDATION-DESIGN.md`. This doc is the **execution plan** — the
> sequenced, detailed tasks and the consistent per-task posture. Read the design doc first, then your task.
>
> **Run model:** one **fresh agent session per task** (no carried context — context comes from the *up-to-date docs*
> + git state + the task spec). Agents: **codex2 and codex3 only**, both `gpt-5.5` @ `xhigh` + `service_tier=fast`
> (confirmed). Orchestrator (Claude) launches each task, monitors ~every 10 min, merges to `main` after verifying,
> and pauses/adjusts on any issue.

---

## A. Locked defaults (open decisions — veto any before T4)
These are my recommended answers to the design doc's §9 so the build isn't blocked. Flag any you disagree with;
they don't affect T1–T3 (substrate), so the build can start while you decide the rest.
1. **Record-book display rule** → **most-recent team name + the person's real name.** (T9)
2. **Finalized trigger** → a season is **live** while in-progress and becomes **curate-and-push** when the owner
   marks it finalized (explicit action), with auto-suggest when ESPN reports the season complete. (T8)
3. **Push granularity** → **per-season push** (you can push 2012 without pushing 2011); a "push all" convenience
   wraps it. (T8)
4. **Save retention** → **keep all checkpoints** (cheap as ledger markers). (T8)
5. **Substrate B source** → **mock/$0 for now**; provider wiring deferred to T12 design. 
6. **First slice** → **one-season vertical slice first** (2012 — it has the 2-week-playoff span *and* name variance),
   prove data→edit→save→push→record end-to-end, then confirm it scales to all 16. (verify gate after T9)

---

## B. Orchestration model
- **One fresh worktree per task**, branched off the *current* `main`: `git worktree add /home/ubuntu/rmbl-T<n> -b ws/t<n>-<slug> main`, with `.env.local` symlinked in (ESPN creds + DB). One fresh `codex exec` session runs the task to completion.
- **Account assignment:** alternate cx2 / cx3 across tasks to balance usage. Run tasks **sequentially** (the foundation is dependency-chained); only parallelize a pair when they are truly file-disjoint + dependency-free (noted per task). cx2 = `CODEX_HOME=/home/ubuntu/.codex-agents/cx2`; cx3 = `CODEX_HOME=/home/ubuntu/.codex-agents/cx3`.
- **Merge discipline:** the agent commits + pushes its `ws/t<n>-*` branch and writes a done marker. The **orchestrator verifies, then merges to `main`** (clear stale `.next/dev` first), pushes, and removes the worktree. Agents never touch `main`.
- **Monitoring:** orchestrator ticks ~every 10 min (ScheduleWakeup) — liveness, log progress, marker checks. **On any issue (repeated error, wrong direction, gate stuck, cramming/pattern violation): PAUSE** (`touch .orchestration/STOP`), diagnose, adjust the task spec, and resume or relaunch a fresh session.
- **Verification before merge is non-negotiable:** data tasks re-import the real league and check the summary; UI tasks run the screenshot harness and the orchestrator *looks at* the PNGs.

---

## C. Per-task protocol (Definition of Done — EVERY task follows this)
A task is not "done" until all seven hold:
1. **Re-orient** — read `docs/DATA-FOUNDATION-DESIGN.md`, this plan, `docs/PROGRESS.md`, `AGENTS.md`, and the
   **previous task's handoff note** (`.orchestration/handoff/T<n-1>.md`). Read the *existing patterns* the task
   references before writing anything (esp. UI: `front-view.tsx` `PublicationMasthead`/`TabLinks`, `league-feed-view.tsx`).
2. **Implement** the task scope — additive; reuse/extend existing components and modules, never fork parallel ones.
3. **Write ALL the tests** — unit + integration for new logic; update tests for changed behavior; UI gets
   component/interaction tests. Never skip/weaken/`.skip` a test to go green.
4. **All gates green** (`PATH=/usr/bin:$PATH`): `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, plus
   `pnpm perf:pwa`, `ubs <changed files>`, `pnpm secret-scan`. Token-contract + AUSPEX fidelity for UI.
5. **Functional verification** (prove it works, not just that it compiles):
   - *Data/ingestion tasks:* re-run the real-league import (`scripts/import-real-league.ts`) on a clean DB and
     confirm the relevant part of `.orchestration/import-summary.md` (e.g. settings present, names real, integrity
     green, 325 corrected). 
   - *UI tasks:* run the screenshot harness; the artifact is the PNGs for the orchestrator to review.
6. **Update the docs so the NEXT agent has full context** (the handoff is via docs, since sessions are fresh):
   - `docs/PROGRESS.md` — current state, what this task changed, what now exists.
   - This plan — mark the task ✅ and note any scope deviation.
   - Any architecture/design doc that this task made stale (e.g. new tables/columns → update the design doc's
     EXISTS/NEW map + a short data-model note).
   - Write `.orchestration/handoff/T<n>.md` — a tight handoff: *what I built, where it lives, key decisions,
     gotchas, what the next task needs to know.*
7. **Commit + push** the `ws/t<n>-*` branch (small, frequent commits; conventional messages) and `touch
   /home/ubuntu/rmbl-T<n>/.task-done` with a one-line status. If blocked, `.task-blocked` with the exact reason.

> The doc-freshness rule (steps 1 + 6) is the backbone of the fresh-session model: each agent leaves the project
> *more* navigable and fully-described than it found it, so the next agent starts with complete context and makes
> as few context-driven mistakes as possible.

---

## D. Tasks

### Phase 1 — Substrate (sequential; ingestion-heavy; verify on the real league)

**T1 — Per-season settings persistence + raise import cap**
- *Goal:* persist ESPN `mSettings` per season (scheduleSettings: matchupPeriodCount, regularSeason length,
  `playoffMatchupPeriodLength`, playoffTeamCount; rosterSettings.lineupSlotCounts; scoringSettings; acquisition type)
  as first-class data; raise `importLeagueHistory`'s 10-season clamp to cover a full 16+-year league in one pass.
- *Files:* `src/providers/espn/client.ts`, `src/ingestion/historical-import.ts`, `src/ingestion/current-league.ts`,
  a new migration + schema (`league_season_settings` or columns on the season row), `src/db/schema*`.
- *Tests:* settings parsed + persisted per season; cap handles 16 seasons; provider normalization of each setting group.
- *Verify:* re-import 95050 clean → summary shows settings rows for all 16 seasons (the era signatures we pulled).
- *Docs:* design-doc EXISTS/NEW map + data-model note; PROGRESS; handoff T1.
- *T1 completion note (2026-06-22):* ✅ Completed on `ws/t1-settings` by NavyHill. The table already existed, so T1
  extended `league_season_settings` instead of creating a parallel table. The explicit season-list clamp now allows
  16 seasons in one historical import while keeping a 25-season hard bound. Verification artifact:
  `.orchestration/import-summary.md`.

**T2 — Names ingestion fix + clean-DB isolation** (depends: T1)
- *Goal:* persons get **real** names (ESPN returns `displayName`/`firstName`/`lastName` for current *and* history);
  fix the current-member sync that wrote 0/16; ensure historical persons resolve to real identities; **isolate the
  real league from the e2e/screenshot "Fixture Manager NN" fixture data** so the dev DB isn't contaminated.
- *Files:* `src/ingestion/current-league.ts` (member→person), `src/stats/engine.ts` (canonical_name source),
  identity resolution; a clean-DB seeding/reset path for verification.
- *Tests:* member names persist to `persons.canonical_name`; identity resolution across seasons uses real names;
  no fixture bleed.
- *Verify:* clean re-import → summary "Persons" lists **real names**, not "Fixture Manager NN".
- *Docs:* PROGRESS; handoff T2 (note the fixture-isolation approach).

**T3 — Byes + multi-week span** (depends: T2)
- *Goal:* (a) capture a **bye** as a one-sided fact — score counts toward PF/scoring records, **no W/L/T by default**;
  make `schedule_coverage` **bye-aware** (byes are expected, not gaps), clearing the 13 false failures that block the
  record book. (b) **Multi-week span**: auto-derive `scoring_period_span` from `playoffMatchupPeriodLength` (=2 for
  2011–2012) so the "325" is recognized as a 2-week total, not a single-week record.
- *Files:* `src/ingestion/*` (bye representation, span derivation from settings), `src/stats/*` (coverage check,
  span-aware aggregation), migration if needed.
- *Tests:* bye scored, no W/L; coverage passes with byes; span=2 applied to 2011–2012 playoffs; single-week record
  excludes 2-week totals (regression on the 325 case).
- *Verify:* clean re-import → integrity `schedule_coverage` all pass; record book unblocked; 325 no longer a
  single-week record (or correctly flagged span=2).
- *Docs:* PROGRESS; design-doc fixes §7 ✅; handoff T3. **(Substrate checkpoint: orchestrator reviews the full clean
  summary with the owner before Phase 2.)**

### Phase 2 — Data layer + the pipeline (verify one-season-first on 2012)

**T4 — Curated-state data model** (depends: T3; data/API only, no UI)
- *Goal:* the schema + service layer for **draft → saved checkpoint → pushed snapshot**, and the **edit primitive with
  scope** (this-year vs all-years), built on `league_data_edits`. Per-season push (default #3). Keep-all checkpoints (#4).
- *Files:* migration (checkpoint/snapshot tables or markers), `src/curation/*` or `src/stats/*` services, the curation API.
- *Tests:* edit with each scope; save creates a restorable checkpoint; push promotes a per-season snapshot; ledger rows.

**T5 — Data Book (read view)** (depends: T4) — **separate nav destination**
- *Goal:* the Data Book page showing the 3 grains (People · per-season Settings+summary · week-by-week facts) as
  tables, **one season at a time via a year dropdown** (`select.tsx`); nav = league-feed `TabLinks`-at-bottom-of-top-card
  pattern (reuse `PublicationMasthead`/`TabLinks`). Read-only this task. Responsive (3 viewports). §4 posture is law.
- *Tests + screenshots* (desktop/tablet/mobile). Orchestrator reviews PNGs.

**T6 — Editable cells + edit-scope UI + ledger writes** (depends: T5)
- *Goal:* make cells editable (permissioned); the **scope prompt** on dimension edits (smart-defaulted); every edit →
  `league_data_edits` with before/after. No record-book effect yet (saved ≠ pushed).
- *Tests + screenshots.*

**T7 — Edit Ledger / Change Log** (depends: T6) — **separate nav destination**
- *Goal:* a chronological feed of saves + pushes (single-line entries); click → **red/green before/after diff**.
- *Tests + screenshots.*

**T8 — Save + Push state machine** (depends: T7)
- *Goal:* the gate — **Save** (checkpoint) and **Push** (per-season snapshot the record book reads); finalized-season
  semantics (#2); live current season vs curated history.
- *Tests* (state transitions; saved-not-pushed invisibility to records).

**T9 — Record Book re-point + display rule** (depends: T8) — the load-bearing boundary
- *Goal:* re-point `recomputeLeagueStatistics`/the record book to compute from the **pushed snapshot only** (read-only
  projection); **display rule** = most-recent team name + real name (#1); lens demoted to a view over data-defined eras.
- *Tests + screenshots* + **one-season vertical-slice verify**: edit→save→push 2012 → record book reflects exactly the
  pushed state; confirm it then scales to all 16. **(Orchestrator + owner review before Phase 3.)**

### Phase 3 — Expansion (after the pipeline is proven)
**T10 — Era/span auto-proposal from settings** (confirm-in-Data UI). 
**T11 — Records catalog expansion** — categories (H2H / playoff / regular / achievements / **worst**); slot in the
owner's recovered legacy catalog when available. 
**T12 — General fantasy-stats substrate (B)** — league-agnostic NFL stats ingest (mock/$0), provenance + integrity,
consumed by AI writers + league enrichment. *Can parallelize with late Phase 2 (file-disjoint).*

---

## E. Status tracker
| Task | Agent | Status |
|---|---|---|
| T1 settings persistence + cap | NavyHill | ✅ complete |
| T2 names + clean-DB | — | ☐ |
| T3 byes + span | — | ☐ |
| T4 curated-state model | — | ☐ |
| T5 Data Book (read) | — | ☐ |
| T6 editable cells + scope | — | ☐ |
| T7 Edit Ledger | — | ☐ |
| T8 save/push state machine | — | ☐ |
| T9 record-book re-point | — | ☐ |
| T10 era auto-proposal | — | ☐ |
| T11 records catalog | — | ☐ |
| T12 general-stats substrate | — | ☐ |
