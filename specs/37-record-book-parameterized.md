# Spec 37 — Record Book & Parameterized Records (the lens UI)

> Outcomes spec. The member-facing **Record Book** that exposes `specs/36`'s parameterized engine as **lenses**
> (metric × segment × era × scope), brings the existing rich catalog to life with seeded history, and renders it
> AUSPEX. Read `docs/NORTH-STAR.md` first; `DESIGN.md` is a gate. Builds on **`specs/36`** (the parameterized
> engine it surfaces), `specs/23` (records-history — EXISTS) and `specs/06` (stats/records). Lives in
> `src/app/leagues/[leagueId]/records/*`, reads `src/stats`. **Track A**, after `36`.

## Why this spec exists (the soul)
The owner: a per-league **record book** is a "people love it" feature — *"a big thing with people I know."* It
already EXISTS (a rich catalog), but it looks bare (no seeded history) and isn't **sliceable** — you can't ask
"most playoff points in the OP era." `specs/36` makes the engine parameterized; this spec gives the user the
**lens controls**, fills the empty states with real seeded history, and surfaces it in the AUSPEX language so the
record book finally *adapts to how the league separates its data.*

## Outcomes
1. **Lenses.** Every record/standing is viewable through **segment** (regular / playoff / both), **era** (any
   defined grouping or cumulative), and **scope** — the four locked defaults (`ORCHESTRATION.md §8`).
2. **Alive, not empty.** Seeded real history (the `specs/36` fixture oracle) fills the book; designed loading/empty
   states otherwise.
3. **Graceful.** A league with no eras never sees an era control; defaults to cumulative — the lens UI degrades.

---

## A. The lens model (metric × segment × era × scope)
An AUSPEX **lens control** surface drives every record view. `segment ∈ {regular, playoff, both}`; `era ∈ {any
confirmed grouping, cumulative}` (the era control is **hidden** when the league has zero groupings); `scope` per
record family. Selecting a lens re-queries `specs/36 §E`'s parameterized aggregation; results update in place.
Default lens = **cumulative / both** — the simplest true view for a clean league.

## B. The surfaces (EXISTS catalog → exposed)
The existing catalog (`records-catalog.ts` `RecordType` union — blowouts, narrowest wins, win/loss streaks,
highest combined matchup, single-week high/low, season scoring averages, most/fewest wins/points, career points,
championships, playoff appearances, luck, keeper milestones) and views (`league-records-view`,
`manager-records-view`, `h2h-records-view`, `records-tables`, loaded via `loadRecordsSourceData`) gain lens
controls and re-query the parameterized engine. New league-specific marks are *expressions of the lens* (e.g. "most
wins in the playoffs" = wins × `segment=playoff`; "best regular-season scoring average in era 2" = avg ×
`segment=regular` × `era=2`).

## C. Records adapt to curation
Picking an era/segment recomputes via `specs/36 §E` — same catalog, different slice. The integrity gate stays:
a `data_integrity_check` failure still blocks the render (EXISTS behavior, `specs/14`), so a flagged league never
shows misleading records. Seeding uses the `specs/36` fixture oracle so the book matches the owner's hand-curated
numbers.

## D. Design (AUSPEX) & EXISTS/NEW
- **Design:** lens controls + record tables in AUSPEX per `DESIGN.md` (LCD numerics, glass panels, mono section
  labels, no gradient-clipped headings); designed loading/empty states; token-contract test green.
- **EXISTS — extend:** the catalog, the three record views, `loadRecordsSourceData`, the integrity-block.
- **NEW:** the lens-control UI; wiring views to `specs/36`'s parameterized path; seeding from the fixture oracle;
  the new lens-derived marks; the no-era degrade.

## E. Acceptance criteria (testable, fixture-backed)
1. **Lenses work.** Toggling segment/era/scope re-queries and renders the correct slice; values match hand-computed
   fixture numbers (e.g. "most playoff points, era 2").
2. **No-era degrade.** A league with zero groupings shows **no** era control and renders cumulative records
   unchanged.
3. **Seeded & alive.** Loading the seeded old-league history fills the book; it reproduces the owner's record-book
   numbers (ties to `specs/36` AC10).
4. **Integrity gate preserved.** A `data_integrity_check` failure still blocks the render (EXISTS behavior).
5. **AUSPEX fidelity + gates.** Token-contract test green; screenshots faithful; `typecheck/lint/test/build/ubs`
   pass.

### Needs the later human pass
Which lens-derived marks are "headline" records, default lens per family, and exact table density — tuned with the
owner.

## Dependencies / blocked-by
- **Builds on** `specs/36` (parameterized engine + seeding) — hard prerequisite; `specs/23`/`06` (EXISTS catalog).
## Non-goals
- The engine/parameterization itself (`specs/36`); the edit flow / ledger / commissioner (`specs/38`); new record
  *types* beyond lens-derived marks (catalog lives in `specs/06`/`36`).
