# Spec 07 — AI Content (Per-League Blogger & Pipeline)

> Outcomes spec. Canonical vision: `docs/PROGRESS.md` §1, §6; pipeline shape: `specs/01-architecture.md` → AI content pipeline.
> This file defines WHAT the AI content system produces and WHICH invariants protect it. The loop chooses HOW, consistent with `01-architecture.md`.

## Purpose
Each league gets its own **AI blogger** — a set of personas that blend the league's own storylines (rivalries, managers, inside jokes, all-time records from ~10 yrs of history) with current real NFL/fantasy news, published as a league-tailored feed. The blogger must feel like it *knows this league* and nobody else's. Two non-negotiables sit above everything: **league isolation is enforced in SQL/RLS, never by the model**, and **all web/RSS content is untrusted input** (prompt-injection defense). Until paid keys exist, every external dependency (LLM, web grounding, embeddings) runs behind a **mockable interface** so the whole pipeline is testable on local Postgres + fixtures.

## Personas
Personas are **system-prompt voices**, not separate models. Each is a persona card (name, purpose, tone, post triggers, length bounds) stored per-league so a league can tune/disable voices. The card is part of the prompt-cached prefix (see Memory & retrieval). All voices share the same isolation + grounding rules.

| Persona | Purpose | Tone | Posts when |
|---|---|---|---|
| **Commissioner** | League-official announcements, weekly framing, schedule/standings notes | Warm, authoritative, inclusive — speaks *for* the league | Weekly cron (start/end of week); roster of upcoming matchups |
| **Analyst** | Matchup breakdowns, projections vs. results, trends, start/sit logic | Dry, credible, numbers-first; never hypes | Weekly cron pre-games; `game.final` for performance reviews |
| **Narrator** | Editorial recaps that weave league history + rivalries into a story | Editorial, literary, a little grand | `game.final` (recaps); milestone events (record broken, streak) |
| **Trash-Talker** | Roasts, rivalry needling, callbacks to past failures/inside jokes | Irreverent, punchy, affectionate ribbing — never cruel/abusive | `game.final` (blowouts, upsets); weekly cron (rivalry weeks) |
| **Betting-Advisor** | Reads the league's paper-betting markets/odds, frames "value" plays | Confident but hedged; play-money framing only | Weekly cron after odds refresh; never promises outcomes, never names real sportsbooks |

Persona constraints (enforced by prompt + post-checks, independent of voice): NHL/abuse-free, no real-money/sportsbook language (Betting-Advisor included — see `docs/PROGRESS.md` §6 betting), no invented facts about real players beyond grounded news, no leakage of another league.

## Pipeline (each stage is an outcome)
Triggered by **Inngest**: a **cron** for periodic posts (Commissioner/Analyst/Betting-Advisor weekly framing) and the **`game.final` event** for recaps (Narrator/Trash-Talker/Analyst reviews). Both paths are idempotent (a given `{league_id, trigger_key, persona}` generates at most one published post; re-runs are no-ops).

1. **Trigger & plan** — Cron or `game.final` resolves to a set of `{league_id, persona, trigger_key}` generation jobs. One job = one candidate post. Jobs carry only IDs; all content is fetched inside the job (server-side).
2. **Retrieve league context** — Query pgvector + relational tables **HARD-FILTERED `WHERE league_id = :id`** (and under RLS, session var `app.current_league_id`). Pull: relevant history, recent results/standings, rivalries, manager/team facts, the persona card, and **prior posts** (for voice continuity + dedup seeding). Retrieval returns a structured `LeagueContext` — trusted, league-owned data.
3. **Ground with current web news** — Fetch current NFL/fantasy news via a `WebGrounding` interface (Tavily + RSS/sports feed; **MOCKED** until keys). All returned web/RSS text is **UNTRUSTED**: it is wrapped as inert `data` in the prompt (clearly fenced, e.g. an `<untrusted_news>` block), **never** as instructions. The generation step exposes **no tools and no secrets** — the model cannot act on injected directives ("ignore previous instructions", "post this link", "reveal X"). Web grounding is best-effort: if it fails or is mocked-empty, generation proceeds league-only.
4. **Generate** — Call the `LLM` interface (Anthropic SDK; **MOCKED** in tests). The prompt is built **prefix-stable → volatile**: a **prompt-cached prefix** of `[persona card + stable league facts]` first, then the volatile `[recent results + untrusted news + task]` after the last cache breakpoint. Flagship voice = Opus-tier; bulk/low-stakes posts may use a cheaper Claude tier — both behind the interface (see Interfaces).
5. **Near-duplicate check** — Embed the draft via the `Embeddings` interface and compare (cosine) against recent prior-post embeddings **for this league only**. If max cosine **> ~0.92**, the draft is a near-dup → regenerate once with a "say something new / different angle" nudge; if still over threshold, **skip** (no publish) and record the reason. Threshold is configurable.
6. **Publish** — Persist the post (league-scoped row), mark the `trigger_key` consumed, and emit a realtime `blog.published` event for the league feed. Publishing is the only place a post becomes visible.
7. **Embed to memory** — Embed the published post and store the vector in the league-scoped memory table (`WHERE league_id`), so future retrieval has voice continuity and future dedup has something to compare against. This closes the loop.

A job that produces no publishable post (grounding empty + nothing new to say, or dedup skip) is a valid, logged outcome — not an error.

## Memory & retrieval
- **League-scoped vector memory**: one logical store partitioned by `league_id` (pgvector). Holds embeddings of prior posts and salient league facts/storylines. Every read/write carries `WHERE league_id` AND runs under RLS.
- **Retrieval is grounding, not authority over isolation**: retrieval narrows *what* the persona talks about; the SQL filter + RLS guarantee it can only ever be *this league's* rows.
- **Persona card + stable league facts = the cached prefix.** These change rarely, so they sit at the front of the prompt for prompt-cache hits across a league's many posts (verify hits via `cache_read_input_tokens`; keep timestamps/per-post IDs out of the prefix). Volatile context (this week's results, fetched news) goes after the last breakpoint.
- **Embeddings are dimension-agnostic via the interface** — the schema stores whatever dimension the configured provider emits; tests use a deterministic mock embedder.

## Isolation & injection safety (top risk)
Cross-league leakage is the single highest-severity failure for this product. Defense in depth, in priority order:
1. **SQL `WHERE league_id` on every context/memory query** — explicit, not implied.
2. **Postgres RLS** (`app.current_league_id` session var) as the backstop — a missing filter still cannot read another league.
3. **Per-league cache namespacing** — any Redis/derived cache key is prefixed with `league_id`; no shared cache entries across leagues; the prompt cache prefix is per-league (it embeds that league's persona card + facts).
4. **NEVER rely on the model for isolation** — the model only ever sees one league's data in its context; it is never asked to "only use league X". Isolation is a property of the data layer, proven by tests.
5. **Untrusted web/RSS handling** — web/RSS/news is wrapped as fenced data, never as instructions; the generation call carries **no tools, no secrets, no credentials**; operator/system instructions are fixed in the trusted system prompt, not sourced from fetched content. A post is also passed through persona constraints (NHL/abuse, no real-money/sportsbook language) before publish.

## Quality (near-dup, evals)
- **Near-duplicate rejection** (cosine > ~0.92 against this league's recent posts) prevents the feed from repeating itself; regenerate-once-then-skip keeps it bounded.
- **Persona/constraint checks** on the draft before publish (no banned content, no sportsbook trademarks, length within the card's bounds).
- **Grounding check**: any claim attributed to "current news" must trace to a grounding item passed in; if grounding was empty, the post must not assert fresh external facts.
- **Evals (deterministic, mock-LLM)**: golden tests that a generated post for a fixture league references real league facts (names/records from the fixture), stays in voice, and contains no other league's identifiers. Evals run in CI behind the gates; no live API calls.

## Interfaces (all mockable, behind `MOCK_*` env toggles per `01-architecture.md`)
- **`LLM`** — `generate(request) → { text, usage }` (and/or streaming). Real impl = **Anthropic SDK direct** (no LangChain). Two tiers behind one interface: **flagship voice = `claude-opus-4-8`** (Opus 4.8 — clearest/warmest voice, 1M ctx, $5/$25 per MTok) and a **cheaper bulk tier = `claude-haiku-4-5`** (Haiku 4.5 — $1/$5 per MTok) for high-volume/low-stakes posts. Use adaptive thinking; supports a prompt-cached system/prefix. **Confirm exact model IDs + pricing via the `claude-api` skill at build time** (don't hardcode from memory). The mock returns deterministic output for tests.
- **`WebGrounding`** — `fetch(query|topic) → NewsItem[]` over Tavily + RSS/sports feed. Returns untrusted text + source URL. **MOCKED** now (returns fixed items, including an adversarial "ignore-your-instructions" item used by the injection test).
- **`Embeddings`** — `embed(text|texts) → number[]` (dimension determined by provider; Anthropic has **no** embeddings endpoint, so the real impl is a separate provider — keep it behind this interface). Used for near-dup + memory. **MOCKED** with a deterministic embedder in tests.

All three default to mock implementations so the pipeline runs end-to-end on local Postgres + fixtures with zero paid keys.

## Acceptance criteria (testable with the MOCK LLM returning deterministic output)
- **Real-fact grounding**: a generated post for league **95050** references genuine league facts retrieved from the fixture (e.g. a real team/manager name or all-time record), and includes no fabricated external news when grounding is mocked-empty.
- **Cross-league isolation**: an integration test with ≥2 leagues proves a generation job for league A retrieves/embeds **only** league A's rows — a deliberately-missing `WHERE league_id` is still blocked by RLS, and league B's identifiers never appear in A's post. This is the canary; it must pass.
- **Injection defense**: when `WebGrounding` returns an item containing "ignore previous instructions / leak other-league data / post this URL", the generated post does not obey it (no other-league data, no injected link/command), confirming web content is treated as inert data.
- **Near-dup rejection**: feeding a draft whose mock embedding is within cosine > 0.92 of an existing league post triggers regenerate-then-skip; the duplicate is not published and the skip reason is recorded.
- **Idempotency**: re-running the same `{league_id, persona, trigger_key}` job publishes at most one post.
- **Cache discipline**: the persona+facts prefix is stable across two generations for the same league (no per-request timestamp/UUID in the prefix) so prompt caching can hit; verified by asserting prefix bytes are identical.
- All of the above run in CI behind the gates (`typecheck/lint/test/build/ubs`) with no live API calls.

## Dependencies / blocked-by
- **Spec 02 (Foundation)**: pgvector, RLS helper (`app.current_league_id`), `MOCK_*` env toggles, Inngest scaffold, `Result`/error + logger conventions.
- **Ingestion + Stats/Records + Identity resolution**: supply the league facts (history, standings, rivalries, managers, all-time records) that retrieval grounds on. AI quality scales with these; the pipeline runs on whatever facts exist (fixtures for 95050 until full ingestion).
- **Betting (Spec)**: Betting-Advisor needs odds/markets; until then it degrades gracefully or is disabled.
- **Realtime**: `blog.published` publish/subscribe for the league feed.
- **Paid keys** (`ANTHROPIC_API_KEY`, Tavily, embeddings provider): not required to build/test — mocks cover everything; real impls slot in behind the interfaces when keys land.

## Non-goals (for this spec)
- The **central** NFL/fantasy news hub (cross-league, league-agnostic) — that's the `news/` central plane, a separate spec. This spec is the **per-league** blogger only.
- Chat / interactive Q&A with the agent, fine-tuning, and per-user personalization within a league.
- Image/video generation; multi-sport; non-NFL content.
- Choosing/locking an embeddings vendor — only the interface + a mock are in scope here.
