# Editorial Cadence Reference — how the pros actually publish a week (2026-07-15)

> Synthesis of a 5-platform study (ESPN-NFL, ESPN-Fantasy, FantasyPros, Yahoo-NFL, Yahoo-Fantasy) across two
> real windows: **2025 NFL Week 10** (in-season, ~Nov 6–12 2025) and **June 15–21 2026** (deep offseason),
> with a mid-July note. Reference for structure only — no content copied. **Confidence:** content inventory
> and franchise/cadence patterns are well-corroborated across sources; exact day-mapping is partly inferred
> and volume counts are conservative floors (Wayback was blocked, so agents used dated-URL search, not
> archived homepage snapshots). Raw per-platform captures in `.orchestration/analysis/weekly-research/`.

## 1. The in-season week, day by day (consolidated across all five)

| Day | NFL desk (ESPN/Yahoo) | Fantasy (ESPN/Yahoo/FPros) | Manager's decision driver |
|---|---|---|---|
| **Mon** | MNF recap; Sun-night→Mon "best/worst takeaways" spike | **Yahoo Boone waiver drops** (post-MNF, pre-Wed processing) | waiver claims open |
| **Tue** | **Power Rankings** (32 teams, panel); Barnwell big-think; standings | **ESPN/FPros waiver + rankings drop**; "Don't be surprised" (Karabell) | pre-waiver-processing advice |
| **Wed** | rankings settle; early odds | rankings refresh; deep/streamer adds | **waivers process overnight** |
| **Thu** | TNF game+recap; bold predictions & key matchups; viewers-guide begins | TNF start/sit locked; Clay Playbook/Shadow; Yahoo deep-stashes | TNF lineup lock |
| **Fri** | injury/inactive designations, final injury reports | **Yahoo trade value charts / buys-sells**; injuries | trade deadline / roster moves |
| **Sat** | viewers guide finalized; expert picks locked; "Ready for Week X" | final injury watch; The Primer (FPros); DFS; sleepers/duds | lineup-setting |
| **Sun** | inactives (~90m pre-kick); live coverage; ~13 per-game recaps | Fantasy Football Now AM show; **ESPN live Arena noon–1pm**; last-minute pickups | inactives + lineup lock |
| **all week** | rolling **news/injury live blog** (never stops); rankings = living doc continuously updated | | |

**Two editorial spikes:** Sunday-night→Monday (recaps/takeaways) and Tuesday–Wednesday (rankings/columns).
The whole loop is keyed to the **manager's decision calendar** (waiver processing Wed, lineup lock Sun), not
to news whim — content lands exactly when a manager has a decision to make.

## 2. Volume reality (per week, in-season)
- **NFL desk:** ESPN ~40–60 (incl. ~13 per-game recaps — the single biggest driver); Yahoo ~25–40 original +
  heavy syndicated team-blog aggregation.
- **Fantasy:** Yahoo ~60–80 total units (incl. positional ranking tables + ~6–8 videos + ~5–7 podcasts);
  FPros ~30–45; ESPN ~12–20 written + a 5-day daily podcast.
- **Key caveat for us:** these are ONE shared product serving everyone. A per-league volume anywhere near
  this would be ruinous. (See §7.)

## 3. The offseason contrast (June 15–21) — slower, never dark
- **Volume collapses ~3–5×:** NFL desk ~5–12/wk; fantasy ~8–15/wk (vs 40–80 in-season).
- **Cadence flips from game-grid to producer-driven drip:** ~one installment per weekday, no Sun/Mon spike,
  weekends quiet. Event-pegged calendar: minicamp (early June) → **~5-week dead zone** → training-camp ramp
  (mid–late July) → draft season (Aug).
- **What fills it:**
  - *NFL desk:* multi-week **evergreen ranking series** (positional top-10s by exec/scout survey, roster
    rankings), grade/retrospective franchises, standing **contract/holdout news blog**, "way-too-early."
  - *Fantasy:* **dynasty rankings + MONTHLY trade-value/dynasty charts**, rookie mocks, ADP, "way-too-early,"
    and the **Draft Kit/Guide** — the evergreen anchor that ramps *daily* as camps open (~late July).
- **The one franchise that survives the season transition intact:** the monthly trade-value/dynasty chart
  (both FPros and Yahoo). Everything else (weekly waiver, start/sit, per-game recap, DFS) goes dormant.

## 4. NFL vs Fantasy — how the pros split it
- **Structurally separate verticals; fantasy is walled off** from the NFL desk (ESPN `/fantasy/`, Yahoo
  `/fantasy/`).
- **The ONE bridge = injuries, dual-filed:** the injury EVENT lives in NFL news; the fantasy IMPLICATION lives
  in the fantasy vertical; they cross-link. (Directly validates the owner's "injuries live in both" nuance.)
- **ESPN threads a single fantasy nugget + a betting nugget INTO its NFL preview/picks products** (viewers
  guide, "Ready for Week X") — but the pure news/analysis franchises (power rankings, recaps, Barnwell) carry
  **zero** fantasy framing. So the bleed is deliberate and minimal, only in service/preview products.
- **NFL desk =** hard news + analysis/opinion columns + a heavy data/analytics spine (FPI, playoff odds,
  win-prob, expert-pick grids) + betting + power rankings + previews/recaps/picks.
- **Fantasy =** rankings (the spine) + waiver + start/sit + player-entity advice.

## 5. Universal patterns (true on all five)
1. **Franchise-packaged, not free essays** — a fixed roster of named recurring products on fixed triggers.
2. **Rankings are the spine** — a continuously-updated living doc, not a one-time post (ESPN 8-ranker
   committee; Yahoo consensus; FPros ECR).
3. **Player-entity is the atomic unit** — name/pos/team + roster-% + matchup/stat line + verdict/tier.
4. **A data/analytics layer is the connective tissue** — grades, tiers, odds, projections quantify everything.
5. **Same franchises, seasonal mode-switch** — identical columns run weekly/redraft in-season, monthly/dynasty
   offseason.
6. **An always-on news/injury blog** is the one cadence that never stops.
7. **Named bylines carry the brand** — and after Yahoo's 2025 AI-content backlash, named *human* bylines
   became an explicit trust signal (see §6.7).

## 6. Rumbledore design input — BORROW / SKIP / TRANSLATE

**BORROW (adopt directly):**
1. The **day-of-week loop keyed to the manager's decision calendar** — validates the owner's league lineup
   (Wrap Mon, Rankings Tue, Waiver Wed, Tale-of-Tape Thu, Fantasy Friday, Predictions Sun).
2. **Same-franchises seasonal mode-switch** — in-season weekly → offseason monthly. The clean offseason model.
3. The **weekly "issue" hub** (Yahoo's Toolkit = a nav wrapper indexing the week's pieces) — a natural front
   for a league's weekly edition.
4. **Injuries as the NFL↔fantasy bridge** (dual-filed) — validates the shared-substrate + two-branch central.
5. The **two-spike rhythm** (Sun-Mon recap; Tue-Wed rankings).
6. **Content welded to league data** (Yahoo's columns are "literally functions of the league database") —
   this is Rumbledore's entire model, validated against the market leader.

**SKIP (the padding the owner already rejected):**
1. **Multiplicity** — 8 waiver variants, per-position ranking tables broken out. SEO/volume plays.
2. **Expert-panel/consensus aggregation** — we have no analyst panel; we're single-voice-per-persona.
3. **Tool-platform features** — DFS optimizers, ADP tools, trade analyzers, salary-cap sims, mock-draft lobbies.
4. **The proprietary-analytics arms race** (FPI-style) — stat-driven, yes; building an analytics lab, no.

**TRANSLATE (NFL/fantasy format → league-story equivalent):**
- 32-team power rankings → **manager power rankings** (your Tuesday column).
- "Viewers guide to every game" → **Tale of the Tape** for league matchups.
- "Best/worst takeaways" recap → **The Wrap**.
- Sunday predictions/picks → **Predictions** (Berman-style — already in the roster).
- Player-entity unit → **manager/team-entity** unit for the league tier; real-player unit for central.

**THE AI-TRUST LESSON (§6.7, Rumbledore-critical):** Yahoo's 2025 AI-content backlash → named-human-byline
retreat means an AI-generated product must make content feel *authored*. Rumbledore's persona cast is exactly
that mechanism — it's the structure Yahoo had to move *toward* after hiding the AI. Lean into named-persona
bylines + transparency; never let output read as generic slop.

## 7. The two answers the owner most wanted

**"What runs in July?" (offseason, both tiers):**
- *Central:* NFL offseason **news-relevance mode** — contracts/holdouts/camp news + dynasty/draft-prep rankings
  + "way-too-early," ramping into camp previews late July. Exactly what ESPN/Yahoo/FPros do. Slower, not dark.
- *League:* the league's **evergreen = its own history** — retrospectives ("The Long View"), records deep-dives,
  "way-too-early" next-season manager power rankings, draft-history pieces. Producer-driven monthly drip.

**Cost calibration (structure, not trimming):** the pros publish 40–80 pieces/week — but that's ONE shared
product. The split maps perfectly onto the owner's model: the **central hub** can carry a comparable (leaner,
un-padded) volume because it's written once and amortized across all leagues; the **league hub** stays at the
owner's ~6-column/week lineup because it's PER-LEAGUE and multiplies. The owner's instinct to keep league
volume tight while central does the heavy lifting is exactly right-sized against how the market actually works.
