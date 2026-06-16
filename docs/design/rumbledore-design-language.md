# AUSPEX (HASHMARK) — Design Language · Phase 5 source-of-truth

The user supplied a complete single-file interactive component reference ("HASHMARK // Interface System") that defines the **AUSPEX visual language**. It was authored *without* full project context — so it is authoritative for **styling + direction**, but is *not* the full set of product surfaces. This doc interprets it for Rumbledore; specs `28–34` expand it across every surface. **Canonical reference:** this doc (exact tokens + inventory) + specs `28–34`. The user's original interactive template is the visual touchstone and stays the source for the user's later visual fine-tuning pass; exact pixel values beyond the tokens here are deliberately left to that pass.

## 1. Aesthetic intent
"Prime-Intellect research restraint × Sony Y2K hardware soul × sports HUD." A near-black blue **void** under a faint atmosphere (starfield · scanlines · film grain · vignette). Content floats on **glass panels** (translucent + `backdrop-blur`) split by **translucent hairlines** — never solid grey rules. Accents emit **soft halos, never hard neon**. Chrome = **silver Y2K bezels**. The AI presence is a spinning **conic-gradient orb**. Restrained, precise, tactile.

## 2. Tokens — port verbatim into the Phase 4 theming system (`specs/27` → this is `palette` "auspex")
```css
:root{
  --void:#08090F; --void-2:#0B0D16; --void-3:#0E1019;
  --hull:#12131D; --hull-2:#161826; --hull-3:#1B1D2B;
  --panel:rgba(20,22,34,.62); --panel-2:#161826; --panel-solid:#12131D;
  --hair:rgba(150,156,190,.13); --hair-2:rgba(155,162,196,.24); --hair-3:rgba(170,176,210,.40);
  --line:rgba(150,156,190,.16); --line-2:rgba(170,176,210,.30);
  --ink:#E7E9F3; --ink-2:#AEB2C8; --ink-3:#6E7290; --ink-4:#494D66;
  --lilac:#A7A9EC; --lilac-hi:#C7C8F6; --lilac-deep:#6F72C9;
  --amber:#E2B266; --amber-deep:#B98A38;
  --steel:#82B2D0; --steel-soft:#A6CEE6;
  --jade:#6FC79A; --coral:#E08A8A; --coral-deep:#C46A6A;
  --glow-lilac:rgba(167,169,236,.35); --glow-amber:rgba(226,178,102,.30);
  --bevel:inset 0 1px 0 rgba(190,196,235,.10), inset 0 0 0 1px rgba(255,255,255,.012);
  --r-sm:7px; --r-md:11px; --r-lg:14px;
  --disp:'Saira'; --head:'Michroma'/'Microgramma'; --mono:'JetBrains Mono'; --body:'Inter';
}
```

## 3. Color semantics (carry meaning, don't decorate)
- **Lilac `#A7A9EC` = PRIMARY** — interactive, AI/cast/model, telemetry, active states.
- **Amber `#E2B266` = VALUE** — money, bankroll, premium, headline readouts (LCD glow).
- **Steel = data/secondary · Jade = positive/win · Coral = negative/loss.**

## 4. Typography
- **Headings:** Microgramma (loaded as **Michroma**) — wide squared uppercase, white→lilac gradient text-clip (`--head`).
- **Display/sub-heads:** Saira (`.display-xl/.display-l`, `.eyebrow`).
- **Data/numerics:** JetBrains Mono, tabular figures — `.lcd` (glowing readouts), `.metric`, `.num`, `.kbd`.
- **Body:** Inter, used **sparingly** (chrome + data dominate).
- Syntax-tinted code/notebook surface (`.nb`).

## 5. Signature elements
Orb (`.orb`/`.orb.think`) · Y2K bezel (`.bezel`/`.chip-glyph`) · glass panel (`.panel`/`.cell`) · atmosphere layers (`.atmos.*`) · boot sequence · marquee ticker (`.ticker` "WIRE").

## 6. Component inventory (present in the template — restyle existing UI to these)
Buttons (primary/steel/amber/danger/ghost · sizes · icon · loading · disabled) · inputs (field/textarea/select/stepper/switch/segmented/slider/check/radio/chips) · command palette (⌘K) · tables (sortable, hover-wash) · status pills/badges/tags/edges · key-value · avatars/presence · meters/progress/capacity blocks/ladder pips · stat tiles · **18 chart generators** (line+area, multi-line, spark, bars, grouped, stacked, hbars, range, radar, scatter, histogram, gauge, donut, rings, equalizer, heatmap, bullet, node-graph) · alerts/toasts/modal/drawer/tooltip/popover/skeleton/empty/banner · breadcrumbs/tabs/pagination/steps · patterns (player dossier, matchup hero, lineup slots, trade verdict, leaderboard, memory vault, AI chat, insight cards, activity feed, notebook).

## 7. Motion
Count-up · draw-in (stroke-dash reveal) · staged-process status · orb spin · hover-lift + focus-bloom · marquee ticker. **All collapse under `prefers-reduced-motion`** — preserve this.

## 8. Direct mappings to Rumbledore
- Orb → the **AI cast** presence; `.chat.ai` (conic-orb avatar) → cast columns/threads; `.insight` cards → cast reads/instigations.
- Drawer "Parlay Console" → the **bet slip**; `.lcd`/amber `.stat` → **bankroll**; `.ladder`/`.pip.me` + leaderboard `.tbl` → **standings / Arena**; `.ticker` "WIRE" → the **live league wire**; range/gauge/radar/charts → player/matchup/odds viz; `.st` pills → bet/league state; `.steps` wizard → **onboarding**; `.badge`/`.edge` → verdicts/value.

## 9. Gaps the template does NOT cover — design these in AUSPEX (the discernment work)
1. **Mobile-first translation.** Template is desktop (fixed left rail + topbar). Rumbledore is mobile-first PWA: rail → **bottom tabs + scope-switcher sheet**, topbar → mobile header, sheets-over-drawers on mobile, ≥44px touch targets, the ticker as a tap-to-expand wire.
2. **The editorial / publication register.** Template is HUD/data with almost no prose. "The {League} Press" needs a **reading mode**: editorial fronts (lead/secondary/river), section fronts, **article pages** (persona byline, dek, long-form typographic body, pull quotes, related), the **story-card** atomic unit — legible long-form *in* the AUSPEX language (a calmer, lower-chrome reading surface).
3. **Lore mechanic UI** — claim submission, vote widget (threshold/window/tally), canon record, branch/dispute trees.
4. **Onboarding flows** — connect provider, the hosted-browser login frame, multi-league discovery, leaguemate detection, invite (SMS/link), claim-your-team.
5. **Multi-league IA** — global vs league scope, the league switcher.
6. **Entitlement / upgrade / gated states** — premium paywalls, gated-feature surfaces (never broken pages).
7. **Universal states** — loading/skeleton, empty, error, **offline (PWA)**, gated — across every surface.

## 10. Phase 5 spec set (the expanded reference for the implementation agent)
- `28` Design system foundations (tokens/type/motion/atmosphere/signatures + a11y/contrast) — populates the `specs/27` theming framework with AUSPEX.
- `29` Component library — every component above with variants/states/responsive/a11y; the chart library.
- `30` App shell & navigation — mobile-first IA translation of the rail/topbar/ticker.
- `31` Editorial / publication reading register — the net-new long-form mode.
- `32` Feature surfaces — league home, Arena, sportsbook + bet slip + bankroll, records/history, central news, entitlement/gated, settings.
- `33` AI cast, lore & onboarding surfaces — the spectacle + flows, net-new in AUSPEX.

**Boundary:** Phase 5 builds the *visual system + restyle*. AI *voice/character* tuning stays the user's later fine-tuning step; this just makes the cast's surfaces look right and keeps tone swappable (`specs/26`).
