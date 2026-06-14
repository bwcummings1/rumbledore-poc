# Spec 17 — Entitlements & Tiering (gates for the spectacle)

> Outcomes spec. Read `docs/NORTH-STAR.md` first — this spec exists to protect what's there. **NEW scaffolding:**
> there is no entitlement/tier/plan/subscription code in `src/` today (verified). This spec adds the **gate layer** that
> decides who gets the expensive part of the product. **No payments here** — no Stripe, no checkout, no billing webhooks,
> no proration. Pricing numbers are **TBD** and live in config. This builds the *enforcement* (who is allowed) and the
> *graceful locked state* (what an un-entitled user sees), so the moment a payment system lands later it only has to flip
> an entitlement row. The loop chooses HOW; the invariants below are fixed.

## Why this exists (soul, not a paywall for its own sake)
The North Star is explicit: the **data substrate is the bedrock**, but the **AI cast/spectacle is the soul and the
premium value**. The cast is also the *expensive* part — Anthropic calls, web grounding, embeddings, the eval judge,
recurring cadence jobs that run every week per league. If every league gets unlimited cast output for free, the product
cannot exist economically and the spectacle becomes the thing we ration by accident (degrading quality to save money).
So the rule is deliberate: **a league can always store and explore its full history for free** (the bedrock is a
non-negotiable public good of the product), and **the cast/spectacle sits behind a premium tier**. An individual can buy
a **personal AI agent** that follows *their* teams across every league they're in. This spec makes those boundaries real
and enforced **server-side**, before any expensive AI work runs — never as a client-side hint a curl can bypass.

## The three tiers (pricing TBD; these are capability sets, not prices)
1. **FREE league** — the bedrock. Connect any provider, ingest full history, ongoing recording, stats/records, the
   publication *reading* surface, league membership/roles/lore *viewing*. **No AI cast generation.** A free league is a
   faithful, living archive — it just doesn't have a media universe performing on top of it yet.
2. **PREMIUM league** — everything in FREE **plus the AI cast/spectacle**: persona generation, the content cadence
   (cron + event-driven), the instigator engine (polls/villains/manufactured rivalries), lore *canonization driven by
   the cast*, and the league-tailored authenticity engine. This is the layer the North Star calls "the soul."
3. **INDIVIDUAL** — a **per-user** entitlement (not per-league): a personal AI agent that acts for *this user's own
   teams* across **all** leagues they belong to — cross-league summaries, "your week" briefings, your-team betting
   advisory — independent of whether any given league is premium. A free-league member with INDIVIDUAL still gets their
   personal agent inside that league, but **not** the league-wide cast (that's the league's entitlement, not theirs).

Tiers are **additive capability sets**, never mutually exclusive: a user can hold INDIVIDUAL while a league they're in
is PREMIUM. Resolution is per-capability (below), not "pick one tier."

## The entitlement model (where it lives, and why)
Two scopes, deliberately stored in two planes (consistent with `AGENTS.md`: Better Auth owns the auth plane;
league-scoped domain data lives under RLS):

- **Per-league entitlement** → **auth plane** (alongside `leagues`/`members`/`organizations`, **no restrictive RLS** —
  same reasoning as membership: a gate check must be answerable *before* a league RLS context is opened, and jobs resolve
  it outside any single league transaction). NEW table `league_entitlements` keyed by `league_id` (FK → `leagues.id`,
  cascade): `tier` (`free` | `premium`), `status` (`active` | `expired` | `suspended`), `source`
  (`granted` | `comp` | `dev` | `purchased`-reserved-for-later), `caps_override` JSONB (nullable; per-league cap
  overrides), `expires_at` (nullable), `granted_by` (nullable user id), timestamps. A league with **no row resolves to
  FREE** (default-deny for premium capabilities). One row per league (unique on `league_id`).
- **Per-user entitlement** → **auth plane**, keyed by `user_id` (FK → `users.id`, cascade). NEW table
  `user_entitlements`: `tier` (`individual` reserved; default none), `status`, `source`, `expires_at`, `granted_by`,
  timestamps. No row → user has **no** personal agent. One row per user.

Both tables are **append-friendly but mutable** (status/expiry flip on lifecycle changes); a small append-only
`entitlement_events` audit row records every grant/revoke/expire with actor + reason (mirrors the lore/audit pattern
used elsewhere). **No price, no payment id, no card data** on any of these — `purchased` source is reserved as a string
value only.

### Capability resolution (the one function everything calls)
A single server-only resolver is the **only** sanctioned way to check entitlement:

```
resolveEntitlement({ db, leagueId?, userId?, capability }) -> { allowed: boolean; reason: EntitlementReason; tier }
```

- `capability` is an enum (below), not a free string.
- It reads the relevant auth-plane row(s), applies `status`/`expires_at` (expired or suspended ⇒ treated as FREE/none),
  applies the **dev/admin override** (below) first, and returns a **typed reason** so callers can render the right
  locked-state copy (`ENTITLED`, `TIER_REQUIRED`, `EXPIRED`, `CAP_EXCEEDED`, `SUSPENDED`, `DEV_OVERRIDE`).
- It is **pure-ish + injectable** (takes `db`, like the auth guards in `src/auth/guards.ts`) so it's unit-testable with
  a fake db, and a thin route/job wrapper resolves `db` per-request (never at module scope — `getEnv()`/`getDb()` rule).
- Resolution precedence: **dev override → suspended/expired (deny) → explicit tier row → default (FREE/none)**.

## The capabilities (what is gated)
A typed `EntitlementCapability` enum. Each maps to a scope (league or user) and a tier requirement:

| Capability | Scope | Requires | Gate point (where it's enforced) |
|---|---|---|---|
| `ai.cast.generate` | league | PREMIUM | `generateLeagueBlogPost` (`src/ai/pipeline.ts`) — refuse before any LLM/web/embed call |
| `ai.cadence.schedule` | league | PREMIUM | content cadence planners (`src/jobs/content-planning.ts` + cron/trigger fns) — skip enqueue |
| `ai.instigator` | league | PREMIUM | instigator engine (polls/villains/rivalries) |
| `ai.lore.canonize` | league | PREMIUM | cast-driven lore canonization (member-authored lore *viewing/voting* stays FREE) |
| `ai.individual.agent` | user | INDIVIDUAL | the personal cross-league agent pipeline |
| `arena.advanced` | league | PREMIUM *(advisory)* | advanced/inter-league arena surfaces *if* gated; base paper-betting stays FREE |

**FREE always includes:** all ingestion/history/stats/records, publication *reading*, membership/roles, member-authored
lore submission + voting, base paper-betting bankroll. The **gate only ever stands between a user and the expensive AI**,
never between a league and its own data. (Arena gating is marked advisory: `08-betting.md`'s base bankroll/arena is not
gated; only an explicitly-premium advanced tier would be, and the spec for that is TBD — wire the capability, default it
to allowed unless a config flag turns the gate on.)

## The gates (server-side enforcement, fail graceful)
1. **AI content pipeline** (`src/ai/pipeline.ts`). `generateLeagueBlogPost` resolves `ai.cast.generate` for
   `input.leagueId` **before** retrieving context / calling the LLM / web grounding / embeddings. If not allowed it
   **does not** run the expensive path: it returns a typed result `{ status: "blocked", reason }` and records an
   `ai_generation_runs` row with status `blocked_entitlement` (so it's observable and idempotent), and emits **no**
   `blog.published`/push. No partial spend, no exception that 500s a page.
2. **Cadence/job layer** (`src/jobs/content-planning.ts` + `functions/content-plan-*`). Planners resolve
   `ai.cadence.schedule` per league **before fanning out** `content.generate` events — a free league produces **zero**
   generation events (cheaper than producing-then-blocking, and keeps queues clean). The per-post pipeline gate (1) is
   the **defense-in-depth backstop** so a stray/replayed event still can't spend. Jobs resolve entitlement outside any
   single league RLS transaction (auth-plane read).
3. **Individual agent pipeline.** Resolves `ai.individual.agent` for the acting `user_id` before doing cross-league
   work; same blocked-result + audit shape.
4. **Read/UI surfaces.** Pages never crash on a gated capability. A gated feature renders a deliberate **locked state**
   ("Unlock the cast for your league" / "Get your personal agent") driven by the resolver's typed `reason`, with the
   data substrate (standings, history, records, reading) **fully visible underneath**. A `<FeatureGate capability=…>`
   server-resolved boundary is the sanctioned UI wrapper; the client never receives a bypassable boolean it can flip —
   the server renders either the feature or the locked CTA.

**Graceful invariant:** an un-entitled request is *never* a 500, a blank page, or a half-rendered feature. It is either
a clear locked CTA (UI) or a typed `blocked` result (pipeline/job). The substrate is always reachable.

## Configurable caps (values TBD — config, not magic numbers)
Caps live in **config**, read via `getEnv()` (a new validated `entitlements` config block; defaults are placeholders,
overridable, and a league's `caps_override` JSONB wins when present). Examples (numbers are illustrative TBD):

| Cap | Scope | Default (TBD) | Enforced where |
|---|---|---|---|
| `aiPostsPerWeek` | per-league (premium) | e.g. 25 | cadence planner counts this week's `ai_generation_runs`; over cap ⇒ skip with `CAP_EXCEEDED` |
| `maxPremiumLeaguesPerUser` | per-user | e.g. unlimited/null | resolver when a user holds many premium leagues (advisory) |
| `individualLeaguesCovered` | per-user (individual) | e.g. 10 | individual agent fan-out caps leagues processed |

Cap enforcement returns the same `CAP_EXCEEDED` reason and the same graceful behavior (skip generation, render a
"weekly limit reached" note) — never an error. Caps are checked against **counts the system already records** (e.g.
`ai_generation_runs` rows for the league+week), no new spend to measure spend.

## Dev / admin override (keep all-mocks dev unblocked)
The build runs all-mocks and the loop must never be blocked by a paywall:

- A `getEnv().entitlements.devOverride` flag (default **ON in dev/test**, **OFF in production**) makes
  `resolveEntitlement` return `allowed: true` with reason `DEV_OVERRIDE` for **every** capability, before any row lookup.
  This is the single switch that keeps e2e/eval/local runs flowing without seeding entitlement rows.
- An **admin grant** path (server action / internal route, guarded by an app-admin check — *not* a league role) can
  write/flip `league_entitlements` / `user_entitlements` rows and the `entitlement_events` audit. This is how comps and
  manual grants happen today (and how the future payment system will write rows). No self-serve upgrade endpoint that
  grants without going through this path — a client cannot grant itself.
- The override is **explicit and observable**: when it's the reason a capability passed, the result/audit says
  `DEV_OVERRIDE`, so production can assert it's never the reason there.

## What this touches (so the loop knows the blast radius)
- **Auth plane** (`src/db/schema.ts`, `src/auth/*`): two new auth-plane tables + audit, no restrictive RLS, resolver
  modeled on `src/auth/guards.ts` (injectable `db`, `Result`-returning).
- **AI** (`src/ai/pipeline.ts`): the per-post gate + `blocked` result + `ai_generation_runs` blocked status.
- **Jobs** (`src/jobs/content-planning.ts`, `functions/content-plan-*`): planner-level gate + cap counting.
- **Config** (`src/core/env/schema.ts`): new validated `entitlements` block (devOverride + cap defaults).
- **UI**: `<FeatureGate>` server boundary + locked-state copy keyed by typed reason.

## Acceptance (testable; mock LLM, live-DB integration where DB is touched)
1. **Gated AI blocked without entitlement.** With dev override OFF and a FREE league (no row),
   `generateLeagueBlogPost` returns `status: "blocked"`, reason `TIER_REQUIRED`, writes an `ai_generation_runs` row with
   status `blocked_entitlement`, makes **zero** LLM/web/embedding mock calls, and emits no `blog.published`/push.
2. **Runs with entitlement.** Same league granted PREMIUM (`active`) ⇒ the pipeline runs the full path and publishes —
   proving the gate is the only difference.
3. **Cadence produces nothing for free leagues.** With override OFF, the content planner over a mixed set of leagues
   emits `content.generate` events for the PREMIUM league(s) only and **zero** for FREE league(s); a replayed event for
   a free league still hits the pipeline backstop and blocks (defense-in-depth proven).
4. **Per-league vs per-user resolution.** A FREE league whose member holds INDIVIDUAL: `ai.cast.generate` for the league
   ⇒ blocked; `ai.individual.agent` for that user ⇒ allowed. A PREMIUM league whose member has no user entitlement:
   inverse. Proves the two scopes resolve independently.
5. **Caps enforced.** A PREMIUM league at/over `aiPostsPerWeek` for the current week ⇒ planner skips with reason
   `CAP_EXCEEDED`, no generation event, no error; under cap ⇒ proceeds. `caps_override` on the league row overrides the
   `getEnv()` default.
6. **Expiry/suspension degrade to FREE.** A PREMIUM row with `expires_at` in the past or `status: suspended` resolves as
   FREE (reason `EXPIRED`/`SUSPENDED`); the league silently loses cast generation but keeps all substrate access.
7. **Dev override unblocks everything.** With `devOverride` ON, every capability resolves `allowed: true` reason
   `DEV_OVERRIDE` regardless of rows — and a test asserts the production env config has `devOverride` OFF.
8. **Admin grant + audit.** The admin grant path flips a league FREE→PREMIUM, writes an `entitlement_events` audit row
   (actor + source + reason), and a subsequent resolve returns `ENTITLED`; a non-admin caller is rejected and writes no
   row. No self-grant endpoint exists.
9. **Graceful UI.** A FREE league's home renders standings/history/records normally with the cast area showing the
   locked "Unlock the cast" CTA (driven by the typed reason) — never a 500 or blank/half-rendered feature.

## Non-goals (explicit)
No Stripe/checkout/billing/webhooks/proration/invoices/card storage. No real prices (config placeholders only). No
gating of the data substrate, base betting, or member-authored lore viewing/voting. No client-trusted entitlement
booleans. Voice/price tuning and the actual purchase flow are later, human-paired steps — this spec only makes the gate
real so that flow has something to flip.
