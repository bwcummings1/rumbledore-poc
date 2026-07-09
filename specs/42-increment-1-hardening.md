# Spec 42 — Increment 1 Hardening (review fixes for specs 36–41)

> Hardening spec from a 4-dimension read-only audit of `review/increment-1`. Two **file-disjoint** tracks:
> **H1 = data-logic correctness + test honesty**; **H2 = UI/integration/a11y**. Every finding has a location +
> the fix + an acceptance check. Read `ORCHESTRATION.md`, `AGENTS.md`, `DESIGN.md`, and the referenced
> `specs/36`–`41`. Base/integration branch: `review/increment-1` (off `main`; **`main` is never touched**).
> The structural layer (RLS policies, authz, route guards, wiring) was audited CORRECT — do not rebuild it; fix
> the specific items below. Severity drives order: do CRIT first, then HIGH, then MED/LOW as budget allows.

## Track H1 — Data-logic correctness + tests
Owns: `src/stats/*`, `src/ingestion/*`, `src/providers/espn/*`, `src/app/api/leagues/[leagueId]/curation/*`,
`src/app/api/leagues/[leagueId]/commissioner/*`, `src/db/*.test.ts`, `test/evals/*`, and a new
`src/stats/__fixtures__/`. Do NOT touch `src/navigation/*`, `src/components/*`,
`src/app/leagues/[leagueId]/members/*`, `src/onboarding/*` (Track H2).

### CRIT
- **H1-1 — All-play / expected-wins / luck ignore `scoring_period_span`** (`src/stats/engine.ts` ~1285, 1293–1335).
  `buildSeasonStats` keys all-play on `season:scoringPeriod`; a `span=2` matchup is counted as a single all-play
  week, inflating the sample and skewing `expectedWins`/`luck` (and `best_luck_season`/`worst_luck_season`/
  `luckiest_career`). **Fix:** weight all-play by `span` (treat the matchup as `span` weeks, or normalize
  `expectedWins`/`luck` per scoring period) per spec 36 §D ("matchup counts use the full matchup"); document the
  convention in a comment. **AC:** a fixture with a `span=2` week yields `expectedWins`/`luck` equal to the
  documented normalized equivalent, and luck records are span-invariant.
- **H1-2 — Non-`both` segment / era lens rebuilds hollow season rows** (`src/stats/records-catalog.ts` ~742–816,
  `derivedSeasonRowsFromWeeklyRows`). Under `segment ∈ {regular,playoff}` or an era lens, derived season rows
  hardcode `luck:0`, `longestWinStreak:0`, `finalRank:0`, `madeChampionship:false`, `playoffSeed:null`,
  `expectedWins:wins`, so "most wins in the regular season", "best luck in era 2", "regular-season titles in era X"
  return **0/empty** instead of the true slice. Fold in the `regularSeasonTitles` double-source (~563–576,
  1576–1583). **Fix:** derive segment/era-scoped season rows from real `seasonStatistics` (filter + re-rank within
  the season-set), carrying placement/luck/streak/seed through — do not rebuild hollow rows. **AC:** under
  `segment=regular` and era lenses, luck/streaks/finalRank/championships/regularSeasonTitles match hand-computed
  fixture values (non-zero where expected).
- **H1-3 — ESPN ingestion hard-codes `scoringPeriodSpan=1`** (`src/providers/espn/client.ts` ~710–747, 493–518).
  `normalizeMatchup` always sets `span=1`/`periodStart=scoringPeriod`; the matchupPeriod→scoringPeriod mapping is
  never used, so a two-week ESPN final is silently `span=1` on the live path (spec 36 §D / AC7 "auto" half unmet).
  **Fix:** derive `scoring_period_span` + `period_start` from ESPN's matchupPeriod↔scoringPeriod schedule mapping.
  **AC:** an ESPN fixture with a multi-week matchup normalizes to `span=N` (test with a crafted/`95050` fixture).

### Tests & CI honesty
- **H1-4 [CRIT] — Fixture oracle skips in CI** (`src/stats/records-catalog.test.ts:1047`, `engine.test.ts:1328`;
  guarded `existsSync("/home/ubuntu/espn-api-old-2024/scripts-output") ? it : it.skip`). Spec 36 AC5/AC6/AC9/AC10 +
  37 AC3 do not run on a clean clone. **Fix:** vendor a minimal **secret-scrubbed** subset into
  `src/stats/__fixtures__/old-league/` — files/fields: `ffl-totals/team_stats_{season}.json`
  `{team_name,owner_name,total_points_for,total_points_against,end_of_season_rank,end_of_season_record}`;
  `ffl-matchups/processed_matchups_{season}.json` + `ffl-playoffs/processed_playoff_matchups_{season}.json`
  `{home/away_team_name,home/away_team_owner,home/away_team_score,week}` (string ranges like `"15-16"` carry the
  two-week span). Scrub real handles (`bradwcummings`, `Squyres18`, `truman1109`, `MONROE_REBS`, `Mark Kent
  Anderson`, `w hardy`, …) to stable pseudonyms via a consistent map; re-pin the tests' expected `personName`s to
  the pseudonyms but **keep the numeric oracle values** (e.g. `325`, `192.7`, `247.5`). Default the tests to the
  vendored copy (external path only a fallback). **AC:** the oracle tests RUN (not skip) with the external path
  absent; `pnpm secret-scan` clean on the vendored files.
- **H1-5 [CRIT] — New tables absent from the RLS canary** (`src/db/rls-canary.test.ts`, `src/db/rls.test.ts`).
  `league_data_edits`, `league_season_groupings`, `league_grouping_seasons` are not in the two-league
  row-isolation canary nor the `leagueScopedTables` catalog list (spec 36 AC14 / 38 AC5). **Fix:** add them to
  `leagueScopedTables`; add canary cases — from league A assert (1) an unfiltered scan returns zero league-B rows
  and (2) a WITH CHECK write of a league-B row is rejected, for all three tables. **AC:** canary + catalog cover
  the three tables.
- **H1-6 [HIGH] — Inconsistent week key** (`src/stats/engine.ts` ~858–862): `rankWeeklyFacts` groups by
  `periodStart ?? scoringPeriod`, `buildSeasonStats` all-play by `scoringPeriod`. **Fix:** one canonical week key
  (`periodStart ?? scoringPeriod`) in both. **AC:** weekly ranks + all-play use the same partition under `span>1`.
- **H1-7 [HIGH] — `confirmLeagueSeasonGrouping` no write-time validation** (`src/stats/curation.ts` ~936–1021):
  accepts unknown seasons + same-`kind` overlap, caught only post-hoc by the integrity check (which then blocks the
  render). **Fix:** validate seasons belong to the league and reject (or explicitly, documentedly warn) same-kind
  overlap at write time. **AC:** confirming with an unknown season or same-kind overlap is rejected with a clear
  error.
- **H1-8 [HIGH] — Unified ledger drops correction/identity rows under a target filter** (`src/stats/curation.ts`
  ~1071–1079): a target-scoped drawer shows zero `data_correction_audit_log`/`identity_audit` entries. **Fix:**
  filter those rows BY the same target rather than excluding wholesale. **AC:** a target-filtered ledger includes
  the relevant correction/identity entries.
- **H1-9 [HIGH] — Era lens not restricted to confirmed; empty era masquerades as cumulative**
  (`src/stats/records-catalog.ts` ~2132–2138, 2308–2321): a `proposed`/empty grouping → `seasonSet=[]` →
  `isDefaultLens` true → silently returns all-time. **Fix:** expand only `status='confirmed'` groupings;
  distinguish "no era selected" from "era selected, zero seasons" (return the empty slice). **AC:** selecting an
  empty/proposed era does not silently return cumulative.
- **H1-10 [HIGH] — AC13 integrity checks untested** (`src/stats/engine.ts` ~2662 `grouping_season_coverage`, ~2779
  `data_edit_ledger_completeness`). **Fix:** add a test that triggers each `fail`. **AC:** both have a failing-case
  test.
- **H1-11 [HIGH] — Agent↔engine seam mocked** (`src/ai/personal-agent.test.ts` ~242–255 injects a mock context
  loader). **Fix:** an integration test calling `getPersonalAgentAnswer` with the real default
  `loadLeagueQuestionContext` over a seeded league + confirmed era; assert the era/segment answer matches the
  engine's lens output. **AC:** real-seam test passes. *(`src/ai/personal-agent.ts` is shared — coordinate so H2's
  ambient-agent UI work doesn't collide; H1 owns `personal-agent.ts`/`.test.ts`.)*
- **H1-12 [MED] — No `best_ball` format test** (spec 36 AC8; everything sets `format_type:"traditional"`).
  **Fix:** add a test declaring `format_type:"best_ball"` asserting a slice is produced without a traditional-only
  break.
- **H1-13 [MED] — Agent eval is a no-op for the agent** (spec 41 AC5; `test/evals/.../offline.test.ts` judges only
  the cast). **Fix:** add a regression test asserting the agent always cites and never asserts un-ratified history
  for a data answer (or an offline judge case).
- **H1-14 [MED] — Global/no-league agent branch untested** (`src/ai/personal-agent.ts` ~672). **Fix:** add a
  global-scope question test.
- **H1-15 [MED] — Auto-detection over-sensitive** (`src/stats/curation.ts` ~709–756): flags every scoring tweak as
  an era boundary. **Fix:** add a magnitude/heuristic threshold so it doesn't over-segment (toward the known
  10→10-minus-one→12, OP→flex history); keep it general/parameterized. **AC:** over the vendored fixture, proposed
  eras are a sane count, not one-per-tweak.
- **H1-16 [LOW] — `optionalInteger` accepts negative boundary fields** (`src/stats/curation.ts` ~138–146). **Fix:**
  positivity guard on scoring-period boundary fields.
- **H1-17 [LOW] — `curation/edits` route trusts client `editClass`** (`src/app/api/leagues/[leagueId]/curation/
  edits/route.ts`). **Fix:** server-side force `editClass="substantive"` for substantive fields rather than
  trusting the body.

## Track H2 — UI / integration / a11y
Owns: `src/navigation/*`, `src/components/*`, `src/app/leagues/[leagueId]/members/*`, `src/onboarding/*`, and
related UI views. Do NOT touch `src/stats/*`, `src/ingestion/*`, `src/providers/*`, `src/ai/personal-agent.ts`,
the curation/commissioner API routes (Track H1).

- **H2-1 [HIGH] — Public ledger is member-visible but not member-REACHABLE** (`src/onboarding/stewards.ts` ~52–59;
  `src/app/leagues/[leagueId]/invite/league-invite-view.tsx` ~166–198 — `DataStewardDoorwayCard` returns `null`
  for plain members, so there's no nav path to `/members/steward` where the league-visible ledger lives). **Fix:**
  add a member-visible "Public ledger" entry point (on the Members surface and/or Records/League home)
  deep-linking to the ledger (`/members/steward#public-ledger` or equivalent), independent of the steward doorway.
  **AC:** an ordinary member has a discoverable path to the public ledger.
- **H2-2 [HIGH] — `navigation-shell.test.tsx` (all 12 tests) fail in isolation** (`window`/`localStorage`
  undefined; `renderToString` SSR + shared module state vs jsdom). The spec-39/40 shell acceptance tests (env tab
  rendering, wire-toggle persistence, scope switcher) aren't truly green. **Fix:** repair the test harness (ensure
  jsdom `window` before the SSR import / reset shared module state) so the file passes in the suite and in
  isolation, without weakening assertions. **AC:** `navigation-shell.test.tsx` passes in isolation and in the full
  run.
- **H2-3 [MED] — Wire toggle hidden in the md–lg band** (`src/navigation/navigation-shell.tsx` ~1239–1245,
  `hidden … lg:flex`). **Fix:** keep a wire-toggle affordance (compact toggle or "open wire" control) in the md
  band. **AC:** md-width users have a visible wire toggle.
- **H2-4 [MED] — Touch targets <44px** (desktop rail rows `min-h-9` at `navigation-shell.tsx` ~962; ledger drawer
  close `size-9` in `data-steward-review-view.tsx`). **Fix:** bring new interactive controls to ≥44px per
  DESIGN.md. **AC:** the new interactive controls are ≥44px.
- **H2-5 [LOW] — Ambient panel `aria-modal` over-announces** (`src/components/ambient-agent/ambient-agent-panel.tsx`)
  — it's a bottom-right assistant, not a true modal. **Fix:** drop `aria-modal` or make it a non-modal
  complementary region (keep focus management). **AC:** no false modal semantics.
- **H2-6 [LOW] — Gated-state heading inconsistency** (`ambient-agent-panel.tsx` ~223 uses `font-display` vs
  `heading-auspex` at ~406). **Fix:** use `heading-auspex` consistently. **AC:** consistent headings (both remain
  plain solid, no gradient clip).

## Global acceptance (both tracks)
All gates green per `AGENTS.md` (typecheck, lint, test, build, `ubs`, secret-scan, `perf:pwa` for shell); **the
previously-skipped oracle tests and the shell tests now RUN green**; no regressions in the 939-test baseline; AUSPEX
fidelity (token-contract) preserved; no file-ownership violations between H1 and H2.

## Non-goals
- No new features beyond these fixes. No touching `main`. No flipping real keys (mock/$0). Auto-detection
  sensitivity is *improved* but final tuning remains a human-pass item (NORTH-STAR "surface soul later").
