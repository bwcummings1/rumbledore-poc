# Spec 23 — Records & History (the league's mythology, made viewable now)

> Outcomes spec. WHAT the all-time records & history surfaces produce — not the line-by-line HOW.
> Read `docs/NORTH-STAR.md` first. Builds on `specs/06-stats-and-records.md` (engine/identity/records tables),
> `specs/14-data-foundation-depth.md` (the canonical ~10-year substrate + playoff/championship flags + co-owner
> identity), and the ingestion/recompute layer (spec 19 — the targeted recompute contract that refreshes these
> aggregates). Lives in `src/stats/`, `src/home/`, `src/app/leagues/[leagueId]/records/`, and new per-manager /
> head-to-head routes. Feeds the AI cast (`specs/12`) and lore (`specs/13`/`18`).

## Why this spec exists (the soul)
The North Star says a league's seasons, rosters, rivalries, and results are the **raw material of its mythology**.
A record book is not a stats dump — it is the **scorekeeping spine the cast performs against**: the Narrator can't
mythologize "the 2019 collapse," the Trash-Talker can't crown "the perennial choker," and the league can't ratify
"the worst trade ever" unless the history underneath is **deep, faithful, and broken out per person**. Records turn
ten years of matchups into named grudges, dynasties, and chokers — about *these specific people*.

It is the **offseason**. There is no live week to narrate, no bets to settle. But the ~10-year canonical history is
**already imported and real right now** (`specs/14`). That makes the record book the **most tangible "this is
genuinely your league" payoff available before the season starts** — the moment a user sees their real 2018 title,
their real 41-point blowout loss, their real 7-3 rivalry edge over their college roommate, the product stops feeling
like plumbing and starts feeling like *their show*. This spec makes that surface deep, correct, and cast/lore-wired.

---

## State: EXISTS vs NEW

**EXISTS (do not rebuild — deepen):**
- The stats engine and record types: `src/stats/engine.ts` `RECORD_TYPE_LABELS` (23 record types — single-week
  highs/lows, blowout/narrowest win, best-score-in-loss, season most/fewest wins & PF/PA, luck seasons, longest
  win/loss streaks, most championships / playoff appearances / career points, best career win %, highest combined
  matchup). Playoff/championship flags are **derived** from provider settings + finals (`isPlayoff`/`isChampionship`,
  the `specs/14` known-bug fix), not hardcoded.
- Materialized aggregate tables (`src/db/schema.ts`), all RLS-scoped (`league_id = current_league_id()`):
  `weekly_statistics`, `season_statistics`, `head_to_head_record` (per-pair, symmetric A/B fields + playoff &
  championship meeting counts + current/longest streak), `championship_record` (champ / runner-up / 3rd / reg-season
  winner per season), `all_time_record` (holder person, value, season/period, opponent, `previous_record_id`,
  `is_current`, `metadata`).
- Identity: canonical **persons** scoped per team-season; co-owner arrays preserved; one person-row per team per week
  (`AGENTS.md` rule); steward merge/split/reassign with sticky MANUAL edits.
- A single league **Records view** (`src/app/leagues/[leagueId]/records/league-records-view.tsx`) — a flat grid of
  `all_time_record` rows fed from `LeagueHomeData.records` (`src/home/league-home.ts`), already ethos-worded.
- Recompute jobs: `SEASON | HEAD_TO_HEAD | RECORDS | CHAMPIONSHIPS | ALL`, idempotent, scoped, with a
  `stats_calculation` log; cache invalidation + realtime republish (`specs/06`/`14`/`19`).

**NEW / CHANGES (this spec):**
1. **A complete records catalog** assembled into a structured, navigable record book (not a 23-tile flat grid):
   all-time standings, single-week/season highs & lows, streaks, **H2H ledgers**, championships/playoff appearances,
   blowouts/closest games, and **draft/keeper milestones** — with each record carrying enough context to narrate it.
2. **Per-manager record pages** — one page per canonical person: career line, season-by-season, the records they
   hold, their championships/placements, their H2H ledgers, their signature highs and lows.
3. **Head-to-head pages** — one page per canonical pair: the symmetric ledger, the rivalry's streaks, biggest
   meetings, playoff/championship history, "last meeting."
4. **Materialized record-book aggregates** beyond what exists: an all-time standings rollup and a
   draft/keeper-milestone aggregate, refreshed by the ingestion recompute layer; incremental + idempotent.
5. **Cast + lore hooks** — a broken record emits a cast-ready event (a "record broken" piece) and a pre-seeded
   **data-verifiable lore claim** the league can ratify; records are queryable as cast/lore fact.

---

## A. The records catalog (derived correctly from history)
Every record is computed over **canonical persons** (never raw provider team ids), league-scoped, and only from
data that passed the `specs/14` integrity checks (rows in `needs_review` are **excluded from "trusted" reads** — the
cast must not assert quarantined history). Each catalog entry below names its source layer and its correctness rule.

| Catalog group | Records (examples) | Source / correctness rule |
|---|---|---|
| **All-time standings** | career W/L/T, win %, total & avg PF/PA, championships, runner-ups, playoff appearances, reg-season titles, best/worst season, career luck — ranked | Rolled up from `season_statistics` per person; **must sum-reconcile** to weekly facts (`specs/06` invariant: career wins == Σ season wins == Σ weekly WINs). |
| **Single-week highs & lows** | highest / lowest weekly score; biggest blowout (margin); narrowest win; highest combined matchup; best score in a loss; worst score in a win | From `weekly_statistics`; ties broken deterministically (earliest season, then earliest period, then person id) so recompute is stable. |
| **Single-season** | most / fewest wins; most / fewest PF & PA; highest season scoring average; luckiest / unluckiest season | From `season_statistics`. |
| **Streaks** | longest win streak; longest loss streak (all-time, per person) | Computed over the person's **ordered** weekly facts across seasons; a streak may cross season boundaries; **median/all-play matchup rows (`kind != head_to_head`) are excluded** from real W/L streaks (`specs/14` §D). |
| **Head-to-head ledgers** | per pair: meetings, W/L/T each side, total & avg points each side, each side's high, playoff & championship meetings, last meeting, current & longest streak in the series | `head_to_head_record`; **symmetric** — A-vs-B and B-vs-A are the same row read from either orientation; only `kind=head_to_head` matchups counted (real meeting counted once). |
| **Championships & placement** | champion / runner-up / 3rd / reg-season winner per season; title count per person; playoff bracket history | `championship_record`, driven by **derived** `isChampionship`/`isPlayoff` flags + provider final standings (preferred over computed rank, `specs/14` §B). |
| **Blowouts / closest games** | biggest blowout, narrowest win (also as a chronological list, not just the single record holder) | `weekly_statistics` margin; list view ranks top-N so the cast can cite "the 5 worst beatdowns ever." |
| **Draft / keeper milestones** | keeper/dynasty league flag; per person: keepers retained, longest-kept player, first-draft seasons, dynasty tenure | From persisted keeper/dynasty markers + `owner_history` (`specs/14` §D). **No keeper-cost / draft-capital valuation** (out of scope, `specs/14`). Where the provider doesn't expose draft/keeper data, surface `unavailable`, never fabricate. |

**Co-owner correctness (load-bearing).** A team with multiple `ownerMemberIds` is **one** person/franchise; its
all-time line and records combine the co-owners' results, and two **distinct same-season** team-seasons with
overlapping member ids must remain **two** persons (the over-merge guard, `specs/14` §F). Every record holder, H2H
side, and standings row is a person, so this guard is the difference between "your real rivalry" and a lie.

**Record-broken provenance.** When a new record displaces an old one, the new `all_time_record` row points at the
old via `previous_record_id` and the old flips `is_current=false`. This chain is what lets the cast say "the record
that stood since 2017 just fell" — it is data, not a guess.

## B. The surfaces
All surfaces are RLS-scoped, mobile-first PWA, and **read from materialized rows / cache** (p95 < 200ms, `specs/06`).
No surface calls a provider or recomputes on read.

1. **League Records section (deepen the existing view).** `league-records-view.tsx` graduates from a flat 23-tile
   grid to a **structured record book** with the catalog groups of §A as sections: an all-time standings table at
   the top, then highs/lows, streaks, championships, and a "rivalries" teaser linking into H2H. Each record tile
   keeps its holder · opponent · season · week context line and, when broken, shows the "previous holder" so the
   page reads like a record book, not a leaderboard. Empty state (pre-import) unchanged.
2. **Per-manager record pages** — new route `…/records/managers/[personId]`. One page per canonical person:
   career line + season-by-season table, the records they currently hold, their championships/placements/playoff
   appearances, their biggest single weeks (high and low), and their H2H ledgers vs every opponent (linking to §B.3).
   Co-owner franchises show all co-owners in the header (from `owner_history`) under the one person.
3. **Head-to-head pages** — new route `…/records/h2h/[personAId]/[personBId]` (canonicalized to a stable ordering so
   the same pair has one URL). Shows the symmetric ledger, total & average points each side, each side's series high,
   playoff/championship meetings, current/longest streak, and last meeting. A league-wide "rivalries" index ranks
   pairs (closest rivalry, most lopsided, highest combined scoring, most playoff meetings) for browsing and for the
   blogger's rivalry storylines.
4. **How records feed the cast + lore.**
   - **Cast piece:** a broken record (a new `is_current` row with a `previous_record_id`) and each new
     championship emit a cast-consumable event so a persona can produce a **"record broken" / "new chapter"** piece
     with a byline (the Narrator mythologizes; the Analyst contextualizes) — referencing the holder, the prior
     holder, the season/week, and any standing rivalry. The cast reads records as **fact** and must not assert
     quarantined (`needs_review`) history.
   - **Lore claim:** a record materially confirms or refutes a **data-verifiable** lore claim. A member claim like
     "I have the highest single-week score ever" is auto-confirmed/refuted against `all_time_record` (the
     `data_verifiable` path, `specs/13`/`18`); a notable new record can also **pre-seed** a data-verifiable claim
     the league ratifies into canon. Opinion claims ("biggest choker") stay vote-driven, but the cast can
     **instigate** them with the record as evidence ("the data says X has the most last-place finishes — settle it").
   - Records are exposed as a **read API for cast/lore** (person line, H2H ledger, record holders, "as-of" season
     standings) so personas cite real numbers, not hallucinated ones.

## C. Computation — materialized, incremental, idempotent
Record aggregates are **precomputed and stored** (the materialized rows *are* the cache, `specs/06`); the ingestion
recompute layer (spec 19, the targeted-recompute contract of `specs/14` §C) refreshes them on new finalized data.

- **Refresh triggers (scoped — never full-recompute on every sync):**
  - New finalized matchup → `SEASON` recompute for that season + affected `HEAD_TO_HEAD` pair(s) + a `RECORDS`
    pass that re-evaluates only the record types those facts could move (e.g. a new weekly high can't change "most
    championships"); single-week/streak/H2H records recompute, championship records do not.
  - New season's finals → `CHAMPIONSHIPS` + full `RECORDS` + all-time standings rollup recompute.
  - Identity change (`identity.changed`, steward merge/split/reassign) → recompute only affected H2H pairs +
    all-time/standings + the records whose holder/opponent is an affected person.
  - First import / explicit request → `ALL`.
- **Idempotent & convergent.** A recompute is a pure function of the (trusted) weekly/season facts: re-running it
  with no new data yields **identical aggregate rows** (zero net writes; `is_current` flags and `previous_record_id`
  chains unchanged). Tie-breaks are deterministic (§A) so two runs never flip a holder back and forth.
- **Correct across seasons.** Streaks and all-time standings span seasons in chronological order; a person who
  changed teams (reassign) or whose co-owners changed mid-history (`owner_history` season-range aware) still rolls
  up to one continuous career line. "As-of season N" reads filter facts to `season <= N` without mutating stored
  current rows.
- **Append-faithful.** Provider-reported finals are preferred over computed ranks (`specs/14` §B); a transient
  provider re-read never flips a finalized week or demotes a recorded champion.
- **Observability + cache.** Every recompute writes a `stats_calculation` log row (job, type, status, duration,
  scope); on completion it invalidates `league:{id}:records|standings|h2h:*` caches and republishes on realtime so
  open record-book pages update live.

---

## Acceptance criteria (testable against a seeded multi-season fixture)
All tests run **offline against recorded fixtures** (ESPN 95050 real-shape + a synthetic multi-season league with
co-owners, divisions, playoff brackets, and a median-game season); no live provider calls in CI.

1. **Catalog correctness.** Over a ~5+ season fixture, every record type resolves the **correct holder + value** with
   correct context (season/week/opponent); single-week highs/lows match the max/min `weekly_statistics` rows; season
   records match `season_statistics`; deterministic tie-breaks make the holder stable across two runs.
2. **All-time standings reconcile.** Each person's career W/L/T and PF/PA equal the sum of their season lines, which
   equal the sum of their weekly facts (the `specs/06` reconciliation invariant); the standings rank is stable.
3. **Co-owner identity.** A multi-co-owner team resolves to **one** person whose all-time line combines the
   co-owners; two distinct same-season teams with overlapping member ids resolve to **two** persons and are **not**
   merged in any record, H2H side, or standings row (the §F over-merge guard).
4. **Playoff / championship flags.** From provider settings + finals, the champion/runner-up/3rd/reg-season winner
   per season are correct, "most championships" and "most playoff appearances" are correct, and bracket/title-game
   meetings count in H2H `playoffMeetings`/`championshipMeetings` (the `specs/14` known-bug guard).
5. **H2H symmetry.** For every pair, reading A-vs-B and B-vs-A yields the **same** ledger (wins/points/streak mirror
   correctly); meetings == personAWins + personBWins + ties; only `kind=head_to_head` matchups count, and a real
   meeting in a median-game week is counted **once**.
6. **Streak correctness.** Longest win/loss streaks are computed over chronologically ordered weekly facts, may cross
   season boundaries, and exclude median/all-play rows; a fixture with a known 6-game streak surfaces 6.
7. **Surfaces render real data.** The deepened Records section renders the catalog groups; a per-manager page renders
   that person's career line, held records, placements, and H2H ledgers; an H2H page renders the symmetric ledger —
   all from materialized rows (no provider/recompute call on render).
8. **Idempotent recompute.** Re-running `RECORDS`/`CHAMPIONSHIPS`/`HEAD_TO_HEAD`/all-time-standings with no new data
   produces **zero net writes**; aggregate rows, `is_current` flags, and `previous_record_id` chains are unchanged.
9. **A new finalized result updates the right records, idempotently.** Appending one finalized matchup that sets a new
   weekly high triggers only `SEASON` + affected `HEAD_TO_HEAD` + scoped `RECORDS` (asserted via `stats_calculation`),
   NOT `CHAMPIONSHIPS` and NOT a full all-time recompute; the new `all_time_record` becomes `is_current=true` with
   `previous_record_id` pointing at the displaced holder (now `is_current=false`); re-running the same append is a
   no-op.
10. **Record-broken → cast + lore.** The displacement in (9) emits a cast event consumable as a "record broken" piece
    citing the prior holder, and auto-confirms/refutes a matching `data_verifiable` lore claim against
    `all_time_record`; a `needs_review`-flagged row is **excluded** from trusted reads and the cast does not cite it.
11. **As-of / cross-season.** An "as-of season N" standings read filters facts to `season <= N` and matches a fixture
    computed only through N, without mutating current stored rows.
12. **Isolation.** Every record/H2H/standings/milestone read is RLS-scoped; a league-A request returns zero league-B
    rows (the `specs/02` canary extends to per-manager and H2H routes).

## Dependencies / blocked-by
- **Builds on** `specs/06` (engine, identity, record tables), `specs/14` (deep faithful substrate, playoff/champ
  flags, co-owner identity, integrity/quarantine, recompute contract), and spec 19 (ingestion/recompute that fires
  the refresh).
- **Needs** Foundation (`specs/02`): Drizzle/RLS, Inngest, Redis cache, realtime.
- **Feeds** the AI cast (`specs/12`) and lore (`specs/13`/`18`) as faithful, queryable league fact.

## Non-goals
- No new record-computation engine — this deepens `src/stats` and adds surfaces + two aggregates, it does not replace
  the engine.
- No fantasy-points recomputation, projections, or keeper/draft-capital valuation (consume provider scores as truth).
- No cross-league/global records (league-sandboxed; the arena handles cross-league, `specs/15`).
- No final UI/voice polish — structured surfaces + functional cast/lore wiring now; surface-soul tuning waits for
  human-in-the-room direction (`docs/NORTH-STAR.md`).
