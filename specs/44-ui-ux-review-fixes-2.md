# Spec 44 — UI/UX review fixes round 2 (owner critiques #7, #8)

> Two focused fixes from owner review of the spec-43 result. **Branch off `main`, merge back to `main`** (new
> posture: keep main current). Read `DESIGN.md`. The previous agent built #5/#6 WITHOUT referencing the existing
> pattern — this spec gives the EXACT references; **reuse existing components, do not invent new ones.** After
> merge, re-run the screenshot harness + replace `docs/screenshots/*`.

## #7 — League-home + Arena section nav must MATCH the league-feed pattern (nav at the bottom of the top card)
**The good pattern (reuse it):** `src/app/leagues/[leagueId]/feed/league-feed-view.tsx` (lines ~95–110) renders
`PublicationMasthead` (`src/components/publication/front-view.tsx:59`) — a top-card `<header className="panel">`
with `eyebrow` + `<h1 className="heading-auspex text-xl">` title + `deck`, and the section nav as
**`TabLinks ariaLabel items={navItems}` at the BOTTOM of that card** (front-view.tsx:105). That bottom-of-top-card
nav is exactly what the owner wants everywhere.

**The wrong thing to remove:** U2's `SectionTabs` panel (`src/components/ui/section-tabs.tsx`) — a separate mid-page
card with `role="tablist"` buttons — used in `league-home-view.tsx:998` and the arena view. The owner calls this
"a card in the middle with buttons … kinda stupid." Remove that presentation.

**Fix:**
- In `src/app/leagues/[leagueId]/league-home-view.tsx` and `src/app/arena/arena-leaderboard-view.tsx`, present the
  section nav as **`TabLinks` at the bottom of the page's top header card** (reuse `TabLinks` from
  `src/components/publication/front-view.tsx`; or reuse `PublicationMasthead` directly if it fits). Match
  league-feed's look exactly.
- Keep the in-page section-switching behavior (the sections are in-page, not separate routes) — but render the
  selector as the bottom-of-top-card `TabLinks`, not the `SectionTabs` panel. If `TabLinks` is link-only and these
  are in-page tabs, either (a) extend `TabLinks` to support a button/onClick variant, or (b) build the selector to
  visually MATCH `TabLinks` exactly. Prefer reusing/extending the existing component over a new one.
- If `src/components/ui/section-tabs.tsx` ends up unused, delete it (+ its test).
- Title stays `heading-auspex text-xl leading-tight`.
- **AC:** league-home and arena render the section nav at the bottom of the top card, visually identical to
  league-feed; no mid-page selector card; all sections reachable; no feature lost; gates + token-contract green.

## #8 — Wire general↔personal toggle: move to the top bar, make it a compact icon toggle
**Now:** a chunky "GENERAL / PERSONAL" segmented control inside the wire strip (`navigation-shell.tsx`,
`data-slot="wire-mode-toggle"` ~1336). Owner: "looks pretty silly … should just be a toggle … in the top bar,
probably to the right of the search button … like icons … one side personal, one side global."

**Fix:**
- **Remove** the toggle from the wire strip.
- **Add** a compact toggle in the **top bar**, immediately to the **right of the command-palette/search button**
  (`navigation-shell.tsx` topbar utilities — near `onOpenCommandPalette` ~714, before the notifications bell). Two
  states, icon-based (e.g. a globe/G for global-general and a person/P for personal), one side each, clearly
  indicating the active side. Keep the existing persisted `wireMode` state + `setWireMode` + `rumbledore:wire-mode`
  behavior — only relocate + restyle the control. Apply on desktop topbar AND the mobile top bar equivalent.
- a11y: `role="group"`/`aria-pressed` or a labelled switch; ≥44px target; tooltip/`aria-label` ("Global news" /
  "Your players"); not color-only.
- **AC:** no toggle in the wire strip; a compact icon toggle sits in the top bar right of search; toggling still
  switches general↔personal wire content + persists; gates green.

## Global
All `AGENTS.md` gates (typecheck/lint/test/build/ubs/secret-scan/perf:pwa); token-contract + AUSPEX fidelity;
update any tests for the moved/replaced components (don't weaken/skip). Branch `ws/v1-nav-toggle` off `main`;
orchestrator merges to `main` after gates + an owner-facing screenshot review.
