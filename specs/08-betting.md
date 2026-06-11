# Spec 08 — Paper Betting & Central Arena

> Outcomes spec. WHAT, not HOW. Canonical vision/stack: `docs/PROGRESS.md` (§1, §4, §6 research). Architecture: `specs/01-architecture.md` (Betting engine, Tenancy).
> Done = a user places single + parlay slips against real (mocked) odds with locked lines; `game.final` settles them (incl. push/void); the event-sourced ledger applies the weekly rolling-minimum; the central arena ranks ≥2 leagues — all behind green gates.

## Purpose
A DraftKings/FanDuel-style **paper-money sportsbook**: real licensed odds, fake money, no real prizes. Each league has its own isolated bankrolls and bet history. A **central inter-league arena** aggregates results across ALL leagues into league-vs-league and individual leaderboards. The defining mechanic is the **weekly rolling-minimum bankroll** (floor e.g. $10,000): lose down to ≤0 → reset to the floor next week; finish above the floor → carry the balance forward.

## Data model
All amounts are integer **cents** (no floats). All money state derives from `bankroll_ledger`; there is **no mutable balance column** anywhere.

- **events** (central, cross-league catalog): `id`, `provider`, `provider_event_id` (unique per provider), `sport` (`nfl` only for MVP), `home_team`, `away_team`, `start_time`, `status` (`scheduled | in_progress | final | postponed | canceled`), `home_score`, `away_score`, `last_updated`. Events are shared NFL games; leagues reference them, they are not league-scoped.
- **markets** (central): `id`, `event_id`, `type` (`moneyline | spread | total | player_prop`), `subject` (team or `player_id` for props), `prop_type` (e.g. `passing_yards`, null for game markets), `period` (`full_game` for MVP), `status` (`open | suspended | settled | void`). One market has many time-ordered odds snapshots.
- **odds_snapshots** (central, **append-only**, time series): `id`, `market_id`, `captured_at`, `provider`, `line` (point/total/handicap, null for moneyline), `over_price` / `under_price` or `home_price` / `away_price` / `outcome_price` (American odds), `source_payload_hash` (dedup identical pulls). Never updated or deleted; settlement and placement both read specific rows by `id`.
- **bet_slips** (league-scoped, `league_id`): `id`, `league_id`, `user_id`, `bankroll_week_id`, `kind` (`single | parlay`), `stake_cents`, `potential_payout_cents` (computed from locked odds at placement), `combined_decimal_odds`, `status` (`pending | won | lost | push | void | partial_void`), `placed_at`, `settled_at`, `idempotency_key` (unique). Stake validated against current running balance (see bankroll).
- **bet_legs** (league-scoped, `league_id`): `id`, `slip_id`, `market_id`, `odds_snapshot_id` (the snapshot whose price was **copied/locked**), `selection` (e.g. `home`/`away`/`over`/`under`/`player_over`), `locked_line`, `locked_american_odds`, `locked_decimal_odds`, `status` (`pending | won | lost | push | void`), `result_detail` (graded score/stat). A single slip has one leg; a parlay has ≥2.
- **bankroll_ledger** (league-scoped, `league_id`, **append-only event log**, the single source of truth): `id`, `league_id`, `user_id`, `bankroll_week_id`, `seq` (monotonic per user-week), `entry_type` (`week_open | bet_stake | bet_payout | bet_refund | reset_to_floor | adjustment`), `amount_cents` (signed: debits negative, credits positive), `running_balance_cents` (balance after this entry), `ref_slip_id` (nullable), `created_at`. Running balance is materialized in each row for O(1) reads but is fully reconstructable by replaying `amount_cents`.
- **bankroll_weeks** (league-scoped): `id`, `league_id`, `user_id`, `week_start`, `week_end`, `opening_balance_cents`, `floor_cents`, `closing_balance_cents` (null until rollover), `closed`. One row per user per betting week.
- **settlements** (audit, league-scoped): `id`, `slip_id`, `results_provider`, `results_payload_hash`, `graded_at`, `outcome`, `payout_cents`, `notes`. Idempotent: a slip settles at most once (unique on `slip_id`).
- **arena** (central, cross-league): `arena_seasons` (`id`, `name`, `start`, `end`) and `arena_standings` — a computed/materialized view over ledgers across all leagues. Two leaderboards: **league** (aggregate per `league_id`) and **individual** (per `user_id`). Metrics: net P&L vs floor, ROI, current balance, weeks survived, win rate. Recomputed on settlement + weekly rollover; never the source of truth (always derivable from ledgers).

RLS: `bet_slips`, `bet_legs`, `bankroll_ledger`, `bankroll_weeks`, `settlements` are league-scoped (`app.current_league_id`). `events`, `markets`, `odds_snapshots`, `arena_*` are central/open-read.

## Odds ingest
- **`OddsProvider` interface** (mockable, default mock per `MOCK_*` env): `listEvents(sport) → Event[]`, `getMarkets(eventId) → Market[]`, `getOdds(eventId) → OddsQuote[]`. Real adapter = **The Odds API**; mock serves deterministic fixtures.
- Markets supported: **moneyline/h2h**, **spread**, **total (over/under)**, **player props**.
- An **Inngest cron** polls the provider on an interval (denser near `start_time`); each pull **appends** rows to `odds_snapshots` (never mutates). Identical consecutive pulls are deduped via `source_payload_hash` (skip the insert) so the series stays meaningful.
- Suspended/closed markets stop accepting new bets (`market.status = suspended | settled`) but their snapshots remain for already-placed legs.
- Odds are **licensed, never scraped from a sportsbook** (see Legal).

## Placement (odds-lock)
- A user builds a **bet slip**: one selection (single) or ≥2 selections (parlay). For each selection the client references a specific `odds_snapshot_id` (the price the user saw).
- On placement the server **copies the chosen snapshot's line + price into the bet leg** (`locked_line`, `locked_american_odds`, `locked_decimal_odds`). Subsequent line moves (new snapshots) NEVER change a placed bet.
- **Validation:** stake > 0; stake ≤ current running balance (latest `bankroll_ledger.running_balance_cents` for that user-week); every referenced market is still `open`; parlay legs reference distinct markets (no correlated same-market legs); the referenced snapshot is the latest for its market within a freshness window (else reject as stale and prompt re-confirm).
- **Parlay payout:** `combined_decimal_odds = Π(leg.locked_decimal_odds)`; `potential_payout_cents = round(stake_cents × combined_decimal_odds)`.
- Placement is **atomic + idempotent** (one `idempotency_key`): in a single transaction, write `bet_slips` + `bet_legs` and append a `bet_stake` ledger entry (negative `amount_cents`, new `running_balance_cents`). A retried request with the same key is a no-op returning the existing slip.

## Settlement (grading rules)
- **`ResultsProvider` interface** (mockable): `getEventResult(providerEventId) → { finalStatus, homeScore, awayScore, playerStats[] }`. Real adapter = **SportsDataIO**; mock serves fixtures. This is the **authoritative** source for scores + player stats (odds providers are NOT trusted for results).
- **Trigger:** the `game.final` event (emitted when an event flips to `final` — see `specs/01-architecture.md` jobs). One Inngest function grades every pending leg on that event, then every slip that has no remaining pending legs.
- **Per-leg grading:**
  - **moneyline** — leg wins if the picked side won; loss otherwise; tie (rare) → push.
  - **spread** — apply `locked_line` to the picked side; > 0 win, < 0 loss, exactly 0 → **push**.
  - **total** — combined score vs `locked_line`: over/under win/loss; exact → **push**.
  - **player_prop** — authoritative player stat vs `locked_line`, same over/under logic; exact → push.
- **Edge cases:**
  - **Push** (leg ties the line): refund that leg. Single → slip `push`, refund full stake (`bet_refund` ledger credit = stake). Parlay → the leg is **dropped** and the parlay is **repriced** on the remaining legs (`combined_decimal_odds` recomputed; `potential_payout_cents` updated); slip stays `pending` until all legs grade.
  - **Void / postponed / canceled** (no valid result, e.g. `postponed`): treat like a push for parlays (**drop the leg, reprice**). Single → slip `void`, full refund. If ALL legs of a parlay void/push → slip `void`/`push`, full stake refunded.
  - **One losing leg loses the whole slip:** any `lost` leg → slip `lost` immediately (no payout, stake already debited at placement). Remaining pending legs in that slip need not be graded for the slip outcome (grade them for audit if available).
  - A slip with all remaining legs `won` (after drops) → slip `won`; append `bet_payout` ledger credit = `potential_payout_cents` (recomputed final). `partial_void` status marks a won parlay that had ≥1 dropped leg.
- **Idempotent:** settlement writes a `settlements` row keyed by `slip_id`; re-running `game.final` (or settling a multi-game parlay across several finals) never double-credits. A parlay spanning multiple games only finalizes when its **last** game goes final.

## Rolling-minimum bankroll
- A **betting week** is the unit (aligned to the NFL week). Each user has one `bankroll_weeks` row per week and a stream of `bankroll_ledger` entries within it.
- **Weekly rollover** (Inngest cron at week boundary) closes the prior week and opens the next per user:
  - `closing_balance_cents` = last `running_balance_cents` of the prior week.
  - **Opening rule:** `opening_balance_cents = max(prior_running_balance, floor_cents)`. Concretely: finish **above** the floor → carry the balance forward; finish **at or below** the floor (incl. ≤ 0, e.g. busted) → **reset to the floor**.
  - Rollover appends a `week_open` entry (and, when a reset occurs, a `reset_to_floor` entry making the credit auditable) so the new `running_balance_cents` = `opening_balance_cents`.
- The **ledger is the single source of truth.** Current balance = latest `running_balance_cents` for the active user-week. No code path mutates a stored balance; every change is a new append-only entry. Reconstructing any historical balance = replay `amount_cents` in `seq` order.
- A user can never bet more than their current running balance (enforced at placement), so a week can reach exactly 0 but not go negative from betting; the reset still applies for the next week.

## Arena / leaderboards (central, cross-league)
- The arena is a **central surface**, explicitly NOT league-scoped — it is the ONLY place per-league betting data is aggregated. It reads `bankroll_ledger` + `bankroll_weeks` across ALL leagues (open-read central query, no `app.current_league_id` filter).
- **Individual leaderboard:** rank users across all their leagues by net P&L vs floor (and ROI / current balance / weeks-survived as secondary sorts).
- **League leaderboard:** aggregate each league's members (e.g. mean or median net P&L vs floor, or total) to rank league-vs-league.
- Recomputed (materialized) on each settlement and each weekly rollover; always fully derivable from ledgers (a rebuild from scratch must match). Published to the central realtime channel for live leaderboard updates.
- Per-league betting UI shows only that league's data (RLS-enforced); only the arena crosses the boundary, and it exposes aggregates/rankings, not another league's raw bet history.

## Legal constraints
- **No real prizes.** Winnings are cosmetic — leaderboard standing and bragging rights only. No cash-out, no real-world value, no purchasable bankroll.
- **No sportsbook trademarks/branding.** Do not use DraftKings/FanDuel/etc. names, logos, or trade dress in the product UI. "DraftKings-style" is an internal design reference only.
- **License odds; never scrape a sportsbook.** Odds come exclusively via the licensed `OddsProvider` (The Odds API). Results via licensed `ResultsProvider` (SportsDataIO). No scraping of any book's site/app.
- Play-money + no prize keeps legal risk low (see `docs/PROGRESS.md` §6); these constraints must hold for the product to stay in that posture.

## Interfaces (mockable)
- **`OddsProvider`** — `listEvents`, `getMarkets`, `getOdds` (returns American odds + lines). Real: The Odds API. Mock: deterministic fixtures, default ON until `MOCK_ODDS=false` + key present.
- **`ResultsProvider`** — `getEventResult` (final status, scores, player stats). Real: SportsDataIO. Mock: fixtures, default ON until `MOCK_RESULTS=false` + key present.
- Both sit behind `src/core/env` `MOCK_*` toggles (per `specs/02-foundation.md`) so the app runs end-to-end on local Postgres/Redis + fixtures with no paid keys.

## Acceptance criteria (testable, with fixtures)
1. **Locked odds on placement:** place a single bet; assert the leg's `locked_*` equals the chosen snapshot. Append a NEW snapshot with a different line; re-read the placed leg — `locked_*` is unchanged and `potential_payout_cents` is unchanged.
2. **Stake validation:** a stake exceeding the current running balance is rejected and writes no ledger entry; a valid stake appends exactly one negative `bet_stake` entry and the new `running_balance_cents` is correct.
3. **Settle a single:** with a fixture result, a winning single appends a `bet_payout` credit = `stake × locked_decimal_odds` and sets slip `won`; a losing single sets `lost` with no payout.
4. **Settle a parlay incl. a push:** a 3-leg parlay where one leg **pushes** drops that leg, reprices on the other two, and (if both win) pays `stake × Π(remaining decimal odds)`; a parlay with any **losing** leg settles `lost`. Settlement is idempotent (re-running `game.final` does not double-credit).
5. **Rolling-minimum across a week boundary:** (a) a user who busts to ≤ 0 has next week's `opening_balance_cents == floor_cents` (with an auditable `reset_to_floor` entry); (b) a user who finishes above the floor carries the exact balance forward. Both verified by replaying the ledger.
6. **Arena ranks two leagues:** seed ledgers for two leagues; the central arena computes both individual and league leaderboards across all leagues; a rebuild-from-ledgers matches the materialized standings; per-league queries (under RLS) cannot read the other league's bet rows.
7. **Idempotency:** replaying a placement with the same `idempotency_key` returns the same slip and adds no ledger entry; settling an already-settled slip is a no-op.

## Dependencies / blocked-by
- **Foundation (P0, `specs/02-foundation.md`)** — Drizzle + Postgres + RLS, `MOCK_*` env toggles, Inngest scaffold, Result/error conventions.
- **Architecture (`specs/01-architecture.md`)** — `game.final` event source, central-vs-league tenancy model, realtime channels, jobs framework.
- **NFL events/schedule** — the `events` catalog (game schedule + `game.final` emission) which betting references; coordinate with ingestion/stats.
- Real `OddsProvider`/`ResultsProvider` keys are NOT required to build or test (mocks default ON).

## Non-goals (MVP)
- Real money / real prizes / purchasable bankroll of any kind.
- Non-NFL sports; in-play/live betting; cash-out before settlement; same-game-parlay correlation pricing.
- Bonuses, promos, odds boosts, teasers, round-robins.
- A real odds/results integration as a blocker — mocks are the contract; real adapters drop in behind the interfaces later.
