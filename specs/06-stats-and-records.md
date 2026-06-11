# Spec 06 — Statistics, Identity Resolution & League Records

> Outcomes spec. WHAT, not HOW. Stack/architecture: `docs/PROGRESS.md`, `specs/01-architecture.md`.
> Lives in `src/stats/`. Everything is league-scoped (`WHERE league_id` + RLS). Reference model proven in
> `git show v0.62:lib/identity/*` and `v0.62:lib/stats/statistics-engine.ts` — mine the logic, NOT the
> BullMQ/Prisma plumbing or disabled-gate patterns. New stack: Drizzle + Inngest + Postgres RLS.

## Purpose
Turn ingested current-season + historical matchup data into **accurate, deterministic, testable** league
statistics and an **all-time records** book. The hard part is **cross-season identity resolution**: ESPN
team IDs and ownership drift across ~10 years (teams rename, owners leave, slots get reused), so all-time
records are only correct once provider team/member identities are mapped to **canonical persons**. The
statistics engine, identity resolution, and records section are the analytical backbone that the league
home page, AI blogger (storylines/rivalries), and the betting arena all read from.

## Statistics engine

### Properties
- **Deterministic & pure.** Given the same normalized matchup/roster/result fixtures, every metric produces
  the identical value. No clock/random/network reads inside computation — inputs in, numbers out — so the
  whole engine is unit-testable from fixtures.
- **Persons, not provider teams.** Every metric is computed against **canonical person/franchise identities**
  (see Identity resolution), so "team" below means the resolved canonical franchise across renames/owners.
- **Incremental & cache-friendly.** Per-week facts (`weekly_statistics`) are derived once per finalized
  matchup; season and all-time aggregates roll up from those facts and recompute only for the affected
  season(s) when new data lands (event-driven, see Data/caching). No full-history recompute on each sync.
- **League-scoped.** Every read and write carries `league_id` and runs under RLS.

### Metrics (outcomes the engine MUST produce)
**Per finalized matchup (weekly fact row):** points_for, points_against, opponent, result (WIN/LOSS/TIE),
margin, is_playoff, is_championship, weekly rank (1..N for that week), top-scorer / bottom-scorer flags.

**Season (per team, per season):**
- Standings: wins, losses, ties, win %, points_for, points_against, point differential, final rank/seed,
  division winner, made playoffs, made championship, final placement (champ / runner-up / 3rd / out).
- Scoring: avg/median PF & PA, highest & lowest single-week score, scoring std-dev (consistency).
- Streaks: longest win streak, longest loss streak, current streak (type + length).
- **Luck (expected vs actual wins):** for each week compute the team's win probability as
  (# of other teams it would have beaten with that week's score) / (N−1) — i.e. its all-play record that
  week; **expected_wins** = sum of those weekly probabilities over the season. **luck = actual_wins −
  expected_wins** (positive = lucky schedule, negative = unlucky). Also expose all-play W/L record and
  the "would-be standings if everyone played everyone every week."
- Optional roster signals (only if roster/lineup data is ingested): points left on bench, optimal-lineup
  efficiency. Degrade gracefully (omit, don't error) when lineup data is absent.

**Head-to-head (per canonical pair, all-time + per-season):** total meetings, W/L/T each side, total &
average points each side, each side's highest score in the series, playoff & championship meeting counts,
last meeting date, current/longest streak in the rivalry. Powers the AI blogger's rivalry storylines.

**All-time (per team, across all resolved seasons):** career W/L/T & win %, total/avg PF & PA, championships,
runner-ups, playoff appearances, regular-season titles, best & worst season, career luck.

### Outcomes
- Standings for any season match ESPN's official standings for the same inputs (tie-breaks documented &
  applied consistently).
- Aggregates are reproducible: recomputing from the same fixtures yields byte-identical results.
- Querying any team/person returns season + all-time lines that **sum consistently** with the weekly facts
  (career wins == Σ season wins == Σ weekly WINs; PF totals reconcile across all three layers).

## Identity resolution

### The problem
A provider exposes, per season, a set of teams keyed by `(provider, providerLeagueId, providerTeamId,
season)` plus member/owner info. Across ~10 years: the same person renames their team yearly; the same
ESPN team-slot id can be reused by a different owner after someone leaves; a franchise can change hands
(ownership transfer); co-owners exist. Without resolution, all-time records double-count or misattribute.

### Model
- **`person`** (canonical identity, league-scoped): the durable franchise/owner. Carries `canonical_name`
  and an append-only **`owner_history`** (who controlled it for which season ranges). One person spans many
  seasons. *(v0.62 modeled this as `team_identities.master_team_id` + `owner_history` JSON — same idea.)*
- **`team_season`** (provider fact, immutable): one row per `(league_id, provider, provider_team_id, season)`
  with that season's team name and owner/member info as reported by the provider.
- **`identity_mapping`**: links each `team_season` → exactly one `person`, with `confidence` (0–1),
  `method` (`AUTO` | `FUZZY` | `MANUAL`), and `resolved_by` (system or steward user). Unique on
  `(league_id, provider, provider_team_id, season)` — every team-season maps to one and only one person.
- **`identity_audit_log`**: append-only before/after + reason + actor for every create/merge/split/remap.

### Resolution algorithm (deterministic, layered — proven in `v0.62:lib/identity`)
1. **Continuity prior:** group team-seasons by stable provider id (`provider_team_id`); ESPN slots usually
   persist for a person season-over-season → strong default link, high confidence.
2. **Owner/member match:** when the provider gives an owner id (ESPN SWID / member id), an exact owner-id
   match across seasons is the **strongest** signal and overrides the slot prior (handles a slot being
   reused by a new owner, and a person whose slot id changed).
3. **Fuzzy name match (tie-breaker / no owner id):** combine **Levenshtein + Jaro-Winkler + phonetic
   (Metaphone) + token-set** similarity on normalized owner names AND team names (weights documented;
   v0.62 used name 0.30 / jaro 0.30 / phonetic 0.20 / token 0.20). Team-name similarity is a weak signal
   (people rename teams freely); **owner-name similarity weighted higher than team-name similarity.**
4. **Confidence scoring & thresholds:** combine signals into a single `confidence` with documented bands:
   `>= 0.85` auto-link; `0.60–0.85` link as **suggested** and surface to the steward for confirmation;
   `< 0.60` create a **new** `person` and flag as a possible match (never silently merge).
5. **Reproducible:** same fixtures → same mappings & confidences (no randomness; stable ordering).

### Steward override (correction loop)
The **data steward** (role from `specs/01`/Better Auth) gets a review surface to fix mismatches — the
prompt's required correction path:
- **Confirm / reject** suggested links in the 0.60–0.85 band.
- **Merge** two persons into one (e.g. resolver split a renamed franchise across two ids).
- **Split** a person whose slot was actually inherited by a different owner mid-history.
- **Reassign** a single `team_season` to a different/new person; **rename** the canonical person.
- Manual edits set `method=MANUAL`, `confidence=1.0`, are **sticky** (a later auto-run never overrides a
  MANUAL mapping), and write an `identity_audit_log` entry (who/when/why, before/after).
- Any identity change **invalidates dependent caches** and triggers recompute of affected H2H/all-time
  records (see Data/caching). All steward actions are league-scoped + RLS-guarded.

### Acceptance (identity)
- Two seasons where the same owner renames their team ("Team Bob" → "Bob's Bombers", same provider team id
  or same owner id) resolve to **one** `person`; all-time records count them as a single franchise.
- A provider team id **reused by a new owner** across seasons resolves to **two distinct** persons (owner-id
  / strong-mismatch signal beats the slot prior).
- A steward `merge` of two persons reassigns all their `team_season` rows, writes an audit entry, and the
  resulting all-time records reflect the merge after recompute.

## League records section
Built **once historical import + identity resolution exist** (it is the payoff of both). All-time and
record lookups are computed over **canonical persons**, league-scoped, and surfaced as a "record book."

- **Single-week records:** highest & lowest team score ever; biggest blowout (margin) & narrowest win;
  highest-scoring matchup (combined); best/worst score in a loss/win.
- **Single-season records:** most/fewest wins; most/fewest points for & against; best & worst luck season;
  longest win/loss streaks; highest season scoring average.
- **Bests / worsts (career):** most championships, best career win %, most playoff appearances, most points,
  most "luck," plus the inverse worsts.
- **Championships & placement:** champion / runner-up / 3rd / regular-season winner per season; title count
  per person; playoff bracket history.
- **Rivalries:** ranked head-to-head series (closest rivalry, most lopsided, highest combined scoring,
  most playoff meetings) for the AI blogger and home page.
- **Lookups over time:** a person's full season-by-season line; standings/records "as of" any past season
  or week; a rivalry's full timeline.
- Each record row stores holder (person), value, when achieved (season/week), opponent (if any), and a
  pointer to the **previous holder** so the blogger can narrate "record broken" moments. *(v0.62:
  `all_time_records.previous_record_id`.)* Records are recomputed on new finalized data or identity change.

## Data & caching
- **Tables (Drizzle, all league-scoped + RLS):** `person`, `team_season`, `identity_mapping`,
  `identity_audit_log`, `weekly_statistics`, `season_statistics`, `head_to_head_record`,
  `championship_record`, `all_time_record`, and a `stats_calculation` log (job, type, status, duration,
  rows, errors) for observability. Money/score values use exact decimal types (no float drift).
- **Read source of truth:** ingested/normalized matchups + historical import (`specs/03` ingestion,
  historical/checkpoint import). Stats never call providers directly.
- **Computation as Inngest jobs** (idempotent, per `specs/01`): events `league.ingested` /
  `import.completed` / `game.final` / `identity.changed` enqueue recompute scoped to the affected
  season(s) or pair(s). Granular types: `SEASON`, `HEAD_TO_HEAD`, `RECORDS`, `CHAMPIONSHIPS`, `ALL` (mirror
  v0.62's `CalculationType`). Incremental by default; `ALL` only on demand / first import.
- **Caching:** materialized aggregate rows ARE the cache; hot reads (standings, record book) cached in
  Upstash Redis under `league:{id}:…` keys, invalidated on the recompute event. Realtime publish on update
  (`specs/01` Supabase Broadcast) so the home page reflects new stats live.
- **Performance:** standings/record-book reads served from materialized rows/cache within the p95 < 200ms
  budget; a full 12-team / ~10-season recompute completes well inside a background job window.

## Acceptance criteria (testable)
1. **Standings from fixtures.** A fixture of one season's matchups (use real league `95050` shape) computes
   standings (W/L/T, PF/PA, rank) matching expected values exactly; recompute is byte-identical.
2. **Renamed team across two seasons → one person.** Two-season fixture where a team is renamed (same owner)
   resolves to a single `person`; its all-time line shows combined wins/PF, and H2H vs a constant opponent
   accumulates across both seasons (the prompt's headline test).
3. **Reused id → two persons.** Fixture where one provider team id is inherited by a different owner resolves
   to two distinct persons; all-time records do not merge them.
4. **Steward correction.** A `merge` (and a `split`) over fixtures reassigns the right `team_season` rows,
   writes an audit entry, is sticky against re-running auto-resolution, and updates records after recompute.
5. **Luck math.** On a small fixture, expected_wins equals the summed weekly all-play win-rate and
   `luck = actual − expected` to a fixed tolerance.
6. **Reconciliation invariant.** For every person: career wins == Σ season wins == Σ weekly WINs, and PF
   totals reconcile across weekly/season/all-time layers.
7. **Records book.** Single-week & single-season record fixtures surface correct holders + values, with the
   previous-holder pointer set when a record is broken.
8. **Isolation.** Stats/identity reads for league A under RLS return zero rows from league B (the
   `specs/02` isolation canary extends to every table here).

## Dependencies / blocked-by
- **Blocked by ingestion + historical import** (`specs/03`): needs normalized current-season matchups AND
  resumable ~10-year history before all-time stats/records/identity can be meaningful.
- **Needs** Foundation (`specs/02`): Drizzle/RLS, Inngest, Redis, Better Auth roles (incl. `data_steward`).
- **Feeds** the AI blogger (storylines/rivalries), the league home page (standings/movers), and the betting
  arena (per-person history). Identity resolution is the shared backbone for all "all-time" features.

## Non-goals
- No player-level cross-season identity (resolver here is **team/owner → person**; player identity, if ever
  needed, is separate). No cross-league/global records (league-sandboxed only; the arena handles cross-league).
- No projections/predictive modeling or fantasy-points recomputation (we consume provider scores as truth).
- No UI design here (that's the home/records views); this spec defines the engine, data, and outcomes.
