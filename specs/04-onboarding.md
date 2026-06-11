# Spec 04 — Onboarding (the make-or-break)

> Outcomes spec. WHAT, not HOW. Context: `docs/PROGRESS.md` §1/§3/§6, `specs/00-product.md`, `specs/01-architecture.md` (`src/onboarding/`).
> **This is the feature the old build died on.** If a real user cannot connect their ESPN league on a phone in < 60s, nothing else matters.

## Purpose
Connect an ESPN league with **zero console/cookie/devtools digging**, then turn one connection into the whole league:
**connect once → auto-discover ALL the user's leagues → user picks which to import → ingest → invite leaguemates (viral seed)**.
Must work on **mobile** (the primary device) and reach desktop parity. A designated **data steward** keeps each league's data honest.

## The friction problem (why this is hard — read before designing)
- **ESPN has no public OAuth / API keys.** Authenticated reads require the user's session cookies `SWID` + `espn_s2`. These cannot be obtained programmatically without the user logging in.
- The cookies are **HttpOnly** → JS on a page cannot read them. So a web app cannot "just grab them."
- **On mobile, browser extensions cannot help:**
  - **iOS Safari** does not expose other apps' / sites' HttpOnly cookies to web content or extensions.
  - **Android Chrome has no extension support at all.**
  - Therefore the desktop "MV3 extension reads cookies" trick is **impossible on phones** — and phones are our primary device.
- A native app could capture cookies via an in-app webview, but we are **PWA-first** (no app store for MVP).
- **Conclusion:** the only mobile-viable path is to host the login in a browser **we control server-side** and capture the session there. Everything below follows from that.

## Connect flows (recommended → fallback)

### PRIMARY — Hosted live-browser login (mobile-first, works everywhere)
The user logs into ESPN inside a **cloud browser we operate** (Browserbase-style). They never see or touch a cookie; we read `SWID`/`espn_s2` **server-side** from that browser session and store them encrypted.

Behind a `BrowserSession` interface (see Interfaces). **MOCKED for now** — the mock yields the proven fixture creds for league `95050` so the full flow runs in tests/dev without a real cloud browser or live ESPN.

Steps + acceptance:
1. User taps **Connect ESPN**. → We create a `BrowserSession` (`session.start()`) and return a live-view URL embedded in our PWA (iframe/redirect).
   - *Accept:* a session record is created (`status=awaiting_login`) and a live-view surface renders on mobile.
2. User logs into ESPN (email/password, incl. any 2FA) **inside the hosted browser**. We never see their ESPN password — it goes only to ESPN inside the controlled browser.
   - *Accept:* on successful ESPN auth, `session.captureCredentials()` returns `{ swid, espn_s2 }`; we never persist the password.
3. We validate the captured cookies against a known ESPN endpoint (the Fan API, see Discovery) and **encrypt + store** them (see Credential security).
   - *Accept:* invalid/expired capture → clear retry state, no partial credential row; valid capture → encrypted credential persisted, `status=connected`.
4. `session.end()` tears down the cloud browser. We immediately proceed to discovery.
   - *Accept:* session torn down; `onboarding.connected` event emitted → triggers `discoverLeagues`.

### FALLBACK — MV3 browser extension, one-click (desktop only)
For desktop users who prefer it, a Manifest V3 extension reads `SWID`/`espn_s2` from the `*.espn.com` cookie jar (extension `cookies` permission) after the user is logged into ESPN, and POSTs them to our connect endpoint over HTTPS with a short-lived nonce tying the post to the user's session.

Steps + acceptance:
1. User (on desktop) installs/opens the extension while logged into ESPN, clicks **Send to Rumbledore**.
   - *Accept:* extension reads both cookies; if either missing, it tells the user to log into ESPN first (no silent failure).
2. Extension POSTs `{ swid, espn_s2, nonce }` to `/api/onboarding/extension`; server verifies the nonce → encrypts + stores → emits `onboarding.connected`.
   - *Accept:* same validation + storage guarantees as PRIMARY step 3; nonce is single-use and expires.
- *Note:* surfaced **only on desktop**; on mobile the UI does not offer or imply the extension exists.

### TERTIARY — Guided manual paste (universal escape hatch)
Last resort when both above are unavailable/declined. A short, friendly guided flow (screenshots per platform) walks the user to copy `SWID` and `espn_s2` and paste them into two fields. Validated + encrypted identically.

Steps + acceptance:
1. Guided UI shows platform-specific copy instructions and two inputs (`SWID`, `espn_s2`).
   - *Accept:* inputs validated for shape (`SWID` brace-wrapped GUID; `espn_s2` non-empty token) before submit; bad shape → inline error, no network call.
2. Submit → validate against ESPN → encrypt + store → emit `onboarding.connected`.
   - *Accept:* same validation/storage/event guarantees as the other flows. This path produces an identical `connected` credential — downstream cannot tell which flow was used.

> **Invariant across all three:** ESPN cookies are captured/validated/stored **server-side only**, encrypted at rest, never logged, never sent to the client after capture. All produce the same normalized `connected` credential + `onboarding.connected` event.

## League discovery + multi-league
Once connected, **one** connection reveals **all** of the user's leagues — this is the core onboarding thesis (proven, `docs/PROGRESS.md` §3).
- Discovery calls the ESPN **Fan API** `GET https://fan.api.espn.com/apis/v2/fans/{SWID}` (cookies only, server-side) and normalizes to `DiscoveredLeague[] = { provider:'espn', providerLeagueId, name, season, sport, teamName?, size? }` via the `FantasyProvider.discoverLeagues` abstraction (see `specs/01-architecture.md`; ESPN adapter + `03-ingestion-providers` when written).
- **User picks which leagues to import** (multi-select; default = all NFL/`ffl` leagues for the current season). Non-football / off-season leagues are shown but not auto-selected.
- Selecting leagues emits `league.connected` per chosen league → triggers ingest (current + history) per `specs/01-architecture.md` Jobs.
- A user belongs to **many leagues**; each becomes its own sandbox (org/tenant). The same stored credential is reused across that user's leagues — connect once, not once-per-league.
- *Accept (the headline metric):* in mock mode, **connect → discover ≥ 1 league completes in < 60s**, and selecting a league enqueues its ingest job.

## Invites / viral seed (leaguemate detection)
A connected league exposes its **members** (manager display names + team names) via the provider. **ESPN gives us NO emails** — so we cannot contact leaguemates through ESPN.
- After connect, show **"We found your N leaguemates"** — a roster of the OTHER members in this league (from `getMembers`), excluding the connecting user.
- The connecting user invites them through **OUR channels**: a **shareable invite link** (primary, matches the "distributed via a link" product bar), plus optional **SMS** and **email** (entered by the inviter — we ask the human, since ESPN has none).
- An invited leaguemate who joins is **matched back to their ESPN member** by identity resolution (name/team), so they land directly in the right league with their team pre-associated. (Identity resolution lives in `src/stats/`; onboarding consumes it.)
- SMS + email sit behind interfaces with **mocks** (see Interfaces): `Notifier.sendSms`, `Notifier.sendEmail`. The share link works with zero external services.
- *Accept:* given a fixture league's members, the UI lists each non-self member with an invite affordance; generating a share link is instant and offline; SMS/email calls hit the mock and are recorded, not actually sent.

## Data-steward role
Each league can designate a member as **data steward** — the human guardian of that league's data integrity (history pulls are imperfect; someone trusted curates). Role exists in the auth model (`specs/01-architecture.md`, `specs/02-foundation.md` roles enum includes `data_steward`).
- **Who:** the league owner/commissioner assigns the steward (a member of *that* league). One or more per league.
- **Can SEE:** their own league's ingested data — teams, members, rosters, matchups/scores, historical seasons, and the identity-resolution mapping (which ESPN member ↔ which app user/team). **Scoped strictly to their league** (RLS + `WHERE league_id`). No cross-league visibility, ever.
- **Can DO:**
  - **Flag** a record as mis-pulled/suspect (creates an auditable flag; does not mutate source).
  - **Correct** specific curated fields: team↔member/user mappings, display names/aliases, obvious data errors (e.g. a misattributed matchup result), and merge/split duplicate member identities surfaced by identity resolution.
  - **Re-trigger** a scoped re-sync/re-import for their league (no access to credentials themselves).
- **Cannot:** view or export raw ESPN credentials; touch other leagues; change billing/auth/global settings; alter the append-only betting ledger or odds snapshots.
- **Auditability:** every steward edit is recorded (who/when/old→new) and reversible; corrections are stored as an overlay/normalization layer, not destructive overwrites of ingested source rows, so a re-import never silently clobbers curation and bad edits can be rolled back.
- *Accept:* a `data_steward` can read + flag + correct only their league's records under RLS; an integration test proves a steward in League A cannot read or edit League B; every correction produces an audit entry.

## Credential security
- ESPN `SWID`/`espn_s2` **encrypted at rest** (authenticated encryption; master key from env only — see `specs/01-architecture.md` config & secrets, `specs/02-foundation.md` env validation). Mine the proven `lib/crypto/encryption.ts` from `v0.62` as a reference (`docs/PROGRESS.md` §2).
- **Server-side only**: cookies are captured, validated, used, stored, and read exclusively on the server. They are NEVER returned to the client, NEVER logged, NEVER placed in env files.
- ESPN passwords are **never** seen or stored — they exist only inside ESPN's own login (PRIMARY/TERTIARY) or the user's own browser (FALLBACK).
- Stored credentials track validity/expiry; an expired/invalid credential surfaces a **re-connect** prompt (re-run any connect flow) and pauses dependent jobs gracefully — no crashes, no leaked partial state.
- Extension POST and manual paste are HTTPS-only; the extension post is bound to the user's session via a single-use, short-lived nonce.

## Interfaces (paid/external behind mocks — per `specs/01-architecture.md` + `02-foundation.md` `MOCK_*`)
- **`BrowserSession`** (hosted live-browser; Browserbase-style): `start() → { sessionId, liveViewUrl }`, `captureCredentials() → { swid, espn_s2 }`, `end()`. **Mock** drives the whole PRIMARY flow with fixture creds for league `95050`, deterministically, no network.
- **`Notifier`**: `sendSms(to, msg)`, `sendEmail(to, subject, body)`. **Mock** records sends in-memory/test-store; asserts on them; sends nothing real.
- ESPN itself is exercised against **fixtures** (real captured responses for league `95050` season `2026`) in tests — no live ESPN calls in CI.
- `MOCK_BROWSERBASE` / `MOCK_NOTIFIER` (or the foundation's `MOCK_*` convention) default ON so onboarding runs end-to-end on local Postgres/Redis + fixtures with no keys.

## Acceptance criteria (testable; mock BrowserSession + ESPN)
1. **Headline:** with mocks on, **connect (PRIMARY) → discover ≥ 1 league completes in < 60s**, asserted in an integration test against fixtures. Selecting a discovered league enqueues its `league.connected` ingest job.
2. All three flows (mocked PRIMARY, FALLBACK extension POST, TERTIARY paste) converge to the **same** `connected` credential + `onboarding.connected` event; a test asserts downstream is flow-agnostic.
3. Captured ESPN cookies are stored **encrypted** and a test proves they are never returned to the client and never appear in logs.
4. Invalid/expired captured creds → clean retry, no orphan/partial credential row (tested for each flow).
5. Discovery normalizes the fixture Fan-API response to `DiscoveredLeague[]` with ≥ 1 entry (league `95050`, season `2026`).
6. Leaguemate detection lists every non-self member of the fixture league; share-link generation works offline; SMS/email invites hit the `Notifier` mock and are recorded, not sent.
7. An invited member who joins is matched back to their ESPN member via identity resolution and lands in the correct league.
8. RLS isolation: a `data_steward` (and any member) in League A cannot read or edit League B's data — integration test, building on the `02-foundation` isolation canary.
9. Steward can flag + correct curated fields in their own league; every correction writes an audit entry and is reversible; a re-import does not clobber curated overlays.
10. Re-connect path: an expired credential surfaces a re-connect prompt and pauses dependent jobs without errors.
11. PWA: the entire PRIMARY connect flow is operable on a mobile viewport (no desktop-only affordances on mobile; extension never advertised on mobile).

## Dependencies / blocked-by
- **Blocked-by `specs/02-foundation.md` (P0):** auth + roles (incl. `data_steward`), RLS + `app.current_league_id`, `MOCK_*` env toggles, crypto/encryption, Inngest scaffold, Drizzle baseline (`users`/`leagues`/`league_members`).
- **Needs the `FantasyProvider` ESPN adapter** (`specs/01-architecture.md`; `specs/03-ingestion-providers.md` when authored) for `discoverLeagues`/`getMembers` and the ingest jobs that `league.connected` triggers.
- **Needs identity resolution** (`src/stats/`) for leaguemate match-back and steward duplicate merge/split.
- **External (deferred behind mocks):** real Browserbase (or equivalent) account; real SMS (e.g. Twilio) + email (e.g. Resend) providers. Wire real impls only when keys exist; mocks ship now.

## Non-goals (for this spec)
- Real Browserbase / real SMS / real email integrations (interfaces + mocks only now).
- Sleeper (no-auth) and Yahoo (OAuth2) connect flows — provider abstraction anticipates them; not built here.
- The ingestion pipeline internals, statistics engine, and identity-resolution algorithm themselves (separate specs); onboarding only **consumes** them.
- Native app / app-store webview cookie capture (PWA-first for MVP).
- Real-money or prize mechanics; anything in the betting/arena domain.
