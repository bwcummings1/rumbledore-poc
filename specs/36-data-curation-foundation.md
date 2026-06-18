# Spec 36 — Data Curation Foundation (rigid substrate × general curation toolkit)

> Outcomes spec. WHAT a curatable, era-aware, ledgered data substrate produces — not the line-by-line HOW.
> Read `docs/NORTH-STAR.md` and `ORCHESTRATION.md §9` (the guiding architecture) first. `DESIGN.md` is a gate for
> any surface this exposes. Builds on `specs/06` (identity/stats/records), `specs/14` (foundation depth:
> identity/integrity/steward), `specs/03` (ingestion). Lives in `src/db/schema.ts`, `src/stats/*`,
> `src/ingestion/*`, `src/providers/espn/client.ts`. Canonical context: `docs/PROGRESS.md`.
> **Track A keystone** (`ORCHESTRATION.md`): unblocks `specs/37` (record-book lens UI) and `specs/41` (agent).
> The user-facing edit flow + public ledger VIEW + commissioner handoff are **`specs/38`**; the records lens UI is
> **`specs/37`**. This spec is the **schema + engine + services + ingestion** beneath both.

## Why this spec exists (the soul)
The North Star calls the data layer the **substrate** whose truth is **sacred** — the cast, the lore, the record
book, the arena all read it as fact. But "faithful" does **not** mean "frozen." Twenty years of provider
extraction is genuinely *messy*: doubled owner names ("John Smith, John Smith,"), stray spaces, the season a
12-team-split league never carried over, two-week championship "weeks" counted as one. And leagues have **eras** —
membership turns over, size goes 10→12, an OP slot becomes a second flex, scoring changes — so a naive all-time
average is a *lie* (the OP era simply scored more). The record book and the agent are only as true **and as
meaningful** as this layer lets them be.

So this spec makes the substrate **curatable without losing objectivity**. The key inversion (`ORCHESTRATION.md
§9`): **integrity comes from the ledger's transparency, not from freezing the data.** Data is editable; what's
immutable is the **append-only, league-visible audit trail**. And the design rule is **rigid shape, flexible
interpretation**: a rigid canonical substrate (everything true of *all* leagues) plus a **general curation
toolkit** (corrections, groupings, normalization) that any league uses to express *its own* situation. Nothing
league-specific is hard-coded — "eras" and "two-week games" are *uses* of general primitives, invisible to a clean
single-league user. **Graceful degradation is the acceptance test.**

## Outcomes (what "curatable & faithful" means)
1. **General corrections + one ledger.** Any *editable* field can be corrected; every edit is recorded
   (who/what/before→after/when/class) in an append-only, league-visible ledger. Dimensions are edited **once** and
   propagate via stable keys. The existing narrow logs unify into one timeline.
2. **Optional groupings (eras as one use).** A league may define named sets of seasons with a format/config
   descriptor; candidates are auto-detected and **commissioner-confirmed**. A league with none gets a clean
   cumulative experience — eras are never assumed.
3. **Multi-week normalization.** A matchup may span N scoring periods; **per-week for averages, full total for
   W/L**. The signal is persisted and the span is correctable via the ledger.
4. **Parameterized aggregation.** The engine computes records/aggregates filterable by **segment** (regular /
   playoff / both) × **grouping/era** × **scope**, with span normalization. (UI exposure is `specs/37`.)
5. **Format-awareness.** Each grouping declares its format; the engine interprets accordingly (traditional today;
   best-ball as a *declared* format that doesn't break the model). No hard-coded "traditional."
6. **Graceful degradation.** A pristine single-league, no-changes user sees a clean cumulative app; curation tools
   stay invisible until opened.

---

## A. The two layers
**Layer 1 — the rigid canonical substrate (EXISTS; extend, don't rebuild).** One consistent, universally
interpretable shape every feature reads: facts `weekly_statistics` / `season_statistics` / `fantasy_matchups`;
dimensions `persons` (`canonical_name`, `owner_history`), `team_seasons`, `identity_mappings`,
`league_season_settings` (incl. `regular_season_end/playoff_start/championship` boundaries). This layer encodes
what's true of **all** leagues — it never encodes anyone's specific quirks.

**Layer 2 — the general curation toolkit (NEW).** Three general, optional primitives layered on top:
**corrections** (§B), **groupings** (§C), **normalization** (§D). Records/agent read the **curated view**; they
never mutate facts blindly — every change flows through the ledger. The guardrail (`ORCHESTRATION.md §9`): a
**small, fixed** primitive set features consume uniformly — **not** an open-ended EAV "define anything" store.

## B. General corrections & the unified ledger
**The gap (grounded).** `data_correction_audit_log` only records `mark_reviewed`/`rerun_integrity`;
`identity_audit_log` only identity actions (`merge`/`split`/`remap`/`rename`). There is **no general "edit any
editable field → record it"** mechanism. That is the centerpiece here.

- **`league_data_edits` (NEW, append-only).** Columns: `id`, `league_id`, `actor_user_id`, `target_kind`
  (enum: `person | team_season | weekly_stat | matchup | season_setting | grouping`), `target_id`, `field`,
  `before_value` (jsonb), `after_value` (jsonb), `edit_class` (`cosmetic | substantive`), `reason`, `created_at`.
  RLS league-scoped (`pgPolicy` + hand-added `FORCE`, `AGENTS.md`); **append-only trigger** rejects direct
  UPDATE/DELETE but allows FK-maintenance (`pg_trigger_depth() > 1`, incl. `ON DELETE SET NULL`) per the
  `AGENTS.md` append-only rule.
- **The edit service (NEW).** A single league-scoped service that (1) applies the edit to the live editable field,
  (2) writes the `league_data_edits` row, (3) enqueues the *scoped* recompute (§E). The **editable surface** it
  governs: dimension fields (`persons.canonical_name`, `team_seasons.team_name`/`owner_names` — **edit once,
  propagate via keys**), fact fields (`weekly_statistics` points/result — rare, always `substantive`), structural
  fields (matchup `scoring_period_span`, season boundaries), and grouping config.
- **Dimensions edited once.** Fixing `persons.canonical_name` updates *every* week automatically because weekly
  rows reference `person_id`, not a name copy (the owner's "edit in one place" requirement). The UI (`specs/38`)
  organizes these as per-season "fixed variables" sections; the *mechanism* lives here.
- **Unified ledger read-model (NEW).** A merged, chronological, league-visible timeline over `league_data_edits` +
  `identity_audit_log` + `data_correction_audit_log`. `specs/38` renders it (a press-a-button drawer, not a page).
- **Stickiness / re-import safety.** A manually corrected field is **sticky**: a later sync/re-import never
  silently overwrites it — on conflict it **flags** (a `data_integrity_check`, "quarantine don't corrupt",
  `specs/14 §E`), preserving the ledger's meaning and the owner's fixes.

## C. Groupings (eras as one use) — optional, league-defined, format-aware
- **`league_season_groupings` (NEW).** Columns: `id`, `league_id`, `kind` (default `era`), `name`, `ordinal`,
  `config` (jsonb: `{ member_count_hint, roster_format, scoring_format, format_type: "traditional"|"best_ball"|…,
  notes }`), `status` (`proposed | confirmed`), `derived_from` (jsonb — which setting-changes suggested it),
  `confirmed_by_user_id`, `created_at`. Plus **`league_grouping_seasons` (NEW)** join (`grouping_id`, `season`) so
  a grouping is an **arbitrary set of seasons** — contiguous *or not* (the owner's "combine them the way I want").
  Both RLS-scoped + `FORCE`.
- **Optional + degrading.** Zero groupings → the engine defaults to cumulative; nothing prompts for an era. A
  grouping is a *lens*, never a precondition.
- **Auto-detection (NEW).** A function scans `league_season_settings` + `persons.owner_history` + roster/scoring
  across seasons and proposes candidate boundaries (member-set change, size change like 10→12, roster change like
  OP→flex, scoring change) as `status="proposed"`. The **commissioner confirms/adjusts** through the edit service
  (writes the grouping + a `league_data_edits` row). Not fully manual, not silently automatic.
- **Format-awareness.** `config.format_type` drives interpretation; `traditional` is the default, `best_ball` (and
  future formats) are *declared* and must not break the model — the engine must **not** assume traditional.
- **Generality.** `era` is the default `kind`/name, but the same primitive supports any league-defined grouping;
  most leagues will use zero or a few.

## D. Multi-week scoring periods (the two-week-final case)
**The gap (grounded).** Everything keys to a single `scoring_period`. ESPN's `matchupPeriodCount` is read
(`src/providers/espn/client.ts:117,497`) but only mapped to `regular_season_end_scoring_period`; the raw value is
dropped and there is **no per-matchup span** and **no normalization**. A two-week final therefore silently inflates
per-week scoring averages.

- **Persist the signal (NEW).** Add `matchup_period_count` to `league_season_settings`; add `scoring_period_span`
  (default `1`) + `period_start` to `fantasy_matchups`, carried onto `weekly_statistics`. A two-week final =
  `span=2`.
- **Ingestion (NEW).** Where the provider exposes per-matchup period ranges, populate `scoring_period_span` during
  normalization. Where it doesn't (old data), span is **correctable via the §B ledger** — multi-week is curatable,
  not provider-locked.
- **Normalization (NEW, locked default).** Per-week averages divide by `span` (or sum the constituent weeks, then
  per-week); **W/L, totals, and matchup counts use the full matchup**. So a two-week final counts as one game and
  doesn't poison `avg_points_for`. `span` is a **general attribute defaulting to 1** — not a special case.

## E. Parameterized aggregation (engine foundation; UI is `specs/37`)
Refactor the aggregation path — `engine.ts` (`buildSeasonStats`, `headToHeadRows`, `recordEvents`) and
`records-catalog.ts` (`buildRecordsCatalog`) — to accept a **filter**: `segment ∈ {regular, playoff, both}` (via
`is_playoff`/`is_championship`), `season_set` (a grouping/era or *all*), and `scope`, applying §D span
normalization throughout. Records become computable as **metric × segment × grouping × scope**; `specs/37` exposes
the lens controls. Keep the existing materialized outputs (`recordBookAllTimeStandings`, etc.) and add the
parameterized path (common slices materialized, arbitrary era/segment combos on demand). Recompute contract
(`specs/14 §C` style): a correction, grouping change, or span change enqueues only the **scoped** recompute via
`record-hooks`, never a needless full pass.

## F. Integrity, stickiness & graceful degradation
- **Extended integrity checks** (`data_integrity_check`, new `check_key`s): grouping/season-coverage sanity
  (groupings reference valid seasons; a season isn't in two same-`kind` groupings unless intended), span sanity
  (`span ≥ 1`; `span > 1` only where settings/ledger justify), ledger completeness (every `substantive` field edit
  has a `league_data_edits` row).
- **Stickiness** (§B): manual edits survive re-import; conflicts flag, never clobber.
- **Graceful degradation**: zero groupings ⇒ cumulative-only; the engine and `specs/37` must not *require* eras; a
  clean single-league user never sees curation UI unless they open it.

## G. EXISTS vs NEW (build ledger)
- **EXISTS — extend, do not rebuild:** the canonical substrate tables (§A); identity resolution
  (`resolveLeagueIdentities` + `fuzzy.ts`); steward `renamePerson`/`reassignTeamSeason`/`markIntegrityCheckReviewed`
  + `identity_audit_log` + `data_correction_audit_log`; reg/playoff flagging (`postseasonFlagsByMatchupId` from
  settings + finals); recompute hooks; `league_season_settings` boundaries; the `matchupPeriodCount` read.
- **NEW — design + build:** `league_data_edits` + the general edit service + the unified ledger read-model;
  `league_season_groupings` + `league_grouping_seasons` + auto-detection + the confirm flow; `matchup_period_count`
  persistence + `scoring_period_span`/`period_start` + ingestion + normalization; the parameterized aggregation
  filter; the extended integrity checks; stickiness/re-import reconciliation.

## H. Acceptance criteria (testable — fixture-backed)
Run offline against the **old-league JSON fixtures** (`/home/ubuntu/espn-api-old-2024/scripts-output/`, ~2011–2023)
and the 95050 fixture; no live calls in CI.
1. **General edit + propagation.** Editing `persons.canonical_name` writes one `league_data_edits` row
   (before→after, actor, class), updates every weekly row that keys on that `person_id`, and triggers a scoped
   recompute — one edit, everywhere.
2. **Append-only + isolation.** Direct UPDATE/DELETE on `league_data_edits` is rejected (FK-maintenance at
   `depth>1` allowed); RLS returns zero league-B rows for a league-A reader (canary extends).
3. **Unified ledger.** The read-model merges `league_data_edits` + `identity_audit_log` +
   `data_correction_audit_log` into one chronological per-league timeline.
4. **Groupings optional + degrade.** A league with zero groupings computes cumulative records unchanged; no code
   path assumes an era exists.
5. **Auto-detect proposes eras.** Over the old-league fixture, auto-detection proposes boundaries matching the
   known history (10-person → 10-minus-one → 12-team; OP→flex) as `proposed`; a commissioner confirm writes the
   grouping + a ledger row.
6. **Arbitrary season sets.** A grouping containing non-contiguous seasons aggregates over exactly that set.
7. **Multi-week span.** A `span=2` matchup contributes full points to W/L + totals but per-week averages divide by
   span; `matchup_period_count` persists; an old-data span set via the ledger normalizes identically.
8. **Format-awareness.** A grouping declaring `format_type="best_ball"` is interpreted without a traditional-only
   assumption breaking; `traditional` default is unchanged.
9. **Parameterized aggregation.** The engine returns correct slices for `segment × grouping × scope` — e.g. "most
   playoff points in era 2" equals a hand-computed fixture number.
10. **Fixture oracle.** Loading the old-league history + applying the known two-week span + confirming the known
    eras **reproduces the owner's hand-curated record-book numbers** (the strongest correctness check).
11. **Stickiness.** A manual field edit survives a re-import; an overwriting re-import instead raises a
    `data_integrity_check` conflict — never a silent clobber.
12. **Recompute scoping.** A correction/grouping/span change triggers only the affected scoped recompute (asserted
    via the stats log), not a full pass.
13. **Integrity checks fire.** Grouping/season-coverage, span-sanity, and ledger-completeness violations each
    produce a `data_integrity_check` row.
14. **Isolation (new tables).** `league_data_edits`, `league_season_groupings`, `league_grouping_seasons` are all
    RLS-scoped; the `specs/02` canary extends to them.

### Needs the later human pass (not gate-verifiable)
Auto-detection sensitivity (what magnitude of change proposes a boundary), per-format normalization defaults, and
the `cosmetic`/`substantive` cutoffs are tuned with the owner against real leagues.

## Dependencies / blocked-by
- **Builds on** `specs/06` (stats/records), `specs/14` (foundation depth: identity/integrity/steward), `specs/03`
  (ingestion). **Needs** `specs/02` (Drizzle/RLS, Inngest recompute, Better Auth roles).
- **Unblocks** `specs/37` (record-book lens UI) and `specs/41` (agent). `specs/38` surfaces the edit flow + public
  ledger + commissioner handoff on top of this substrate.

## Non-goals
- **No** user-facing edit UI or public ledger VIEW here (→ `specs/38`); **no** records lens UI (→ `specs/37`). This
  spec is schema + engine + services + ingestion.
- **No** fantasy-points recomputation (consume provider scores as truth, `specs/06`/`14`) — normalization adjusts
  averaging windows, not scores.
- **No** new provider, no cross-sport.
- **No** open-ended EAV/"define-anything" metadata — a small fixed primitive set (corrections, groupings,
  normalization) consumed uniformly (`ORCHESTRATION.md §9`).
