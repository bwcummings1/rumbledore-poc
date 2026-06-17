# DESIGN.md — Rumbledore design system

> ⛔ **SUPERSEDED.** The authoritative design system is **`docs/design/rumbledore-design-language.md`**
> (the **AUSPEX / HASHMARK** visual language), with the byte-exact reference at
> `docs/screenshots/reference-images/` (the HTML + renders). Build to that, **near-pixel**.
>
> An earlier version of this file described a **different, contradictory** system — *green primary,
> "no glassmorphism / no glow / no gradient text / no purple."* That was a provisional placeholder and is
> now **WRONG**: it directly contradicted the owner's design and was a root cause of the first build missing
> the look. **AUSPEX is intentionally glassy, glowing, gradient-headed, and lilac — executed with craft.**

## The system (summary — full spec in the authoritative doc)
- **Primary = lilac `#A7A9EC`** (NOT green). **Value = amber `#E2B266`.** Steel = data, jade = positive, coral = negative.
- **Required, not forbidden:** glass panels (translucent + `backdrop-blur` + inset bevel), **glow halos**,
  **gradient-clipped Michroma headings**, the **conic AI orb**, **silver Y2K bezels**, the live **atmosphere**
  (stars / scanlines / grain / vignette), and **LCD** numerics.
- Type: Michroma (headings) · Saira (display) · JetBrains Mono (data/LCD) · Inter (body, sparingly).
- Radii 7 / 11 / 14. **Information-dense.** Mobile/tablet/desktop parity. Honor `prefers-reduced-motion`.

## The `impeccable` gate — REMOVED for this project
`npx impeccable detect` flags glassmorphism, gradient text, glow/neon, and purple "AI" gradients as "slop."
**AUSPEX is intentionally all of those.** The impeccable gate is therefore **incompatible with this design**
and **must not gate AUSPEX work** — treat it as disabled (see `AGENTS.md`). Visual quality is enforced by
**faithfulness to the reference** (the design-language doc + reference images), alongside typecheck/lint/test/build.
