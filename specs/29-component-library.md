# Spec 29 — Component Library (AUSPEX)

> Phase 5 build spec. Defines the **complete interactive + display component catalog**, every component
> restyled to the **AUSPEX visual language** ("HASHMARK // Interface System"). This is the exhaustive
> reference: the implementing agent should never have to wonder how a component looks, what states it has,
> or how it behaves at any breakpoint.
>
> READ FIRST: `phase5-staging/DESIGN.md` (design brief + inventory) and
> `phase5-staging/specs/28-design-system-foundations.md` (tokens/type/motion/atmosphere/a11y — the substrate
> this spec consumes). The interactive HTML reference lives at `docs/design/auspex-reference.html`.
> The chart library (18 generators) is **out of scope here** — owned by spec `28`/data-viz; this spec covers
> the meters/progress/pips/stat-tiles that are *not* chart generators.
> References: `specs/10` (IA — informs nav components), `specs/30` (app shell consumes nav bits),
> `specs/31` (editorial register), `specs/24` (mobile/PWA).

## 0. Scope, stack & conventions

**Stack (EXISTS — do not re-pick).** Next.js App Router · React 19 · TypeScript · **Tailwind v4**
(`@import "tailwindcss"`, `@theme inline` tokens in `src/app/globals.css`) · **base-ui** (`@base-ui/react/*`)
for headless behavior/a11y · **CVA** (`class-variance-authority`) for variant maps · `cn()`
(`src/lib/utils.ts`, clsx + tailwind-merge) · `lucide-react` icons. `color-scheme: dark` is global.

**EXISTS vs NEW (authoritative inventory).** Only two real components exist today:

| Path | Status | Action |
|---|---|---|
| `src/components/ui/button.tsx` (+ `.test.tsx`) | EXISTS | **Restyle in place** — keep `Button`/`buttonVariants` exports & base-ui `Button` primitive; replace the CVA class strings with AUSPEX variants/sizes below. |
| `src/components/publication/story-card.tsx` (+ `story.ts`, `.test.tsx`) | EXISTS | Belongs to spec `31`; this spec only restyles the atoms it composes (button, badge, kv). |
| `src/components/pwa/*` | EXISTS | Behavior only; restyle visible toggle via the Switch/Toast atoms here. |
| every other surface (`src/app/**`) | EXISTS as ad-hoc inline-styled views | **No primitive extracted yet** — they hand-roll markup. |

Everything else in this catalog is **NEW**: create under `src/components/ui/` (interactive + display atoms) with
a co-located `*.test.tsx`. Views in `src/app/**` MUST be refactored to consume these primitives (delete inline
ad-hoc markup) — a component is "done" only when at least one real view uses it. Each NEW component: a CVA
variant map, base-ui headless primitive where behavior/a11y is non-trivial (dialogs, menus, tabs, tooltip,
popover, switch, slider, select, checkbox, radio), `data-slot` attribute for styling hooks, forwarded props,
and `forwardRef`/`asChild` where base-ui provides it.

**AUSPEX styling primitives (from spec 28; referenced by token name throughout).** Glass `.panel`
(`--panel` bg + `backdrop-blur` + `--bevel`), hairline borders (`--hair`/`--hair-2`/`--hair-3`, never solid grey),
soft halos not neon (box-shadow with `--glow-lilac`/`--glow-amber`), Y2K silver bezel (`.bezel`), radii
`--r-sm 7px`/`--r-md 11px`/`--r-lg 14px`. **Color semantics:** lilac `--lilac`=PRIMARY/interactive/active,
amber `--amber`=VALUE/money, steel=data, jade=positive, coral=negative. **Type:** Michroma headings,
Saira display/eyebrow, JetBrains Mono `.lcd/.metric/.num/.kbd`, Inter body (sparingly).

**Universal mandates (apply to EVERY component; not repeated per entry unless it deviates).**
- **Responsive:** every component specifies Mobile (≤640) / Tablet (641–1024) / Desktop (≥1025). Mobile-first.
- **Touch targets ≥44×44 CSS px** on coarse pointers (`@media (pointer:coarse)`); visual size may be smaller but
  the hit area must not be. Spacing between adjacent targets ≥8px.
- **WCAG-AA contrast:** body/icon text ≥4.5:1, large text & UI/graphical boundaries ≥3:1 against their actual
  glass-over-void backdrop (verify with composited bg, not the token in isolation — spec 28 contrast table).
- **Focus:** visible focus ring on every focusable element — 2px `--lilac` outline + soft `--glow-lilac` bloom,
  `outline-offset:2px`; `:focus-visible` only (no ring on mouse). Never remove outline without a replacement.
- **Keyboard:** full operability; documented per component. Logical tab order; no traps except modal/drawer.
- **Reduced motion:** `@media (prefers-reduced-motion:reduce)` collapses all transitions/animations to opacity
  fades ≤120ms or none; hover-lift, draw-in, count-up, orb-spin, marquee, indeterminate sweeps freeze/simplify.
- **Disabled:** `aria-disabled`/`disabled`, `opacity:.5`, `pointer-events:none`, no hover/active, removed from tab
  order only when truly inert (prefer `aria-disabled` + focusable for explainable controls).
- **States vocabulary** used below: **default / hover / active(pressed) / focus / disabled / loading / empty /
  error** (+ `selected`/`checked`/`expanded`/`current` where applicable).

**Global acceptance (every component):** (a) renders all documented states without layout shift; (b) keyboard +
screen-reader operable per its entry; (c) all interactive hit areas ≥44px on coarse pointers (asserted via
computed style/bounding box in test); (d) honors `prefers-reduced-motion`; (e) contrast verified against
composited backdrop; (f) consumed by ≥1 real view; (g) co-located test covers variants + primary interaction.

---

## 1. Buttons — `src/components/ui/button.tsx` (EXISTS · restyle)

Keep the base-ui `Button` + CVA shape. Replace variant/size strings.

**Variants** (`variant`): `primary` (lilac) — `--lilac-deep`→`--lilac` gradient fill, `--void` ink, inner
`--bevel`, soft `--glow-lilac` on hover. `steel` (secondary/data) — glass `--panel` bg, `--hair-2` border,
`--steel` text. `amber` (value/confirm-money, e.g. "Place bet") — `--amber-deep`→`--amber` fill, `--void` ink,
`--glow-amber` halo. `danger` — `--coral` text on `rgba(coral,.12)`, `--coral-deep` border (destructive). `ghost`
— transparent, `--ink-2` text, hover wash `rgba(lilac,.08)`. (Map legacy `default→primary`, `secondary→steel`,
`destructive→danger`, `outline→steel`, `link`→ghost-underline; keep names exported for back-compat.)

**Sizes** (`size`): `sm` h-32px / `md` h-40px (default) / `lg` h-48px. **Mobile:** default min hit area 44px —
`sm` keeps 44px touch area via padding even at 32px visual height. **Icon variants:** `icon-sm`/`icon`/`icon-lg`
square (32/40/48), centered single `lucide` icon, mandatory `aria-label`. **`block`** prop → `w-full` (full-width;
default for primary CTAs on mobile). Icons: `[&_svg]:size-4`, `gap-2`, leading/trailing slots via `data-icon`.

**States.** default: per-variant fill. hover: +brightness ~6% + halo bloom + `translate-y:-1px` lift (reduced-
motion: brightness only). active: `translate-y:1px`, halo dims. focus: AUSPEX ring (§0). disabled: §0 universal.
**loading:** `loading` prop → swap label for an inline AUSPEX spinner (conic mini-orb, `--lilac`), keep button
width (reserve via `min-width`), `aria-busy=true`, `disabled` interaction, label kept for SR via visually-hidden.
**No empty/error state** (atomic action).

**Responsive.** Mobile: primary actions `block`, stacked, 12px gap; secondary may be `ghost`. Tablet/Desktop:
inline auto-width, right-aligned action rows.
**A11y.** `role=button` (native), `Enter`/`Space` activate, `aria-disabled` when soft-disabled with reason,
`aria-busy` while loading, icon-only requires `aria-label`. Contrast: lilac/amber fills use `--void` ink (≥4.5:1).
**Accept:** all 5 variants × 3 sizes + icon + block + loading + disabled render & are keyboard-activatable; loading
sets `aria-busy` and blocks clicks; icon-only without `aria-label` fails a lint/test assertion.

---

## 2. Inputs

All field-type inputs share an AUSPEX **field shell**: glass `--panel-2` bg, `--hair-2` border (→`--hair-3` on
hover, →`--lilac` + `--glow-lilac` ring on focus), `--r-md` radius, `--ink` text, `--ink-3` placeholder, JetBrains
Mono for numeric fields. **Error:** `--coral` border + faint coral glow + `aria-invalid=true` + message slot.
**Disabled:** §0. Min control height 44px on mobile, 40px desktop. Every field pairs with a NEW `Field` wrapper
(label + control + hint + error) — `src/components/ui/field.tsx` — wiring `htmlFor`/`id`/`aria-describedby`/
`aria-invalid` automatically.

- **2.1 Text Field** (`src/components/ui/input.tsx`, NEW; base-ui `Input`). Single-line. States: default/hover/
  focus/disabled/error/read-only. Optional leading icon + trailing affix/clear-button (clear = icon-button,
  `aria-label="Clear"`). Mobile full-width 44px; correct `inputmode`/`autocomplete`/`enterkeyhint`.
- **2.2 Search** (`src/components/ui/search-input.tsx`, NEW). Text field + leading `Search` glyph + debounced
  clear; `role=searchbox`, `type=search`, `Escape` clears. Used by tables, switcher (spec 30), command palette.
- **2.3 Textarea** (`src/components/ui/textarea.tsx`, NEW). Auto-grow (min 3 / max 12 rows then scroll), char
  counter slot, same field shell. Mobile: full-width, `enterkeyhint=enter`. For long-form lore/claim bodies.
- **2.4 Select** (`src/components/ui/select.tsx`, NEW; base-ui `Select`). Trigger = field shell + `ChevronDown`;
  popup = glass panel, `--hair` separators, lilac wash on highlighted option, `Check` on selected. **Mobile:**
  options list opens as a **bottom sheet** (reuse §6.4) when >6 options or coarse pointer; native `<select>` is an
  acceptable fallback only if a11y parity holds. Keyboard: `Space/Enter` open, arrows move, type-ahead, `Esc`
  close, `Home/End`. `role=combobox`+`listbox`, `aria-expanded`, `aria-activedescendant`.
- **2.5 Stepper** (`src/components/ui/stepper.tsx`, NEW). Numeric −/value/+ ; value in `.metric` mono, amber when
  it's money (bet amount). Buttons 44px, hold-to-repeat (cancel under reduced-motion → single step). Clamps
  min/max/step; `role=spinbutton`, `aria-valuenow/min/max`, `ArrowUp/Down` adjust. Error if out of range.
- **2.6 Switch** (`src/components/ui/switch.tsx`, NEW; base-ui `Switch`). Track `--hull-3`→`--lilac` (on); thumb
  silver bezel with halo. 44px hit area (track ~36×20 visual). `role=switch`, `aria-checked`, `Space` toggles.
  Restyles `pwa/league-notification-toggle`. Reduced-motion: instant thumb move.
- **2.7 Segmented control** (`src/components/ui/segmented.tsx`, NEW). 2–4 mutually-exclusive options in one glass
  bezel; selected segment = lilac wash + `--bevel` + `--ink`; sliding indicator (reduced-motion: instant).
  `role=radiogroup`, arrows move + select, roving tabindex. **Mobile:** if labels overflow → full-width equal
  segments or fall back to Select. Used for table view-toggles, scope filters.
- **2.8 Slider** (`src/components/ui/slider.tsx`, NEW; base-ui `Slider`). Track `--hair-2`, filled `--lilac`,
  thumb silver bezel + halo, value bubble in `.metric`. Single + range. `role=slider`, arrows/`PageUp/Down`/
  `Home/End`, `aria-valuetext`. **Mobile:** thumb ≥44px touch, larger hit slop. Reduced-motion: no bubble animn.
- **2.9 Checkbox** (`src/components/ui/checkbox.tsx`, NEW; base-ui `Checkbox`). Box `--hair-2` border on glass;
  checked = lilac fill + `--void` check glyph; indeterminate = lilac dash. 44px hit area incl. label. `Space`
  toggles, `role=checkbox`, `aria-checked` (`mixed` for indeterminate).
- **2.10 Radio** (`src/components/ui/radio.tsx`, NEW; base-ui `RadioGroup`). Ring `--hair-2`; selected = lilac dot
  + halo. Arrow-key navigation within group, roving tabindex, `role=radiogroup`/`radio`. 44px rows on mobile.
- **2.11 Selectable chips** (`src/components/ui/chip.tsx`, NEW). Pill, glass bg, `--hair-2` border; selected =
  lilac wash + `--lilac` border + halo; optional leading glyph + trailing `X` (removable). Multi-select group =
  `role=group` of toggle-buttons (`aria-pressed`); removable chip's `X` is a 44px icon-button with `aria-label`.
  **Mobile:** horizontal scroll-snap row or wrap; ≥8px gaps. Used for filters/tags (genre, position).

**Inputs accept.** Each input renders default/hover/focus/disabled/error; `Field` wires label↔control↔error via
ids and toggles `aria-invalid`/`aria-describedby`; keyboard contract per entry verified; coarse-pointer hit area
≥44px; numeric/money fields use mono + amber.

---

## 3. Command palette — `src/components/ui/command-palette.tsx` (NEW; base-ui `Dialog`)

Global ⌘K launcher: jump to leagues/sections, run actions, search. **Desktop/Tablet:** centered glass modal
(560px max), `--bevel` + scanline atmosphere, opens on `⌘K`/`Ctrl K`. Header = `Search` glyph + borderless
mono input; body = grouped result list (section eyebrows in Saira, `--ink-3`), each row icon + label + optional
`kbd` shortcut hint; highlighted row = lilac wash. Footer = `kbd` legend (↑↓ navigate · ↵ select · esc close).
**Mobile equivalent:** there is no keyboard — expose a **full-screen sheet** triggered from the app-shell search
affordance / top-bar (spec 30); slides up from bottom, occupies full viewport, large 48px rows, sticky search
header with `enterkeyhint=search`, swipe-down or `Cancel` to dismiss. Same result model, sheet chrome.

**States.** default: recent/suggested actions. typing: live-filtered, debounced; **empty:** "No matches" empty
state (§6.10) with the query echoed + a "Search the league" fallback action. **loading:** when results are async,
3 skeleton rows (§6.9). active row: lilac wash; **error:** inline alert row if search backend fails.
**A11y.** `role=dialog` `aria-modal=true`, labelled by hidden "Command palette"; the input is `role=combobox`
`aria-expanded` `aria-controls` the listbox; results `role=listbox`/`option` with `aria-activedescendant`; arrows
move active descendant (input keeps focus), `Enter` runs, `Esc`/overlay-click close, focus trapped, focus
restored to invoker on close. Reduced-motion: fade only, no scale/slide.
**Accept:** `⌘K` opens on desktop; mobile shell affordance opens full-screen sheet; type→filter→`Enter` navigates;
empty + loading + error render; focus trapped & restored; `aria-activedescendant` tracks the highlighted option.

---

## 4. Tables — `src/components/ui/table.tsx` (NEW; semantic `<table>`) + `data-card-table.tsx` (mobile reflow)

AUSPEX data table for standings/leaderboards/markets/records. Glass panel container, header row = Saira eyebrow
`--ink-3` uppercase on `--hull-2`, body rows separated by `--hair` hairlines (no solid rules), numeric cells
mono+tabular right-aligned. **Hover-wash:** row hover = `rgba(lilac,.06)` wash (reduced-motion keeps it, it's
static). **Sortable:** header cells are buttons with a sort glyph; states none/asc/desc, lilac glyph when active,
`aria-sort` reflects state. **Signed values:** positive = `--jade` with leading `+`, negative = `--coral` with
`−`, zero = `--ink-2`; money in amber. Optional sticky header + sticky first column (team/name). Selectable rows
(checkbox col) + row actions (trailing icon-button / overflow menu).

**Responsive reflow (mandate).**
- **Desktop (≥1025):** full multi-column table, sticky header, optional sticky first col, horizontal scroll only
  as last resort with a fade affordance.
- **Tablet (641–1024):** hide low-priority columns (priority order is a prop), keep core 4–5; the rest reachable
  via a row-expand disclosure.
- **Mobile (≤640):** **reflow to stacked cards** (`data-card-table`) — each row becomes a glass card: primary
  cell as the card title (with avatar/pip), remaining cells as key-value rows (§6 / §8 KV) inside. Sorting moves
  into a Segmented/Select "Sort by" control above the list. Never horizontally scroll a wide table on phone.
**States.** default; hover-wash (pointer-fine only); sorting (active header); selected rows (lilac left-edge +
wash); **loading:** N skeleton rows matching column count; **empty:** table-level empty state (§6.10) in the body
spanning all columns; **error:** inline alert above the table + a "Retry" button.
**A11y.** Real `<table>/<thead>/<tbody>/<th scope>`; sortable `<th>` contains a `<button aria-sort>`; row selection
checkboxes have per-row `aria-label`; the mobile card variant uses a `role=list`/`listitem` with the same data and
an accessible name per card; caption/`aria-label` names the table. Keyboard: tab through sort buttons / row
actions; arrow-key cell nav is NOT required (not a grid) unless flagged `role=grid`.
**Accept:** sortable header toggles none→asc→desc with correct `aria-sort`; signed/money cells colored & signed
correctly; at ≤640 the table renders as stacked cards (asserted by query) with all data present; loading/empty/
error render; sticky header stays on scroll (desktop).

---

## 5. Status & labels

- **5.1 Status pill** (`src/components/ui/status-pill.tsx`, NEW). Tiny pill, semantic tone × variant.
  **Tones:** `neutral`(steel), `info`(lilac), `success`(jade), `warning`(amber), `danger`(coral), `live`(lilac +
  pulsing dot, reduced-motion → static dot). **Variants:** `solid` (tonal fill, `--void` ink) / `soft`
  (`rgba(tone,.14)` bg + tone text + tone border) / `outline`. Optional leading dot or glyph. Used for bet status
  (open/won/lost/void), member roles, claim status (pending/canon/disputed). `≥3:1` boundary contrast.
- **5.2 Badge** (`src/components/ui/badge.tsx`, NEW). Count/notification badge (number or dot) anchored to icons/
  tabs/avatars; lilac fill, `--void` ink, `99+` cap; `aria-label="N unread"`; dot-only variant for "has activity".
- **5.3 Tag** (`src/components/ui/tag.tsx`, NEW). Read-only categorization label (section, position, provider) —
  glass, `--hair-2`, `--ink-2`, optional provider glyph. (Selectable variant = the Chip §2.11; tag is static.)
- **5.4 Edge** (`src/components/ui/edge.tsx`, NEW). The AUSPEX "value/verdict" marker — a small bezeled readout for
  +EV / odds-edge / trade-verdict: mono value (e.g. `+6.5%`), jade if favorable / coral if not, faint matching
  glow, optional eyebrow label. Larger display sibling of the pill; used in Bet & trade-verdict patterns.
**A11y/states.** All are non-interactive by default → no focus; color is never the *sole* signal (pair tone with a
glyph/label/sign). If a pill is a filter toggle it becomes a Chip (§2.11). Disabled n/a.
**Accept:** each tone renders with ≥3:1 boundary contrast and a non-color signal; badge caps at `99+` with SR
label; live pill animation stilled under reduced-motion.

---

## 6. Feedback & overlays

- **6.1 Alert / inline banner** (`src/components/ui/alert.tsx`, NEW). In-flow message block. Tones info(lilac)/
  ok(jade)/warn(amber)/danger(coral): soft tonal bg, tone left-edge bar, leading glyph, title + body + optional
  action buttons + dismiss. `role=status` (info/ok) or `role=alert` (warn/danger, assertive). States: default,
  dismissible (X = 44px icon-button), with-action. Mobile: full-width, stacked actions.
- **6.2 Banner** (`src/components/ui/banner.tsx`, NEW). Page/app-level wide notice (offline/PWA, entitlement
  upsell, maintenance) pinned top of content or shell. Glass strip, tone-tinted, one inline CTA + dismiss; persists
  across the surface. Offline banner is `role=status` `aria-live=polite`. Restyles `src/app/offline/page.tsx`
  messaging. Mobile: under the top bar, does not cover bottom tabs.
- **6.3 Toast** (`src/components/ui/toast.tsx` + `toaster.tsx`, NEW; base-ui `Toast`). Transient glass card, bottom
  region, tone glyph + message + optional action + auto-dismiss (default 5s, pause on hover/focus, never auto-
  dismiss `danger`). **Desktop/Tablet:** bottom-right stack (max 3, collapse overflow). **Mobile:** bottom-center,
  above the bottom tab bar, full-width-minus-gutter, swipe-to-dismiss. `role=status`/`alert` per tone,
  `aria-live`; focus not stolen; reachable via an `F6`/region landmark; reduced-motion → fade not slide.
- **6.4 Modal / Dialog** (`src/components/ui/dialog.tsx`, NEW; base-ui `Dialog`). Centered glass panel + `--bevel`,
  dimmed+blurred void scrim, header(title/close) · body · footer(actions). Sizes sm/md/lg. **Mobile (≤640): a modal
  renders as a bottom SHEET** (see 6.5) — the same Dialog primitive, sheet presentation. States: open/closing,
  loading (busy footer), error (inline alert in body), scrollable body with sticky header/footer. A11y:
  `role=dialog aria-modal`, focus trap, focus to first focusable / restore to invoker, `Esc` + scrim-click close
  (suppress scrim-close for destructive/unsaved), `aria-labelledby`/`describedby`, background `inert`/`aria-hidden`.
- **6.5 Drawer ⇄ Bottom Sheet** (`src/components/ui/sheet.tsx`, NEW; base-ui `Dialog`). The bet slip / parlay
  console / detail panels / switcher / filters. **Desktop/Tablet: side drawer** (right or left, ~420px, glass,
  slides in). **Mobile: bottom sheet** — slides up, rounded top, drag-handle (grabber), snap points
  (peek/half/full), swipe-down + backdrop-tap to dismiss, content scrolls within. Same primitive, breakpoint
  decides edge. Sticky header + sticky action footer (e.g. "Place bet" amber button). States: open/snap-positions/
  closing/loading/empty/error. A11y: dialog semantics as 6.4; the grabber is a labelled control (`aria-label`,
  also keyboard-resizable via arrows); focus trap; `Esc` closes. Reduced-motion: fade, no slide.
- **6.6 Tooltip** (`src/components/ui/tooltip.tsx`, NEW; base-ui `Tooltip`). Tiny glass label, `--hair-2`, on hover
  (≥300ms)/focus; arrow; auto-flip. **Pointer/keyboard only — never the sole carrier of essential info** (touch has
  no hover). On touch, the labelled control either needs no tooltip or uses a Popover (6.7) on tap. `role=tooltip`,
  `aria-describedby`; dismiss on `Esc`/blur; stays while hovered (hover-bridge). Reduced-motion: instant.
- **6.7 Popover** (`src/components/ui/popover.tsx`, NEW; base-ui `Popover`). Click/tap-triggered glass panel for
  rich content (mini-menus, filters, info cards, date pick). Anchored, auto-flip, arrow. **Mobile:** large
  popovers degrade to a bottom sheet (6.5). States: closed/open/loading/empty. `aria-haspopup`, `aria-expanded`,
  focus moves in, `Esc`/outside-click close, focus restored. Trigger ≥44px.
- **6.8 Skeleton** (`src/components/ui/skeleton.tsx`, NEW). Loading placeholder — `--hull-2` block with a slow
  lilac-tinted shimmer sweep (reduced-motion → static block, no sweep). Primitives: line, circle (avatar), block,
  card; compose into table-row / stat-tile / story-card skeletons. `aria-hidden` + parent `aria-busy=true`.
  Dimensions must match real content to avoid layout shift.
- **6.9 Empty state** (`src/components/ui/empty-state.tsx`, NEW). Centered glass cell: faint glyph/orb, Saira
  headline, `--ink-3` one-liner, optional primary CTA. Contextual copy (no leagues → connect; no records yet;
  no bets; no matches). `role=status` if it replaces async content. Mobile: vertical, generous padding, CTA `block`.
- **6.10 Gated / locked state** (variant of empty-state). Premium/entitlement lock: lilac padlock glyph, value
  proposition, "Upgrade" amber CTA — **never a broken page** (spec 28 ethos; ties to entitlements). Distinct from
  error: gated is intentional, not a failure.
**Feedback accept.** Modal/drawer trap & restore focus and close on `Esc`; **modal & drawer render as a bottom
sheet at ≤640** (asserted); toasts auto-dismiss except danger and pause on hover; tooltip never the sole info
carrier (touch path verified); skeletons set `aria-busy` and match content dimensions; empty/gated render distinct
copy + CTA.

---

## 7. Meters, progress & data display (non-chart)

- **7.1 Progress bar** (`src/components/ui/progress.tsx`, NEW). Determinate: track `--hair-2`, fill lilac (or amber
  for bankroll-toward-goal), `.metric` % label option. **Indeterminate:** lilac sweep animation across the track;
  **reduced-motion → a static striped/pulsing 33% segment**, no travel. `role=progressbar`, `aria-valuenow/min/max`
  (omit value for indeterminate), `aria-label`.
- **7.2 Capacity block** (`src/components/ui/capacity.tsx`, NEW). Segmented block meter (used/total cells), used
  cells lilac, empty `--hair-2`; tone shifts to amber/coral near limit. `role=meter`-style `aria-valuetext`
  ("7 of 10 slots"). For roster/lineup slot fill, bankroll buckets.
- **7.3 Ladder pips** (`src/components/ui/ladder.tsx`, NEW). Standings/rank ladder of pips; the user's own pip
  (`.pip.me`) glows lilac + bezel, others muted steel; vertical on mobile, horizontal/compact on desktop. Conveys
  rank position. Each pip has an accessible name (rank + team); the "me" pip announced. Non-color rank label too.
- **7.4 Stat tile** (`src/components/ui/stat-tile.tsx`, NEW). Glass cell: Saira eyebrow label, big `.lcd` value
  (amber for money/bankroll, lilac for telemetry, with LCD glow), optional delta (signed jade/coral) + sparkline
  slot + caption. Count-up animation on mount (reduced-motion → instant final value). Grid of tiles on desktop,
  2-up on tablet, 1-up/horizontal-scroll on mobile. `role=group` named by the eyebrow; value not conveyed by color
  alone (sign + label). Used for bankroll, record headline numbers, league pulse.
**Accept.** Progress exposes `aria-valuenow` (determinate) / labels indeterminate; indeterminate sweep freezes
under reduced-motion; capacity announces "N of M"; stat-tile count-up settles to exact value & is instant under
reduced-motion; "me" pip is visually + programmatically distinguished.

---

## 8. Key-value, avatars & presence

- **8.1 Key-value row** (`src/components/ui/kv.tsx`, NEW). Label (Saira eyebrow `--ink-3`, left) ↔ value (`--ink`,
  right; mono+amber for money, signed colors for deltas), `--hair` divider between rows. `KVList` container =
  `<dl>`/`<dt>`/`<dd>`. Used in dossiers, settings, sheet detail bodies, mobile table-card internals. Mobile:
  label stacks above value when value is long. A11y: real `dl/dt/dd` association.
- **8.2 Avatar** (`src/components/ui/avatar.tsx`, NEW; base-ui `Avatar`). Round, silver bezel ring; image with
  **monogram fallback** generated from name (deterministic lilac/steel tint) when `leagues.logo`/user image is
  missing. Sizes xs/sm/md/lg/xl. `AvatarGroup` = overlapped stack with `+N` overflow chip. Always an `alt`/
  `aria-label` (team/member/league name); decorative-only avatars `aria-hidden` with name nearby.
- **8.3 Presence** (`src/components/ui/presence.tsx`, NEW). Small status dot overlaid on an avatar (or inline):
  online(jade)/idle(amber)/offline(`--ink-4`)/live(lilac pulse). Paired with the avatar's accessible name +
  visually-hidden status text ("online") — never color-only. Reduced-motion stills the live pulse.
**Accept.** Avatar renders monogram fallback when no image; presence state has a text equivalent; avatar group
caps overflow with `+N` and an SR-readable full count.

---

## 9. Navigation bits

(App-shell composition — bottom tabs, sidebar, top bar, switcher sheet — lives in **spec 30**; this section
defines the reusable nav *atoms* spec 30 consumes.)

- **9.1 Breadcrumbs** (`src/components/ui/breadcrumbs.tsx`, NEW). Path trail, `--ink-3` links + `ChevronRight`
  `--hair-3` separators, current = `--ink` non-link with `aria-current=page`. **Mobile:** collapse middle to "…"
  (tap → popover of hidden crumbs) keeping first + current. `<nav aria-label="Breadcrumb">` + ordered list.
- **9.2 Tabs** (`src/components/ui/tabs.tsx`, NEW; base-ui `Tabs`). Underline-style: inactive `--ink-3`, active
  `--ink` with a lilac underline indicator (sliding; reduced-motion → instant) + faint glow. **Mobile:**
  horizontally scrollable tab strip with scroll-snap + edge fade; active scrolls into view; ≥44px tap height.
  `role=tablist`/`tab`/`tabpanel`, `aria-selected`, roving tabindex, `←/→` move, `Home/End`, panel `tabindex=-1`.
- **9.3 Pagination** (`src/components/ui/pagination.tsx`, NEW). Prev / numbered pages / Next; current page = lilac
  wash + `aria-current=page`; ellipsis for long ranges. 44px targets. **Mobile:** condense to "Prev · 3 / 12 ·
  Next" with a tappable page indicator (popover/sheet to jump). `<nav aria-label="Pagination">`; disabled
  Prev/Next at bounds (`aria-disabled`). Prefer this over infinite-scroll where deep-linking matters.
- **9.4 Steps / Wizard** (`src/components/ui/steps.tsx`, NEW). Onboarding progress (connect → discover → claim →
  invite). Step indicator: done = jade check + bezel, current = lilac filled + glow, upcoming = `--hair-2`
  outline; connector hairlines. Horizontal on desktop/tablet, **vertical or compact "Step 2 of 4" + bar on
  mobile**. `<ol>` with each step's status as visible text + `aria-current=step` on current; the indicator is not
  the sole status signal. Pairs with a Stepper-driven multi-screen flow (back/next buttons §1, validation gating).
**Nav accept.** Tabs: arrow keys move selection, only active panel exposed, indicator instant under reduced-motion;
breadcrumbs collapse on mobile keeping first+current with `aria-current`; pagination disables bounds & marks
current; steps mark current with `aria-current=step` and a text status, vertical/compact at ≤640.

---

## 10. Cross-cutting acceptance & test strategy

1. **Catalog completeness** — every component in §1–§9 exists at its cited path (EXISTS restyled or NEW created)
   with a co-located `*.test.tsx` and is exported from a barrel `src/components/ui/index.ts`.
2. **No orphans** — each NEW primitive is consumed by ≥1 refactored view in `src/app/**` (ad-hoc inline markup for
   that pattern is removed). Grep test: no view re-implements a button/table/badge/input by hand.
3. **Responsive contract** — for every component the documented Mobile/Tablet/Desktop behavior is realized;
   breakpoint-switching components (Select→sheet, Modal/Drawer→bottom sheet, Table→cards, Tabs→scroll strip,
   command palette→full-screen sheet) are asserted at ≤640 via render queries / matchMedia mocks.
4. **Touch targets** — automated check: every interactive element's hit box ≥44×44 CSS px under
   `(pointer:coarse)`.
5. **A11y gate** — `jest-axe`/`axe-core` passes with zero violations on each component's stories/states; documented
   roles/keyboard/`aria-*` present; focus visible (§0) and trap/restore correct for overlays.
6. **Reduced-motion** — under `prefers-reduced-motion:reduce`, animated components (button lift, indeterminate
   progress, count-up, tabs/segment indicators, toasts/sheets, live pulses, skeleton shimmer, orb) collapse to
   fade/instant with no travel/loop — asserted.
7. **Contrast** — text & boundary contrast verified against the *composited* glass-over-void backdrop per the spec
   28 contrast table; color is never the sole information signal (sign/glyph/label always paired).
8. **State coverage** — each component renders its full applicable state set (default/hover/active/focus/disabled/
   loading/empty/error + selected/checked/expanded/current) without layout shift; loading uses skeletons or
   `aria-busy`; error pairs a message with `aria-invalid`/`role=alert`.

## Dependencies / non-goals
- **Depends on** spec `28` (tokens/type/motion/atmosphere/a11y substrate — hard prereq; this spec only references
  token names), the EXISTS stack (Tailwind v4 + base-ui + CVA + `cn`), `lucide-react`.
- **Feeds** spec `30` (app shell composes nav atoms §9 + sheet/command-palette), `31` (editorial reuses button/
  badge/kv/avatar/tabs), `32`/`33` (feature surfaces compose this catalog).
- **Non-goals:** the 18 chart generators (spec 28/data-viz); app-shell layout & IA wiring (spec 30); editorial
  reading-mode composition (spec 31); feature-surface assembly & content (32/33); AI voice/character tuning
  (spec 26); final taste/spacing pass (human UI pass).
