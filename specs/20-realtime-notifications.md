# Spec 20 — Realtime Fan-out + Notifications (end to end)

> Derives from `docs/NORTH-STAR.md`. The product must have **a pulse**: a settled bet, a standings swing, a
> fresh cast column, a lore vote crossing threshold should **land in real time** — the league feels live and
> the user feels like a character in a show that reacts *while they watch*. This spec wires the existing
> realtime + push plumbing into an **end-to-end** delivery path so moments arrive without a refresh, and the
> cast's instigation (a lore claim "needs your vote", a rival "passed you in the arena") reaches the member
> who cares. Generic broadcast = failure; the moment must be **personal and about this league**.

## Ethos anchors (every acceptance test must protect one)
- **Alive** — an emitted domain event reaches a subscribed client channel and the league surface updates.
- **Personal** — pushes are per-league and (where it matters) per-user: *your* bet, *your* turn to vote, the
  rival who passed *you*. Never a league-wide blast for a personal moment.
- **Participatory** — the lore-vote notification pulls the member into the show ("Settle it" → go vote).
- **Secure isolation is sacred** — service-role key, JWT secret, and VAPID private key NEVER serialize to a
  client; channels and push rows are RLS-scoped per league.

## State: EXISTS vs NEW

### EXISTS (do not rebuild; wire into)
- **Realtime grants**: `src/realtime/grants.ts` (client-safe DTOs), `src/realtime/subscription-grants.ts`
  (server-only — Node crypto/DB/auth; signs short-lived HS256 JWT, 5-min TTL, channels scoped to the caller's
  league memberships), `GET /api/realtime/token` (`force-dynamic`, `runtime=nodejs`).
- **Transport split**: grant `transport` is `{kind:"mock"}` or `{kind:"supabase",url,publishableKey}`. Mock
  mode signs with `env.auth.secret`; real mode signs with `SUPABASE_JWT_SECRET`. Only the **publishable** key
  is ever in the grant.
- **Client**: `src/realtime/client.tsx` (`"use client"`) — `useRealtimeRefresh`, `LeagueRealtimeRefresh`,
  `ArenaRealtimeRefresh`, `CentralNewsRealtimeRefresh`; token refresh on expiry skew + reconnect/backoff
  (`RECONNECT_FALLBACK_MS`); when `transport.kind==="mock"` it returns a no-op handle (works in all-mocks dev).
- **Publisher**: `src/realtime/publisher.ts` (Supabase broadcast HTTP), `src/realtime/mocks.ts`
  (`NoopRealtimePublisher`, `RecordingRealtimePublisher`, `InProcessRealtimePublisher` for tests),
  `createRealtimePublisher(env)` in `dependencies.ts`.
- **Channels** (`src/realtime/interfaces.ts`): per-league `league:{id}:{scores|odds|leaderboard|blog|presence}`
  and public `central:news`, `arena:leaderboard`; payload types `v:1` discriminated by `type`.
- **Push**: per-league RLS rows (`pushSubscriptions` in `src/db/schema.ts`), `src/push/subscriptions.ts`
  (upsert/disable, membership-guarded, endpoint hashed), `src/push/notifier.ts` (`WebPushNotifier`, 404/410 →
  auto-disable), `POST/DELETE /api/push/subscriptions`, `GET /api/push/vapid-key` (returns **public** key only),
  `env.push` discriminated union `{mock,publicKey}|{mock:false,publicKey,privateKey,subject}`.
- **Existing fan-out** already live: scores (`src/ingestion/current-league.ts` → `publishLeagueScoresUpdated`),
  blog published (`src/ai/pipeline.ts` → `publishLeagueBlogPublished` + `notifyLeague` blog push),
  bet settlement (`src/jobs/functions/betting-settle-game-final.ts` → bet-settled push + leaderboard realtime +
  arena standings swing realtime), lore vote close (`src/jobs/functions/lore-vote-close.ts` emits
  `lore.canonized` job event on quorum).
- **Push taxonomy today** (`src/push/interfaces.ts` `PUSH_EVENTS`): only `league.bet.settled`,
  `league.blog.published`.

### NEW / CHANGES (this spec)
1. **Lore fan-out → realtime + push.** `lore.canonized` and a new `lore.vote.opened` reach clients and
   notify the right members.
2. **Arena standings swing → push.** The realtime swing exists; add the *personal* push ("a rival passed you").
3. **Notification taxonomy expansion** + per-user **preferences/opt-out** (RLS-scoped), enforced at fan-out.
4. **Lore realtime channel** `league:{id}:lore` added to channel kinds + client default subscriptions.
5. End-to-end acceptance: emit → subscribed client receives; push enqueued with correct per-league/per-user
   scoping; tokens short-lived + league-scoped; **no secret ever serialized to a client**.

## 1. Realtime channels (per-league, RLS-scoped)

Add a `lore` kind to `LEAGUE_REALTIME_CHANNEL_KINDS` so the lore surface reacts live. Final per-league set:
`scores · odds · leaderboard · blog · lore · presence`. Public: `central:news`, `arena:leaderboard`.

Channels broadcast (event `type` constants in `REALTIME_EVENTS`):
- `scores.updated` — live score/standings ticks from spec 19 ingestion (`league:{id}:scores`). EXISTS.
- `league.leaderboard.updated` — bankroll/standings recompute after settlement (`league:{id}:leaderboard`). EXISTS.
- `blog.published` — a fresh cast column lands (`league:{id}:blog`). EXISTS.
- `arena.leaderboard.updated` / `arena.standings.swing` — inter-league arena moves (`arena:leaderboard`). EXISTS.
- **NEW** `lore.vote.opened` — a claim opened for league vote (`league:{id}:lore`).
- **NEW** `lore.canonized` — a claim crossed quorum and became canon (`league:{id}:lore`).

**RLS scoping is in the grant, not the broadcast.** The token route only grants `league:{id}:*` channels for
leagues the caller is a member of (`resolveMemberLeagueIds`). Supabase Realtime authorization (RLS on
`realtime.messages`) must require `current_league_id()`/membership to match the channel's league id — a member
of league A can never subscribe to league B's private channel even with a forged topic, because the signed JWT
only carries A's channels and the channel is `private:true`.

## 2. Client subscription flow

Unchanged transport, extended coverage:
- `LeagueRealtimeRefresh` default `channelKinds` gains `lore`; add `CHANNEL_REFRESH_EVENTS.lore =
  [lore.voteOpened, lore.canonized]`.
- Flow: client `GET /api/realtime/token?leagueId=…` → receives grant (short-lived JWT + transport). On
  `mock` transport, no socket opens — surfaces still work via the existing coalesced `router.refresh()` path,
  so **all-mocks dev is fully functional** and tests assert delivery against `InProcessRealtimePublisher`.
- **Reconnect/backoff**: refresh the grant at `expiresAt - TOKEN_REFRESH_SKEW_MS`; on channel
  `CHANNEL_ERROR|TIMED_OUT|CLOSED` or fetch failure, reconnect after `RECONNECT_FALLBACK_MS`. A `401/403` from
  the token route returns a no-op handle (logged-out / non-member) — never a crash loop.
- Payloads are `v:1` and `type`-discriminated; the client treats payload as a refresh trigger (and, where a
  surface wants it, an optimistic patch), never as trusted authority — the DB/RLS read is the source of truth.

## 3. Web Push notifications (end to end)

### Subscription (per-origin browser → per-league RLS rows)
- Browser obtains the **public** VAPID key from `GET /api/push/vapid-key` (returns `{mock, publicKey}` only —
  private key NEVER leaves the server), calls `pushManager.subscribe`, and `POST`s the subscription with a
  `leagueId` to `/api/push/subscriptions`. One browser subscription is fanned into a **per-league row** so a
  user in three leagues opts in per league; isolation stays sacred.
- Membership-guarded (`requireLeagueRoleForUser`, min `member`); endpoint stored hashed; 404/410 on send →
  row auto-disabled (`status="disabled"`, `disabledAt`). `DELETE` opts a league back out.

### VAPID config (mock until keys)
- `env.push.mock=true` (default dev): `NoopPushNotifier`; `vapid-key` returns a stable dev public key so the UI
  flow is exercisable end to end without real delivery. Real delivery requires `WEB_PUSH_PUBLIC_KEY`,
  `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` (validated by `env` when `MOCK_PUSH=false`).

### Notification taxonomy (`PUSH_EVENTS`)
Personal, league-specific moments — each maps to a deep link into the relevant league surface:
| event | trigger | scope | deep link |
|---|---|---|---|
| `league.bet.settled` (EXISTS) | your slip settles | per-user (`userIds`) | `/leagues/{id}/bet?slip=…&settlement=…` |
| `league.blog.published` (EXISTS) | the cast posts a column | league-wide | `/leagues/{id}` content item |
| **`league.lore.vote.opened` (NEW)** | a claim needs the league's vote | league-wide | `/leagues/{id}/lore/{claimId}` |
| **`league.lore.canonized` (NEW)** | a claim becomes canon | league-wide | `/leagues/{id}/lore/{claimId}` |
| **`arena.rival.passed` (NEW)** | a rival passed *you* in the arena | per-user (the passed subject) | `/arena?season=…` |

Voice belongs in `title`/`body` (the cast instigates: "Settle it: the 2019 trade was the worst ever — your
league needs you." / "A rival just passed you in the arena."), not in plumbing. Copy lives with the producer.

### User preferences / opt-out
- NEW table `push_notification_preferences` (per-league RLS row, `league_id` + `user_id` + per-`type` boolean,
  default opted-in), `pgPolicy` `USING/WITH CHECK league_id = current_league_id()` + hand-added
  `FORCE ROW LEVEL SECURITY` in the migration, listed in `_journal.json`.
- `notifyLeague` filters recipients by preference **before** load/send: a user opted out of `arena.rival.passed`
  is excluded from that fan-out. League-wide types still resolve to the per-user opt-out set.
- `PATCH /api/push/preferences` (membership-guarded, `withLeagueContext`, explicit `league_id`/`user_id`) toggles
  a type; absence of a row = default on. Opting out is honored without unsubscribing the browser endpoint.

## 4. Fan-out source — domain events → broadcasts + pushes (Inngest layer)

Producers emit through the injected `RealtimePublisher` / `PushNotifier` (resolved via
`createRealtimePublisher(env)` / `createPushNotifier(db, env)` — mock in dev). Tie-in per moment:

- **Ingestion (spec 19)**: weekly/live sync (`src/ingestion/current-league.ts`) already calls
  `publishLeagueScoresUpdated` when matchups change — keep; ensure standings recompute also fires
  `league.leaderboard.updated` so a standings swing lands live.
- **AI content** (`src/ai/pipeline.ts` `publishDraft`): on publish, `publishLeagueBlogPublished` + `notifyLeague`
  blog push. EXISTS. Failures are logged and swallowed — fan-out must never roll back the publish.
- **Betting settlement** (`src/jobs/functions/betting-settle-game-final.ts`): bet-settled push (per-user) +
  `publishLeagueLeaderboardUpdated` + `publishArenaStandingsSwing`. EXISTS. **NEW**: when a swing's `rankDelta`
  shows a subject was overtaken, enqueue `arena.rival.passed` push to the *passed* user (per-user scope).
- **Lore** (`src/jobs/functions/lore-vote-close.ts` + lore engine): **NEW** — when a claim opens for vote, emit
  `lore.vote.opened` (realtime `league:{id}:lore` + `league.lore.vote.opened` push); on quorum/canonization
  (`lore.canonized` job event) emit `lore.canonized` realtime + `league.lore.canonized` push.
- **Idempotency**: fan-out runs inside Inngest steps with idempotency keys (e.g.
  `arena.standings.swing:{league}:{season}:{swingKey}`) so a retried job does not double-broadcast or
  double-notify. Realtime/push are best-effort *after* the durable state write; a delivery failure is logged,
  never fatal to the domain transaction.

## 5. Security (non-negotiable)

- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `WEB_PUSH_PRIVATE_KEY` are read ONLY server-side via
  `getEnv()`, never imported into a `"use client"` module. `subscription-grants.ts` stays server-only.
- The grant DTO (`RealtimeSubscriptionGrant`) contains only: signed short-lived JWT, `transport` with
  `url` + **publishable** key, and the channel list. A test asserts the serialized JSON contains none of the
  three secret values.
- `vapid-key` returns only `publicKey`. The grant JWT is HS256-signed with the JWT secret but the secret is
  never in the payload.
- Channels are `private:true`; RLS on `realtime.messages` enforces league membership server-side independent of
  the client. Push rows and preferences are league-RLS; cross-league reads are impossible via
  `withLeagueContext`.
- Never log tokens, JWTs, endpoints, or keys (AGENTS.md).

## 6. Acceptance (testable in mock mode — all gates green)

1. **Alive (realtime delivery)**: with `InProcessRealtimePublisher`, emitting each event
   (`scores.updated`, `league.leaderboard.updated`, `blog.published`, `arena.standings.swing`,
   `lore.vote.opened`, `lore.canonized`) invokes the handler subscribed to the matching topic with a `v:1`
   payload of the right `type`. A client subscribed to `league:{id}:lore` receives a canonization.
2. **Personal push scoping**: a bet-settled push targets only the slip owner's `userIds`; `arena.rival.passed`
   targets only the passed user; a lore push hits all members of league A and **zero** rows of league B
   (RLS-scoped query asserted under `withLeagueContext`).
3. **Preferences/opt-out**: a user opted out of `arena.rival.passed` is excluded from that fan-out's recipient
   set; default (no row) = included. League-wide types respect per-user opt-out.
4. **Short-lived + league-scoped tokens**: grant `expiresAt - issuedAt == 5 min`; a member of A requesting
   `leagueId=B` receives no `league:B:*` channels (403/empty); the JWT `realtime_channels` match the grant.
5. **Mock dev works**: with `MOCK_REALTIME=true`/`MOCK_PUSH=true`, the token route returns a `mock` transport,
   the client opens no socket and still refreshes, and `notifyLeague` returns a zeroed summary without throwing.
6. **No secret leaks**: serialized realtime grant and `vapid-key` response contain none of
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `WEB_PUSH_PRIVATE_KEY` (string-search assertion);
   `pnpm secret-scan` clean; no secret-bearing module enters a client bundle.
7. **Resilience**: a publisher/notifier throw is logged and swallowed — the domain write (publish, settlement,
   canonization) still commits; a 404/410 push auto-disables the row.

## 7. Files touched (orientation)
- CHANGE: `src/realtime/interfaces.ts` (add `lore` kind + `lore.vote.opened`/`lore.canonized` payloads),
  `src/realtime/client.tsx` (default lore subscription), `src/realtime/publisher.ts` + `mocks.ts` (lore publish),
  `src/push/interfaces.ts` (`PUSH_EVENTS` additions), `src/push/notifier.ts` (preference filtering),
  `src/jobs/functions/lore-vote-close.ts` + lore engine (emit), `src/jobs/functions/betting-settle-game-final.ts`
  (rival-passed push).
- NEW: `push_notification_preferences` table + migration (RLS + FORCE), `PATCH /api/push/preferences` route,
  preference read/write module under `src/push/`.
- UNCHANGED: `subscription-grants.ts`, `/api/realtime/token`, `/api/push/vapid-key`, env schema (already
  validate Supabase + VAPID config and keep secrets server-side).
