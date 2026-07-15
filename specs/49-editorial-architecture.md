# Spec 49 — Editorial Architecture (league-story + central stat-hub)

> Buildable spec. Consolidates the owner working-session decisions (2026-07-14/15) and the market research
> into a phased build. Grounding docs (read for the WHY): `docs/EDITORIAL-ARCHITECTURE-PROPOSAL.md`
> (decisions + rationale), `docs/EDITORIAL-CADENCE-REFERENCE-2026-07-15.md` (how the pros publish a week),
> `.orchestration/analysis/EDITORIAL-INVENTORY-2026-07-14.md` (what's already built). Memory:
> `editorial-architecture-decisions`. **The central lineup (§5) is a DRAFT pending owner review — DO NOT
> build it until the owner signs off (Phase 3 is held).** §1–§4 and the Phase 0/1/2 plan are locked.

## 1. Locked architecture — one shared substrate, three consumers

```
        ┌──────────── SHARED DATA SUBSTRATE ────────────┐
        │  real-time NFL news · stats · projections · odds │
        │  (built: substrate-B general-stats + news        │
        │   ingestion — MOCK today; real source owner-gated)│
        └───────────────────────┬────────────────────────┘
          ┌─────────────────────┼─────────────────────┐
    CENTRAL · News        CENTRAL · Fantasy         LEAGUE hub (per league)
   general NFL, no lens   NFL via fantasy lens      localizes central data
   objective/utility      stat-driven rec's         + pure-league narrative
```

- **Register split (LOCKED):** central = objective/utility (stat-driven, thin personality layer); league =
  narrative/entertaining, written the way football is written but focused on the LEAGUE's people/rivalries/
  history. Central is NFL-as-a-whole with fantasy as a lens (ESPN model), split into a **News branch**
  (general, league- & fantasy-agnostic) and a **Fantasy branch** (NFL through the fantasy lens).
- **The only cross-tier bridge:** central content referenced into a league feed when relevant (built:
  `league_feed_reference` tailoring). Injuries are dual-filed (event = News; fantasy implication = Fantasy).
  Nothing flows league→central or league→league.
- **League columns consume central data (localization layer):** blended league columns (Tale of the Tape,
  Fantasy Friday, Predictions) pull central projections/odds/win-% and localize them; pure-league columns
  (Power Rankings, Waiver Summary) do not. Build-order consequence: blended league columns are structurally
  buildable on MOCK stat data now, truthful only once the real source lands (Phase 4).

## 2. Invariants (binding on every track)
- **Structure fixed, backends pluggable:** content amount / formats / cadence are the STABLE contract; the
  models / APIs / stats-source / image tools routed in are a SWAPPABLE layer behind an interface (mirror the
  existing provider-abstraction + model-routing + mock/real unions). Never entangle a format/cadence rule
  with a specific model/tool. Column NAMES are a one-place config/label layer (owner will rename later).
- **Cost is a model/tool-selection concern, NOT a content-trimming one.** Do not reduce content quality or
  volume for cost. (Owner owns the model/economics research.)
- **Curation is OWNER-CENTRALIZED initially:** league-facing generation controls (persona tone editor,
  regenerate) are gated to owner/platform-admin — NOT exposed per-league. Retract/correct default to
  owner/platform-admin too under "prove it first." League-appointee tone stewarding is an explicit LATER phase.
- **$0/mock:** never flip a `MOCK_*` flag; never `pnpm db:generate`; migrations hand-written + journaled;
  new league tables get `pgPolicy` + FORCE RLS + canary rows same round; shared dev DB read-only.

## 3. Code-truth baseline (do NOT relitigate — it's built)
11 typed+validated content types (`src/ai/content-types.ts`); the NFL-phase-aware cadence engine incl.
offseason behavior (`src/jobs/content-planning.ts` + `src/sports/nfl-calendar.ts`); the 3-register page model
(League Home dashboard / The {League} Press feed / Central News hub); front-tiering + Story Card + article
page (`src/news/front.ts`, `src/components/publication/`); lifecycle/ledger/retract/regenerate/correct
(`src/content/editorial.ts`); reactions + roast-consent; the tailoring bridge (`league_feed_reference`).

## 4. LEAGUE tier — column lineup (LOCKED; names are owner placeholders)

In-season weekly named columns on a day cadence (entity = the league's people). Built types map per the
inventory; a few need new/extended formats.

| Column (placeholder) | Day | Content | Built type | New/extend |
|---|---|---|---|---|
| **The Wrap** | Mon | Sunday-games recap; which league matchups do/don't matter into MNF | weekly_recap | extend (NFL-game framing) |
| **Power Rankings + Week (#) Summary** | Tue | after Sun+Mon — rank managers + week summary | power_rankings + weekly_recap | mostly built |
| **Waiver Summary** | Wed | leaguemate roster changes, FAB budgets | transaction_reaction | extend (FAB/budget) |
| **Tale of the Tape** | Thu | matchups + projections + odds/% + grudge history + implications (rankings/playoffs/H2H) | matchup_preview | extend (consumes central data) |
| **Fantasy Friday** | Fri | TNF summaries + odds/% changes + league historical flashback | matchup_preview + new | new/extend |
| **Predictions** | Sun | matchup + end-score + player-performance predictions (Berman-style) | matchup_preview | new (prediction format) |

Reactive/offseason layer stays underneath: Record Book Watch (record.broken), Rivalry Desk (signal), The Long
View (offseason retrospectives / league evergreen = its own history). Cadence ~6 columns/week + reactive, well
under the built 25/week cap. The built cron day-mapping differs (built: Wrap Tue) → reschedule + reassign in
Phase 2.

## 5. CENTRAL tier — lineup **[DRAFT — OWNER REVIEW PENDING; do not build in Phase 1/2]**

Proposed named columns per branch (placeholders; formats stat-driven, model-output-labeled, thin personality):

**News branch (general NFL):**
- *Breaking / The Wire* — reactive "news + so-what" blurbs (injury events, transactions, signings); rolling.
- *The Rundown* — a regular NFL news digest (daily/weekday in-season; monotone offseason news-mode).

**Fantasy branch (NFL via fantasy lens):**
- *Matchups* — weekly stat-driven matchup outlooks (Wed–Thu).
- *Rankings & Projections* — model output, LABELED computed (weekly refresh, Tue–Wed).
- *Waiver Wire* — data-thresholded adds (rostered-% <50, snap/target trends) (Tue, post-waiver).
- *Start/Sit* — matchup-based leans (Thu–Sun).
- *Injuries (fantasy implication)* — the Fantasy-branch side of the dual-filed injury.

**Offseason (news-relevance mode):** NFL offseason news (contracts/holdouts/camp) + dynasty/draft-prep
rankings + way-too-early; monthly/drip, ramps into camp previews late July. Slower, not dark.

> OPEN for owner: the central column names + exact formats, the depth of the offseason menu, the News-vs-
> Fantasy split of injuries, and whether any column is cut/added. This section is the morning's discussion.

## 6. Two foundational gaps (Phase 1 — locked, buildable now)
- **Gap A — no lead-story signal on league content.** Front prominence uses `editorialImportance`, set only on
  central news, never on AI league blog (`src/news/front.ts` + inventory §3). Add a signal the cadence engine/
  cast sets per league piece (upset/blowout/record → higher), so the League Press can choose its lead.
- **Gap B — central section taxonomy incoherent** (7 built vs 4 spec'd) AND two disagreeing section-assignment
  paths (template hardcode vs persona-resolver, inventory §1). Reconcile to the two-branch News/Fantasy model
  (§1); make one section-assignment path authoritative.
- **Gap C — curation gating** (invariant §2): gate the league-facing persona tone editor + regenerate (+
  retract/correct) to owner/platform-admin via `requirePlatformAdmin()`-style checks; not exposed per-league.

## 7. Phase plan
- **Phase 0 (planner):** this spec + the central lineup draft. DONE when written.
- **Phase 1 (fleet · mock · $0):** Gaps A + B + C. Prereq for everything.
- **Phase 2 (fleet · mock · $0):** the league column lineup (§4) — reschedule cadence to the roster, build the
  new/extended formats, wire columns as named identities (config-labeled). Blended columns run on mock stat
  inputs. After Phase 1 merges.
- **Phase 3 (HELD — owner review of §5 first):** central typed templates + first central generation path +
  two-branch structure + central lineup + offseason news-mode. Greenfield; biggest chunk; adversarial review.
- **Phase 4 (OWNER-GATED):** wire real stats/projections source; model selection; Browserbase live smoke; one
  measured week → COGS → pricing.

## 8. Acceptance (per phase)
- **P1:** a league piece can be marked/derived as the week's lead and wins the Press front over a newer routine
  piece; central sections render the two-branch taxonomy from ONE authoritative assignment path; tone-editor/
  regenerate/retract routes reject non-owner/platform-admin callers (regression tests). Full gates green.
- **P2:** the 6 columns generate on their scheduled days against fixtures with the correct structured shapes;
  renaming a column is a one-line config change; blended columns consume the (mock) central stat/odds data;
  offseason produces the league evergreen menu; no `MOCK_*`/`db:generate` touched. Full gates + e2e green.
- **P3/P4:** deferred (held).

## Non-goals
Tool-platform features (DFS optimizers, ADP tools, trade analyzers, mock-draft lobbies); expert-panel/
consensus aggregation; the proprietary-analytics arms race; per-league content-generation controls (LATER);
real paid-provider activation (Phase 4 / owner).
