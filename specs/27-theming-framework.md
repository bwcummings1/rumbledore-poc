# Spec 27 — Theming Framework (design tokens + swappable palettes)

> **SUPERSEDED — anti-slop invariants DO NOT APPLY.** This spec's "anti-slop" rules (no AI gradients / no gradient
> text / no glassmorphism / no neon / "subtle shadow never glow" / oklch primitives) are **superseded and no longer
> apply.** AUSPEX intentionally uses **glow, gradient text, glass, and HEX colors.** The authoritative design source
> is `DESIGN.md` (AUSPEX). Keep this spec's framework/plumbing guidance; ignore its
> visual "anti-slop" prohibitions wherever they conflict with AUSPEX.

> Outcomes spec. Defines WHAT the theming framework delivers and the contract every component must honor — not the
> final visual identity. Embed the North Star (`docs/NORTH-STAR.md`): Rumbledore is a **league-specific spectacle**,
> mobile-first, snappy, "nothing dated," headed for a **distinctive look later**. Round one was a soulless data
> system; the cure isn't decoration, it's a system where taste, once chosen, applies **everywhere from one place**.
> This spec builds the **plumbing that RECEIVES a palette** so the owner's two candidate palettes can be dropped in,
> compared, and tuned as a *config change* — not a rewrite. **Scope boundary:** this delivers the FRAMEWORK + a sane
> NEUTRAL DEFAULT theme (today's DESIGN.md baseline, relabeled as one theme among many). The actual palette
> selection, the side-by-side optimization of the owner's two palettes, and the full visual identity are a **PAIRED
> step in the Soul phase** (per North Star "surface soul later; human in the room"). Make applying/iterating a palette
> a ONE-PLACE change; do not invent the final look here.
> References: `docs/NORTH-STAR.md`, `DESIGN.md` (provisional baseline tokens), `specs/10` (IA/nav shells that consume
> the theme), `AGENTS.md` (the impeccable UI gate: `npx impeccable detect src/`). Real files: `src/app/globals.css`
> (`@theme inline` + `:root`), `src/components/ui/button.tsx` (CVA token usage), `src/app/layout.tsx`,
> `src/lib/utils.ts` (`cn`), `src/navigation/navigation-shell.tsx`.

## Purpose
Give Rumbledore a **single source of visual truth**. Every color, type step, space, radius, elevation, and motion
duration a component renders must resolve through a **semantic design token**, and the full set of tokens for a look
is a **theme**. Swapping the active theme — light↔dark, or "Palette A"↔"Palette B" — restyles the **entire app** from
one declaration, with **no component edits**. The framework guarantees three things the Soul phase depends on:
1. **Components consume tokens, never literals** — so a palette change propagates everywhere automatically.
2. **A palette is a config object** — dropping in one of the owner's two palettes is editing one file, not the app.
3. **Guardrails travel with the tokens** — contrast and reduced-motion are checked against the token set itself, so a
   bad palette fails a gate instead of shipping.

---

## EXISTS today (do not rebuild; absorb)
- **Tailwind v4, CSS-first.** No `tailwind.config.js`. `src/app/globals.css` declares `@theme inline { … }` mapping
  CSS variables to Tailwind utilities, with the palette values in `:root`. This IS the token layer — we formalize it.
- **A partial semantic token set** already lives in `globals.css`: oklch dark palette, Rumbledore semantics
  (`--surface`, `--elevated`, `--positive`, `--negative`, `--warning`, `--highlight`), the shadcn var contract
  (`--background/--foreground/--primary/…`), a 6-step type scale, and radii (`--radius-control/-card/-sheet`).
- **DESIGN.md** is the **provisional** baseline (explicitly "to be replaced/tuned when the owner provides UI style
  images") with anti-slop rules: no AI gradients, no gradient text, no glassmorphism, no neon; restraint; hierarchy
  via size/weight/spacing before color. These rules are theme-agnostic invariants — they outlive any one palette.
- **shadcn v4 + Base UI + CVA + `cn`** components (`src/components/ui/button.tsx`) already reference tokens
  (`bg-primary`, `text-foreground`, `var(--secondary)`, `var(--radius-md)`) — partial token adoption is the norm.
- **Dark-only, no provider.** `src/app/layout.tsx` hard-sets `color-scheme: dark` on `<html>` and applies fonts.
  There is **no** theme provider, no `next-themes`, no light theme, no runtime swap mechanism, no contrast checking.

## NEW in this spec
- A **formalized token taxonomy** (the contract: what tokens exist, their semantic names, their tiers).
- A **theme = a named token set** abstraction; multiple themes coexist; one is active.
- A **theme provider + swap mechanism** (one place selects the active theme; whole app restyles, SSR-safe, no FOUC).
- **A11y guardrails as gates:** automated contrast checks over token pairs; `prefers-reduced-motion` honored via the
  motion tokens.
- A **migration path** so existing components adopt tokens incrementally with the impeccable gate staying green.
- One **neutral default theme** (today's baseline, named) — and the slots, ready and empty, for the owner's two
  palettes.

---

## Token taxonomy (the single source of truth)

Tokens are layered so a palette swap touches the smallest possible surface. **Components only ever reference Tier 3.**

- **Tier 1 — Primitives (per-theme raw values).** The actual oklch colors, px/rem sizes, ms durations, etc. These are
  the ONLY place literal values appear. They are private to a theme and never referenced by components directly.
- **Tier 2 — Semantic aliases (theme-stable names).** Names that describe *role*, not value: `background`, `surface`,
  `elevated`, `foreground`, `muted-foreground`, `border`, `primary`/`primary-foreground`, `positive`, `negative`,
  `warning`, `highlight`, `ring`. The shadcn contract (`card`, `popover`, `secondary`, `accent`, `destructive`,
  `input`, `sidebar*`, `chart-*`) maps onto these (mapping already documented in `globals.css`: surface→card/popover,
  elevated→secondary/accent, negative→destructive, `highlight` exposes the sparing live/odds accent). Each theme
  binds these aliases to its Tier-1 primitives. **This is the layer a palette swap re-binds.**
- **Tier 3 — Token utilities (what components write).** Tailwind utilities and CSS vars generated from Tier 2 via
  `@theme inline`: `bg-surface`, `text-muted-foreground`, `border-border`, `rounded-card`, `text-lg`, `gap-*`,
  `shadow-elevated`, `duration-fast`. Components compose only these.

Token **categories** the taxonomy must cover (each a documented, named set; values are theme-supplied):
- **Color** — the semantic aliases above. Dark-first; light is a derived/declared sibling theme.
- **Type scale** — the 6 steps from DESIGN.md (12/14/16/20/28/40) with paired line-heights, plus font-family tokens
  (`--font-sans`, `--font-heading`, `--font-mono`; editorial/display family slot for the Narrator voice). Numerics
  use tabular figures for stats/odds/standings (a typography token/utility, not per-component CSS).
- **Spacing** — the 7-step DESIGN.md scale (4/8/12/16/24/32/48) expressed as space tokens; components use scale steps.
- **Radius** — `control` (6) / `card` (10) / `sheet` (16), already present.
- **Elevation** — a small set of shadow tokens (`shadow-flat/-raised/-overlay`); subtle shadow, never glow (anti-slop).
- **Motion** — duration + easing tokens (`--duration-fast`≈150ms, `--duration-base`≈220ms, `--ease-out`); purposeful,
  150–220ms ease-out per DESIGN.md. **Reduced-motion has first-class motion tokens** (see Guardrails).

**Invariant:** no component, CVA variant, or page may contain a raw color/size/duration literal where a token exists.
Hardcoded hex/rgb/oklch, arbitrary `text-[…px]` font sizes, and inline `transition: …ms` are violations the gate
catches (see Acceptance). Tailwind spacing/utility classes that already map to the scale are the *intended* token use.

---

## Themes = swappable token sets

A **theme** is a named object that binds every Tier-2 alias to concrete Tier-1 values. Themes are **data**, declared
in one place (`src/theme/themes/<name>.ts` + a generated/authored CSS layer), and registered in a single
`src/theme/registry.ts`. The set of themes at framework delivery:

- **`neutral-dark`** — today's `:root` baseline (DESIGN.md provisional palette), relabeled as the default theme. This
  is the "sane neutral default" the scope boundary calls for; it must look identical to today after migration.
- **`neutral-light`** — a derived inversion of `neutral-dark` (DESIGN.md: "light theme is a derived inversion; ship
  dark first"). Proves the framework supports light/dark, not a final light identity.
- **`palette-a` / `palette-b`** — **empty, registered slots** (start as clones of `neutral-dark`) reserved for the
  owner's two candidate palettes. Filling one is editing that one file's Tier-1 values. **The Soul-phase paired step
  populates and optimizes these; this spec does NOT choose their values.**

**The swap mechanism** (the heart of the framework):
- Active theme is set by a **data attribute** on `<html>` (e.g. `data-theme="neutral-dark"` + a `dark`/`light` class
  for color-scheme), so each theme's Tier-2 bindings live under a single CSS selector (`[data-theme="x"] { … }`).
  Switching the attribute restyles the whole app via the cascade — **zero component re-render needed for the colors**.
- A **`ThemeProvider`** (`src/theme/theme-provider.tsx`) wraps the app in `src/app/layout.tsx`, owns the active
  theme + mode (light/dark) in React context, exposes `useTheme()`, and writes the `data-theme`/class to `<html>`.
- **SSR-safe, no FOUC.** The active theme is resolved before paint (inline pre-hydration script reading the persisted
  choice / `prefers-color-scheme`), matching the SSR markup so there is no flash and no hydration mismatch. Default
  active theme = `neutral-dark` (preserves today's behavior).
- **Persistence** of the user's choice (light/dark and, when exposed, palette) survives reloads. Whether a palette
  picker is user-facing or owner/config-only is a **Soul-phase decision**; the framework supports both — the
  mechanism is identical, only who sets the attribute differs.

**One-place-change guarantee (the deliverable):** to apply one of the owner's palettes app-wide, you edit exactly one
theme file (its Tier-1 values) and, if making it the default, one line in the registry/provider default. No page,
component, or CVA file changes. This is the property the Soul-phase iteration loop relies on.

---

## A11y guardrails (checked against the tokens, not the screenshots)

- **Contrast checks on token pairs.** A test (`src/theme/contrast.test.ts`) enumerates the **foreground/background
  pairs every theme must satisfy** — e.g. `foreground`÷`background`, `foreground`÷`surface`/`elevated`,
  `muted-foreground`÷`surface`, `primary-foreground`÷`primary`, `negative`/`positive`/`warning` text on their
  intended grounds — and asserts WCAG ratios (body text ≥ 4.5:1; large/UI text ≥ 3:1). Runs for **every registered
  theme**, so a new palette (incl. the owner's) that fails contrast **fails the gate** before it ships. Computation is
  on the token values (oklch → relative luminance), independent of rendering.
- **Reduced-motion is first-class.** Motion duration tokens collapse to ~0ms under
  `@media (prefers-reduced-motion: reduce)`, applied globally in the token layer so **every** token-driven transition
  respects it without per-component code. Components that animate must use motion tokens (not literal `ms`) so the
  guard reaches them. (North Star "snappy" stays — reduce removes *decorative* motion, not responsiveness.)
- **Color is never the only signal.** A theme-agnostic invariant carried from DESIGN.md: state (positive/negative/
  live) pairs color with icon/label/weight, so palette swaps can't strand colorblind users. (Asserted at the
  component level where state is rendered, not in the token layer.)
- **`color-scheme` follows the active mode** so native form controls/scrollbars match (replaces the hardcoded
  `color-scheme: dark` in `globals.css`).

---

## Migration approach (incremental; gate stays green)

No big-bang rewrite. The token *layer already exists* in `globals.css`; we formalize and extend it, then sweep
components from literals → tokens in safe batches.

1. **Extract & formalize (no visual change).** Move the `:root` block into a `neutral-dark` theme layer keyed by
   `[data-theme="neutral-dark"]`; keep the `@theme inline` Tier-3 mapping. Add the `ThemeProvider` + pre-paint script,
   defaulting to `neutral-dark`. **Visual diff = zero**; this is a pure refactor and a green-gate checkpoint.
2. **Add the missing token categories.** Introduce elevation + motion tokens and the space-step tokens not yet named;
   declare `neutral-light` as the derived sibling; register the two empty palette slots.
3. **Sweep components to tokens, batch by batch.** Replace literal colors/sizes/durations with token utilities,
   one component group at a time (`src/components/ui/*` first, then `src/navigation/*`, then feature views). Each
   batch ends with `npx impeccable detect src/` green and `pnpm test` passing — so `main` is always shippable and the
   impeccable gate never regresses (`AGENTS.md`).
4. **Lint the contract.** Add a check that flags new raw color/size/duration literals in `src/components` and
   `src/app` (a lint rule or a token-lint test), so adoption can't silently backslide after the sweep.
5. **Soul-phase handoff (out of scope here).** With the framework green, the paired step fills `palette-a`/`palette-b`
   from the owner's images, compares them live by flipping `data-theme`, runs the contrast gate on each, and promotes
   the winner to default — all without touching components.

**Migration is complete** when no component references a color/size/duration literal that a token covers, and the app
is pixel-identical to pre-migration under `neutral-dark`.

---

## Acceptance criteria (testable)

Gate-verifiable (`pnpm test`, the impeccable detector, e2e):
1. **Components read tokens, not literals.** A token-lint test scans `src/components/**` and `src/app/**` and finds
   **zero** raw color literals (hex/rgb/hsl/oklch), zero arbitrary font-size literals, and zero inline `transition`/
   duration literals where a token exists. `npx impeccable detect src/` passes.
2. **Swap restyles app-wide from one place.** Setting `data-theme` (or calling `useTheme().setTheme`) to a different
   registered theme changes the **rendered/computed** values of `--background`, `--foreground`, `--primary`, etc.
   across the tree, with **no component file changed**. A test asserts computed styles differ between two themes for a
   shared component, and that editing a single theme file (Tier-1 values) is the only change needed to repaint the app.
3. **Light/dark both registered and switchable.** `neutral-dark` and `neutral-light` both resolve; toggling mode flips
   `color-scheme` and the palette; default active theme is `neutral-dark` (today's look preserved).
4. **Palette is a config object.** `palette-a` and `palette-b` are registered themes; a test confirms a theme can be
   added/edited purely as data in `src/theme/themes/*` + `registry.ts` with no component edits, and that it then
   participates in the swap and contrast gates.
5. **Contrast checks pass for every theme.** `contrast.test.ts` runs the required foreground/background pairs for
   **all** registered themes and asserts WCAG ratios (≥4.5:1 body, ≥3:1 large/UI); a deliberately bad-contrast theme
   fixture **fails** the test (proving the guard bites).
6. **Reduced-motion respected.** Under `prefers-reduced-motion: reduce`, token-driven durations collapse to ~0;
   asserted via the motion token media-query layer and an e2e/CSS check on an animated surface.
7. **No FOUC / no hydration mismatch.** SSR renders with the resolved active theme; the pre-paint script sets the same
   attribute before first paint; hydration produces no theme-related warning and no flash.
8. **Migration is non-regressive.** After the extract step, `neutral-dark` renders identically to the pre-spec
   baseline (visual/computed-style parity check), and every migration batch leaves the impeccable gate and `pnpm test`
   green.

Needs the later human/Soul-phase pass (NOT gate-verifiable here):
- The actual values of the owner's two palettes, their side-by-side optimization, and the final visual identity / the
  "distinctive spectacle look." This spec fixes the **framework, the contract, and the guardrails**; the palette and
  taste are chosen with the owner in the room (North Star "surface soul later" + the impeccable gate).

---

## Dependencies / blocked-by
- **`02` Foundation** — app skeleton, `layout.tsx`, `globals.css`, `cn` (the token layer this formalizes).
- **`10` IA/Nav** — the Global/League shells (`NavigationShell`, sidebar/bottom-tabs) are token consumers; their
  migration is part of the sweep.
- **`DESIGN.md`** — supplies the provisional baseline values that become `neutral-dark` and the theme-agnostic
  anti-slop invariants.
- **`AGENTS.md`** — the impeccable gate (`npx impeccable detect src/`) that must stay green through migration.

## Non-goals
- Choosing or optimizing the owner's two palettes, or defining the final visual identity / spectacle look (Soul phase).
- A user-facing theme-picker UI as a product feature (the *mechanism* is delivered; exposing it is a Soul-phase call).
- Per-league or per-persona theming, animation choreography, or motion design beyond honoring reduced-motion.
- Re-architecting Tailwind/shadcn/Base UI or changing the component library (we extend the existing token layer).
