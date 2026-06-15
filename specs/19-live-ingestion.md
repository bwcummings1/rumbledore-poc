# Spec 19 — Live Ingestion (the "keep the data flowing" engine)

> Outcomes spec. WHAT an always-on, adaptive-cadence ingestion engine produces — not the line-by-line HOW.
> Read `docs/NORTH-STAR.md` first. Builds on `specs/14-data-foundation-depth.md` (the bedrock substrate) and
> `specs/03-ingestion-providers.md` (provider seam). Lives in `src/jobs/`, `src/ingestion/`, `src/providers/`.
> Canonical context: `docs/PROGRESS.md` §3 (validated ESPN facts) + §7 known bugs.

## Why this spec exists (the soul)
The North Star's first experience principle is **Alive** — "it has a pulse: things happen, the cast reacts, the
standings and arguments move." A spectacle the members are characters in is only a spectacle **if it reacts to what
JUST happened.** When the Trash-Talker antagonizes about a collapse, the Narrator mythologizes a comeback, or the
Commissioner adjudicates a close finish, every one of those beats reads as a lie unless the underlying scores,
transactions, and standings are **current**. A recap that lands Tuesday about Sunday's games — built off a stale
read — is generic fantasy content with a team name pasted in, exactly the failure mode the wedge exists to avoid.

Today the substrate has a deep **engine** (one-time historical import + on-demand current-league sync) but no
**heartbeat**: nothing keeps a connected league current after the connect, nothing tightens during a live NFL
window, nothing carries the connection into next season. This spec is that heartbeat. After the one-time connect,
every connected league across every provider stays current **automatically** — tight during games, relaxed
off-hours, never re-onboarded — so the cast always reacts to fresh truth. The data's freshness is what makes the
show feel alive; this engine is what makes the data fresh.

---

## What EXISTS today (engine) vs what is NEW here (heartbeat)

**EXISTS (reuse, do not rebuild):**
- `syncCurrentLeague()` (`src/ingestion/current-league.ts`) — idempotent incremental sync of one league-season:
  league/teams/members/matchups/rosters via stable-identity upserts + content hashing; publishes realtime
  `scores.updated`; triggers `recomputeChangedMatchupStatistics` for only changed matchups.
- `importLeagueHistory()` (`src/ingestion/historical-import.ts`) — resumable, checkpointed deep-history import.
- `import.requested` Inngest function (`src/jobs/functions/import-requested.ts`) — loads stored credentials,
  authenticates the provider, runs the import, and on `PROVIDER_AUTH_EXPIRED` marks the credential `invalid`
  (`markCredentialInvalid`) and stops retrying via `NonRetriableError`.
- Provider seam (`src/providers/model.ts`): typed `FantasyProvider` with `capabilities`, typed `ProviderError`s
  (`AuthExpiredError`, `ProviderBlockedError`, `RateLimitedError`, …), per-provider `authKind`
  (`cookie`/`oauth2`/`none`). ESPN session reuse via stored cookies; Yahoo `authenticate()` already returns
  `AuthExpiredError` on an expired/absent access token and carries a `refreshToken`; Sleeper `authKind: "none"`.
- `providerCredentials` table (`status` `connected|invalid|…`, `encryptedPayload`, `subjectProviderId`,
  `refreshToken`, `refreshTokenExpiresAt`, `invalidAt`), and the reconnect CTA map (`src/onboarding/reconnect.ts`).
- Existing cron pattern (`cron("TZ=UTC */15 * * * *")` in `odds-poll.ts`, dated crons in `content-plan-cron.ts`).

**NEW / CHANGES (this spec):**
1. A **scheduler** (cron + event fan-out Inngest functions) that drives `syncCurrentLeague` for *all* connected
   leagues on an ongoing basis — not just on-demand.
2. **Adaptive cadence**: a pluggable poll policy that picks how often each data class syncs based on NFL
   calendar / matchup-period game-state (live window vs off-hours).
3. **Season rollover**: same auth automatically begins ingesting the next season when it opens.
4. **Multi-league fan-out**: one scheduler tick fans out to every connected league across all providers, isolated.
5. **Durable auth reuse + reconnect-on-expiry** wired into the scheduler (ESPN reuse + CTA, Yahoo silent refresh,
   Sleeper no-auth).
6. A **finalized-state-never-downgrades** invariant hardened (the known `current-league.ts` partial guard, §E).

---

## A. Scheduled ingestion — the heartbeat (NEW)
Connected leagues sync continuously after connect, with **no human action** and **no re-onboarding**.

- **A "connected league" is the unit of work.** A league is in scope for live ingestion when it has at least one
  `providerCredentials` row with `status='connected'` authorizing it (Sleeper: a connected no-auth credential row /
  league registration; it never expires). Leagues whose only credential is `invalid` are **paused** (not silently
  dropped) and surface a reconnect CTA (§D), and resume automatically once reconnected.
- **A tick-and-fan-out shape (two functions).**
  - `ingestion.tick` — a **cron-triggered** orchestrator (NEW Inngest function). On each tick it resolves the set
    of connected leagues due for a sync (see cadence §B), and **fans out** one `league.ingest` event per due
    `(leagueId, provider, providerLeagueId, season)`. The tick itself does no provider I/O — it is cheap, fast, and
    purely a scheduler. It runs at the **tightest cadence the policy can demand** (e.g. every minute) and the
    policy decides which leagues are actually due, so the cron interval is a ceiling, not the real frequency.
  - `league.ingest` — an **event-triggered** worker (NEW Inngest function) that runs `syncCurrentLeague` for one
    league-season using its stored credentials, exactly as `import.requested` does for history (same credential
    load → authenticate → provider error handling). One league's failure never blocks another's (§C).
- **Event-driven still works.** `league.connected` (existing event) and a manual "resync now" both enqueue a
  `league.ingest` immediately; the scheduler is additive, not a replacement. After connect, a league is synced
  once promptly and then falls onto its adaptive cadence.
- **Concurrency & politeness.** `league.ingest` is concurrency-limited per provider (Inngest `concurrency` key on
  `event.data.provider`) so a tight live-window fan-out across many leagues does not hammer one provider; bounded
  backoff + jitter on retryable provider errors (reuse `specs/14` §A retry classes).
- **Observability.** Every `league.ingest` records a job run (`recordJobRun`) and updates per-data-class freshness
  (`data_coverage.observed_at`, reuse `recordDataCoverage`); the overall league `freshness` (`fresh|stale|error`)
  and `next_due_at` are queryable so the home page can show a live pulse and the steward can see lag.

## B. Adaptive cadence — policy as data, NOT hardcoded constants (NEW)
Cadence is driven by **what the data is** and **what the game-state is**, and it is **configurable/pluggable**.

- **Cadence varies by data class × game-state.** Indicative defaults (the policy's *default config*, tunable):
  | Data class | Live NFL game window | In-season, off-hours | Off-season / no games |
  |---|---|---|---|
  | matchups / scores | every **30–60s** | hourly | daily (or paused) |
  | rosters / lineups | a few minutes (pre-kickoff lock) | hourly | rarely |
  | transactions (add/drop/waiver/trade) | ~15 min | hourly | daily |
  | standings / league settings | hourly | daily | weekly |
  | members / divisions / scoring detail | daily | daily | weekly |
  | deep history (`importLeagueHistory`) | never (separate flow) | rarely (gap backfill only) | rarely |
- **Game-state comes from the NFL calendar / matchup-period state, not wall-clock guessing.** A
  `GameStateProvider` (NEW, injectable) answers, for a given `now`: is the league in a **live game window**
  (a scoring period's NFL games are in progress), **in-season off-hours**, **pre/post the season**, or
  **off-season**. It derives windows from the league's `currentScoringPeriod` + the NFL week schedule
  (Thu/Sun/Mon game windows) and the league's `league_season_settings` (regular-season end / playoff weeks). It
  MUST be backed by a **controllable clock** for tests (no real wall-clock dependency in the policy).
- **The policy is a pure, injectable function — the key design seam.** Define a `PollPolicy` interface:
  `due(input: { dataClass, gameState, lastSyncedAt, now, leagueConfig }) -> { due: boolean; nextDueAt: Date }`.
  The **default policy is constructed from a config object** (the table above expressed as data — intervals per
  `dataClass × gameState`), NOT inline constants scattered through the scheduler. The config is the seam:
  - Resolution order (later overrides earlier): built-in default config → env/global override → optional
    per-league override (a future `league_ingestion_policy` row) → explicit call-site override (tests).
  - The scheduler/`ingestion.tick` consumes only the `PollPolicy` interface; swapping the policy implementation or
    editing the config changes cadence with **zero changes** to the scheduler, worker, or `syncCurrentLeague`.
  - This is deliberately the seam where a later cost-optimization pass slots in (see "Future research") without
    rearchitecting. **Do not build cost optimization now** — just make the policy pluggable and the config data.
- **Per-data-class freshness drives "due".** Each `(league, dataClass)` tracks `lastSyncedAt`; the policy computes
  `due` = `now - lastSyncedAt >= interval(dataClass, gameState)`. The tick fans out only the data classes that are
  due (a live-window tick may sync scores while leaving settings alone), keeping polling proportional to need.

## C. Idempotent incremental updates — never downgrade finalized state (EXISTS + HARDEN)
The engine already converges; this spec preserves and tightens those guarantees under continuous polling.

- **Reuse the existing convergence machinery.** Content-hash upserts (`stableContentHash`) write only changed
  rows; a re-poll of unchanged data is a **zero-net-write no-op**. `recomputeChangedMatchupStatistics` recomputes
  only the matchups that actually changed (the `specs/14` §C targeted-recompute contract is unchanged here).
- **Finalized state is monotonic — never downgrades (known-bug constraint to respect/fix).**
  `current-league.ts` already guards matchups with
  `and not (status = 'final' and excluded.status <> 'final')` — a transient provider re-read that reports a
  finalized matchup as `in_progress`/`scheduled` must NOT flip it back. Under live polling this guard is now
  **load-bearing** (a final game polled again 30s later that momentarily reads non-final is common), so:
  - This invariant is treated as a **foundation rule**, tested directly here (acceptance 4), not an incidental.
  - Extend the same monotonicity reasoning to other finalized facts: provider `final_standings` / playoff seeds
    and a season's `status='complete'` must not be overwritten by a transient incomplete read. A genuine provider
    **correction** (a real score revision while still emitting `final`) is allowed — corrections upsert, bump
    `updated_at`, and re-emit `game.final`/changed-matchup so dependents recompute; only **downgrades** (final →
    non-final) are rejected.
  - The rejection is silent at the row level but **observable**: a rejected downgrade increments a counter /
    integrity note (`specs/14` §E `data_integrity_check`) rather than vanishing, so we can detect a provider
    repeatedly flapping a finalized week.
- **Idempotent fan-out.** `league.ingest` carries an idempotency key
  (`leagueId:provider:providerLeagueId:season:dataClassBucket:windowBucket`) so a double-fired tick (or an
  Inngest retry) collapses to one sync per window — duplicate ticks neither dup-write nor double-recompute.

## D. Durable auth reuse + reconnect-on-expiry (EXISTS, wire into the scheduler)
Ongoing capture must require **no re-onboarding**. Auth is reused silently; expiry surfaces a CTA, never a crash.

- **ESPN (`authKind: cookie`).** Reuse stored encrypted cookies (`espn_s2`/`swid`) on every `league.ingest`, same
  as `import.requested`. On `PROVIDER_AUTH_EXPIRED`: mark the credential `invalid` (`markCredentialInvalid`), stop
  retrying (`NonRetriableError`), **pause** the league's live ingestion, and surface the one-tap reconnect CTA
  (`reconnectActionForProvider('espn')` → `/onboarding/espn`). A reconnect re-validates and flips `status` back to
  `connected` (`invalidAt: null`), and the next tick resumes the league automatically. No history re-import, no
  re-discovery.
- **Yahoo (`authKind: oauth2`) — silent refresh.** Yahoo access tokens expire on the order of an hour, far shorter
  than a season. Before/within `league.ingest`, if the stored access token is expired or near-expiry
  (`tokenExpired(expiresAt)` already exists), perform a **silent refresh-token renewal** (OAuth refresh grant),
  persist the rotated `accessToken`/`refreshToken`/`expiresAt` back to the encrypted credential, and proceed —
  **no user interaction**. Only when the *refresh token itself* is rejected (revoked/expired →
  `PROVIDER_AUTH_EXPIRED`) do we mark `invalid` and raise the Yahoo reconnect CTA (`/onboarding/yahoo`). Refresh is
  fixture-backed/mock when `YAHOO_CLIENT_ID`/`YAHOO_CLIENT_SECRET` are unset (per `AGENTS.md`).
- **Sleeper (`authKind: none`).** No auth, never expires; `league.ingest` runs without credentials and can never
  raise a reconnect CTA. A Sleeper league stays in live ingestion indefinitely.
- **Reconnect does not lose continuity.** While a credential is `invalid`, the league is **paused, not deleted**;
  its history, freshness state, and cadence config persist. Reconnecting resumes from where it left off (next
  due sync), and a paused league is still listed (with its CTA) so the user always knows what to do — one tap.
- **Only `PROVIDER_AUTH_EXPIRED` forces reconnect** (per `AGENTS.md`). `PROVIDER_BLOCKED`/`PROVIDER_RATE_LIMITED`/
  5xx are transient: retry with backoff, leave the credential `connected`, mark the data class `stale`/`error` in
  coverage — never a false reconnect CTA.

## E. Multi-league fan-out & season rollover (NEW)
- **One user, many leagues, many providers.** A single `ingestion.tick` resolves *all* connected leagues across
  ESPN/Sleeper/Yahoo and fans out independent `league.ingest` events. Each worker is **league-scoped** — every
  write goes through `withLeagueContext()` and RLS (`league_id` filter), so league A's sync never reads or writes
  league B (the `specs/02` isolation canary extends to live ingestion). Per-provider concurrency keeps a big
  fan-out polite. A user with ESPN + Sleeper + Yahoo leagues sees all of them kept current with no extra action.
- **Season rollover — same auth carries forward automatically (NEW).** When a new season opens, the *same stored
  credential* should begin ingesting the new season **without re-onboarding**:
  - On a cadence (e.g. the off-season → preseason transition the `GameStateProvider` detects, plus a low-frequency
    rollover check), re-run provider league **discovery** for each connected credential. If the provider exposes
    the same league under a new season (ESPN: same `providerLeagueId`, new `season`; Yahoo: a new season's
    `league_key` linked from the prior via `historicalLeagueKeysByLeagueKey`; Sleeper: the league's next-season id
    where exposed), **register the new season-league** and start `league.ingest` for it on the preseason cadence.
  - The new season-league inherits the credential and cadence config; the prior season-league transitions to a
    relaxed/complete cadence (it still records late corrections but mostly goes quiet). No user action, no
    re-import of the new season from scratch — current sync simply begins recording it as it happens.
  - Rollover is idempotent: re-running discovery for an already-registered new season is a no-op (stable-identity
    upsert on `(provider, providerLeagueId, season)`), and a provider that hasn't yet opened the new season
    (discovery returns nothing new) is a no-op that retries next cycle.

## F. Data model touchpoints (minimal; reuse first)
- **Reuse:** `leagues`, `fantasy*` tables, `data_coverage` (per-data-class `observed_at` = freshness),
  `providerCredentials` (auth/status/refresh fields), `historicalImportCheckpoints`.
- **NEW (small):** per-`(league, dataClass)` freshness/scheduling state — `lastSyncedAt` and computed `nextDueAt`
  (may extend `data_coverage` rather than a new table). Optional future `league_ingestion_policy` row for
  per-league cadence overrides (the §B seam — not required for v1; the policy reads built-in/env config until it
  exists). Any NEW league-scoped table declares the standard `pgPolicy` + `FORCE ROW LEVEL SECURITY` per
  `AGENTS.md`.

## Jobs / Inngest conventions (per `AGENTS.md`)
- New functions follow the existing factory shape (`create…Function(resolveDeps)`), wrap work in
  `recordJobRun`/`step.run`, resolve deps lazily (no `getEnv()`/`getDb()` at module scope), and read Inngest config
  via `getEnv().jobs.inngest`. `ingestion.tick` uses `cron(...)`; `league.ingest` is event-triggered with a
  `concurrency` key on `provider` and the idempotency key from §C. Cron interval is a config-driven ceiling.
- New event names registered in `src/jobs/events.ts`: `ingestion.tick` (or cron-only), `league.ingest`,
  `season.rollover.check` — with typed payloads (`leagueId`, `provider`, `providerLeagueId`, `season`,
  `credentialId`, `dataClasses[]`).

---

## Acceptance criteria (testable — mock providers + controllable clock/game-state)
All tests run **offline** against recorded fixtures and a **controllable clock + injectable `GameStateProvider`**;
no live calls, no real wall-clock dependence in cadence logic.

1. **Scheduled, not just on-demand.** With one connected mock league and a fixed clock, advancing the clock past a
   data class's interval makes `ingestion.tick` fan out a `league.ingest` for that class; before the interval, it
   does not. No manual import event is required for the league to stay current.
2. **Live-window vs off-hours cadence.** With the `GameStateProvider` set to a **live game window**, scores/matchups
   are due every 30–60s (asserted: multiple syncs across simulated minutes); with it set to **off-hours**, scores
   sync hourly and settings daily (far fewer syncs over the same simulated span). Driven purely by injected
   game-state + clock.
3. **Idempotent re-poll (no dup / no spurious write).** Two `league.ingest` runs over unchanged provider data
   produce **zero net writes** on the second pass (hash no-op) and do not double-trigger `recompute` (asserted via
   the stats-calculation log); a double-fired tick collapses via the idempotency key to one sync per window.
4. **Finalized matchup never downgrades.** A matchup synced `final`, then re-polled with a provider response that
   reports it `in_progress`, stays `final` (the existing guard); a rejected downgrade is recorded as an integrity
   note, not silently dropped. A genuine score **correction** that stays `final` DOES upsert and re-emits the
   changed-matchup/`game.final` event.
5. **Expired auth surfaces reconnect, never crashes.** A mock ESPN provider returning `PROVIDER_AUTH_EXPIRED` on
   `league.ingest` marks the credential `invalid`, stops retries (no infinite loop), pauses the league, and the
   league's status carries the `espn` reconnect CTA. After a simulated reconnect (`status` → `connected`), the
   next tick resumes ingestion automatically. Blocked/rate-limited errors retry with backoff and do **not** raise
   a reconnect CTA or mark the credential invalid.
6. **Yahoo silent refresh.** A Yahoo credential with an expired access token but a valid refresh token is renewed
   silently within `league.ingest` (rotated token persisted to the encrypted credential), the sync proceeds, and
   **no** reconnect CTA is raised. A rejected/revoked refresh token raises the Yahoo reconnect CTA and marks the
   credential `invalid`. Sleeper (`authKind:none`) syncs with no credential and can never raise a CTA.
7. **Multi-league fan-out + isolation.** One tick over a user with ESPN + Sleeper + Yahoo connected leagues fans
   out three independent `league.ingest` events; a forced failure in one (e.g. Yahoo blocked) does not prevent the
   other two from syncing. A league-A worker writes zero league-B rows (RLS canary).
8. **Season rollover auto-pickup.** With a mock provider that begins exposing a new season after the clock crosses
   into preseason, the rollover check registers the new season-league under the **same credential** (no
   re-onboarding) and begins `league.ingest` for it on the preseason cadence; re-running rollover is a no-op
   (idempotent), and a provider not yet exposing the new season is a no-op that retries.
9. **Pluggable policy seam.** Swapping the `PollPolicy` config (e.g. a test config with a 5s scores interval, or an
   alternate `PollPolicy` implementation) changes which leagues/classes are due with **zero changes** to the
   scheduler/worker/`syncCurrentLeague`. A per-call override beats env override beats built-in default
   (resolution-order test).
10. **Freshness observability.** After syncs, each `(league, dataClass)` exposes `lastSyncedAt`/`nextDueAt` and an
    overall `freshness` (`fresh|stale|error`); a paused (auth-invalid) league reports `error`/paused with its CTA,
    and a league past its stale threshold reports `stale`.

## Dependencies / blocked-by
- **Builds on** `specs/14` (substrate depth: idempotent sync, checkpoints, `data_coverage`, recompute contract)
  and `specs/03` (provider seam, typed errors, capabilities).
- **Needs** Foundation (`specs/02`): Drizzle/RLS, Inngest (cron + events), Redis; and the onboarding reconnect
  surface (`src/onboarding/reconnect.ts`) + `providerCredentials`.
- **Feeds** the AI cast (fresh facts to react to — the "Alive" principle), the home/record book (live standings &
  freshness), realtime (`scores.updated`), and betting settlement (`game.final` off real finals).

## Non-goals (this spec)
- **No polling-cost optimization now.** This spec leaves the §B policy seam open but does not implement
  delta-detection, conditional requests, or push. (See "Future research".)
- No new provider beyond ESPN/Sleeper/Yahoo; no non-NFL sports; no fantasy-points recomputation (consume provider
  scores as truth, per `specs/14`).
- No deep-history re-import on a schedule (history is a separate, rarely-run flow; live ingestion only records
  current/new-season data + bounded gap backfill).
- No UI design here (home pulse, reconnect CTA surface, steward freshness view render elsewhere).

## Future research (explicitly out of scope — slots into the §B policy seam later)
**Polling cost optimization.** A later pass can reduce provider load and spend with **zero rearchitecting** by
implementing alternate `PollPolicy`/transport behind the same seam: **delta-detection** (skip a sync when a cheap
signal says nothing changed), **conditional requests / ETags / If-Modified-Since** (provider-supported 304s),
**shared-source fan-in** (one provider fetch serving many leagues that share an upstream resource, e.g. the NFL
game clock or a shared Sleeper endpoint), and **push-where-available** (subscribe to provider push/webhooks
instead of polling where a provider offers it). These are tracked as future research, not built here.
