# Spec 43 — UI/UX review fixes (owner critiques of review/increment-1)

> Owner-review fixes. Detailed diagnoses + locations are in `.orchestration/ui-critiques.md` (#1–#6); this is the
> actionable spec with the resolved decisions. Two **file-disjoint** tracks: **U1 = cross-cutting polish**,
> **U2 = league-home + arena layout/IA**. Base/integration branch: `review/increment-1` (off `main`; **`main` is
> never touched**). Read `DESIGN.md` (the heading/treatment authority) + `AGENTS.md` gates. After BOTH tracks
> merge, the orchestrator RE-RUNS the screenshot harness and replaces `docs/screenshots/*` (owner wants the repo
> screenshots up to date).

## Resolved decisions (owner-approved defaults)
- **Page-title treatment:** Michroma via `heading-auspex` (uppercase — parity with all other page titles), **one
  flat card-scale size** (`text-xl leading-tight`, NO responsive `sm:text-3xl`/`text-4xl` size-up). Must never wrap
  to 3 lines on desktop; if `text-xl` still wraps the longest title, drop to `text-lg`.
- **Default route:** signed-in user with **≥1 league → `/news`**; **0 leagues → Your Leagues/connect**; logged-out
  → unchanged `LoggedOutLanding`.
- **In-page nav (#5/#6):** add the in-page **top-card section nav** *within* the league-home and arena pages;
  **keep the existing rail** for now (do NOT remove/restructure the shell rail — that IA call is deferred to the
  owner). Reuse one shared section-nav component across both (and align with the News section pattern).

## Track U1 — Cross-cutting polish
Owns: all page-title `<h1>`s EXCEPT league-home + arena (those are U2), `src/app/page.tsx`, `src/navigation/*`
(notification badge). Do NOT touch `src/app/leagues/[leagueId]/league-home-view.tsx` or `src/app/arena/*` (U2).

- **U1-a [#1+#2] — Standardize page titles.** Every page-title `<h1>` (records, h2h, manager-records, league-home
  header is U2, news hub, you, lore, invite, bet, lore-submit, lore-claim, the 3 onboarding pages, steward views,
  etc. — EXCLUDING league-home + arena) uses **`heading-auspex text-xl leading-tight`** (drop `font-display`/Saira,
  drop `font-medium`, drop `sm:text-3xl`). Result: consistent uppercase Michroma at card-scale, no 3-line wrap.
  **AC:** grep shows no `font-display` on a page-title `<h1>`; all use `heading-auspex text-xl` (or `text-lg` where
  needed); the token-contract test + the heading foundation tests stay green (update any test asserting the old
  classes to the new ones).
- **U1-b [#3] — Default route to global News.** `src/app/page.tsx` `Home()`: for a signed-in user, if they have
  ≥1 league `redirect("/news")`; if 0 leagues, render the Your-Leagues/connect landing as today; logged-out
  unchanged. **AC:** a signed-in ≥1-league fixture redirects `/`→`/news`; a 0-league signed-in user still sees the
  connect landing; logged-out sees `LoggedOutLanding`. (Add/adjust the page test.)
- **U1-c [#4] — Notification badge clip.** The unread `<Badge>` is clipped by `.btn { overflow:hidden }`
  (`globals.css:560`). Move the badge OUT of `<Button>` to a sibling on the wrapper `<div className="relative
  shrink-0">` as `pointer-events-none absolute -top-1 -right-1` so it overlaps the corner. Fix BOTH the desktop
  topbar bell and the mobile top-bar bell. Do NOT change `.btn` overflow (other buttons need it). **AC:** badge
  visually overlaps the button corner (no clip); bell tests stay green; ≥44px target preserved.

## Track U2 — League-home + Arena in-page section nav
Owns: `src/app/leagues/[leagueId]/league-home-view.tsx` (+ its data/section components), `src/app/arena/*`, and a
NEW shared in-page section-nav component (e.g. `src/components/ui/section-tabs.tsx` or similar). Reads
`src/navigation/scope.ts` arena sections (already exist) but does NOT modify the shell rail. Do NOT touch
`src/app/page.tsx` or the other pages' titles (U1).

- **U2-a [#5] — League home → sectioned in-page nav.** Convert the 941-line megapage into a **top-card section
  nav** showing ONE section at a time. Sections (owner order, refine as needed): **Press · This Week (Week-N
  matchups) · Standings · Bankroll · Teams · Record Book · Upcoming** (Press default/first per owner). The existing
  panels (matchup hero, standings, scoreboard, press, bankroll, teams, record book) become the section bodies — no
  feature lost, just navigated instead of stacked. Title uses the standardized treatment (`heading-auspex
  text-xl`). Designed empty/loading states per section. **AC:** league home renders one section at a time via the
  in-page nav; all prior content reachable; no horizontal-stretch cluster; gates + token-contract green.
- **U2-b [#6] — Arena → sectioned in-page nav.** Thin `/arena` to the **main leaderboard** as the default landing
  section; present the rest via the in-page top-card nav using the EXISTING arena sections (**Leaderboard ·
  League-vs-League · Movers · Matchups · Seasons · Rules**). Move the rivalry panel, movement summary, and movement
  charts out of the landing into their sections. Reuse the SAME section-nav component as U2-a. Title standardized
  (`heading-auspex text-xl`; fixes the `text-4xl` outlier + missing `leading-tight`). Single-league empty states
  preserved. **AC:** `/arena` shows the leaderboard + the in-page section nav (not the stacked cluster); each
  section reachable; gates green.

## Global acceptance
All gates green (`AGENTS.md`: typecheck/lint/test/build/ubs/secret-scan/perf:pwa); token-contract + screenshot
fidelity preserved; no file-ownership overlap between U1 and U2. After both merge to `review/increment-1`, the
orchestrator re-runs the screenshot harness and commits the refreshed `docs/screenshots/*`.

## Non-goals / deferred
- No rail removal/restructure (deferred owner IA call). No `main` changes. Mock/$0. Sentence-case titles (owner
  chose uppercase). News-mode demo-seeding (separate optional pass).
