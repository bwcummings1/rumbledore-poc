# Spec 39 — News & Arena as Self-Contained Environments (own in-context nav)

> Outcomes spec. Makes **News** and **Arena** first-class, self-contained navigation environments — the same
> isolated-environment pattern as the league portal — each with its **own in-context section nav**. Read
> `docs/NORTH-STAR.md` first; `DESIGN.md` is a hard gate. Extends `specs/30` (app shell & nav) and `specs/10`
> (IA/scopes); builds on `specs/21` (central news — EXISTS) and `specs/15` (competition arena — EXISTS). Lives in
> `src/navigation/*`, `src/app/news/*`, `src/app/arena/*`, `src/news/*`.
> **Track B opener** (`ORCHESTRATION.md`). `specs/40` (news pipeline + wire toggle) builds on this.
> Real modules (EXISTS — extend, do NOT rebuild): `src/navigation/navigation-shell.tsx`, `src/navigation/scope.ts`,
> `src/navigation/use-active-navigation-state.ts`, `src/app/news/page.tsx` + `src/app/news/[section]/page.tsx` +
> `news-hub-view.tsx`, `src/news/sections.ts`, `src/app/arena/*`.

## Why this spec exists (the soul / the problem)
The owner validated the league portal as an **isolated environment** — open a league and it's its own world with
its own section nav (Home · The Press · Bet · Records · Lore · Members). That's the model that scales the same for
1 league or 20. Today, though, **News and Arena are flat top-level items in the Global scope** (`specs/30 §A`:
*Your Leagues · News · Arena · You*) — vague "central" blobs the owner found confusing. They have content but no
*place* with internal structure.

This spec elevates News and Arena into the **same self-contained-environment pattern**, so the navigation
principle is **universal across the three environment types — League / News / Arena**: each is its own world with
its own in-context nav of 5–10 subsections. News gets FantasyPros-style subsections; Arena gets a
main-leaderboard **landing** plus subsections (nothing overcrowded). **Single-league-first**: both must read
coherently for a one-league (or zero-league) user, never "you're missing the point."

---

## A. The environment model (extend the scope model)
- **Today** (`specs/30 §A`, `specs/10`): two scopes — **Global** (flat: Your Leagues · News · Arena · You) and
  **League** (its own section nav). `deriveActiveNavigationState` (EXISTS) derives scope from the URL.
- **NEW:** promote **News** and **Arena** to first-class **environments** (scopes), each with its **own section
  list**, exactly like League. The shell's rail/bottom-tabs render the **current environment's** sections.
- **Scope derivation (extend `deriveActiveNavigationState`):** `/news/*` → **News** scope (News sections);
  `/arena/*` → **Arena** scope (Arena sections); `/leagues/[id]/*` → **League** (unchanged); `/` and `/you` →
  **Global**. Provider stays a badge, never a nav level (`specs/30`).
- **The universal principle:** every top-level environment is self-contained with its own in-context nav; moving
  between Global ↔ a League ↔ News ↔ Arena swaps the rendered section set in place.

## B. News environment (sections)
- **EXISTS:** `/news` + `/news/[section]` routes, `news-hub-view.tsx`, and `src/news/*` (`article`, `blog-post`,
  `front`, `composite`, `sections.ts`). Subsections partly exist — they're not yet a *formalized environment nav*.
- **NEW:** a defined, **data-driven** set of News subsections (FantasyPros-style reference), e.g. **Front/Headlines
  (landing) · Players · Rankings · Start/Sit · Injuries · Waivers · Analysis** — exact taxonomy is a content-IA
  choice (human-pass tunable); spec a sensible default in `src/news/sections.ts` and render it as the News
  environment's nav. Each subsection is a `/news/[section]` route with its own AUSPEX view; **Front** is the
  landing.
- **Single-league/graceful:** News is global content; it reads identically regardless of league count.
- **Boundary:** the news *ingestion pipeline*, entity-tagging, and the wire's general↔personal feed are
  **`specs/40`**. This spec defines News as a browsable environment with its own nav; `specs/40` fills it with
  sourced, tagged content and wires the ticker.

## C. Arena environment (sections)
- **EXISTS:** `/arena` — the cross-league aggregate leaderboard + movement board (`specs/15`), today a single view.
- **NEW:** Arena becomes a self-contained environment: a **main-leaderboard landing** (the main attraction —
  league-vs-league + individual standings) plus subsections via its own nav, e.g. **Leaderboard (landing) · League
  vs League · Movers · Matchups/H2H · Seasons/History · Rules** (taxonomy human-pass tunable). The landing is the
  leaderboard + entry points — **don't overcrowd it**; everything else is a `/arena/[section]` route.
- **Single-league/graceful (MANDATE):** a one-league user still gets meaningful Arena content (their league's
  standing among others; the individual board) with designed solo/empty states — never a page that assumes 5–10
  leagues.

## D. Shell integration (the nav extension)
Extend the shell (`specs/30`) so the **rail** (desktop), **bottom-tabs** (mobile), and the **scope chip/switcher**
present News and Arena as environments with their own sections — not flat Global links:
- `deriveActiveNavigationState` gains News + Arena scopes with section lists; the rail/tabs render the **active
  environment's** sections; active section = **lilac bar + shape** + `aria-current="page"` (`specs/30` treatment);
  group label in `.eyebrow`.
- Mobile bottom-tabs render the environment's sections; News/Arena may exceed 4 sections — handle overflow the way
  League's 6 are handled (`--nav-count` grid + short labels) or a "More" affordance; ≥44px targets.
- The scope chip/switcher exposes Global ↔ League ↔ News ↔ Arena; the shell frame never blanks; content parity
  across breakpoints (`specs/30 §B`).
- **AUSPEX-faithful** per `DESIGN.md` (token-contract test passes; no generic surfaces) — built in the design
  language from the start, not swept later.

## E. EXISTS vs NEW (build ledger)
- **EXISTS — restyle/extend:** the shell (`navigation-shell`, `scope.ts`, `deriveActiveNavigationState`, rail/tabs/
  switcher); `/news` + `/news/[section]` + `news-hub-view` + `src/news/sections`; `/arena` + the arena view
  (`specs/15`).
- **NEW — design + build:** News + Arena as first-class scopes/environments in the scope model; their section
  lists + nav rendering in the shell; the **Arena landing + subsection routes**; the **defined News subsection set
  + routes**; graceful single-league/solo states for both; the AUSPEX nav treatment for the new environments.

## F. Acceptance criteria (testable)
Gate-verifiable (`pnpm test`, e2e, axe):
1. **Scope derivation.** `/news/*` derives News scope with its sections; `/arena/*` derives Arena scope with its
   sections; `/leagues/[id]/*` still League; `/` and `/you` Global (extends `specs/30` tests).
2. **Environment nav renders.** In News scope the rail/tabs show the News sections; in Arena scope the Arena
   sections; active section = lilac+shape + `aria-current`; content parity across the three breakpoints.
3. **News subsections.** Each defined News subsection has a route + AUSPEX view reachable from the News nav; Front
   is the landing.
4. **Arena environment.** `/arena` landing renders the main leaderboard; each defined subsection has a route
   reachable from the Arena nav; the landing is not overcrowded (leaderboard + entry points only).
5. **Switching environments.** Moving Global ↔ League ↔ News ↔ Arena swaps the rendered section set in place via
   the scope chip/switcher.
6. **Graceful single-league.** A one-league (and a zero-league) user sees coherent News + Arena environments with
   designed solo/empty states, never a broken or "missing the point" page.
7. **A11y.** Per-environment `<nav aria-label>` landmark, keyboard nav, ≥44px targets, AUSPEX focus bloom — matches
   `specs/30` mandates; axe clean on `/news`, `/arena`, and their sections.
8. **Gates green + fidelity.** `pnpm typecheck/lint/test/build`, `secret-scan`, `ubs` pass; the new surfaces hold
   AUSPEX fidelity per `DESIGN.md` (token-contract test green; screenshots).

### Needs the later human pass (not gate-verifiable)
The exact News subsection taxonomy (which FantasyPros-style sections, in what order) and the Arena subsection set +
landing composition are content-IA choices tuned with the owner. This spec fixes the **environment pattern,
routing, shell integration, states, a11y, and the AUSPEX mapping**.

## Dependencies / blocked-by
- **Extends** `specs/30` (shell — scope model + nav rendering) and `specs/10` (IA). **Builds on** `specs/21`
  (central news — EXISTS) and `specs/15` (arena — EXISTS).
- **Feeds** `specs/40` (news pipeline + wire toggle — content + ticker for the News environment).
- **Coordination** (`ORCHESTRATION.md §3`): Track B owns `src/navigation`; Track C's ambient agent (`specs/41`)
  mounts into the shell **after** this lands.

## Non-goals
- The news **ingestion pipeline**, entity-tagging, and the general↔personal **wire toggle** (→ `specs/40`).
- The cross-league arena **computation/standings logic** (`specs/15` EXISTS — this dresses it as an environment,
  it does not recompute it).
- Changing IA semantics for League/Global beyond adding News + Arena as environments (`specs/10`).
- Token/component **definitions** (`specs/28`/`29`) — composed here, not redefined.
