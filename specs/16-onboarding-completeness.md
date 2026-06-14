# Spec 16 — Onboarding Completeness (the frictionless, viral loop)

> Outcomes spec. WHAT a *finished* onboarding produces — not the line-by-line HOW.
> Read `docs/NORTH-STAR.md` first, then `specs/04-onboarding.md` (round-one connect/invite/claim), and
> `specs/14-data-foundation-depth.md` §E (steward). Lives in `src/onboarding/`, public `/invite/[leagueId]/[token]`.
> Canonical context: `docs/PROGRESS.md` §3 (validated ESPN facts), §7 (state), §8 invite/claim loop entries.

## Why this spec exists (the soul)
The North Star's promise is that onboarding is **near-automatic and viral**: *one person connects → the league
joins.* Rumbledore is a spectacle **about these specific people** — and a show with three of its twelve characters
present is not the show. The whole differentiation ("it's about **your** league") only pays off once the *real*
league is inside. So the activation goal isn't "a user connected ESPN"; it's **the league reconstituted inside
Rumbledore** — every manager claimed to their real team, the cast already writing about all of them.

Round one shipped the connect flow, a leaguemate-invite MVP, and share-token claim (PROGRESS §8: "Leaguemate
invite MVP", "Invite acceptance"). But the viral loop is **shallow and partly mocked**: invites assume an inviter
manually enters a destination, multi-league discovery exists per-provider but isn't surfaced as "connect once →
all your leagues across all providers," and the activation hook (why an invited stranger stays) is absent. This
spec **completes** that loop and makes it **frictional-zero and viral** — grounded in the *reality* that the
providers do not hand us emails.

## What EXISTS today (do not rebuild — extend)
- **Connect (all 3 providers).** ESPN hosted-browser (mock) + manual paste, Sleeper public username, Yahoo OAuth
  (fixture-mock) all converge to an encrypted `provider_credentials` row + discovered leagues
  (`src/onboarding/provider-service.ts`, `espn-service.ts`, `sleeper-service.ts`, `yahoo-service.ts`).
- **Per-provider discovery & import.** `listDiscoveredLeagues` / `importDiscoveredLeague` discover a credential's
  leagues, default-recommend the latest FFL season, import selected, enqueue history, recompute stats.
- **Leaguemate invites.** `src/onboarding/invites.ts`: `listLeaguemateInviteTargets` (non-self, non-claimed
  members + their teams), `createLeaguemateInvite` for `share | sms | email`, RLS-scoped `league_invites`,
  public landing, `acceptLeagueInvite` → auth-plane `members.role=member` + `league_member_identity_claims`.
- **Mocks.** `MockBrowserSession` (fixture ESPN creds for `95050`), `RecordingInviteNotifier` (records SMS/email,
  sends nothing). Yahoo fixture-mock unless real keys set.

## What CHANGES (the completeness deltas)
1. **One-account multi-league, multi-provider discovery** surfaced as a single "your leagues" inventory.
2. **Phone/SMS + copy-link as the PRIMARY invite paths**, auto-email only where an email actually exists — driven
   by the reality that ESPN exposes names/teams but **no emails**.
3. **"We found your N leaguemates" → bulk roster invite** (not one-destination-at-a-time), with channel chosen
   per-leaguemate.
4. **Claim-your-team activation hook**: the invitee lands on a page already populated with *their* team, records,
   and a cast teaser about them.
5. **Steward cleaning entry point from onboarding** (delegates to `specs/14` §E; thin onboarding surface only).

Browserbase **real capture stays MOCKED** (a later human-paired task); everything here runs on the mock + the
`95050` fixture. No real SMS/email is sent in this spec — `Notifier` stays mocked.

---

## A. Multi-league discovery — connect once, get everything
**Outcome:** a user connects **one account per provider** and Rumbledore presents **all** their leagues across
**ESPN + Sleeper + Yahoo** in a single inventory; they import many, and manage many, from one place.

- **Unified inventory.** After any connect, a single "Your leagues" view aggregates `listDiscoveredLeagues`
  across every connected credential **and every provider** the user has connected — not one provider per screen.
  Each row carries `{provider, providerLeagueId, name, season, sport, teamName?, size?, imported, connectionState,
  isRecommendedImport, leagueId?}`. Provider badge per row (no row pretends to be provider-agnostic to the user,
  but no domain code branches on the string — it reads the shape).
- **One credential, many leagues.** A user belongs to many leagues per provider; the **same stored credential is
  reused** across that provider's leagues (already true for discovery — this spec surfaces it as "connect once").
  Connecting a second provider **adds** to the inventory; it never replaces the first.
- **Multi-select import.** Default-selected = all current-season FFL leagues (existing `isRecommendedImport`);
  off-season / non-football shown but unselected. Importing each enqueues current sync + history + stats recompute
  (existing). Importing is idempotent: re-import of an already-imported league is a no-op join, not a duplicate.
- **Manage many.** The inventory persists (`onboarding_discovered_leagues`) and reloads after connect so a user
  re-entering onboarding sees imported vs not-yet-imported state without re-connecting. Re-discovery refreshes the
  list (new league joined mid-season appears on next connect/refresh).
- *Accept:* with the `95050` fixture, connecting ESPN discovers ≥1 league; the inventory query returns rows for
  **all** of the user's connected providers in one call; selecting ≥1 enqueues its import; a second connect of a
  different provider appends rows without dropping the first provider's rows.

## B. The viral invite loop — built on the REALITY (no emails)
**Outcome:** "we found your N leaguemates" → invite the **whole roster** through channels that actually work,
because the provider gives us names and teams but **not contact info**.

### The reality (read before designing)
- **ESPN exposes member display names + team names, but NO emails or phone numbers.** Sleeper and Yahoo are
  **inconsistent** — sometimes a display name only, occasionally an email, never reliable phone. So we **cannot**
  assume a contactable address for any leaguemate.
- **Therefore the PRIMARY invite paths are (1) a shareable copy-link and (2) phone-number / SMS** that the *inviter*
  supplies (they know their leaguemates' numbers; the provider doesn't). **Auto-email is a fallback used only when
  an email actually exists** for that member (provider-supplied, or entered by the inviter).

### The flow
- **"We found your N leaguemates."** After import, surface the roster of OTHER members
  (`listLeaguemateInviteTargets` — already excludes self + already-claimed), each with display name, team name(s),
  and a **suggested channel**: `email` iff a real email is known for that member, else `sms`/`share`.
- **Per-leaguemate channel choice (bulk-capable).** For each target the inviter picks one of:
  - **Share link** (primary, zero external services): generate `/invite/{leagueId}/{token}`, copyable, works
    offline. This is the "distributed via a link" product bar — the inviter drops it in the league's group chat.
  - **SMS** (primary, contact-supplied): inviter enters the leaguemate's phone number; we send via `Notifier`
    (mock-recorded). Number is normalized + hinted (`***1234`), **never stored in cleartext** beyond the hashed
    `target_hash` + `target_hint` already in `league_invites`.
  - **Email** (fallback, only where present): prefilled if the provider/inviter supplied one; otherwise the inviter
    may type one. Sent via `Notifier` (mock-recorded).
- **One link covers the group too.** The share link is **roster-aware but not single-use-locked to a destination**:
  anyone who opens it claims an *unclaimed* team in the league (see §C). A per-target token can be minted for
  precision (SMS/email), and a general league share link works for the group-chat drop.
- **Idempotent + revocable.** Re-inviting the same target/channel upserts (existing
  `onConflictDoUpdate` on `league_id, provider, provider_member_id, channel, target_hash`); an accepted target
  flips off active links for that member (existing behavior — keep). Canceling is supported via invite status.
- *Accept:* given the `95050` fixture roster, the UI lists every non-self member with a per-member channel choice;
  generating a share link is instant and offline; an SMS invite hits `Notifier.sendSms` (recorded, not sent) with
  the inviter-supplied number; an email invite hits `Notifier.sendEmail` only when an email is supplied; no member
  is shown a "we'll email them" affordance when no email exists.

## C. Claim-your-team — the invitee experience
**Outcome:** an invited leaguemate opens the link, signs up, and **claims their specific team** — mapping them to
the imported provider-member — and lands in the right league with their team pre-associated.

- **Open → preview.** The public `/invite/[leagueId]/[token]` landing (existing `getLeagueInviteLanding`) shows,
  pre-auth: the league name, season, the invitee's display name, and **their team name(s)** — "You're [Manager],
  the [Team]. Your league is on Rumbledore." Queried under `withLeagueContext()` with explicit `league_id` + token
  (per `AGENTS.md` invite rules). Expired/canceled/accepted-by-another → clean not-found, no leak.
- **Sign up → claim.** After auth, accepting (existing `acceptLeagueInvite`) does, atomically:
  1. grants auth-plane `members.role='member'` for the league,
  2. writes the RLS-scoped `league_member_identity_claims` row mapping `user_id → {provider, providerMemberId,
     providerTeamIds}` — the **claim** that binds the human to the imported provider-member,
  3. flips the invite (and sibling links for that member) to `accepted`.
- **Claim integrity (keep the existing guards).** A provider-member can be claimed by **one** user; a user holds
  **one** claim per provider in a league; conflicting claims → `CLAIM_CONFLICT` (409), no partial state. Do **not**
  assume provider credential subject ids equal imported provider member ids across providers (per `AGENTS.md`).
- **Open-claim variant (group-chat link).** If a general share link is opened by a signed-up user who is **not** a
  pre-targeted member, present the list of **still-unclaimed** teams in that league and let them pick theirs; the
  pick writes the same claim. (Targeted links pre-fill the team; open links ask.) Same conflict guards apply.
- *Accept:* opening a valid fixture token shows the correct team pre-auth; accepting maps the user to the right
  imported `fantasy_member` + team, joins the league, and is idempotent (re-accept by the same user is a no-op, not
  a duplicate claim); a second user accepting an already-claimed member gets `CLAIM_CONFLICT`.

## D. The activation hook — why an invited member stays
**Outcome:** the invitee doesn't land on an empty signup; they land on **a show already about them.** This is the
retention payload of the viral loop — the reason the link converts.

- **Their team is waiting.** On claim, the league home already shows **their** team: standings position, current
  matchup, season record, and (post-history-import) their all-time record and any record-book entries — pulled from
  the substrate (`specs/14`), not generated on the fly. Connecting required nothing of them; their data was already
  imported by the first connector.
- **The cast already wrote about them.** Per North Star, the AI cast is a media universe about *these specific
  people*. The activation surface teases **existing** league content that references the new member's team/manager
  (e.g. a Beat Reporter line, a power-ranking slot, a rivalry note) — "The cast has been covering your league. Here's
  what they said about [Team]." Content is read from existing `content_item` (league-scoped, RLS), never fabricated
  at claim time; if none references them yet, fall back to the league's latest headline + "you're in the next one."
- **Pre-filled identity, zero setup.** No "create your team," no roster entry, no manual mapping — the claim *is* the
  setup. The member's first session is consumption (their team, their records, the cast), not configuration.
- *Accept:* immediately after a fixture claim, the league home renders the claimer's team with a real season record
  and (if history imported) all-time stats; the activation surface returns ≥1 existing league content reference for
  the claimer's team where one exists, and a deterministic fallback (latest league headline) where none does —
  always RLS-scoped to the claimer's league, never cross-league.

## E. Data-steward cleaning — onboarding's thin entry point
`specs/14` §E owns the steward correction flow (identity merge/split/reassign/rename, re-pull, flag review, audit,
sticky `method=MANUAL`, scoped recompute). Onboarding **does not reimplement it** — it provides the *doorway*:

- After import, the commissioner (league owner) may **designate a `data_steward`** (Better Auth role; one or more
  per league, members of *that* league only). Assignment is league-scoped + role-guarded.
- The onboarding "we found your N leaguemates" surface links the steward to the §14 review surface when claims look
  ambiguous — e.g. a member that **identity resolution flagged** (suggested-link band) or a team whose owner mapping
  is contested. Onboarding surfaces the *flag*; §14 owns the *fix*.
- Steward visibility is **strictly their league** (RLS + `WHERE league_id`); no cross-league read/edit, ever; no
  access to raw provider credentials. Every correction (in §14) is audited + reversible.
- *Accept:* a commissioner can assign a `data_steward` scoped to their league; a steward in League A cannot read or
  edit League B (extends the `specs/02` canary); the onboarding surface deep-links a flagged claim to the §14
  steward flow without itself mutating substrate rows.

---

## Interfaces & mocks (unchanged seams — keep mocked)
- **`BrowserSession`** (`src/onboarding/browser-session.ts`): `MockBrowserSession` yields fixture ESPN creds for
  `95050`. **Real Browserbase capture stays out of scope** (later human-paired task). The mock drives the whole
  PRIMARY connect flow deterministically.
- **`InviteNotifier`** (`src/onboarding/notifier.ts`): `sendSms` / `sendEmail`. `RecordingInviteNotifier` records
  sends for assertions; **nothing is sent**. `MOCK_NOTIFIER` (or foundation `MOCK_*`) default ON.
- **Providers** exercised against fixtures (`fixture-espn.ts`, `fixture-yahoo.ts`, Sleeper fixtures); no live calls
  in CI. Email/phone for leaguemates come from the **inviter** or provider payload — never assumed.

## Invariants (must hold)
- **No provider gives reliable contact info** → SMS/share are primary, email is present-only. The UI never implies
  we can email a leaguemate whose email we don't have.
- **Provider credentials/cookies** stay server-side, encrypted, never logged, never returned to the client
  (`specs/04`). Real capture mocked.
- **RLS everywhere:** `league_invites`, `league_member_identity_claims`, discovered-league inventory reads, and
  the activation content read are all league-scoped via `withLeagueContext()` + explicit `league_id`.
- **No domain branch on provider string** — read `capabilities`/row shape (`specs/14` A).
- **Claim mapping** does not assume provider-credential subject id == imported provider member id across providers.

## Acceptance criteria (testable — mock SMS/email/Browserbase + `95050` fixture)
1. **Multi-league, multi-provider discovery.** Connect (mock) → unified inventory returns every discovered league
   across **all** connected providers in one query; a second-provider connect **appends** rows; selecting ≥1
   enqueues its import; re-import is an idempotent no-op join. (`95050` yields ≥1 ESPN row.)
2. **Name-based leaguemate detection.** Given the fixture roster, "we found your N leaguemates" lists **every**
   non-self, non-already-claimed member with display name + team name(s) and a suggested channel that is `email`
   **only** when a real email is known, else `sms`/`share`.
3. **SMS/link invite creation (primary paths).** A share-link invite generates a valid `/invite/{leagueId}/{token}`
   offline (no `Notifier` call); an SMS invite with an inviter-supplied number hits `Notifier.sendSms` (recorded,
   not sent); an email invite hits `Notifier.sendEmail` **only** when an email is supplied. Phone/email are hashed +
   hinted in `league_invites`, never stored cleartext.
4. **Claim-your-team mapping.** Opening a valid token shows the correct team pre-auth; accepting maps the user to
   the imported `fantasy_member`/team, joins the league, and writes one `league_member_identity_claims` row;
   re-accept by the same user is a no-op; a different user claiming the same member → `CLAIM_CONFLICT`; an open
   (non-targeted) link offers only **unclaimed** teams.
5. **Activation hook.** Post-claim, the league home renders the claimer's team with a real season record (+ all-time
   if history imported); the activation surface returns ≥1 existing league `content_item` referencing the claimer's
   team where one exists, and a deterministic fallback otherwise — all RLS-scoped to the claimer's league.
6. **Steward doorway.** A commissioner assigns a league-scoped `data_steward`; the onboarding surface deep-links a
   flagged/ambiguous claim into the `specs/14` §E steward flow without mutating substrate rows itself.
7. **RLS isolation.** A member/steward in League A cannot read or edit League B's invites, claims, discovered-league
   rows, or activation content (extends the `specs/02` canary across every table this spec touches).
8. **Mocks honored.** No real SMS/email/Browserbase call occurs in any test; `RecordingInviteNotifier` and
   `MockBrowserSession` back the entire flow against the `95050` fixture with no external keys.

## Dependencies / blocked-by
- **Builds on** `specs/04` (connect/invite/claim round one — extends, does not replace) and existing
  `src/onboarding/*` + `/invite/[leagueId]/[token]`.
- **Delegates to** `specs/14` §E (steward correction flow, identity audit) and `specs/06` (identity resolution for
  match-back / flagged claims) — onboarding *consumes*, never reimplements.
- **Reads** `specs/05`/`11`/`12` content surfaces (`content_item`) for the activation hook (read-only, RLS-scoped).
- **Needs** Foundation (`specs/02`): Better Auth roles incl. `data_steward`, RLS + `current_league_id()`,
  `MOCK_*` toggles, crypto.

## Non-goals
- Real Browserbase cookie capture, real Twilio/Resend delivery (interfaces + mocks only; later human-paired).
- New connect flows or new providers (ESPN/Sleeper/Yahoo only; `specs/04`/`14` own connect).
- Provider-side contact harvesting beyond what the payload actually exposes (we never scrape or guess emails/phones).
- Steward correction internals, identity-resolution algorithm, stats/records computation (owned by `specs/14`/`06`).
- Real-money / prize mechanics; anything in the betting/arena domain.
