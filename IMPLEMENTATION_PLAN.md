# Rumbledore v2 — Implementation Plan

> **Execution source of truth.** A fresh agent session with only this file and repo access can execute any
> `T-###` card. Keep §8's ledger current — updating it is part of every task's definition of done.
>
> Companions: `PROJECT_CONTEXT.md` (intent — authoritative on *why*),
> `REPO-ANALYSIS/CLAUDE-Codebase-Deep-Dive-Analysis-2026-07-24-v1.md` (audit — what the code *is*),
> `REPO-ANALYSIS/CLAUDE-Analysis-and-Improvement-2026-07-24-v1.md` (backlog — `UIX-###` items and verdicts).

---

## 1. Snapshot & scope

- **Pinned to:** `e28265de724a757aa0d2249c810fd51c1baeef8a` · **Date:** 2026-07-28 · `main` == `origin/main`, CI green.
- **Scope:** **adopt-all** per `PROJECT_CONTEXT.md` Q29. Sequence is agent-owned; **this plan requires
  maintainer greenlight before T-002 begins** (working agreement, §5 of the context doc).
- **Excluded, with reason:**
  - `UIX-009` (settled-slip amounts), `UIX-105` (cross-event parlay race) — **moot**, die with the bankroll engine.
  - "Basic Sync" free tier — **non-goal**, `PROJECT_CONTEXT.md` §4.
  - Dropping refuted lore from AI context — **rejected by maintainer**; refutation is signal.
  - `REC-001…007` — closed 2026-07-24; residual defects re-filed as `UIX-109`/`110`/`111`.

### 1.1 Two planning-time discoveries that reshaped the sequence

| # | Discovery | Label | Consequence |
|---|---|---|---|
| D1 | Odds ingestion pulls only `FEATURED_MARKETS = ["h2h","spreads","totals"]` (`src/betting/real.ts:65`). Player props are **not ingested** and require The Odds API's per-event endpoint — a different call pattern with materially different quota cost. | **Verified** | Pick 'em's full pick universe (context §3.3) is not reachable today. Spike `T-002` before `T-013`. |
| D2 | The Yahoo client is substantially implemented — 1,500+ lines against `https://fantasysports.yahooapis.com`, 13 tests. | **Verified** | Yahoo's gap is the decoding dictionary + credentials, not transport. Lowers M3 risk; the dictionary's *size* remains unknown → spike `T-003`. |

---

## 2. Design decisions

**DD-1 — Bankroll engine: tag-and-delete, not fork or flag.** *(one-way door — mitigated by the tag)*
Rejected: long-lived branch (rots, demands a painful merge, and the maintainer already flagged branch
divergence as confusing); feature flag (doubles test surface, leaves dead code every future agent must
reason about). Git history is the archive; the tag makes recovery a named operation.
**Survives the delete:** `ingestion.ts`, `real.ts`, `betting_event`, `betting_market`, the grading trigger,
and the arena shell. **Deleted:** `bankroll.ts`, stake/parlay/payout paths in `placement.ts`, rollover.

**DD-2 — Scoring denominator is `allocated_picks − pushes`.** Pushes void rather than grade incorrect.
Rejected: grade-as-incorrect (punishes an undecidable outcome, and drives users off whole-number lines,
narrowing the pool through the back door); half credit (breaks binary grading, harder to explain);
half-point-lines-only (shrinks the pick universe the maintainer explicitly wants preserved). Stays
deterministic and ungameable — nobody can choose to push.

**DD-3 — Lore reaches the model as a distilled digest, not raw claims.** Refuted and disputed claims are
**included** as character. Rejected: top-K retrieval of raw claims (still exposes quotable strings — the
actual failure mode is parroting, not volume); a "don't quote" prompt instruction alone (unenforceable).
Digest generation doubles as the sanitization point for `UIX-110`.

**DD-4 — Entitlements are two independent axes, not one ladder.** League axis (data → +league AI) and user
axis (+personal assistant) resolve separately; a league's AI subscription never implies personal-assistant
access. Rejected: a linear tier ladder — it cannot express the bifurcation in context §3.2.

**DD-5 — `league_admin` collapses into commissioner; the ACL is amended to match the rank ladder.**
This **inverts** the direction recorded in backlog §7.1, per the maintainer's Q5 ruling. Rejected:
demoting `league_admin` below `data_steward` — contradicts recorded intent that admins ⊇ assigned roles.

**DD-6 — Compliance data is collected from first signup while unenforced.** `geo_state`, `phone_verified`,
tier on every user. Columns are cheap now; retroactively obtaining user actions is not. *One-way door in
practice* — the alternative is asking existing users to re-verify.

**Open assumptions → spikes:** ~~player-props feasibility → `T-002`~~ **RESOLVED — see DD-7.**
~~Yahoo code-space size → `T-003`~~ **PARTIALLY RESOLVED — see DD-8.** The gating *shape* question is
answered and R2 is retired; exact sizing needs a real league (already gated by T-020's approval flag).

**DD-11 — `UIX-101` is a missing producer, not a missing id. T-007 moves into M2.** *(2026-07-28, structural; from T-007)*

**The card's approach is unviable as written.** It said the emitter "must resolve the fantasy matchup to its
corresponding `betting_event`." **There is no correspondence to resolve.** A `fantasy_matchups` row is two
*fantasy* teams meeting in week N; a `betting_event` row is a real NFL game (`homeTeam`, `awayTeam`,
`startTime`, `providerEventId`). A fantasy matchup does not map to one NFL game — no join, no heuristic,
no shared key. `AGENTS.md` describes the intended split correctly; what is missing is the **producer**.

**Verified absent:** `game.final` has exactly one production emitter (`ingestion-live.ts:1360-1376`), which
fires on *fantasy* matchups for AI recaps. `odds-poll.ts` — the only job that touches the odds catalog —
emits **zero** events (`grep -c 'gameFinal|sendEvent'` = 0). Nothing anywhere detects a real NFL game
finishing. So bets are never settled because **nobody ever says a game ended.**

**The fix is a betting-event results producer:** after refreshing the odds catalog, select events whose
`startTime` has passed and whose status is not final, and emit `game.final` carrying `bettingEventId` per
interested entry. The settle path is already safe for optimistic emission — `settleBettingEvent` returns
`skippedReason: "result_not_final"` and mutates nothing when the result is not yet final
(`settlement.ts:750-761`).

**Why it moves to M2 rather than landing now:** the producer must emit one event per *interested party*,
and "who is interested" is currently a `bet_slips` query — a table **T-011 deletes**. Building it against
the bankroll model and rewriting it against picks two tasks later is pure waste. The event-identity half is
design-independent and survives; the fan-out half is not. **Resequenced: T-007 becomes T-013a, built once,
correctly, against the Pick 'em model.** M1's other three items are independent and proceed now.

**DD-9 — Central AI usage goes in its own central table, not a nullable `ai_usage_event`.** *(2026-07-28, from T-005/T-006)*

The obvious move — make `ai_usage_event.league_id` nullable and switch to the mixed-scope policy that
`content_item` and `ai_memory` use — is **rejected**. Two reasons:

1. **It would weaken league isolation for no benefit.** A mixed-scope policy matches `league_id IS NULL`
   rows from *any* league context, so platform-level cost data becomes readable inside every league.
   `ai_usage_event` is at `src/db/rls.test.ts:43` in the strict `leagueScopedTables` group precisely
   because it is customer-attributable data.
2. **Pricing needs them separated anyway.** Per `PROJECT_CONTEXT.md` §3.2, the league AI tier is priced
   from **league-attributable** cost, while central-hub generation is **platform overhead** absorbed by the
   business. Merging them into one table with a nullable discriminator makes the pricing query harder, not
   easier.

**Decision:** central usage lands in a separate central-plane table (no restrictive RLS), following the
established convention for `arena_standing` / `betting_event` / `betting_market` (audit §3, §9.14).
`ai_usage_event` keeps its `notNull` league scope and its `_isolation` policy unchanged — **no RLS test
churn, no isolation weakened.** Rejected alternative (c), "don't record central usage," leaves the pricing
instrument incomplete, which is the whole point of `UIX-111`.

**Consequence:** T-006 no longer needs an `ai_usage_event` migration. T-005a builds the central table.

**DD-10 — The cost-rollup overflow is in the cast, not the column.** *(2026-07-28, corrects Discovery-era framing)*
`sum(integer)` already returns `bigint` in Postgres, so the column never overflows — `::int` on the sum is
what throws at ~$2,147/league. A single event cannot approach `int4` (one generation costs single-digit
dollars at most), so **no column migration is required**. Casting to `::double precision` fixes it and
returns a JS `number` (exact for integers to 2^53 ≈ $9B), avoiding the `pg`-returns-`int8`-as-string trap
that `::bigint` would introduce against the `sql<number>` types.

**DD-8 — Yahoo needs no interface change; reuse Sleeper's string→numeric bridge.** *(resolves R2; evidence: T-003, 2026-07-28)*

**The gating question — string keys or numeric ids — is answered: Yahoo uses STRINGS.** Verified from the
client (`display_position: string` at `src/providers/yahoo/client.ts:804`, `selected_position` at `:805`)
and from fixtures (`"QB"`, `"BN"`, `"KC"`, `"add/drop"`).

**R2 is retired — this is not a blocker, because Sleeper is string-keyed too and already solved it.**
`src/providers/sleeper/reference-data.ts` bridges strings into the numeric
`ProviderDecodingDictionary` contract with a stable-hash encoder: `stableCodeId(kind, code)` derives a
deterministic numeric id (`:424`), `numericDictionary()` builds `Record<number,T>` from `Record<string,T>`
and **throws on collision at module load** (`:454-474`), and `encodeObservedCode()` returns `+id` for known
codes and `−id` for unknown ones (`:442-452`) — the negative sentinel is how an unknown code surfaces to
the integrity check. Yahoo follows the identical pattern. **No change to `decoding.ts`, and no ripple into
ESPN or Sleeper.**

**New blocking predecessor for T-019 (replaces the interface-widening branch, which is not triggered):**
the bridge is **Sleeper-private** — `normalizedCode`, `stableCodeId`, `encodeCode`, `numericDictionary`,
and `encodeObservedCode` are all non-exported module locals. T-019 must **extract them to a shared
provider-codes module** before building Yahoo's dictionary. Copying instead would repeat the triplicated
hand-rolled-RESP-client mistake the audit already flags (prior §5) — three copies of a collision-detecting
hash encoder is exactly the divergence risk that finding describes.

**Sizing — Inferred, not Verified.** Yahoo's fixtures are 21.5KB of **synthetic stubs**, not a vocabulary
corpus: 2 positions (`QB`, `RB`), 2 slots (`BN`, `QB`), 1 pro team (`KC`), 1 transaction type (`add/drop`),
**zero** `stat_id` values and **zero** `roster_positions` declarations. They cannot enumerate the real code
space. By analogy to Sleeper's real dictionary (~250 entries across the five classes, 574 lines), T-019 is
estimated at **L, ~400–600 lines** — but this is an estimate by analogy, and Yahoo's `stat_id` space in
particular is entirely unobserved. Yahoo's public developer landing page does not publish the
enumerations (checked); they sit behind the full API docs or a live league.
**⛔ Firm sizing and the closure test require a real Yahoo league — already gated by T-020/T-021.**

**DD-7 — Ingest player props. Path A confirmed.** *(resolves D1; evidence: T-002, 2026-07-28)*

Three findings, all **Verified**:

1. **The schema already supports props.** `bettingMarketType` (`src/db/schema.ts:390-395`) already enumerates
   `player_prop` alongside `moneyline`/`spread`/`total`, and `betting_market` already carries `subject`
   (default `"game"`) and `propType` (`:2758-2761`). **No schema widening is required** — this was the
   assumed-expensive part of T-012 and it is already done.
2. **Props need a different endpoint and a per-event call.** Featured markets come from
   `/v4/sports/{sport}/odds` (one call, all games — `src/betting/real.ts:434`). Props come from
   `/v4/sports/{sport}/events/{eventId}/odds`, **one request per event**. Cost formula:
   `credits = markets × regions`, charged per request.
3. **The cost is fixed per sport, not per league — this is the decisive point.** `betting_event` and
   `betting_market` are central and league-agnostic (audit §3), so every league picks from the same NFL
   slate. Props quota is a **flat platform cost that does not scale with tenant count.**

**Sizing** (NFL ≈ 16 games/week, 1 region, refreshing 4×/day over the 4 days before a slate ≈ 16 refreshes/week):

| Scenario | Markets | Credits/refresh | Credits/month | Plan needed |
|---|---|---|---|---|
| Featured only (today) | 3 | 3 | ~200 | Free (500/mo) |
| Modest props | 5 | 80 | ~5,500 | **$30/mo (20K)** |
| Rich DFS-style props | 15 | 240 | ~16,500 | **$30/mo (20K)**, tight — $59 (100K) for headroom |

At $40/league/year, roughly **nine paying leagues** cover the $30/month plan outright, and the cost never
grows with adoption. Props are affordable; the pick-universe breadth that the syndicate defense depends on
(context §7.4) is preserved. **T-012 proceeds down path A.**

**Two conditions on that verdict:**
- ⛔ **The free tier is insufficient.** 500 credits/month cannot cover even the modest scenario. A paid Odds
  API plan must be active before props ingestion goes live — a maintainer spend decision, flagged on `T-012`.
- The spend guard's odds cap is denominated in the **wrong unit** for this endpoint — see Discovery #1.

---

## 3. Milestone map

| M | Outcome (demonstrable) | Tasks | Check-in |
|---|---|---|---|
| **M0** | Baselines recorded; both unknowns resolved; cost meter reads true | T-001…T-006 | **Greenlight gate** + spike readout |
| **M1** | Multi-tenant boundaries correct; settlement actually fires | T-007…T-010 | Demo: a bet settles end-to-end |
| **M2** | Pick 'em playable; bankroll gone; trunk green throughout | T-011…T-018 | Demo: submit picks → grade → league accuracy |
| **M3** | ESPN + Sleeper + Yahoo all import a real league | T-019…T-023 | Demo: one real league per provider |
| **M4** | Tiers enforced; billing live | T-024…T-027 | **Approval:** real money |
| **M5** | Lore ambient; injection surface closed | T-028…T-031 | **Approval:** digest sample |
| **M6** | Remaining UI/UX + jobs backlog | T-032…T-036 | Ship |

**Critical path:** T-001 → T-002 → T-012 → T-013 → T-014 → T-015 → T-018.
**Parallel tracks:** M1 runs fully parallel to the M2 spike-and-build (disjoint files). M3 runs parallel to
M2 after T-003 reports. M5 is independent of M2/M3/M4 throughout.

---

## 4. Task cards

### M0 — Ground truth & de-risking

---
**T-001** · pending · traces to: *enabling infrastructure* · **S**
**Objective:** Commit the planning artifacts and record the verification baseline.
**Context pointers:** `PROJECT_CONTEXT.md` (untracked), `REPO-ANALYSIS/CLAUDE-Analysis-and-Improvement-2026-07-24-v1.md` (modified, §8 added), this file.
**Approach:** Commit all three. Then run the full gate suite and paste actual output into §5.1 of this file.
Use `PATH=/usr/bin:$PATH` for every pnpm invocation — `node` on PATH is a bun shim that breaks Next/tsc.
**Dependencies:** none. **Parallel with:** nothing (first task).
**Out of scope:** any source change. Code work begins at T-004.
**Acceptance:**
```
PATH=/usr/bin:$PATH pnpm typecheck && pnpm lint && pnpm secret-scan   # all exit 0
PATH=/usr/bin:$PATH pnpm test          # expect 1412 passed / 0 failed / 5 skipped
PATH=/usr/bin:$PATH pnpm build && pnpm perf:pwa                        # exit 0
git status --porcelain                                                 # empty
```
§5.1 contains real numbers, not placeholders.
**Risk/rollback:** none. Docs only.
**Approval flag:** ⛔ **This plan requires maintainer greenlight before T-002 starts.** Present §3 and §2.

---
**T-002** · pending · traces to: D1 / `UIX-113` · **S** · 🔬 **SPIKE**
**Objective:** Determine whether the full DFS pick universe (player props) is reachable, and at what cost.
**Context pointers:** `src/betting/real.ts:65` (`FEATURED_MARKETS`), `:76` (`marketTypeFor`), `:290` (market
flattening), `src/betting/ingestion.ts`, `src/betting/interfaces.ts`. Context §3.3.
**Approach:** Read-only reconnaissance against The Odds API. Answer, with evidence: which endpoint serves
player props; quota cost per event versus the current featured-markets call; the returned market shape and
whether `BettingMarketType` can absorb it or must widen; whether push-capable (whole-number) lines appear
in props. Write findings into §2 as a resolved assumption and file follow-ups.
**Decision point:** if props are affordable at expected league volume → T-012 ingests them.
If quota-prohibitive → **fall back to featured markets for season 1**, record the reduced pick universe as
an accepted limitation in `PROJECT_CONTEXT.md`, and re-check the syndicate-defense argument (breadth was
load-bearing for it).
**Dependencies:** T-001. **Parallel with:** T-003, T-004, T-005, T-006, and all of M1.
**Out of scope:** writing ingestion code (T-012 owns it). No schema changes.
**Acceptance:** §2's open assumption for D1 is replaced by a finding with cited evidence and a chosen branch.
No source files modified (`git status --porcelain` shows only this file).
**Risk/rollback:** none — read-only.
**Approval flag:** ⛔ if the spike needs a **real Odds API key**, stop and request it; do not proceed on mocks.

---
**T-003** · pending · traces to: `UIX-116` · **S** · 🔬 **SPIKE**
**Objective:** Size the Yahoo decoding dictionary by enumerating Yahoo's code space.
**Context pointers:** `src/providers/yahoo/client.ts` (transport, already real — D2),
`src/providers/decoding.ts:50-61` (`PROVIDER_DECODING_DICTIONARIES` — Yahoo absent),
`src/providers/sleeper/reference-data.ts` (574 lines — the comparable target),
`src/providers/espn/reference-data.ts` (the richer precedent).
**Approach:** Enumerate what Yahoo returns for the five required code classes — `activities`,
`lineupSlots`, `positions`, `proTeams`, `scoringStats`. Report counts per class and whether Yahoo exposes
stable numeric ids or string keys (this determines whether `ProviderDecodingDictionary`'s
`Record<number, unknown>` shape fits at all). Produce a sized estimate for T-019.
**Decision point:** if Yahoo uses string keys → the dictionary interface must widen first; file that as a
blocking predecessor to T-019 and note the blast radius across ESPN/Sleeper.
**Dependencies:** T-001. **Parallel with:** T-002 and everything in M0/M1.
**Out of scope:** writing the dictionary (T-019). Do not touch `decoding.ts`.
**Acceptance:** a findings section in this file with per-class counts, the id-shape answer, a T-019 size
estimate, and any blocking predecessor filed. No source modified.
**Risk/rollback:** none — read-only.
**Approval flag:** ⛔ if real Yahoo OAuth credentials are needed to enumerate, stop and request them.

---
**T-004** · pending · traces to: `UIX-109` · **S**
**Objective:** Correct the Opus price row so the cost meter reads true, and make the test able to catch it.
**Context pointers:** `src/ai/usage-attribution.ts:145` (`MODEL_PRICE_MICROS_PER_TOKEN`),
`src/ai/model-config.ts:3` (`ANTHROPIC_FLAGSHIP_MODEL = "claude-opus-4-8"`),
`src/ai/usage-attribution.test.ts:180`. Context §7.3.
**Approach:** `claude-opus-4-8` lists at **$5 input / $25 output per MTok** → `input: 5, output: 25`.
Derive cache rows from the existing multipliers (1.25× input, 0.1× input) → `cacheCreation: 6.25,
cacheRead: 0.5`. **Haiku's row is already correct — do not touch it.** The existing test asserts the table
against itself (`.toBe(100 * 15 + 40 * 75)`) and therefore cannot detect a wrong price; rewrite it to
assert against expected **dollar amounts** derived independently.
**Dependencies:** T-001. **Parallel with:** all of M0 and M1.
**Out of scope:** usage *coverage* (T-005 owns it); the `int` overflow ceiling (T-006); the `estimated`
flag semantics (documented non-finding — leave alone).
**Acceptance:**
```
PATH=/usr/bin:$PATH pnpm test src/ai/usage-attribution.test.ts   # passes
```
Test fails if the Opus row is reverted to 15/75. `pnpm typecheck && pnpm lint` exit 0.
**Risk/rollback:** trivial — one constant + one test. Revert the commit.

---
> **⚠️ AMENDED 2026-07-28 (material divergence, logged).** The original card assumed this was "additive
> instrumentation, low risk." **That assumption is false**, verified before any code was written:
> 1. `ai_usage_event.league_id` is `uuid(...).notNull()` with an FK to `leagues.id`
>    (`src/db/schema.ts:3747-3749`), and `recordAiUsageEvent` inserts through
>    `withLeagueContext(db, input.leagueId, …)`. **Central content is `league_id IS NULL` by design**, so
>    central usage cannot be recorded without a nullable column *and* an RLS policy change.
> 2. `EmbeddingProvider.embed()` returns `Promise<number[]>` (`src/ai/interfaces.ts:754`) — **no token or
>    usage data exists to record.** Capturing it changes the provider contract, both mocks, the real Voyage
>    client, and both call sites.
>
> Neither is unviable — the repo already has a proven mixed-scope pattern (`content_item`, `ai_memory` use
> `league_id IS NULL OR = current_league_id()`) — but this is schema + interface work, not instrumentation.
> **Split into T-005a / T-005b; the schema change folds into T-006, which already touches this table.**

---
**T-005a** · pending · traces to: `UIX-111` · **M**
**Objective:** Record central-pipeline AI usage (needs T-006's schema change first).
**Context pointers:** `src/ai/central-pipeline.ts:660,684` (the two `generateCentral` calls),
`src/ai/pipeline.ts:405-425` (the per-attempt pattern to mirror), `src/ai/usage-attribution.ts:220-242`.
**Approach:** After T-006 makes `leagueId` nullable with a mixed-scope policy, record a `league_id = NULL`
usage row per central attempt, mirroring the blogger's shape. Central generation retries once, so record
**per attempt**, not per publish.
**Dependencies:** **T-006** (hard gate — schema). **Out of scope:** embeddings (T-005b); pricing logic.
**Acceptance:** a mock central generation writes a `costMicrosUsd > 0` row with `league_id IS NULL`;
`pnpm test src/ai/ && pnpm eval:ai:offline` green.

---
**T-005b** · pending · traces to: `UIX-111` · **M**
**Objective:** Capture embedding usage — requires widening the `EmbeddingProvider` contract.
**Context pointers:** `src/ai/interfaces.ts:752-755`, `src/ai/dependencies.ts:226-238`,
`src/ai/mocks.ts:1794,1814` (two impls), `src/ai/central-pipeline.ts:664,688`.
**Approach:** Return usage alongside the vector (e.g. `{embedding, usage}`) or add a parallel
`embedWithUsage`. **The `voyage` price row (`$0.02/MTok`) is Unverified and becomes live here — check it
against current Voyage pricing and correct it, applying T-004's lesson: assert an independent literal.**
**Dependencies:** T-006. **Out of scope:** the near-dup gate's semantics; retrieval behavior.
**Acceptance:** an embedding call writes a usage row; both mocks updated; `pnpm test src/ai/` green.
**Risk:** medium — changes a provider contract with four implementors.

---
**T-006** · pending · traces to: `UIX-119`, `UIX-111` · **M**
**Objective:** Land the prize-readiness columns and remove the newly-reachable rollup overflow.
**Context pointers:** `src/db/schema.ts:3771` (`cost_micros_usd integer`),
`src/ai/usage-attribution.ts:288,298,326` (`sum(...)::int`), the Better Auth user plane. Context §3.4, DD-6.
**Approach:** Add `geo_state`, `phone_verified`, and tier to the user model — **stored and collected, not
enforced**. Widen the cost column and its rollup casts to `bigint` — the ~$2,147/league ceiling was
unreachable while the column was always 0 and becomes reachable the moment T-004/T-005 land.
Migrations are **hand-authored** SQL (≥0035 convention) and **must** be journaled in
`src/db/migrations/meta/_journal.json` — `pnpm db:generate` is effectively banned (audit §9.3).
If any new table were league-scoped it needs `pgPolicy` + hand-added `FORCE ROW LEVEL SECURITY`; these are
auth-plane columns, so confirm that in the card's notes rather than assuming.
**Dependencies:** T-005. **Parallel with:** M1.
**Out of scope:** enforcing geo-blocking or 2FA (a later prize-activation task); entitlement resolution (T-024).
**Acceptance:**
```
PATH=/usr/bin:$PATH pnpm test src/db/          # migrations apply; RLS completeness test still passes
PATH=/usr/bin:$PATH pnpm test && pnpm build    # green
```
A rollup over a synthetic >$2,147 league no longer throws.
**Risk/rollback:** medium — schema change. Rollback is a down-migration; write it before applying.

### M1 — Multi-tenant boundary correctness *(fully parallel to M0/M2 spikes)*

---
**T-007** · pending · traces to: `UIX-101` · **M**
**Objective:** Make settlement actually fire — resolve `game.final` to a real `betting_event`.
**Context pointers:** `src/jobs/functions/ingestion-live.ts:1360-1376` (`plannedGameFinalEventsFor` — the
only production emitter, sets `gameId: matchup.id`), `src/jobs/functions/betting-settle-game-final.ts:529`
(`data.bettingEventId ?? data.gameId`), `src/betting/settlement.ts:302-306` (`loadBettingEvent`),
`src/db/schema.ts:747` vs `:2723` (independent `defaultRandom()` key spaces). Backlog §7.1 UIX-101.
**Approach:** The emitter must resolve the fantasy matchup to its corresponding `betting_event` and populate
`bettingEventId`. `AGENTS.md` already records the intended convention: `gameId` is a `fantasy_matchups.id`
for AI content; `bettingEventId` names the central `betting_event.id`. **The bug is that no producer honors
it.** Decide and record how the mapping is established (provider game id? team + kickoff?) — this is a real
design choice, not a lookup.
**Known trap:** every existing settlement test hand-supplies `bettingEventId` with a throwaway random
`gameId`, so the production payload shape is untested. **A regression test asserting the emitter's real
payload is part of done** — without it this bug reappears.
**Dependencies:** T-001. **Parallel with:** T-008/T-009/T-010, all of M0.
**Out of scope:** Pick 'em scoring (T-014); notification retry loss (T-010 does not own it either — file
`UIX-106` as a follow-up card if not already covered by M2).
**Acceptance:**
```
PATH=/usr/bin:$PATH pnpm test src/jobs/betting-settle-game-final.test.ts src/betting/settlement.test.ts
```
A test drives the **real** `plannedGameFinalEventsFor` output through the settle consumer and asserts
`finalizedSlips > 0`. `skippedReason: "event_not_found"` no longer occurs on the production path.
**Risk/rollback:** medium — touches ingestion and settlement. Revert the commit; nothing persists incorrectly.

---
**T-008** · pending · traces to: `UIX-102` · **S**
**Objective:** Amend the ACL to match the rank ladder; collapse `league_admin` into commissioner.
**Context pointers:** `src/auth/permissions.ts:31-34` (`league_admin` → `leagueData: ["review"]`),
`src/auth/guards.ts:44-49` (`ROLE_RANK`), `src/onboarding/stewards.ts:224-231`
(`minRole: "commissioner"` — **keep**). `PROJECT_CONTEXT.md` §7.1, DD-5.
**Approach:** **The ladder is correct — fix the ACL.** Admins may do anything an assigned role can; assigned
roles cannot do everything an admin can; only the commissioner assigns roles. Update the statements and the
stale comment. `hasPermission` has zero server-side callers — either wire it to the corrected statements or
delete it, but **do not leave two disagreeing authority models in the tree.**
**Dependencies:** T-001. **Parallel with:** T-007, T-009, T-010.
**Out of scope:** the Better Auth org-route bypass (T-009). No changes to the `league_role` pg enum without
a migration — if collapsing roles requires one, split that into its own card.
**Acceptance:** `pnpm test src/auth/` passes; a test asserts a `league_admin` may perform a
`leagueData:manage` action and may **not** assign roles. `pnpm typecheck && pnpm lint` exit 0.
**Risk/rollback:** low-medium — authorization semantics. Revert the commit; re-run the auth suite.

---
**T-009** · pending · traces to: `UIX-103` · **M**
**Objective:** Close the Better Auth organization-route bypass of commissioner-only role assignment.
**Context pointers:** `src/app/api/auth/[...all]/route.ts:10-17` (mounts the full handler),
`src/auth/instance.ts:84-93` (organization plugin), `src/onboarding/stewards.ts:224-231` (the guard being
bypassed). Verified: `/organization/update-member-role` and `/organization/remove-member` are live routes.
**Approach:** These paths run no `requireLeagueRole`, write no audit-ledger row, and skip cleanup of the
removed member's identity claims and push subscriptions. Disable or fence the member-mutation routes so
role changes flow only through the domain path. *Verified not exploitable and out of scope:* self-promotion
to commissioner — Better Auth blocks non-creators from touching the `creatorRole`.
**Dependencies:** T-008 (defines the correct role semantics first). **Parallel with:** T-007, T-010.
**Out of scope:** the rest of the Better Auth surface (sign-in, sessions, invitations) — leave untouched.
**Acceptance:** an integration test asserts `POST /api/auth/organization/update-member-role` cannot change a
league role; `pnpm test src/auth/ src/onboarding/` passes; the flagship e2e specs still pass.
**Risk/rollback:** medium — touches the auth mount. Revert; re-run e2e.

---
**T-010** · pending · traces to: `UIX-104` · **S**
**Objective:** Stop unparseable request bodies from executing destructive defaults, and close the size-cap bypass.
**Context pointers:** `src/onboarding/http.ts:39-51` (cap inside `if (contentLength)`), `:53-57`
(`catch { return ok({}) }`), `src/app/api/leagues/[leagueId]/curation/checkpoints/[checkpointId]/restore/route.ts:14-16`,
`src/app/api/push/subscriptions/account/route.ts:18-22` → `src/push/subscriptions.ts:226-247`.
**Approach:** A parse failure must return **400**, not `ok({})`. Enforce the byte cap without depending on
`Content-Length` so a chunked body cannot skip it. `readJsonBody` backs ~40 handlers — **read every call
site** before changing the contract; some may legitimately expect an empty body.
**Dependencies:** T-001. **Parallel with:** T-007, T-008, T-009.
**Out of scope:** rate limiting (`UIX-014`); the unvalidated-uuid 500s (`UIX-006`, its own card in M6).
**Acceptance:** malformed JSON to the restore route returns 400 and performs no restore; a body-less DELETE
to `push/subscriptions/account` no longer disables all subscriptions; a chunked oversized body is rejected.
`pnpm test` green.
**Risk/rollback:** medium — shared helper across ~40 routes. Revert the commit; the suite is the guard.

### M2 — Pick 'em *(gated on T-002)*

---
**T-011** · pending · traces to: `UIX-114` · **S**
**Objective:** Archive and remove the bankroll engine cleanly.
**Context pointers:** `src/betting/bankroll.ts` (830 lines), stake/parlay/payout paths in
`placement.ts` (693), rollover in `src/jobs/functions/bankroll-rollover.ts`. DD-1.
**Approach:** `git tag bankroll-engine-v1 <sha>` and push the tag. Write `docs/adr/` entry recording what
was removed, why, and the recovery command (`git show bankroll-engine-v1:<path>`). Then delete.
**Preserve:** `ingestion.ts`, `real.ts`, `betting_event`, `betting_market`, the grading trigger, the arena
shell — these carry into Pick 'em.
**Dependencies:** T-007 (settlement must be correct *before* the surrounding code churns). **Parallel with:** M1 tail, M3.
**Out of scope:** building Pick 'em (T-013). Do not drop `betting_event`/`betting_market` tables.
**Acceptance:** tag exists and is pushed; ADR committed; `pnpm typecheck && pnpm test && pnpm build` green
with the bankroll modules gone; `git show bankroll-engine-v1:src/betting/bankroll.ts` returns the file.
**Risk/rollback:** **high blast radius, fully reversible.** The tag is the undo path — verify it resolves
*before* deleting anything.

---
**T-012** · pending · traces to: `UIX-113`, D1 · **M** · *branch depends on T-002*
**Objective:** Ingest the pick universe T-002 determined is reachable.
**Context pointers:** `src/betting/real.ts:65,76,290`, `src/betting/ingestion.ts`, `src/betting/interfaces.ts`.
**Approach:** Follow T-002's recorded branch. If props are affordable, widen ingestion beyond
`FEATURED_MARKETS` and extend `BettingMarketType`. If not, keep featured markets and record the reduced
universe as an accepted limitation in `PROJECT_CONTEXT.md`.
**Dependencies:** T-002 (**hard gate**), T-011. **Parallel with:** M3.
**Out of scope:** scoring (T-014); UI (T-018).
**Acceptance:** ingestion persists the chosen market set; `pnpm test src/betting/ingestion.test.ts` passes
with cases covering each new market type; quota consumption per sync is recorded in this file.
**Risk/rollback:** medium — external API surface and quota. Revert; ingestion is idempotent by content hash.

---
**T-013** · pending · traces to: `UIX-113` · **L**
**Objective:** Pick storage and submission — schema, weekly allowance, roster snapshot, lock-on-kickoff.
**Context pointers:** context §3.3; `src/db/schema.ts` (hand-authored migration convention, audit §9.3);
`src/betting/placement.ts` for the idempotency pattern to carry forward (`UIX-001` reshaped).
**Approach:** Model the competitor as an **entry with a roster size**, not as "a paid league" — this is what
keeps the prize/AMOE option open without a later refactor (context §7 P1, DD-6). Snapshot roster size at
week start so leagues cannot shrink their denominator mid-week. Picks lock the moment the underlying event
starts. Carry forward per-entry idempotency (one intent → one pick).
**Dependencies:** T-012. **Parallel with:** M3, M5.
**Out of scope:** scoring math (T-014); arena rollup (T-015); UI (T-018); prize eligibility enforcement.
**Acceptance:** migration applies and is journaled; a user cannot exceed the weekly allowance; a pick
submitted after kickoff is rejected; roster snapshot is immutable within a week;
`pnpm test src/betting/ && pnpm test src/db/` green.
**Risk/rollback:** medium-high — new schema. Down-migration written before apply.

---
**T-014** · pending · traces to: `UIX-113` · **M**
**Objective:** Absolute-denominator scoring, participation gate, push voiding.
**Context pointers:** context §3.3, DD-2.
**Approach:** `league_accuracy = correct_picks / (roster_snapshot × MAX_PICKS_PER_USER − pushes)`. An
unsubmitted pick grades as incorrect. `participation_rate = submitted / absolute_potential`;
`is_eligible_for_weekly_prize = participation_rate >= 0.90`. **Keep accuracy computed independently of
eligibility** (DD-6). `MAX_PICKS_PER_USER` is configurable, defaulting to 10. Store accuracy as
`DECIMAL(6,4)`; ties split evenly.
**Dependencies:** T-013. **Parallel with:** M3, M5.
**Out of scope:** paying anyone (no prize in season 1); arena rollup (T-015).
**Acceptance:** table-driven tests covering the context §3.3 worked examples — 80/120 = 66.6% for both a
full and a 90% submitter; a 0-pick user contributes 0 to the numerator and full allowance to the
denominator; 3 pushes reduce that user's denominator to 7. `pnpm test src/betting/` green.
**Risk/rollback:** low — pure computation, heavily testable. Revert.

---
**T-015** · pending · traces to: `UIX-113` · **M**
**Objective:** Re-point arena standings from PnL to accuracy.
**Context pointers:** `src/betting/arena.ts` (1,097 lines — the shell survives),
`rebuildAllArenaStandings`, `src/betting/arena.test.ts`.
**Approach:** Replace the PnL metric with `league_accuracy`; keep seasons, movement, and the recompute
trigger. **Known trap:** `arena.test.ts` is one of the documented load-flake suites — run it in isolation
before blaming a change.
**Dependencies:** T-014. **Parallel with:** M3, M5.
**Out of scope:** the duplicate standings query and sequential waterfall (`UIX-011`, M6).
**Acceptance:** `pnpm test src/betting/arena.test.ts` passes in isolation and in the full suite; standings
rank by accuracy; a tie surfaces as a tie rather than an arbitrary order.
**Risk/rollback:** medium. Revert; standings are derived and rebuildable.

---
**T-016** · pending · traces to: `UIX-106` · **S**
**Objective:** Stop losing settlement notifications and the `bet.settled` fan-out on Inngest retry.
**Context pointers:** `src/jobs/functions/betting-settle-game-final.ts:620-622` (whole body in one
`step.run`), `:538` (`if (result.finalizedSlips > 0)`), `:540-545` (unwrapped throw sites).
**Approach:** Settlement is idempotent, so on retry `finalizedSlips` is 0 and the entire notification block
is skipped — the DB is right and every downstream effect is silently dropped. Split the notification/fan-out
work into its own `step.run` so it retries independently of settlement.
**Dependencies:** T-014. **Parallel with:** M3, M5.
**Out of scope:** the arena rival-passed fan-out breadth (`UIX-107` MINOR, M6).
**Acceptance:** a test forces a post-settlement throw, retries, and asserts notifications still fire exactly
once. `pnpm test src/jobs/` green.
**Risk/rollback:** low. Revert.

---
**T-017** · pending · traces to: `UIX-113` · **M** · ⛔ **APPROVAL**
**Objective:** Rewrite specs 08 and 15 as the Pick 'em design of record.
**Context pointers:** `specs/08-betting.md`, `specs/15-competition-arena.md`,
`docs/archive/GEMINI-3.5-PRO-DISCUSSION.md`, `PROJECT_CONTEXT.md` §3.3/§7.4.
**Approach:** Specs currently describe the deleted bankroll engine. Rewrite to Pick 'em. **Carry the
compliance framing:** user-facing mechanics must never use *wager*, *bankroll*, *bet*, or *odds*.
**Record the validated-legal-claims caveats from context §7.4** — the fabricated "Apostolopoulos doctrine",
the false VPN-indemnification claim, unverified 2026 citations, and the missing NY/FL registration-and-bonding
requirement — so no future reader treats the Gemini transcript as settled law.
**Dependencies:** T-014. **Parallel with:** everything.
**Out of scope:** legal advice. Flag counsel-required items; do not resolve them.
**Acceptance:** specs describe only what is built; no bankroll references remain; caveats recorded.
**Approval flag:** ⛔ these are the design of record — present the rewrite before committing.

---
**T-018** · pending · traces to: `UIX-113`, `UIX-001` · **L**
**Objective:** Pick 'em UI — slate, submission, leaderboard.
**Context pointers:** `src/app/leagues/[leagueId]/bet/league-bet-view.tsx` (the bankroll desk being
replaced), `src/betting/league-bet.ts`. **Route budget:** `/leagues/[leagueId]/bet` sits at 271.5KB against
a 300KB gzip ceiling — check `perf:pwa` before and after.
**Approach:** Replace the stake/bankroll desk. Per-intent idempotency so a retry cannot double-submit a pick
(`UIX-001` reshaped). Fixes several known client defects in passing **because the file is being replaced**:
the frozen `balanceOverrideCents` display and UTC-only timestamps both disappear with the desk.
**Dependencies:** T-014. **Parallel with:** M3, M5.
**Out of scope:** the navigation shell bundle tranche (`UIX-007`, M6) — do not refactor the shell here.
**Acceptance:** `pnpm build && pnpm perf:pwa` exit 0 with the route under budget; a component test asserts a
double submit yields one pick; times render in the viewer's locale.
**Risk/rollback:** medium. Revert.

### M3 — Provider parity *(gated on T-003)*

---
**T-019** · pending · traces to: `UIX-116` · **L** · *sized by T-003 → DD-8*
**Objective:** Build and register the Yahoo decoding dictionary.
**Context pointers:** **DD-8** (read first); `src/providers/sleeper/reference-data.ts:418-474` (the bridge to
extract), `:539-545` (the dictionary shape to mirror); `src/providers/decoding.ts:50-61`;
`src/providers/yahoo/client.ts:804-805` (string positions — D2, DD-8).
**Approach — two steps, in order:**
1. **Extract the string→numeric bridge to a shared module** (`normalizedCode`, `stableCodeId`, `encodeCode`,
   `numericDictionary`, `encodeObservedCode`), and re-point Sleeper at it. **Sleeper's behavior must not
   change** — its existing tests are the guard. Do not copy the bridge into Yahoo (DD-8: that repeats the
   triplicated-RESP-client mistake).
2. Build Yahoo's five dictionaries on the shared bridge and register Yahoo in
   `PROVIDER_DECODING_DICTIONARIES`.
Until this lands, a real Yahoo payload quarantines as `dictionary_missing` **by design** — current behavior,
not a bug to suppress.
**Known trap:** `numericDictionary` throws on hash collision at module load, so a collision surfaces as a
**startup crash, not a test failure**. Import the new module in a test to catch it in CI.
**Dependencies:** T-003 ✅ (shape resolved). **Blocked on:** a real Yahoo league for firm sizing and the
closure test → T-021. Step 1 (the extraction) is **unblocked and can start now**.
**Parallel with:** all of M2.
**Out of scope:** Yahoo OAuth credentials (T-021); ESPN/Sleeper dictionaries — do not "harmonize" them.
**Acceptance:** a vocabulary-closure test for Yahoo mirroring the ESPN/Sleeper pattern passes;
`pnpm test src/providers/` green.
**Risk/rollback:** low — additive. Revert.

---
**T-020** · pending · traces to: `UIX-116` · **S**
**Objective:** Prove Yahoo end-to-end against a real league.
**Dependencies:** T-019, T-021. **Out of scope:** ESPN/Sleeper paths.
**Acceptance:** a real Yahoo league imports without quarantine; the capability map reports coverage;
integrity checks pass.
**Approval flag:** ⛔ needs a real Yahoo league and credentials — request from the maintainer.

---
**T-021** · pending · traces to: `UIX-116` · **S** · ⛔ **APPROVAL**
**Objective:** Wire real Yahoo OAuth credentials.
**Context pointers:** `src/onboarding/deps.ts:115-159` (`env.auth.yahoo.mock` branches). `AGENTS.md`: Yahoo
defaults to fixture-mock unless **both** `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` are set; redirect URI
is `YAHOO_REDIRECT_URI` or `${BETTER_AUTH_URL}/api/onboarding/yahoo/callback`; scope defaults `fspt-r`.
**Out of scope:** committing any secret — `.env.local` only, never the repo.
**Acceptance:** `pnpm secret-scan` exits 0; the connect flow reaches Yahoo's real consent screen.
**Approval flag:** ⛔ credentials are maintainer-supplied.

---
**T-022** · pending · traces to: `UIX-116` / context §7.2 · **S**
**Objective:** Convert Sleeper from fixture-validated to live-validated.
**Approach:** Import a real Sleeper league and read the capability map for per-season coverage gaps. Sleeper
needs no auth (public read-only API, always real — no mock branch).
**Dependencies:** T-001. **Parallel with:** everything.
**Out of scope:** changing the Sleeper adapter unless the import surfaces a defect — file, don't fix inline.
**Acceptance:** a real league imports with integrity checks passing; coverage recorded in this file.
**Risk/rollback:** none — read-only against a live provider.

---
**T-023** · pending · traces to: `UIX-116` · **S**
**Objective:** Same for ESPN, against a league that is **not** the 95050 fixture.
**Approach:** The product is multi-tenant (context §2); ESPN is validated deeply against exactly one league
shape. A second real league is the cheapest test of that generalization.
**Dependencies:** T-001. **Out of scope:** the destructive `scripts/import-real-league.ts` harness — use
the product import path (audit §9.10).
**Acceptance:** a second real ESPN league imports cleanly; any divergence is filed.
**Approval flag:** ⛔ needs a second real ESPN league from the maintainer.

### M4 — Commercial layer

---
**T-024** · pending · traces to: `UIX-117` · **L**
**Objective:** Two-axis entitlements.
**Context pointers:** `src/entitlements/resolver.ts` (336), `admin.ts` (250),
`src/core/env/schema.ts:352-363` (`defaultEntitlementDevOverride` — returns `true` in **production**),
`:474-486` (production block rejects only an *explicit* override, not the silent default). DD-4, context §3.2.
**Approach:** League axis (data → +league AI) and user axis (+personal assistant) resolve **independently**.
A league's AI subscription never implies personal-assistant access.
**Dependencies:** T-006. **Parallel with:** M5.
**Out of scope:** billing (T-026); prices (maintainer sets them from T-004/T-005 data).
**Acceptance:** resolver tests cover all four axis combinations; a league-AI subscriber without a personal
subscription is denied personal-assistant capabilities. `pnpm test src/entitlements/` green.
**Risk/rollback:** medium — gates every feature. Revert restores open-by-default.

---
**T-025** · pending · traces to: `UIX-117` · **S** · ⛔ **APPROVAL**
**Objective:** Close the open-by-default production override.
**Approach:** Restore the production case to `false` per the code's own TODO. **This is the moment features
start being gated** — nothing else in the codebase will remind you.
**Dependencies:** T-024. **Out of scope:** changing what each tier contains.
**Acceptance:** an unentitled league is denied a gated capability in a production-like env; the maintainer's
own testing path still works (context §3.1 — testability without compromise).
**Approval flag:** ⛔ first change that can lock a real user out. Present the gating matrix.

---
**T-026** · pending · traces to: `UIX-118` · **L** · ⛔ **APPROVAL**
**Objective:** Billing — $40/league/year base, league AI and personal assistant monthly/annual.
**Dependencies:** T-024, T-025. **Out of scope:** prize payouts (not in season 1).
**Acceptance:** a league can subscribe, upgrade, and lapse; entitlements follow within one resolution cycle;
no secret is committed.
**Approval flag:** ⛔ real money. Present the flow and the price table before any live key is wired.

---
**T-027** · pending · traces to: `UIX-119` · **M**
**Objective:** Prize-activation readiness review (build-nothing checkpoint).
**Approach:** Confirm the data model supports switching a prize on: entry-with-roster-size, accuracy
independent of eligibility, compliance columns populated. Record what remains (AMOE mechanism, NY/FL
registration and bonding, tax reporting, minimum-roster decision — context §9 P1). **Do not implement.**
**Dependencies:** T-014, T-024. **Out of scope:** all of it — this is a readiness assessment.
**Acceptance:** a written gap list with counsel-required items flagged.

### M5 — AI quality *(independent throughout)*

---
**T-028** · pending · traces to: `UIX-115` · **L** · ⛔ **APPROVAL**
**Objective:** League character digest replacing wholesale lore serialization.
**Context pointers:** `src/ai/pipeline.ts:781-795` (all four buckets serialized, unbounded, no relevance
filter), `:1905-1934` (`leagueLoreBlock`), `src/ai/editorial-recall.ts:205` (the bounded-retrieval pattern
to borrow from). DD-3, context §7.5.
**Approach:** Regenerate a per-league digest on lore change; pass it instead of raw claims. **Refuted and
disputed claims are included as character — do not filter them out** (maintainer explicitly rejected that).
A specific claim may still be pulled in directly when a piece is genuinely about it.
**Dependencies:** T-001. **Parallel with:** everything.
**Out of scope:** the lore thread model (already built and correct — context §7.5); vote/quorum mechanics.
**Acceptance:** generations receive the digest, not raw claim strings; digest regenerates on lore change;
`pnpm eval:ai:offline` 8/8; an eval case asserts no verbatim claim text appears in output.
**Approval flag:** ⛔ maintainer reviews a **sample digest** before go-live (Q36).
**Risk/rollback:** medium — changes AI context. Revert restores current behavior.

---
**T-029** · pending · traces to: `UIX-110` · **S**
**Objective:** Make the lore and news fences non-escapable.
**Context pointers:** `src/ai/pipeline.ts:1933` (`JSON.stringify` does not escape `<`, `>`, `/`),
`:1894` (`untrustedNewsBlock` — same weakness), `src/lore/engine.ts:136-143` (`data_verifiable` canonizes on
submission with no vote → member-reachable), `src/db/schema.ts:4265` (`statement` unconstrained `text`).
**Approach:** Escape `<` before wrapping, or use a per-request nonce tag. Fix **both** builders.
**Dependencies:** none (T-028 reduces exposure but does not fix the primitive). **Parallel with:** everything.
**Out of scope:** changing `data_verifiable` canonization semantics — that is spec'd behavior (`specs/13:61`).
**Acceptance:** a claim containing a literal closing fence tag cannot break out; a test asserts it.
`pnpm test src/ai/ && pnpm eval:ai:offline` green.
**Risk/rollback:** low. Revert.

---
**T-030** · pending · traces to: `UIX-110` · **S**
**Objective:** Fence the judge path, which REC-001 missed.
**Context pointers:** `src/ai/real.ts:583-586` (canon lore title/statement passed **verbatim** into
`judgeUserTask`), `:604-613` (`judgeSystemInstructions` — static, no instruction-hierarchy guardrail),
`src/ai/pipeline.ts:1851-1878` (the judge gates publication).
**Approach:** REC-001 fenced the writer path only. Fence or drop lore free text from the judge's tokens and
add the guardrail to its system instructions.
**Dependencies:** T-029. **Out of scope:** judge rubric or thresholds.
**Acceptance:** a test asserts injected text in the judge's input does not alter its verdict;
`pnpm eval:ai:offline` 8/8.
**Risk/rollback:** low. Revert.

---
**T-031** · pending · traces to: `UIX-110` · **S**
**Objective:** Move the lore-block preamble onto the live code path.
**Context pointers:** `src/ai/real.ts:485` (updated — but `userTask()` at `:478-480` returns
`request.prompt.userTask` first, so this branch is dead), `src/ai/prompt-templates.ts:233` (the string the
model actually receives — mentions only `<untrusted_news>`), `:149`.
**Dependencies:** T-029. **Acceptance:** the rendered user task names the lore block;
`pnpm test src/ai/prompt-templates.test.ts` passes. **Risk:** trivial.

### M6 — Remaining backlog

---
**T-032** · pending · traces to: `UIX-007` + `UIX-003` · **M**
**Objective:** Shell tranche — restore SPA navigation, buy back route-budget headroom.
**Context pointers:** `navigation-shell.tsx:507` (`window.location.assign`), `:1403,1562,1165,502,909`
(interaction-gated surfaces statically bundled), `:242,270` (switcher refetch per pathname),
`use-active-navigation-state.ts` (unmemoized). Backlog §4.
**Approach:** `router.push` in the palette; `dynamic()`-split the five surfaces; memoize active state; key the
switcher fetch to session, not pathname. **Do not attempt the full 3,162-line file split.**
**Dependencies:** T-018 (avoid conflicting shell/route work). **Acceptance:** `pnpm perf:pwa` shows both
heavy routes measurably down; palette navigation preserves client routing.

---
**T-033** · pending · traces to: `UIX-005`/`006`/`011` · **M**
**Objective:** Read-path tranche — bound `/news`, short-circuit `/`, dedupe `/arena`, cache public surfaces.
**Context pointers:** `src/news/hub.ts:190-193` (`scanAllCandidates:true`), `src/app/page.tsx:19-23`
(fetch-then-discard), `src/betting/arena.ts:1069` vs `:1072` (duplicate query),
`src/news/league-feed.ts:340` (the correct in-repo pattern to copy).
**Out of scope:** caching any league-scoped route — `private, no-store` is load-bearing isolation.
**Acceptance:** query-count assertions; a seeded 1,000-item corpus serves `/news` at flat query cost.

---
**T-034** · pending · traces to: `UIX-004`/`012`/`013` · **M**
**Objective:** Destructive-action confirmations, editorial feedback, reachability.
**Approach:** Confirm dialogs on commissioner handoff, checkpoint restore, era dismiss, webhook delete
(note `:530`, not `:225`, is the real premature-clear — backlog §7.3). `router.refresh()` instead of
`window.location.reload()`. Link the tone editor; role-gate the lore steward button; wire the
notification-preference matrix to its existing API.
**Acceptance:** each destructive action confirms; component tests assert no mutation on dismiss.

---
**T-035** · pending · traces to: `UIX-002` + client-state batch · **M**
**Objective:** Stale-prop and error-surfacing batch.
**Approach:** Data Book restore reconciliation; tone-editor rollback (a rollback silently reverted by the
next Save — highest severity in the batch); lore vote tallies frozen at load; steward edits reporting
success as failure; reaction double-click race; onboarding refresh re-checking deselected leagues; realtime
401 permanently killing reconnect; clipboard asserting success when unavailable.
**Acceptance:** each has a regression test.

---
**T-036** · pending · traces to: `UIX-014`/`015`/`016`/`017`/`006` · **M**
**Objective:** Hardening batch — rate limits, error boundaries, mobile e2e, uuid validation, nits.
**Approach:** Extend `enforceApiRateLimit` beyond its 2 callers; per-segment `error.tsx` + `global-error.tsx`;
mobile Playwright project with 44px tap assertions (catches `reaction-strip.tsx:131`'s 40px); hard-fail the
budget script above 300KB (`check-mobile-pwa-budget.mjs:43` currently validates only `>= 1`); uuid-validate
the 8 routes returning 500s on malformed ids; the §9.5.6 nit batch.
**Acceptance:** CI fails on a planted 40px target and on a budget bump to 900KB.

---

## 5. Validation strategy

### 5.1 Baseline — **observed** at `e28265d`, 2026-07-28T02:56–03:01+02:00 (T-001)

Executed this session; output observed, not inferred.

| Gate | Command | Observed |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Secret scan | `pnpm secret-scan` | passed, **1,236** tracked files checked |
| AI eval (offline) | `pnpm eval:ai:offline` | **8 passed / 8** (1 file) |
| Tests | `pnpm test` | **1,412 passed · 0 failed · 5 skipped** (279 files passed, 1 skipped; 113.65s) |
| Build | `pnpm build` | exit 0 |
| PWA budget | `pnpm perf:pwa` | exit 0 — all 25 routes within the 300KB gzip ceiling |
| CI | GitHub Actions @ `e28265d` | ✅ success |

**Route-size before-metrics** (the two with the least headroom, for T-018 and T-032 to beat):

| Route | Baseline | Headroom vs 300KB |
|---|---|---|
| `/leagues/[leagueId]/press/[postId]` | **296.1KB** | 3.9KB |
| `/leagues/[leagueId]` | **295.0KB** | 5.0KB |
| `/leagues/[leagueId]/bet` | **271.5KB** | 28.5KB (T-018 replaces this route) |
| `/news`, `/news/[section]`, `/leagues/[leagueId]/press` | 288.8KB | 11.2KB |
| Shell floor (lightest route, `/leagues/[leagueId]/feed`) | **222.2KB** | — |

The 5 skips are the documented `LIVE_SMOKE=1` paid-provider smokes.

### 5.2 Per-task
Every card's validation commands must pass **and** the full suite must stay green — no task may leave the
trunk broken (always-green discipline). Use `PATH=/usr/bin:$PATH` for all pnpm commands.

### 5.3 Plan-level success
Settlement fires on the production payload · `league_admin` cannot exceed intent and cannot assign roles ·
Pick 'em is playable with scoring matching context §3.3's worked examples · all three providers import a
real league · tiers enforced and billed · lore is ambient and unquotable · every fence non-escapable ·
`perf:pwa` within budget.

---

## 6. Executor protocol

You are a fresh session. You need this file and the repo — nothing else.

1. **Read your card.** Then read `PROJECT_CONTEXT.md` §4 (non-goals) and §5 (working agreements). The
   non-goals list exists because these mistakes have been made before.
2. **Confirm a green baseline** before touching anything:
   `PATH=/usr/bin:$PATH pnpm typecheck && pnpm lint && pnpm test`. If it is already red, **stop and report**
   — do not build on a broken trunk.
3. **Check the approval flag.** If set, present what the card names to the maintainer and **block**. Do not
   proceed on inference.
4. **Implement within the fence.** The card's *Out of scope* is binding. Adjacent improvements you notice
   go in the ledger as new cards — opportunistic "while I'm in here" changes are the leading cause of
   unreviewable diffs.
5. **Validate.** Run the card's commands plus the full suite. Run `ubs <changed-files>` (exit 0 required).
   In zsh, build the file list as an **array** — a space-joined string is treated as one filename.
6. **Update §8's ledger** — state, date, one-line note. This is part of done, not bookkeeping.
7. **Commit** per repo convention. Push after green gates; `main` and `origin/main` must not diverge.
   **Re-fetch immediately before any push decision** — a stale ref caused a rejected push during planning.
8. **On divergence — reality wins.** If the repo contradicts your card: **stop.** Record it in the ledger.
   Amend if small; escalate for re-planning if large. Never silently push through, never silently deviate.
   A discovery that invalidates a `UIX-###` classification propagates back to the backlog.

**Environment traps** (from `AGENTS.md`, all Verified): `node` on PATH is a bun shim — prefix pnpm with
`PATH=/usr/bin:$PATH`. `rm -rf` is blocked by a command guard — `mv` to `/tmp`. Never run `pnpm db:generate`
— migrations ≥0035 are hand-authored and manually journaled; generating would diff against a 40-migration-stale
snapshot and emit garbage. DB tests use `migrateSerialized()`, never `migrate()`. Do not `Promise.all`
queries on one Drizzle transaction. `arena.test.ts` and `bankroll-rollover.test.ts` are documented
load-flake suites — re-run in isolation before blaming your change.

---

## 7. Risk register

| # | Risk | Blast radius | Mitigation | Rollback |
|---|---|---|---|---|
| R1 | Player props are quota-prohibitive, shrinking the pick universe *and* weakening the syndicate defense | Pick 'em design | `T-002` spikes it **before** T-012/T-013 | Featured-markets fallback recorded as an accepted limitation |
| R2 | Yahoo's code space is far larger than Sleeper's, or uses string keys the dictionary interface can't hold | M3 scope; possibly `decoding.ts` for all providers | `T-003` spikes it before T-019 | Ship ESPN + Sleeper; Yahoo follows |
| R3 | Deleting the bankroll engine breaks something unforeseen | `src/betting`, jobs, UI | Tag first, verify the tag resolves, delete second | `git show bankroll-engine-v1:<path>` |
| R4 | Closing the entitlement override locks the maintainer out of their own testing | All gated features | Verify the maintainer's path in T-025 before merge | Revert restores open-by-default |
| R5 | Auth changes (T-008/T-009) silently over- or under-permit | Every league-scoped mutation | Tests assert both allow **and** deny; e2e re-run | Revert; auth suite is the guard |
| R6 | A migration lands unjournaled and never applies | Silent data divergence | `_journal.json` entry is in the card's acceptance | Down-migration written before apply |
| R7 | Pick 'em UI pushes `/leagues/[leagueId]/bet` over the 300KB budget | CI gate | `perf:pwa` before and after in T-018 | Revert; shell tranche T-032 buys headroom |
| R8 | Legal claims from the Gemini transcript are treated as settled law | Compliance | Caveats recorded in T-017 and context §7.4 | N/A — documentation control |

---

## 8. Ledger

| Task | State | Traces to | Size | Updated | Note |
|---|---|---|---|---|---|
| T-001 | **done** | infra | S | 2026-07-28 | Artifacts committed; baseline observed & recorded in §5.1 (1,412/0/5, all gates green) |
| T-002 | **done** | D1/UIX-113 | S | 2026-07-28 | Path A: props affordable (~$30/mo, fixed cost, not per-league). Schema already has `player_prop`. See DD-7 + Discoveries #1/#2. No live key used. |
| T-003 | **done** | UIX-116 | S | 2026-07-28 | Yahoo is string-keyed; **R2 retired** — Sleeper's bridge already solves it, no interface change. New predecessor: extract the bridge (T-019 step 1, unblocked). Firm sizing needs a real league. See DD-8. |
| T-019a | pending | UIX-116 | M | — | *(split from T-019 by DD-8)* Extract the string→numeric bridge to a shared module; re-point Sleeper. **Unblocked.** |
| T-004 | **done** | UIX-109 | S | 2026-07-28 | Opus 15/75 → 5/25 (+ derived cache rows). Test rewritten to an independent literal; falsified — reverting yields 4680 vs 1560, confirming the 3× overstatement numerically. Suite 1,412/0/5. Discovery #3 filed. |
| T-005 | **split** | UIX-111 | — | 2026-07-28 | Material divergence: `league_id` is notNull and `embed()` returns no usage. Split → T-005a/T-005b; see amendment + DD-9. |
| T-005a | pending | UIX-111 | M | — | Central usage → own central table per DD-9. Unblocked (T-006 done). |
| T-005b | pending | UIX-111 | M | — | Embedding usage; needs `EmbeddingProvider` contract change. |
| T-006 | **done** | UIX-119 | M | 2026-07-28 | Migration 0079 (geo_state, phone_verified) journaled + applied; 6 overflow-prone sum casts widened. Overflow test falsified (`integer out of range`). Suite 1,413/0/5. Scope corrected by DD-9/DD-10. |
| T-007 | **resequenced → T-013a** | UIX-101 | — | 2026-07-28 | Structural: no fantasy-matchup↔betting-event correspondence exists; the real gap is a missing results **producer**, whose fan-out depends on a table T-011 deletes. See DD-11. |
| T-013a | pending | UIX-101 | M | — | Betting-event results producer, built once against Pick 'em. **CRITICAL** — carries UIX-101. |
| T-008 | **done** | UIX-102 | S | 2026-07-28 | ACL now grants league_admin `leagueData:manage`, matching ROLE_RANK per the owner's ruling. New monotonicity invariant test pins the two authority models together; falsified. Suite 1,416/0/5. Role *collapse* split out → T-008a. |
| T-008a | pending | UIX-102 / ctx Q16 | M | — | Collapse `league_admin` into commissioner in the `league_role` enum (migration + guards + invites + UI). Wider blast radius than the ACL fix. |
| T-009 | pending | UIX-103 | M | — | |
| T-010 | **done** | UIX-104 | S | 2026-07-28 | Unparseable body now 400s instead of becoming a successful `{}`; absent body still `{}`. Cap enforced on bytes read via a bounded stream, closing the chunked bypass. 6 contract tests. Suite 1,422/0/5. |
| T-011 | pending | UIX-114 | S | — | High blast radius |
| T-012 | pending | UIX-113 | M | — | Gated on T-002 |
| T-013 | pending | UIX-113 | L | — | |
| T-014 | pending | UIX-113 | M | — | |
| T-015 | pending | UIX-113 | M | — | |
| T-016 | pending | UIX-106 | S | — | |
| T-017 | pending | UIX-113 | M | — | ⛔ approval |
| T-018 | pending | UIX-113/001 | L | — | |
| T-019 | pending | UIX-116 | L | — | Gated on T-003 |
| T-020 | pending | UIX-116 | S | — | ⛔ approval |
| T-021 | pending | UIX-116 | S | — | ⛔ approval |
| T-022 | pending | context §7.2 | S | — | |
| T-023 | pending | UIX-116 | S | — | ⛔ approval |
| T-024 | pending | UIX-117 | L | — | |
| T-025 | pending | UIX-117 | S | — | ⛔ approval |
| T-026 | pending | UIX-118 | L | — | ⛔ approval — real money |
| T-027 | pending | UIX-119 | M | — | Assessment only |
| T-028 | pending | UIX-115 | L | — | ⛔ approval — sample |
| T-029 | pending | UIX-110 | S | — | |
| T-030 | pending | UIX-110 | S | — | |
| T-031 | pending | UIX-110 | S | — | |
| T-032 | pending | UIX-007/003 | M | — | |
| T-033 | pending | UIX-005/006/011 | M | — | |
| T-034 | pending | UIX-004/012/013 | M | — | |
| T-035 | pending | UIX-002 + batch | M | — | |
| T-036 | pending | UIX-014…017 | M | — | |

---

## 9. Discoveries

Out-of-fence findings surfaced during execution. Raw material for the next improvement pass — **not** to be
fixed inline. Each entry: what was found, where, and where it should go.

| # | Discovery | Location | Found during | Disposition |
|---|---|---|---|---|
| **1** | **The odds spend guard counts the wrong unit.** Its cap is `250 **requests**/24h` (`SPEND_GUARD_ODDS_REQUESTS`), but The Odds API bills **credits**, and a per-event props request costs `markets × regions` credits — not 1. At 15 prop markets, 250 requests burns **3,750 credits** while the guard reads "250, fine." The guard under-protects by the market multiplier, and the gap only opens once props ingestion lands (T-012). Featured-markets calls are unaffected (1 request ⇒ 3 credits, near enough). | `src/core/env/schema.ts:163,297-301`; formula per T-002 | T-002 | **Backlog propagation** — file as a new `UIX-###`. Fix is to charge the guard `markets × regions` per call rather than 1. Must land with or before T-012. |
| **3** | **New load-dependent flake (recurred during T-008): `league-columns.fixture.test.ts:625`.** Failed once in a full-suite run (`expected 'a4b6…' to be '5e20…'`), then passed in isolation, in the `src/ai/` subset, and on a full-suite re-run. **Exonerated from T-004 by construction:** the assertion is which content item leads the publication front, and `buildPublicationFront` (`src/news/front.ts:53-56`) ranks solely on `editorialImportance` and `publishedAt` — `grep` confirms **zero** cost references, so a price constant cannot move it. Mechanism: the score is `Date.parse(publishedAt) / HOUR_MS + importance * BOOST`, so two pieces published within the same hour-fraction score near-identically and load-induced timestamp drift can flip the order. **This suite is not in the documented arena/bankroll flake list** — it is a new member of that class. | `src/ai/league-columns.fixture.test.ts:625`; `src/news/front.ts:53-56` | T-004 | **Backlog propagation** — file as a new `UIX-###`. Fix is a deterministic tiebreak in the fixture (pin `publishedAt` values) rather than widening a timeout. Related to `UIX-016`/REC-003's per-worker-DB follow-up. |
| **2** | **`bettingMarketPeriod` has exactly one value, `full_game`** (`src/db/schema.ts:397-399`). Player props are frequently period-scoped (1H, Q1) and alternate lines are common. If the pick universe later wants period markets, this enum needs widening plus a migration. Not blocking — T-012 ingests full-game props only. | `src/db/schema.ts:397-399` | T-002 | **Discoveries** — revisit if period markets are wanted. No action now. |

---

*Planned by Claude (Fable 5) via Claude Code, 2026-07-28, pinned to `e28265d`. Every task traces to a `UIX-###`
with an adopt verdict or is justified as enabling infrastructure. Both open assumptions (D1, D2) have spikes
scheduled before anything depends on them.*
