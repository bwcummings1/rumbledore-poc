# Spec 12 — The AI Cast & Spectacle Engine

> Outcomes spec. Read `docs/NORTH-STAR.md` first — this spec exists to honor it. Builds **on** `specs/07-ai-content.md`
> (the pipeline + isolation + injection rules still hold, unchanged). This file turns a working-but-generic content
> pipeline into a **cast that performs a spectacle**: distinct characters with beats and a point of view, who narrate,
> **instigate**, and pull the league's members *into the show*. The loop chooses HOW; isolation/injection invariants
> from `07` are inherited verbatim. **VOICE TUNING is a later human-paired step** — but the *functional* voice (persona
> structure, beats, instigation mechanics, content-type templates, the eval gate) is built **now**.

## The shift this spec makes (soul, not plumbing)
Round one produced one undifferentiated post shape per persona: a blob with `{title, summary, body}` keyed by
`{league_id, persona, trigger_key}`. It is grounded and isolated — but it *summarizes*; it does not *perform*. The cast
does not yet have **content types** (a recap reads like a power ranking reads like a roast), does not **instigate**
(no polls, no villains, no manufactured rivalries), and the league cannot **author its own mythology** (no lore/canon).
This spec adds those three things as **structure + a functional engine**, all testable against the MOCK LLM.

The bar (from the North Star): *a post should feel like it was written by someone who's been in your league for a
decade.* Generic fantasy content with a team name pasted in = **failure**, and the eval gate (below) is how we catch it.

## What EXISTS today (do not rebuild — extend)
- `src/ai/pipeline.ts` — `generateLeagueBlogPost({deps,input})`: retrieve `LeagueBlogContext` (RLS, `WHERE league_id`),
  ground (untrusted news fenced), generate via `LlmClient`, near-dup (cosine > 0.92) regenerate-then-skip, publish a
  `content_item kind='blog'`, embed to `ai_memory`, emit `blog.published` + push. Idempotent on `{league,persona,trigger_key}`.
- `src/ai/personas.ts` — 5 persona cards (Commissioner, Analyst, Narrator, Trash-Talker, Betting-Advisor) as system-prompt
  voices, per-league rows in `ai_persona_cards` (tunable/disableable).
- `src/ai/interfaces.ts` + `src/ai/mocks.ts` — `LlmClient` / `WebGrounding` / `EmbeddingProvider`, all mocked deterministically;
  `MockWebGrounding` already returns the adversarial injection fixture.
- `src/jobs/content-planning.ts` + `functions/content-plan-cron.ts` / `content-plan-game-final.ts` — cron cadences
  (`weekly-preview`, `weekly-wrap`, `post-odds-refresh`) and `game.final` fan-out → idempotent `content.generate` events.
- `content_item` (kinds `news|blog|ingest_event`), `ai_persona_cards`, `ai_generation_runs`, `ai_memory`.

## What CHANGES (this spec)
1. Add a **beat reporter** persona (six total) and give every persona an explicit **beat + when-it-performs** contract.
2. Add **content types** as structured templates (recap, power rankings, preview, awards, transaction reaction, season
   arc, rivalry piece, milestone piece) — a generation job now carries a `content_type`, and the output has typed structure.
3. Add the **INSTIGATOR engine**: a persona can emit an *instigation* (a poll / a manufactured rivalry / a crowned villain /
   a reaction to a user move) that becomes a first-class artifact, drives a **lore prompt**, and gets a **follow-up column**.
4. Add the **lore/canon authoring mechanic**: league claims → vote → ratified canon; the cast **consumes canon as fact**
   and **never asserts un-ratified history**.
5. Add the **authenticity engine**: the persona+league-facts prompt structure, grounded in canon/history/rivalries/identities.
6. Add the **LLM-judge eval interface** as a gate-able quality check on deterministic mocked fixtures.

Everything new is league-scoped (`WHERE league_id` + RLS), mockable, and tested with the deterministic mock LLM.

---

## 1. The cast (characters with beats, not labels)
Each persona is a **system-prompt voice** (per `07`) with an added **beat** (its territory), a **point of view** (its
stance), and a **when** (its triggers). Voices are distinct enough that the eval judge can tell them apart blind.

| Persona | Beat (territory) | Point of view | Performs when |
|---|---|---|---|
| **Commissioner** | League-official framing, standings, schedule, rulings/adjudication | Warm, authoritative, *speaks for the league*; settles disputes, ratifies tone | Pre-week cron; `lore.dispute`; `transaction` controversies; closes "settle it" polls with a verdict |
| **Analyst** | Matchups, projections-vs-results, trends, start/sit | Dry, credible, numbers-first; **never hypes**, undercuts narrative with data | Pre-week cron (previews); `game.final` (performance reviews); milestone/record math |
| **Narrator** | Editorial recaps; weaves history + rivalry into story | Editorial, literary, a little grand; **mythologizes** the week's biggest beat | `game.final` (recaps); `lore.canonized` (writes the legend); milestone/record pieces |
| **Trash-Talker** | Roasts, rivalry needling, callbacks to past failures/inside jokes | Irreverent, punchy, **antagonizes affectionately**; crowns villains, names chokers | `game.final` (blowouts/upsets); rivalry-week cron; reacts to a user's bad move/bet |
| **Beat Reporter** *(new)* | Transactions, waivers, "sources say," the daily churn | Scoopy, breathless, faux-insider; turns a waiver claim into a headline | `transaction`/`waiver` events; mid-week cron; bet-placed reactions |
| **Betting-Advisor** | Paper-betting markets/odds, "value" plays | Confident-but-hedged; **play-money only**, never real sportsbooks | `post-odds-refresh` cron; `bet.settled` reactions. Disabled until betting markets exist (degrades gracefully). |

- Persona cards stay per-league and tunable/disableable (extend `DEFAULT_PERSONA_CARDS` + the `ai_persona` pg enum with
  `beat_reporter`). Beat/POV/when live **in the card** (the cached prefix), so a league can retune a voice without code.
- **Constraints unchanged from `07`** (enforced by prompt + post-checks, never by voice): no abuse, no real-money/sportsbook
  language, no invented facts about real players beyond grounded news, **no leakage of another league**.

## 2. Content types (structured templates, not blobs)
A generation job carries a **`content_type`** (new enum, persona-compatible). Each type is a **template**: a stable shape
the persona fills, with a typed structure persisted in `content_item.metadata` so the surface can render real publication
structure (lead, sections, byline) later — *the engine produces the structure now; the surface styling waits.*

| Content type | Default persona(s) | Template shape (sections) | Primary trigger |
|---|---|---|---|
| `weekly_recap` | Narrator | lead → top result → upset/blowout → standings shift → kicker | `game.final` fan-out / `weekly-wrap` |
| `power_rankings` | Analyst | ranked list (N teams, rank + delta + one-line rationale, grounded in record) | `weekly-wrap` cron |
| `matchup_preview` | Analyst | per-matchup: edge, key number, x-factor, prediction (hedged) | `weekly-preview` cron |
| `awards_superlatives` | Beat Reporter / Trash-Talker | 3–5 named awards (MVP, Sicko of the Week, Choke Artist), each tied to a manager + fact | `weekly-wrap` |
| `transaction_reaction` | Beat Reporter | the move → grade → winner/loser → "sources say" kicker | `transaction`/`waiver` events |
| `season_arc` | Narrator | act so far → turning point → the team to beat → what's at stake | mid-season cron / milestone |
| `rivalry_piece` | Trash-Talker / Narrator | the history (canon) → the score → the stakes this week → the needle | rivalry-week cron / `game.final` rivalry hit |
| `milestone_record` | Analyst / Narrator | the record → who held it → who broke it → the math → the legend | `record.broken` / milestone keys |
| `instigation_column` | any | the provocation → the two sides → "settle it" CTA (links a poll) → stakes | instigator engine (see §3) |
| `verdict_column` | Commissioner | the question → the league's vote → the ruling → the new canon | `poll.closed` / `lore.canonized` |

- The `content_type` is part of the job key and the dedup key, so a recap and a power-ranking for the same week are
  distinct artifacts (extend `trigger_key`/`dedup_key` to include `content_type`; idempotency unchanged).
- Each template defines required structured fields; the **mock LLM returns deterministic structure** for that type (e.g.
  `power_rankings` returns an ordered array sized to the league's team count, each tied to a real team/record fact).
- `content_item.metadata.structure` holds the typed sections; `content_item.metadata.content_type` holds the type.

**Why structure (not blobs) matters now:** the surface (`05`/design) will render a *real publication* — lead, sections,
ranked tables, a byline (the persona name + beat) — and the eval judge (§8) inspects sections, not prose. So the engine
must emit machine-readable structure today even though the styling waits. A `weekly_recap` whose `lead` is empty, or a
`power_rankings` whose array length ≠ team count, is a **structural failure** caught by a correctness test (distinct from
the voice eval). The mock LLM is the contract: for each `content_type` it emits a fixed, fact-tied shape, so these
structural invariants are asserted offline with zero API calls.

**Mock-LLM determinism contract (per content type):** the mock derives output **only** from the supplied `LeagueBlogContext`
+ `content_type` + `attempt` (no randomness, no clock) — same inputs → byte-identical output. It must (a) size collections to
league facts (`power_rankings` length = team count; `awards_superlatives` = 3–5 named awards each bound to a real manager),
(b) cite ≥1 grounding entity by exact fixture token (so the authenticity floor and judge can match it), (c) never emit any
other league's identifiers, and (d) shift angle on `attempt===2` (the near-dup nudge path). This makes every acceptance
test below deterministic.

## 3. The INSTIGATOR engine (the soul)
Instigation is what makes the cast a cast and not a feed. A persona doesn't only report — it **provokes the room and pulls
the user in**. An instigation is a **first-class artifact** with a deterministic lifecycle, not a one-off sentence in a blob.

**Instigation kinds:** `settle_it_poll` (a debate question + options), `villain_crown` (names a manager/team the week's
villain, with the grounding fact), `manufactured_rivalry` (proposes two teams are now rivals, cites the head-to-head),
`user_move_reaction` (reacts to a specific roster/bet move by a specific manager).

**Lifecycle (each step idempotent, league-scoped):**
1. **Seed** — a persona run (or a dedicated planner) emits an `instigation` row `{league_id, persona, kind, prompt_text,
   options[], grounding_refs[], status='open'}`. Grounding refs point at real league facts (a record, a head-to-head, a
   transaction). An instigation **must** cite ≥1 league-owned grounding ref (no instigation from thin air).
2. **Surface as a column** — the seed produces an `instigation_column` `content_item` (the provocation, the two sides,
   the CTA) by the seeding persona, and emits `instigation.seeded`.
3. **Poll** — a `settle_it_poll` instigation creates a league-scoped **poll** `{question, options[], status}`; members
   vote (votes are RLS-scoped league rows; one vote per member). Polls close on a deadline or `poll.close` event.
4. **Resolve → lore** — on close, the poll result becomes a **lore claim** of kind `opinion` (e.g. "the league voted X the
   biggest choker"); ratification rules in §4 apply. A crowned villain / manufactured rivalry can likewise be **proposed
   as a lore claim** the league ratifies.
5. **Follow-up column** — `poll.closed` / `lore.canonized` triggers a **verdict_column** (Commissioner rules; Narrator
   mythologizes) that **consumes the now-canon result as fact**.

So the flow is concrete and testable: **instigation → column + poll → votes → lore claim → ratify → verdict column**.
The user is a participant (they vote, they're crowned, they're reacted to), exactly per the North Star.

**Data shapes (new, RLS-scoped):** `instigations {id, league_id, persona, kind, prompt_text, options jsonb, grounding_refs
jsonb, status: open|polling|resolved|skipped, resolution jsonb}`; `polls {id, league_id, instigation_id, question, options
jsonb, status: open|closed, closes_at}`; `poll_votes {id, league_id, poll_id, member_id, option_idx}` with a unique
`(league_id, poll_id, member_id)` so a member votes once. An instigation with zero grounding refs is **rejected at seed**
(no provocation from thin air) — the same authenticity floor as content. New events: `instigation.seeded`, `poll.closed`,
`lore.canonized`, `lore.dispute` (typed in `JOB_EVENTS`, idempotency-keyed by `{league_id, instigation_id|poll_id|claim_id}`).

## 4. Lore / canon authoring mechanic (the league writes its mythology)
Authenticity is **authored and ratified by the league**, not scraped. Two claim kinds:
- **`data_verifiable`** — the system auto-confirms against stored history (`stats`/`records`/`matchups`). Auto-ratified
  when the data agrees; auto-rejected (or flagged) when it doesn't.
- **`opinion`** — the league **votes**; a claim becomes **canon** on reaching a ratification threshold (e.g. majority of
  voting members, configurable per league). Canon can be branched/disputed → a `lore.dispute` re-litigates it.

Tables (new, RLS-scoped, `WHERE league_id` + `FORCE ROW LEVEL SECURITY` + `pgPolicy` per `AGENTS.md`):
`lore_claims {id, league_id, kind, author_member_id, statement, status: draft|voting|canon|rejected|disputed, evidence_refs[]}`,
`lore_votes {id, league_id, claim_id, member_id, vote}` (one per member), `lore_canon` materialization for fast retrieval.
Polls reuse this (`settle_it` instigation → `opinion` claim).

**The cast's contract with canon (non-negotiable — this is the soul's integrity):**
- The cast **consumes `status='canon'` claims as fact** in its prompts (canon facts join the authenticity prompt, §5).
- The cast **NEVER asserts un-ratified history**: a `draft`/`voting`/`disputed`/`rejected` claim must not appear in a
  generated piece as established fact. It may *instigate* it ("Settle it: …?") but may not state it as true.
- This is **testable**: a fixture with one canon and one un-ratified opinion claim → the canon appears as fact in a piece,
  the un-ratified one does not (and may only appear as an open question).

## 5. Authenticity engine (grounded in THIS league)
A piece is authentic because of **what's in the prompt**, assembled league-scoped and deterministic:
- **Authenticity bundle** (extends `LeagueBlogContext`): managers/team identities (canonical names from `persons`),
  ~10-yr history + all-time records, head-to-head **rivalries**, **ratified canon lore**, inside-joke/storyline memory,
  and prior posts (voice continuity + dedup). All `WHERE league_id` under RLS.
- **Prompt structure (prefix-stable → volatile)** — unchanged from `07`: cached prefix = `[persona card (beat/POV/voice) +
  stable league facts + canon lore]`; volatile = `[this week's results + untrusted news (fenced) + the content-type task +
  any instigation refs]`. No timestamps/UUIDs in the prefix (cache discipline).
- **Authenticity floor (post-check before publish):** a generated piece must reference ≥1 concrete league-owned entity
  (a real manager/team name, an all-time record, a head-to-head, or a canon fact) — a piece that names nothing specific to
  this league is rejected/regenerated as **generic-slop**. Mirrors the near-dup gate but for personalization.
- **Near-dup avoidance** stays (cosine > ~0.92, regenerate-then-skip) and now compares within `{league, content_type}` so a
  recap isn't deduped against a power ranking.

## 6. Cadence + triggers framework
Two trigger surfaces, both already partly wired (extend, don't replace):
- **Scheduled (Inngest cron):** `weekly-preview` (Wed pre-week → previews, power-ranking setup), `weekly-wrap` (Tue
  post-week → recaps, power rankings, awards, season arc), **`mid-week`** (new → beat-reporter churn, instigations),
  `post-odds-refresh` (betting). Each cadence maps to `{persona, content_type}` candidates.
- **Event-driven:** `game.final` (recap/review/roast fan-out — exists), **`transaction`/`waiver`** (new →
  transaction_reaction, beat reporter), **`record.broken`/milestone** (milestone_record), **`lore.canonized`** (verdict
  column), **`poll.closed`** (verdict column), **`bet.settled`** (Trash-Talker/Betting-Advisor reaction).
- Cron handlers carry **no logic not also reachable by event** (per `09`), so every cadence is unit-testable by invoking
  its planner directly. All planners emit idempotent `content.generate` events keyed by `{league, persona, content_type,
  trigger_key}`.

## 7. Interfaces (all mockable, behind `MOCK_*` per `01`/`AGENTS.md`)
- **`LlmClient`** (exists) — extended request carries `content_type` + optional `instigation`/`canon` refs; the mock
  returns **deterministic, type-shaped** output (recap sections, ranked array, poll options) tied to fixture facts. Real
  impl = Anthropic SDK direct, flagship `claude-opus-4-8` + bulk `claude-haiku-4-5`, prompt-cached prefix; **confirm exact
  model IDs/pricing via the `claude-api` skill at build time** (don't hardcode from memory). Voice tuning is later/human-paired.
- **`WebGrounding`** / **`EmbeddingProvider`** — unchanged from `07` (mocked; injection fixture preserved).
- **`LlmJudge`** *(new)* — `score(piece, rubric, leagueFacts) → { authenticity: 0–1, persona_match: 0–1, leakage: bool,
  notes }`. Judges *"does this read as authentic to THIS specific league + match the persona?"* The **mock judge is
  deterministic**: it scores by checking for fixture league-fact tokens + persona markers and sets `leakage=true` if any
  *other* league's identifiers appear — so the eval is a real, gate-able CI check with **no live API calls**. Real impl
  (Claude-as-judge) slots in behind the same interface later.

## 8. Quality gate — the LLM-judge eval (where correctness-gates can't see)
Voice/authenticity can't be asserted by `pnpm test` alone, so we add an **eval suite** that runs the cast over deterministic
fixtures and gates on the judge:
- **Golden fixtures** (league 95050 + a second league for isolation): per content type, generate with the mock LLM, score
  with the mock judge. Gate thresholds: `authenticity ≥ τ_a`, `persona_match ≥ τ_p`, `leakage == false` (τ configurable;
  set conservatively so the deterministic mock passes and a deliberately-generic fixture fails).
- The eval is **deterministic and offline** (mock LLM + mock judge), runs in CI behind the gates, and **fails the build**
  if a piece reads generic, breaks persona, or leaks another league. This is the functional stand-in for human voice review.

## 9. Isolation & injection (inherited, non-negotiable — `07` §"Isolation")
All new tables (`lore_claims`, `lore_votes`, `lore_canon`, `instigations`, `polls`, `poll_votes`, plus `content_type` on
content) are **league-scoped**: `WHERE league_id` on every query, `pgPolicy` + `FORCE ROW LEVEL SECURITY`, access via
`withLeagueContext()`. The cast is **never** trusted for isolation; un­trusted news stays fenced; the generation call
carries no tools/secrets. The cross-league canary from `07` extends to instigations, polls, and lore.

## 10. Acceptance criteria (testable with the MOCK LLM + MOCK judge, deterministic, offline)
- **Cast roles:** six personas exist with distinct beat/POV/voice in their cards; the mock judge can distinguish two
  personas' output on the same trigger (`persona_match` separates them); `beat_reporter` is in the `ai_persona` enum.
- **Content-type structure:** a `power_rankings` job yields an ordered array sized to the fixture's team count, each entry
  tied to a real team + record; a `weekly_recap` yields the recap sections; both persist typed `metadata.structure` +
  `metadata.content_type`; a recap and a ranking for the same week are distinct (not deduped against each other).
- **Trigger wiring:** each cadence (`weekly-preview`, `weekly-wrap`, `mid-week`, `post-odds-refresh`) and each event
  (`game.final`, `transaction`, `record.broken`, `lore.canonized`, `poll.closed`, `bet.settled`) plans the expected
  `{persona, content_type}` candidates as idempotent `content.generate` events; planners are unit-tested directly.
- **Instigator → lore/poll flow:** seeding a `settle_it_poll` creates an instigation row + an `instigation_column` +
  a poll; member votes record one-per-member; closing the poll yields an `opinion` lore claim; ratifying it triggers a
  `verdict_column` that **states the canon result as fact**. The full chain runs on mocks.
- **Canon discipline:** with one `canon` and one un-ratified `opinion` claim in a fixture, a generated piece references the
  canon as fact and does **not** assert the un-ratified one (it may only raise it as an open "settle it" question).
- **Authenticity floor:** a generated piece names ≥1 concrete league entity (manager/team/record/head-to-head/canon); a
  fixture forced to be generic is rejected as slop. Near-dup gate still rejects within `{league, content_type}`.
- **Isolation/injection (inherited):** a generation job, instigation, poll, and lore vote for league A touch only league A's
  rows; a missing `WHERE league_id` is still blocked by RLS; league B's identifiers never appear; the adversarial news item
  is not obeyed; the mock judge flags `leakage=true` on any cross-league token.
- **Idempotency:** re-running `{league, persona, content_type, trigger_key}` publishes at most one piece; re-seeding the
  same instigation is a no-op; double-closing a poll yields one verdict column.
- **Eval gate:** the judge-based eval suite runs in CI behind the gates with no live API calls and **fails** on a generic /
  persona-broken / leaking fixture.

## 11. Dependencies / blocked-by
- **Spec 07 (AI Content):** the pipeline, interfaces, mocks, isolation/injection rules this spec extends.
- **Spec 06 (Stats/Records) + identity:** supply managers, head-to-head rivalries, all-time records — the authenticity
  bundle's grounding facts. Cast quality scales with these; runs on whatever fixture facts exist (95050).
- **Spec 05 (Feeds/Home) + Realtime:** instigation columns / polls / verdicts publish into the league feed; polls and
  villain crowns want a realtime surface (`blog.published` plus new `poll.*`/`instigation.*`/`lore.*` events).
- **Spec 08 (Betting):** Betting-Advisor + `bet.settled` reactions need odds/markets; degrade gracefully until then.
- **Paid keys** (`ANTHROPIC_API_KEY`, Tavily, embeddings): not required to build/test — mocks (LLM, web, embeddings, judge)
  cover everything; real impls slot behind the interfaces when keys land.

## 12. Non-goals (this spec)
- **Voice tuning / final persona wording** — explicitly a later human-in-the-room step; we build the *functional* voice.
- UI/UX surfacing of polls/columns/standings of villains (rendering polish) — the engine emits the structure; the surface
  is `05`/design's job later.
- Real Claude-as-judge calls, fine-tuning, per-user personalization within a league, image/video, multi-sport.
- The central cross-league news hub (`07` non-goal stands) — this is the **per-league cast** only; arena/league-vs-league
  spectacle is `08`/arena.
