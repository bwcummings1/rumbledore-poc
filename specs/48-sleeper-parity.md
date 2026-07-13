# Spec 48 — Sleeper Decoding Dictionary + Substrate Parity

> Outcomes spec. Sleeper is the **shortest path to a second real provider**: public JSON API, no OAuth, no
> keys, `authKind:"none"` — yet today it is effectively 0% for a real user: the adapter
> (`src/providers/sleeper/client.ts`) is wired into the real pipeline but ships **no decoding dictionary, no
> player identity resolution, no stat breakdowns, no draft picks, no fixture provider**, and the
> `provider_code_decoding` integrity check silently no-ops for it. This spec closes those gaps to "a real
> Sleeper league imports with the same loud-failure guarantees ESPN has." Depends on `specs/47 §A`'s
> unknown-provider invariant (land that first — Sleeper's dictionary should plug into an already-loud check).
> All work is $0 (Sleeper's API is free and public); live verification against real public Sleeper leagues is
> in scope (read-only, rate-limited).

## Outcomes

1. **A Sleeper decoding dictionary exists** (`src/providers/sleeper/reference-data.ts`) with the same closure
   posture as ESPN's: positions, roster slots, NFL teams, transaction/activity types, and scoring-settings
   keys — enumerated from Sleeper's public docs + `/players/nfl` + community clients, with provenance.
2. **Player identity resolves:** roster entries carry attached `NormalizedPlayer`s (real Sleeper player ids,
   names, decoded positions, pro teams) instead of bare id strings.
3. **Draft picks and per-player scoring import** where Sleeper exposes them (`getDraftPicks` implemented;
   weekly player points from matchup `players_points`).
4. **Standings honesty:** provider-reported standings/placements used where Sleeper exposes them
   (playoff bracket endpoints), `regular_season_fallback` only as the labeled fallback it is.
5. **The integrity suite is as loud for Sleeper as for ESPN:** `provider_code_decoding` covers Sleeper via
   the registry; capability probe (`specs/47 §D`) declares what a given Sleeper league actually exposes.
6. **A fixture Sleeper provider exists** (`fixture-sleeper.ts`, mirroring `fixture-yahoo.ts`) so onboarding
   e2e and tests exercise Sleeper without the network, and service tests reach ESPN-level depth.
7. **Verified against real public Sleeper leagues** (read-only): at least two league shapes (one with
   history chain via `previous_league_id`, one current-only) import green with integrity PASS and evidence
   appended to `.orchestration/import-summary.md`.

## A. Dictionary + registry
- **NEW:** `src/providers/sleeper/reference-data.ts` — typed maps + decoders in the ESPN pattern:
  `SLEEPER_POSITION_MAP` (QB/RB/WR/TE/K/DEF + IDP + FLEX-composites), `SLEEPER_ROSTER_SLOT_MAP`
  (`roster_positions` vocabulary incl. `FLEX`, `SUPER_FLEX`, `WRRB_FLEX`, `REC_FLEX`, `IDP_FLEX`, `BN`,
  `IR`, `TAXI`), `SLEEPER_PRO_TEAM_MAP`, `SLEEPER_TRANSACTION_TYPE_MAP` (trade/waiver/free_agent/commissioner),
  scoring-settings key map (`scoring_settings` vocabulary). Sources: Sleeper API docs, `/players/nfl` dump,
  community clients — provenance-annotated like `specs/47 §A`.
- **Register** in `PROVIDER_DECODING_DICTIONARIES` (`src/providers/decoding.ts`) so
  `providerCodeDecodingIssues` actually inspects Sleeper imports (the `specs/47 §A` invariant makes absence
  loud; this makes presence real). Unknown-code coverage test: a synthetic unknown slot/position fails the
  check.

## B. Player identity + depth
- **NEW:** a cached `/players/nfl` resolution step (the dump is large and Sleeper asks for ≤1 fetch/day —
  cache to disk/fixture in dev/tests; the adapter consumes a `SleeperPlayerCatalog` interface) mapping
  player ids → name, position, team. Roster entries and matchup `players_points`/`starters` map to
  `NormalizedRosterEntry.player` + weekly actual points; D/ST ids (`"DEF"`-style team codes) handled like
  ESPN's negative-id convention (document the mapping).
- **NEW:** `getDraftPicks` via `/draft/<draft_id>/picks` (drafts listed per league); map to
  `NormalizedDraftPick` (round, slot, keeper flag where present).
- **Stat breakdowns:** Sleeper exposes weekly `players_points` (fantasy points) but not full stat-line
  breakdowns on the league endpoints — declare what's available honestly via the `specs/47 §D` capability
  map (`stat_breakdown_coverage` records declared-absent detail, not failure).

## C. Standings, history, fixtures, tests
- Use playoff bracket endpoints (`/league/<id>/winners_bracket`, `losers_bracket`) to derive final
  standings/champion where present; keep `regular_season_fallback` labeled.
- History chains via `previous_league_id` already work (`getHistory`) — extend tests to cover a multi-season
  chain with changing `roster_positions` vocabulary across seasons.
- **NEW:** `src/providers/sleeper/fixture-sleeper.ts` + deepened fixtures (`test/fixtures/sleeper-*`):
  bring service-level tests to ESPN parity (≥5 service cases), onboarding e2e path for Sleeper connect
  against the fixture provider.
- Identity rule (house, binding): same-season provider team slots stay separate people even when owner ids
  overlap — Sleeper co-owners (`co_owners`) are the canonical case; regression-test it here.

## D. Acceptance criteria
1. Dictionary closure tests pass (every fixture/corpus code decodes; synthetic unknown fails loud).
2. Real-league verification: two public Sleeper leagues (read-only) import green — rosters carry named,
   position-decoded players; draft picks persisted where the league drafted; integrity suite PASS with
   capability-map-declared absences; evidence in `.orchestration/import-summary.md`.
3. Fixture provider drives onboarding e2e + service tests (≥ ESPN service-case depth); no network in tests.
4. `provider_code_decoding` for a Sleeper league is a real check (regression: unregistering the dictionary
   fails it via the `specs/47 §A` invariant).
5. Data Book Weeks renders a Sleeper fixture league's rosters with player names/slots; Record Book builds
   from pushed Sleeper canon without ESPN-specific assumptions leaking (no `unknown` positions).
6. Gates green (typecheck/lint/test/build/ubs/secret-scan; e2e for the onboarding path); no `MOCK_*` flags
   touched; Sleeper API calls rate-limited + user-agent-identified.

## Non-goals
- Yahoo parity (own spec later — needs owner's Yahoo developer-app registration + zod validation pass);
  Sleeper OAuth-only features (none needed); real-time Sleeper webhooks; IDP scoring-projection depth beyond
  what league endpoints expose.
