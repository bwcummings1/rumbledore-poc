# Spec 25 — Real Integrations & Cost Safety (flip mock→real, cost-bounded, for an unattended loop)

> Outcomes spec. Read `docs/NORTH-STAR.md` first — this spec exists to honor it. Until now the spectacle has been
> rehearsed against deterministic mocks: the cast wrote recaps from a fake LLM, grounded news from a fixture, embedded
> with a hash function, priced bets from canned odds. That proves the *plumbing*. The North Star bar — *real data and
> real AI make the spectacle real* — is only met when the league's actual seasons run through a real Anthropic model,
> real Tavily news, real Voyage embeddings, real Odds/SportsDataIO lines and results. This spec flips those five paid
> services from mock to real **cleanly and SAFELY**, because the loop runs unattended for days and must **never burn
> money or wedge** on a bad config.

## The shift this spec makes (soul, not plumbing)
Mocks make the system *demonstrable*; real services make it *true*. A recap that cites this week's actual injuries
(Tavily), a power ranking embedded against the league's real prior posts (Voyage), an arena bet priced off a live NFL
line (Odds) and settled against the real box score (SportsDataIO), narrated by a real model (Anthropic) — that is the
difference between a tech demo and the show. This spec's job is to make that flip a **one-env-var-per-service** switch
that is already half-landed, then wrap it in the guardrails an unattended multi-day run requires.

## CRITICAL framing — this is a TESTING milestone, not a tone milestone
The goal here is to prove the **pipeline FUNCTIONS end-to-end with real services** — real bytes flow, schemas validate,
fallbacks engage, costs stay bounded. It is **NOT** to iterate the cast's voice, tone, wit, or "does this read as
authentic to this league." Voice tuning comes later, with the user's own fine-tuned models and a human in the room
(per North Star §"Functionality first, surface soul later"). **No autonomous loop effort should go into tone-on-Haiku**
— a cheap model producing structurally valid, on-schema, non-leaking content is a PASS for this spec. Do not add
LLM-judge tone gates, prompt-tuning passes, or "make it funnier" work here. The judge (`src/ai/judge.ts`) stays mocked
in CI; its real-model use is out of scope.

## What EXISTS today (landed 2026-06-11 — confirm, do not rebuild)
- **Per-service env discriminated union** (`src/core/env/schema.ts`). `ServiceConfig = {mock:true} | {mock:false; apiKey}`.
  `parseEnv` resolves each of the six `PAID_SERVICES` via `service(key, mockFlag)`: real iff a key is present and
  `MOCK_<X>` is not forced `true`; `MOCK_<X>=false` with no key is a validation error (names only, never values).
  `env.services.{anthropic,odds,sportsdataio,tavily,voyage,browserbase}` each carry `.mock`.
- **Real clients, already implemented and unit-tested**:
  - `src/ai/real.ts` — `AnthropicLlmClient` (`messages.parse` + `zodOutputFormat`, prompt-caching breakpoints,
    `ANTHROPIC_FLAGSHIP_MODEL`/`ANTHROPIC_BULK_MODEL`/`VOYAGE_EMBEDDING_MODEL` constants), `TavilyWebGrounding`,
    `VoyageEmbeddingProvider`.
  - `src/betting/real.ts` — `TheOddsApiProvider`, `SportsDataIoResultsProvider`.
  - `src/news/real.ts` — `TavilyCentralNewsSource`.
- **Dependency factories that branch on `.mock`** (`src/ai/dependencies.ts`, `src/betting/dependencies.ts`,
  `src/news/dependencies.ts`) — each picks the mock or the real client per service. This is the seam every flip rides on.
- **Mock fallbacks** for every service (`src/ai/mocks.ts`, `src/betting/mocks.ts`, `src/news/mocks.ts`): deterministic,
  offline, used by `eval:ai:offline` and the whole test suite.
- **Real keys validated live** and present in `.env.local`: `ANTHROPIC_API_KEY`, `THE_ODDS_API_KEY`,
  `SPORTSDATAIO_API_KEY`, `TAVILY_API_KEY`, `VOYAGE_API_KEY`.

**Confirm-and-complete checklist (EXISTS, must be verified true):**
- [ ] Each of the five services flips to its real client when `MOCK_<X>` is unset/false and the key is present, and
      falls back to mock otherwise — assert in `dependencies.test.ts` for all three factories.
- [ ] No code reads `process.env.<KEY>` directly; everything goes through `getEnv().services.<x>` (per `AGENTS.md`).
- [ ] Browserbase stays mock-only here (deferred to a human-paired POC — see §6).

## What CHANGES / is NEW (this spec)
1. **Cheap-model defaults wiring** — Anthropic defaults to Haiku for *all* personas in this milestone (not just bulk),
   and Voyage defaults to `voyage-4-lite`, both env-overridable. (§2)
2. **A per-provider SPEND GUARD** — tracks token/request usage against a configurable cap and **falls back to mock on
   breach**, so an unattended run can never run up an unbounded bill. (§3)
3. **Usage logging / observability** — structured, secret-free usage records per provider call. (§4)
4. **Fixture-first / VCR test harness** — integration tests replay recorded responses with zero network; a tiny set of
   explicitly-gated "live smoke" tests hit the real APIs. (§5)
5. **Browserbase stays mocked**, explicitly. (§6)

Everything new is server-side only, mockable, deterministic in CI, and never logs a key.

---

## 1. Clean mock→real selection (confirm the seam, leave it untouched)
The selection mechanism is already correct and must not be reinvented. For each service the rule is exactly:

| `MOCK_<X>` | key present | effective mode |
|---|---|---|
| unset | yes | **real** |
| unset | no | mock |
| `false` | yes | **real** |
| `false` | no | **validation error** (fail fast, names only) |
| `true` | (any) | mock (even with a key) |

The loop turns a service real by leaving `.env.local`'s key in place and not setting `MOCK_<X>`. It turns one off
again by setting `MOCK_<X>=true` — no code change. The spend guard (§3) is layered *on top of* this resolved mode: a
service resolved to "real" may still be **demoted to mock at runtime** when its cap trips.

**Acceptance (selection):**
- With the five keys present and no `MOCK_*` set, `createAiDependencies` / `createOddsDependencies` /
  `createBettingSettlementDependencies` / `createNewsDependencies` return the **real** client for each; setting
  `MOCK_ANTHROPIC=true` (etc.) returns the **mock**, key notwithstanding.
- `MOCK_VOYAGE=false` with `VOYAGE_API_KEY` absent throws an env validation error naming `VOYAGE_API_KEY` only.

---

## 2. Cheap-model defaults (the first line of cost defense)
The cheapest possible real call that still exercises the pipeline. Model choice is driven entirely by cost here, not
quality — see the testing-only framing above.

- **Anthropic = Haiku for every persona in this milestone.** Today `defaultModelForPersona` routes flagship personas
  (`commissioner`, `narrator`, `trash_talker`, `beat_reporter`) to Opus and the rest to Haiku. For this cost-bounded
  loop, **default all personas to `ANTHROPIC_BULK_MODEL` (`claude-haiku-4-5`)**. Make the model map env-overridable so a
  human can later raise specific personas to a stronger model without a code change:
  - New env var `ANTHROPIC_MODEL_TIER` (enum: `cheap` | `mixed`), default `cheap`.
    - `cheap` → every persona uses Haiku.
    - `mixed` → the existing flagship/bulk split (preserves current behavior for when a human opts in).
  - `AnthropicLlmClient` already accepts `modelForPersona`; `createAiDependencies` selects the map from the tier.
  - Do **not** hardcode model id strings in new code — reuse the exported constants. (`claude-haiku-4-5` = $1/$5 per
    MTok input/output, the cheapest current model; Opus 4.8 is $5/$25 — 5× the input cost. Defaulting to Haiku is the
    single biggest cost lever and costs us nothing for a *functional* test.)
- **Voyage = `voyage-4-lite`** — already the default in `VoyageEmbeddingProvider`/`VOYAGE_EMBEDDING_MODEL`. Confirm and
  keep; expose `VOYAGE_EMBEDDING_MODEL` as an env override only (no behavior change).
- **`max_tokens` stays bounded** — `maxTokensFor` already caps at 4096 from persona word count; keep it. Do not raise.
- **Prompt caching stays on** — the existing `cache_control` breakpoints on the stable league-context prefix cut repeat
  input cost ~10×; they are a cost feature, not just latency. Verify `usage.cache_read_input_tokens > 0` on the second
  call of a live smoke run.

**Acceptance (cheap defaults):**
- Default config (`ANTHROPIC_MODEL_TIER` unset) routes **all** personas to `claude-haiku-4-5`; a unit test asserts the
  resolved model for `narrator` and `trash_talker` is Haiku, not Opus.
- `ANTHROPIC_MODEL_TIER=mixed` restores the flagship split (test asserts `narrator` → flagship).
- Voyage embeds with `voyage-4-lite` unless `VOYAGE_EMBEDDING_MODEL` overrides.

---

## 3. The spend guard (never burns money unattended)
A per-provider budget that tracks usage against a configurable cap and **demotes the provider to its mock** when the
cap is breached. This is the load-bearing safety mechanism for the multi-day run: even if a job loops, a prompt blows
up, or a provider misbehaves, spend is hard-bounded and the system degrades to deterministic mocks instead of failing
or billing without limit.

### 3.1 Shape
- A small server-only module `src/core/spend-guard.ts` exposing a `SpendGuard` with, per provider:
  - `check(provider): "allow" | "deny"` — called **before** a real call; `deny` once the cap is reached.
  - `record(provider, usage)` — called **after** a real call with the cost units that call consumed.
- **Budget unit per provider** (track the natural metered unit, not dollars — simplest and provider-honest):
  - `anthropic`: input+output **tokens** (read from `response.usage`; sum `input_tokens + output_tokens`, plus
    `cache_creation_input_tokens`; `cache_read_input_tokens` counts at its reduced weight or is tracked separately).
  - `voyage`: **requests** (one embed = one unit) and/or input tokens if the response exposes them.
  - `odds` / `sportsdataio` / `tavily`: **requests** (these meter by call/credit, not token).
- **Caps are env-configured, default conservative**, e.g.:
  - `SPEND_GUARD_ANTHROPIC_TOKENS` (default e.g. 2_000_000 tokens/window),
  - `SPEND_GUARD_TAVILY_REQUESTS`, `SPEND_GUARD_ODDS_REQUESTS`, `SPEND_GUARD_SPORTSDATAIO_REQUESTS`,
    `SPEND_GUARD_VOYAGE_REQUESTS`.
  - A **window** (`SPEND_GUARD_WINDOW`, default `rolling-24h` or `total-run`) bounds the cap; default to a total-run cap
    so a multi-day loop has one hard ceiling. Window/caps validate as positive integers in `schema.ts`.
- **Persistence**: counters live in Redis (already a dependency) keyed by provider + window so they survive process
  restarts within the run; a missing/unavailable Redis degrades to in-memory (and the guard logs that it is non-durable).
  No secrets in keys or values.

### 3.2 Wiring (where it sits)
The guard wraps the **real** client at the dependency-factory seam, not inside the SDK calls:
- In `createAiDependencies`, when Anthropic resolves real, wrap the real `AnthropicLlmClient` in a
  `GuardedLlmClient` that: on `generate`, calls `guard.check("anthropic")`; if `deny`, delegates to a `MockLlmClient`
  for that call; if `allow`, calls the real client and then `guard.record("anthropic", response usage)`. Same pattern
  for `GuardedEmbeddingProvider` (Voyage), `GuardedWebGrounding` (Tavily), `GuardedOddsProvider`/
  `GuardedResultsProvider` (Odds/SportsDataIO) — each holds *both* the real and the mock and switches per call.
- The mock fallback used on breach is the **same** mock the service would use if `MOCK_<X>=true`, so behavior is
  identical and already tested.
- A breach is **not an error**: the call succeeds with mock output and a `WARN` usage log records the demotion. The
  system stays alive; it just stops spending.

### 3.3 Acceptance (spend guard) — testable
- A unit test sets a tiny cap (e.g. 1 token / 1 request), makes one guarded call that records usage past the cap, then
  asserts the **next** call returns mock output (verified by a mock-only marker) without touching the real client
  (real client is a spy that must not be invoked after breach).
- Below-cap calls go to the real client and `record` increments the counter by the reported usage.
- With Redis present, a breach recorded in one process is observed by a second guard reading the same key (durability).
- Guard never appears in `MOCK_<X>` resolution — it is a runtime demotion layered above §1, asserted independently.

---

## 4. Usage logging / observability (see the spend without seeing the secrets)
Every real provider call emits one structured, secret-free usage record so the unattended run is auditable after the
fact and the spend guard's state is inspectable.

- A `logProviderUsage({provider, op, units, cumulative, cap, demoted})` helper (server-only) writes a single structured
  log line per real call. Fields: provider name, operation, units consumed this call, cumulative units in window, the
  cap, and whether this call (or a subsequent one) was demoted to mock.
- **Never log**: API keys, `Authorization` headers, request/response bodies, cookies, league member PII. The existing
  `parseEnv` "names only" discipline extends here — usage logs carry **counts**, not content.
- For Anthropic specifically, log the `usage` token breakdown (`input_tokens`, `output_tokens`,
  `cache_read_input_tokens`, `cache_creation_input_tokens`) — these are the real cost signal and confirm caching works.
- A periodic (or end-of-run) summary line per provider: total units, cap, % consumed, demotion count.

**Acceptance (observability):**
- A test capturing the logger asserts a usage record is emitted on a real (spied) call with the right `units` and that
  **no key substring** appears in any emitted record (scan the serialized log for the key value → must be absent).
- `pnpm secret-scan` passes over new modules.

---

## 5. Fixture-first / VCR testing (real bytes once, replay forever, no network in CI)
Integration tests for the real clients must run **offline and deterministically** by default, replaying recorded
responses — and only a tiny, explicitly-gated set may hit live APIs.

### 5.1 VCR (record-once / replay)
- A lightweight cassette mechanism: each real client already accepts an injectable transport
  (`client`/`fetcher` options on `AnthropicLlmClient`, `TavilyWebGrounding`, `VoyageEmbeddingProvider`,
  `TheOddsApiProvider`, `SportsDataIoResultsProvider`). The VCR harness supplies a fake transport that **replays a
  recorded JSON cassette** keyed by a normalized request signature.
- Cassettes live under `src/**/__cassettes__/*.json`, committed to the repo, and are **scrubbed of secrets** at record
  time (no `Authorization` header, no key query param persisted).
- **Record mode** is opt-in via an env flag (e.g. `VCR_MODE=record`) and a present key; it hits the real API once,
  writes the scrubbed cassette, and is never run in CI. **Replay mode** is the default and requires no key and no network.
- These VCR integration tests assert the real client correctly **parses** real-shaped payloads into our domain types
  (e.g. `AnthropicLlmClient` parses a recorded `messages.parse` payload into a valid `BlogDraft`; `TheOddsApiProvider`
  maps a recorded odds payload into `OddsEvent`/`OddsMarket`; `SportsDataIoResultsProvider` maps a box score into
  `EventResult`). This is the "does the real wiring work" gate — not a tone gate.

### 5.2 Offline eval stays fully mocked
- `eval:ai:offline` keeps forcing `MOCK_ANTHROPIC=true MOCK_TAVILY=true MOCK_VOYAGE=true` and remains the CI quality
  gate. **No real provider is touched in CI.** This spec must not introduce a CI path that requires a key or network.

### 5.3 Live smoke (a tiny, gated reality check per provider)
- A handful of tests tagged/gated behind an explicit flag (e.g. `LIVE_SMOKE=1`) make **one** real call per provider to
  validate the live integration end-to-end: Anthropic generates one valid `BlogDraft` (Haiku); Voyage returns a numeric
  vector; Tavily returns ≥0 news items without throwing; Odds returns a parseable slate; SportsDataIO returns a
  parseable result. Each is wrapped by the spend guard and skipped entirely when the flag is unset.
- Live smoke is **never** part of `pnpm test` / CI. It is a manual/loop-invoked verification, run sparingly (cost).

**Acceptance (testing):**
- VCR replay tests pass with **no network and no keys** (run them with all keys unset / network blocked — they pass).
- A recording, when present, is asserted secret-free (cassette JSON contains no key value).
- `LIVE_SMOKE=1` runs one gated call per provider that validates the parse path; with the flag unset those tests are
  skipped (assert skip count, not failure).
- `eval:ai:offline` runs with all three AI services mocked and no network.

---

## 6. Browserbase stays MOCKED (explicit, deferred)
Browserbase is **out of scope** for this flip and remains mock-only:
- Keep `MOCK_BROWSERBASE` effectively mock; do not add a `BROWSERBASE_API_KEY` to `.env.local`, do not wire a real
  Browserbase client, do not include it in the spend guard's real path. Its discriminated-union entry stays in
  `schema.ts` (harmless) but resolves to mock.
- Rationale (state it in code/PR, not just here): headless-browser ingestion needs human-paired observation of real
  sessions (auth flows, captchas, rate behavior) before it runs unattended. Deferred to a future human-in-the-room POC.

**Acceptance (browserbase):** with no `BROWSERBASE_API_KEY`, `env.services.browserbase.mock === true`; no real
Browserbase code path exists; a test asserts the mock is selected.

---

## 7. Secrets discipline (server-side only, never serialized)
- Keys live **only** in `.env.local` (gitignored) and are read **only** via `getEnv().services.<x>` — never
  `process.env.<KEY>` in feature code, never sent to the client, never placed in a realtime/push payload, never in a
  cassette, never in a log (per `AGENTS.md` + §4).
- `AnthropicLlmClient` already sets `metadata.user_id` to the **league id** (not a key) — fine. Confirm no new field
  carries a secret.
- The Voyage provider sends the key in an `Authorization: Bearer` header — confirm the VCR scrubber strips that header
  from any recorded cassette.

**Acceptance (secrets):**
- A test serializes a resolved real `ServiceConfig` and the assembled dependencies and asserts the key value does not
  appear (and is not enumerable in a way that leaks to a client bundle).
- `pnpm secret-scan` and `ubs <changed files>` pass; no key appears in any committed cassette or log fixture.

---

## 8. Validation gates (all must pass before commit)
`pnpm typecheck` · `pnpm lint` · `pnpm test` (incl. new `dependencies.test.ts` flips, spend-guard, VCR-replay) ·
`pnpm eval:ai:offline` (fully mocked, CI gate) · `pnpm build` · `pnpm secret-scan` · `ubs <changed files>` (exit 0).
Live smoke (`LIVE_SMOKE=1`) and VCR record (`VCR_MODE=record`) are **manual/loop-invoked only**, never in CI.

## 9. Definition of done (testable summary)
- [ ] Each of the five services flips real↔mock purely by env (`MOCK_<X>`/key), asserted in all three dep factories.
- [ ] All personas default to Haiku (`ANTHROPIC_MODEL_TIER=cheap`); Voyage defaults to `voyage-4-lite`; both overridable.
- [ ] The spend guard demotes a real provider to its mock on cap breach (no error, no further real calls), durable across
      restarts via Redis; below-cap calls hit the real client and record usage.
- [ ] Structured usage logs carry counts only — no key/body/PII; secret-scan clean.
- [ ] VCR replay integration tests pass offline with no keys/network; cassettes are secret-free; a gated `LIVE_SMOKE`
      validates one real call per provider; `eval:ai:offline` stays fully mocked.
- [ ] Browserbase stays mock-only; no real path exists.
- [ ] No secret is ever read outside `getEnv()`, serialized, or logged.
