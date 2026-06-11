# Spec 03 — Ingestion & Providers

> Outcomes spec. Defines WHAT ingestion produces and HOW providers are abstracted, not the line-by-line HOW.
> Canonical context: `docs/PROGRESS.md` §3 (validated ESPN facts), `specs/01-architecture.md` (provider abstraction, tenancy, jobs).
> Lives in `src/providers/` + `src/ingestion/`. Built after Foundation (P0).

## Purpose
Turn "a user's external fantasy league" into accurate, isolated, provider-agnostic rows in our Postgres,
on demand and on schedule, without ever leaking one league's data into another. Two layers:

1. **`FantasyProvider`** — a narrow interface every source (ESPN now; Sleeper/Yahoo later) implements. It speaks the
   provider's native API and returns **normalized** objects. Nothing above this layer knows ESPN view params or Yahoo OAuth.
2. **Ingestion** — orchestration that calls a provider, normalizes, dedups, and **idempotently upserts** into league-scoped
   tables under `league_id` (RLS-enforced). Supports a current sync and a resumable, checkpointed ~10-year historical import.

Everything that touches provider credentials or cookie'd HTTP runs **server-side only** (route handlers / Inngest jobs).
The real proving ground is ESPN league **95050**, season **2026** ("NHS Alumni Annual", 12-team `H2H_POINTS`).

## Provider interface (outcomes)
A `FantasyProvider` is a stateless adapter; per-call it receives a `Session` (opaque, provider-specific creds the caller
loaded from encrypted storage). Each method returns **normalized** objects (see next section) or a typed error `Result`.
Methods are **read-only**, **idempotent**, and **side-effect-free** (no DB writes — ingestion owns persistence).

- **`authenticate(creds) → Session`** — validates raw creds against the provider and returns a usable session, or a typed
  auth error (expired/invalid). For ESPN this confirms `SWID`+`espn_s2` are live; it does NOT mutate the DB.
- **`discoverLeagues(session) → ProviderLeagueRef[]`** — returns every league the authenticated identity belongs to
  (`{ provider, providerId, name, season, sport }`), across seasons where the provider exposes them. Powers onboarding
  auto-discovery (the #1 past failure to fix). MUST work from a single connect, no per-league input.
- **`getLeague(session, ref) → NormalizedLeague`** — league settings/metadata for one `{providerId, season}`
  (name, scoring type e.g. `H2H_POINTS`, size, current scoring period, season status).
- **`getTeams(session, ref) → NormalizedTeam[]`** — every fantasy team/franchise in the league for that season.
- **`getRosters(session, ref, scoringPeriod?) → NormalizedRoster[]`** — roster entries (team ↔ player ↔ slot/status) for a
  scoring period (defaults to current). Includes the underlying `NormalizedPlayer` refs.
- **`getMembers(session, ref) → NormalizedMember[]`** — the human league members and their team ownership for that season
  (the substrate for identity resolution across seasons).
- **`getMatchups(session, ref, scoringPeriod?) → NormalizedMatchup[]`** — head-to-head matchups + scores; one period or all.
- **`getHistory(session, ref, { seasons }) → NormalizedSeasonBundle[]`** — prior-season league data (teams, members,
  matchups, final standings, transactions) for the requested seasons; the engine for historical import & records.

Each adapter also declares static **`capabilities`** (e.g. `supportsHistory`, `supportsTransactions`, `requiresOAuth`,
`authKind: 'cookie' | 'none' | 'oauth2'`) so ingestion can branch without provider-specific `if`s scattered around.

## Normalized model (provider-agnostic)
All persisted entities are keyed by a **stable composite identity `{ provider, providerId }`** (NOT the provider's raw
numeric id alone), plus `season` where the provider scopes data by season. Every league-scoped row carries `league_id`.
Shapes are the contract; storage is Drizzle tables defined consistent with `specs/01-architecture.md`.

- **`NormalizedLeague`** — `{ provider, providerId, season, name, sport, scoringType, size, currentScoringPeriod, status }`.
- **`NormalizedTeam`** — `{ provider, providerId, leagueProviderId, season, name, abbrev, logo?, ownerMemberIds[] }`.
- **`NormalizedMember`** — `{ provider, providerId, displayName, leagueProviderId, season, role? }`. `providerId` is the
  durable per-person id the provider exposes (ESPN SWID/member GUID), enabling cross-season linking by `stats` identity res.
- **`NormalizedMatchup`** — `{ provider, providerId, leagueProviderId, season, scoringPeriod, homeTeamRef, awayTeamRef,
  homeScore, awayScore, winner, status }`.
- **`NormalizedRoster`** — `{ teamRef, season, scoringPeriod, entries: [{ playerRef, slot, status, points? }] }`.
- **`NormalizedPlayer`** — `{ provider, providerId, fullName, position, proTeam?, status? }`. Players are a catalog keyed by
  `{provider, providerId}`; roster entries reference them.
- **`NormalizedTransaction`** — `{ provider, providerId, leagueProviderId, season, type (add/drop/trade/waiver), teamRefs[],
  playerRefs[], timestamp, details }`.
- **`NormalizedSeasonBundle`** — `{ league, teams[], members[], matchups[], finalStandings[], transactions[] }` for one season.

Refs (`*Ref`) are `{ provider, providerId }` (+ `season` for season-scoped entities). Normalization MUST be **total**:
unknown enum values map to an explicit `unknown` rather than throwing, and raw provider payloads are not persisted in domain
tables (an optional raw-snapshot table for debugging is allowed but never read by features).

## ESPN adapter behavior (validated facts)
The ESPN adapter (`src/providers/espn/`) is the only one built now. All of the following are **proven** against league 95050.

- **Credentials:** cookies `SWID` (brace-wrapped GUID) + `espn_s2`. Read from encrypted storage; passed only as a `Cookie`
  header on server-side requests. **Never** sent to the client, never logged, never in env files (only `.env.local` for dev).
- **Current league host/path:**
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{id}`
  with `?view=` params combined per call. Known views: `mTeam`, `mSettings`, `mRoster`, `mMatchup`, `mMatchupScore`,
  `mStandings`, `mTransactions2`, `mMembers` (the adapter requests only the views a given method needs).
- **Historical league:**
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/{id}?seasonId={year}` (plus the same `view`s).
  Used by `getHistory` for prior seasons; returns an array of season objects.
- **Discovery:** `GET https://fan.api.espn.com/apis/v2/fans/{SWID}` (cookies only). Returns the fan's leagues across
  sports/seasons; the adapter filters to `ffl` and maps each to a `ProviderLeagueRef`. This is the single-connect onboarding path.
- **Required headers (all cookie'd calls):** a real desktop `User-Agent`; `x-fantasy-source: kona`;
  `x-fantasy-platform: kona`; `X-Personalization-Source: ESPN.com - FAM`; `Accept: application/json`. Missing/placeholder
  headers correlate with 403/Cloudflare blocks.
- **Mapping rules:** ESPN `id` (numeric) → `providerId` (stringified) namespaced under `provider: 'espn'`; member GUID/SWID →
  member `providerId`; `settings.scoringSettings.scoringType` → `scoringType` (e.g. `H2H_POINTS`); `scoringPeriodId` →
  `scoringPeriod`; `players`/`playerPoolEntry` → `NormalizedPlayer`. The adapter owns ALL ESPN-shape knowledge.
- **Server-side enforcement:** the adapter must be importable only from server contexts; a unit test asserts no client bundle
  imports it (and that cookie values never appear in logs).

## Ingestion, dedup & historical import
- **Idempotent upserts:** every write is an upsert keyed on the entity's stable identity (`{provider, providerId[, season,
  scoringPeriod]}`) scoped by `league_id`. Re-running any sync converges to the same rows — no duplicates, no orphan churn.
- **Deduplication via stable hashing:** ingestion computes a deterministic content hash (e.g. SHA-256 over the normalized,
  key-sorted payload) per entity. Unchanged hash ⇒ skip the write (cheap no-op); changed hash ⇒ upsert + bump `updated_at`.
  Hashing is on the **normalized** shape so it's stable across provider payload jitter (key ordering, absent optional fields).
- **Sync orchestration:** triggered by `league.connected` (Inngest event) and a scheduled refresh (`specs/01`). One sync run
  fetches league→teams→members→rosters→matchups for the current season, normalizes, dedups, upserts under one `league_id`.
- **Historical import (resumable, checkpointed, ~10 yrs):** `import.requested` enqueues a season-by-season import (newest→oldest,
  bounded to ~10 seasons / earliest the provider exposes). After each season completes it writes a **checkpoint**
  (`{ league_id, provider, lastCompletedSeason, cursor }`); a re-run resumes from the next uncompleted season rather than
  restarting. Each season is its own idempotent unit. Progress is observable (realtime/jobs status), and a completed import is
  detectable so it isn't redone needlessly.
- **Isolation:** ingestion always resolves the target `league_id` first and sets the RLS session var
  (`app.current_league_id`) for the transaction; every query also filters `WHERE league_id = …` (defense in depth). A sync for
  league A can never write or read league B's rows.

## Error handling & rate limits
- **Conservative rate limiting:** all provider HTTP goes through a shared limiter (token-bucket / queue) tuned well under the
  provider's tolerance (ESPN historically ~30 req/min). Limits are per-provider and configurable; historical import paces
  itself to stay within budget even across many seasons.
- **ESPN 403 / Cloudflare:** treated as retryable. Retry with **exponential backoff + jitter**, capped attempts; on repeated
  403 surface a typed `ProviderBlockedError` (distinct from `AuthExpiredError`). First remediation step is verifying the
  required headers are present (a common 403 cause). 401/403 with an expired-cookie signature ⇒ `AuthExpiredError`
  (non-retryable; user must re-connect).
- **Typed errors / `Result`:** adapters and ingestion return typed errors (`AuthExpiredError`, `ProviderBlockedError`,
  `RateLimitedError`, `NotFoundError`, `ProviderParseError`) — never swallow, never throw raw strings. Errors are logged
  structured **without** cookies/tokens.
- **Failure semantics:** a failed season in historical import does not corrupt completed seasons (checkpoint stands); a failed
  current sync leaves prior good data intact (upserts are per-entity, partial progress is valid). Jobs are safe to retry.

## Acceptance criteria (testable — league 95050 fixtures + mocked HTTP)
All tests run offline against **recorded fixtures** of real 95050 responses; live cookie'd calls are NOT made in CI.

1. **Fixtures captured:** `test/fixtures/espn/` contains real (secret-scrubbed) responses for: discovery (`fans/{SWID}`),
   `leagues/95050?view=mTeam&view=mSettings` (season 2026), a roster view, a matchup view, and one `leagueHistory` season.
2. **Discovery:** given the discovery fixture, `discoverLeagues` returns a `ProviderLeagueRef` for league `95050`,
   `provider: 'espn'`, season `2026`, sport `ffl`.
3. **getLeague:** parses 95050 → `NormalizedLeague` with `name: "NHS Alumni Annual"`, `scoringType: 'H2H_POINTS'`, `size: 12`.
4. **getTeams/getMembers:** returns 12 teams; members map to durable `providerId`s; team→owner links resolve.
5. **Normalization totality:** an unknown enum / missing optional field maps to `unknown`/absent without throwing.
6. **Idempotent upsert:** ingesting the same fixture twice yields identical row counts and contents (no duplicates); a unit
   test asserts the second run performs zero net writes (hash no-op).
7. **Dedup hashing:** a byte-level change to a non-key field changes the hash → triggers an upsert; reordered keys / absent
   optionals do NOT change the hash.
8. **Historical checkpoint/resume:** a simulated failure after season N leaves a checkpoint at N; re-running resumes at N-1 and
   completes without reprocessing N. Bounded to ≤10 seasons.
9. **Rate limiting:** a test with many queued requests proves the limiter never exceeds the configured per-provider budget.
10. **403/Cloudflare backoff:** mocked HTTP returning 403 triggers bounded exponential-backoff retries then a
    `ProviderBlockedError`; an expired-cookie response yields `AuthExpiredError` (no retry).
11. **Required headers:** a test asserts every ESPN request carries `x-fantasy-source: kona`, `x-fantasy-platform: kona`,
    `X-Personalization-Source: ESPN.com - FAM`, and a non-empty real `User-Agent`.
12. **Isolation:** ingesting two distinct leagues (95050 + a synthetic second) under RLS proves rows are scoped to the correct
    `league_id` and neither sync reads/writes the other's rows.
13. **Server-only:** a test/build check confirms the ESPN adapter (and cookies) are never included in a client bundle, and that
    no log line contains cookie values.

## Dependencies / blocked-by
- **Blocked by Foundation (`specs/02`):** Drizzle + Postgres + **RLS helper** (`app.current_league_id`), Inngest scaffold,
  `src/core` env/`Result`/logger, encrypted-credential storage (mineable from `v0.62:lib/crypto/encryption.ts`).
- **Consumes:** onboarding's connect/discovery flow provides the `Session`; jobs (`src/jobs`) emit `league.connected` /
  `import.requested`.
- **Feeds:** `src/stats` (identity resolution + records consume members/matchups/history), `src/realtime` (sync progress),
  league home (current standings/stats), AI memory (league facts).

## Non-goals
- **No Sleeper/Yahoo implementation now.** Sleeper (no-auth, public API) and Yahoo (OAuth2) are future adapters behind the
  **same `FantasyProvider` interface**; nothing in this spec may bake in ESPN-only assumptions above the adapter boundary.
- No live cookie'd calls in CI (fixtures + mocks only). No browser/onboarding capture mechanics (that's the onboarding spec).
- No write-back to ESPN (read-only ingestion). No non-NFL sports. No UI here (consumers render).
