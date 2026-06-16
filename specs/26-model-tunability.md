# Spec 26 — Model & Tone Tunability (the seams for fine-tuning the voice)

> Read `docs/NORTH-STAR.md` first; this spec exists to keep its soul tunable. Builds **on** `specs/07-ai-content.md`
> (pipeline, isolation, injection rules — unchanged) and `specs/12-ai-cast.md` (the cast, content types, lore, the
> LLM-judge eval gate). **The AI cast is the soul; its voice will be tuned later by the user** (fine-tuning their own
> models with Unsloth/etc.; iterating persona wording). This spec does **not** tune the voice — it builds the
> **framework that makes tuning and testing frictionless**, so that when a tuned model or a reworded persona lands,
> "is this voice better?" is a **config change + a scored eval run**, not a refactor.

## The shift this spec makes (seams, not voice)
Today the cast works, but three things that *will* change are baked in at the wrong altitude:
1. The **model** is chosen by a hardcoded persona→model map (`flagshipPersonas` set + `defaultModelForPersona` in
   `src/ai/real.ts`); the only real `LlmClient` is `AnthropicLlmClient`. A user's future Unsloth-tuned model has no door.
2. The **tone** is partly data (the `ai_persona_cards` row: beat/POV/tone/promptTemplate) and partly hardcoded English
   in `anthropicSystemInstructions()`. Editing the *voice* means editing code.
3. The **prompt** is assembled inline (`buildPromptParts`) with no version stamp, so iterating the template can't be
   diffed, pinned, or A/B-compared.
And the eval (`pnpm eval:ai:offline`) scores **one** model×tone configuration as pass/fail — it can't **compare two
variants and name a winner**, which is exactly the question fine-tuning raises.

This spec adds four seams — **pluggable model providers** (incl. a custom fine-tuned endpoint), **fully externalized
tone config**, **versioned/composable prompts**, and a **variant A/B eval harness** — all testable on the deterministic
mock LLM/judge, all behind the existing `MOCK_*` discipline, no live API calls required to build or gate.

The bar (North Star): a post should read like it was written by someone in your league for a decade. This framework is
how the user *gets there later* by iterating — without us re-touching `src/ai`.

---

## What EXISTS today (do not rebuild — extend)
- `src/ai/interfaces.ts` — `LlmClient.generate(req) → BlogDraft`, `LlmJudge.score(req) → LlmJudgeScore`,
  `EmbeddingProvider`, `WebGrounding`; `LlmGenerateRequest` carries `contentType`, `persona`, `context`, `prompt`
  (`PromptParts{systemPrefix, volatileContext, prompt}`), `attempt`, `duplicateNudge`.
- `src/ai/real.ts` — `AnthropicLlmClient` (Anthropic SDK direct; `messages.parse` + `zodOutputFormat`; prompt-cache
  `cache_control: ephemeral` on the stable prefix). Constants `ANTHROPIC_FLAGSHIP_MODEL = "claude-opus-4-8"`,
  `ANTHROPIC_BULK_MODEL = "claude-haiku-4-5-…"`. `modelForPersona` is an injectable option but defaults to a hardcoded
  `flagshipPersonas` set. `anthropicSystemInstructions()` holds hardcoded voice/guardrail prose.
- `src/ai/mocks.ts` — `MockLlmClient` (deterministic, fact-tied, type-shaped output; shifts angle on `attempt===2`),
  `MockLlmJudge` (token-match authenticity + persona markers + cross-league leakage), embedding mocks.
- `src/ai/personas.ts` — `AI_PERSONAS`, `DEFAULT_PERSONA_CARDS` (beat/pointOfView/performsWhen/purpose/tone/
  promptTemplate/minWords/maxWords/triggerConfig), seeded per-league into `ai_persona_cards` by `ensurePersonaCard()`.
- `src/ai/pipeline.ts` — `buildPromptParts()` assembles the cached `systemPrefix` (persona card + stable league facts +
  canon lore) and the `volatileContext` (week results + fenced untrusted news + content-type task + trigger refs);
  near-dup + authenticity-floor + retry, publish + embed.
- `src/ai/judge.ts` — `DEFAULT_LLM_JUDGE_RUBRIC` (authenticity/personaMatch thresholds), `llmJudgeScorePasses`,
  `assertLlmJudgeScorePasses`.
- `src/ai/dependencies.ts` — `createAiDependencies(db, env)` branches `env.services.anthropic.mock` →
  `MockLlmClient` else `AnthropicLlmClient({apiKey})`. (Same pattern for voyage/tavily.)
- `src/core/env/schema.ts` — `ServiceConfig = {mock:true}|{mock:false,apiKey}` discriminated union; `getEnv()` server-only.
- `test/evals/ai/offline.test.ts` + `vitest.ai-eval.config.ts` — `pnpm eval:ai:offline` runs the cast over two golden
  league fixtures (95050 + an isolation league), scores with the mock judge, gates pass/fail. CI backpressure gate.

## What is NEW (this spec)
1. **Pluggable model provider abstraction** — select the generation model by config across Anthropic models AND a
   **custom fine-tuned endpoint** (OpenAI-compatible / Anthropic-compatible / self-hosted URL); **per-task** model
   selection (cheap bulk vs flagship vs custom). No code change to swap.
2. **Externalized tone config** — the persona voice (beats/POV/tone/style/guardrail framing) becomes **data**, the
   `ai_persona_cards` records gain versioned **tone profiles**; the hardcoded voice prose moves out of `real.ts`.
3. **Prompt management** — versioned, composable prompt templates (persona + league-facts cache prefix) that diff/pin.
4. **Variant eval/A-B harness** — extend the LLM-judge eval to score and **compare** model×tone variants and **report a
   winner** on authenticity-to-this-league + persona match, repeatable, one command.

Everything new is behind interfaces, mockable, and tested offline. **This is the framework, not the final voice.**

---

## 1. Pluggable model provider abstraction (swap the model by config)
The existing `LlmClient` interface is already the seam — it stays **unchanged** (`generate(req) → BlogDraft`). What
changes is **how the concrete client is chosen and what backends it can target.**

**Model registry (config/db, resolved server-side via `getEnv()`):** a `ModelProvider` discriminated union extends the
`ServiceConfig` pattern so a future tuned model drops in via env with no code:
```
ModelProvider =
  | { kind: "anthropic"; model: string }                                   // e.g. claude-opus-4-8 / claude-haiku-4-5
  | { kind: "anthropic_compatible"; baseUrl: string; model: string; apiKeyVar?: string }  // self-hosted Claude-shaped API
  | { kind: "openai_compatible"; baseUrl: string; model: string; apiKeyVar?: string }      // vLLM/TGI/Ollama/Unsloth-served
```
- A **`ModelRoute`** maps each generation task to a provider key: `{ flagship, bulk, custom? }`, plus an optional
  **per-persona / per-content-type override** table (`recap → bulk`, `narrator → flagship`, `trash_talker → custom`).
  Resolution order: explicit override → persona/content-type default → route default. This *replaces* the hardcoded
  `flagshipPersonas`/`defaultModelForPersona` logic with a data-driven `resolveModelForTask({persona, contentType})`.
- **Custom fine-tuned endpoint:** the user's Unsloth/LoRA-tuned model is served behind an OpenAI- or Anthropic-shaped
  HTTP endpoint (vLLM, TGI, Ollama, a hosted inference URL). Selecting it is setting `custom.baseUrl` + `custom.model`
  (+ an `apiKeyVar` naming an env var for the bearer token) and pointing a route/override at `custom`. **No code change.**
- **`createLlmClient(provider)`** factory returns the right concrete client:
  - `anthropic` → existing `AnthropicLlmClient` (unchanged path).
  - `anthropic_compatible` → `AnthropicLlmClient` constructed with a `baseURL` override (the SDK supports it) — same
    `messages.parse`/structured-output contract.
  - `openai_compatible` → new `OpenAiCompatibleLlmClient` that POSTs `/v1/chat/completions` with a JSON-schema /
    `response_format` request and **maps the response back into the same `BlogDraft`** (validated by the same
    `blogDraftSchema` — the structured-output contract is the boundary, identical for every provider).
- **Structured-output is the contract, not the provider.** Every provider must return a `BlogDraft` that passes
  `blogDraftSchema`. A custom model that can't emit valid structure is rejected by the same parse step that guards
  Anthropic today (`AI_LLM_RESPONSE_INVALID`) — fail loud, never silently degrade. The pipeline never branches on
  provider; it only sees `LlmClient`.
- **Config-time validation:** a provider with `mock:false` and a missing `baseUrl`/`apiKeyVar` is rejected at env parse
  (mirrors `MOCK_<X>=false requires <KEY>`), so a misconfigured custom endpoint fails fast at boot, not mid-generation.
- **Caching / cost:** the prompt-cache `ephemeral` prefix discipline is provider-aware — Anthropic keeps the
  `cache_control` breakpoint; OpenAI-compatible endpoints get the same prefix-stable ordering (so server-side prefix
  caches, where supported, still hit) but no Anthropic-only field. Confirm exact Anthropic model IDs/params via the
  `claude-api` skill at build time (do not hardcode from memory).

**Data shapes (central config; no league data → not RLS-scoped):**
`model_providers { key (PK), kind, model, base_url, api_key_var, enabled }` and a `model_routes { id, flagship_key,
bulk_key, custom_key, overrides jsonb }` where `overrides` is a `{ "<persona>|<content_type>": providerKey }` map.
Empty/absent custom config = custom route disabled (degrades to flagship/bulk), mirroring how empty Inngest config is
mock per `AGENTS.md`. `resolveModelForTask({persona, contentType})` reads the route + overrides and returns a
`ModelProvider`; an `enabled:false` or unresolved key falls back to the route default (never throws mid-generation).

## 2. Externalized persona/tone config (tone is data, edited/versioned without code)
The cast already lives in `ai_persona_cards` rows — extend that so the **entire voice** is editable data, and move the
hardcoded English out of `real.ts`.
- **Tone profile (new, versioned):** each persona card gains a `tone_profile` (jsonb) + a `tone_version` int. The
  profile holds the *tunable voice*: `beats[]`, `pointOfView`, `styleDirectives[]` (e.g. "lead with the verdict",
  "no hedging"), `diction` hints, `dosAndDonts[]`, and the **guardrail framing** currently hardcoded
  (lore-canon contract, no-real-money, no-leakage) expressed as data the prompt composer renders.
- **`DEFAULT_TONE_PROFILES: Record<AiPersona, ToneProfile>`** seeds the cards (mirrors `DEFAULT_PERSONA_CARDS`); a
  league can override any field per-persona. Editing a profile (or bumping `tone_version`) changes the rendered prompt
  → changes the output, **with no code change** — the acceptance test asserts exactly this.
- **`anthropicSystemInstructions()` becomes data-driven:** the fixed guardrail/lore/section sentences move into a
  shared, versioned **prompt template** (see §3) that renders from `{toneProfile + contentType contract + league
  facts}`. The function in `real.ts` shrinks to "render the active template," so the voice is no longer in code.
- **Provenance:** tone edits are attributable (who/when, `tone_version`), so an eval winner can be traced to the exact
  tone record that produced it (and rolled back). All per-league, RLS-scoped (`WHERE league_id` + `FORCE RLS`), per
  `AGENTS.md` conventions.

**Data shapes (extend the existing per-league `ai_persona_cards`):** add `tone_profile jsonb`, `tone_version int`,
`tone_updated_by text`, `tone_updated_at timestamptz`. The append-only-history option (a `ai_persona_tone_history`
table keyed `{league_id, persona, tone_version}`) is a nice-to-have for rollback/audit; the minimum is the bumpable
`tone_version` on the card. `ToneProfile` is the typed jsonb shape: `{ beats: string[], pointOfView: string,
styleDirectives: string[], diction: string[], dosAndDonts: string[], guardrails: GuardrailFraming }` — and
`GuardrailFraming` carries the lore-canon contract, no-real-money, and no-leakage clauses as data the composer renders
verbatim (so the safety invariants from `07`/`12` are preserved even though the *wording* is now editable).

## 3. Prompt management (versioned, composable, diffable)
`buildPromptParts()` already separates the **cached stable prefix** (persona/tone + league facts + canon) from the
**volatile** suffix (week results + fenced untrusted news + task). Make the template itself a **versioned, composable
artifact**:
- **`PromptTemplate` (data + version):** `{ id, version, sections: PromptSection[] }` where sections are ordered,
  named, composable blocks: `system_role`, `guardrails` (lore/no-money/no-leakage), `tone` (renders the persona
  `tone_profile`), `content_type_contract`, `league_facts` (the cached prefix), `volatile_task`. The **prefix-stable →
  volatile** ordering and the `cache_control` breakpoint placement are **invariant** (cache discipline from `07`/`12`):
  no timestamps/UUIDs before the breakpoint.
- **Versioning + pinning:** a generation run records the `prompt_template_version` + `tone_version` + resolved
  `model_provider_key` it used (extend `ai_generation_runs`). A variant is the tuple
  `{ modelProviderKey, toneVersion, promptTemplateVersion }` — fully reproducible.
- **Diffable:** rendering a template against a fixed fixture produces deterministic text; two versions diff cleanly
  (snapshot test). Iterating wording = bump version, diff, eval — never an inline edit lost to history.
- **Composition is league-scoped and isolation-safe:** `league_facts` is still the only place league data enters, still
  assembled `WHERE league_id` under RLS; untrusted news stays fenced in `volatile_task`. The cross-league canary from
  `07`/`12` still applies — a template can't move league data ahead of the breakpoint or leak another league.

## 4. Variant eval / A-B harness (one-command scored winner)
Extend the offline eval (`12 §8`) from "does this one config pass?" to "**which of these variants is better, and by how
much?**" — the question fine-tuning forces.
- **Variant matrix:** a harness takes a list of variants `{ label, modelProviderKey, toneVersion, promptTemplateVersion
  }` and, for each (variant × golden fixture × content type), generates a `BlogDraft` and scores it with the
  `LlmJudge`. Mock model + mock judge keep it deterministic and offline; real Claude-as-judge + a real custom model
  slot behind the same interfaces later.
- **Scoring + report:** aggregate per-variant `authenticity`, `personaMatch`, and `leakage` across the matrix into a
  **scorecard**; declare a **winner** by a documented rule (e.g. highest mean authenticity with `personaMatch ≥ τ_p`
  and **zero** leakage as a hard gate — any leakage disqualifies regardless of authenticity). Output a machine-readable
  report (per-variant means, deltas, win/loss, disqualifications) plus a human summary line.
- **One command:** `pnpm eval:ai:variants` (mirrors `eval:ai:offline`: `MOCK_ANTHROPIC=true …`) runs the matrix and
  prints/writes the scorecard. The existing single-config gate (`eval:ai:offline`) stays as the **CI backpressure
  gate** (build fails on a generic/persona-broken/leaking fixture); the variant harness is the **iteration tool** the
  user runs when comparing a tuned model or a reworded tone — it reports a winner, it does not block CI by default.
- **A/B is real because variants differ observably on mocks:** the mock LLM derives output from
  `{context, contentType, attempt}` **and the active `toneProfile`/template version**, so two tone variants produce
  different text and the judge separates them — the harness can name a winner deterministically, with no API calls.
- **Determinism contract preserved:** same variant + same fixture → byte-identical draft → identical score (per `12`).

## 5. Isolation & injection (inherited, non-negotiable)
Tone profiles, prompt templates, and model-route config are **league-scoped where they carry league data** (tone cards,
generation-run provenance) with `pgPolicy` + `FORCE ROW LEVEL SECURITY` + `withLeagueContext()`; model-provider/route
config is **central** (no league data). The generation call carries **no tools/secrets**; untrusted news stays fenced;
a custom endpoint is **outbound-only** and treated as untrusted infra — its response is validated against
`blogDraftSchema` before use and never trusted for isolation. The cross-league canary from `07`/`12` extends to the
variant harness: a variant for league A touches only league A's rows, and the judge flags `leakage=true` on any
cross-league token regardless of model.

## 6. Interfaces (all mockable, behind `MOCK_*`)
- **`LlmClient`** — unchanged interface; new concrete `OpenAiCompatibleLlmClient`, plus `AnthropicLlmClient` with a
  `baseURL` override for the `anthropic_compatible` kind. `createLlmClient(provider)` factory. The **mock** is the
  contract for the custom path too: a `MockLlmClient` constructed with a given tone profile + template version returns
  deterministic, fact-tied, tone-distinct output, so the custom-endpoint route is fully testable with **no** real URL.
- **`LlmJudge`** — unchanged; deterministic mock judge as in `12`. Real Claude-as-judge slots in behind it later.
- **`ModelRoute` / `resolveModelForTask`** — pure, unit-tested resolver (override → persona/content-type → route default).
- **`PromptTemplate` renderer** — pure function `{toneProfile, contentTypeContract, leagueFacts, volatile} → PromptParts`,
  versioned, snapshot-tested for diffability.
- **Real impls** slot behind the same interfaces when keys/URLs land (Anthropic IDs/pricing via the `claude-api` skill);
  building and gating require **no** live API calls.

## 7. Acceptance criteria (testable with the MOCK LLM + MOCK judge, deterministic, offline)
- **Swap model via config, no code change:** changing the `ModelRoute` (e.g. `narrator → bulk` instead of `flagship`,
  or `trash_talker → custom`) changes which provider `resolveModelForTask` returns, asserted by a unit test; the
  pipeline still produces a valid `BlogDraft`. No edit to `pipeline.ts`/`real.ts` is needed to re-point a task.
- **Custom-endpoint provider is selectable:** a `ModelProvider` of kind `openai_compatible` / `anthropic_compatible`
  builds the corresponding `LlmClient` via `createLlmClient`; with a mock transport it returns a `BlogDraft` that
  passes `blogDraftSchema`; a malformed response is rejected as `AI_LLM_RESPONSE_INVALID`. A `mock:false` provider with
  a missing `baseUrl`/key is rejected at env parse.
- **Swap a persona's tone via config, output changes:** editing a persona's `tone_profile` (or bumping `tone_version`)
  yields a different rendered prompt and a different mock-LLM draft for the same fixture/trigger — asserted by diffing
  the two drafts; no code change.
- **Prompt template is versioned & diffable:** rendering template v1 vs v2 against a fixed fixture produces a clean,
  deterministic snapshot diff; a generation run records `{modelProviderKey, toneVersion, promptTemplateVersion}`.
- **Variant harness scores two variants and reports a winner:** given two variants differing only in `toneVersion`,
  `pnpm eval:ai:variants` produces a scorecard with per-variant means and names a winner by the documented rule
  (authenticity tiebreak under a personaMatch floor, zero-leakage hard gate); a leaking variant is disqualified.
- **Isolation/injection (inherited):** every variant for league A touches only league A's rows; the mock judge flags
  `leakage=true` on any cross-league token; the adversarial news fixture is not obeyed; RLS still blocks a missing
  `WHERE league_id`.
- **Gates stay green:** `pnpm eval:ai:offline` still gates one canonical config in CI; `pnpm eval:ai:variants` runs
  offline with no live API calls; typecheck/lint/test/build/`ubs` all pass.

## 8. Dependencies / blocked-by
- **Spec 07 (AI Content)** + **Spec 12 (AI Cast):** the pipeline, `LlmClient`/`LlmJudge` interfaces, mocks,
  persona cards, prompt-prefix structure, and the offline eval gate this spec extends.
- **Spec 17 (Entitlements):** model selection interacts with cost tiers — a custom/flagship route may be entitlement-gated
  per league (reuse `resolveEntitlement`); not required to build the seams.
- **Paid keys / custom endpoints** (`ANTHROPIC_API_KEY`, a tuned-model URL + token): **not required** to build or gate —
  the mock LLM/judge cover the model-swap, tone-swap, custom-endpoint, and variant-A/B paths deterministically; real
  impls slot behind the interfaces when the user stands up a tuned model.

## 9. Non-goals (this spec)
- **The final voice / actual fine-tuning.** We do not tune a model or ship a "correct" tone — that is the user's later,
  human-paired step. We build the seams so it's a config + scored eval, not a refactor.
- **Training/serving infrastructure** (Unsloth runs, GPU hosting, the inference server itself) — out of scope; we
  define the *config contract* a served endpoint must satisfy (OpenAI-/Anthropic-compatible structured output).
- **Real Claude-as-judge or human-rater calls in CI** — the gate stays deterministic/offline; real judges slot in later.
- **Per-user voice personalization within a league, multi-sport, image/video** — unchanged from `12`'s non-goals.
