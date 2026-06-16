# Spec 32 — Feature Surfaces (AUSPEX composition of the real product)

> Phase 5 UI/UX overhaul. **No app code here** — this composes the AUSPEX visual language
> (`rumbledore-design-language.md`) into Rumbledore's real surfaces. Reads `28` (foundations/tokens/a11y),
> `29` (component library), `34` (chart/viz library), `30` (app shell), `31` (editorial register), `33`
> (cast/lore/onboarding). Restyles **existing** routes/views (cited per surface) — it does **not** change data
> contracts. North Star: the substrate is reachable always; the **cast/competition is the soul**; this makes the
> soul *look* like a Prime-Intellect-restraint × Sony-Y2K-hardware × sports-HUD production.
>
> Reads first: `docs/NORTH-STAR.md`; engines surfaced here — `specs/10` (IA/scopes/switcher), `15` (arena +
> sportsbook + rolling bankroll), `23`+`14` (records/history), `17` (entitlements/gates), `21` (central news).
> **Boundary:** Phase 5 is the visual system + restyle. Data shapes, loaders, voice tuning are NOT touched.

## 0. Conventions for every surface in this spec
- **Component cites** use spec-29 names (`<Panel>`, `<Cell>`, `<Tbl>`, `<StatTile>`, `<Lcd>`, `<Ladder>/<Pip>`,
  `<St>` status pill, `<Edge>`, `<Drawer>`, `<Sheet>`, `<Orb>`, `<Ticker>`, `<Skeleton>`, `<Empty>`, `<Banner>`,
  `<FeatureGate>`, `<KV>`, `<Segmented>`, `<Stepper>`, `<Toast>`, `<Breadcrumbs>/<Tabs>/<Pagination>`); **viz cites**
  use spec-34 generators (`line+area`, `multiLine`, `spark`, `bars`, `grouped`, `stacked`, `hbars`, `range`, `radar`,
  `scatter`, `histogram`, `gauge`, `donut`, `rings`, `equalizer`, `heatmap`, `bullet`, `nodeGraph`). Atmosphere
  (`.atmos`), bezel chrome (`.bezel`), and color semantics (lilac=primary/AI, **amber=value/money**, steel=data,
  jade=win, coral=loss) are inherited from `28`.
- **Responsive contract (all surfaces):** **Mobile** = single column, content-first, bottom tabs + scope sheet
  (`30`), sheets-over-drawers, ≥44px targets, collapsible sub-nav as `<Segmented>`/`<Tabs>` chips, ticker as
  tap-to-expand. **Tablet** = 2-col where it earns it, collapsible icon-rail (`30`), drawers return. **Desktop** =
  full multi-column HUD: persistent left rail (`30`), hero + ladder + side rails, drawers, hover-lift/focus-bloom.
- **Universal states (every surface renders all five, never a broken page):** **loading** (`<Skeleton>` matching the
  composed layout; `<Lcd>`/counts as shimmer, never spinner-only); **empty** (`<Empty>` on-brand with a CTA, not a
  dead end); **error** (`<Banner variant=error>` inline + retry; `src/app/error.tsx` restyled to AUSPEX as the
  boundary); **offline** (`src/app/offline/page.tsx` restyled; per-surface degraded banner "showing last synced",
  cached reads visible); **gated** (`<FeatureGate>` server-resolved locked CTA over the visible substrate — §6).
- **A11y contract (every surface, gate-tested):** full keyboard reach + visible **focus-bloom** ring; AA contrast on
  all text/chrome (verified vs `--void`); ≥44px touch targets; `prefers-reduced-motion` collapses count-up/draw-in/
  orb-spin/marquee/hover-lift to instant; charts carry a text/table equivalent; live regions announce settlement,
  swing, and placement results; tables are real `<table>` semantics with sortable headers (`29` `<Tbl>`).

---

## 1. LEAGUE HOME — the dashboard (the glanceable pulse)
**EXISTS:** `src/app/leagues/[leagueId]/league-home-view.tsx` (`LeagueHomeView`), loader `getLeagueHomeData`
(`src/home/league-home.ts`) → `LeagueHomeData` (`league`, `standings`, `currentMatchups`, `teams`, `records`,
`storylines`, `activation`, `totals`, `userRole`, `currentScoringPeriod`). Route `/leagues/[leagueId]` (`10` Home).
**NEW:** AUSPEX composition; no loader change.

### Composition (desktop 12-col under the `30` league shell)
- **This-week matchup HERO** (full-width top): the spec-29 **matchup-hero** pattern over `currentMatchups[]` for the
  user's team (`activation`). Two team rosters as opposing `<Cell>` stacks, large `<Lcd>` score readouts (lilac
  active / steel idle), a center `range` bar for win-probability/projection spread, kickoff/status as `<St>` pill.
  Pulls the `activation.castTeaser` into an `<Orb>`-fronted `.insight` strip ("the cast's read on your week").
- **Standings LADDER** (left-main): spec-29 **leaderboard** `<Tbl>` (rank · team · W-L-T · PF · PA · GB), sortable,
  hover-wash; the user's row pinned with `<Pip me>`; the **playoff line** drawn as a hairline divider; a `<Ladder>`
  pip-rail rendered on mobile in place of the wide table. Rank movement shown as up/down `<Edge>` chips.
- **Cast HEADLINES from The Press** (right rail): `storylines[]` as spec-29 **insight cards** (`.insight`, orb avatar
  per persona byline), each linking to `/leagues/[leagueId]/press/[postId]` (the `31` reading register). Top
  storyline gets a story-card lead treatment; the rest a compact river.
- **Bankroll LCD** (right rail, secondary): a compact **amber `<Lcd>`** stat tile previewing this week's balance/floor
  (links into §3 Bet); `15` rolling-minimum loop in glanceable form. Hidden gracefully if betting un-entitled (§6).
- **The LIVE WIRE** (persistent): spec-29 **`<Ticker>`** ("WIRE") of `ingest_event`/activity/scores — desktop = thin
  marquee under the hero; mobile = a single tap-to-expand row opening a `<Sheet>` of the full feed.
- **Side cells:** `teams[]` roster cell, `records[]` 6-tile preview (links §4), upcoming-matchup count `<KV>`.

### Responsive
- **Mobile:** hero (stacked teams, scores as paired `<Lcd>`), then standings as `<Ladder>` pips with a "full table"
  `<Sheet>`, then a single Press lead card + "more" link, bankroll as one amber stat, wire as the tap row.
- **Tablet:** 2-col — hero full width; standings + Press side-by-side; bankroll/records below.
- **Desktop:** the full HUD above.

### States
- **Loading:** `<Skeleton>` hero (two ghost rosters + ghost `<Lcd>`), 8-row ghost ladder, 3 ghost insight cards.
- **Empty (pre-import / no activation):** `activation` null → hide hero, show `<Empty>` "Your league is importing —
  history lands soon" with a status `<St>`; standings/records empty messages preserved from the existing view.
- **Error / offline:** inline `<Banner>` over the affected region only (e.g. wire offline) — standings/records still
  render from cache. **Gated:** bankroll LCD → `<FeatureGate>` mini-CTA; cast headlines → if `ai.cast.generate`
  unentitled, the Press rail shows the §6 "Unlock the cast" card, standings/records fully visible underneath.

### Acceptance
1. Hero renders the user's `currentMatchups` row with two scores and a win-prob `range`; reduced-motion disables the
   count-up but the final numbers are present. 2. Standings table is keyboard-sortable, AA-contrast, user row pinned;
   collapses to `<Ladder>` < tablet. 3. Pre-import `activation=null` shows the `<Empty>` import state, never a blank
   hero. 4. With betting un-entitled the bankroll tile is the locked CTA and Home still renders fully (no 500).

---

## 2. THE ARENA — league-vs-league (the new competition axis)
**EXISTS:** `src/app/arena/arena-leaderboard-view.tsx` (`ArenaLeaderboardView`), loader `getArenaLeaderboardData`
(`src/betting/arena.ts`) → `ArenaLeaderboardData` (`season`, `seasons[]`, `leagueStandings[]`, `individualStandings[]`,
`movers`, `headToHead`, `leagueOptions`, `computedAt`). Route `/arena` (Global, open-read, `10`). **NEW:** AUSPEX
rivalry framing per `15` §3.

### Composition (desktop)
- **Header / season strip:** "CENTRAL ARENA" eyebrow (`28` type), title, `computedAt` as an **"as-of" `<St>`** so
  liveness is honest (`15` §3.2). `seasons[]` as a `<Segmented>`/pill strip; prior seasons read-only.
- **Rivalry panel (the framing):** the **league-vs-league** head-to-head (`headToHead`) as a duel `<Panel>` — the two
  leagues facing, each net-P&L-vs-floor as an **amber `<Lcd>`**, a center `bullet`/`range` showing the margin and who
  leads, ROI/win-rate/weeks-survived as `<StatTile>` row. Rival selector (`leagueOptions`) defaults to the league
  directly above/below you (`15` §3.4); copy frames it ("one good week and you pass them").
- **League leaderboard** (`<Tbl>`): leagues ranked; your league's row pinned (`<Pip me>`), rows immediately
  above/below highlighted; **rank-movement** `<Edge>` up/down/even per row (`15` §3.3) with a `spark` of recent rank.
- **Individual leaderboard** (`<Tbl>`): every player across all their leagues by net P&L vs floor; league-mates
  subtly tagged for in-league pride/shame. Secondary sorts (ROI/balance/weeks) reuse `rankStandings` order.
- **Movement / swing rail:** `movers` (biggest jumps/falls) as **`<Edge>`-chipped insight cards** — the swing moments
  (`15` §4.2); a `multiLine` "race" chart of top subjects' rank over the season's weeks.
- **Charts (34):** rank-over-time `multiLine`; net-P&L distribution `histogram`; per-league ROI `hbars`.

### Responsive
- **Mobile:** rivalry panel as a stacked duel card (two amber `<Lcd>` + margin `bullet`), then `<Segmented>` toggle
  between League / Individual ladders rendered as `<Ladder>` pip-rails (tap a pip → row `<Sheet>`), movers as a
  horizontal swipe of `<Edge>` chips. **Tablet:** rivalry full-width; the two ladders as 2-col `<Tbl>`s; charts below.
- **Desktop:** full HUD as above.

### States
- **Loading:** ghost duel + two 10-row ghost ladders + ghost movers. **Empty:** no season → `<Empty>` "No arena
  season yet"; one materialized league → rivalry `<Empty>` "waiting for a second league to enter the field"; no
  movement → movers `<Empty>`. **Error/offline:** central-channel offline → "as-of" `<St>` goes stale-amber + banner;
  ladders render from cache. **Gated:** base arena is FREE (`17`); only `arena.advanced` (config-flagged) gates the
  rivalry/charts behind §6 — base ladders never gated.

### Acceptance
1. Two seeded leagues render both ladders with the user-league pinned; a rank-changing settlement shows a non-zero
   movement `<Edge>` and a swing card. 2. Head-to-head shows the correct leader + margin from aggregates only (no raw
   slips). 3. `computedAt` renders an honest "as-of"; stale → amber state. 4. Ladders collapse to `<Ladder>` rails
   < tablet, fully keyboard-navigable, AA contrast.

---

## 3. THE SPORTSBOOK — market board + Parlay Console + rolling bankroll
**EXISTS:** `src/app/leagues/[leagueId]/bet/league-bet-view.tsx` (`LeagueBetView`, client), loader `getLeagueBetData`
(`src/betting/league-bet.ts`) → `LeagueBetData` (`league`, `balance`, `markets[]`, `recentSlips[]`,
`firstBetFloorCents`); placement over `placeBetSlip` (`15` §1.2). Route `/leagues/[leagueId]/bet`. **NEW:** AUSPEX
board + the slip as the **"Parlay Console"** drawer/sheet + amber bankroll LCD loop. No placement logic change (`15`).

### 3a. The MARKET BOARD
- Markets **grouped by `betting_event`** (`15` §1.1): each event a `<Panel>` with matchup + kickoff + status `<St>`,
  then a **row per market type** (moneyline/spread/total) of **tappable price `<button>`s** (steel idle → lilac "in
  the slip"). Player props behind a per-event `<Tabs>`/"More" disclosure (`15` §2). Suspended/settled markets render
  as **locked** `<St>` chips, not tappable. Each price button shows the locked line/price; "locked at +145" stays
  legible (`15` §1.3). Tapping adds to the slip; never places.

### 3b. The PARLAY CONSOLE (the bet slip)
- The spec-29 **`<Drawer>` "Parlay Console"** on desktop/tablet (docks right); a bottom **`<Sheet>`** on mobile,
  with a sticky **"slip (N)"** FAB when collapsed. Contents: selection list (each leg = matchup · selection · locked
  line/price, removable); single→parlay auto (≥2 = parlay), combined decimal odds, **live potential-payout** `<Lcd>`;
  a stake `<Stepper>`/field with quick-stake `<chips>` (¼ · ½ · Max off live balance); inline guardrail `<Banner>` if
  stake > balance (before submit). Place = primary `<Button>` → loading state → success clears + `<Toast>`.
- **Stale-line state:** "line moved — re-confirm" `<Banner>` showing the new price (`BET_ODDS_STALE`); **insufficient
  funds** (`BET_INSUFFICIENT_FUNDS`) and **market closed** (`BET_MARKET_CLOSED`) each map to a distinct inline
  message. Idempotent re-submit (double-tap) shows the same result, no duplicate (`15` §1.2).

### 3c. The ROLLING-MINIMUM BANKROLL LOOP (amber LCD/stat)
- Headline **amber `<Lcd>`** = this week's `running_balance_cents`, with `floor_cents` + week window as `<KV>`
  caption. A **`bullet`/`gauge`** shows balance vs floor. `<StatTile>` row: **exposure** (pending stakes),
  **win/lose swing** (potential return vs at-risk), and the **reset-vs-carry** rule stated plainly *before* rollover
  (`15` §1.5). After a rollover, show the auditable outcome (`reset_to_floor` credit vs carried `week_open`). First-
  bet-opens-the-week copy when no `bankroll_weeks` row.

### 3d. OPEN BETS + HISTORY
- **Open bets:** per slip the legs (matchup/selection/locked price), stake, potential payout, per-leg live `<St>`
  (parlay legs: live vs graded). **History:** settled slips (`won/lost/push/void/partial_void`) as `<St>`-tagged
  rows, realized payout/refund + `settled_at`, **`<Pagination>`** beyond the current 5 (`recentSlips`), each linking
  its settlement audit (`15` §1.4).

### Responsive
- **Mobile:** board as stacked event `<Panel>`s; price buttons ≥44px; **slip = bottom `<Sheet>`** + FAB; bankroll a
  single amber `<Lcd>` + swing stat; open/history as `<Tabs>`. **Tablet:** board 2-col, slip as right `<Drawer>`,
  bankroll a 3-tile strip. **Desktop:** board (left, grouped) + persistent Parlay Console drawer (right) + bankroll
  loop bar across the top.

### States
- **Loading:** ghost event panels + ghost bankroll `<Lcd>`. **Empty:** no open markets → `<Empty>` "no open markets
  this week" (degrade gracefully, `15`); no slips → open/history `<Empty>`. **Error:** placement errors map to the
  three coded `<Banner>`s above; load error → retry banner. **Offline:** board read-only banner "can't place while
  offline", cached bankroll shown. **Gated:** base betting is FREE (`17`); never gated. (Cast pre-week "value" card,
  if present, sits in The Press, gated by `ai.cast.generate`.)

### Acceptance
1. Tapping a price adds exactly that snapshot to the slip; placing debits once; a new snapshot never changes a placed
   leg's locked price (UI reflects `15`/`08` AC1). 2. ≥2 distinct-market selections → parlay with combined odds + live
   payout; a same-market re-tap replaces, never stacks. 3. Stake > live balance is blocked inline with no submit. 4.
   Bankroll loop shows balance/floor/exposure/swing and the reset-vs-carry rule; reduced-motion disables the count-up.
   5. Mobile slip is a bottom sheet with ≥44px controls and a focus-trapped, keyboard-dismissible surface. 6. No UI
   string implies real money/prizes or names a real sportsbook (`15` §5 legal).

---

## 4. RECORDS & HISTORY — the league's mythology
**EXISTS:** `src/app/leagues/[leagueId]/records/league-records-view.tsx` (`LeagueRecordsView`, currently a flat tile
grid over `LeagueHomeData.records`). **NEW (per `23`):** structured record book + per-manager + H2H pages, AUSPEX.
Routes: `/records`, `…/records/managers/[personId]`, `…/records/h2h/[personAId]/[personBId]`.

### 4a. The RECORD BOOK (`/records`)
- Catalog **sections** (`23` §A) via `<Tabs>`/anchored nav: **All-time standings** (`<Tbl>`, sortable, sum-reconciled),
  **single-week highs/lows**, **single-season**, **streaks**, **championships/placement**, **blowouts/closest**,
  **draft/keeper milestones**. Each record = a **`<StatTile>`** (trophy glyph, label, value `<Lcd>`, holder · opponent
  · season · week context line); when broken, a "previous holder" `<KV>` shows the `previous_record_id` chain so it
  reads like a record book. `needs_review`/quarantined rows excluded (`23` §A). A "rivalries" teaser links 4c.

### 4b. PER-MANAGER PAGE (`/records/managers/[personId]`)
- Header: person (co-owners listed from `owner_history`), career line `<StatTile>` row. **Season-by-season** `<Tbl>` +
  a `line+area` of PF/PA over seasons. Records-held grid, championships/placements as `<Edge>`/medal chips, biggest
  high/low weeks, H2H ledgers list (links 4c). `<Breadcrumbs>` Records → Manager.

### 4c. HEAD-TO-HEAD PAGE (`/records/h2h/[A]/[B]`)
- The symmetric ledger as a **duel `<Panel>`** (mirrors §2's rivalry framing): W-L-T each side, total/avg points each
  side (`bars`/`grouped`), each side's series high, playoff/championship meetings, current/longest streak, last
  meeting. Canonical URL ordering (`23` §B.3). A league-wide "rivalries" index ranks pairs (closest/most-lopsided/
  highest-scoring/most-playoff) as `hbars`.

### Responsive
- **Mobile:** record book sections as collapsible accordions; tiles single-column; tables → stacked `<KV>` cards or a
  horizontally-scrollable `<Tbl>`; per-manager charts as `spark`. **Tablet:** 2-col tiles, tables full-width.
  **Desktop:** multi-column catalog grid + side nav of sections.

### States
- **Loading:** ghost tiles/tables. **Empty (pre-import):** existing "No records calculated yet — history is
  importing" `<Empty>` preserved. **Error/offline:** cached materialized rows render; banner on stale. **Gated:**
  records are FREE substrate (`17`) — never gated. (A "record broken" cast piece, if any, lives in The Press, §6.)

### Acceptance
1. Record book renders all `23` §A sections from materialized rows (no recompute on render); a broken record shows the
   previous holder. 2. Per-manager page renders career line + season table + held records + H2H links; co-owners shown
   under one person. 3. H2H page renders the symmetric ledger identically from either A/B orientation. 4. Tables are
   semantic, sortable, AA-contrast; collapse to cards on mobile. 5. RLS-isolated (no league-B rows on any route).

---

## 5. THE CENTRAL NEWS HUB
**EXISTS:** `src/app/news/news-hub-view.tsx` (`NewsHubView`), loader `getCentralNewsHubData` (`src/news/hub.ts`) →
`CentralNewsHubData` (`items[]`, `sections[]`, `forYourLeague`, `activeSection`, `activeTag`). Route `/news` (Global,
open-read, `10`/`21`). **NEW:** AUSPEX editorial **reading register** (`31`), not HUD-data.

### Composition
- This is the **calmer, lower-chrome editorial surface** (`31`): masthead "WIRE" eyebrow + section nav `<Segmented>`
  (NFL/Fantasy/Injuries/Rankings from `sections[]`). **Front** = `buildPublicationFront` shape (`21`): one **lead**
  story-card (large, dek, source byline), **2–4 secondaries**, then a **river** — *not* reverse-chron. The
  spec-29/31 **story-card** is the shared atomic unit; central items show `source` byline + canonical link (`21`).
- **"For your league" rail** (`forYourLeague`, only when a league is active): a horizontal strip of tailored
  story-cards framed for the active league (the bridge from `21`); isolation invariant — central rows only, one
  league's framing.
- **Section fronts** (`activeSection`) filter the same ranked set to one beat. Article pages
  (`/news/articles/[articleId]`) render the `31` long-form reading mode (persona/source byline, dek, typographic
  body, related). Atmosphere dialed down for legibility (`31`).

### Responsive
- **Mobile:** single column — lead, then secondaries stacked, then river; section nav as a scrollable pill row; rail
  as a swipe carousel. **Tablet:** lead full-width + 2-col secondaries. **Desktop:** lead + secondary grid + river
  multi-column, optional rail rail-right.

### States
- **Loading:** ghost lead + ghost secondary grid. **Empty:** "No central stories yet" / empty section front (degrade,
  never throw, `21`). **Error/offline:** cached front renders; "showing last synced" banner. **Gated:** the central
  hub is **open-read, never gated** (`10`/`21`) — even logged-out.

### Acceptance
1. Front renders exactly one lead, 2–4 secondaries, a river (not reverse-chron); a higher-importance older story can
   hold the lead. 2. Section nav filters to one beat; empty section → `<Empty>`, no throw. 3. "For your league" rail
   appears only with an active league and shows central rows only. 4. Reading mode is legible at AA contrast with
   reduced motion; reachable logged-out.

---

## 6. ENTITLEMENT / UPGRADE & GATED STATES
**EXISTS:** `src/app/leagues/[leagueId]/league-section-access-state.tsx` (`LeagueSectionAccessState`, gated layout);
`you-account-view.tsx` personal-agent blocked/active states; the `<FeatureGate>` server boundary (`17`). Resolver
returns typed reasons `ENTITLED · TIER_REQUIRED · EXPIRED · CAP_EXCEEDED · SUSPENDED · DEV_OVERRIDE` (`17`). **NEW:**
AUSPEX, graceful, never a broken page.

### Composition
- **`<FeatureGate>` locked card:** an on-brand `<Panel>` with a dimmed/blurred **preview of the feature behind glass**
  (the substrate stays visible per `17`), an `<Orb>` mark for cast features, a one-line value prop, and a primary CTA
  keyed to the typed reason: `TIER_REQUIRED` → "Unlock the cast for your league" / "Get your personal agent";
  `EXPIRED`/`SUSPENDED` → "Reactivate" with a quiet status note; `CAP_EXCEEDED` → "Weekly limit reached" non-alarming
  `<Banner>`. **No price** (pricing TBD/config, `17`).
- **Where gates render:** Home cast rail (§1), the personal-agent panel in You (§7), any `ai.cadence`/`ai.instigator`/
  `ai.lore.canonize` surface in The Press, and `arena.advanced` (if config-flagged) in §2 — each placing the locked
  card **over the still-visible substrate** (standings/history/records/reading always reachable, `17` graceful
  invariant). `DEV_OVERRIDE` never appears as a user-facing reason (dev-only).
- **Upgrade surface:** a calm informational `<Panel>` (tiers as capability sets, not prices) — wires the CTA to the
  future purchase flow (`17` non-goal: no checkout here); for now it explains FREE vs PREMIUM vs INDIVIDUAL.

### Responsive
- **Mobile:** full-width locked card with the preview compressed; CTA a full-width ≥44px `<Button>`. **Tablet/Desktop:**
  card inline in the feature's slot, substrate flowing around it.

### States
- This IS the state layer for other surfaces; itself: **loading** (ghost card), **resolved-allowed** (renders the
  real feature, gate transparent), **resolved-blocked** (the locked card by reason). Never 500/blank/half-rendered.

### Acceptance
1. A FREE league's Home renders standings/history/records normally with the cast area showing the locked CTA (`17`
   AC9) — no 500, substrate visible. 2. Each typed reason maps to its distinct copy/CTA; `DEV_OVERRIDE` is never
   shown. 3. `CAP_EXCEEDED` is a calm note, not an error. 4. Locked card is keyboard-reachable, AA-contrast, and the
   blurred preview is `aria-hidden` with a text alternative.

---

## 7. SETTINGS / ACCOUNT / DATA-STEWARD CONSOLE
**EXISTS:** `src/app/you/you-account-view.tsx` (`YouAccountView` → `YouAccountData`: identity, connected providers +
reconnect CTAs, personal-agent panel, notification prefs, installed leagues); `src/app/onboarding/reconnect-cta.tsx`;
data-steward views `src/app/leagues/[leagueId]/members/steward/data-steward-review-view.tsx` and lore steward
`…/lore/steward/lore-steward-review-view.tsx`. Routes `/you`, `/leagues/[leagueId]/members(/steward)`. **NEW:** AUSPEX.

### 7a. YOU / account (`/you`, Global)
- Header: identity `<Cell>` (avatar/presence, display name, email, verification `<St>`). **Connected providers**
  `<Panel>`: per connection a `<KV>` row (provider badge, status `<St>`, flow label, validated-at) + **reconnect CTA**
  (`reconnect-cta.tsx`) as `<Button>` when stale/expired. Connect ESPN/Sleeper/Yahoo buttons → onboarding (`33`).
  **Personal agent** panel = the §6 gate (`ai.individual.agent`): blocked → locked card; active → covered-league
  count `<Lcd>` + per-league matchup/press context. **Notification prefs** `<Switch>` rows. **Installed leagues** grid
  of league `<Cell>`s (provider/role) — `<Empty>` connect prompt if none.

### 7b. DATA-STEWARD CONSOLE (`/leagues/[leagueId]/members/steward`, role-gated `data_steward`+)
- A **work-queue `<Panel>`**: `needs_review`/integrity items as `<Tbl>` rows with provenance, merge/split/reassign
  actions (sticky MANUAL edits, `14`/`23`), each action a confirm `<Modal>`. Identity merge shown as a small
  `nodeGraph` (persons ↔ team-seasons). Lore-steward review (`…/lore/steward`) composes the same console shape over
  claim/vote/canon items (`33` owns lore submission/vote UI; this is the steward review surface).
- **Role gate:** non-steward sees `LeagueSectionAccessState` (restyled §6 card) — never the console.

### Responsive
- **Mobile:** account sections stacked accordions; steward queue as stacked review cards (action buttons ≥44px in a
  sticky footer per item). **Tablet:** 2-col account; steward queue table with a detail `<Drawer>`. **Desktop:** full
  account columns; steward console = queue `<Tbl>` left + detail/diff panel right.

### States
- **Loading:** ghost identity + ghost provider rows / ghost queue. **Empty:** no connections / no installed leagues /
  empty review queue → `<Empty>` with the right CTA. **Error:** reconnect failure → inline `<Banner>` + retry;
  steward action failure → `<Toast>` + row stays. **Offline:** account read-only banner; steward actions disabled with
  a note. **Gated:** personal agent → §6 card; steward console → role-gated access card.

### Acceptance
1. Connected-providers rows show correct badge/status/validated-at; a stale connection shows the reconnect CTA. 2.
   Personal-agent panel renders blocked-by-reason or active-with-coverage (§6). 3. Steward console renders only for
   `data_steward`+; a non-steward gets the access card, not the queue. 4. A steward action is confirm-gated and
   reflects success/failure inline; sticky MANUAL edits survive recompute (`14`). 5. All `<Switch>`/buttons keyboard-
   operable, ≥44px, AA contrast; reduced-motion honored.

---

## 8. Cross-surface acceptance (the impeccable gate)
1. **Every surface** renders all five universal states (loading/empty/error/offline/gated) without a blank/500/half-
   render — asserted per surface above and as a shell-level snapshot set. 2. **Every surface** passes the a11y
   contract: keyboard reach + focus-bloom, AA contrast vs `--void`, ≥44px targets, `prefers-reduced-motion` collapsing
   all motion, chart text-equivalents, semantic tables. 3. **Every surface** is correct at mobile/tablet/desktop
   breakpoints (presence + active-state assertable; visual taste is the human pass per North Star). 4. **No surface**
   changes a data contract — each cites its existing loader/route/view and only restyles + composes. 5. **Isolation/
   legal** hold verbatim: league surfaces RLS-scoped; arena/news show aggregates/central rows only; no real-money or
   real-sportsbook language anywhere (`15` §5). 6. Color semantics carry meaning everywhere (amber=money only,
   lilac=primary/AI, jade/coral=win/loss) — never decorative.

## 9. Dependencies / boundary
- **Visual system:** `28` (tokens/type/motion/a11y), `29` (components), `34` (charts), `30` (shell/nav), `31`
  (editorial register), `33` (cast/lore/onboarding surfaces). **Engines surfaced (unchanged):** `10` (IA/switcher),
  `15`+`08` (sportsbook/arena/bankroll), `23`+`14`+`06` (records/history/identity), `17` (entitlements/`<FeatureGate>`),
  `21`+`05`+`11` (central news/editorial). **Boundary:** Phase 5 restyles + composes; data shapes, loaders, voice, and
  pricing are untouched (final visual/voice/price taste is the human-in-the-room pass — North Star "surface soul later").
