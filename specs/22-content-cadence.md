# Spec 22 — Content Cadence (the weekly rhythm of the spectacle)

> Outcomes spec. Read `docs/NORTH-STAR.md` first — this spec exists to honor it. Builds **on** `specs/12-ai-cast.md`
> (the cast, content types, instigator/lore engine) and the cadence/trigger framework already wired in Phase 1
> (`src/jobs/content-planning.ts`). It changes nothing about HOW a piece is generated; it governs **WHEN** the cast
> performs, so the show has a dependable beat.

## The shift this spec makes (soul, not plumbing)
A spectacle the members are *characters in* only feels alive if it has a **pulse** — recaps land after games, rankings
arrive midweek, previews drop before kickoff, and the offseason still hums instead of going dark. Today the cast can
perform on demand, but its rhythm is keyed off raw day-of-week crons (`0 14 * * 3`) and `league.currentScoringPeriod`,
with **no awareness of the NFL calendar or game state.** That means: a "weekly preview" can fire during a bye-heavy
quiet week with nothing to preview; the offseason (it is **June now** — no live games for months) would either spam the
same slate or go silent; and a missed cron week has no backfill story. The North Star bar — *it has a pulse: things
happen, the cast reacts, the standings and arguments move* — demands that the **beat be tied to the NFL week and game
state**, not a blind clock. This spec makes the calendar the conductor.

The bar: a member who opens the league mid-week should find power rankings and an argument waiting; one who opens it
Sunday night should find recaps and roasts of *that day's* results; one who opens it in June should find the offseason
cast still mythologizing, re-litigating, and counting down — never a dead feed.

## What EXISTS today (do not rebuild — extend)
- `src/jobs/content-planning.ts` — `planCronContent({cadence, db, env, now})` over four cadences
  (`weekly-preview`, `weekly-wrap`, `mid-week`, `post-odds-refresh`); `planGameFinalContent`; `planTriggeredContent`.
  Each emits idempotent `content.generate` events keyed `content.generate:{league}:{persona}:{contentType}:{triggerKey}`.
  Cron `triggerKey` is `cron:{cadence}:{season}:{currentScoringPeriod}` (stable natural key, dedup-safe).
- `src/jobs/functions/content-plan-cron.ts` — one Inngest function per cadence, fixed `cron(...)` schedules
  (Wed 14:00 preview, Tue 14:00 wrap, Thu 18:00 mid-week, Thu 16:00 post-odds), `idempotency: "event.id"`,
  fans out `plan.planned` via `step.sendEvent`.
- `CRON_CANDIDATES` — the `{persona, content_type}` slate per cadence; `scheduledCandidatesFor` adds a `rivalry_piece`
  when a head-to-head rivalry signal exists (`hasRivalrySignal`).
- Entitlement gating (`specs/17`): `resolveCadenceEntitlement` resolves `ai.cadence.schedule` (premium tier),
  honors `DEV_OVERRIDE`, and enforces the per-week cap (`aiPostsPerWeek`, default 25, league-overridable) by counting
  `ai_generation_runs` in the current UTC week. Free leagues are **skipped** (no `content.generate` emitted).
- League state: `leagues.status` enum is `preseason | in_season | complete | unknown`; `leagues.season`,
  `leagues.currentScoringPeriod`. Active-league filter = `["preseason", "in_season"]`.
- Event-driven richness: `game.final`, `transaction`, `waiver`, `record.broken`, `lore.canonized`, `poll.closed`,
  `bet.settled`, `arena.standings.swing` already plan reactive pieces (`TRIGGER_CANDIDATES`).

## What CHANGES / is NEW (this spec)
1. **An NFL-calendar service** (`nflWeek(now) → {phase, seasonWeek, gamePhase}`) that the planner consults instead of
   trusting the bare clock. Mockable behind an interface (controllable clock + week, per `AGENTS.md`).
2. **A calendar-driven weekly editorial slate**: each cadence's candidate set is selected by *NFL phase + game state*,
   not fixed. In-season Sunday/Monday = recaps; midweek = rankings + awards + instigation; pre-kickoff = previews +
   betting angles.
3. **An explicit offseason / quiet-week cadence** — a distinct, slower slate (no live previews/recaps; instead
   retrospectives, lore re-litigation, countdowns, draft-season pieces). Relevant **now**.
4. **Reactive-event enrichment**: `game.final`, big swings, `lore.canonized`, `bet.settled` already trigger pieces;
   this spec ties their *richness* to the calendar (e.g. a `game.final` in Week 17 gets playoff-stakes framing).
5. **Idempotency + backfill discipline**: the natural key gains the NFL week so a missed week backfills exactly once and
   a re-run never double-posts.

Everything new is league-scoped (`WHERE league_id` + RLS where it touches data), mockable, deterministic, tested with the
controllable clock + mock LLM.

---

## 1. The NFL calendar service (the conductor)
A small, pure, mockable service is the single source of "where are we in the NFL year." The planner never reads
wall-clock day-of-week to decide a slate; it asks the calendar.

```
type NflPhase = "offseason" | "preseason" | "regular" | "playoffs" | "superbowl_week";
type GamePhase = "pre_kickoff" | "games_live" | "post_games" | "quiet";   // within a week
interface NflWeekState {
  phase: NflPhase;
  seasonWeek: number | null;     // 1..18 in regular, null in offseason
  gamePhase: GamePhase;          // derived from now vs the week's game windows
  isRivalryWindow?: boolean;     // e.g. a designated rivalry week
}
interface NflCalendar { weekState(now: Date): NflWeekState; }
```

- **Mock** (`MockNflCalendar`, default in tests/local per the `MOCK_*` convention) takes a fixed `NflWeekState` or a map
  of date → state, so a test "sets the week to Week 7, post-games" and asserts the slate deterministically.
- **Real** impl derives the state from the NFL schedule (the same ingestion/odds substrate the betting/odds-poll jobs
  use); it is **not** required to build or test this spec.
- The service is **calendar-of-record, league-agnostic** (the NFL week is the same for everyone); per-league flavor
  (rivalry week, this league's own playoffs) still comes from league data (`hasRivalrySignal`, `league_season_settings`
  postseason flags per `AGENTS.md`).

## 2. The weekly editorial calendar (slate by phase × game-state)
The cast performs a **publication week**, not a random drip. The default slate, selected by `NflWeekState`:

| When (NFL phase × gamePhase) | Slate (`{persona → content_type}`) | Why (ethos) |
|---|---|---|
| **Regular/playoffs · post_games** (Sun night, Mon) | Narrator `weekly_recap`, Analyst `power_rankings`, Trash-Talker `awards_superlatives` | Recaps + roasts land while the wounds are fresh — the show reacts to *what just happened*. |
| **Regular/playoffs · midweek quiet** (Tue–Wed) | Analyst `power_rankings` (if not already from game finals), Beat Reporter `awards_superlatives`, Trash-Talker `instigation_column`, Narrator `season_arc` | Midweek is for rankings, awards, and **starting arguments** — the room stays loud between games. |
| **Regular/playoffs · pre_kickoff** (Thu–Sat) | Commissioner `matchup_preview`, Analyst `matchup_preview`, Betting-Advisor `matchup_preview` + `arena_recap`; `+ rivalry_piece` (Trash-Talker) when rivalry signal | Previews + betting angles set the table before kickoff; rivalry week gets the needle. |
| **Playoffs · pre_kickoff** | as above, with **stakes framing** (elimination/championship) injected into the content task | The mythology peaks; the Narrator and Commissioner raise the stakes. |
| **Offseason / quiet week** | see §3 | The pulse must not stop in June. |

- This is a **mapping over the existing `CRON_CANDIDATES`**, not a rewrite: `scheduledCandidatesFor` gains the
  `NflWeekState` and returns the phase-appropriate slate. The four existing cadence names remain valid entry points (a
  cron still fires); the slate they *resolve to* is now calendar-aware. `post-odds-refresh` only emits when the phase
  has live betting markets (`pre_kickoff` in `regular`/`playoffs`); it degrades to empty otherwise (Betting-Advisor
  disabled gracefully, per `specs/12`).
- The slate stays **persona-grounded** (`specs/12` §1): each piece is performed by the persona whose *beat* owns that
  moment — the Narrator mythologizes the recap, the Analyst ranks, the Trash-Talker roasts and instigates, the
  Commissioner/Analyst/Betting-Advisor preview. The authenticity engine (`specs/12` §5) is unchanged.

## 3. Offseason / quiet-week cadence (alive in June)
The offseason is the test of whether this is a *living production* or a game-day toy. A distinct, slower slate runs when
`phase === "offseason"` (or a designated bye-heavy quiet week):

| Cadence | Slate | Ethos |
|---|---|---|
| **Weekly offseason beat** | Narrator `season_arc` (retrospective / "where the dynasty stands"), Beat Reporter `awards_superlatives` (offseason superlatives, all-time) | The story keeps being told; the league's history stays warm. |
| **Re-litigation** | Trash-Talker `instigation_column` → `settle_it_poll` over canon lore ("re-rank the all-time chokers") | The lore mechanic (`specs/12` §3–4) runs year-round; arguments don't need live games. |
| **Countdown / draft season** (preseason approaching) | Commissioner `season_arc` (what's at stake), Analyst `power_rankings` (preseason projections grounded in history) | Builds anticipation; the show ramps toward kickoff. |

- Offseason cadence is **lower-frequency** (a weekly beat, not the in-season Tue/Wed/Thu/Sun rhythm) and **never**
  emits live-game content types (`weekly_recap`, `matchup_preview` for a live game, betting previews) — there are no
  games to recap or bet. It draws entirely on stored history + canon lore.
- Because `leagues.status` has no `offseason` value (`complete` is the closest), the **NFL calendar phase**, not league
  status, decides offseason cadence. A league in `complete` status whose NFL phase is `offseason` still gets the
  offseason beat (the *show* outlives the *season*); a league in `complete` whose NFL phase has rolled to `preseason`
  gets the countdown slate. Active-league selection for offseason content uses NFL phase, not just
  `["preseason","in_season"]`. (If a richer league lifecycle is wanted later, add an `offseason` enum value in a
  follow-up — out of scope here.)

## 4. Scheduled + event-driven mix
Both surfaces stay, with a clean division of labor (per `specs/12` §6, `specs/09`):

- **Scheduled (cron) plans the *slate*** — the predictable weekly skeleton (preview / midweek / wrap / offseason beat).
  This is the dependable beat. The cron handler carries **no logic not reachable by event**, so each slate is
  unit-testable by calling `planCronContent` directly with a fixed `NflWeekState`.
- **Event-driven adds *reactive* pieces** on top — the unpredictable spikes the show reacts to:
  `game.final` (recap/review/roast, richer on blowout/upset/milestone), `transaction`/`waiver` (Beat Reporter scoop),
  `record.broken` (milestone piece), `lore.canonized`/`poll.closed` (Commissioner verdict), `bet.settled` /
  `arena.standings.swing` (Trash-Talker / Narrator reaction). These are unchanged in trigger wiring; this spec only
  enriches their **framing by phase** (a Week-17 `game.final` carries playoff stakes; an offseason `lore.canonized`
  still fires).
- The two surfaces **share idempotency** through the `content.generate` natural key (`specs/12` §6, §10): a reactive
  recap from `game.final` and a scheduled recap from the wrap slate for the same week + same `{persona, content_type}`
  resolve to the **same** event id and publish at most one piece (see §6).

## 5. Entitlement-aware cadence (premium full, free gated)
Unchanged in mechanism (`specs/17`, `resolveCadenceEntitlement` on `ai.cadence.schedule`), reaffirmed here because
cadence is exactly where the gate bites:

- **Premium leagues** get the full cast + full calendar slate (in-season rhythm + offseason beat + reactive events),
  subject to the per-week cap (`aiPostsPerWeek`, league-overridable). When the cap is hit mid-week, further slate
  pieces are skipped (`reason: "CAP_EXCEEDED"`) — the beat thins rather than breaking.
- **Free leagues** are **gated**: no `content.generate` events are emitted for them — for *any* cadence, slate, or
  reactive event. The planner records them in `skipped` (`reason: "TIER_REQUIRED", requiredTier: "premium"`) and emits
  nothing. The offseason slate and reactive events respect the **same** gate (no free-tier loophole via the quiet-week
  path).
- `DEV_OVERRIDE` bypasses the gate locally (existing behavior). Caps are counted per UTC week against
  `ai_generation_runs` — the offseason's lower frequency naturally sits well under the cap.

## 6. Idempotency + backfill (a missed week doesn't double-post or silently skip)
The natural key is the whole game here. Today the cron key is `cron:{cadence}:{season}:{currentScoringPeriod}`. This
spec **extends the key to carry the NFL week + phase** so the calendar — not the moment the cron happened to run — owns
identity:

- New cron trigger key: `cron:{cadence}:{phase}:{seasonWeek}` (e.g. `cron:weekly-wrap:regular:7`; offseason uses a
  monotonic offseason week token, e.g. `cron:offseason-beat:offseason:2026-w24`). The `content.generate` event id
  derived from `{league, persona, content_type, triggerKey}` is therefore **stable per NFL week**, not per cron-fire.
- **Re-run safety:** firing the same cadence twice for the same NFL week yields byte-identical event ids → Inngest
  `idempotency: "event.id"` + the generation job's `{league,persona,content_type,trigger_key}` idempotency publish at
  most one piece. (Acceptance: planner called twice for the same week → identical `event.id` set; `sentCount` reflects
  no new sends on the duplicate.)
- **Backfill:** a **missed** week (cron didn't run, e.g. an outage) can be replanned by invoking the planner with the
  *missed* week's `NflWeekState` (controllable clock). Because the key carries that week, backfill publishes that week's
  slate exactly once and does **not** collide with the current week's slate (different `seasonWeek`). A no-op re-run of
  an already-published week is detected by the existing dedup, so backfill is **idempotent and safe to re-issue**.
- **No silent skip:** a phase with an empty slate (e.g. `post-odds-refresh` in the offseason) returns an explicit empty
  `planned: []` (not an error), and an entitlement skip is recorded in `skipped` — so "nothing posted" is always an
  observable, attributable outcome, never a swallowed gap.

## 7. Persona / beat assignment across the week
Who performs when is grounded in the authenticity engine and each persona's **beat** (`specs/12` §1) — the calendar
just decides *which beat's moment it is*:

- **Pre-kickoff** → Commissioner + Analyst (previews, the league-official table-setting) and Betting-Advisor (angles);
  Trash-Talker on rivalry weeks (the needle).
- **Post-games** → Narrator (mythologize the result) + Analyst (the numbers review) + Trash-Talker (crown the villain /
  name the choker).
- **Midweek** → Beat Reporter (the churn, awards) + Trash-Talker (instigation → poll) + Narrator (season arc).
- **Offseason** → Narrator (retrospective) + Beat Reporter (all-time superlatives) + Trash-Talker (re-litigate canon) +
  Commissioner/Analyst (countdown to draft).
- A persona disabled in its league card (`ai_persona_cards`) drops out of the slate gracefully (Betting-Advisor before
  betting markets exist; any persona a league mutes). The slate **never** assigns a content type to a persona whose
  beat doesn't own it (no Analyst roast, no Trash-Talker dry preview) — the eval judge (`specs/12` §8) catches mismatch.

## 8. Interfaces (mockable, deterministic)
- **`NflCalendar`** *(new)* — `weekState(now) → NflWeekState`. Mock is deterministic and clock-controllable; real impl
  reads the NFL schedule substrate. Default mock per `MOCK_*` convention.
- **`planCronContent`** *(extended)* — accepts the resolved `NflWeekState` (or an injected `NflCalendar` + `now`),
  selects the slate, and emits the same `PlannedContentGenerateEvent[]` shape. No change to the event contract.
- **LLM / judge / grounding** — unchanged from `specs/12`/`07` (mock LLM deterministic per `{content_type, context,
  attempt}`; phase "stakes framing" is passed as part of the content task, still deterministic on the mock).

## 9. Isolation & entitlements (inherited, non-negotiable)
- League isolation per `specs/12` §9 / `AGENTS.md`: every league-scoped read (`hasRivalrySignal`, cap counting,
  postseason flags) goes through `withLeagueContext()` with explicit `WHERE league_id`; the NFL calendar itself is
  league-agnostic and reads no league rows.
- Entitlements per §5: free leagues emit zero `content.generate`; the cap is honored across scheduled + reactive +
  offseason paths alike.

## 10. Acceptance criteria (testable with a controllable clock/NFL-week + mock LLM, deterministic, offline)
- **Slate by phase × game-state:** with the mock calendar set to `regular · post_games`, the planned slate is
  recaps + rankings + awards (Narrator/Analyst/Trash-Talker); set to `regular · pre_kickoff`, it is previews +
  betting angles (Commissioner/Analyst/Betting-Advisor, `+rivalry_piece` when a rivalry signal exists); set to
  `regular · midweek`, it is rankings/awards/instigation/season-arc. Each asserts the exact `{persona, content_type}`
  set.
- **Offseason differs from in-season:** with the calendar set to `offseason`, the slate contains **no**
  `weekly_recap`/live `matchup_preview`/betting previews and **does** contain retrospective/`instigation_column`/
  countdown pieces; the in-season slate for the same league differs. `post-odds-refresh` in offseason returns
  `planned: []` (explicit, not error).
- **Stable keys / re-run:** calling the planner twice for the same `NflWeekState` yields an identical set of
  `content.generate` `event.id`s (key includes `{phase, seasonWeek}`); the duplicate run sends nothing new.
- **Backfill:** invoking the planner for a *missed* prior week (controllable clock set back) plans that week's slate
  with that week's keys, distinct from the current week's, and re-issuing it is a no-op (dedup). No collision, no
  double-post, no silent skip.
- **Reactive enrichment:** a `game.final` in a playoff week still plans the recap/review/roast slate (per `specs/12`)
  and carries playoff stakes framing in the content task; an offseason `lore.canonized` still triggers a
  `verdict_column`.
- **Entitlement gating:** a free league plans **zero** `content.generate` events for in-season, offseason, and reactive
  paths and appears in `skipped` with `TIER_REQUIRED/premium`; a premium league plans the full slate; when its weekly
  cap is reached, further slate pieces are skipped with `CAP_EXCEEDED` (beat thins, not breaks).
- **Persona/beat integrity:** every planned `{persona, content_type}` pair respects the persona's beat (no Analyst
  roast, no Trash-Talker dry preview); a muted persona drops from the slate.

## 11. Dependencies / blocked-by
- **Spec 12 (AI Cast):** the cast, content types, instigator/lore engine, authenticity engine, eval gate — all the
  *content* this spec schedules. Unchanged.
- **Spec 17 (Entitlements):** `ai.cadence.schedule` gate + caps; reused verbatim.
- **Spec 06 (Stats/Records) + identity:** rivalry signal, all-time records, postseason flags
  (`league_season_settings`) that shape the slate (rivalry week, playoff stakes, offseason retrospectives).
- **Spec 08 / odds substrate:** the NFL schedule the real `NflCalendar` reads, and the betting markets the
  `post-odds-refresh`/Betting-Advisor slate needs — both degrade gracefully (mock calendar, empty betting slate) until
  they exist. Paid keys not required to build or test.

## 12. Non-goals (this spec)
- Generating content (`specs/12`'s job) — this spec only governs **when**.
- Voice/stakes-prose tuning — the phase framing is passed as a structured task field; final wording is a later
  human-paired step.
- A real NFL-schedule integration / live game-window detection — the mock calendar is the contract; the real impl slots
  behind `NflCalendar` later.
- A new `offseason` league-status enum value, per-user cadence, multi-sport calendars, or notification scheduling
  (push timing is `specs/09`/realtime's concern).
