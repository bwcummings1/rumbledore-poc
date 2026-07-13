# Spec 47 — Ingestion Bulletproofing (enumerate the input space)

> Outcomes spec. The ESPN data core is validated against exactly **one** league (`espn`/`95050`) — high
> confidence for leagues shaped like it, unknown for everything else. A closed beta would *sample* the input
> space; this spec **enumerates** it instead: vendor the full provider vocabulary, harvest real public-league
> shapes into a CI oracle, generate the schema space with property-based tests, *measure* per-league data
> availability instead of predicting it, and shadow-run every new connect through the full integrity suite
> before the league goes live. All work is **$0 / no keys** (public reads + fixtures + generators). Read
> `docs/NORTH-STAR.md` first; live state → `docs/PROGRESS.md`. Builds on the T13 clean-import guarantee, the
> T15 decoding dictionaries + coverage invariant, and the T19 chunked-reconciliation fix. The 2026-07-10
> incident (unchunked season-scale insert found by real data, not tests) is the cautionary tale: **shape and
> volume properties belong in tests, not in production surprises.**

## Why this spec exists (the honest posture)

Stated to the owner 2026-07-11: ESPN ingestion fails LOUD (integrity gates) rather than corrupting for
unknown league shapes — but "unknown" is most of the space. Old-era vocabularies (`TQB`, `WR/TE`, `D/ST`,
`PK`), exotic scoring configs, tiny/huge leagues, keeper/auction drafts, co-owner overlaps, and provider
payload drift have never been exercised. The weakest links for a stranger's league are the parts only real
variety would test. This spec converts "validated on one league" into "validated against the enumerated
input space" without spending a dollar or onboarding a single beta user.

## Outcomes

1. **The decoding dictionaries are provably complete against the vendor's own vocabulary** — any code ESPN's
   clients can emit that we can't decode is a failing test, not a runtime surprise.
2. **A vendored corpus of real public-league payload shapes replays through the import pipeline in CI** — new
   league shapes become oracle rows, not incidents.
3. **Property-based tests generate the schema space** — size, era vocab, sparsity, volume (the bind-param
   crash class), identity overlap — and prove import idempotence + loud failure over all of it.
4. **Every league carries a measured capability map** (season × data-class availability), persisted at
   import and read by every surface — adaptability = measure, don't predict.
5. **A new connect shadow-runs the full import + integrity suite before the league goes live**; failures
   quarantine with steward-visible detail and captured (sanitized) payloads that feed the corpus.
6. **Payload-drift canaries** notice when the provider changes shape under us — additive drift surfaces as
   an alert, not as silent decay.

---

## A. Vendor vocabulary enumeration (dictionary closure)

- **NEW:** a vendored vocabulary corpus `src/providers/espn/__vocabulary__/*.json` — the full ESPN
  fantasy vocabulary enumerated from ESPN's own web client bundles and the mature community clients
  (`cwendt94/espn-api`, `mkreiser/ESPN-Fantasy-Football-API` — code + issue trackers), each entry with a
  `source` provenance field. Cover: position ids, lineup-slot ids, pro-team ids, activity/transaction codes,
  scoring-stat ids, and the league-format enums the importer reads via `mSettings` (scoring type, playoff
  seeding, divisions, keeper/auction draft types) — including the **old-era vocabulary** (`TQB`, `WR/TE`,
  `D/ST`, `PK`-era codes) already proven present in 2011–2013 payloads.
- **NEW:** closure tests that diff the corpus against `ESPN_POSITION_MAP` / `ESPN_LINEUP_SLOT_MAP` /
  `ESPN_PRO_TEAM_MAP` / `ESPN_ACTIVITY_MAP` / `ESPN_PLAYER_STAT_KEY_MAP` / `buildScoringStatMap()`
  (`src/providers/espn/reference-data.ts`): every corpus code must decode; every dictionary entry should
  trace to a corpus source (orphans get a documented-exception list, not silence).
- **NEW — unknown-provider invariant:** `providerCodeDecodingIssues` (`src/providers/decoding.ts`) currently
  returns `[]` for providers absent from `PROVIDER_DECODING_DICTIONARIES`, making the `provider_code_decoding`
  integrity check a **silent no-op** for Sleeper/Yahoo. Change the contract: a provider with imported
  numeric-coded data but no registered dictionary yields an explicit `dictionary_missing` failure (or a
  declared `not_applicable` status where the provider genuinely ships no numeric codes) — never a silent pass.
  This is the doorway for the Sleeper dictionary work (next spec/wave) to plug into.

## B. Public-league corpus harvester (build now; live runs owner-gated)

- **NEW:** `scripts/harvest-public-leagues.ts` — read-only, rate-limited (bounded RPS + jitter + hard
  request budget), **no cookies** (public leagues only): given `(leagueId, seasons[])`, fetch exactly the
  views the importer uses (`mSettings`, `mTeam`, `mMatchupScore`, `mBoxscore`, `mRoster`,
  `kona_player_info`, `mDraftDetail`, `mTransactions2`), **sanitize** (member GUIDs → deterministic salted
  pseudonyms; display names → generated aliases; strip emails/avatars), and write corpus entries under
  `test/fixtures/espn-corpus/<leagueHash>/<season>/<view>.json` with a provenance header (league-id hash,
  season, view, fetchedAt, contentHash, harvester version).
- **NEW:** a corpus-replay CI oracle: every corpus entry runs zod-parse → normalize → decode-coverage →
  `persistNormalizedLeagueRows` + `reconcileImportedProviderTruth` against a test DB, then the integrity
  drafts (`buildDataIntegrityCheckDrafts`) — assert no throw, no `unknown` decode, loud (not silent) failure
  on any malformed entry. Failures name the league-shape + view that broke.
- **⚠ Owner gate:** this spec builds and fixture-tests the harvester; **no live harvest run happens until
  the owner completes a deliberate ESPN ToS review and approves target counts.** The harvester refuses to
  run without an explicit `--i-reviewed-tos` acknowledgment flag (mirroring the `--reset-league` guard
  pattern from `scripts/import-real-league.ts`).

## C. Property-based generative tests (the schema space)

- **NEW dep:** `fast-check` (dev-only). Generators (arbitraries) over the normalized model
  (`NormalizedSeasonBundle` and parts, `src/providers/model.ts`), covering at minimum: league sizes 4–20,
  season lengths + playoff structures (incl. two-week playoff spans — the "325" class), era position
  vocabularies (`TQB`, `WR/TE`, `D/ST`, `PK`), sparse/missing views (no transactions, no draft, no player
  depth — the 2018–2025 reality), negative D/ST player ids, co-owner/member-id overlaps (same-season team
  slots must stay distinct people), unicode/duplicate names, zero-score weeks, and **volume-scale bundles**
  (season-scale roster/stat row counts that would overflow the pg 65,535 bind-param cap if chunking ever
  regresses — the e60842e class).
- **Invariants proven over generated input:**
  1. **Idempotence:** import twice → identical row sets (`persistNormalizedLeagueRows` +
     `reconcileImportedProviderTruth`).
  2. **Scoped reconciliation:** re-importing season S never mutates rows of other seasons/leagues.
  3. **Volume safety:** any generated volume persists without bind-param overflow.
  4. **Loud failure:** malformed/inconsistent bundles produce explicit `fail` integrity drafts or typed
     errors — never a silent partial import.
  5. **Identity separation:** generated co-owner overlaps never collapse distinct same-season team slots.
  6. **Decode coverage:** any generated out-of-dictionary code yields a `provider_code_decoding` fail.
- **Runtime posture:** seeded + bounded run budget in the main suite (CI-friendly); a deeper run behind an
  env flag (`PROPERTY_RUNS=...`) for nightly/dispatch use. DB-backed properties follow house rules
  (`migrateSerialized()`, no `Promise.all` on one tx, 30s budget).

## D. Capability probe + declared coverage map (measure, don't predict)

- **EXISTS — extend:** `recordDataCoverage()` (`src/ingestion/current-league.ts`) already records coverage
  observations. Promote this into a durable, league-scoped **declared capability map**: per
  `(league, season, data-class)` — availability (`full | partial | none`), row counts, probe timestamp,
  provider verdict (e.g. "provider returns empty for this season×view" ≠ "we never asked").
- **NEW:** a post-import **capability probe** step that walks season × data-class (the
  `PROVIDER_DATA_CLASSES` matrix) and persists the map; re-probe on re-import/sync (append-observations,
  latest-wins reads).
- **Surfaces read the map instead of predicting:** integrity checks (`roster_coverage`,
  `stat_breakdown_coverage`, `player_points_rollup`) parameterize expectations by declared coverage —
  provider-absent seasons record as *declared-absent detail*, matching the T14 "skipped detail" posture,
  ending false-negative pressure on leagues shaped differently than 95050; Data Book Weeks and the Record
  Book player categories state their season basis from the map (e.g. "player depth: 2011–2017 + current —
  measured, provider-limited"); steward Data Book Settings gains a small read-only coverage panel (AUSPEX,
  per `DESIGN.md`).
- **RLS:** new table(s) league-scoped with `pgPolicy` + hand-added `FORCE ROW LEVEL SECURITY` in the
  hand-written migration + `_journal.json` entry + RLS canary rows the same round (house rules; note
  drizzle meta snapshots are frozen at 0034 — **never run `db:generate`**).

## E. Shadow-run connect + payload-drift canaries

- **NEW — shadow-run:** the connect/import flow (`jobs/functions/import-requested.ts` + onboarding
  services) gains a **pre-live gate**: full import + `runDataIntegrityChecks()` complete BEFORE the league
  flips visible/live. Any `fail` → the league enters a **quarantined** onboarding state: steward/owner sees
  the failing checks (reuse the steward integrity surface), the offending payload views are captured
  **sanitized** (same sanitizer as §B) into a quarantine corpus dir for oracle replay, and the league never
  half-appears. Passing → live, as today. Idempotent re-runs; quarantine is exit-able by re-import after a
  fix (or steward `reviewed` per existing flow).
- **NEW — drift canaries:** a scheduled Inngest job re-fetches a small canonical view set (settings + one
  scoreboard week) for each connected league (dev: the fixture league; the real league only where creds
  already exist), zod-parses and compares schema-shape + normalized `content_hash` against the previous
  observation; **additive/semantic drift** (parse still passes but shape/hash class changed) records a
  drift-alert row surfaced on the steward integrity panel. Zod failures already fail loud; canaries catch
  the quiet kind. Mock-friendly: in mock/dev the canary runs against fixtures and asserts stability.

## F. EXISTS / NEW inventory

- **EXISTS — build on, do not fork:** `FantasyProvider`/`Normalized*` model (`src/providers/model.ts`);
  ESPN dictionaries + decoders (`src/providers/espn/reference-data.ts`); decoding registry
  (`src/providers/decoding.ts`); `syncCurrentLeague`/`persistNormalizedLeagueRows`/`reconcileImportedProviderTruth`/
  `recordDataCoverage` (`src/ingestion/current-league.ts`); `importLeagueHistory`
  (`src/ingestion/historical-import.ts`); integrity engine (`buildDataIntegrityCheckDrafts`/
  `runDataIntegrityChecks`, `src/stats/engine.ts`) + steward review surface; Inngest job plumbing;
  `migrateSerialized` test support; the `--reset-league`-style guard pattern.
- **NEW:** vocabulary corpus + closure tests; harvester script + sanitizer + corpus-replay oracle;
  fast-check generators + invariant suite; capability-map table + probe + surface reads; quarantine state +
  drift-canary job + alert rows. New tables: capability map, drift observations/alerts (league-scoped RLS +
  FORCE + canaries; hand-written migrations + journal entries).

## G. Acceptance criteria (testable, fixture-backed)

1. **Closure:** vocabulary-corpus diff tests pass; removing any dictionary entry or adding a corpus code
   makes them fail with the exact missing code named.
2. **Unknown-provider invariant:** an imported league whose provider has no registered dictionary yields an
   explicit `provider_code_decoding` failure/`dictionary_missing` (regression test per provider), never `[]`.
3. **Oracle:** the corpus-replay suite runs green over all vendored fixtures in CI; a deliberately mutated
   corpus entry fails loud with view-level attribution.
4. **Harvester:** unit-tested against fixtures — rate-limit + budget honored, sanitizer provably removes
   GUIDs/names/emails (property test on the sanitizer), refuses to run live without `--i-reviewed-tos`.
5. **Properties:** all six §C invariants hold over seeded generated input in CI; the volume property fails
   if row-chunking is removed (proven by mutation, then kept as a regression test).
6. **Capability map:** import of the standard fixture league persists a map matching its known shape;
   integrity checks read it (a declared-absent season produces skipped-detail, not `fail`); Data Book/Records
   surfaces state their season basis from it; RLS canaries cover new tables.
7. **Shadow-run:** a fixture league that fails an integrity check on connect never becomes visible, lands in
   quarantine with the failing checks + captured sanitized payloads; a clean fixture connect goes live
   unchanged; re-import exits quarantine.
8. **Canary:** identical re-fetch → no alert; a shape-mutated fixture re-fetch → drift-alert row visible on
   the steward panel.
9. **Real-league verification (read-only):** post-implementation, the shared dev league `espn`/`95050`
   re-syncs green: capability map matches the documented 2011–2017+current player-depth reality, all
   integrity checks PASS, zero `unknown` decodes; evidence appended to `.orchestration/import-summary.md`.
10. **Gates:** typecheck / lint / test / build / (+`perf:pwa` if UI touched) / `ubs` / secret-scan all green;
    no `MOCK_*` flag touched; no live harvest run.

### Needs the later human pass
ToS review + harvest-target approval (owner); coverage-panel copy; quarantine-state UX copy; canary alert
routing beyond the steward panel (ties into spec 46 §G credential-death alerting).

## Dependencies / blocked-by
- None blocking within this spec ($0, fixtures + generators). §B live harvesting is **owner-gated** (ToS).
- §A's unknown-provider invariant is the **prerequisite hook** for the Sleeper decoding-dictionary spec
  (next wave): Sleeper parity work should land its dictionary against an already-loud check.
- §D's map is additive to the snapshot/canon model — it does NOT enter pushed canon (it is operational
  metadata, not curated fact); Record Book reads it only for *basis labeling*, never for record values.

## Non-goals
- Real API keys / paid providers (Phase 4); hosted cookie capture (Browserbase stays mock); Sleeper/Yahoo
  dictionary parity (own spec/wave); live-NFL-week soak testing; production deployment (spec 46 §G);
  crawling private leagues or anything requiring credentials we don't hold; harvesting at scale before the
  owner's ToS review.
