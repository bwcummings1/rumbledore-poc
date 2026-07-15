# Phase 4 — Activation Checklist (owner-gated)

> Everything through Phase 3 is built and $0/mock. Phase 4 makes it **truthful and live** — every step here
> is OWNER-gated because it either spends real money, requires a source/model choice that's yours, or needs
> your hands (a login). The orchestrator prepares and stages; it does NOT flip keys, spend, choose sources/
> models, or run smokes. Each item is tagged **DECIDE** (yours), **BUILD** ($0, agent-buildable once you
> decide — the orchestrator can dispatch it), **FLIP** (you set a flag; spends from the next restart), or
> **RUN** (you execute a runbook).
>
> The guardrail is the flag, not the key: `.env.local` already holds real keys for Anthropic/Odds/Tavily/
> SportsDataIO/Voyage + ESPN cookies + Browserbase, all pinned to $0 by `MOCK_*=true`. Flipping a flag routes
> to the real paid API from the next app restart.

## The dependency map

| # | Capability | Powers | Steps |
|---|---|---|---|
| A | **Real AI generation (Anthropic)** | all written content, both tiers | **DECIDE** model per tier (your research; config `ai.anthropicModelTier`/`modelRoute`; today opus-4-8 flagship / haiku-4-5 bulk) → **FLIP** `MOCK_ANTHROPIC=false` |
| B | **Real stats/projections (substrate-B)** | central Fantasy branch + blended league columns (Tale/Friday/Predictions) | **DECIDE** source (SportsDataIO key staged, or other) → **BUILD** a real substrate-B adapter behind the pluggable interface (substrate-B is mock-only today; `MOCK_GENERAL_STATS=false` is unsupported until this exists) → **FLIP** |
| C | **Real news source (The Wire)** | central News branch | **DECIDE** sources (you named X.com insiders — Schefter/Rapoport-style extraction — + others) → **BUILD** the extraction adapter behind The Wire's mock news seam (may need X API access) → **FLIP** |
| D | **Real odds (The Odds API)** | odds/% in blended columns + betting/arena | **FLIP** `MOCK_ODDS=false` (key staged) |
| E | **Real embeddings (Voyage)** | recall relevance + near-dup gate | **FLIP** `MOCK_VOYAGE=false` (key staged) |
| F | **Hosted ESPN cookie-capture (Browserbase)** | frictionless onboarding | **RUN** `docs/runbooks/browserbase-live-smoke.md` (one session, ~15 min, your laptop + SSH tunnel) |
| G | **Measured week → COGS → pricing** | the business model | see below |

## What the orchestrator can do for you at $0 (once you DECIDE)
- **B/C adapters:** the moment you name the stats source and the news source(s), I can dispatch fleet tracks
  to BUILD those real adapters behind the existing pluggable interfaces (mock-pinned, $0) — so activation
  becomes a flag-flip, not a build project. I won't build them speculatively (a SportsDataIO adapter ≠ some
  other source's adapter — the choice determines the code).
- Everything else (A/D/E flips, F runbook, G measurement) is yours to run when you choose.

## G — the measurement path (highest information-per-dollar)
1. With **A** live (real Anthropic) — even with B–E still mock — run **one week** of central + league
   generation on your own league (`espn/95050`).
2. The **T19 per-league AI usage attribution** captures LLM cost per league automatically.
3. Add the non-LLM line items for true COGS: stats source (B), news source (C), odds (D), embeddings (E),
   and image-gen if you add it.
4. × a season = your per-league cost floor → sets the tier pricing you sketched (flat annual league fee with
   content bundled; individual AI-advisor as a metered add-on).

## Suggested first moves (your call, not a prescription)
- **Cheapest high-signal:** flip **A** (Anthropic) only, run **one measured week** (G1–G2) → you get real
  persona voice samples + the LLM-cost-per-piece number that anchors pricing, for a few dollars.
- **Onboarding proof:** run **F** (Browserbase smoke) independently — it's already built and waiting.
- **Full truthfulness** needs **B + C** (real stats + news), which have BUILD steps gated on your source
  choices — tell me the sources and I'll dispatch those $0 builds.

## Hard reminders
- One flip = real spend from the next restart. Flip back to `true` to stop.
- Browserbase is NOT in the spend-guard (verified) — the discipline there is procedural: one session, flip back.
- Never commit `.env.local`; never paste keys/cookies into chat or logs.
