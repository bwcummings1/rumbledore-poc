# Spec 14 — Data Foundation Depth (the bedrock substrate)

> Outcomes spec. WHAT a real, deep, bulletproof substrate produces — not the line-by-line HOW.
> Read `docs/NORTH-STAR.md` first. Builds on `specs/03-ingestion-providers.md` (providers/ingestion) and
> `specs/06-stats-and-records.md` (identity/stats). Lives in `src/providers/`, `src/ingestion/`, `src/stats/`.
> Canonical context: `docs/PROGRESS.md` §3 (validated ESPN facts) + §7 known bugs.

## Why this spec exists (the soul)
Rumbledore is, at its base, a **data system**: connect any fantasy league, store its **full** history, keep
recording new history. The North Star calls this the **substrate** — the bedrock layer everything else acts on,
and its truth is **sacred**. The AI cast, the lore mechanic, the records book, the betting arena all *read this
substrate as fact*. If the Narrator mythologizes "the 2019 collapse" off a mis-resolved owner, or the
Trash-Talker crowns the wrong perennial choker because two co-owners got merged into one person, the show is a
lie about *these specific people* — and the whole differentiation (it's about **your** league) collapses.

Round one came out a soulless data system because the substrate was shallow: one provider, one season, naive
identity, silent corruption. This spec makes the foundation **deep and faithful**: every provider reconciled
into one model, ~10 years of history imported losslessly and resumably, new weeks recorded reliably, the edge
cases that break naive models handled explicitly, and a **data steward** who can correct the record. Faithful,
not just functional. Everything downstream is only as true as this layer.

## Outcomes (what "deep & bulletproof" means)
1. **Provider parity** — ESPN, Sleeper, and Yahoo each populate the *same* normalized model with the *same*
   completeness for the data they expose; no feature above the adapter boundary knows which provider it came from.
2. **Full historical depth** — up to ~10 seasons (or earliest the provider exposes) imported as the **canonical
   league-history substrate**; resumable, checkpointed, idempotent, observable.
3. **Ongoing recording** — new weeks, results, transactions, and roster moves sync reliably and incrementally;
   freshness is tracked; the right (and *only* the right) recompute is triggered.
4. **Edge-case fidelity** — dynasty/keeper, co-owners, divisions, varied scoring, median/multi-game weeks, and
   non-standard rosters are handled per an explicit in-scope/out-of-scope table — never silently mismodeled.
5. **Integrity & stewardship** — automated integrity checks plus a real data-steward correction flow; the system
   **never silently corrupts**: it flags, quarantines, or surfaces; it does not guess and overwrite truth.

---

## A. Multi-provider robustness & parity
The `FantasyProvider` interface (`specs/03`) is the only seam; this section defines the **completeness contract**
each adapter must meet and how provider differences reconcile into one model.

- **Parity matrix (per provider, declared via `capabilities`).** Each adapter declares, per data class
  (leagues, teams, members, rosters, matchups, transactions, history, divisions, keeper/dynasty markers, scoring
  detail), one of: `full`, `partial`, `none`. Ingestion branches on `capabilities` — never on a provider string.
  A capability of `partial`/`none` is a **first-class, recorded state** (see `data_coverage` below), not an error.
- **Reconciled differences (provider → normalized).** Known divergences and their normalized resolution:
  - *Scoring type:* ESPN `H2H_POINTS`/category, Sleeper `points`/categories, Yahoo head-to-head/roto → one
    `scoringType` enum + a `scoringSettings` detail blob (PPR value, position weights, IDP flags); unknowns map to
    `unknown` (totality), never throw.
  - *Member identity:* ESPN SWID/GUID, Sleeper `user_id`, Yahoo GUID → durable `member.providerId`; **co-owner
    arrays preserved** (multiple member ids per team — see §D), never collapsed at ingestion.
  - *Periods:* ESPN `scoringPeriodId`, Sleeper `week`, Yahoo `week` → normalized `scoringPeriod`; playoff weeks vs
    regular-season weeks distinguished from provider settings, not inferred from position.
  - *Transactions:* differing type vocabularies → normalized `add|drop|trade|waiver|commish|unknown`.
- **Error / retry / partial-data handling.** All provider failures are typed (`AuthExpiredError`,
  `ProviderBlockedError`, `RateLimitedError`, `NotFoundError`, `ProviderParseError` — `specs/03`). Retryable
  classes (block/rate-limit/5xx) use bounded exponential backoff + jitter; only `AuthExpiredError` marks stored
  credentials invalid and raises a reconnect CTA (per `AGENTS.md`). A failure fetching one data class
  (e.g. transactions) must **not** abort the rest of the sync — the league still records teams/matchups, and the
  missing class is marked `stale`/`unavailable` in `data_coverage`, never written as empty-and-complete.
- **Provider-shape isolation.** Raw provider payloads never reach domain tables; an optional raw-snapshot table is
  debug-only and never read by features. A unit test per adapter asserts no provider-specific field leaks past
  normalization.

## B. Full historical depth — the canonical league-history substrate
The history import (`specs/03`) is elevated here into *the* canonical record that records, lore, and the AI read.

- **Depth & completeness.** Import newest→oldest up to ~10 seasons (bounded by `MAX_HISTORY_SEASONS`, default 10)
  or the earliest the provider exposes, whichever is shallower. Per season the bundle is **complete**: league
  settings, teams, members/owners, every regular-season + playoff matchup, **final standings/placements**,
  transactions, and division structure where present. Missing classes are recorded in `data_coverage`, not faked.
- **Resumable & checkpointed.** Each season is its own idempotent unit; after a season completes, a checkpoint
  (`{league_id, provider, lastCompletedSeason, cursor}`) is written. A re-run resumes from the next uncompleted
  season — never restarts, never reprocesses a completed one. A failed season leaves earlier checkpoints intact.
- **Idempotent.** Re-importing converges to identical rows (stable identity upserts + content hashing, `specs/03`).
  A completed import is detectable (`import_state = complete`) so it is not needlessly redone.
- **Canonical substrate guarantees.** History is the read-source of truth for `src/stats` and AI memory; stats
  never call providers. The substrate is **append-faithful**: provider-reported finals are stored verbatim
  (`finalStandings`, playoff seeds) and *preferred* over computed ranks; computed ranks are only a fallback when a
  provider omits finals. Co-existence of provider-final and computed-rank is explicit, never silently swapped.
- **Observability.** Per-league import progress (seasons done / total, current season, last error) is queryable
  and published on realtime so onboarding can show a live history-build.

## C. Ongoing recording — reliable incremental sync
Once history exists, the substrate must keep *recording* new history without re-deriving everything.

- **Triggers.** Scheduled refresh (cron) during the season + event-driven (`league.connected`, manual resync).
  Incremental sync fetches the current season's new/changed scoring periods, results, transactions, and rosters.
- **Idempotent & convergent.** Re-running a sync writes only changed entities (hash no-op on unchanged); a finalized
  week never flips back to non-final from a transient provider re-read; corrections (a provider revises a score)
  upsert and bump `updated_at`, and emit `game.final`/`league.ingested` so dependents recompute.
- **Freshness.** Each league tracks `last_synced_at` per data class and an overall `freshness` state
  (`fresh|stale|error`); stale beyond a threshold (configurable) is surfaced to the home page and steward.
- **Targeted recompute (what re-triggers what).** Define the recompute contract precisely so we never full-recompute
  on every sync and never *under*-recompute:
  - New finalized matchup → `SEASON` recompute for that season + affected `HEAD_TO_HEAD` pair(s).
  - New season's finals → `CHAMPIONSHIPS` + `RECORDS` (record-book) recompute.
  - Identity change (`identity.changed`) → recompute affected H2H/all-time only (see §D/§E).
  - First import / explicit request → `ALL`.
  All recomputes are idempotent Inngest jobs scoped to the affected `league_id` and season(s)/pair(s); caches
  (Upstash `league:{id}:…`) invalidate on the recompute event and republish on realtime.

## D. League-type edge cases (these break naive models)
Naive models assume one-owner teams, fixed rosters, standard PPR, and a single weekly head-to-head. Real leagues
violate all of these. Each case below is **explicitly in or out of scope** with a defined handling.

| Case | In scope | Handling (normalized model + stats) |
|---|---|---|
| **Co-owners** (one team, multiple people) | **Yes** | Team carries `ownerMemberIds[]` (array, never collapsed). Identity resolution produces **one `person`/franchise per team-season**, with all co-owners recorded in `owner_history`. **Overlapping member ids across *different same-season teams* must NOT merge those teams** (the known over-merge bug — §F). Stats compute one person-row per team per week. |
| **Dynasty / keeper** | **Yes (structural)** | Persist keeper/dynasty league flags + per-roster keeper/kept markers where the provider exposes them. Roster continuity (a player kept across seasons) is recorded but does **not** change person identity (identity is owner/franchise, not player). No keeper-cost valuation modeling (out of scope). |
| **Divisions** | **Yes** | Persist `division` on team-season + standings; division winners flagged in season stats; playoff seeding respects divisions when the provider reports it. |
| **Varied scoring** (PPR / half-PPR / custom / IDP) | **Yes (faithful passthrough)** | Store `scoringType` + full `scoringSettings` detail. **We consume provider scores as truth** — never recompute fantasy points. IDP/defensive-player rosters persist as normal roster entries; no position is dropped. |
| **Median / multi-game weeks** (all-play median game, two matchups/week) | **Yes** | A week may yield **multiple matchup rows** per team (e.g. real opponent + median opponent). Normalized matchups carry a `kind` (`head_to_head|median|all_play`) so stats count real H2H once and treat median/all-play correctly (W/L/T per the league's actual rules; luck/all-play math in `specs/06` stays consistent). |
| **Non-standard rosters** (deep benches, taxi/IR slots, superflex, no-kicker) | **Yes** | Roster `slot`/`status` totality maps unknown slots to `unknown` without dropping the entry; taxi/IR are recorded statuses, not deletions. |
| **Faab vs waiver-priority** | Partial | Transaction `details` preserves the provider's waiver mechanic; no normalization of bid economics beyond passthrough. |
| **Mid-season ownership transfer** | **Yes** | `owner_history` is season-range aware; a franchise changing hands mid-history is a `split`/`reassign` (steward §F), not a silent rename. |
| **Cross-sport / non-NFL** | **No** | Out of scope (NFL `ffl` only, per `specs/03` non-goals). |
| **Keeper-cost / draft-capital valuation** | **No** | Out of scope (no predictive/valuation modeling). |

Edge cases that the provider does not expose are recorded as `unavailable` in `data_coverage` — degrade
gracefully (omit, don't error), per `specs/06` roster-signal guidance.

## E. Data integrity & the steward cleaning workflow
The substrate must **never silently corrupt**. Integrity is enforced two ways: automated checks at write time, and
a real human correction loop for what automation can't safely decide.

- **Automated integrity checks (at ingestion + post-recompute).** Run and record results in a `data_integrity_check`
  log (check, league_id, season, status, detail):
  - *Reconciliation invariants* (`specs/06`): per person, career wins == Σ season wins == Σ weekly WINs; PF/PA
    totals reconcile across weekly/season/all-time layers. A mismatch flags the league, never auto-overwrites.
  - *Standings parity:* computed standings for a season match provider-reported finals where available; divergence
    is flagged for steward review (provider final is the stored truth; the flag explains the delta).
  - *Schedule coverage:* every finalized week has matchups for every active team; gaps flag as `incomplete`.
  - *Identity sanity:* no two different same-season team-seasons map to one person (co-owner over-merge guard, §F);
    every team-season maps to exactly one person.
  - *No-silent-empty:* a data class written empty-and-complete despite a non-`none` capability is rejected/flagged.
- **Quarantine, don't corrupt.** When a check fails, the offending rows are **flagged** (a `needs_review` state) and
  excluded from "trusted" record-book/all-time reads where they'd mislead, rather than deleted or guessed-and-fixed.
  The flag is visible to the steward; the AI cast must not assert un-verified history (mirrors lore's
  "never assert un-ratified history").
- **Data-steward correction flow (a real flow, RLS- + role-guarded).** The `data_steward` role (Better Auth,
  `specs/01`) gets a review surface to correct mis-pulled or mis-resolved data:
  - **Identity corrections** (`specs/06`): confirm/reject suggested links (0.60–0.85 band), **merge** two persons,
    **split** a wrongly-merged person, **reassign** a team-season, **rename** a person. Manual edits are
    `method=MANUAL`, `confidence=1.0`, **sticky** (a later auto-run never overrides MANUAL), and write
    `identity_audit_log` (who/when/why, before/after).
  - **Data corrections**: re-trigger a re-pull of a season/week (e.g. a known-bad provider read), correct a
    mis-mapped scoring period or division, or mark a flagged row reviewed/accepted. Every correction writes an
    append-only audit entry; nothing is mutated without a trail.
  - **Invalidation:** any correction invalidates dependent caches and enqueues the scoped recompute (§C), so the
    record book and AI memory reflect the fix.
  - All steward actions are league-scoped, RLS-guarded, and restricted to the league's steward/commissioner.

## F. Known-bug correctness folded into the foundation
These are tracked in `docs/PROGRESS.md` §7 / the archived `docs/archive/IMPLEMENTATION_PLAN.md` Icebox; this spec makes their correctness a
**foundation invariant**, not a later patch.

- **Co-owner over-merge (identity).** Per `AGENTS.md`: "different same-season provider team slots must stay mapped to
  separate people even when owner/member ids overlap; Sleeper co-owner data can overlap and weekly stats require one
  person row per team per week." Resolution: the continuity prior + owner-match must be **scoped per team-slot**;
  overlapping co-owner ids across two *distinct* same-season team-seasons must NOT trigger a merge. Guarded by the
  §E identity-sanity check and acceptance test 11.
- **Playoff / championship flags (stats).** `is_playoff` / `is_championship` were hardcoded false
  (`src/stats/engine.ts`). Resolution: derive playoff/championship from **provider settings + final standings**
  (regular-season vs playoff weeks, the title game), persisted with history (§B), so records (`CHAMPIONSHIPS`,
  bracket history, "made championship") are correct. Guarded by acceptance test 9.

---

## Acceptance criteria (testable — multi-provider + multi-season fixtures)
All tests run **offline against recorded fixtures** (ESPN 95050 real-shape + secret-scrubbed Sleeper/Yahoo
fixtures); no live calls in CI. Each criterion is a fixture-backed unit/integration test.

1. **Provider parity.** The same logical league shape ingested through ESPN, Sleeper, and Yahoo fixtures produces
   normalized leagues/teams/members/matchups that are field-equivalent (modulo declared capability gaps); a single
   downstream stats computation runs unchanged across all three.
2. **Capability honesty.** A provider fixture lacking transactions yields `data_coverage(transactions)=unavailable`
   (not empty-complete); the league still records teams + matchups; no error is thrown.
3. **History depth.** A ~10-season multi-fixture import persists all seasons with complete bundles
   (settings/teams/members/matchups/finals/transactions/divisions where present), bounded by `MAX_HISTORY_SEASONS`.
4. **Resumable checkpoint.** Simulated failure after season N leaves a checkpoint at N; re-run resumes at N-1 and
   completes without reprocessing N; earlier checkpoints intact.
5. **Idempotent resync.** Re-importing history and re-running current sync yield identical row counts/contents
   (zero net writes on the second pass — hash no-op); a finalized week never reverts to non-final on re-read.
6. **Targeted recompute.** A new finalized matchup recomputes only that season + affected H2H pair (asserted via the
   `stats_calculation` log); it does NOT trigger a full all-time recompute; identity change recomputes only affected.
7. **Co-owners (in-scope).** A team with multiple `ownerMemberIds` resolves to **one** person/franchise with all
   co-owners in `owner_history`; weekly stats produce exactly one person-row per team per week.
8. **Dynasty/keeper + divisions.** Keeper/dynasty flags and `division` persist; division winners flag in season
   stats; identity is unaffected by player-keep continuity.
9. **Playoff/championship correctness.** From provider settings + finals, playoff weeks and the title game flag
   correctly; `made championship`, champion/runner-up, and bracket history are right (known-bug guard).
10. **Median/multi-game weeks.** A median-game fixture yields the expected extra matchup rows tagged `kind=median`;
    H2H records count the real matchup once; all-play/luck math stays consistent with `specs/06`.
11. **Co-owner over-merge guard (known bug).** Two distinct same-season team-seasons with overlapping member ids
    resolve to **two** persons (not merged); the §E identity-sanity check passes; a reused-slot-by-new-owner case
    still splits correctly.
12. **Integrity check fires.** A fixture with a reconciliation mismatch (or a schedule gap, or an empty-complete
    write) produces a `data_integrity_check` failure row and marks the affected rows `needs_review` — never deletes
    or auto-overwrites; flagged rows are excluded from "trusted" all-time reads.
13. **Steward correction.** A steward `merge`/`split`/`reassign` (identity) and a `re-pull`/`mark-reviewed` (data)
    each write an append-only audit entry, are sticky against re-running auto-resolution, invalidate caches, enqueue
    the scoped recompute, and the record book reflects the fix afterward.
14. **Isolation.** Every table introduced/used here (history, checkpoints, `data_coverage`,
    `data_integrity_check`, identity/audit) is RLS-scoped; a league-A read returns zero league-B rows (the
    `specs/02` canary extends to all of them).

## Dependencies / blocked-by
- **Builds on** `specs/03` (providers/ingestion/historical import) and `specs/06` (identity/stats/records).
- **Needs** Foundation (`specs/02`): Drizzle/RLS, Inngest, Redis, Better Auth `data_steward` role.
- **Feeds** the AI cast (faithful league facts + lore substrate), the home/record book, and the betting arena.

## Non-goals
- No new provider beyond ESPN/Sleeper/Yahoo; no non-NFL sports.
- No fantasy-points recomputation, projections, or keeper/draft-capital valuation (consume provider scores as truth).
- No player-level cross-season identity (identity is owner/franchise → person, per `specs/06`).
- No UI design here (steward surface + home render their views elsewhere); this spec defines outcomes, data, checks.
