# Spec 28 — Design System Foundations (AUSPEX tokens · type · atmosphere · signatures · a11y)

> Outcomes spec. Defines WHAT the AUSPEX visual foundation delivers and the contract every surface inherits — not
> per-screen layouts (those are `29`–`33`). This is the **foundation layer of the Phase 5 UI/UX overhaul**: it takes
> the canonical AUSPEX/HASHMARK design language (`/phase5-staging/DESIGN.md`, ported from
> `docs/design/auspex-reference.html`) and **populates the `specs/27` theming framework** with it as a real theme
> named **`auspex`**. Embed the North Star (`docs/NORTH-STAR.md`): Rumbledore is a **league-specific spectacle** the
> members star in — *alive, personal, a little unhinged, a real publication*. Round one was a soulless data system;
> AUSPEX is the surface soul finally arriving. The ethos here is **"Prime-Intellect research restraint × Sony Y2K
> hardware soul × sports HUD"**: a near-black void under faint atmosphere, glass panels split by translucent
> hairlines, accents that emit soft halos (never hard neon), silver Y2K chrome, and a spinning conic-gradient AI orb
> as the cast's presence. **Restraint is a feature** — chrome and data dominate; prose is a calmer, lower-chrome
> reading register (`31`).
> References: `specs/27` (theming framework this POPULATES — the plumbing exists; this fills the `auspex` slot),
> `specs/10` (IA/nav shells that consume the theme), `docs/NORTH-STAR.md`, `phase5-staging/DESIGN.md`
> (canonical tokens — port verbatim), `AGENTS.md` (AUSPEX-fidelity per `DESIGN.md`). Real files:
> `src/app/globals.css` (`@theme inline` + `:root`), `src/app/layout.tsx` (font loading, `<html>` data-theme), the
> `src/theme/*` framework introduced by `27` (`registry.ts`, `theme-provider.tsx`, `contrast.test.ts`).

## Purpose
Give Rumbledore its **distinctive look** — the "surface soul" the North Star deferred to the human-in-the-room phase,
now provided as the AUSPEX design language. This spec turns AUSPEX from an HTML reference into the app's **active
theme** and foundational primitives, so every component (`29`) and surface (`30`–`33`) is built *in this language by
construction*. Six foundation systems: (1) the **token system** (color/surface/ink/accent/hairline/glow/bevel/radius),
(2) **typography** (4 families, full scale, prose scale, responsive), (3) **atmosphere** (starfield/scanline/grain/
vignette — perf-safe, mobile-throttled, reduced-motion-off), (4) **signature primitives** (AI orb, Y2K silver bezel,
glass panel), (5) **motion/spacing/layout/iconography** tokens, and (6) the **accessibility foundation** (a real
WCAG-AA contrast audit of every AUSPEX text-on-surface pair, focus-visible, reduced-motion fallbacks,
never-color-alone). Everything resolves through the `27` token taxonomy so a future re-tune is a one-place change and
the contrast/motion gates bite automatically.

---

## EXISTS today (from `specs/27` — do not rebuild; POPULATE)
- The **token taxonomy** (Tier 1 primitives → Tier 2 semantic aliases → Tier 3 utilities), the `@theme inline` + per-
  theme `[data-theme="…"]` swap mechanism, `ThemeProvider` + pre-paint script, the registry, and `contrast.test.ts`
  with its required foreground/background pairs and reduced-motion media layer.
- Registered theme slots: `neutral-dark` (today's baseline), `neutral-light`, and **two empty palette slots** reserved
  for the owner's candidates. The `27` non-goal "do not choose the final look" is now resolved by the owner choosing
  AUSPEX — this spec is that paired Soul-phase step, delivered as a populated theme.
- Semantic aliases: `background/surface/elevated/foreground/muted-foreground/border/primary(/-foreground)/positive/
  negative/warning/highlight/ring`, the shadcn contract mapping, the 6-step type scale + family tokens, the 7-step
  spacing scale, radii (`control/card/sheet`), elevation tokens, motion tokens.
- Safe-area utilities (`pt/pb/pl/pr-safe`), `viewport-fit=cover`, `color-scheme` following active mode.

## NEW in this spec
- The **`auspex` theme**: a fully-populated Tier-1 primitive set (the AUSPEX palette verbatim) bound to every Tier-2
  alias, registered in `registry.ts` and set as the **default active theme** (replacing `neutral-dark` as default;
  `neutral-dark` stays registered as a fallback). `auspex` is dark-only; no light sibling is required (AUSPEX is a
  void aesthetic) — the framework's light path remains valid but `auspex` declares only its dark binding.
- **AUSPEX-specific token extensions** beyond `27`'s minimum: the surface ramp (void→hull tiers), the ink scale,
  the five **named accents with semantics**, translucent **hairline/line** tokens, **glow** tokens, the **bevel**
  inset-shadow token, and the AUSPEX radius trio (7/11/14px) reconciled with `27`'s control/card/sheet.
- The **typography system**: 4 web-font families (Michroma, Saira, JetBrains Mono, Inter) with `next/font` loading,
  the gradient text-clip heading treatment, the LCD/tabular numeric treatment, and a **long-form prose scale** new to
  the app (for `31`).
- The **atmosphere system**: layered `void`-background effects as a foundation primitive, perf-budgeted and breakpoint-
  /motion-gated.
- The **signature primitives**: AI orb (conic gradient + states), Y2K silver bezel (gradient-border mask trick), glass
  panel — as foundation building blocks `29` composes.
- The **a11y foundation**: the audited contrast table baked into `contrast.test.ts` pairs for `auspex`, the
  focus-visible system, the reduced-motion atmosphere/motion fallbacks, the never-color-alone state encoding rules.

---

## 1 · Color & surface token system (port AUSPEX verbatim → `auspex` Tier-1)

All values below are the **Tier-1 primitives** of the `auspex` theme, declared under `[data-theme="auspex"]`. They
are bound to `27` Tier-2 aliases (mapping in the table). Components reference **only** Tier-3 utilities — never these
literals (the `27` token-lint gate enforces it).

```css
[data-theme="auspex"]{
  /* surfaces — the void ramp */
  --void:#08090F; --void-2:#0B0D16; --void-3:#0E1019;
  --hull:#12131D; --hull-2:#161826; --hull-3:#1B1D2B;
  --panel:rgba(20,22,34,.62); --panel-2:#161826; --panel-solid:#12131D;
  /* hairlines & lines (translucent — never solid grey rules) */
  --hair:rgba(150,156,190,.13); --hair-2:rgba(155,162,196,.24); --hair-3:rgba(170,176,210,.40);
  --line:rgba(150,156,190,.16); --line-2:rgba(170,176,210,.30);
  /* ink scale */
  --ink:#E7E9F3; --ink-2:#AEB2C8; --ink-3:#6E7290; --ink-4:#494D66;
  /* accents (semantic — see §2) */
  --lilac:#A7A9EC; --lilac-hi:#C7C8F6; --lilac-deep:#6F72C9;
  --amber:#E2B266; --amber-deep:#B98A38;
  --steel:#82B2D0; --steel-soft:#A6CEE6;
  --jade:#6FC79A; --coral:#E08A8A; --coral-deep:#C46A6A;
  /* glows & chrome */
  --glow-lilac:rgba(167,169,236,.35); --glow-amber:rgba(226,178,102,.30);
  --bevel:inset 0 1px 0 rgba(190,196,235,.10), inset 0 0 0 1px rgba(255,255,255,.012);
  /* radii (AUSPEX trio) */
  --r-sm:7px; --r-md:11px; --r-lg:14px;
}
```

**Surface ramp semantics (back→front depth):** `void` is the page floor (under atmosphere). `void-2/-3` are subtle
gradient stops for the body wash. `hull/-2/-3` are opaque structural chrome (rails, headers, solid cards). `panel`
(translucent + `backdrop-blur`) is the floating glass content layer; `panel-2`/`panel-solid` are its opaque fallbacks
where blur is unavailable or perf-restricted. **Hairlines** (`--hair*`) separate content *inside* glass; **lines**
(`--line*`) are slightly stronger edges for chrome. Never use a solid grey rule.

**Mapping `auspex` → `27` Tier-2 aliases** (so the shadcn/Rumbledore contract resolves; this is the only binding
layer a future re-tune touches):

| `27` alias | `auspex` value | Notes |
|---|---|---|
| `background` | `--void` | page floor; atmosphere renders above it |
| `surface` (→ card/popover/muted) | `--panel-solid` / glass `--panel` | glass where blur allowed; solid fallback otherwise |
| `elevated` (→ secondary/accent) | `--hull-2` | raised chrome, hover wash |
| `foreground` | `--ink` | primary text |
| `muted-foreground` | `--ink-2` | secondary text (NOT `--ink-3`; see a11y §6) |
| `border` / `input` | `--line` / `--hair-2` | translucent; chrome vs in-glass |
| `ring` | `--lilac` @ focus opacity | focus halo (§6) |
| `primary` (/-foreground) | `--lilac` / `--void` | interactive/AI; foreground is the void |
| `positive` | `--jade` | win/up |
| `negative` (→ destructive) | `--coral` (`--coral-deep` for fills) | loss/down |
| `warning` | `--amber` | caution; also doubles as VALUE accent |
| `highlight` | `--amber` (value) + `--lilac` (live) | `27`'s sparing accent splits by meaning (§2) |
| `chart-1…5` | `lilac · amber · steel · jade · coral` | series colors carry the §2 semantics |

---

## 2 · Color semantics (accents carry meaning, never decorate)

These are **invariants** asserted at the component level (`27` "color is never the only signal") — accents always pair
with icon/label/weight. The five-accent system:

- **Lilac `#A7A9EC` = PRIMARY / AI / live.** Interactive elements, focus, active nav, the AI cast presence (orb,
  bylines, insight cards, `.chat.ai`), telemetry, live/in-progress state. The app's "voice on" color.
- **Amber `#E2B266` = VALUE.** Money, bankroll, premium/entitlement, headline LCD readouts (`08`/bet, `17`/gated).
  Rendered with an LCD glow on numerics. Distinct role from warning even though they share the hue token.
- **Steel `#82B2D0` (soft `#A6CEE6`) = DATA / secondary.** Neutral data series, secondary actions, charts.
- **Jade `#6FC79A` = POSITIVE.** Wins, gains, up-deltas, confirmed/canon (`13`/lore).
- **Coral `#E08A8A` (deep `#C46A6A`) = NEGATIVE.** Losses, down-deltas, danger/destructive, disputes.

`coral`/`amber-deep`/`lilac-deep` are **fill-grade** darker variants for solid filled chips/buttons where light text
or void text sits on top (see §6 audit).

---

## 3 · Typography system

Four families, loaded via `next/font` (self-hosted, `display: swap`, subset latin), exposed as `27` family tokens.
Replaces the current Geist/Geist-Mono in `layout.tsx`.

| Token | Family | Role |
|---|---|---|
| `--font-heading` (`--head`) | **Michroma** (Microgramma proxy) | wide squared uppercase headings; gradient text-clip |
| `--font-display` (`--disp`) | **Saira** | display-xl/-l, eyebrows, sub-heads |
| `--font-mono` (`--mono`) | **JetBrains Mono** | LCD readouts, metrics, `.num`, `.kbd`, tabular figures |
| `--font-sans`/`--font-body` (`--body`) | **Inter** | body copy + long-form prose; used **sparingly** in chrome |

**Heading gradient text-clip** (`.h-grad`): `background: linear-gradient(180deg, var(--ink), var(--lilac))` +
`background-clip:text; color:transparent;`. **Mandatory a11y fallback:** the element keeps `color:var(--ink)` as a
declared fallback and the gradient is applied only where `background-clip:text` is supported (`@supports`), so a
clip-unsupported renderer still shows legible ink — gradient text never becomes invisible text.

**LCD numerics** (`.lcd`): JetBrains Mono, `font-variant-numeric: tabular-nums`, amber (value) or lilac (live) with a
soft `text-shadow` glow (`--glow-amber`/`--glow-lilac`); glow is decorative and removed under reduced-motion is N/A
(static) but is **never the sole carrier of meaning**. `.metric`/`.num` are tabular but un-glowed. All stats, odds,
standings, scores, bankroll use tabular figures (a typography utility, not per-component CSS, per `27`).

**Type scale (extends `27`'s 6 steps with paired line-heights; rem on 16px root):**

| Step | Size | LH | Use |
|---|---|---|---|
| `text-xs` | 0.75 / 12px | 1.35 | captions, badges, eyebrow detail |
| `text-sm` | 0.875 / 14px | 1.45 | dense UI, table cells, secondary |
| `text-base` | 1.0 / 16px | 1.5 | default UI body |
| `text-lg` | 1.25 / 20px | 1.4 | sub-heads, card titles |
| `text-xl` | 1.75 / 28px | 1.25 | section headings |
| `text-2xl` | 2.5 / 40px | 1.1 | display / hero |
| `text-3xl` *(new)* | 3.25 / 52px | 1.05 | editorial front lead (`31`), desktop hero |

**Long-form prose scale (NEW — the editorial register for `31`):** a separate, calmer scale optimized for *reading*,
not HUD density. Inter body at **17–19px**, line-height **1.65–1.75**, measure capped at **66–72ch**, paragraph
spacing `1em`, `--ink` body on a lower-chrome reading surface (`hull`/`panel-solid`, atmosphere dimmed). Heading
rhythm inside prose uses Saira (deks/sub-heads) and Michroma sparingly (article title), pull-quotes in `--ink-2`
italic large. This is the only place body copy leads; everywhere else chrome/data dominate.

**Responsive type:** sizes step down on small viewports via `clamp()`-based fluid sizing keyed to breakpoints. Heading
steps (`xl`/`2xl`/`3xl`) shrink ~15–25% at mobile; the prose body floor is **never below 16px** on mobile (zoom/legibility).
Eyebrows and `text-xs` never shrink below 12px. Letter-spacing on Michroma uppercase relaxes slightly at small sizes.

---

## 4 · Atmosphere system (perf-safe, mobile-throttled, reduced-motion-off)

A foundation primitive: a fixed, non-interactive (`pointer-events:none`) layered backdrop rendered once at the app
shell root (behind all content, above `--void`). Four layers, back→front:

1. **Starfield** — sparse faint points (radial-gradient dots or a single repeating tiled image / CSS), very low
   contrast; subtle parallax drift (slow translate) — *animation only on capable + motion-allowed clients*.
2. **Scanline** — repeating 1–2px horizontal gradient at very low opacity; static (no animation).
3. **Grain** — film-grain texture (tiled noise PNG/SVG or `feTurbulence`), low opacity, static.
4. **Vignette** — radial darkening at edges (`radial-gradient` from transparent center → `--void`), static.

**Performance budget (hard):** atmosphere must not regress interaction. Use compositor-only properties (transform/
opacity), `will-change` sparingly, and a single fixed layer tree (no per-frame layout/paint). Total added paint cost
budgeted so it does not drop the app below 60fps scroll on a mid-tier device. Grain/noise assets ≤ a few KB and cached.

**Breakpoint throttling:**
- **Desktop:** full stack, starfield drift animated (if motion allowed).
- **Tablet:** full stack, drift animation reduced or paused; static fallback acceptable.
- **Mobile:** **throttled** — grain + vignette + scanline retained (cheap, static); starfield reduced to a static
  faint field with **no drift animation** (battery/thermal). Atmosphere is decorative; dropping its animation never
  changes meaning or layout.

**Reduced-motion (`prefers-reduced-motion: reduce`):** **all atmosphere animation off** — every layer becomes static.
Layers themselves remain (they are texture, not motion), but no drift/parallax/shimmer. This is wired through the `27`
motion-token layer so it is automatic. Reading mode (`31`) further dims atmosphere for legibility.

---

## 5 · Signature primitives

The three building blocks `29` composes. Defined here as foundation tokens + the canonical CSS techniques.

**5.1 AI orb (`.orb`) — the cast's presence.** A circular element filled by a **conic gradient** cycling the accents
(lilac→steel→lilac, with amber/jade glints), with a soft outer `--glow-lilac` halo and a `--bevel` inner edge for the
Y2K hardware feel. States: **idle** (slow spin or static under reduced-motion), **think** (`.orb.think` — faster spin
+ intensified glow, signals the cast is generating), **muted/offline** (desaturated, no glow). The spin uses a motion
token (`--duration-orb`/`--ease-linear`); under reduced-motion the spin **stops** and the orb shows a static
conic-gradient still (presence preserved, motion removed). Sizes: xs (inline byline) → xl (boot/hero). The orb is the
AI-cast avatar throughout (`12`).

**5.2 Y2K silver bezel (`.bezel`) — the chrome frame.** A gradient-border effect produced by the **mask trick** (not a
solid border): a wrapper with a `linear-gradient` (cool silver: light top-edge → mid → dark bottom) painted into the
border-box and masked so only the border ring shows (`background-clip` / `mask-composite: exclude` on a padding-box
inset), giving a beveled metallic rim that catches light. Pairs with the `--bevel` inset-shadow for the inner lip.
Used on chips, key chrome, premium frames. Falls back to a `--line-2` solid ring where mask is unsupported (still a
legible edge). `.chip-glyph` is the small bezel-framed glyph variant.

**5.3 Glass panel (`.panel`) — the floating content layer.** `background: var(--panel)` (translucent) +
`backdrop-filter: blur(…)` + a `--hair`/`--hair-2` hairline border + `--bevel` inner lip + a soft elevation shadow
(subtle, never a glow). **Fallback:** where `backdrop-filter` is unsupported or perf-restricted (mobile throttle),
fall back to opaque `--panel-solid`/`--hull-2` so content stays legible — glass is an enhancement, never a
legibility dependency. `.cell` is the inner subdivided variant separated by hairlines.

---

## 6 · Accessibility foundation (WCAG-AA, audited)

### 6.1 Contrast audit — every AUSPEX text-on-surface pair (computed, not eyeballed)

Ratios below are **computed** (sRGB relative luminance, WCAG formula). Thresholds: **body/normal text ≥ 4.5:1**;
**large text (≥24px or ≥19px bold) & UI/graphical ≥ 3:1**. These pairs are baked into `27`'s `contrast.test.ts` for
the `auspex` theme so a regression fails the gate.

**Ink on surfaces** (against `void #08090F`, `hull #12131D`, `hull-2 #161826` — worst case shown):

| Pair | Ratio (void→hull-2) | Verdict |
|---|---|---|
| `ink #E7E9F3` on any surface | 16.4 → 14.5 | **PASS** (body) — primary text |
| `ink-2 #AEB2C8` on any surface | 9.5 → 8.4 | **PASS** (body) — secondary text / `muted-foreground` |
| `ink-3 #6E7290` on any surface | 4.2 → 3.8 | **ADJUST** — fails 4.5 body; **passes 3:1 large/UI only**. Rule: `ink-3` is allowed for ≥19px-bold/≥24px text, icons, disabled-ish labels, and non-essential captions **only** — never for normal-size body or essential dense text. Where body-size tertiary text is needed, use `ink-2`. |
| `ink-4 #494D66` on any surface | 2.4 → 2.1 | **DECORATIVE ONLY** — fails all text thresholds. Permitted for hairline-adjacent ornament, placeholder *outlines*, disabled chrome edges; **never** for any text conveying information. |

**Accents as text on dark** (against void / hull / hull-2):

| Accent | Ratio range | Verdict |
|---|---|---|
| `lilac #A7A9EC` | 9.0 → 8.0 | **PASS** (body) |
| `lilac-hi #C7C8F6` | 12.3 → 10.9 | **PASS** (body) |
| `lilac-deep #6F72C9` | 4.7 → 4.1 | **ADJUST** — large/UI ≥3:1 PASS; as body text only on `void`/`hull` (≥4.5), **not** on `hull-2`+; prefer as a *fill* color, not text. |
| `amber #E2B266` | 10.2 → 9.1 | **PASS** (body) — bankroll/LCD |
| `amber-deep #B98A38` | 6.4 → 5.7 | **PASS** (body) |
| `steel #82B2D0` | 8.7 → 7.7 | **PASS** (body) |
| `steel-soft #A6CEE6` | 11.9 → 10.6 | **PASS** (body) |
| `jade #6FC79A` | 9.8 → 8.7 | **PASS** (body) — positive |
| `coral #E08A8A` | 7.7 → 6.9 | **PASS** (body) — negative |
| `coral-deep #C46A6A` | 5.3 → 4.7 | **PASS** (body, marginal) |

**Foreground on accent fills** (button/chip text). Use **void `#08090F`** as the on-fill foreground for light accents
(NOT white): void on `lilac` 9.0, on `amber` 10.2, on `steel-soft` 11.9, on `jade` 9.8, on `coral` 7.7 — **all PASS**.
**Do NOT** put `ink` (light) on a light accent fill (`ink` on `lilac-deep` = 3.5, `ink` on `coral-deep` = 3.1, `ink`
on `amber-deep` = 2.6 — **FAIL** for body): light text only goes on the *deep* fills for **large/UI** use, and even
then `lilac-deep`/`coral-deep` ink is the only borderline option — prefer void-on-light-accent everywhere.

**Net rule of thumb:** `ink`/`ink-2` and all light accents pass as text on any AUSPEX surface; `ink-3` is large/UI/
caption-only; `ink-4` is never text; filled-accent buttons use **void text on the light accent** (never light text on
light accent).

### 6.2 Focus-visible system
Every interactive element shows a **visible focus ring** on keyboard focus (`:focus-visible`, not `:focus`, so mouse
clicks don't ring). The ring is a **2px `--lilac` outline + 2px offset + a soft `--glow-lilac` bloom** (the
"focus-bloom" from the motion section), with sufficient contrast against any surface (lilac ≥8:1 on all surfaces — the
ring itself is a non-text graphical object ≥3:1). On glass panels the ring sits above the blur. The bloom animation is
motion-token-driven and collapses under reduced-motion to a **static ring** (focus remains clearly visible — only the
glow pulse is removed). Focus order follows DOM order; never `outline:none` without an equivalent visible replacement.

### 6.3 Reduced-motion fallbacks (consolidated)
Under `prefers-reduced-motion: reduce`, wired through `27`'s motion-token media layer (durations → ~0): atmosphere
drift **off** (static layers remain); orb spin **stops** (static conic still); count-up/draw-in/marquee/hover-lift/
focus-bloom **collapse** to their end state (value shown immediately, stroke fully drawn, ticker static/paginated,
ring static). **North Star "snappy" is preserved** — reduced-motion removes *decorative* motion, never responsiveness
or meaning.

### 6.4 Never color alone
State is **always** dual-encoded (color + icon/label/weight/shape), so palette and colorblindness can't strand a user:
win/loss carry ▲/▼ + jade/coral; live carries a lilac dot **and** a "LIVE" label; positive/negative deltas carry sign
+ color; bet/league status pills carry text labels + color; disputed vs canon lore carries an icon + color. Asserted
at the component level (`29`), declared as an invariant here.

### 6.5 Targets, keyboard, motion-safety
- **Touch targets ≥ 44×44px** on all interactive elements at mobile/tablet (hit-area may exceed visual size).
- **Full keyboard operability**: every control reachable and operable by keyboard; logical tab order; visible focus
  (§6.2); ESC closes sheets/drawers/modals/command-palette; arrow-key nav within menus/segmented/tabs.
- No content flashes more than 3×/sec; no motion that could induce vestibular discomfort survives reduced-motion.

---

## 7 · Motion, spacing, layout grid, iconography

**Motion tokens (extend `27`'s):** `--duration-fast ≈150ms`, `--duration-base ≈220ms`, `--duration-slow ≈420ms`
(reveals), `--duration-orb` (spin loop), `--ease-out` (default), `--ease-spring` (lift), `--ease-linear` (orb). Named
AUSPEX motions and their tokens: **count-up** (numerics tick to value, `base`), **draw-in** (stroke-dash chart reveal,
`slow`), **staged-process** (multi-step status, `base`), **orb spin** (`--duration-orb`), **hover-lift + focus-bloom**
(`fast`, `ease-spring`), **marquee ticker** (linear loop). All use motion tokens — never literal `ms` — so the `27`
reduced-motion guard reaches them.

**Spacing:** `27`'s 7-step scale (4/8/12/16/24/32/48) as the only spacing source. AUSPEX is **dense but breathing** —
HUD chrome packs tight (4/8/12), content/reading surfaces breathe (24/32). Mobile reduces outer gutters one step;
prose reading measure is the constraint, not raw padding.

**Layout grid & breakpoints:** mobile-first (`specs/10`, `24`). Breakpoints: **mobile** < 768, **tablet** 768–1023,
**desktop** ≥ 1024. Content max-width caps for reading (`66–72ch` prose; ~1200–1320px app shell). The IA shell (`10`/
`30`) renders bottom-tabs + scope-switcher sheet on mobile, collapsible icon-rail on tablet, persistent sidebar on
desktop — the foundation supplies the tokens/atmosphere/type scale each consumes; the shell itself is `30`.

**Iconography:** a single line-icon family (consistent ~1.5px stroke, `currentColor` so it inherits ink/accent),
optical sizes aligned to the type scale (16/20/24), pixel-snapped at 1×. Icons that carry state inherit the §2 accent
**and** appear alongside a label (§6.4). The AI orb and `.chip-glyph` are the only "filled"/decorative marks.

---

## 8 · Responsive behavior of the foundation (mobile · tablet · desktop)

The mandate: the foundation is **accessible + functional on all three**, not desktop-first with mobile bolted on.

- **Type:** fluid `clamp()` scaling per §3; mobile body floor 16px, headings shrink, prose stays ≥16px and capped to
  measure. Eyebrow/caption never below 12px.
- **Atmosphere:** desktop full+animated · tablet full, drift reduced/paused · mobile throttled, starfield static, no
  drift (§4). Decorative only — degradation never changes layout or meaning.
- **Spacing/grid:** mobile single-column, one-step-tighter gutters, content full-bleed within safe-area
  (`pt/pb/pl/pr-safe`); tablet two-zone; desktop multi-zone shell + reading caps.
- **Glass/blur:** full glass on desktop/tablet; mobile may fall back to opaque `panel-solid` where blur is costly
  (§5.3) — legibility identical.
- **Targets:** ≥44px on touch breakpoints; pointer breakpoints may use denser hit-areas but keep visible focus.
- **Signatures:** orb scales xs→xl per context; bezel/mask trick works at all sizes with the solid-ring fallback.

---

## 9 · Acceptance criteria (testable)

Gate-verifiable (`pnpm test`, `contrast.test.ts`, AUSPEX-fidelity per `DESIGN.md`, e2e):
1. **`auspex` registered & default.** `auspex` is a registered theme in `src/theme/registry.ts`, set as the default
   active theme; `<html data-theme="auspex">` resolves before paint (no FOUC, no hydration mismatch), and the whole
   app restyles to AUSPEX with **no component file changed** (the `27` one-place-swap property holds).
2. **Tokens, not literals.** No component/CVA/page contains a raw AUSPEX color/size/duration literal where a token
   exists; the `27` token-lint scan stays green and the surface holds AUSPEX-fidelity per `DESIGN.md`. All `auspex` primitives live only under
   `[data-theme="auspex"]`.
3. **Contrast gate passes for `auspex`.** `contrast.test.ts` runs the §6.1 pairs for `auspex` and asserts the
   thresholds: `ink`/`ink-2` ≥4.5 on all surfaces; light accents ≥4.5 as text; `ink-3` asserted ≥3:1 and flagged
   large/UI-only; `ink-4` excluded from text pairs; void-on-light-accent ≥4.5 for filled buttons. A deliberately bad
   pair (e.g. `ink` on `lilac-deep` as body) **fails**, proving the guard bites.
4. **Fonts load correctly.** Michroma/Saira/JetBrains-Mono/Inter load via `next/font` (no layout shift beyond swap),
   bound to `--font-heading/-display/-mono/-sans`; numerics render tabular; gradient-clip headings keep a legible ink
   fallback under `@supports not (background-clip:text)`.
5. **Atmosphere is perf-safe & gated.** Atmosphere renders behind content, `pointer-events:none`, on compositor-only
   props; mobile throttles (no starfield drift); under `prefers-reduced-motion` **all** atmosphere/orb/decorative
   animation is static while layers/presence remain. Asserted via the motion-token media layer + an e2e/CSS check.
6. **Focus-visible everywhere.** Every interactive element shows the lilac focus ring on `:focus-visible`; ring meets
   ≥3:1 against all surfaces; bloom collapses to a static ring under reduced-motion; no `outline:none` without a
   visible replacement (lint/e2e).
7. **Targets & keyboard.** Interactive targets ≥44×44px on touch breakpoints; full keyboard operability with logical
   order and ESC/arrow conventions (e2e on a representative surface).
8. **Never color alone.** Component-level assertion (carried into `29`) that state surfaces pair color with
   icon/label/weight; no state distinguishable by color alone.
9. **Responsive foundation.** Type/atmosphere/spacing/glass/target behavior differs correctly across mobile/tablet/
   desktop per §8 (breakpoint snapshot/structure assertions); the app is functional and legible on all three.

Needs the later human pass (NOT gate-verifiable here):
- The *exact* gradient stops/animation timing of the orb, the precise grain texture and starfield density, the silver-
  bezel highlight curve, and the final "does it feel like AUSPEX" judgment — tuned with a human in the room against
  `docs/design/auspex-reference.html` (North Star "human in the room" + AUSPEX-fidelity per `DESIGN.md`).

---

## Dependencies / blocked-by
- **`specs/27` Theming Framework** — the token taxonomy, swap mechanism, `ThemeProvider`, `registry.ts`, and
  `contrast.test.ts` this spec POPULATES (hard prereq; `auspex` is a theme *in* that framework).
- **`02` Foundation** — `layout.tsx` (font loading, `<html>` data-theme), `globals.css` (`@theme inline` + per-theme layer).
- **`specs/10` IA / `24` Mobile-PWA** — the nav shells/breakpoints that consume the foundation (atmosphere/type/spacing).
- **`docs/NORTH-STAR.md`** — the ethos every token serves; **`phase5-staging/DESIGN.md`** +
  `docs/design/auspex-reference.html` — the canonical AUSPEX source ported here.

## Non-goals
- Building components, charts, or surfaces (`29` component library; `30`–`33` shells/surfaces) — this is foundation only.
- A user-facing theme picker, per-league/per-persona theming, or a light `auspex` sibling (AUSPEX is dark-only here).
- Final voice/character tuning (the cast's *words* — `12`/`26`); this makes the cast's surfaces *look* right only.
- Re-architecting Tailwind/shadcn/Base UI or the `27` framework itself (we fill its `auspex` slot and extend tokens).
```

