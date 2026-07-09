# Spec 45 — Editorial Control Plane (lifecycle, provenance, feedback)

> Outcomes spec. The "CMS layer" — but built as a thin **editorial control plane** over the existing DB-native
> publishing pipeline (`content_item` + `src/ai/pipeline.ts` + cadence engine), NOT an external CMS. Read
> `docs/NORTH-STAR.md` first; `DESIGN.md` is a gate. Builds on **`specs/07` (AI content)**, `specs/38`
> (edit-ledger pattern), `specs/41` (personal agent), `specs/17` (entitlements). Elevates audit tranche **ST-2**
> (personal agent asserts un-ratified history) and closes deferred **H1-13/H1-14**. All work is mock/$0 —
> nothing here flips a real key.

## Why this spec exists (the soul)
The cast writes the league's story, so the league must be able to **trust** it (AI only asserts ratified canon),
**correct** it (ESPN stat corrections make published prose retroactively wrong), **govern** it (a commissioner
can retract a post that crossed a line — with the retraction itself public and audited, never silent), and
**tune** it (persona voices are versioned data with a feedback signal, not vibes). Everything mutable is a
lifecycle transition on append-only state — the same discipline that made the curation substrate trustworthy.

## Outcomes
1. **AI can only assert pushed canon** — enforced by the compiler, not review (branded `CanonCatalog`).
2. **Published content has a lifecycle** (`published → superseded | retracted`), never in-place mutation or DELETE.
3. **Every editorial action is league-visible** in an append-only editorial ledger (the `specs/38` integrity move).
4. **Commissioners get a kill switch and a redo button** (retract / regenerate), both idempotent, both through the
   judge gate — no bypass path exists.
5. **Stat corrections become corrections, not lies** — detected on re-sync, surfaced as labeled supersedes.
6. **Silent skips become visible** — a failure-queue view over `ai_generation_runs`.
7. **Persona voices are editable data** with version history, rollback, and a mock-pipeline preview.
8. **Readers feed the voice loop** — one reaction per member per piece; per-member roast consent caps the
   Trash-Talker's targeting.
9. **Article bodies can carry live data embeds** (score strips, standings movement) rendered from the DB at read
   time — licensing-clean "images" that never go stale.

---

## A. Canon provenance — `CanonCatalog` + personal-agent re-point (DO FIRST)
The trust foundation; everything else composes on it.
- **NEW:** a branded type (e.g. `CanonCatalog`) producible **only** by `composeCanonicalSnapshot`-derived
  builders in `src/stats`. AI context loaders (personal agent league context, cast league-facts) accept
  exclusively that type. Live/draft reads return a distinct `LiveFacts` type; prompts must label it
  ("unofficial, as of …") if used at all.
- **FIX (ST-2):** `personal-agent.ts` league context currently reads live `season_statistics`/materialized
  aggregates + unpushed groupings. Re-point to the pushed-canon catalog. Replay T9's scenario as the regression
  test: edit 2012 score, save, don't push → Record Book **and** the agent both still assert the old value.
- **CLOSE H1-13:** eval cases asserting the agent cites canon and never asserts un-ratified history.
- **CLOSE H1-14:** test the global/no-league branch of `getPersonalAgentAnswer`.

## B. Content lifecycle (state, not mutation)
- **NEW:** `content_item.status` enum: `published` (default; all existing rows) | `superseded` | `retracted`;
  plus `supersedes_content_item_id` (self-FK), `status_changed_at`. No row is ever UPDATEd in body/title after
  publish and never DELETEd by editorial action; edits/regenerations insert a **new row** that supersedes the old.
- Every read surface (fronts, feeds, hub, rails, tailoring, WIRE, push/realtime fan-out, embeddings/memory)
  filters to `published`. Retracted/superseded rows remain queryable for the ledger and lineage views.
- Dedup keys: a superseding row derives its dedup key from the run it replaces (double-click can't fork);
  retracting a retracted item is a no-op.
- State transitions **emit events** on existing realtime channels + push taxonomy (`content.retracted`,
  `content.superseded`) so cached fronts/PWA surfaces invalidate.

## C. Editorial ledger (append-only, league-visible)
- **NEW:** `editorial_actions` table (league-scoped RLS, append-only trigger per AGENTS.md): actor, action
  (`retract | regenerate | correct | tone_edit | tone_rollback`), target content/persona, reason (required for
  retract), before/after refs, timestamp.
- Rendered with the existing `EditLedgerFeed` pattern as an "Editorial" section — league-visible (the visibility
  IS the integrity mechanism, per `specs/38`).

## D. Retract / regenerate (commissioner controls)
- **NEW API:** league-scoped, commissioner/steward-gated routes: retract (reason required) and regenerate
  (re-runs the SAME pipeline — validation → judge → publish-as-supersede). No path skips the judge; a regenerate
  that fails the judge leaves the original in place and records the failed run.
- **NEW UI:** on article views (`press/[postId]`, `posts/[postId]`): commissioner-only actions; retracted
  articles show a designed "Retracted by the commissioner — {reason}" state for members who follow old links;
  superseded articles banner-link to their replacement. Pending regenerate uses the existing cast-orb "writing"
  state primitives.

## E. Corrections (stat-correction reconciliation)
- **NEW:** on re-sync, detect score/result changes for `(league, season, week)`s that published content
  references (content metadata already carries cadence framing/refs). Emit `content.correction.needed`; the
  cadence engine generates a labeled correction (short correction note or full supersede per content type),
  through the normal gate. Ledger row per correction. Idempotent per (content, correction-hash).

## F. Failure queue (observability)
- **NEW UI:** steward/commissioner view over `ai_generation_runs` — judge-skipped, failed, and stale-pending
  runs with reasons and a retry (= regenerate) affordance. "What didn't publish and why" is a first-class screen;
  a league whose Tuesday recap silently skipped must be visible that day.

## G. Tone-profile editor (the Phase-5 vehicle)
- **NEW API + UI** over the existing versioned `ai_persona_cards`: edit tone profile → new version with
  attribution; version history; one-click rollback (= new version copying an old one); **preview** button runs
  the mock pipeline to render a sample paragraph before anything publishes. Commissioner/steward-gated;
  every change ledgered (§C).

## H. Embed blocks (live data as "images")
- **NEW:** structured embed support in content bodies: generation emits typed embed placeholders (e.g.
  scoreboard strip for week N, standings-movement chart, H2H sparkline); the article renderer resolves them to
  existing/new AUSPEX components reading the DB at render time. Embeds are **licensing-clean** (no player
  photos/logos), always current, and reduced-motion-safe. Unknown embed types render as nothing (forward
  compatible), never as raw markup. Template updates make the weekly recap + power rankings emit at least one
  embed each.

## I. Reactions + roast consent (the feedback contract)
- **NEW:** `content_reactions` — league-scoped RLS, one row per (member, content item), tiny fixed emoji set
  (e.g. 🔥 💀 😂 🗑️), recastable. Rendered on story cards + article footer with counts. This is the Phase-5
  tuning signal; skip comments entirely (moderation burden, non-goal).
- **NEW:** per-member `roast_level` (`full_send | light | off_limits`, default `light`) editable by the member
  (and commissioner for unclaimed members). Injected into persona guardrails at prompt build; the judge rubric
  gains a targeting-consent dimension; `off_limits` members are never the butt of trash-talk content. Eval cases
  pin all three levels.

## J. Design & EXISTS/NEW
- **Design:** AUSPEX per `DESIGN.md`; designed empty/loading/retracted states; ≥44px; a11y; token-contract green.
- **EXISTS — extend:** `content_item` (+cols), `ai_generation_runs`, `ai_persona_cards`, `EditLedgerFeed`,
  judge/eval harness, cast-orb states, realtime/push taxonomies, entitlement guards.
- **NEW tables:** `editorial_actions`, `content_reactions` (+ member `roast_level` column) — each with pgPolicy
  + FORCE RLS + **RLS-canary rows on day one** (the audit caught the canary lagging; do not repeat).

## K. Acceptance criteria (testable, fixture-backed)
1. **Canon:** the T9 replay scenario passes (unpushed edit invisible to agent AND Record Book); a `LiveFacts`
   value cannot typecheck into an AI context loader; H1-13/H1-14 tests exist and run.
2. **Lifecycle:** retract hides from every read surface, survives re-import, is idempotent, requires reason,
   writes ledger + event; regenerate supersedes through the judge; a judge-failed regenerate leaves the original.
3. **No bypass:** a test proves every publish path (cadence, reactive, regenerate) calls the judge gate.
4. **Corrections:** a fixture score change on a written-about week produces exactly one labeled correction.
5. **Failure queue:** a judge-skipped run appears with its reason; retry re-runs the pipeline.
6. **Tone:** editing a profile changes subsequent mock output (extend the existing proof to the editor path);
   rollback restores prior output; versions/attribution visible.
7. **Reactions/consent:** one reaction per member enforced by constraint; `off_limits` member never targeted
   across the eval corpus; roast level changes are ledgered.
8. **Embeds:** recap + power rankings render at least one live embed; unknown embed types render nothing.
9. **RLS:** canary covers `editorial_actions` + `content_reactions`; cross-league isolation holds.
10. **Gates:** typecheck/lint/test/eval:ai:offline/build/perf:pwa (routes touched)/ubs/secret-scan all green.

### Needs the later human pass
Reaction emoji set, retracted-state copy, correction-note voice, tone-editor layout density, embed visual design.

## Dependencies / blocked-by
- §A first (trust foundation); §B before §D/§E (lifecycle before controls); §C alongside §D. §F–§I independent
  after §B. No external dependencies; no real keys.
## Non-goals
- An external/general CMS; human-authored posts; comments/threads; real-key generation; moderation policy beyond
  retract + roast consent (Phase 6); per-league custom sections (build when a real need appears).
