# Spec 30 — App Shell & Navigation (AUSPEX, mobile-first)

> Phase 5 UI/UX overhaul. Restyles + extends the EXISTING shell into the **AUSPEX** visual language across mobile,
> tablet, and desktop. This is the **structural spine** of the show: the rail/topbar/ticker on desktop, the
> bottom-tabs + scope-switcher sheet on mobile. It does NOT redefine the IA (that is `specs/10`, EXISTS) or the
> PWA mechanics (that is `specs/24`, EXISTS) — it dresses them in AUSPEX and fills the gaps the design template
> left (mobile translation, presence, notifications surface, boot, install).
> READ FIRST: `phase5-staging/rumbledore-design-language.md` (AUSPEX source-of-truth) and `docs/design/auspex-reference.html`.
> References: `specs/10` (two-scope IA/nav + switcher — EXISTS), `specs/24` (PWA shell/SW/offline/deep-link — EXISTS),
> `specs/20` (realtime channels incl. `presence`, push, notification taxonomy — EXISTS), `specs/28` (tokens/type/
> motion/atmosphere/a11y — sibling), `specs/29` (component library: orb, ticker, bezel, panel, command palette,
> toasts, drawer/sheet, skeletons — sibling).
> Real modules (EXISTS — restyle/extend, do NOT rebuild): `src/app/layout.tsx`, `src/navigation/navigation-shell.tsx`,
> `src/navigation/scope.ts`, `src/navigation/league-switcher-view.tsx`, `src/navigation/league-switcher-model.ts`,
> `src/navigation/use-active-navigation-state.ts`, `src/app/api/navigation/league-switcher/route.ts`,
> `src/realtime/client.tsx`, `src/components/pwa/service-worker-registration.tsx`, `src/app/offline/page.tsx`,
> `src/app/you/you-account-view.tsx`.

## North-Star ethos (what the shell must make true)
Rumbledore is **not provider plumbing** — it is a league-specific spectacle the members star in, that **spreads
phone-to-phone**. The shell's job: make the *league* the unit of attention, the *provider* a quiet badge, and the
first tap feel like opening an *app* — instant frame, the **WIRE** alive, the cast's **orb** present. AUSPEX =
"research restraint × Y2K hardware soul × sports HUD": a near-black void, glass panels split by hairlines, soft
lilac halos (never neon), silver bezels. **Mobile is primary.** The desktop rail is the *adapted* form, not the
canonical one. Every motion collapses under `prefers-reduced-motion`; every state (loading/offline/empty/gated)
is designed, never blank.

---

## A. The scope model the shell renders (from `specs/10`, unchanged semantics)
Two scopes, derived from the URL (`deriveActiveNavigationState`, EXISTS):
- **Global** — `/`, `/news`, `/arena`, `/you`. Sections: **Your Leagues · News · Arena · You**.
- **League** — `/leagues/[leagueId]/…` under that league's RLS. Sections: **Home · The Press · Bet · Records ·
  Lore · Members** (the code already carries `lore`; `specs/10` text predates it — keep `lore`).
**Provider is a badge, never a nav level** (`PROVIDER_BADGE_LABELS`, EXISTS). The hinge between scopes is the
**unified league switcher** (one MRU list across ESPN/Sleeper/Yahoo). The shell exposes the *current scope's
sections* + the switcher on every breakpoint, and reflects active scope/section in nav. AUSPEX restyles the three
existing surfaces — `DesktopSidebar`, `MobileTopBar` + `MobileBottomTabs`, `MobileSwitcherSheet` — plus adds the
topbar utilities (⌘K, notifications, account, motion toggle, clock) and the WIRE strip.

## B. Breakpoints & shell forms (one IA, three presentations)
| Form | Width | Shell |
|---|---|---|
| **Mobile** (primary) | `< 768px` (`< md`) | Compact header (top) + **WIRE** strip + **bottom tab bar** + **scope-switcher sheet** (bottom sheet). |
| **Tablet** | `768–1023px` (`md`–`lg`) | Collapsible **icon-rail** (default collapsed) ↔ expanded; **condensed topbar** (brand + breadcrumb + switcher + ⌘K icon + notifications + account); WIRE under topbar. |
| **Desktop** | `≥ 1024px` (`lg+`) | Full **AUSPEX left rail** (labeled sections, scroll-spy) + full **topbar** (brand · breadcrumb · switcher · ⌘K/search · notifications · account · motion toggle · live clock) + **WIRE** ticker strip. |
Tailwind breakpoints already in use (`md:` for the rail/topbar split) — extend with `lg:` for the rail's
labeled↔icon distinction. Content area is **parity across all three** (no reduced feature set; `specs/05`/`24`).
The shell frame **never blanks between routes** (`specs/24` perf budget) — only the content region swaps.

---

## C. DESKTOP (`lg+`) — the canonical AUSPEX chrome
### C1. Atmosphere & frame
Body paints the **void** (`--void`) with the AUSPEX atmosphere layers behind everything: starfield · scanlines ·
film-grain · vignette (`.atmos.*`, `specs/28`), `position: fixed`, `aria-hidden`, `pointer-events:none`, and
**fully suppressed under `prefers-reduced-motion`** (static gradient only). Rail and topbar are **glass panels**
(`--panel` + `backdrop-blur`) edged by **hairlines** (`--hair`), not solid borders. Replace the current
`bg-sidebar`/`border-sidebar-border` with AUSPEX panel + hairline tokens (`specs/28`).

### C2. Left rail (`<aside aria-label="Primary navigation">`, EXISTS — restyle)
Fixed full-height glass panel, `lg` width ~`18rem`. Top→bottom zones (matches `specs/10`):
1. **Brand block** — Rumbledore wordmark in `--head` (Michroma, white→lilac text-clip), small **chip-glyph** bezel
   mark to its left. Links `/`.
2. **Global sections** — Your Leagues · News · Arena · You. Each row = icon (lucide, retained) + label in
   `--disp`. **Active = lilac**: a left **2px lilac bar** + lilac text + faint `--glow-lilac` wash on the row.
   Hover = subtle hover-lift + hairline wash. `aria-current="page"` on the active row (EXISTS — keep).
3. **League switcher** (`ScopeAvatar` + name + `ChevronDown`) — the active league's avatar (square bezel, `--r-sm`),
   name in `--disp`, provider badge as a quiet **edge/tag** (`.edge`, `specs/29`). Opens the switcher popover
   (`LeagueSwitcherView`, EXISTS) anchored beside the rail as a glass panel.
4. **League sections** (only when `scope==="league"`) — Home · The Press · Bet · Records · Lore · Members, same
   active-lilac treatment. Section group label ("LEAGUE") in `.eyebrow`.
**Scroll-spy:** when a long content page has in-page section anchors, the rail's active row tracks the
scroll position (IntersectionObserver), active = lilac. Scroll-spy is **presentation only** — never changes route
or scope; it augments `aria-current` for the in-page section but the section nav item remains the source of truth.

### C3. Topbar (`<header>`, full row above content; NEW utilities)
A glass strip, height ~`3.5rem`, hairline bottom. Left→right:
- **Breadcrumb** — `Global ▸ Your Leagues` or `{League} ▸ The Press ▸ {Post}` (AUSPEX `.crumbs`, `specs/29`).
  Derived from `ActiveNavigationState` + page-supplied trailing crumb (see §G). Truncates middle on overflow;
  each crumb a real link; current crumb `aria-current="page"`.
- **Search / ⌘K** — a `.kbd`-styled trigger ("Search · ⌘K") that opens the **command palette** (`specs/29`).
  Palette searches: leagues (jump = switch scope), sections, recent posts, members; arrow-key navigable, Enter
  selects, Esc closes, focus-trapped, returns focus to trigger. Keyboard: ⌘K / Ctrl-K global; `/` focuses when no
  field is focused.
- **Notifications** — bell with **unread count badge** (lilac dot/number). Opens the **notifications popover/drawer**
  (see §F).
- **Account** — avatar button → **account menu** (see §H).
- **Motion toggle** — a switch ("Motion") that flips a persisted `data-motion="off"` on `<html>`, overriding
  atmosphere/ticker/orb animation independent of the OS `prefers-reduced-motion` (which always wins when set).
  Persisted in `localStorage`; respected by all `specs/28` motion.
- **Live clock** — `.lcd` mono readout (HH:MM:SS or game-week), `aria-hidden` decorative; updates on a 1s tick that
  **pauses under reduced-motion / motion-off** (render static time, no per-second repaint).

### C4. The WIRE (live league strip)
A horizontal **marquee ticker** (`.ticker` "WIRE", `specs/29`) directly under the topbar in League scope (and a
cross-league/central variant in Global). Renders live items from the realtime channels (`specs/20`):
`scores · odds · leaderboard · blog · lore` — score swings, line moves, new Press drops, lore votes opening.
- Each item = an **edge/pill** (jade=up, coral=down, amber=value/line, lilac=cast/lore, steel=neutral) + terse
  mono text; clicking an item deep-links into its surface (post → Press, line → Bet, score → Home).
- **Live**: subscribed via `src/realtime/client.tsx` (EXISTS); new items prepend with a soft draw-in.
- **Reduced-motion / motion-off**: marquee does NOT auto-scroll — becomes a **static, horizontally scrollable**
  strip (overflow-x, snap), newest-first; no animation.
- **Pause on hover/focus**; the strip is keyboard-focusable and items are tabbable (`role="list"`/`listitem`).

---

## D. TABLET (`md`–`lg`) — adapted rail + condensed topbar
- **Icon-rail** — the existing collapsible sidebar (`sidebarCollapsed`, `PanelLeftClose/Open`, EXISTS), **default
  collapsed** on tablet: icons only, ~`4.5rem` wide, every destination reachable via icon + **tooltip** (label on
  hover/focus; `title` already wired — upgrade to an accessible AUSPEX tooltip with `aria-label`). Expandable to
  the full labeled rail; collapse state persisted. Active still = lilac bar.
- **Condensed topbar** — brand mark (glyph only) + breadcrumb (collapses to last 2 crumbs) + switcher (avatar +
  chevron, name hidden when tight) + ⌘K **icon** + notifications + account. Motion toggle + clock move into the
  account menu at this width to save room.
- **WIRE** persists under the topbar (same behavior as desktop).
- Touch + pointer: tablet supports both — all targets ≥44px; tooltips also open on long-press.

---

## E. MOBILE (`< md`) — bottom tabs + scope-switcher sheet (PRIMARY)
### E1. Compact header (`MobileTopBar`, EXISTS — restyle + extend)
Fixed top, `min-h-14`, `pt-safe`, glass + hairline. Contents:
- **Scope chip** (left, flex-1) — `ScopeAvatar` + scope name (`--disp`, truncate) + **provider badge** as a quiet
  edge (only in League scope) + `ChevronDown`. **Tapping opens the scope-switcher sheet** (EXISTS — keep
  `onOpenSwitcher`). `aria-haspopup="dialog"`.
- **Right cluster** — **notifications** bell (with unread dot) + **account** avatar. ⌘K becomes a **search icon**
  that opens the command palette as a full-height sheet. Motion toggle + clock live in the account sheet (§H).
- The brand wordmark is implied by the scope chip; no separate brand row (vertical space is precious).

### E2. The WIRE as a tappable strip
Directly under the header: a **single-line horizontally scrollable** wire (NOT an auto-marquee on mobile by
default — battery/INP), newest-first, snap-scroll, each item an edge/pill. **Tapping the strip expands** it into a
**bottom sheet** "The Wire" — a scrollable list of recent live items with timestamps; tapping an item deep-links
into its scope. A small "live" presence dot (lilac, pulsing; static under reduced-motion) shows the realtime
connection is open (`src/realtime/client.tsx` connection state).

### E3. Bottom tab bar (`MobileBottomTabs`, EXISTS — restyle)
Fixed bottom, `pb-safe`, glass + top hairline, `grid` of the **current scope's sections** (4 Global / 6 League —
the grid already uses `--nav-count`). Each tab = icon + short label, **≥44px** target (current `min-h-16` +
full-cell tap — keep). **Active = lilac**: icon + label lilac, a small lilac top-edge indicator on the active
cell, `aria-current="page"`. With 6 League sections on a narrow phone, labels shrink to a single short word
(`.eyebrow` micro) and remain legible at 320px; icons carry the load. `<nav aria-label="Current scope sections">`
(EXISTS — keep landmark).

### E4. Scope-switcher SHEET (`MobileSwitcherSheet`, EXISTS — restyle + extend)
A bottom sheet (`role="dialog" aria-modal="true"`, EXISTS) presenting the **unified MRU list** across all
providers (`LeagueSwitcherView`, EXISTS):
- **Header** — "Scope" eyebrow + "Switch leagues"; a prominent **"Your Leagues" (Global)** row at top so Global is
  always one tap away (`specs/10` mandate).
- **Search** field (filters by name/provider, EXISTS in `league-switcher-model`).
- **Group-by-provider toggle** (opt-in; default flat MRU — EXISTS).
- **Each row** — league avatar (square bezel) + name + **provider badge** (edge) + optional **presence dot**
  (members online in that league, from `league:{id}:presence`, see §F). Selecting swaps scope + bottom tabs in
  place (EXISTS) and bumps MRU.
- **"Connect another league"** row at the bottom → onboarding (`specs/04`/`16`), three providers as connect
  *options* (not nav). 
- Sheet behavior: backdrop tap closes (EXISTS), Esc closes, focus-trapped, focus returns to the scope chip, body
  scroll locked; drag-down-to-dismiss handle (visual affordance; reduced-motion → instant). Max-height `85dvh`
  (EXISTS), internal scroll.

---

## F. Notifications surface + realtime presence (NEW, on `specs/20`)
- **Notifications store** — subscribes to the user's notification stream (`specs/20` taxonomy: `scores · odds ·
  leaderboard · blog · lore · presence`; `central:news`, `arena:leaderboard`). Unread count drives the topbar/
  mobile bell **badge**.
- **Surface** — desktop/tablet: a **popover/drawer** (`specs/29` drawer) anchored to the bell; mobile: a
  **bottom sheet**. A list of notification cards (icon by category, terse title, relative time, unread = lilac
  left-edge). Each routes to its scope on tap (uses `specs/24` deep-link routing). Actions: **mark all read**,
  per-item read, "notification settings" → You. Participatory items (lore "Settle it") show a primary CTA.
- **Empty state** — quiet panel: "All caught up." with the orb at rest. **Loading** — 3–4 skeleton cards
  (`specs/29`). **Error/disconnected** — a hairline banner "Reconnecting…" with the presence dot amber; retries.
- **Presence dots** — from `league:{id}:presence` (`specs/20`). A small dot (jade=online) appears: beside the
  active-league name (rail/header), on switcher rows (members online in that league), and optionally on member
  avatars in-content. Dot **pulses** when live; **static** under reduced-motion/motion-off; greys when the
  realtime socket is down. `aria-label` conveys state ("3 members online"), never color-only.

## G. Breadcrumbs (NEW topbar element, derived)
- Built from `ActiveNavigationState` (scope + section) plus an optional **page-supplied trailing crumb** (e.g. a
  Press post title, a member name) passed via a small context/prop the section page sets — the shell renders the
  scope/section prefix; the leaf comes from the page so it survives deep-link refresh (SSR-friendly).
- Global: `Your Leagues` / `News` / `Arena` / `You`. League: `{League} ▸ {Section} ▸ {leaf?}`. Root `/` shows just
  the brand (no crumb). Each crumb is a link except the current (`aria-current="page"`). Mobile hides breadcrumbs
  (the scope chip + bottom tabs carry location); tablet shows last 2.

## H. Account menu (NEW)
Avatar trigger → menu (desktop/tablet popover; mobile sheet) with: identity (name/email/avatar) · **connected
providers + reconnect CTAs** (reuses `specs/10`/onboarding reconnect surface; provider = badge) · notification &
push prefs (→ `league-notification-toggle`, EXISTS) · **install affordance** (§J) · **motion toggle** (mirror of
topbar, the only home for it on mobile/tablet) · theme/palette (AUSPEX is default; `specs/27`/`28`) · **sign-out**.
Sign-out clears pages cache + unsubscribes push (`specs/24` rule). Menu: `role="menu"`, arrow-key nav, Esc closes,
focus returns to trigger. Much of this content already lives in `you-account-view.tsx` — the menu is a quick-access
surface that links into **You** for the full settings page (don't duplicate logic).

## I. Boot / splash sequence (NEW)
- **OS splash** (`specs/24`) paints the manifest `background_color` (the void) + 512 icon immediately — **no white
  flash** ever. Then the app's **boot sequence** (AUSPEX `.boot`, `specs/28`/`29`): the void + atmosphere fade in,
  the **orb** spins up, a terse staged-status readout (`.lcd`: "LINK ⋯ / WIRE ⋯ / READY"), resolving into the shell
  frame. Total ≤ ~1s perceived on a warm SW (`specs/24` repeat-cold-start budget).
- **Reduced-motion / motion-off**: skip the animated boot — paint the void + static brand mark + go straight to
  the skeletoned shell. No orb spin, no staged reveal.
- The boot is the **shell frame first**; content arrives via route `loading.tsx` **skeletons** (`specs/24` —
  skeletons over spinners, layout-stable, CLS < 0.1). The nav chrome (rail/tabs/topbar) renders instantly and never
  participates in the content skeleton.

## J. PWA install affordance · offline shell · deep-link routing (AUSPEX dressing of `specs/24`)
- **Install affordance** (`specs/24` §A) — Android `beforeinstallprompt` → an **"Add to home screen"** control in
  the account menu/You and (optionally) a dismissible AUSPEX banner after a qualifying session; iOS Safari
  (non-standalone) → concise **Share → Add to Home Screen** instructions. Hidden when standalone/`appinstalled`.
  Styled as an AUSPEX panel/banner — no nagging, dismissal persisted.
- **Offline shell** (`/offline`, EXISTS) — restyled into a calm AUSPEX panel: void + dim atmosphere, the orb **at
  rest** (not thinking), `.lcd` "OFFLINE — reconnect to see live league data", a Retry button. Honest: **not** a
  promise of cached league data (`specs/24`). The persistent nav chrome may still render (cached shell) but content
  shows the offline frame. Reconnect → presence dot returns jade, WIRE resumes.
- **Deep-link / share routing** (`specs/24` §C) — the shell renders into the **right scope** by URL:
  `/leagues/[id]/…` → League scope active; `/invite/[id]/[token]` and `/onboarding/*` → **no shell** (kept in
  `NAVIGATION_SHELL_HIDDEN_SEGMENTS`, EXISTS; `shouldShowNavigationShell`). Unauthed deep link → bounce to
  sign-in/onboarding preserving destination, returns into the correct scope on success. Non-member league link →
  clean **gated state** (see §K), never a leak/blank. Shareable surfaces expose a copy-link / Web-Share affordance
  (`specs/24`).

## K. Universal shell states (designed, never blank)
- **Loading** — shell frame instant; switcher list shows skeleton rows while `/api/navigation/league-switcher`
  resolves (EXISTS fetch); content via `loading.tsx` skeletons. WIRE shows skeleton pills until first realtime msg.
- **Empty** — zero leagues: Your Leagues shows a connect prompt (`specs/10`); switcher shows only "Connect another
  league"; League sections N/A (no active league). Notifications empty = "All caught up."
- **Offline** — §J: chrome may persist, content = offline panel; WIRE/presence go static/grey; clock freezes.
- **Gated** — non-member/insufficient-role league section → AUSPEX gated panel (sign-in / no-access / 404 per
  `specs/10` guards), never a broken page; the rail/tabs still render the scope the user *can* see.
- **Error** — realtime disconnect = amber presence dot + "Reconnecting…"; switcher fetch failure logs + keeps last
  good list (EXISTS swallows error) — surface a quiet retry rather than an empty rail.

---

## L. Accessibility (all three sizes — MANDATE)
- **Landmarks** — `<header>` (topbar/mobile header, `banner`), `<aside aria-label="Primary navigation">` (rail),
  `<nav aria-label="Current scope sections">` (bottom tabs), `<main>` for content (ensure the content region is a
  single labeled `main`), WIRE = `<section aria-label="League wire">` with `role="list"`. (Most landmarks EXIST —
  audit + complete.)
- **Focus order** — header → WIRE → main → bottom tabs (mobile); rail → topbar utilities → main (desktop). A
  visible **skip-to-content** link is the first focusable element. Focus ring = AUSPEX **focus-bloom** (lilac halo,
  `specs/28`), `focus-visible` only (EXISTS uses `focus-visible:ring`).
- **Keyboard nav** — rail/tabs: Tab between items, Enter activates, `aria-current` marks active. Switcher
  popover/sheet: focus-trapped, Esc closes, focus returns to trigger, arrow keys move between rows, type-ahead
  filters. Command palette: full keyboard (§C3). Account/notifications menus: arrow-key + Esc. WIRE items tabbable.
  Drag-to-dismiss sheets also dismiss via Esc + a visible close button (EXISTS).
- **Targets** — every interactive element ≥**44×44px** (current `min-h-11`/`min-h-16` — keep; verify tab cells and
  WIRE pills meet it on mobile).
- **Reduced motion** — `prefers-reduced-motion` (OS) OR `data-motion="off"` (user toggle) disables: atmosphere
  animation, orb spin, ticker auto-scroll (→ static scroll), boot sequence (→ instant), presence pulse, count-ups,
  hover-lift transitions, clock per-second tick. Nothing is *only* conveyed by motion or color (state also has
  text/`aria-label`/icon).
- **Contrast** — AUSPEX text tokens (`--ink`/`--ink-2`) on void/panel meet WCAG AA (`specs/28` owns the contrast
  audit); lilac active state pairs the color with a shape cue (bar/edge) so it's not color-only.

## M. EXISTS vs NEW (build ledger)
- **EXISTS — restyle to AUSPEX (do not rebuild):** `NavigationShell`, `DesktopSidebar`, `MobileTopBar`,
  `MobileBottomTabs`, `MobileSwitcherSheet`, `LeagueSwitcherView`, scope derivation/model, `shouldShowNavigationShell`
  + hidden segments, the collapsible icon-rail, `aria-current`/landmarks, ≥44px targets, safe-area utils, the
  switcher fetch, MRU sort, provider badges, realtime client, SW/offline/manifest.
- **NEW — design + build in AUSPEX:** atmosphere layers in shell; topbar utilities (breadcrumb, ⌘K/command palette,
  notifications bell+badge, account menu, **motion toggle**, **live clock**); the **WIRE** strip (desktop marquee +
  mobile tappable strip + expand sheet) wired to realtime; **scroll-spy** active state; **presence dots**;
  notifications surface (popover/drawer/sheet + states); **breadcrumbs** (+ page-leaf context); **boot/splash**
  sequence; AUSPEX **offline panel**; AUSPEX **install affordance**; "Your Leagues (Global)" row + Connect row in
  the sheet; gated/empty/loading shell panels.

## N. Acceptance criteria (testable)
Gate-verifiable (`pnpm test`, e2e, axe, Lighthouse):
1. **Three forms render** — `< md` shows compact header + WIRE strip + bottom tabs + (on tap) switcher sheet; `md`
   shows the collapsible icon-rail (default collapsed) + condensed topbar; `lg+` shows the full labeled rail +
   full topbar (breadcrumb, ⌘K, bell, account, motion toggle, clock) + WIRE marquee. Content parity across all.
2. **Scope/section + active state** — derived from URL (EXISTS tests hold); active nav item has `aria-current="page"`
   and the lilac+shape treatment; bottom tabs/rail show the correct section set per scope (4 Global / 6 League).
3. **Switcher** — unified MRU list across ESPN/Sleeper/Yahoo with provider badges, search, group toggle, a
   Global ("Your Leagues") row, and a Connect row; selecting swaps scope + tabs in place and bumps MRU (EXISTS
   coverage + new rows). Sheet/popover focus-trapped, Esc-closable, focus returns to trigger.
4. **Command palette** — ⌘K/Ctrl-K opens it everywhere; arrow/Enter/Esc work; selecting a league switches scope;
   focus trap + restore verified.
5. **WIRE** — renders realtime items as edges that deep-link to their scope; auto-scrolls on desktop, static
   scrollable on mobile; **stops auto-scrolling under reduced-motion/motion-off**; mobile tap expands the wire
   sheet.
6. **Notifications + presence** — bell shows unread count; surface lists categorized items that route on tap, with
   loading/empty/error states; presence dots reflect `presence` channel with non-color-only `aria-label`; both
   pulse-static under reduced-motion.
7. **Motion toggle + reduced-motion** — toggling persists `data-motion="off"` and halts atmosphere/orb/ticker/boot/
   clock-tick; OS `prefers-reduced-motion` does the same and always wins. (axe/visual + unit on the gate.)
8. **Breadcrumbs** — correct scope/section prefix on every route + page leaf on detail routes; current crumb
   `aria-current`; survives deep-link refresh.
9. **Boot/offline/deep-link** — no white flash on cold boot (void paints first); offline renders the AUSPEX offline
   panel (no faked data); a member deep link lands in the right scope, unauthed bounces preserving destination,
   non-member hits a clean gated state (extends `specs/24` tests).
10. **A11y** — landmark roles present; skip-link first; full keyboard nav of rail/tabs/switcher/palette/menus;
    focus-visible bloom; ≥44px targets; AA contrast (axe clean on shell routes).
11. **Gates green** — `pnpm typecheck/lint/test/build`, `pnpm secret-scan`, `ubs` (exit 0) all pass, and the shell
    holds AUSPEX-fidelity per `docs/design/rumbledore-design-language.md`.

### Needs the later human UI pass (not gate-verifiable)
WIRE marquee speed/easing, boot choreography/timing, halo intensity, sheet drag physics, exact crumb truncation,
notification card density, presence-dot pulse rhythm, and final spacing/type. This spec fixes **structure, states,
routing, a11y, and the AUSPEX mapping**; taste is tuned with a human in the room (North Star "surface soul later").

## Dependencies / blocked-by
- `specs/10` IA & nav (EXISTS) — scopes, sections, switcher, guards this shell renders.
- `specs/24` PWA shell (EXISTS) — manifest/SW/offline/deep-link/perf this shell dresses.
- `specs/20` Realtime & push (EXISTS) — `presence`/`scores`/`odds`/`blog`/`lore` channels feeding WIRE + presence +
  notifications.
- `specs/28` Design foundations + `specs/29` Component library (siblings) — tokens/motion/atmosphere + orb, ticker,
  bezel, panel, command palette, drawer/sheet, toasts, skeletons, breadcrumbs/crumbs, edges/pills.

## Non-goals
- Defining section *content* (Home/Press/Bet/Records/Lore/Members internals — `specs/31`–`33`, `05`–`09`).
- Changing IA semantics, routing rules, or guards (`specs/10`) or PWA mechanics/perf rules (`specs/24`).
- New notification categories or push delivery mechanics (`specs/20`).
- Token/type/motion *definitions* (`specs/28`) or component *internals* (`specs/29`) — this spec composes them.
- AI voice/character tuning (user's later step; this only places the cast's orb/presence in the chrome).
