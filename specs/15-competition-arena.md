# Spec 15 — The Competition Arena (sportsbook spectacle + league-vs-league)

> Outcomes spec. WHAT, not HOW. Read `docs/NORTH-STAR.md` first — this spec exists to honor it.
> Builds **on** `specs/08-betting.md` (the engine: `bet_slips`/`bet_legs`/`bankroll_ledger`/`betting_event`/`market`/
> `odds_snapshots`, odds-lock placement, `game.final` settlement, the central arena) and `specs/12-ai-cast.md`
> (the Betting-Advisor persona, `bet.settled` reactions). It turns a working-but-skeletal betting engine + bare arena
> into the **third layer of the soul**: paper betting as the *engine* that reframes fantasy from individual-vs-individual
> to **also league-vs-league**. The mechanics are real (round one); this spec makes them a **spectacle** the members
> star in. **VOICE TUNING and final UI/UX polish are a later human-paired step** — the *functional* surfaces (bet slip,
> bankroll loop, arena seasons, rivalries, narration hooks) are built **now**, all testable against MOCK odds/results.

## The shift this spec makes (soul, not plumbing)
Round one built the betting *substrate* correctly — locked odds, an event-sourced ledger, the rolling-minimum, a
two-leaderboard arena — but the *experience* is a flat read-only board (`league-bet-view.tsx` lists markets you cannot
click) and a static ranking table (`arena-leaderboard-view.tsx`). There is **no bet slip**, no parlay builder, no bet
history, no sense that **your league is at war with other leagues**. The arena is a spreadsheet, not an arena.

This spec adds, as **structure + functional engines** (not styling):
1. A **browse-and-bet sportsbook**: a markets board you actually act on, a real **bet slip** (singles + parlays), and the
   **weekly rolling-minimum bankroll loop surfaced clearly** (this week's bankroll, what you can win/lose, the reset/carry).
2. **Market depth** where mock-feasible: moneyline / spread / total / player-prop framework, grouped per event.
3. **The Arena reframe** (the soul of Phase 2): league-vs-league **and** individual leaderboards, arena **seasons**,
   standings **movement**, **head-to-head** between leagues, and the rivalry dynamics that make "your league vs the field"
   feel alive.
4. **Engagement surfaces**: settlement notifications, standings-swing moments, and **AI-cast narration** of the betting
   rivalry (ties to `specs/12` — the Betting-Advisor, a Trash-Talker bet roast, an **arena recap**).

Everything new is league-scoped (`WHERE league_id` + RLS) except the **central arena** (the one cross-league surface,
open-read aggregates only). The legal posture from `08` (play-money, no prizes, no sportsbook branding, license-don't-scrape)
holds verbatim.

---

## 1. The sportsbook experience (browse → slip → place)

### 1.1 The markets board (EXISTS, shallow → CHANGES, interactive)
- **Exists:** `getLeagueBetData()` (`src/betting/league-bet.ts`) returns up to 24 open markets with the latest snapshot
  per market, derives `selections` per market type, and renders a non-interactive `MarketCard` list. `recentSlips`
  shows the last 5 as bare text. The view (`league-bet-view.tsx`) shows a bankroll number with no loop framing.
- **Changes:** the board **groups markets by `betting_event`** (game), not a flat market list. Each event card shows the
  matchup, kickoff, status, and a **row per market type** (moneyline / spread / total) with **tappable price buttons**;
  player props live behind a per-event "More" disclosure. Tapping a price **adds a selection to the bet slip** (it does
  not place anything). A selected price is visibly "in the slip." The board reads only `status='open'` markets with a
  current snapshot (suspended/settled markets render as locked, not tappable) — matching `08` placement validation.
- The board is **derived state over mocked odds**: it reads the same `odds_snapshots` the placement path locks against,
  so what you tap is exactly what gets locked (§1.3). No new odds source; the mock `OddsProvider` fixtures are the contract.

### 1.2 The bet slip (NEW — singles + parlays)
A client-side **bet slip** accumulates selections, then submits one placement request. It is a thin UX over the existing
`placeBetSlip()` (`src/betting/placement.ts`) — **no new placement logic**; the slip just assembles its input.
- **Add/remove selections.** Each selection carries the `oddsSnapshotId` it was tapped from + a `selection`
  (`home|away|over|under|player_over|player_under|outcome`, the existing `BET_LEG_SELECTIONS`). The slip shows the locked-at
  price, the line, and the matchup for each.
- **Single vs parlay (auto).** 1 selection → `kind='single'`. ≥2 selections → `kind='parlay'`. The slip enforces the `08`
  rule **distinct markets per parlay leg** (a second selection on a market already in the slip *replaces* it, never stacks —
  no correlated same-market legs). The slip displays the **combined decimal odds** (`Π(leg decimal)`) and a live
  **potential payout** preview for the typed stake (`round(stake × combined_decimal)`), recomputed client-side but
  **authoritatively recomputed server-side** at placement.
- **Stake entry + bankroll guardrails.** A stake input validates against the **current running balance** (the latest
  `bankroll_ledger.running_balance_cents` for the active user-week, via `getCurrentBankrollBalance()`): a stake exceeding
  balance is blocked with a clear message *before* submit; quick-stake chips (e.g. 1/4, 1/2, Max) compute off the live
  balance. This is UX assistance only — the server re-validates (`08` placement) and is the source of truth.
- **Place.** Submit posts `{kind, stakeCents, legs[], idempotencyKey}` to a placement route that calls `placeBetSlip()`.
  The route is **atomic + idempotent** (`08`): one `idempotency_key` → one slip + legs + one `bet_stake` ledger debit; a
  retried submit (double-tap, network retry) returns the same slip and adds no ledger entry. On success the slip clears,
  the bankroll number updates from the new `running_balance_cents`, and the bet appears in **Open bets** (§1.4).
- **Stale-line handling.** If the chosen snapshot is no longer the latest within the freshness window
  (`DEFAULT_ODDS_FRESHNESS_MS`, `08`), the server rejects as stale; the slip surfaces a **"line moved — re-confirm"**
  prompt with the new price rather than silently placing at a changed line. Locked odds never change a placed bet (`08`).

### 1.3 Odds-lock is the contract (EXISTS — surface it)
The selection the user sees on the board **is** the snapshot that gets locked: the slip carries `oddsSnapshotId`, and
`placeBetSlip()` copies that snapshot's `locked_line` / `locked_american_odds` / `locked_decimal_odds` into the leg.
Subsequent odds polls (new snapshots) never alter a placed bet. The UX must make "locked at +145" legible on every leg.

### 1.4 Bet history + open bets (NEW surface; data EXISTS)
- **Open bets** — pending slips for the active user-week: per slip, the legs (matchup, selection, locked line/price), the
  stake, the potential payout, and a per-leg live status (the game's `betting_event.status`). A parlay shows which legs
  are still live vs already graded (for multi-game parlays spanning several `game.final`s, `08`).
- **Bet history** — settled slips (`won|lost|push|void|partial_void`) with the realized payout/refund and the `settled_at`,
  newest first, paginated beyond the current 5. Each settled slip links to its **settlement audit** (`settlements` row:
  outcome, payout, graded score/stat per leg via `bet_legs.result_detail`) so the grade is explainable, not magic.
- Extend `getLeagueBetData()` (or add a sibling loader) to return `openSlips` (with legs) and a paginated `settledSlips`;
  both stay **RLS-scoped** (`withLeagueContext`, `WHERE league_id` + `user_id`) — a member sees only their own slips.

### 1.5 The weekly rolling-minimum loop, made legible (EXISTS in ledger → CHANGES in surface)
The defining mechanic (`08`) is currently a single number with a floor caption. It must read as a **loop**:
- **This week's bankroll** — current `running_balance_cents`, the `floor_cents`, and the week window (`bankroll_weeks`).
- **What you can win / lose** — open-bet exposure (sum of pending stakes already debited) and potential return (sum of
  pending `potential_payout_cents`), so the member sees the week's swing range at a glance.
- **Reset vs carryover, explained before it happens** — surface the rule plainly: *finish above the floor → carry the
  balance forward; finish at or below the floor (incl. busted to ≤0) → reset to the floor next week.* When a week has
  rolled over, show the outcome auditable from the ledger (a `reset_to_floor` credit vs a carried `week_open`), so the
  member can see **why** this week opened where it did. No mutable balance is ever shown — every figure derives from the
  append-only `bankroll_ledger` (the single source of truth, `08`).
- **First-bet opens the week.** If no `bankroll_weeks` row exists, the surface explains the first placed slip opens the
  rolling-minimum week (matches current copy) — then the loop framing kicks in.

## 2. Market depth (mock-feasible)
The engine already types `moneyline | spread | total | player_prop` (`interfaces.ts`, `08`). This spec makes the **mock
provider fixtures populate all four per event** so the board has real depth to browse, and the slip can build cross-market
parlays:
- **Moneyline** — home/away American prices.
- **Spread** — handicap line + price per side.
- **Total** — over/under line + prices.
- **Player props (framework)** — `subject = player_id`, `prop_type` (e.g. `passing_yards`, `rushing_yards`,
  `receptions`), over/under line + prices. Settlement already grades props against the authoritative `ResultsProvider`
  player stat (`08`); the mock `ResultsProvider` fixtures must emit the matching `playerStats[]` so a prop can be graded
  end-to-end. Props are **grouped under their event** and gated behind a disclosure (they are the long tail).
- **No new market types** beyond these four (`08` non-goals stand: no live/in-play, no same-game-parlay correlation
  pricing, no teasers/boosts/round-robins). Depth = *more markets per game*, not *new bet kinds*.

## 3. The Arena — the league-vs-league reframe (the soul of Phase 2)

### 3.1 What EXISTS (the engine) vs what CHANGES (the spectacle)
- **Exists:** `arena.ts` materializes two leaderboards per `arena_season` — **league** (per-league aggregate) and
  **individual** (per-user across all their leagues) — from `bankroll_ledger` + `bankroll_weeks` across **all** leagues
  (open-read central query, no `current_league_id` filter). Metrics: net P&L vs floor, ROI (bps), current balance, weeks
  played/survived, win rate, settled/won/push-void slip counts. Recomputed on every settlement (`rebuildAllArenaStandings`
  in the `game.final` job) and rebuildable-from-ledgers (the acceptance invariant). The view ranks two static tables.
- **Changes:** the arena becomes a **rivalrous competition** with seasons, movement, head-to-head, and narration. None of
  this mutates the source of truth — every new figure is **derived from the same ledgers** and a rebuild-from-scratch must
  still match (the `08` arena invariant extends to everything below).

### 3.2 Arena seasons (EXISTS as table → CHANGES into a lifecycle)
`arena_seasons` and `ensureArenaSeason()` exist. This spec gives a season a **legible lifecycle**:
- A season is a named window (`name`, `startsAt`, `endsAt`) the standings are computed over (the metric SQL already filters
  `bankroll_weeks.week_start` into the window). The arena surface shows the **active season**, its window, and a way to view
  **prior seasons' final standings** (immutable once the window closes — a historical record, like league records in `06`).
- Standings are **recomputed (materialized) on each settlement + each weekly rollover** and published to the central
  realtime channel for live updates (`08`). The surface shows `computedAt` ("as of") so liveness is honest.

### 3.3 Standings movement (NEW — derived, not stored mutably)
A ranking with no memory is a spreadsheet. The arena must show **movement**:
- Each materialized standings row already carries a `rank`. Add a **rank delta** vs the **prior materialization** (or prior
  week boundary) per subject — up/down/even — computed by diffing the current `arena_standings` against the previous
  computed snapshot for the same season. (`arena_standings` is replaced per rebuild today; to show movement, either retain
  the immediately-prior snapshot or stamp a `prior_rank` at rebuild time — implementation's choice, but the delta must be
  **derivable from ledgers + history**, never a hand-edited field.)
- The surface highlights **movers** (biggest rank jumps/falls since last week) — these are the **standings-swing moments**
  that feed engagement (§4) and the AI arena recap (§4.3).

### 3.4 Head-to-head between leagues (NEW)
The reframe is "your league vs other leagues" — so the arena must support a **direct head-to-head** comparison:
- Given two `league_id`s in the same season, compute a head-to-head: each league's aggregate net P&L vs floor (and ROI /
  win rate / weeks-survived), who leads, and the margin. This is a pure read over the same per-league aggregates `arena.ts`
  already computes — no new source data, just a pairwise view.
- The surface offers **"your league vs. <league>"** (default: the next league above/below yours in the league leaderboard —
  your natural rival) and a picker for any other league. This is the concrete artifact the Trash-Talker/Betting-Advisor
  narrate (§4.3): *"NHS Alumni are up $4,200 on the field this week; the league directly ahead of you is bleeding."*
- **Isolation holds:** head-to-head exposes **aggregates/rankings only** (net P&L, ROI, ranks) — never another league's raw
  bet slips. Per-league betting data stays RLS-scoped; only the arena crosses the boundary, and only as aggregates (`08`).

### 3.5 The two ladders, surfaced as rivalry
- **League leaderboard** — leagues ranked against each other (the new axis). Your league's row is pinned/highlighted; the
  rows immediately above/below frame the rivalry ("one good week and you pass them").
- **Individual leaderboard** — every player across all their leagues, ranked by net P&L vs floor (ROI / balance /
  weeks-survived as secondary sorts, matching `rankStandings`). A member sees where **they** stand against everyone, and
  where their **league-mates** stand (in-league pride/shame).
- Tie-breaks and sorts reuse the existing `rankStandings` order (net P&L → ROI → balance → win rate → stable id), so the
  arena is deterministic and rebuild-stable.

## 4. Engagement surfaces (the show reacts to the betting)

### 4.1 Settlement notifications (EXISTS → extend)
- **Exists:** the `game.final` settlement job (`src/jobs/functions/betting-settle-game-final.ts`) grades pending
  singles/parlays, writes idempotent `settlements`, credits the ledger, **rebuilds arena standings**, fires a push
  (`league.bet.settled`, `PUSH_EVENTS`), and emits `bet.settled` job events (which `specs/12` consumes for AI reactions).
- **Extends:** the settlement notification carries the **outcome that matters to the member** — won/lost/push, the realized
  payout/refund, and the resulting bankroll (the new `running_balance_cents`). It deep-links to the settled slip's audit
  (§1.4). Notifications stay **RLS-scoped + membership-checked** (`09`/push), per-league, deduped (one notification per
  slip settlement, keyed by `slip_id`, idempotent like the settlement itself).

### 4.2 Standings-swing moments (NEW)
A settlement or weekly rollover that **moves the arena ranks** (a league passing another, a member cracking the top of the
individual board, a bust dropping someone) is a **swing moment**: the arena rebuild already runs on settlement/rollover, so
swing detection diffs the new ranks against the prior snapshot (§3.3) and emits a typed signal (a `arena.standings.swing`
event / a realtime broadcast on the central arena channel) carrying the subject, old/new rank, and the move. This drives
the live leaderboard update **and** the AI arena recap (§4.3). Swing detection is **derived + idempotent** (re-running a
rebuild for the same state emits no duplicate swing).

### 4.3 The AI cast narrates the rivalry (ties to `specs/12`)
The arena is only a spectacle if the **cast performs it**. Per `12`, the **Betting-Advisor** persona and `bet.settled`
reactions already exist; this spec gives them concrete **content types + triggers** for the betting/arena beat:
- **Bet-settled reaction** (`bet.settled` → Trash-Talker / Betting-Advisor): roasts a brutal beat-bad-beat, salutes a
  hit parlay, needles a busted bankroll — grounded in the *real* slip (the manager, the legs, the swing). Already wired as
  a `12` event; this spec confirms it consumes the real `BetSettledData` (the manager, outcome, payout).
- **Arena recap** (NEW content type, `arena_recap`, default Betting-Advisor or Narrator): a recurring column over the
  **league-vs-league** state — who's winning the field this week, the head-to-head with your rival league (§3.4), the
  biggest individual movers (§3.3), and a needle ("you're 6th of 9 leagues; do something"). Triggered on `post-odds-refresh`
  / weekly rollover / a big standings swing (§4.2). It is **central-arena-aware** but per-league-published (it talks *to*
  your league *about* the field) — so it reads arena aggregates (open-read) yet writes a league-scoped `content_item`,
  honoring isolation (it names other leagues only as aggregates/ranks, never their raw bets — same boundary as §3.4).
- **Pre-week betting card** (`post-odds-refresh` → Betting-Advisor): "value" plays over the mocked board — confident-but-
  hedged, **play-money framing only**, never real-sportsbook language (`12` constraint). Degrades gracefully when no open
  markets exist.
- All cast output stays under the `12` invariants: league-scoped, grounded (cite a real manager/slip/standing), no
  cross-league leakage, the LLM-judge eval gate applies. **Voice tuning is later/human-paired** — the engine emits the
  structured `arena_recap`/reaction now; the mock LLM is the deterministic contract.

## 5. Legal guardrails (inherited from `08`, non-negotiable)
- **No real prizes / no real money / no purchasable bankroll.** Winnings are cosmetic — leaderboard standing + bragging
  rights only. The arena ranks pride, not payouts. No cash-out, no real-world value.
- **No sportsbook trademarks/branding.** No DraftKings/FanDuel/etc. names, logos, or trade dress in the product UI.
  "Sportsbook-style" is an internal design reference only. The Betting-Advisor never uses real-book language (`12`).
- **License odds; never scrape a book.** Odds come only via the licensed `OddsProvider` (mock now / The Odds API later);
  results via the licensed `ResultsProvider` (mock / SportsDataIO). No scraping of any book's site/app.
- Play-money + no prize keeps legal risk low (`docs/PROGRESS.md` §6); these constraints must hold. The slip and the arena
  copy must never imply real wagering.

## 6. What EXISTS vs CHANGES (cite real modules)
| Area | Exists (round one) | This spec changes/adds |
|---|---|---|
| Markets board | `src/betting/league-bet.ts` `getLeagueBetData()`, `league-bet-view.tsx` (read-only list) | Group by event; tappable prices; props disclosure |
| Bet slip | — (no slip; markets are inert) | Client slip (singles+parlays), stake guardrails, placement route over `placeBetSlip()` |
| Placement | `src/betting/placement.ts` `placeBetSlip()` (odds-lock, atomic, idempotent, stale-window) | **Unchanged** — slip is a thin caller; surface stale/idempotency states |
| Bankroll loop | `src/betting/bankroll.ts` (ledger, rollover, `getCurrentBankrollBalance`) | Surface the loop: balance/floor/exposure/win-lose/reset-vs-carry, all ledger-derived |
| Bet history | `recentSlips` (last 5, bare) | Open bets w/ legs + paginated settled history linking `settlements` audit |
| Market depth | 4 types typed; mock fixtures shallow | Mock fixtures populate ML/spread/total/props per event end-to-end (incl. results playerStats) |
| Arena ladders | `src/betting/arena.ts`, `arena-leaderboard-view.tsx` (2 static tables) | Seasons lifecycle, rank movement, head-to-head, rivalry framing |
| Settlement notify | `betting-settle-game-final.ts` push `league.bet.settled` + `bet.settled` events + arena rebuild | Carry outcome/payout/new-balance; standings-swing signal |
| AI narration | `12` Betting-Advisor + `bet.settled` reaction | `arena_recap` content type + pre-week card + swing-triggered recap |

## 7. Acceptance criteria (testable against MOCK odds/results fixtures, deterministic)
1. **Slip placement with locked odds (single).** Build a slip from a board selection; place it → exactly one slip + one
   leg + one negative `bet_stake` ledger entry; the leg's `locked_*` equals the tapped snapshot. Append a NEW snapshot with
   a different line; re-read the placed leg → `locked_*` and `potential_payout_cents` unchanged (`08` AC1).
2. **Parlay builder (distinct markets).** Add ≥2 selections across distinct markets → `kind='parlay'`,
   `combined_decimal_odds = Π(leg decimal)`, `potential_payout_cents = round(stake × combined)`. Adding a second selection
   on a market already in the slip **replaces** the prior leg (no correlated same-market legs). Placement validates and
   debits once.
3. **Stake guardrail + idempotency.** A stake exceeding the live `running_balance_cents` is rejected with no ledger entry;
   a valid stake appends one `bet_stake` and the new balance is correct. Re-submitting the same `idempotency_key` returns
   the same slip and writes no second ledger entry (`08` AC2/AC7).
4. **Bankroll loop across a week.** Drive a user across a week boundary on fixtures: busting to ≤0 → next week opens at
   `floor_cents` with an auditable `reset_to_floor` entry; finishing above the floor → the exact balance carries (`week_open`).
   The surface loader reports balance/floor/exposure consistent with replaying the ledger (`08` AC5).
5. **Open bets + history + audit.** Pending slips appear in open bets with per-leg live status; after `game.final`, the slip
   moves to history with the realized payout/refund and links a `settlements` row whose per-leg `result_detail` matches the
   mock result. Push/void leg in a parlay drops + reprices (`08` AC4) and the history shows it (`partial_void`).
6. **Market depth end-to-end.** The mock board exposes moneyline/spread/total/prop markets for an event; a cross-market
   parlay (e.g. spread + total + prop) places, and `game.final` grades every leg (the prop against the mock
   `ResultsProvider` player stat) and settles the slip.
7. **Arena ranks ≥2 leagues with movement + head-to-head.** Seed ledgers for two leagues; the central arena computes both
   league and individual leaderboards; a **rebuild-from-ledgers matches** the materialized standings (`08` AC6). A second
   rebuild after a settlement that changes order yields a non-zero **rank delta** for the moved subject, and a head-to-head
   between the two leagues reports the correct leader + margin from the same aggregates. Per-league queries under RLS still
   cannot read the other league's raw bet rows.
8. **Settlement → notification → narration.** A `game.final` on a fixture settles the slip, fires one (idempotent,
   slip-keyed) `league.bet.settled` notification carrying outcome + payout + new balance, emits `bet.settled`, and (per
   `12`, mock LLM) yields a grounded Betting-Advisor/Trash-Talker reaction naming the real manager + outcome; a
   rank-changing settlement additionally emits one (idempotent) standings-swing signal that drives an `arena_recap`. No
   duplicate notifications/recaps on a re-run (idempotent like settlement).
9. **Isolation + legal.** Head-to-head and the arena recap expose only aggregates/ranks (no other league's raw slips);
   a missing `WHERE league_id` on any league-scoped read is blocked by RLS; no UI string implies real money/prizes or uses a
   real sportsbook name.

## 8. The human-polish boundary (built now vs tuned later)
Built **now** (functional, gate-tested on mocks): the bet slip + parlay builder + placement route; the bankroll-loop loader
(balance/floor/exposure/reset-vs-carry); open bets + settled history + audit links; mock fixtures with full market depth
incl. prop results; arena seasons lifecycle, rank movement, head-to-head, swing signals; the `arena_recap` content type +
betting/arena triggers wired into the `12` cast. **Deferred** to human-in-the-room direction: final **UI/UX polish** of the
slip/board/arena (visual taste, motion, AUSPEX-fidelity per `docs/design/rumbledore-design-language.md`), final **voice tuning** of the Betting-Advisor/arena-recap
wording (`12` non-goal), and any **real odds/results keys** (mocks are the contract; real adapters drop in behind the
existing `OddsProvider`/`ResultsProvider` interfaces).

## 9. Dependencies / blocked-by
- **Spec 08 (Betting):** the engine this spec surfaces — `betting_event`/`market`/`odds_snapshots`, `placeBetSlip`,
  `bankroll_ledger`/rollover, `game.final` settlement, the central arena. **Unchanged**; this spec is the experience layer.
- **Spec 12 (AI Cast):** Betting-Advisor + Trash-Talker personas, `bet.settled` reactions, the content-type/eval framework
  the `arena_recap` plugs into. Degrades gracefully if a persona is disabled.
- **Spec 09 / Realtime + Push:** the central arena realtime channel (live standings), per-league push (settlement notifs),
  membership-guarded grants — all exist; this spec adds the swing signal + richer settlement payload.
- **Stats/records + identity (`06`):** supply the manager names the cast grounds bet roasts/arena recaps in.
- Real `OddsProvider`/`ResultsProvider`/Anthropic keys are **not** required to build or test — mocks default ON (`08`/`12`).
