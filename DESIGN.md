# DESIGN.md — Rumbledore Design System (AUSPEX / HASHMARK) · AUTHORITATIVE

> **Single source of truth for all visual styling.** The byte-exact reference is
> `docs/screenshots/reference-images/ui-ux-style-reference-code-from-images.html` (the HTML/CSS that produced
> the reference renders) plus the renders `docs/screenshots/reference-images/*.png`. **Fidelity bar: near-pixel** —
> reproduce the reference's components, color, radius, shadow, glow, font, and spacing exactly, not "directionally."
>
> This is the **only** prose design doc — an earlier parallel spec was folded into this file and removed. Where this
> doc and the reference HTML disagree, **the reference HTML wins** — fix this doc.
>
> **Owner deviations from the reference gallery (deliberate — follow these, not the gallery):**
> 1. **No big gradient-clipped section headings.** The gallery clips section titles white→lilac; in-app that reads
>    distracting. Use **plain/solid headings** at section/page level; carry structure with **small mono panel labels**.
> 2. **The WIRE ticker sits at the TOP**, directly below the top bar (not a bottom row).
> 3. Headings render in **Michroma** (the reference's `Microgramma` is commercial; Michroma is the loaded face and
>    reads close enough — do not chase a different face).

---

## 0. The aesthetic
"**Prime-Intellect research restraint × Sony Y2K hardware soul × sports HUD.**" A near-black blue **void** under a
faint live **atmosphere** (starfield · scanlines · film grain · vignette). Content floats on **translucent glass
panels** with **inset bevels + soft drops**, divided by **translucent hairlines** (never solid grey rules). Accents
emit **soft glow halos**. Chrome is **silver Y2K bezel**. The AI presence is a spinning **conic-gradient orb**.
Numbers are **LCD readouts**. Dense, precise, tactile, "expensive" — lots of signal per panel.

## 1. Tokens — `:root` (port VERBATIM)
```css
:root{
  /* surface scale */
  --void:#08090F; --void-2:#0B0D16; --void-3:#0E1019;
  --hull:#12131D; --hull-2:#161826; --hull-3:#1B1D2B;
  --panel:rgba(20,22,34,.62); --panel-2:#161826; --panel-solid:#12131D;
  /* hairlines */
  --hair:rgba(150,156,190,.13); --hair-2:rgba(155,162,196,.24); --hair-3:rgba(170,176,210,.40);
  --line:rgba(150,156,190,.16); --line-2:rgba(170,176,210,.30);
  /* ink scale */
  --ink:#E7E9F3; --ink-2:#AEB2C8; --ink-3:#6E7290; --ink-4:#494D66;
  /* accents — lilac primary, amber value, steel/jade/coral semantic */
  --lilac:#A7A9EC; --lilac-hi:#C7C8F6; --lilac-deep:#6F72C9;
  --amber:#E2B266; --amber-deep:#B98A38;
  --steel:#82B2D0; --steel-soft:#A6CEE6;
  --jade:#6FC79A; --coral:#E08A8A; --coral-deep:#C46A6A;
  /* glow + bevel */
  --glow-lilac:rgba(167,169,236,.35); --glow-amber:rgba(226,178,102,.30);
  --bevel:inset 0 1px 0 rgba(190,196,235,.10), inset 0 0 0 1px rgba(255,255,255,.012);
  /* radius */ --r-sm:7px; --r-md:11px; --r-lg:14px;
  /* type families */
  --disp:'Saira',ui-sans-serif,system-ui,sans-serif;
  --head:'Michroma','Saira',ui-sans-serif,sans-serif;   /* (ref lists Microgramma/Eurostile first; commercial → Michroma) */
  --mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
  --body:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
}
```
**Color semantics (carry meaning, never decorate):** **lilac** = primary / interactive / AI-cast; **amber** = value /
money / bankroll / premium (LCD); **steel** = data / baseline; **jade** = positive / win; **coral** = negative / loss.
Hairlines are translucent (.13–.40 alpha), **never** solid grey.

**Body background (exact):**
```css
background:
  radial-gradient(1200px 700px at 78% -8%, rgba(111,114,201,.12), transparent 60%),
  radial-gradient(900px 600px at 8% 108%, rgba(185,138,56,.06), transparent 55%),
  linear-gradient(180deg,#0E1019,#08090F 60%);
```

## 2. Atmosphere — 4 fixed layers behind everything (z-index 0, pointer-events none)
- **stars** — 8 layered radial-gradient 1px dots, `opacity:.5`, `twinkle 7s` (.46↔.64).
- **scan** — `repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px)`, `opacity:.38`, `mix-blend-mode:soft-light`.
- **grain** — inline SVG `feTurbulence` fractal noise, `opacity:.045`.
- **vignette** — `radial-gradient(120% 90% at 50% 40%,transparent 55%,rgba(0,0,0,.55))`.

## 3. Signature elements (NON-NEGOTIABLE)
- **Orb (AI core)** — 34px, `conic-gradient(from 220deg,#8E7BE6,#C77BD0,#E2A85C,#5FC9C0,#8E7BE6)`,
  `box-shadow:0 0 22px var(--glow-lilac)`, `spin 7s`; `::after` inset dark radial core. `.sm`=24 / `.lg`=52; `.think`=1.5s + bigger halo.
- **Y2K bezel** — `linear-gradient(158deg,#1b1d29,#0d0f17)` + a 1.2px gradient border via `mask-composite`. `chip-glyph` = mono glyph.
- **Glass panel** — `var(--panel)` + `backdrop-filter:blur(16px) saturate(118%)` + `1px var(--hair)` border + `var(--bevel),0 10px 30px rgba(0,0,0,.22-.28)`, radius `--r-lg`. The default surface — not an opaque card.
- **Boot** — brief full-screen void splash (orb + mono log/LCD), fades to app; collapses under reduced-motion.

## 4. App shell
- **Topbar** (~54px) — glass + blur, bottom hairline + a lilac center-glow underline. Brand (Michroma, wide tracking,
  lilac glow), mono breadcrumb, ⌘K search, notifications, account, motion toggle, live clock.
- **WIRE ticker** — **directly below the top bar (TOP), full content width.** A thin **ticker strip** (not a glass
  card): a lilac **tag chip** on the left + a masked horizontal marquee of mono items (di/am/jd/co colored segments).
  One wire only — it lives in the shell, never duplicated inside a surface.
- **Rail** (left, ~188–240px) — glass + blur; section labels mono ~8.5px .22em ink-4; items Saira ~12.5px; **active** =
  lilac text + `linear-gradient(90deg,rgba(167,169,236,.12),transparent)` + 2px lilac left-border + icon glow. Collapses to icon-only on narrow.
- **Main** — comfortable padding, smooth scroll, content-dense.

## 5. Typography
- **Section / page headings** — `--head` (Michroma), uppercase, **plain solid ink** (NOT gradient-clipped), modest size
  (≈ section 18–21px). Optionally a small lilac mono index/eyebrow beside them. **Do not use the big white→lilac gradient
  clip for section titles** (owner preference).
- **Panel headers** — small **mono uppercase labels** (≈9–11px, .12–.16em tracking, ink-3/ink-4), optionally a bezel
  chip-glyph. This — not a big heading — is how individual panels are titled.
- **Display** `display-l` (Saira 500, ~28px, solid) for occasional large solid headings.
- **Eyebrow** — mono ~10.5px, .26em, uppercase, ink-3.
- **LCD readouts** — mono 500, large, **amber `text-shadow:0 0 16px var(--glow-amber)`**, tabular; `.lilac` variant. Money/headline numbers glow.
- **Metric** — mono tabular. **Body** = Inter, used **sparingly** (chrome + data dominate; most labels are mono).

## 6. Component catalog (exact CSS in the reference HTML `<style>`)
- **Buttons** — pill (radius 22px), mono uppercase 11px .12em, bevel; hover = lilac border + glow ring + translateY(-1px). Variants primary(lilac)/steel/amber/danger/ghost; sm/lg; block; disabled .38; loading.
- **Inputs/controls** — field (dark inset bg, focus = lilac border + glow), textarea, switch (lilac fill + glowing thumb), segmented pill, check/radio (lilac fill), slider (lilac track + glowing thumb), stepper (amber value), select (glass menu), selectable chips (lilac wash).
- **Data** — sortable mono-header tables (hover wash), status pills (mono uppercase, currentColor border; live=jade, settled=lilac, lost=coral), badges/tags/edges, key-value rows, stacked avatars (solid color chips + dark mono initials), meters/progress/capacity-blocks/ladder (lilac/amber glow), stat tiles (label/value/delta; amber glows).
- **Charts** — hand-built animated SVG (18 generators). Lilac=lead, amber=value, steel=baseline, jade/coral=good/bad, hairline grids, draw/grow reveals, amber LCD readouts. Use gauges/radars where the reference does (e.g. matchup win-prob = a circular gauge, not a flat bar).
- **Feedback/overlays** — alert (neutral bg + colored icon-chip + colored border, info=steel), banner (lilac wash), toast (glass + colored border), tooltip/popover (glass), skeleton (sweeping shimmer), empty (centered mono + orb), dialog/sheet/command-palette (glass, mono labels).
- **Navigation** — mono breadcrumb, tabs (Saira, lilac underline active), pager, steps (done=jade, now=lilac glow).
- **Patterns (density target)** — panels with bezel-glyph + mono-label headers + dense content; lineup/roster rows, insight cards (priority dot), `chat.ai` conic-orb cast avatars, centered gauge readouts. See `reference-behaviour-patterns.png` for the composition + density bar (dossier, matchup hero w/ gauge, lineup, trade-verdict ring, AI thread).

## 7. Motion
count-up readouts, draw-in charts, orb spin/think, hover-lift + focus-bloom, WIRE marquee, win/record stingers, atmosphere twinkle, skeleton shimmer. **All collapse under `@media (prefers-reduced-motion:reduce)`** and the in-app motion toggle.

## 8. Responsive
- `≤1100px`: 4/3-col grids → 2; wide spans → narrower.
- `≤820px`: rail → icon-only; multi-col → 1; hide breadcrumb.
- Parity across **mobile / tablet / desktop**; adapt the desktop reference to mobile sensibly (stack, keep density where it reads); ≥44px touch targets; honor reduced-motion.

## 9. Pitfalls (do NOT repeat)
1. **Suppressing signatures** — weak glass/glow, flattened treatments, flat-gray orb, missing atmosphere/bezels.
2. **Generic components** — default-dark-Tailwind look instead of the bevel/glow/LCD/pill treatments.
3. **Too sparse** — under-dense vs the reference's tight, signal-rich panels; over-relying on empty states + big headings.
4. **Half-migrated/old patterns** — tokens dropped on old layouts; duplicated components (e.g. a surface re-rendering a shell element). Rebuild composition in this language; keep one implementation per element.

## 10. Mapping to Rumbledore (copy the LOOK, not the demo content)
The reference is HASHMARK's DFS demo. Take styling/components/density exactly; keep Rumbledore's own IA + data.
**orb → the AI cast**; `chat.ai` → cast threads; LCD/amber stat → **bankroll**; ladder/leaderboard table → **standings / Arena**; slide-over sheet → **bet slip**; the WIRE → the **league wire**; steps → **onboarding**; gauge/radar/charts → matchup / odds / records viz.
