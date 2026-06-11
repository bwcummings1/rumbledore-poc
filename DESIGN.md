# DESIGN.md — Rumbledore design system (impeccable format)

> PROVISIONAL baseline following impeccable anti-slop rules. To be replaced/tuned when the owner provides
> his UI style images. Run `npx impeccable detect src/` as a gate. Extend tokens; don't override reflexively.

## Register
Product register (app: dashboards, feeds, betting) + a lighter Brand register for marketing/onboarding.

## Anti-slop rules (hard)
- NO purple/indigo "AI" gradients, NO gradient text, NO glassmorphism, NO unmotivated neon.
- NO generic SaaS-template look. Restraint over decoration. Earn every accent.
- Real hierarchy: size/weight/spacing do the work before color does.

## Color (oklch; dark-first)
- Background: `oklch(16% 0.01 250)` ; Surface: `oklch(21% 0.012 250)` ; Elevated: `oklch(25% 0.014 250)`
- Text: `oklch(96% 0.01 250)` ; Muted text: `oklch(72% 0.015 250)`
- Border/hairline: `oklch(30% 0.012 250)`
- Primary (action): `oklch(72% 0.15 145)` (a confident field-turf green) ; Primary-fg: `oklch(18% 0.02 145)`
- Positive: `oklch(75% 0.16 150)` ; Negative: `oklch(64% 0.20 25)` ; Warning: `oklch(80% 0.14 85)`
- Accent (sparing, for live/odds highlights): `oklch(78% 0.13 60)`
- Light theme is a derived inversion; ship dark first.

## Type
- UI/body: Geist or Inter, 400/500/600. Numerics: tabular figures for stats/odds/standings.
- Scale (6 steps): 12 / 14 / 16 / 20 / 28 / 40 px. Line-heights tuned for dense tables vs prose.
- Display/editorial (blog/headlines): a sharper grotesk or serif for the Narrator voice — one family, used deliberately.

## Spacing & radii
- Spacing (7 steps): 4 / 8 / 12 / 16 / 24 / 32 / 48.
- Radii: 6 (controls) / 10 (cards) / 16 (sheets). Borders 1px hairline; elevation via subtle shadow, not glow.

## Components (variants)
- Button: primary / secondary / ghost / destructive. Inputs: default/focus/error/disabled visible states.
- Card: standard / stat / live. Tables: dense, tabular-nums, zebra-free, hairline separators.
- Motion: 150–220ms ease-out; purposeful (state changes, live ticks), never decorative bounce.

## Mobile-first
Thumb-reachable primary actions, bottom nav on mobile, safe-area insets, 44px min touch targets, content-first density.
