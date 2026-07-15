# Editorial Architecture — Proposal for Owner Review (2026-07-14)

> **Status: DRAFT for the owner working session.** Not a spec yet. React section by section; once locked this
> becomes `specs/49-editorial-architecture.md` and drives a build wave. Grounded in: a code-truth inventory
> (`.orchestration/analysis/EDITORIAL-INVENTORY-2026-07-14.md`), structural research of ESPN/FantasyPros/
> Yahoo/CBS/Ringer/Footballguys (`…/EDITORIAL-FORMAT-RESEARCH-2026-07-14.md`), and two owner decisions
> (2026-07-14): **league edition = league-as-story (narrative)**; **central hub = a lean, stat-driven
> "full fantasy destination" (objective)**.

---

## Resolved in session (2026-07-14) — binding

- **D1 register split → refined to ONE shared substrate, THREE consumers (2026-07-15):** a single centralized
  real-time data store (news + stats + projections + odds; built = substrate-B + news ingestion, mock today)
  feeds three surfaces — **central-News** (general NFL, league- & fantasy-agnostic), **central-Fantasy**
  (NFL through the fantasy lens, stat-driven), and **league hub** (per-league localization of the same data +
  pure-league narrative). Central hub is NOT purely fantasy — it's NFL-as-a-whole with fantasy as a lens
  (ESPN model). LOCKED.
- **D4b "model not opinion":** LOCKED (central projections/rankings labeled as computed).
- **D6 curation → OWNER-CENTRALIZED, not steward-distributed.** For the initial posture, the OWNER is the
  sole editor of both tiers — determines styling + which persona writes what, tuned through testing batches
  before public release. **League users get NO control over how the agent writes** (prompt-injection +
  token-abuse surface; don't open until the system is proven). League-appointee stewarding of their own hub's
  tone/style is an explicit LATER phase, post-proof. **Implication (build change):** T18 shipped league-facing
  persona tone editor + regenerate to commissioners/stewards — these get GATED to owner/platform-admin only
  initially, not exposed per-league. Retract/correct defaults to owner-level too under "prove it first."
- **COST is managed via MODEL/TOOL SELECTION, NOT by shrinking content.** (Correction 2026-07-14: do NOT
  reduce content quality or volume — this is a paid product; quality/volume are preserved.) The cost variables
  are *which LLM models / APIs / image-gen tools* are used at scale — an owner research task, then work the
  math. Central hub is written once + shared (its cost amortizes across all leagues as count grows); LEAGUE
  hubs are the marginal, forecastable per-league cost. **Measurement plan:** use the owner's own league as the
  rubric — generate one week of content, measure actual cost (T19 per-league attribution is the instrument),
  multiply across a season for the estimate. That COGS number sets the league price. ("Scale" = getting the
  model/tool economics right, NOT curation labor and NOT trimming content.)
- **D5 offseason:** central hub = news-relevance mode (football news → fantasy bearing, à la ESPN/FP
  offseason) — slower but not dark. League offseason kept light.
- **Register distinction (owner's words):** central = statistical + recommendation-based; league = entertaining/
  interesting, written the way football/fantasy is written, but focused on the LEAGUE rather than fantasy itself.

- **DESIGN INVARIANT — structure is fixed, backends are pluggable.** Content amount, formats, and cadence
  are the STABLE CONTRACT of the editorial system. The models/APIs/stats-sources/image-gen tools routed into
  those variables are a SWAPPABLE layer behind an interface (same pattern as the existing provider abstraction
  + model routing + mock/real unions). A builder must never entangle a format/cadence rule with a specific
  model/tool choice. Cost/tooling/pricing is a separate track the owner owns; it does not perturb the
  editorial structure.

## 0. The reframe (read this first)

The scary version of your scaling question — "does every league need its own CMS?" — is already answered by
the code: **there is ONE content system; a league is a *dimension* of it, not a copy of it** (newspaper chain
→ local editions; formats defined once, filled per league, isolated by database RLS). You don't multiply
systems, you multiply editions. **That means the platform/edition architecture you were worried about is
built and proven.** (Full model in §1.)

The genuinely surprising finding from the inventory: **the league-story product is ~80% built** (11 typed
content formats, a full NFL-phase-aware publishing engine that already knows what to do in July, the
three-register page model, lifecycle controls). **The part that barely exists is the central hub** — which is
*exactly* the thing you just described wanting: a lean, stat-driven destination for news/stats/projections/
matchups/waivers. So the work this proposal really scopes is **"finish the league layer's rough edges +
build the central hub you described,"** not "design the content system from scratch."

That's a much better position than either of us assumed an hour ago.

---

## 1. The model (CONFIRM — mostly already built)

Two tiers, differentiated by **register/purpose**, not just scope:

| | **League edition** (The {League} Press) | **Central hub** (Rumbledore News) |
|---|---|---|
| Register | **Narrative / spectacle** | **Objective / utility** |
| Subject entity | Managers, teams, rivalries, league history | Real NFL players, matchups, weeks |
| Content | Recaps, power rankings, rivalry pieces, records, roast/lore | News, stats, projections, matchups, waiver, start/sit |
| Personality | Forward — the persona cast IS the brand | Thin tuning layer over facts |
| Visibility | Private to members (share-cards/teasers excepted) | Public, league-agnostic |
| Trust / curation | Steward-curated; reactive editing | Stat-verifiable → **safe to auto-publish** |
| Differentiator | *Your* league's story | Signal over noise — "what objectively matters, minus the padding" |
| Build status | **~80% built** | **Greenfield** (no central templates or generation today) |

The **only bridge** between tiers is explicit and one-directional: a central article can be *referenced into*
a league's Press feed when relevant ("your league rosters this injured player" — the tailoring fan-out,
already built). Nothing flows league→central or league→league.

**DECISION 1:** Confirm this two-tier register split as the spine. (Recommended: yes — it matches your two
decisions and the built architecture.)

---

## 2. Two gaps in the BUILT system to fix first (small, foundational)

The inventory flagged two things that will bite any format work if left alone:

**Gap A — the League Press has no way to choose its "lead" story.** Front prominence is
`recency + kindBoost + relevance + editorialImportance`, but `editorialImportance` is set *only on central
news*, never on AI league content. So today the league's front-page lead is just "most recent." A
league-as-story product **must** be able to say "the blowout upset is this week's lead, above the routine
recap." → Add an editorial-importance signal the cadence engine/cast sets per piece (e.g., an upset or a
broken record scores higher). Small, foundational.

**Gap B — central sections are incoherent (7 built vs 4 spec'd, and the two section-assignment code paths
disagree).** Since the central hub is about to be seriously built, its section taxonomy should be decided
here, deliberately, rather than inherited from a stale heuristic. (Proposed taxonomy in §4.)

**DECISION 2:** Approve fixing both as the foundation of the build wave. (Recommended: yes.)

---

## 3. League edition — add a thin "franchise" layer to the built system

The research's biggest universal finding: successful products run a **fixed roster of recurring, *named*,
calendared "franchise" columns** — same 6–8 formats every week, locked template + rotating inputs. Rumbledore
has the *formats* (11 content types) and the *cadence* — but no **franchise identity**: nothing brands
"Monday Morning Manager" or "The Power Rankings" as a standing, recognizable column with a byline and a slot.
This is the cheap, high-leverage addition — it turns generic auto-posts into *anticipated recurring features*.

### OWNER-SET league column lineup (2026-07-15) — names are placeholders, structure is LOCKED

In-season weekly, named columns on a day cadence (owner's roster; entity = the league's people):

| Column (placeholder) | Day | Content | Built type(s) | New/extend |
|---|---|---|---|---|
| **The Wrap** | Mon | Sunday-games recap; which league matchups do/don't matter going into MNF | weekly_recap | extend (add NFL-game framing) |
| **Power Rankings + Week (#) Summary** | Tue | after Sun+Mon games — rank managers + week summary | power_rankings + weekly_recap | mostly built |
| **Waiver Summary** | Wed | leaguemate roster changes, FAB budgets | transaction_reaction | extend (FAB/budget view) |
| **Tale of the Tape** | Thu | this week's matchups + **projections + odds/%** + grudge history + implications (power rankings, playoffs, H2H) | matchup_preview | extend (consumes central stat/odds) |
| **Fantasy Friday** | Fri | TNF matchup summaries + **odds/% changes** + a league historical **flashback** | matchup_preview + (new flashback) | new/extend |
| **Predictions** | Sun | matchup + end-score + **player-performance predictions**, à la Berman's Sunday NFL Countdown | matchup_preview | new (prediction format) |

**Reactive/offseason columns still apply** (Record Book Watch on record.broken, Rivalry Desk on signal,
The Long View in offseason) — the built reactive + offseason layer stays underneath this weekly lineup.

**KEY STRUCTURAL FINDING — league columns consume CENTRAL data (localization layer).** Tale of the Tape,
Fantasy Friday, and Predictions pull central **projections / odds / win-%** and localize them to the league's
matchups + history. So the league tier is partly a *localization layer over central stat data* plus
pure-league storytelling. **Build-order implication:** the central stat/projection/odds pipeline (and its real
source) is a prerequisite for the *blended* league columns to be truthful; pure-league columns (Power
Rankings, Waiver Summary) are not gated on it. Odds/win-% recur → connects to the built betting/Odds-API +
arena infra (mock now).

**Cadence note:** this is a ~6-column/week league lineup, comfortably under the built 25-posts/week cap, with
headroom for reactive pieces. The built cron day-mapping differs from this roster (built: Wrap on Tue) — a
straightforward reschedule + content-type→day reassignment in the build wave, not a redesign.

**DECISION 3: RESOLVED** — named columns adopted; owner roster above is the in-season lineup (names TBD by
owner). Owner will do supporting research to keep formats fresh / non-stale.

---

## 4. Central hub — the real build (your stat-driven destination)

This is greenfield and maps directly onto your vision: **lean, stat-driven, objective — the place for what
matters, without the expert-take padding that makes incumbents huge.** Because it's stat-verifiable, it's the
tier that can **auto-publish safely at scale** (a projection is checkable; a hot take isn't).

**Central hub = TWO branches over the shared substrate (owner, 2026-07-15).** Central is NFL-as-a-whole with
fantasy as a major lens — like ESPN's football section + fantasy section. Not purely fantasy.

- **Branch 1 — NFL News:** general, league-agnostic AND fantasy-agnostic. Real-time important NFL info; some
  fantasy-relevant, some not; some readers just want football news for its own sake.
- **Branch 2 — Fantasy:** NFL through the fantasy lens — the stat-driven recommendation coverage below.

**Shared data substrate (one source of truth, three consumers):** the real-time news + stats + projections +
odds store feeds central-News, central-Fantasy, AND the league hub (which localizes it). Maps to the built
substrate-B (general stats) + news-ingestion pipeline (mock today). Built central "Headlines" = the News
branch; Rankings/Start-Sit/Injuries/Waivers = the Fantasy branch.

**Proposed central section taxonomy** (replacing the incoherent 7-vs-4), grouped by branch:

| Branch | Section | Format | Source data | Cadence | Auto-publish? |
|---|---|---|---|---|---|
| **News** | Headlines / breaking | "news + so-what" blurbs (~what happened; fantasy impact line when it applies) | ingested feeds | reactive | yes (event-anchored) |
| **Fantasy** | Matchups | weekly matchup outlooks, stat-driven | schedules + team stats | Wed–Thu | yes |
| **Fantasy** | Projections & Rankings | stat-model output, LABELED as computed (no expert panel) | substrate-B | Wed | yes |
| **Fantasy** | Waiver Wire | data-thresholded adds (rostered% <50, snap/target trends) + streamers | substrate-B trends | Tue (post-waivers) | yes |
| **Fantasy** | Start/Sit | matchup-based lean calls | matchups + projections | Wed–Thu | yes |
| **News+Fantasy** | Injuries | **cross-cutting:** the injury EVENT is News; the fantasy IMPLICATION is Fantasy (framing TBD) | injury feed | reactive | yes |

Note this is **honestly scoped**: no ADP tool, no trade analyzer, no draft-kit mega-hub, no expert-accuracy
leaderboard — the things that make ESPN/FantasyPros enormous and are mostly monetization scaffolding. The
"personality" here is a thin tuning layer (a consistent voice over facts), not a persona cast.

**The hard prerequisite (surface, don't hide):** every central format above needs a **real stats/projections
source**. Today substrate-B is a mock fixture (`MOCK_GENERAL_STATS=true`, and the schema explicitly refuses
to un-mock). So the central hub is buildable *structurally* now against mocks, but **cannot be truthful until
you choose and wire a real stats source** (SportsDataIO key is staged; that's a live owner-gated decision).
Projections specifically may need a source that *provides* projections, or a model we build — a real scoping
question.

**DECISION 4:** (a) Approve this central section set (add/cut). (b) Confirm the "model-output, not
expert-opinion" stance — projections/rankings are labeled as computed, never as a pundit's call. (c) Flag the
stats-source decision as the gating dependency (I'll bring you a source-options brief separately).

---

## 5. The editorial calendar — four phases, including July (CONFIRM + deepen)

The research's other universal: **nobody goes dark in the offseason**, and the whole year is four phases. The
cadence engine *already implements* phase-awareness — this section is about the **programming menu** per
phase, which is currently thin.

| Phase (NFL) | League edition | Central hub |
|---|---|---|
| **Deep offseason** (Feb–Jun) | "Long View" retrospectives, dynasty-of-your-league, way-too-early | dynasty/way-too-early rankings, offseason news |
| **Draft season** (Jul–Aug) | league draft-history pieces, "remember when you drafted…" | **the one place a light draft-prep menu is worth it** — rankings/tiers, sleepers/busts (stat-driven) |
| **In-season** (Sep–Dec) | the weekly franchise loop (§3) | the weekly utility loop (§4), day-of-week timed |
| **Playoffs** (Wk15–17) | league championship narrative, title-race drama | playoff SoS, championship-week matchup targeting |

The **day-of-week loop** (Tue waiver → Wed rankings → Wed/Thu start-sit → etc.) is keyed to the *manager's
decision calendar*, and the engine already schedules to it. July's answer is concrete: **league tier runs
"Long View" + draft-history; central tier runs light stat-driven draft prep.** Not silence, not a random dump.

**DECISION 5:** Approve the four-phase menu as the calendar skeleton; react to how deep offseason/draft-season
programming should go (thin vs rich).

---

## 6. Auto-publish trust threshold (the scalability keystone)

The one thing that must NOT scale linearly with league count is **human curation labor**. The built model is
already reactive-not-preapproval (AI quality-gates, humans retract/correct after). This proposal reinforces a
**per-format trust tier**:

- **Central stat formats** → auto-publish (facts are checkable).
- **League narrative formats** → auto-publish through the judge gate, steward edits reactively.
- **Anything touching a real person unkindly** (roast/instigation) → already consent-gated; keep the tighter
  guard.

**DECISION 6:** Confirm reactive-curation-at-scale as policy (vs. per-piece human pre-approval, which would
cap league count). This is the single biggest philosophical commitment in the doc.

---

## 7. What this becomes (once you've reacted)

On sign-off I turn the locked decisions into `specs/49-editorial-architecture.md` + a build wave:
- **Wave-A (league polish, mostly built):** editorial-importance signal (Gap A), named-franchise layer (§3),
  deeper offseason menu.
- **Wave-B (central hub, greenfield):** central section taxonomy (Gap B), central typed templates + the
  first central generation path, the stat-driven formats (§4) — **structurally against mocks**, un-truthful
  until the stats source lands.
- **Owner-gated dependency:** real stats/projections source for the central hub to be honest (separate brief).

---

## Open decisions, collected (for the session)
1. Two-tier register split as the spine? (§1)
2. Fix both built-system gaps first? (§2)
3. League named-franchise layer + the roster/naming? (§3)
4. Central section set + "model not opinion" stance + stats-source as gating dep? (§4)
5. Four-phase calendar menu + offseason depth? (§5)
6. Reactive-curation-at-scale as policy? (§6)

Non-decisions (already built, flagged so we don't relitigate): the 11 content types, the cadence engine, the
three-register page model, lifecycle/reactions/consent, the tailoring bridge.
