# IMPLEMENTATION_PLAN.md — Phase 5: UI/UX Overhaul (AUSPEX visual language)

Disposable, loop-maintained backlog. The loop works `## Scope` until none unblocked + gates green (writes `.loop/SCOPE_DONE`), then auto-runs the value-ranked `## Icebox` ×10 (`PROMPT_harden.md`), then stops at the review checkpoint.
One task = one sentence, no "and". **Build toward `docs/NORTH-STAR.md` in the AUSPEX visual language — the design source-of-truth is `docs/design/rumbledore-design-language.md` + specs `28–34`.** Phases 1–4 are complete (git history + `docs/PROGRESS.md §8`). Full roadmap: `docs/ROADMAP.md`.

**NON-NEGOTIABLES for every task:**
- **Mobile + tablet + desktop** — every surface/component must be laid out, behave correctly, and be fully usable on all three. Not desktop-first.
- **Accessibility** — WCAG-AA contrast, visible focus, full keyboard nav, semantic/screen-reader markup, ≥44px touch targets, honor `prefers-reduced-motion`, never color-as-sole-signal.
- **All states** — default/hover/active/focus/disabled/loading(skeleton)/empty/error/offline/gated.
- Builds **on Phase 4's theming framework** (`specs/27`): Spec 28 registers AUSPEX as a theme there; components consume tokens, never literals.
- The UI gate (`npx impeccable detect src/`) must pass; this is an overhaul of existing UI — **search/restyle existing components, don't fork them.**

## Scope — Phase 5 (build in dependency order)

### S. Design foundations (see specs/28)
- [x] Register the AUSPEX theme in the design-token framework with the full ported token set. (specs/28)
- [x] Implement the typography system (Michroma/Saira/JetBrains Mono/Inter, scales, gradient-clip headings, LCD numerics, prose scale). (specs/28)
- [x] Implement the atmosphere layers (starfield/scanline/grain/vignette), perf-safe and reduced-motion-aware. (specs/28)
- [x] Implement the signature primitives: the AI orb, the Y2K bezel, and the glass panel/surface system. (specs/28)
- [x] Add motion/easing tokens plus the WCAG-AA contrast, focus, and reduced-motion accessibility foundation. (specs/28)

### T. Component library (see specs/29)
- [x] Restyle the button and input control set to AUSPEX with all states, responsive, and a11y. (specs/29)
- [x] Build the data-display components (tables→mobile cards, pills/badges/tags/edges, key-value, avatars, meters/pips, stat tiles). (specs/29)
- [x] Build the feedback/overlay components (alerts, toasts, modals, drawers→mobile sheets, tooltips, popovers, skeletons, empty, banner). (specs/29)
- [x] Build the navigation atoms and command palette (breadcrumbs, tabs, pagination, steps, ⌘K + mobile equivalent). (specs/29)

### U. Data-viz & ephemera (see specs/34)
- [x] Build the accessible, responsive, reduced-motion-aware chart library formalizing the 18 AUSPEX generators. (specs/34)
- [x] Add the new Rumbledore viz (bankroll equity curve, standings bump, playoff-odds cone, win-prob timeline, and the rest). (specs/34)
- [x] Build the live/ephemeral spectacle moments (wire ticker, scoreboard strip, count-ups, stingers, orb states) behind a reduced-motion master switch. (specs/34)

### V. App shell & navigation (see specs/30)
- [x] Build the responsive AUSPEX app shell (desktop rail+topbar+ticker, tablet adaptation, mobile bottom-tabs+header). (specs/30)
- [x] Build the scope-switcher (global↔league) and league switcher sheet, mobile-first. (specs/30)
- [ ] Wire the WIRE ticker, notifications, and presence to realtime, plus the boot/splash and PWA install/offline affordances. (specs/30)

### W. Editorial / publication register (see specs/31)
- [ ] Build the AUSPEX reading register (the legible long-form skin) and the story-card variants. (specs/31)
- [ ] Build the publication Front and section fronts with editorial hierarchy, responsive. (specs/31)
- [ ] Build the article page (persona/orb byline, dek, long-form body, pull quotes, related), responsive and accessible. (specs/31)

### X. Feature surfaces (see specs/32)
- [ ] Compose the League Home dashboard in AUSPEX (matchup hero, standings ladder, cast headlines, bankroll, wire). (specs/32)
- [ ] Compose the Arena (league-vs-league and individual leaderboards, seasons, head-to-head, rank movement). (specs/32)
- [ ] Compose the Sportsbook (market board, the bet-slip console/sheet, the rolling bankroll LCD). (specs/32)
- [ ] Compose Records & History, the Central News hub, and Settings/data-steward surfaces. (specs/32)
- [ ] Compose the entitlement/upgrade and gated states (graceful, on-brand, never a broken page). (specs/32)

### Y. AI cast, lore & onboarding surfaces (see specs/33)
- [ ] Build the AI cast presence (orb identity, persona cards/bylines, the cast chat and insight cards). (specs/33)
- [ ] Build the instigator UI (seed-debate / poll / lore-claim / verdict) and the shared vote widget. (specs/33)
- [ ] Build the lore mechanic UI (submit, vote with quorum, canon ledger, branch/dispute trees, challenge). (specs/33)
- [ ] Build the onboarding flows (provider connect, hosted-browser frame, discovery, leaguemate detection, invite, claim-your-team). (specs/33)

## Icebox (value-ranked; the build auto-hardens ×10 after Scope)
- [ ] **[a11y]** Run a full keyboard + screen-reader + AA-contrast sweep across every overhauled surface and fix gaps.
- [ ] **[perf]** Verify the atmosphere/ephemera stay within the mobile perf budget; throttle/disable on low-end devices.
- [ ] (loop appends discovered bugs/improvements here during Phase 5)

## Discoveries / bugs (loop appends here)
- [ ] Spec/tuning follow-up: canonical `lilac-deep` computes below 4.5:1 on `hull`/`hull-2`, so keep it UI/fill-grade unless a later AUSPEX tuning pass adjusts the value.
- [ ] [a11y] Normalize legacy form controls from `focus:` border/ring styling to the tokenized `focus-visible` control primitive during the Spec 29 control restyle; the global ring covers keyboard fallback meanwhile.
- [ ] [a11y] Audit shared button and icon-button touch targets during the Spec 29 control restyle; several visual variants are below 44px even when later layouts may provide larger hit areas.
- [ ] Spec/reference follow-up: `docs/design/auspex-reference.html` is referenced by Spec 34 but absent from this checkout; continue using `docs/design/rumbledore-design-language.md` plus specs 28-34 unless the template is restored.
