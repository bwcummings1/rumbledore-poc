# Spec 41 — Ambient Agent & the WizKit Premium Tier

> Outcomes spec. An **any-page, collapsible AI agent** (the *personal* agent) that reasons over the curated,
> era-aware league data from `specs/36`, plus **WizKit** = the premium tier wrapping it + deep analytics,
> entitlement-gated (gate built, left **open** until pricing). Read `docs/NORTH-STAR.md` first; `DESIGN.md` is a
> gate. Builds on **`specs/36`** (the curated data it reasons over), `specs/30` (shell mount), `specs/17`
> (entitlements), `specs/12`/`07` (AI cast/content infra), `specs/26` (model tunability), `specs/25` (mock until
> keys). Lives in the ambient-agent UI (mounts in the shell — **after** Track B), `src/ai/personal-agent*`,
> entitlement gating. **Track C**, after `36` is merged **and** after `39`'s shell work.

## Why this spec exists (the soul)
The owner's vision: like a top-tier AI app, the user can reach an **agent from any page** — a collapsible
bottom-right panel — and it answers about *their* leagues. The **moat** is that it reasons over **your league's**
history (which no generic site has) — rivalries, era-adjusted records, manager arcs, "what if" — so its value is
only as good as `specs/36`. Keep it **distinct from the league CAST** (`specs/12`): the cast is shared, content-
facing personas authoring the Press; this is the user's **personal assistant**.

## Outcomes
1. **Ambient agent UI** — collapsible, any-page, context-aware (knows current league/page).
2. **Reasons over curated data** — uses `specs/36`'s parameterized, era-aware, ledgered substrate.
3. **WizKit premium tier** — wraps the agent + deep analytics; entitlement gate **built but open** until pricing.
4. **Mock-first** — real AI behind mocks ($0) until keys; the `specs/12` LLM-judge eval gate applies.

---

## A. Two AI things — keep them distinct
**League cast** (EXISTS, `specs/12`): personas authoring the Press *for the league* — shared, spectacle-facing.
**Personal agent** (substrate EXISTS: `src/ai/personal-agent*` + the `/you` briefing, entitlement-aware): the
*user's* assistant. This spec builds the **ambient UI** for the personal agent — it does not touch the cast.

## B. The ambient agent UI
A collapsible panel (bottom-right) reachable from **any page**, per top-tier AI apps. It **mounts into the shell**
(`specs/30`) via a **bounded region Track B exposes**, sequenced **after** `specs/39`'s shell work
(`ORCHESTRATION.md §3` coordination — Track C must not edit `src/navigation` ahead of Track B). Context-aware: it
knows the current league/page and scopes its answers. Designed states: collapsed, open, thinking, empty, gated,
error (AUSPEX, `DESIGN.md` — the orb at the panel's heart).

## C. Reasoning over curated data (the moat)
The agent queries `specs/36`'s parameterized engine (records by segment/era/scope), the curated facts, lore canon
(`specs/13`), and — when available — NFL data, via the AI infra (`specs/07`/`12`) + model routing (`specs/26`). It
answers questions a generic site can't: "who's the playoff choker in the 12-team era," "era-adjusted best season,"
"what if." It **consumes curated/ratified data as fact** and never asserts un-ratified history (mirrors the cast +
lore rule).

## D. WizKit = the premium tier
WizKit is the **premium offering** wrapping the ambient agent + deep pre-computed analytics. Build the entitlement
**gate mechanism** (`specs/17` EXISTS: `resolveEntitlement` + the tiers) for it but leave it **OPEN/ungated** until
the pricing decision (`ORCHESTRATION.md §3`; matches the current free=all-features stance). Non-payers get the
cast; the premium tier unlocks the agent everywhere + the deep analytics.

## E. Design, mock-first & EXISTS/NEW
- **Design:** the collapsible panel + orb in AUSPEX per `DESIGN.md`; all states designed; ≥44px; a11y (focus trap,
  keyboard, reduced-motion). Token-contract test green.
- **Mock-first:** real AI behind mocks ($0) until keys (`specs/25`); the `specs/12` offline LLM-judge eval gate
  runs (`pnpm eval:ai:offline`).
- **EXISTS — extend:** `src/ai/personal-agent*` + `/you` briefing, AI infra (`specs/07`/`12`), entitlements
  (`specs/17`), model routing (`specs/26`), the shell (`specs/30`).
- **NEW:** the ambient any-page collapsible UI; the shell mount (bounded region, after Track B); the agent's query
  over `specs/36`'s parameterized/curated data; the WizKit premium framing + the (open) gate; designed states.

## F. Acceptance criteria (testable, fixture-backed)
1. **Any-page panel.** The agent panel opens (collapsible) from any page in any scope; collapsed/open/thinking/
   empty/gated/error states render; focus-trapped, keyboard-navigable, reduced-motion respected.
2. **Curated-data reasoning.** Against the seeded fixture, the agent returns correct era/segment-aware answers
   (e.g. "most playoff points in era 2" matches `specs/36`/`37` numbers); it cites curated facts, not raw/un-tagged
   guesses.
3. **Distinct from cast.** The personal agent is separate from the `specs/12` cast pipeline (no shared surface);
   the cast still authors the Press unchanged.
4. **Gate built, open.** The WizKit entitlement gate exists and is exercised in tests, but is **open** (free = all)
   per current config; flipping it closed is a config change, not new code.
5. **Mock AI + eval.** Tests pass offline with mocked AI; `eval:ai:offline` gate runs.
6. **Shell coordination.** The agent mounts via Track B's exposed shell region without Track C editing
   `src/navigation` ahead of `specs/39` (orchestrator-enforced; reviewable in the diff).
7. **AUSPEX + gates.** Fidelity per `DESIGN.md`; `typecheck/lint/test/build/ubs` pass.

### Needs the later human pass
Agent voice/persona, panel choreography, which deep-analytics ship in WizKit, and the eventual pricing/gate
behavior — tuned with the owner (+ pricing decision, Phase 6).

## Dependencies / blocked-by
- **Builds on** `specs/36` (curated data) — hard prerequisite; `specs/30` (shell mount, after `specs/39`),
  `specs/17` (entitlements), `specs/12`/`07` (AI infra), `specs/26` (model routing), `specs/25` (mock until keys).
- **Coordination** (`ORCHESTRATION.md §3`): mounts into the shell **after** Track B's `specs/39` work.
## Non-goals
- Pricing/billing (deferred, Phase 6 / `specs/17` future); the league **cast** (`specs/12`); the data **substrate**
  (`specs/36`); News/Arena environments (`specs/39`).
