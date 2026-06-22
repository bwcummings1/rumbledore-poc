# Data Foundation — Design Doc

> **Status:** DRAFT for owner review. Not yet decomposed into specs. Supersedes the implicit
> "records page = data" model in the current build.
>
> **One-line thesis:** A *rigid canonical substrate* that receives data, with *consumers* that read from it.
> The substrate is the point of truth; consumers (the record book, the AI writers) are read-only projections.
> Integrity comes from the **transparency of the edit ledger**, not from freezing the data.

---

## 0. Why this shape (the posture)

Everything we've discussed reduces to one pattern, applied twice:

```
        INGEST ──▶  SUBSTRATE (rigid shape, provenance, integrity)  ──▶  CONSUMERS (read-only)
```

We need it for **two** distinct systems, which is the whole reason to build the framework once and reuse it:

| | **A. League data** | **B. General fantasy stats** |
|---|---|---|
| Content | Per-league history: managers, teams, weekly scores, matchups, settings | League-agnostic NFL: players, team stats, weekly box scores, schedules |
| Editable? | **Yes** — curated by a permissioned user, ledgered | **No** — background only, never user-edited |
| User-visible? | Yes — the **Data page** | No — internal substrate |
| Consumers | The **Record Book** (on push) | The **AI writers / bloggers / News**, and enrichment of A |
| Trust model | Transparency: every edit logged + diffable | Provenance: source + fetch time, immutable facts |

Both obey the same substrate discipline (rigid shape, provenance, integrity checks, graceful degradation). They
differ only in whether a human curates them. Build the discipline once; instantiate it twice.

**Graceful degradation is the acceptance test** (unchanged): a clean single-format league sees a plain Data page
and a cumulative record book — no eras, no segments, nothing extra. Complexity appears only when the data needs it.

---

## 1. The core separation: Data ≠ Record Book

The current build conflated these. They are now distinct layers with an explicit gate between them.

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │ DATA LAYER  (objective substrate — editable, curated, versioned)      │
  │   • per-season tables of facts + the settings that applied that year  │
  │   • editable cells (permissioned), every change auto-logged           │
  │   • eras / segments / spans / bye-rules DEFINED here                  │
  └───────────────┬───────────────────────────────────────────────────────┘
                  │  SAVE  (checkpoint — not yet visible in the record book)
                  │  PUSH  (snapshot — what the record book reads)
                  ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ RECORD BOOK  (read-only projection — "scripts over the pushed data")  │
  │   • computes records from the pushed snapshot ONLY                    │
  │   • RECEIVES the era/segment definitions; never defines them          │
  │   • collapses per-year variance to ONE display per person             │
  │   • nothing is editable here (prevents divergence from the data)      │
  └─────────────────────────────────────────────────────────────────────┘
```

**Rule:** anything you can change must be changed in the Data layer. The record book only ever *reflects* a pushed
snapshot. This makes "the data in the record book disagrees with the data" structurally impossible.

---

## 2. The League Data layer (A)

### 2.1 Grains (the data model)

Three grains, matching the **dimension-vs-fact** distinction:

1. **People / dimensions** — the participants. A person has a stable **real name** and a **per-season team name**
   (which legitimately varies — some managers rename every year). EXISTS: `persons`, `identity_mapping`.
   - **Edit scope (NEW, key primitive):** editing a dimension prompts, after confirm, **"apply to all years"**
     or **"this year only."** Smart-defaulted by field — real name → *all years*; team name → *this year only* —
     always overridable. This preserves real variance while letting the real name stay consistent.

2. **Per-season settings + summary** — one row per season: the **settings that applied that year**
   (size, playoff team count, playoff matchup length, roster/lineup slots, scoring, acquisition type) plus season
   totals. EXISTS: `league_season_settings` now persists ESPN `mSettings` schedule/roster/scoring/acquisition
   fields per season. This is where the user **confirms the auto-proposed era boundaries, the 2-week-playoff span,
   and the bye rule**.

3. **Week-by-week / matchup facts** — the granular cells: each team's weekly score, opponent, result, span.
   EXISTS: weekly stats, matchups, `scoring_period_span`. Editable per cell.

### 2.2 Editing model
- **Editable cells** in a table that looks like the system (AUSPEX), not literally Excel — columns/rows you can scan
  per season, with the editable values inline.
- **Permissioned:** EXISTS — data-steward / commissioner role + `/api/curation/*`.
- **Every edit is logged** to the append-only ledger (EXISTS: `league_data_edits`) with before/after, who, when.
- **Edit scope** prompt (§2.1) applies to dimension edits.

### 2.3 State machine (NEW — the heart of this doc)
```
  DRAFT  ──save──▶  SAVED CHECKPOINT  ──push──▶  PUSHED SNAPSHOT
   (working edits)    (restorable; not yet         (the record book
                       in the record book)           reads this)
```
- **SAVE = a working checkpoint.** Persists the current draft of curated data; restorable later; **NOT visible to the
  record book**. (Mental model: committing to a working branch — "I changed things but I'm not done / stepping away
  without losing work.") **Keep ALL checkpoints** (cheap; they're ledger-anchored markers).
- **PUSH = promote to the canonical version the record book reads.** (Mental model: merge to main — "this is correct
  and complete now.") **Saved ≠ pushed**: edits never reach the record book until pushed.
- **Per-season push, with a hard INVARIANT — "all data is always accounted for":** pushing one season promotes THAT
  season's curated state into the canonical snapshot **without dropping/orphaning any other season**. The canonical
  pushed state = the **composition of every season's latest-pushed version**. Pushing 2012 must leave 2011's (and
  every other season's) pushed contribution intact; no season can ever fall out of the composed snapshot. A
  "push all" convenience promotes every season's current saved state at once.
- **Live vs. curated hybrid:** the **in-progress season streams in live** (auto-updates); **finalized seasons are
  curate-and-push** (locked until you push). Agreed posture.

### 2.4 Change feed + diff (NEW — kept deliberately light)
- A **chronological feed** of saves and pushes — each entry a single line (like a notification).
- **Click an entry → see what changed**: the new value vs. the prior value, rendered **red/green (before/after)**.
- Not git branching — just an auditable, clickable history. Built on `league_data_edits` + checkpoint markers.

### 2.5 Eras / segments are DEFINED here
- The Data layer is where you define timelines: era boundaries, regular-vs-playoff segmentation, multi-week spans,
  bye handling. EXISTS: `league_season_groupings`.
- **Auto-proposed from settings, confirmed by you.** We can read era boundaries straight from `mSettings`
  (team-count change, playoff length, roster OP→FLEX, reg-season week count) and *propose* them; you confirm/adjust
  in the Data page. Smart, not presumptuous.

---

## 3. The Record Book (read-only projection)

- **Reads the pushed snapshot only.** Pure projection — "scripts run on the stored, curated data, organized nicely."
  STRUCTURAL CHANGE: re-point the records engine (EXISTS: `recomputeLeagueStatistics`) to compute from the **pushed
  snapshot**, not live facts. *(This is the single most important boundary to get right.)*
- **Receives** era/segment definitions from the Data layer; never defines them. The lens (segment × era pills,
  EXISTS) stays — demoted to a pure **view** control over data-defined eras.
- **Display rule (NEW):** collapses per-year variance to **one representation per person** — default **most-recent
  team name + the person's real name** — so a serial-renamer shows as one entry, not ten.
- **Records catalog:** EXISTS in basic form. To expand into categories — **H2H / playoff / regular-season /
  achievements / "worst" records** — and slot the owner's recovered legacy catalog in when found.

---

## 4. UI/UX & navigation posture (cross-cutting — non-negotiable)

> The same design posture as the current app applies to every surface here. Agents do **not** get to cram features
> onto one page or invent layouts. This has been the single most common failure mode (the mid-page `SectionTabs`
> card, the arena "cluster") and is called out explicitly so it can't recur.

**4.1 Features are separate destinations, not one crammed page.** Each of these is its **own** navigable feature,
reached from the league nav — never stacked onto a single screen:
- **Data Book** — the editable per-season data tables (substrate A).
- **Record Book** — the read-only computed records (the projection).
- **Edit Ledger / Change Log** — the chronological feed of saved + pushed edits with red/green diffs.

Keeping them as distinct destinations *is* what stops the data, the records, and the audit trail from blurring in
the UI the way they blurred in the model (§1).

**4.2 Within a feature, use the established pattern — never a mid-page button-card.** Sub-sections use the
**league-feed pattern**: a top header card with the section nav as `TabLinks` **at the bottom of that card**
(`src/components/publication/front-view.tsx` → `PublicationMasthead`/`TabLinks`; `league-feed-view.tsx`). Reuse those
components. Do **not** reintroduce a `SectionTabs`-style mid-page panel, and do **not** cluster unrelated features on
one screen.

**4.3 Year switching in the Data Book is a dropdown.** With many seasons stored, the Data Book shows **one season's
table at a time**, switched via a **year dropdown** (reuse `src/components/ui/select.tsx`) — not every year dumped on
one page. Adapts to volume: a 1–2 season league can show inline; a 16-season league uses the dropdown.

**4.4 Responsive across all sizes.** Every surface works at desktop / tablet / mobile (the screenshot harness's three
viewports). Dense data tables get responsive treatment (horizontal scroll / priority columns on mobile), never a
broken or overflowing grid.

**4.5 Design-system fidelity.** AUSPEX tokens, Michroma headings (`heading-auspex`), Saira display, panel/cell styles,
the token-contract test. Reuse existing components; **extend** them rather than forking parallel ones.

**4.6 Hard rule for agents (enforces the above).** Every UI agent MUST (a) read the referenced existing patterns
before building, (b) reuse the existing components, and (c) have its **rendered output reviewed via screenshots
before merge**. No context-free building, no cramming. The orchestrator enforces this each round.

---

## 5. The General Fantasy-Stats substrate (B)

- League-agnostic NFL data (players, team stats, weekly box scores, schedules). **Ingested, never user-edited.**
- Same substrate discipline: rigid shape, **provenance** (source + fetch time), integrity checks, graceful
  degradation — but **no curation UI** and **no push gate** (it's background).
- **Consumers:** the AI writers / bloggers / News pipeline (their factual grounding), and **enrichment** of the
  league data (e.g., attaching real player names/positions to roster facts).
- Mostly NEW. Designed alongside A so they share the substrate primitives (ingest contracts, provenance, integrity)
  rather than diverging.

---

## 6. Mapping to what exists

| Piece | Status |
|---|---|
| Edit ledger (`league_data_edits`) | **EXISTS** — reuse as the change-feed backbone |
| Eras/groupings (`league_season_groupings`) | **EXISTS** — becomes "defined in Data layer" |
| Integrity checks (`data_integrity_check`) | **EXISTS** — surface in the Data page as flags to resolve |
| Records engine (`recomputeLeagueStatistics`) + catalog + lens | **EXISTS** — re-point to the pushed snapshot; lens → view-only |
| Steward/commissioner role + `/curation/*` APIs | **EXISTS** — the permission model |
| Per-matchup `scoring_period_span`, ESPN `matchup_period_count` | **EXISTS (partial)** — extend with settings-driven auto-detect |
| Persist per-season `mSettings` | **EXISTS** — `league_season_settings` stores league size, schedule, roster slots, scoring, and acquisition fields |
| **Data page** (the 3-grain editable tables) | **NEW** |
| **Edit-scope** (this-year vs all-years) | **EXISTS (service/API)** — `applyCuratedDataEdit` smart-defaults real names to all-years and team names to this-year-only; UI prompt is T6/T8 |
| **Save/Push state machine + pushed snapshot** | **EXISTS (service/API)** — append-only checkpoints + per-season pushes; record-book read switch remains T9 |
| **Change feed + red/green diff view** | **EXISTS** — `/leagues/[leagueId]/ledger` renders edits, saves, and pushes from the ledger |
| **Era/span auto-proposal from settings** | **NEW** |
| **Record-book display rule** (one representation/person) | **NEW** |
| **General fantasy-stats substrate (B)** | **NEW** |

**T1 data-model note:** `league_season_settings` remains the per-season settings table and was extended rather than
replaced. It now stores `league_size`, `matchup_period_count`, regular/playoff/championship scoring periods,
`playoff_matchup_period_length`, `playoff_team_count`, `scoring_type`, full `scoring_settings`, `lineup_slot_counts`,
`acquisition_type`, `acquisition_budget`, full `acquisition_settings`, and existing keeper flags/settings. Rows are
league-scoped with RLS and keyed by `(league_id, provider, league_provider_id, season)`.

**T2 identity note:** provider owner names now flow through `fantasy_members` → `team_season.owner_names` →
`persons.canonical_name` during identity resolution. Existing non-manual person names refresh from the latest mapped
owner name; user/steward canonical-name edits remain sticky. The real import harness resets only the target ESPN
league, runs current + historical import plus stats recompute, and writes a league-scoped Persons summary so fixture
league names cannot contaminate verification.

**T3 bye/span note:** ESPN one-sided schedule rows now persist as nullable-away `fantasy_matchups` and materialize
weekly `bye` results. Bye scores count toward PF and scoring records while W/L/T, H2H, streaks, all-play comparisons,
and game-final content skip the no-opponent side by default. Playoff matchup spans are derived from
`league_season_settings.playoff_matchup_period_length`; stored settings are authoritative for playoff windows, so
2011-2012 playoff matchups store span=2 and over-broad ESPN windows are clamped to that setting.

**T4 curated-state note:** `league_curation_checkpoints` stores every save as a whole-league draft snapshot anchored
by a `league_data_edits` marker. `league_curation_season_pushes` stores every push as an append-only per-season
version anchored by a push marker. `composeCanonicalSnapshot(leagueId)` returns the composition of each season's
latest pushed version; it is the future T9 record-book input and is not wired into current record reads yet.

---

## 7. The four data-quality fixes fold in here
They aren't separate patches — they're the Data page's first real content / the first things you curate:
1. ✅ **Byes** — captured as a one-sided fact (score counts, no W/L/T default); bye-aware coverage; optional
   "count byes as wins" toggle = a Data-layer setting. The false integrity failures blocking the record book are
   cleared in clean 95050 verification.
2. ✅ **Names** — EXISTS for ingestion + clean verification: ESPN member `displayName`/`firstName`+`lastName` values
   persist through identity resolution to non-manual `persons.canonical_name`, and the clean real-import summary is
   scoped to league 95050 so fixture-league `Fixture Manager NN` rows do not bleed in. The People grid + edit-scope
   UI remains future Data page work.
3. ✅ **Multi-week span** (the "325" record) — auto-detected from `playoffMatchupPeriodLength` (=2 for 2011-2012) and
   editable in the per-season grid. The 325 two-week playoff total is excluded from single-week records.
4. ✅ **Settings ingest** — persist per-season `mSettings` and use them to auto-propose eras/spans.

---

## 8. Proposed build sequence (after this doc is agreed)
1. **Substrate**: persist per-season settings + facts cleanly (incl. byes); fix names ingestion + clean fixture data.
2. **Data page — read view** of the 3 grains (no editing yet) verified against the real league.
3. **Editable cells + edit-scope** + ledger writes.
4. **Change feed + red/green diff.**
5. **Save (checkpoint) + Push (snapshot)** state machine.
6. **Re-point the record book** to the pushed snapshot; lens → view-only; display rule.
7. **Era/span auto-proposal** from settings (confirm-in-Data).
8. **Expand the records catalog** (categories + the recovered legacy set).
9. **General fantasy-stats substrate (B)** — can proceed in parallel once the substrate contracts are set.

Each phase = file-disjoint specs + orchestrated agents + **verification against the real league** before moving on.

---

## 9. Open decisions for owner review
1. **Record-book display rule** — default to *most-recent team name + real name*? Or a per-person canonical you pick?
2. **Live-vs-curated boundary** — confirm: active season auto-updates; a season becomes curate-and-push once
   finalized. Who/what marks a season "finalized" — automatic on season end, or an explicit owner action?
3. **Push granularity** — push the whole league at once, or per-season (push 2012 independently of 2011)?
4. **Save retention** — keep all checkpoints, or last-N? (Leaning: keep all; they're cheap as ledger markers.)
5. **General-stats source** — which provider feeds substrate B (and is it mock/$0 for now)?
6. **First vertical slice** — do we prove the whole pipeline on ONE season end-to-end (data→edit→save→push→record)
   before scaling to all 16, or build each phase across all seasons at once? (Leaning: one-season vertical slice
   first — fastest way to validate the framework is sound.)
```
