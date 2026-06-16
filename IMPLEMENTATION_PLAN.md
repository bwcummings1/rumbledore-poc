# IMPLEMENTATION_PLAN.md — Phase 4: Reality & Tunability

Disposable, loop-maintained backlog. The loop works `## Scope` until none unblocked + gates green (writes `.loop/SCOPE_DONE`), then auto-runs the value-ranked `## Icebox` ×10 (`PROMPT_harden.md`), then stops at the review checkpoint.
One task = one sentence, no "and". **Build toward `docs/NORTH-STAR.md`.** Phases 1–3 are complete (git history + `docs/PROGRESS.md §8`). Full roadmap: `docs/ROADMAP.md`. Specs of record: `specs/25` (real integrations + cost safety), `specs/26` (model & tone tunability), `specs/27` (theming framework). Real API keys are live in `.env.local` (Anthropic/Odds/SportsDataIO/Tavily/Voyage). **AI here is for VALIDATION ONLY — prove the pipeline functions with real services; do NOT iterate tone/voice (that's the user's later fine-tuning). Keep spend bounded: cheap models, spend guard, fixture-first tests.**

## Scope — Phase 4 (build in order)

### P. Real integrations & cost safety (see specs/25)
- [x] Complete clean env-gated mock→real selection for Anthropic, Odds, SportsDataIO, Tavily, and Voyage. (specs/25)
- [x] Default all AI to cheap models (Haiku, voyage-4-lite) via a model-tier config. (specs/25)
- [x] Build the per-provider spend guard that caps usage and falls back to mock on breach. (specs/25)
- [x] Add secret-free usage logging/observability for provider calls. (specs/25)
- [x] Build the VCR fixture-first test harness with gated live-smoke validation per provider. (specs/25)

### Q. Model & tone tunability framework (see specs/26)
- [x] Build the pluggable model-provider abstraction including a custom fine-tuned/self-hosted endpoint. (specs/26)
- [x] Add data-driven per-task model routing (cheap/flagship/custom). (specs/26)
- [x] Externalize persona tone/voice as versioned config records. (specs/26)
- [x] Add versioned, composable, diffable prompt templates. (specs/26)
- [x] Build the `eval:ai:variants` A/B harness that scores model×tone variants and names a winner. (specs/26)

### R. Theming framework (see specs/27)
- [x] Build the design-token system (primitives → semantic aliases → Tailwind/CSS vars). (specs/27)
- [ ] Build the ThemeProvider and data-theme swap (SSR-safe, no FOUC) with palette-a/palette-b slots. (specs/27)
- [ ] Add contrast and reduced-motion accessibility gates on the tokens. (specs/27)
- [ ] Migrate components to tokens incrementally, keeping the impeccable gate green. (specs/27)

## Icebox (value-ranked; the build auto-hardens ×10 after Scope)
Carried/forward — **re-verify each before acting.**
- [ ] **[onboarding/DEFERRED] Real Browserbase cookie-capture is human-paired** — do NOT attempt autonomously; keep mocked. The live POC needs the user's device (Phase 4b).
- [ ] (loop appends discovered bugs/improvements here during Phase 4)

## Discoveries / bugs (loop appends here)
- [ ] [cost-safety/OBSERVED] TavilyWebGrounding still relies on the SDK call without explicit timeout/AbortSignal cancellation; re-check when provider spend guards/usage wrappers land.
- [ ] [ai-tone/OBSERVED] Article byline surfaces still derive persona labels from `DEFAULT_PERSONA_CARDS`; re-check when league-edited persona metadata is exposed in UI.
