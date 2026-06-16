# Spec 34 — Data-Viz & Ephemera (the chart library + the spectacle moments)

> Phase 5 / AUSPEX. **WHAT** the visualization layer and the live/ephemeral "spectacle" surfaces produce — not the
> line-by-line component code. Read `rumbledore-design-language.md` (the AUSPEX source-of-truth) first; this is the
> "cool stuff" spec it points to from §6 (the 18 chart generators) and §7 (motion). It formalizes those 18 generators
> into an accessible, responsive **chart library**, then expands the catalog with Rumbledore-native visualizations and
> the live/ephemeral **moments** that make data feel like a broadcast. The North-Star ethos governs: **data as
> spectacle** — but spectacle that *degrades to dignity*, never to a broken page or a seizure-trigger.
>
> Companion specs: `28` (tokens/type/motion/atmosphere/a11y), `29` (component library — the chart library lives there),
> `30` (app shell — the WIRE ticker + scoreboard strip live in the shell), `31` (editorial register — charts embed in
> articles), `32` (feature surfaces — Arena/bankroll/records consume these), `33` (cast/lore/onboarding — orb states,
> canonized moment, vote-crossing animation). Data sources cross-referenced: `08`/`15` (odds, bankroll, arena),
> `06`/`14`/`23` (stats, records, H2H, standings, championships), `12`/`13`/`18` (cast activity, lore), `19`/`20`
> (live ingestion, realtime/push).

---

## 0. State: EXISTS vs NEW (the boundary)

- **EXISTS (reference, do not re-invent — formalize):** the **18 AUSPEX chart generators** in the HASHMARK template
  (`docs/design/auspex-reference.html`): `line+area`, `multi-line`, `sparkline`, `bars`, `grouped-bars`, `stacked-bars`,
  `hbars`, `range`, `radar`, `scatter`, `histogram`, `gauge`, `donut`, `activity-rings`, `equalizer`, `heatmap`,
  `bullet`, `node-graph`. All are **hand-built animated SVG** (no plotting dependency), with hairline grids, soft-halo
  strokes, and **draw-in / grow-in** reveals. The palette semantics from the design language hold verbatim:
  **lilac = lead/primary**, **amber = value/money**, **steel = baseline/secondary**, **jade = good / coral = bad**.
- **EXISTS (motion vocabulary):** count-up, draw-in (stroke-dash), staged-process status, orb spin, marquee ticker
  ("WIRE"), hover-lift + focus-bloom — all already collapse under `prefers-reduced-motion`.
- **NEW (this spec):** (A) the formalized **chart library contract** wrapping the 18 generators with a11y + responsive
  rules; (B) **13 new Rumbledore-native chart types** built in the same idiom; (C) the **live & ephemeral spectacle
  moments** — ticker variants, scoreboard strip, odometers, stingers, pulses, the canonized-lore moment, the vote
  threshold crossing. Nothing here ships app code; this defines the visual + behavioral contract and its acceptance.

---

## A. The chart library — formalizing the 18 (the reusable contract)

The 18 generators graduate from template demos into a **single chart primitive** with a uniform contract. Every chart —
existing or new — is one component family that takes a typed spec and renders animated, accessible SVG. AUSPEX styling
is **enforced by the primitive**, not re-applied per call site.

### A.1 The universal chart contract (every chart, no exceptions)

1. **Identity & semantics.** Every chart declares a `title` and an `aria-label` (or `aria-labelledby` pointing at a
   visible title). The SVG carries `role="img"` (static) or `role="figure"` with a `<figcaption>` (when a caption/legend
   is present). Decorative atmosphere (grid, halo, scanline) is `aria-hidden`.
2. **Non-color encoding (load-bearing).** Color **never carries meaning alone**. Every semantic distinction has a second
   channel: jade/coral good-bad pairs with **▲/▼ glyphs + sign**; multi-series lines pair with **dash patterns +
   direct end-of-line labels** (not just a color legend); the "you/your league" series gets a **heavier stroke + a
   labeled marker** (the `.pip.me` treatment), not merely a different hue. This satisfies WCAG 1.4.1 and is the single
   most-tested a11y rule in §F.
3. **Offscreen data-table fallback.** Every chart renders a **visually-hidden `<table>`** (`.sr-only`) carrying the
   underlying series — columns = dimensions, rows = points — so screen-reader and no-SVG users get the data, and a
   "View as table" affordance can reveal it inline (toggling `.sr-only`). The table is generated from the **same data
   the SVG draws** (single source — they can never disagree; tested in §F).
4. **Reduced-motion.** Under `prefers-reduced-motion: reduce`, all draw-in/grow-in/count-up reveals collapse to the
   **final painted state instantly** (no stroke-dash animation, no easing, no looping pulse). The chart is fully legible
   on first paint; motion is pure enhancement.
5. **Responsive sizing.** Charts are **container-driven**, not viewport-driven (a chart in a narrow cell behaves like a
   chart on a narrow phone). Three behavior tiers (breakpoints are container-width, see §E): **compact** (≈ <360px) →
   simplify (drop minor gridlines, thin to ~3–5 ticks, hide secondary series legends behind a tap, prefer sparkline/
   bullet reductions); **standard** (≈360–720px) → full single-chart; **wide** (≈ >720px) → full + optional secondary
   axis/annotations. Minimum legible height per type is enforced; below it the chart degrades to its **sparkline cousin**
   rather than rendering an unreadable smear.
6. **States.** Every chart supports **loading** (skeleton at final dimensions — no layout shift), **empty** (a calm
   "no data yet" cell in the AUSPEX empty idiom, never a blank box or `NaN`), **partial/stale** (renders what exists +
   an "as of {ts}" / "incomplete" hairline note — honesty over fabrication, per `14`/`19`), and **error** (a bounded
   error cell; one chart failing never blanks the surface).
7. **Tooltips & focus.** Pointer hover and **keyboard focus** both surface the same point readout (a popover in the
   `.tooltip` idiom). Data points / bars / segments are **focusable** (`tabindex`, arrow-key traversal within the chart)
   with a visible focus-bloom; the readout is announced via `aria`. Tooltips are never the *only* way to read a value
   (the table fallback covers non-pointer/non-keyboard).
8. **Numerics.** All readouts use the **mono / `.lcd` / `.metric`** tabular treatment; money is **amber**, signed deltas
   carry jade/coral + ▲/▼, percentages/odds use consistent formatting. No raw floats — values are formatted to the
   domain (cents → currency, decimal odds → American where the surface expects it, bps for ROI).

### A.2 The 18, catalogued with their canonical Rumbledore uses

| Generator (EXISTS) | Canonical Rumbledore use | Min legible / mobile reduction |
|---|---|---|
| `line+area` | bankroll over a week; a manager's weekly score trend | → sparkline below min-height |
| `multi-line` | two managers' season scoring; league avg vs you | → top-2 series + "+N more" |
| `sparkline` | inline trend in a table cell / stat tile / WIRE | (is the reduction floor) |
| `bars` | weekly points; per-event market count | → hbars on narrow |
| `grouped-bars` | PF vs PA by season; you vs opponent by week | → stacked or top-N |
| `stacked-bars` | scoring by position; win/loss/push composition | → single total bar + legend |
| `hbars` | leaderboard values; top-N blowouts | (mobile-native) |
| `range` | projection floor/ceiling; odds line spread | → bullet |
| `radar` | manager profile (PF/PA/luck/consistency/titles) | → stat-tile list on compact |
| `scatter` | luck vs wins; PF vs finish; odds vs result | → binned hbars on compact |
| `histogram` | margin-of-victory distribution; score distribution | → coarser bins |
| `gauge` | win-probability now; bankroll-vs-floor health | (mobile-native, see leverage gauge B.10) |
| `donut` | bankroll allocation; win/loss/push share | → stacked single bar |
| `activity-rings` | weekly engagement (read/post/bet/vote rings) | → 3 mini-meters |
| `equalizer` | live "momentum" bars; cast-activity intensity | → single intensity bar |
| `heatmap` | engagement calendar; H2H grid (see B.8/B.7) | → fewer columns, scroll |
| `bullet` | record-chase progress; goal vs actual (see B.11) | (mobile-native) |
| `node-graph` | trade network; rivalry web; lore dispute tree | → ranked list on compact |

---

## B. The new Rumbledore-native visualizations (NEW — designed in AUSPEX)

Thirteen net-new chart types, each built in the existing idiom (hand-SVG, hairline grids, draw-in reveals, the palette
semantics) and each inheriting the full §A.1 contract. For each: **what it shows · the data source · the AUSPEX styling
· responsive + a11y specifics**. Where a new type is a *composition* of existing generators, it says so (reuse, not
reinvention).

### B.1 Bankroll equity curve
- **Shows:** a single manager's running balance across a week/season, with the **rolling-minimum floor** as a reference
  line and **settlement events** as markers; the area between balance and floor is the "cushion."
- **Source:** `bankroll_ledger.running_balance_cents` over time + `floor_cents` + settlement timestamps (`08`/`15` §1.5).
- **AUSPEX:** `line+area` composition — **amber** line+fill (it is money), a **steel** dashed `floor` baseline; markers
  jade (credit/win) / coral (debit/loss); a **reset_to_floor** event renders a coral down-step with a labeled annotation
  ("reset to floor"); **week-open carryover** a faint vertical hairline. Draw-in left→right; the latest value count-ups
  into an amber `.lcd`.
- **Responsive:** wide → full curve + event annotations; standard → curve + floor, markers on tap; compact → **amber
  sparkline + current-balance LCD + floor pip**. **a11y:** floor crossing also signaled by the area flipping to a
  coral hatch when balance ≤ floor (not color alone); table lists (time, balance, floor, event).

### B.2 Standings BUMP chart (rank movement across a season)
- **Shows:** every manager's **rank by week** as crossing lines — the canonical "who climbed, who collapsed" view; the
  steepest crossings *are* the story.
- **Source:** weekly standings derived from `weekly_statistics` / `season_statistics` (`06`/`14`/`23`); arena variant
  uses weekly `arena_standings` ranks (`15` §3.3).
- **AUSPEX:** `multi-line` on an **inverted rank axis** (rank 1 at top), nodes at each week; **your** line is lilac +
  heaviest stroke + always-labeled; others steel and dimmed until hovered/focused (hover raises one line to lilac-hi).
  Direct end labels (manager name at the right terminus). Draw-in sweeps left→right week by week.
- **Responsive:** wide → all managers; standard → **you + 3 nearest rivals + "+N"**; compact → a **rank-delta hbar list**
  ("you: ▲2 this week"). **a11y:** each line dash-coded per manager; focusable per-node readout ("Week 7, rank 3, ▲1");
  table = managers × weeks rank grid.

### B.3 Playoff-odds Monte-Carlo fan / cone
- **Shows:** projected **playoff/championship probability** going forward as a widening **uncertainty cone** (median +
  percentile bands), the offseason/standings analog of a forecast fan.
- **Source:** projection distribution from the stats layer (`06`/`14`) and/or arena season projection (`15`); where no
  simulation exists yet, renders the **deterministic "current odds" point** + a flagged "projection unavailable" state
  (never fabricate a cone — `14` honesty rule).
- **AUSPEX:** `range`+`line` composition — a **lilac** median line, **steel** translucent percentile bands (p10–p90,
  p25–p75) fanning right, a **jade/coral** clinch/elimination threshold hairline. Grow-in: bands expand from the present.
- **Responsive:** wide → full fan + thresholds; standard → median + one band; compact → a **gauge** of current playoff
  probability + a "trend ▲/▼" pip. **a11y:** bands carry a subtle hatch density gradient (not hue only); table = week ×
  {p10,p25,median,p75,p90}; "X% to make playoffs" stated in text.

### B.4 Win-probability live timeline + swing markers
- **Shows:** in-game **win probability** over elapsed game time for a tracked matchup, with **swing markers** at the
  biggest momentum shifts (the moments the cast narrates).
- **Source:** live ingestion (`19`) scoring updates → derived WP series; swing detection mirrors the `15` §4.2 swing
  pattern; offseason/no-live → renders the **final settled line** as history.
- **AUSPEX:** `line` on a 0–100% axis, the home/your side **lilac** above the 50% midline (a steel hairline), opponent
  **steel** mirror below; **swing markers** are amber diamonds sized by magnitude with a draw-in pulse; the line
  **live-extends** as updates arrive (append-only, never redraws history). A "FINAL" stamp freezes it.
- **Responsive:** wide → full timeline + annotated swings; standard → line + top-3 swings; compact → a **live WP gauge +
  swing toast feed**. **a11y:** swings also marked with ▲/▼ + magnitude text; midline labeled "even"; live updates
  announced via a **polite** aria-live region (never assertive — see §C reduced-motion); table = time × WP × event.

### B.5 Odds-movement drift sparkline
- **Shows:** how a **market line moved** over its open window (e.g. a spread drifting -3 → -4.5) — the "line is moving"
  signal that drives bet urgency.
- **Source:** `odds_snapshots` history per market (`08`/`15` §1.3 — the same snapshots placement locks against).
- **AUSPEX:** a dense `sparkline` in **steel**, the **current** point a lilac dot with an amber price LCD; the **locked
  point** (if the user has a bet on it) a jade pin so "you locked at +145" is visible against subsequent drift; up-drift
  vs down-drift end-cap glyph (▲/▼). Tiny enough to sit inside a market row or the WIRE.
- **Responsive:** identical across tiers (it is already the floor form); in a market card it may expand to a `line+area`
  on tap. **a11y:** open/current/locked called out in text + glyphs; table = snapshot ts × line × price.

### B.6 Season streak / arc timeline
- **Shows:** a manager's (or league's) **season as a horizontal arc** — a ribbon of W/L/T cells per week, with **streaks
  banded**, playoff/championship weeks flagged, and high/low weeks pinned.
- **Source:** ordered weekly facts (`06`/`14`); streaks per `23` §A (median/all-play rows excluded); playoff/champ flags
  derived (`14` §B).
- **AUSPEX:** a `heatmap`/ribbon row — jade W / coral L / steel T cells, a **streak** rendered as a connected band with a
  count badge ("W6"), playoff weeks a lilac top-hairline, championship a small amber crown glyph; the high/low weeks get
  a labeled pin. Draw-in left→right reveals the season chronologically.
- **Responsive:** wide → full season ribbon + pins; standard → ribbon + streak badges; compact → a **streak summary chip
  row** ("best W6 · worst L3"). **a11y:** W/L/T encoded by letter glyph in each cell, not color alone; table = week ×
  result × score × flags.

### B.7 Head-to-head history flow
- **Shows:** a rivalry's full **back-and-forth** — the symmetric ledger as a flowing timeline of meetings, who won each,
  margins, and the **series streak**, plus playoff/championship meetings highlighted.
- **Source:** `head_to_head_record` + the meeting list (`23` §A/§B.3 — symmetric, `kind=head_to_head` only).
- **AUSPEX:** a centered **timeline ribbon**: each meeting a node above (person A, lilac) or below (person B, steel) the
  axis by winner, node size = margin, a **diverging area** filling toward the current series leader; playoff meetings get
  a thicker ring, the title game an amber crown. The aggregate ledger (W-L, avg pts each side) sits in a `.kv` header.
- **Responsive:** wide → full flow + ledger; standard → flow (markers on tap) + ledger; compact → **ledger `.kv` +
  last-3-meetings list + a tug-of-war bar** (a single `hbar` split lilac/steel by series record). **a11y:** winner per
  meeting stated as text + side; table = date × winner × scoreA × scoreB × round.

### B.8 Engagement / activity calendar heatmap
- **Shows:** league or member **activity intensity by day** — reads, posts, bets placed, votes cast, cast pieces — a
  GitHub-style calendar that makes "the league is alive" (or dormant) legible.
- **Source:** activity/engagement events (`12` cast activity, `20` realtime/notification events, `15` bet placements,
  `13`/`18` votes) aggregated per day, league-scoped (RLS).
- **AUSPEX:** a `heatmap` grid (weeks × weekdays), intensity ramped on a **lilac** luminance scale (telemetry = lilac);
  today a labeled outline; a hover/focus cell shows the day's breakdown (a mini `stacked-bar` of activity kinds). Cells
  grow-in row by row.
- **Responsive:** wide → full year/season grid; standard → last ~12 weeks; compact → **last 7 days as an `equalizer`
  row + a streak count** ("active 9 days"). **a11y:** intensity also encoded by a 0–4 level number on focus + the
  luminance ramp meets a minimum step contrast; table = date × {reads,posts,bets,votes,pieces}.

### B.9 Power-ranking ladder with movement arrows
- **Shows:** the cast/analyst **power ranking** as a vertical ladder (distinct from raw standings — it is *opinion +
  data*), each rung a manager with **this-week movement** and a one-line rationale slot.
- **Source:** the power-ranking content type from the cast (`12` content types) over stats facts (`06`/`14`); movement =
  rank delta vs prior ranking.
- **AUSPEX:** the `.ladder` idiom — rungs with `.pip` strength blocks, your rung pinned/highlighted lilac; **movement
  arrows** jade ▲ / coral ▼ / steel — with the delta count; an amber crown on #1. Rungs stagger draw-in top→bottom; a
  mover's arrow pulses once (collapses under reduced-motion).
- **Responsive:** native vertical list at all tiers; compact drops the rationale to a disclosure. **a11y:** movement is
  glyph + number ("▲2"), not color alone; the ladder is an ordered list with each item labeled; table = rank × manager ×
  delta × prior-rank.

### B.10 Leverage / "swing" gauge (how much a game matters)
- **Shows:** a single matchup or bet's **leverage** — how much the outcome could move standings/playoff-odds/bankroll —
  as a gauge from "low stakes" to "season-defining."
- **Source:** derived from playoff-odds delta (B.3), bankroll exposure (`15` §1.5), or arena swing potential (`15` §4.2).
- **AUSPEX:** a `gauge` arc, the needle lilac, the arc ramped steel→amber→lilac-hi as leverage climbs; the readout a
  short label + a magnitude LCD ("HIGH · ±18% playoff odds"). Needle sweeps in; at the top band the arc gets a soft
  lilac halo (a "this one matters" cue) — halo only, never a flash, and static under reduced-motion.
- **Responsive:** mobile-native; compact → a single labeled **bullet** ("leverage: HIGH"). **a11y:** leverage as a
  named tier (Low/Med/High/Critical) + number, not arc position alone; table = factor × contribution.

### B.11 Record-chase progress bullet
- **Shows:** progress toward breaking an all-time record (e.g. "12 pts from the single-week high") — the live "is this
  the night a record falls" tracker.
- **Source:** current value vs `all_time_record` holder value (`23` §A); "record-broken provenance" supplies the prior
  holder for the displaced-record stinger (§C.7).
- **AUSPEX:** the `bullet` idiom — a steel track, the **record** an amber target tick, the **current** a lilac measure
  bar; when current crosses the target the bar flips **jade** and triggers the record-broken stinger (§C.7). A "needs N
  more" LCD. Grow-in fills the measure bar.
- **Responsive:** native at all tiers (it is mobile-first). **a11y:** the crossing announced as text ("record broken!")
  via aria-live polite; progress as "current / record (= N to go)" text; table = metric × current × record × holder.

### B.12 Projection distribution / violin
- **Shows:** a player's or matchup's **projected outcome distribution** (floor / median / ceiling), not just a point —
  the "boom/bust" shape behind a projection.
- **Source:** projection distribution from the stats/projection layer (`06`/`14`); range markers reuse B.3's percentiles.
- **AUSPEX:** a `histogram`-derived **violin/ridge** in steel, the **median** a lilac line, **floor/ceiling** (p10/p90)
  amber ticks, your roster's player highlighted; mirror-symmetric ridge with a hairline baseline. Grow-in expands the
  ridge from the median outward.
- **Responsive:** wide → full violin; standard → a `range` bar (floor–median–ceiling); compact → a **3-number LCD row**
  (floor · proj · ceiling). **a11y:** floor/median/ceiling stated as text; shape is supplementary; table = bucket ×
  density (+ the three summary stats).

### B.13 The "season dial" radial
- **Shows:** a **whole-season-at-a-glance** radial — the league's season as a clock face (weeks around the ring), with
  the current week, playoff window, championship, and key league moments (records, big swings, canonized lore) pinned
  around it. A signature, frame-able AUSPEX hero.
- **Source:** the season calendar (`14` periods, playoff/champ flags) + event timeline (records `23`, swings `15`,
  lore `13`/`18`).
- **AUSPEX:** a `donut`/radial composition — a lilac progress arc for elapsed season, a steel remainder, an amber
  playoff-window band, an amber crown at the championship week; **event pins** around the ring (jade/coral/lilac by
  kind) with a hover/focus readout. The current-week marker pulses (a single soft pulse; static under reduced-motion).
  The center holds an `.lcd` ("Week 9 of 17").
- **Responsive:** wide → full dial + event pins; standard → dial + current-week + playoff band; compact → a **linear
  season progress `bullet`** with the same pins as ticks. **a11y:** each pin labeled (kind + week + text); the dial is
  fundamentally a progress meter ("Week 9 of 17, regular season") stated in text; table = week × phase × events.

---

## C. Live & ephemeral spectacle moments (NEW — the broadcast feel)

The moments that make Rumbledore feel *live*. Every moment obeys three laws: **(1)** it is **reduced-motion-safe** — under
`prefers-reduced-motion: reduce` it collapses to a **static, instantaneous** end-state (the *information* always survives;
only the *theatre* is removed); **(2)** it is **mobile-performant** — GPU-friendly transforms/opacity only, no layout
thrash, capped concurrency, and it never blocks input or scroll; **(3)** it **degrades, never breaks** — offline/no-data/
errored, the moment silently falls back to its static surface. Each below defines **what it is · when it fires · how it
degrades**.

### C.1 The WIRE ticker (variants)
- **What:** the marquee league wire from the design language — a horizontal scroll of league headlines, scores, swings,
  cast scoops, bet settlements. Variants: **WIRE-live** (realtime, faster, lilac pulse-dot prefix on fresh items),
  **WIRE-digest** (slow, curated, offseason), **WIRE-arena** (cross-league swings, amber-tinted money items).
- **Fires:** always present in the shell (`30`); items injected on realtime events (`20`) — `game.final`, `bet.settled`,
  swings (`15`), records broken (`23`), canonized lore (`13`/`18`).
- **Degrades:** reduced-motion → **does not scroll**; becomes a **tap-to-expand stacked list** of the latest N (the
  mobile treatment anyway, per design language §9.1). Offline → freezes with a "reconnecting" hairline + last-known
  items. Empty → a calm "the wire is quiet" line, never blank.

### C.2 Live scoreboard strip
- **What:** a compact horizontal strip of in-progress matchups — team / score / a live WP micro-gauge (B.4 reduction) /
  a pulse-dot — that updates in place as scores arrive.
- **Fires:** during live game windows (`19` live ingestion active); hidden/collapsed to "final" outside live windows.
- **Degrades:** reduced-motion → values update **without** the count-up/flash, pulse-dots become **static filled dots**.
  Offline → last-known scores + a stale "as of {ts}" badge, no live dots. No live games → collapses to a "next kickoff"
  row.

### C.3 Count-up / odometer readouts
- **What:** numeric readouts (bankroll balance, points, win-prob %, vote tallies, payout) that **animate from prior →
  new** with the mono `.lcd` glow — a mechanical-counter "settle" on change.
- **Fires:** whenever a tracked number changes (settlement updates bankroll, a score tick, a vote increments).
- **Degrades:** reduced-motion → the new value **snaps** in place (no rolling), the `.lcd` may do a single non-animated
  emphasis (a static brightened frame is acceptable; no flashing). The final value is correct and tabular either way.

### C.4 Draw-in reveals
- **What:** the chart-entrance language (stroke-dash line draw, bar grow, area wipe, ring sweep) applied on first paint
  / on scroll-into-view, staggered for multi-element charts.
- **Fires:** on a chart mounting or scrolling into the viewport (once per view; not on every scroll).
- **Degrades:** reduced-motion → **fully painted instantly**, no stagger. Low-end devices → reveal still runs but capped
  (single combined transition, no per-element stagger) to protect frame rate.

### C.5 The orb "thinking" / "writing" states
- **What:** the AI-cast presence orb (`.orb`/`.orb.think`) signaling cast activity — a conic-gradient spin for
  "thinking," a subtler shimmer for "writing/streaming a piece," idle = slow ambient rotation.
- **Fires:** while a cast generation is in flight (`12` pipeline running) or a piece is streaming into view; resolves to
  idle when published (and may hand off to a piece-published toast, §C.10).
- **Degrades:** reduced-motion → the orb is **static** (a still conic gradient) with a **textual status** ("cast is
  writing…") instead of spin; the status is the source of truth for SR users (aria-live polite). Never a blocking spinner.

### C.6 Big-win STINGER
- **What:** a tasteful celebratory moment on a notable positive outcome (a hit parlay, a blowout win, cracking the arena
  top) — a **brief** amber/jade halo bloom + a restrained, **bounded** confetti/spark burst + a headline LCD count-up.
- **Fires:** on a qualifying `bet.settled` win above a threshold, a `game.final` blowout, or a positive arena swing
  (`15` §4.2) — **rate-limited** (one stinger at a time, a cooldown, never stacking).
- **Degrades:** reduced-motion → **no confetti/flash** at all; instead a static "BIG WIN" banner + the final LCD (the
  celebration becomes a label). Confetti is `aria-hidden` always. Mobile → particle count capped, single canvas/transform
  layer, auto-dismiss.

### C.7 Record-broken STINGER
- **What:** the "a record that stood since 2017 just fell" moment — the B.11 bullet flips jade, a lilac sweep across the
  record card, the prior holder named, the new holder crowned, an amber "RECORD" stamp.
- **Fires:** when an `all_time_record` displacement is detected (`23` record-broken provenance — new `is_current` row
  with a `previous_record_id`); also queued for the cast "record broken" piece.
- **Degrades:** reduced-motion → no sweep; the card simply shows the **new** record + "previous: {holder, value, year}"
  as static text + the RECORD stamp. Always announces via aria-live polite. Never fires on `needs_review` data (`23`).

### C.8 Live pulse dots
- **What:** small pulsing indicators meaning "live / fresh / happening now" — on the WIRE, scoreboard, live charts, the
  cast presence, a fresh notification.
- **Fires:** attached to any element backed by an active realtime subscription (`20`) with recent activity; decays to
  static after a freshness window.
- **Degrades:** reduced-motion → **static filled dot** (color/glyph still conveys "live"); the meaning never depends on
  the pulse animation. Offline → dot dims to a hollow "offline" state.

### C.9 The lore-canonized moment
- **What:** when a lore claim crosses its vote threshold and is **ratified into canon** — a ceremonial moment: the claim
  card seals (a wax-stamp / "CANON" emboss), a lilac ring closes around it, the tally locks, and it graduates into the
  canon record; hands off to the Narrator's "writes the legend" piece (`12`/`13`/`18`).
- **Fires:** on `lore.canonized` (vote window closes above threshold).
- **Degrades:** reduced-motion → the seal/ring **appear statically** with the "CANON" label + final tally; no closing
  animation. Always announced (aria-live polite: "ratified into canon"). If the cast piece isn't ready, the moment still
  completes (the piece arrives later as a toast).

### C.10 Event toast / banner stingers
- **What:** transient notifications in the AUSPEX `.toast`/`.banner` idiom — a settled bet, a published cast piece, a new
  high score, a reconnect CTA (`AGENTS.md` provider-reconnect). Toasts auto-dismiss; banners persist until acted on.
- **Fires:** on the corresponding realtime/push event (`20`); deduped (one per logical event, idempotent — mirrors the
  `15` §4.1 slip-keyed dedupe so a re-delivered event never double-toasts).
- **Degrades:** reduced-motion → toasts **appear/disappear without slide** (opacity step, or instant), still auto-dismiss
  by timer. Stacked toasts are capped (N visible, rest queued). Offline → queued and shown on reconnect, or dropped if
  stale. All toasts are aria-live (polite for info, assertive only for true errors/reconnect).

### C.11 The vote-crossing-threshold animation
- **What:** the live vote widget (`13`/`18` lore vote: threshold/window/tally) — as votes arrive the tally **count-ups**
  and a progress meter fills toward the threshold; the **crossing** moment (reaching the bar) triggers a lilac flash +
  the meter lock, leading into the canonized moment (C.9) if it's the ratifying vote.
- **Fires:** on each incoming vote (realtime) and on the threshold crossing.
- **Degrades:** reduced-motion → tally **snaps**, the meter shows the **current static fill**, the crossing is a static
  "threshold reached" state change (no flash). The widget is fully usable and legible without any animation; the meter
  also shows "{n} / {threshold}" text.

### C.12 The big-loss / bad-beat anti-stinger (the tasteful inverse)
- **What:** the restrained negative counterpart — a busted bankroll, a brutal bad-beat parlay leg, a collapse. **No**
  celebration; a brief coral dim + a steady "tough beat" framing (the Trash-Talker may needle in copy, `12`/`15` §4.3,
  but the *visual* stays dignified — Rumbledore roasts in words, not in seizure-inducing graphics).
- **Fires:** on a qualifying losing settlement / floor reset / negative swing — rate-limited like C.6.
- **Degrades:** reduced-motion → static coral-tinted state + label, no dim animation. Always informational, never punitive
  motion.

---

## D. The orchestration rules (so spectacle stays tasteful)

1. **One headliner at a time.** Stingers (C.6/C.7/C.9) are **mutually exclusive and queued** — never two full-screen-ish
   moments at once; a global "spectacle conductor" serializes them with a short cooldown. Ambient moments (pulse dots,
   ticker, orb idle) run concurrently and freely.
2. **Severity ladder.** Ambient (pulses, ticker) < transient (toasts, count-ups) < headliner (stingers, canonized). Higher
   severity may preempt nothing already playing but jumps the queue ahead of lower.
3. **Frame budget.** On any device, concurrent animations are capped; the conductor sheds the lowest-severity motion first
   under load. Charts on screen but off-viewport do not animate.
4. **Honesty over hype.** A moment fires only on a **real, settled, idempotent** event (a confirmed settlement, a detected
   swing, a ratified vote) — never on optimistic UI. Re-delivered events (`20` at-least-once) never re-fire a moment
   (dedupe keys mirror the source event's idempotency, §C.10).
5. **The global reduced-motion master switch.** `prefers-reduced-motion: reduce` (and an in-app "reduce motion"
   preference, `28`) collapses **all** of §C to static end-states in one place — not re-checked per moment. This is a
   single tested invariant: every moment must read the same master switch.

---

## E. Responsive sizing (mobile · tablet · desktop) — every chart + moment

Sizing is **container-driven** (a chart adapts to its cell, not the device); the device tiers below describe the
**default surface widths** charts/moments land in.

- **Mobile (<640px, the primary target — mobile-first PWA, `24`):** charts default to **standard/compact** tier; ≥44px
  touch targets for any interactive point/legend toggle; tooltips trigger on tap (with an explicit close); horizontal
  charts (hbars, bullet, ribbon, ladder) preferred over wide ones; the WIRE is tap-to-expand (not scrolling) unless
  motion is allowed; the scoreboard strip is a horizontally-scrollable rail; stingers are smaller, auto-dismiss faster,
  particle-capped; **no hover-only** affordances.
- **Tablet (640–1024px):** **standard** tier, two-up chart layouts where a surface composes them; tooltips on tap **or**
  hover (hybrid pointer); the WIRE may scroll if motion allowed.
- **Desktop (>1024px):** **standard/wide** tier; richer multi-series, annotations, secondary axes, hover tooltips +
  keyboard; the WIRE scrolls; scoreboard strip shows more matchups; stingers may be slightly more expressive (still
  bounded + cooldowned).
- **Universal:** no layout shift on data arrival (skeletons reserve final dimensions); charts never overflow their cell
  (they reduce form instead); text/numerics never truncate a value silently (they wrap to the table fallback or abbreviate
  with the full value in the readout/table).

---

## F. Accessibility (the non-negotiables, applied everywhere)

1. **Non-color encoding everywhere** (§A.1.2): every semantic uses a second channel (glyph/sign/dash/weight/label).
   Tested: a deuteranopia/grayscale render of each chart remains interpretable.
2. **Aria + roles:** every chart `role="img"`/`figure` with title + `aria-label`/`aria-labelledby`; decorative atmosphere
   `aria-hidden`; live regions are **polite** for info (scores, votes, count-ups, published pieces) and **assertive** only
   for genuine errors/reconnect — so a flurry of live updates never spams a screen reader.
3. **Data-table fallback** (§A.1.3): every chart has a `.sr-only` table from the **same data**; a "View as table" toggle
   reveals it. No information is available **only** visually.
4. **Keyboard:** every interactive chart element (point, bar, segment, legend toggle, vote button) is focusable with a
   visible focus-bloom and operable; chart point traversal via arrow keys; tooltips reachable without a pointer.
5. **Reduced-motion fully collapses ephemera** (§D.5): a single master switch turns all of §C to static end-states; charts
   paint final-state instantly; no flashing/strobing ever (the confetti burst is bounded and disabled under reduced-motion
   regardless — flash-safety is absolute, not a preference).
6. **Contrast:** strokes/text/markers meet WCAG AA against the void/glass surfaces (the `28` contrast pass); the lilac/
   amber/steel/jade/coral set is verified at the sizes used; the heatmap luminance ramp meets a minimum per-step delta.
7. **Honesty:** stale/partial/empty states are explicit (§A.1.6) — never a fabricated cone (B.3), a faked score, or a
   `NaN`. A `needs_review` record never triggers a record-broken moment (`23`).

---

## G. Acceptance criteria (testable; mock data is the contract)

1. **Chart contract conformance.** Every chart in the library (the 18 + the 13 new) renders with: a title + `aria-label`,
   a non-color second encoding for each semantic, and a `.sr-only` data table whose values **equal** the values the SVG
   draws (a single fixture drives both; an automated check diffs SVG-derived data vs table data → must match).
2. **Reduced-motion (charts).** With `prefers-reduced-motion: reduce`, every chart is fully legible on first paint with
   **no** draw-in/count-up animation; a snapshot of the painted state equals the post-animation state.
3. **Reduced-motion (ephemera, the master switch).** With reduce on (OS or in-app pref), **every** §C moment renders as
   its static end-state: ticker doesn't scroll, count-ups snap, stingers show labels (no confetti/flash), pulses are
   static dots, orb is still, vote/canonized moments are static state-changes. One test toggles the single master switch
   and asserts no animation fires across all moments.
4. **Responsive reductions.** Below each type's min legible size, the chart degrades to its specified reduction (e.g.
   `multi-line` → top-2+more; equity curve → sparkline+LCD; bump → rank-delta list) — no overflow, no unreadable smear,
   no layout shift on data arrival.
5. **Data-grounding.** Each new chart binds to its cited source and renders correctly on the **existing mock fixtures**:
   equity curve over a `bankroll_ledger` fixture incl. a `reset_to_floor`; bump over a multi-week standings fixture; H2H
   flow over a `head_to_head_record` fixture (symmetric — A-vs-B and B-vs-A draw the same flow); record-chase bullet
   crossing an `all_time_record`; engagement heatmap over an activity fixture.
6. **Stinger correctness + idempotency.** A qualifying win fires exactly **one** big-win stinger; a re-delivered event
   (at-least-once, `20`) fires **none**; two simultaneous qualifying events are **serialized** by the conductor (one
   plays, one queues), never overlaid. A record-broken stinger fires only with a valid `previous_record_id` and **never**
   on `needs_review` data.
7. **Live update behavior.** A simulated score/vote/settlement stream updates the relevant moment (scoreboard, WP line,
   vote meter, bankroll odometer) **in place, append-only** (WP line never redraws history; equity curve never mutates a
   past point), announces via a **polite** aria-live region, and the value is correct and tabular after settling.
8. **Empty / stale / error / offline.** Each chart and moment renders its calm empty state on no data, an explicit
   "as of {ts}"/incomplete note on partial/stale data (`14`/`19`), a bounded error cell on failure (one failure never
   blanks the surface), and a frozen last-known state offline (`24` PWA) — none ever shows `NaN`, a blank box, or a
   broken page.
9. **Keyboard + SR walk-through.** Every interactive chart is fully operable by keyboard (focus traversal + tooltips +
   legend toggles) and a screen reader can read every chart's data via its table fallback; a live flurry (many score
   updates) does not spam the SR (polite, coalesced).
10. **Flash-safety (absolute).** No moment produces a flash exceeding safe thresholds; confetti/flash is bounded,
    `aria-hidden`, rate-limited by the conductor, and entirely disabled under reduced-motion — asserted independently of
    the motion preference (the burst is never allowed to strobe even with motion on).

---

## H. Dependencies / blocked-by

- **`28`** (tokens/type/motion/atmosphere/a11y/contrast) — the chart primitive and motion vocabulary are built on these
  tokens + the contrast pass; the reduced-motion master switch is defined here.
- **`29`** (component library) — the chart library **is** a §29 component family; tooltips/toasts/banners/skeletons/empty
  cells are §29 components the moments reuse.
- **`30`** (app shell) — hosts the WIRE ticker, scoreboard strip, and the spectacle conductor (global, shell-level).
- **`31`/`32`/`33`** — consume the charts and moments (editorial embeds, Arena/bankroll/records surfaces, cast/lore/orb).
- **Data:** `08`/`15` (odds, `odds_snapshots`, `bankroll_ledger`, arena standings/swings), `06`/`14`/`23` (weekly/season
  stats, `head_to_head_record`, `all_time_record`, playoff/champ flags, record-broken provenance), `12`/`13`/`18` (cast
  activity, power rankings, lore votes/canon), `19`/`20` (live ingestion, realtime/push events the moments subscribe to).
- **Mocks are the contract:** every chart and moment is built + tested against the existing deterministic fixtures; no
  live provider, real odds key, or LLM key is required to build or verify this spec.

## I. Non-goals

- **No charting/plotting dependency.** Charts stay hand-built animated SVG in the AUSPEX idiom (the design-language
  invariant) — this spec formalizes that, it does not introduce a library.
- **No new data.** Every visualization reads **existing** materialized facts/ledgers/snapshots; this spec adds **views**,
  never new source-of-truth tables or computations (derivations only, per the upstream specs' isolation/append rules).
- **No live/in-play betting, no real money, no sportsbook branding** (the `08`/`15` legal posture holds — the WP timeline
  and scoreboard are fantasy-score telemetry, not a book).
- **No final voice tuning** of the cast pieces these moments hand off to (`12` non-goal); this spec wires the visual
  moment + its trigger, not the wording.
- **No new IA/navigation** — surfaces and routes are defined in `30`/`32`/`33`; this spec defines what renders *within* them.
