# Spec 10 — Information Architecture & Navigation

> Outcomes spec. Defines WHAT the app's structure and navigation deliver, not HOW each surface is built.
> Embed the North Star: Rumbledore is **not provider plumbing** — it is a league-specific spectacle the members
> star in. The IA's job is to make the *league* the unit of attention and the *provider* a footnote. Round one
> shipped a flat list of routes (`/onboarding/espn`, `/leagues/[id]`, `/news`, `/arena`) that read like a CRUD
> admin panel. This spec restructures those same surfaces into **two clear scopes** so the product feels like a
> living publication you live inside, not a database you query.
> References: `00`–`09` (surfaces this IA organizes), `05` (home/feed), `08` (betting), `06` (records),
> `04`/`03` (onboarding/providers). Real modules: `src/auth/guards.ts`, `src/home/league-home.ts`,
> `src/db/schema.ts` (`leagues`, `members`), `src/providers/ids.ts`.

## Purpose
Give Rumbledore a spine. A user with leagues across ESPN, Sleeper, and Yahoo should experience **one app about
their leagues**, never three provider apps stapled together. Everything resolves to two scopes:

1. **Global scope** — cross-league: an overview of *all your leagues*, the shared central News, the Arena
   (league-vs-league), and You (account). The lobby and the connective tissue.
2. **League scope** — *one* connected league: its Home, The Press, Bet, Records, and Members/Settings. The
   spectacle. This is where the soul lives — about *these specific people*.

The hinge between them is the **league switcher**: every league the user belongs to, across every provider, in
one MRU-ordered list, each tagged with a small **provider badge**. Provider is a *badge, never a nav level* —
that is the entire point.

---

## The two scopes (section taxonomy)

### Global scope (cross-league)
Routes live under the app root; none are league-scoped. Sections:

- **Your Leagues** (`/`) — the landing. Cross-league overview; one **card per league** (see Landing below). The
  lobby you return to.
- **News** (`/news`) — the central NFL/fantasy news hub (`05` central plane, `league_id IS NULL`, open-read).
  Shared by every league; the firehose. Provider-agnostic by definition.
- **Arena** (`/arena`) — league-vs-league + individual paper-betting leaderboards (`08` central arena). The new
  competition axis from the North Star: your league competes with other leagues.
- **You** (`/you`) — account: identity, connected providers + reconnect CTAs, notification/push prefs, installed
  leagues, sign-out. The one place providers are *listed as connections* (a settings concern, not navigation).

Global sections are visible without an active league. News and Arena are open-read; **Your Leagues** and **You**
require an authenticated session.

### League scope (one connected league)
Routes live under `/leagues/[leagueId]/…` and run under that league's RLS context (`app.current_league_id`,
`WHERE league_id = current`). Sections:

- **Home** (`/leagues/[leagueId]`) — the league front page (`05`): standings, scores, weekly movers, storylines,
  activity, upcoming matchups. The glanceable pulse.
- **The Press** (`/leagues/[leagueId]/press`) — the league's media universe: the AI cast's columns + the
  league-tailored feed (`05` league feed, `07`/`09` content). Bylined, sectioned, a *real publication* — not a
  feed of blobs. Individual posts at `/leagues/[leagueId]/press/[postId]`. (Lore/canon — when built — lands here.)
- **Bet** (`/leagues/[leagueId]/bet`) — this league's paper-betting markets, slip, and rolling-minimum bankroll
  (`08`). League-scoped wagering; the Arena (Global) is where leagues are ranked against each other.
- **Records** (`/leagues/[leagueId]/records`) — all-time + season records built from ~10 yrs of history (`06`):
  the league's mythology in numbers. The perennial choker has a page.
- **Members / Settings** (`/leagues/[leagueId]/members`) — roster of members, invite leaguemates (`04` invites),
  and (for `data_steward`+) data-steward cleanup + league settings. Role-gated section.

The active league's section nav is **the same shape regardless of provider** — ESPN, Sleeper, and Yahoo leagues
all present Home / The Press / Bet / Records / Members. A user moving between them feels no seam.

---

## The league switcher (provider silos dissolved)

The switcher is the single control that selects the active league. It is the embodiment of the North Star's
anti-silo stance.

- **One unified list.** ALL of the user's leagues across ESPN, Sleeper, and Yahoo in a single list — sourced from
  `listLeagueMembershipsForUser` (`src/auth/guards.ts`) joined to `leagues` (`src/db/schema.ts`) for each
  league's `name`, `logo`, and `provider`. No provider sub-menus, no per-provider screens.
- **MRU-first ordering.** Most-recently-used league at top (active-league selection updates recency). Ties and
  never-opened leagues fall back to alphabetical by `name`. The user's *current* mental model — "the league I was
  just in" — wins over how the data was connected.
- **Per-row anatomy:** league **avatar** (`leagues.logo`, falling back to a generated monogram from `name`), the
  league **name**, and a small **provider badge** (ESPN / Sleeper / Yahoo, from `leagues.provider`,
  `src/providers/ids.ts`). The badge is a quiet adornment (icon/short label), never a heading the list is grouped
  under by default.
- **Group-by-provider toggle (opt-in, for scale).** A user with many leagues can toggle a grouped view (sections
  per provider) — but the **default is the flat MRU list**. Grouping is a convenience filter, not the primary
  structure; toggling it never changes routing or scope semantics.
- **Search.** A filter box matches league `name` (and provider label) for users with many leagues. Substring,
  case-insensitive.
- **Connect-a-league affordance.** The switcher ends with "Connect another league" → onboarding entry (`04`),
  surfacing all three providers as connect *options*, not nav destinations.

The switcher is reachable from both scopes: in Global it sits above Your Leagues; in a League it shows the active
league at the top of the section nav and opens the same list to jump elsewhere.

---

## Landing (open app → the lobby)

Opening the app (authenticated, ≥1 league) lands on **Global → Your Leagues** (`/`). Not a marketing page, not a
single league — the cross-league overview, because the product is *plural leagues, one you*.

- **One card per league**, ordered MRU (same ordering as the switcher). Each card shows:
  - league **avatar** + **name** + **provider badge**;
  - **this week's matchup** for the user's team — opponent + live/most-recent score (`05` scores / `home`
    data via `src/home/league-home.ts`);
  - the **latest headline from that league's Press** (most recent league-scoped `blog`/feed item, `05`/`09`) —
    the league's own media, teasing the spectacle.
- Tapping a card → that league's **Home** (`/leagues/[leagueId]`), setting it active (and bumping MRU).
- **Empty state** (authenticated, zero leagues) → a connect prompt (the three providers as connect options),
  i.e. onboarding (`04`). **Logged-out** → marketing/connect entry; News and Arena remain open-read.

The card's matchup-score + Press-headline pairing is deliberate: the **data substrate** and the **spectacle**
side by side, per league, at a glance — the whole product in one tile.

---

## Responsive navigation patterns

Same IA, two presentations. Both expose the *current scope's sections* + the switcher; neither ever exposes
provider as a navigation level.

### Mobile (primary; mobile-first per `00`)
- **Bottom tab bar** = the **current scope's sections**.
  - In Global: Your Leagues · News · Arena · You.
  - In a League: Home · The Press · Bet · Records · Members.
- **Top bar** shows the **current scope name** (the active league's name + provider badge, or "Your Leagues"):
  tapping it opens the **switcher sheet** (bottom sheet) — the unified MRU list + search + group toggle. Selecting
  a league swaps the active scope and the bottom tabs in place.
- A clear path back to Global (e.g. a "Your Leagues" affordance in the switcher sheet) is always one tap away.

### Desktop / tablet
- **Persistent left sidebar** with three stacked zones, top→bottom:
  1. **Global items** (Your Leagues · News · Arena · You) — always present.
  2. **League switcher** (active league surfaced; opens the unified list).
  3. **Current league's sections** (Home · The Press · Bet · Records · Members) — present only when a league is
     active; otherwise this zone is empty/collapsed.
- **Tablet:** the sidebar is **collapsible** (icon-rail ↔ expanded); collapsed state keeps every destination
  reachable via icon + tooltip. Content area is parity with desktop, not a reduced feature set (`05`).

Active state (which scope + which section) is reflected in nav on every breakpoint.

---

## Active-scope state & routing

- **Active scope is derived from the URL**, not hidden client state: any `/leagues/[leagueId]/…` path ⇒ League
  scope with that league active; everything else ⇒ Global. This makes deep links and refreshes correct by
  construction and keeps the switcher honest.
- **MRU** is persisted per user (server-side, e.g. a `last_opened_at` per membership or equivalent) so ordering
  survives reloads and is consistent across devices; it updates whenever a league becomes active.
- Selecting a league in the switcher **navigates** to that league's Home (or preserves the current section type
  when sensible). League scope never bleeds across leagues — switching fully replaces the active-league context.

---

## Current state → new IA (migration map)

What EXISTS now (flat routes from `git ls-files src/app/**/page.tsx`) → where it lands:

| Current route | New IA placement |
|---|---|
| `src/app/page.tsx` (link hub) | **Global → Your Leagues** (`/`) — becomes the cross-league card overview, not a link list. |
| `src/app/news/page.tsx` | **Global → News** (`/news`) — unchanged route, now a Global section. |
| `src/app/arena/page.tsx` | **Global → Arena** (`/arena`) — unchanged route, now a Global section. |
| `src/app/leagues/[leagueId]/page.tsx` | **League → Home** — unchanged route, now a League section under the league shell. |
| `src/app/leagues/[leagueId]/feed/page.tsx` | folds into **League → The Press** (`/press`); `/feed` redirects (or re-homes) there. |
| `src/app/leagues/[leagueId]/posts/[postId]/page.tsx` | **League → The Press** post detail (`/press/[postId]`); old path redirects. |
| `src/app/leagues/[leagueId]/invite/page.tsx` | **League → Members/Settings** (invite leaguemates lives under Members). |
| `src/app/onboarding/{espn,sleeper,yahoo}/…` | reached only via **Connect another league** (switcher / empty state) — providers as connect *options*, not nav. |
| `src/app/invite/[leagueId]/[token]/page.tsx` | unchanged (public invite preview, pre-membership; outside the nav shells). |
| `src/app/offline/page.tsx` | unchanged (PWA fallback, outside shells). |

New surfaces introduced by this IA: **Global → You** (`/you`, account/providers) and **League → Records**
(`/leagues/[leagueId]/records`, surfacing `06`) and **League → Bet** (`/leagues/[leagueId]/bet`, surfacing `08`)
as first-class sections rather than implicit features. No provider-named route ever appears as a nav level.

Implementation shape (informative, loop decides specifics): a Global nav shell (root `layout.tsx`) and a League
nav shell (`src/app/leagues/[leagueId]/layout.tsx`) carry the responsive nav; section pages render inside them.

---

## Auth / RLS / isolation

- **Global sections:** Your Leagues + You require `requireSession` (`src/auth/guards.ts`). News + Arena are
  open-read (central plane, no league context).
- **League sections:** every `/leagues/[leagueId]/…` surface passes through `requireLeagueRole`
  (`src/auth/guards.ts`, `minRole: "member"`; Members/Settings steward area requires `data_steward`+) and runs
  under that league's RLS context. The nav shell never assumes membership the guard hasn't confirmed.
- **The switcher only ever lists leagues the user is a member of** — built from `members` via
  `listLeagueMembershipsForUser`; it can never reveal or route to a league the session lacks. No cross-league
  data appears in any League surface (foundation isolation canary, `02`/`05`, still holds).
- Provider is metadata on `leagues` (`provider`, `src/providers/ids.ts`); it is read for the *badge* only and is
  never a security boundary or a routing key.

---

## Acceptance criteria (testable)

Gate-verifiable (routing / guards / state — `pnpm test`, e2e):
1. **Scope derivation** — any `/leagues/[leagueId]/…` path resolves to League scope with that league active; any
   other path resolves to Global. Deep-linking a league section refreshes into the correct active scope.
2. **Section taxonomy present** — Global exposes exactly Your Leagues · News · Arena · You; an active League
   exposes exactly Home · The Press · Bet · Records · Members. No provider-named nav node exists at any level.
3. **Guards enforced** — Your Leagues/You without a session → auth required; a league section for a
   non-member → 403/forbidden (via `requireLeagueRole`); Members/Settings steward area requires `data_steward`+.
   News/Arena reachable logged-out.
4. **Switcher correctness** — given a user with ESPN + Sleeper + Yahoo memberships, the switcher lists **all** of
   them and **only** them, each with the correct provider badge; ordering is MRU-first (most-recently-active on
   top), search filters by name, and the group-by-provider toggle regroups without changing the active scope.
5. **MRU updates** — opening a league moves it to the top of both the switcher list and the Your Leagues cards on
   next render; MRU persists across reloads.
6. **Landing** — authenticated with ≥1 league lands on `/` rendering one card per league (MRU-ordered) with
   avatar + name + provider badge + this-week matchup score + latest Press headline; zero-league → connect
   prompt; logged-out → marketing/connect with News/Arena still open.
7. **Migration** — old paths still resolve: `/leagues/[id]/feed` and `/leagues/[id]/posts/[postId]` reach The
   Press / Press post (redirect or re-home); `/`, `/news`, `/arena`, `/leagues/[id]` continue to work.
8. **Responsive nav present** — mobile renders a bottom tab bar of the current scope's sections + a top-bar scope
   name that opens the switcher sheet; desktop/tablet renders the persistent left sidebar (Global + switcher +
   active league's sections), collapsible on tablet. (Presence/structure + active-state assertable in tests;
   visual polish is the human pass.)

Needs the later human UI pass (not gate-verifiable here):
- The *feel* of "a real publication" in The Press, the exact card composition/density of Your Leagues, sheet vs
  rail animation, badge styling, icon-rail tooltips, and final spacing/typography. This spec fixes the
  **structure and the rules**; taste is tuned with a human in the room (per North Star "surface soul later" and
  AUSPEX-fidelity per `docs/design/rumbledore-design-language.md`).

---

## Dependencies / blocked-by
- **`02` Foundation** — app skeleton, layouts, RLS helper, design tokens (hard prereq).
- **`05` Feeds & Home** — supplies Home + The Press content and the per-card matchup/headline data.
- **`06` Records**, **`08` Betting/Arena** — supply the Records / Bet / Arena sections.
- **`04` Onboarding / `03` Providers** — supply the connect entry + `leagues.provider`/`logo` for switcher badges.
- **`src/auth/guards.ts`** — `requireSession`, `requireLeagueRole`, `listLeagueMembershipsForUser` (switcher + guards).

## Non-goals
- Defining HOW any section's content is produced (owned by `05`–`09`).
- Provider-specific navigation, screens, or sub-menus of any kind (explicitly forbidden — the anti-silo wedge).
- In-section IA details (tabs *within* Home/Press/Bet), search across content, comments/reactions, theming.
- Final visual design, motion, and voice tuning (human UI pass).
