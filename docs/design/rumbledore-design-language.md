# Rumbledore — Design Language (AUSPEX / HASHMARK) · AUTHORITATIVE

> **This is the single source of truth for all visual styling.** The byte-exact reference is
> `docs/screenshots/reference-images/ui-ux-style-reference-code-from-images.html` (the HTML/CSS that
> produced the reference renders) plus the renders in `docs/screenshots/reference-images/*.png`.
> **Fidelity bar: near-pixel.** Every component, color, radius, shadow, glow, font, and spacing value must
> reproduce the reference exactly — not "directionally."
>
> **This supersedes and overrides** the old `DESIGN.md`/`PRODUCT.md` "anti-slop" rules (green primary,
> "no glassmorphism / no glow / no gradient text / no purple") — those described a *different, contradictory*
> system and were the root cause of the first build missing the look. AUSPEX is **intentionally** glassy,
> glowing, gradient-headed, and lilac. That is the design, executed with craft — it is not "slop."

---

## 0. The aesthetic
"**Prime-Intellect research restraint × Sony Y2K hardware soul × sports HUD.**" A near-black blue **void**
under a faint live **atmosphere** (starfield · scanlines · film grain · vignette). Content floats on
**translucent glass panels** with **inset bevels + soft drops**, divided by **translucent hairlines** (never
solid grey rules). Accents emit **soft glow halos**. Chrome is **silver Y2K bezel** (gradient-border chips).
The AI presence is a spinning **conic-gradient orb**. Numbers are **LCD readouts**. Dense, precise, tactile,
"expensive." Information-dense — tight spacing, lots of signal per panel.

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
  --glow-gold:0 0 0 1px rgba(167,169,236,.30),0 0 22px -4px rgba(167,169,236,.50);
  --glow-steel:0 0 0 1px rgba(130,178,208,.35),0 0 18px -4px rgba(130,178,208,.5);
  --bevel:inset 0 1px 0 rgba(190,196,235,.10), inset 0 0 0 1px rgba(255,255,255,.012);
  /* radius */
  --r-sm:7px; --r-md:11px; --r-lg:14px;
  /* type families */
  --disp:'Saira',ui-sans-serif,system-ui,sans-serif;
  --head:'Microgramma','Eurostile','Michroma','Saira',ui-sans-serif,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
  --body:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
}
```
**Color semantics (carry meaning, never decorate):** **lilac** = primary / interactive / AI-cast / telemetry;
**amber** = value / money / bankroll / premium (LCD); **steel** = data / comparison baseline; **jade** =
positive / win / up; **coral** = negative / loss / down. Surfaces step void→hull; ink steps E7E9F3→494D66;
hairlines are translucent (.13–.40 alpha), **never** solid grey.

**Body background (exact):**
```css
background:
  radial-gradient(1200px 700px at 78% -8%, rgba(111,114,201,.12), transparent 60%),
  radial-gradient(900px 600px at 8% 108%, rgba(185,138,56,.06), transparent 55%),
  linear-gradient(180deg,#0E1019,#08090F 60%);
```
Custom scrollbar (10px, `--hair-2` thumb), `::selection rgba(167,169,236,.30)`, `:focus-visible` = 2px lilac outline.

## 2. Atmosphere — 4 fixed layers behind everything (`.atmos`, z-index 0, pointer-events none)
- `.stars` — 8 layered radial-gradient 1px dots, `opacity:.5`, `animation:twinkle 7s` (.46↔.64).
- `.scan` — `repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px)`, `opacity:.38`, `mix-blend-mode:soft-light`.
- `.grain` — inline SVG `feTurbulence` fractal noise, `opacity:.045`.
- `.vig` — `radial-gradient(120% 90% at 50% 40%,transparent 55%,rgba(0,0,0,.55))`.
> The first build **omitted these**. They are required — subtle, mood-setting, never competing with content.

## 3. Signature elements (the things the first build missed — NON-NEGOTIABLE)
**Orb (AI core)** — `.orb` 34px, `background:conic-gradient(from 220deg,#8E7BE6,#C77BD0,#E2A85C,#5FC9C0,#8E7BE6)`,
`box-shadow:0 0 22px var(--glow-lilac)`, `animation:spin 7s linear infinite`; `::after` inset 5px dark radial core.
`.sm`=24px, `.lg`=52px, `.think`=spin 1.5s + bigger halo. **This is the cast's identity — render it, not a flat circle.**

**Y2K bezel (silver chrome)** — `.bezel`: `linear-gradient(158deg,#1b1d29,#0d0f17)` + inset highlight/shadow;
`::before` is a 1.2px **gradient border via mask-composite** (`linear-gradient(150deg,rgba(216,220,242,.92)…)` with
`-webkit-mask … xor`). `.chip-glyph` = 28px mono glyph. The hardware "tell" on panel headers, memory cards, AI chips.

**Glass panel** — `.panel`/`.cell`: `background:var(--panel)` + `backdrop-filter:blur(16px) saturate(118%)` +
`border:1px solid var(--hair)` + `box-shadow:var(--bevel),0 10px 30px rgba(0,0,0,.22-.28)`, radius `--r-lg`.
**This translucency + blur + bevel is the default surface — not an opaque card.**

**Boot sequence** — `#boot`: full-screen void, mono boot-log (lilac `b`, jade `.ok`), progress bar fill 2.1s,
then `#app.live` fades in (`opacity 0→1`). Collapses under reduced-motion.

## 4. App shell (3-row grid: `54px / 1fr / 30px`)
- **Topbar** (54px) — glass + `backdrop-blur(14px)`, bottom hairline + a lilac center-glow underline
  (`::after` gradient). Brand `.logo` (Saira 600, letter-spacing .30em, the `b` in lilac, text glow). `.crumb`
  mono breadcrumb. Right: `.tmeta` (status dots), `.kbtn` (⌘K), `.iconbtn` (motion toggle, `.on`=amber). Live clock.
- **Rail** (188px) — glass + blur, sections `.rsec` (mono 8.5px, .22em tracking), items `.ri` (Saira 12.5px),
  `.active` = lilac text + `linear-gradient(90deg,rgba(167,169,236,.12),transparent)` + 2px lilac left-border +
  icon drop-shadow glow. Collapses to 50px icon-only ≤820px.
- **Main** — `padding:24px 30px 60px`, smooth scroll.
- **Ticker** (30px, "WIRE") — `.tick-tag` lilac chip + `.tick-track` masked marquee (`animation:march 36s`),
  colored segments (di/am/jd/co). Bottom row of the app.

## 5. Typography
- **Section headings** `.sec-h h2` — `--head` (Michroma), 21px, uppercase, **white→lilac gradient text-clip**
  (`background:linear-gradient(180deg,#fff 52%,#C7C8F6 145%);-webkit-background-clip:text;color:transparent`). The
  index `.ix` is small lilac mono. **Gradient-clipped headings are core — do not flatten to solid white.**
- **Display** `.display-xl` (Saira 500, 42px, uppercase, gradient-clip) / `.display-l` (28px solid).
- **Eyebrow** `.eyebrow` — mono 10.5px, .26em tracking, uppercase, ink-3 (the `b` amber).
- **LCD readouts** `.lcd` — mono 500, 30px, **amber `text-shadow:0 0 16px var(--glow-amber)`**, tabular-nums;
  `.lcd.lilac` variant. **Money/headline numbers glow — this is the bankroll/value treatment.**
- **Metric** `.metric` (mono 20px tabular), **kbd** keycaps, **`.nb`** syntax-tinted notebook (c=ink4, k=lilac, s=steel, n=amber, f=jade).
- Body = Inter, used **sparingly** (chrome + data dominate).

## 6. Component catalog (exact specs — see the HTML `<style>` for byte-exact CSS)
**Buttons** `.btn` — pill (radius 22px), mono uppercase 11px .12em, `var(--bevel)` shadow, **hover = lilac border +
glow ring + translateY(-1px)**. Variants `.primary` (lilac gradient fill), `.steel`, `.amber`, `.danger`, `.ghost`;
sizes `.sm/.lg`; `.block`; `:disabled` .38 opacity; `.ld` spinner. Icon button `.iconbtn`.

**Inputs/controls** — `.field` (search/text, focus = lilac border + glow), `.ta` (textarea), `.switch` (lilac-fill
when `.on`, glowing thumb), `.seg` (segmented pill), `.opt`+`.check`/`.radio` (lilac fill when on), `.range` (lilac
track + glowing thumb), `.stepper`/`.stepin` (amber value), `.sel`/`.sel-menu` (dropdown, glass menu), `.chipx`
(selectable chips, `.on`=lilac wash).

**Data display** — `.tbl` (sortable mono headers w/ `.ar` arrow, hover-wash rows, status pills), `.st` status
(live=jade, settled=lilac, lost=coral, void/queued=ink3), `.badge`/`.badge.solid` (b-go/b-fa/b-fl/b-st/b-li),
`.tag` (p0/p1/p2 priority), `.edge` (pos/neg/flat pills), `.kv` key-value rows, `.avatars`/`.av` (stacked,
presence ring `.on`), `.meter` (l/s/a/j colored bars w/ glow), `.progress` (indeterminate sweep), `.blocks`/`.blk`
(capacity, `.full` lilac / `.arm` amber-pulse), `.ladder`/`.pip` (rank, `.me` lilac-glow), `.stat` tile (label/value/
delta; `.sv.amber` glows).

**Charts** — hand-built animated SVG, no plotting dep. Lilac=lead, amber=value/headline, steel=baseline,
jade/coral=good/bad, hairline grids, draw/grow-in reveals. 18 generators: line+area, multi-line, sparkline, bars,
grouped, stacked, hbars, range, radar, scatter, histogram, gauge, donut, activity-rings, equalizer (`.eq` pure-CSS),
heatmap, bullet, node-graph. (Exact generator JS is in the reference HTML `<script>`.)

**Feedback/overlays** — `.alert` (info/ok/warn/danger), `.skel` shimmer, `.empty` (centered, mono caption),
`.tipwrap/.tipbox` tooltip, `.pop` popover, `.banner` (lilac-wash, orb), `.toast` (rise-in, glass+bevel), `.scrim`/
`.modal-box` (glass dialog, rise-in), `.cmdk`/`.cmdbox` (⌘K palette), `.drawer` (right slide-over, e.g. parlay console).

**Navigation** — `.crumbs` (mono breadcrumb), `.tabs`/`.tab` (Saira, lilac underline active), `.pager`/`.page`,
`.steps`/`.step` (wizard; `.done`=jade, `.now`=lilac glow).

**Patterns (composed surfaces — the density target)** — `.panel`+`.panel-h` (header w/ bezel glyph + mono title +
right meta), `.pos` position chips (qb/rb/wr/te/flx), `.slot` lineup rows (`.swap` highlight), `.insight` cards
(priority dot hi/md/lo, hover CTA), `.chat`/`.chat.ai` (conic-orb avatar = the cast), `.gauge-v` centered readout.
See `reference-behaviour-patterns.png` for the composition + density bar (player dossier, matchup hero w/ win-prob
gauge, lineup, trade-verdict ring, AI thread).

## 7. Motion
Keyframes: `spin`, `pulse`, `ring`, `shimmer`, `rise`, `twinkle`, `fill`, `indet`, `eqp`, `march`. Vocabulary:
count-up readouts, draw-in charts (stroke-dash), staged-process status, orb spin/think, hover-lift + focus-bloom,
the WIRE marquee, record/big-win stingers. **All collapse under `@media (prefers-reduced-motion:reduce)`** (the HTML
zeroes animations, stops the ticker, hides `#boot`, shows `#app`).

## 8. Responsive (exact breakpoints)
- `≤1100px`: cols-4/3 → 2; span3 → span2.
- `≤820px`: rail → 50px icon-only (hide labels/sections); cols-2/3/4 → 1 col; spans → 1; hide `.crumb`.
- Mobile-first parity required across **mobile / tablet / desktop**; ≥44px touch targets; honor reduced-motion.

## 9. What the first build got wrong (do NOT repeat)
1. **Suppressed the signatures** — no/weak glass blur, no glow halos, gradient-clipped headings flattened, the orb
   reduced to flat gray circles, **no bezels**, **no atmosphere layers**, **no boot**.
2. **Generic components** — buttons/panels/tables lacked the bevel/glow/LCD/pill treatments; read like default dark Tailwind.
3. **Too sparse** — under-dense vs the reference's tight, signal-rich panels; leaned on empty states.
4. **Old collateral** — surfaces restyled-in-place (tokens dropped on old layouts) instead of rebuilt in this component language.
> Root cause: the implementation agent never saw this reference, and was gated by a **contradictory** `DESIGN.md`
> (green primary, "no glass/glow/gradient/purple") via `npx impeccable detect`. That gate is incompatible with AUSPEX.

## 10. Mapping to Rumbledore (copy the LOOK, not the demo content)
The reference is HASHMARK's DFS demo (AUGUR / Tariq Bell / sportsbook). **Take the styling, components, and density
exactly; keep Rumbledore's own IA + data.** Mappings: **orb → the AI cast**; `.chat.ai` → cast columns/threads;
`.lcd`/amber `.stat` → **bankroll**; `.ladder`/leaderboard `.tbl` → **standings / Arena**; the parlay `.drawer` →
**bet slip**; the WIRE ticker → the **league wire**; `.steps` → **onboarding**; gauge/radar/charts → matchup/odds/records viz.
