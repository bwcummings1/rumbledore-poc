# Rumbledore — Phase Roadmap

The durable phase plan toward the North Star (`docs/NORTH-STAR.md`). Disposable per-phase backlogs live in `IMPLEMENTATION_PLAN.md`; this file is the stable map of what each phase is and what still remains. Timeline anchors: **~1 month to football buzz, ~3 months to the season** (season opens ~Sept 2026; this was written in the June 2026 offseason).

> **Status (2026-06-18) — this phased plan is essentially delivered; `docs/PROGRESS.md` is the live state.** Phases 1–3 and the Phase 5 **UI/UX overhaul** (the AUSPEX design language, incl. the pass-2 refinements) are **done and on `main`**. The only outstanding *roadmap* items are deliberately deferred: **real paid-API keys/capture** (Phase 4) and **Stripe billing** (Phase 6). The project is now in **targeted-increment mode** on a functionally- and visually-complete app; the next increment (data-curation/eras/ledger, News/Arena as self-contained environments, the ambient agent/WizKit tier, the general↔personal wire toggle) is **specified in `specs/36`–`41`**, sequenced and run per **`ORCHESTRATION.md`** (orchestrated tracks; the Ralph loop is retired). Phase labels marked "current" below are historical.

The work splits along one line: **🤖 loop-buildable** (functional, fully mockable — the autonomous Ralph loop can build it) vs **🤝 human-paired** (needs the user and/or real API keys — voice, design, real integrations).

---

## ✅ Done
- **Round 1 (P0–P5):** foundation — data substrate, ESPN ingestion, Postgres RLS isolation, Better Auth (leagues-as-orgs), betting/bankroll/arena skeleton, basic onboarding, basic publication/AI.
- **Phase 1 — Spectacle Core:** IA/nav, data-foundation depth, the publication system, the AI cast (instigator, authenticity, LLM-judge eval gate), and the league lore mechanic.
- **Phase 2 — Competition, Onboarding, Entitlements, Lore UI:** sportsbook + bankroll loop, the league-vs-league Arena, onboarding completeness (multi-league discovery, SMS/link invites, claim-your-team), free/premium/individual entitlement gates, and the member-facing lore UI.

---

## ✅ Phase 3 — Live & Connected  *(delivered — see Status note above)*
The last big **functional** layer — turn a one-time import into a living feed. Specs `19`–`24`.
- **Always-on ingestion & freshness** (`19`) — scheduled adaptive-cadence polling that keeps every connected league current and future-season, idempotent, reconnect-aware. *(The "keep capturing going forward" engine — see the onboarding discussion below.)*
- **Realtime & notifications** (`20`) — Supabase Realtime + Web Push end-to-end: scores, settlements, content drops, lore-vote outcomes, arena swings.
- **Central news / two-tier depth** (`21`) — the cross-league NFL/fantasy hub feeding the league-tailored rail.
- **Weekly cadence orchestration** (`22`) — the cast's rhythm tied to the NFL calendar (recaps → rankings → previews; distinct offseason cadence).
- **Records & history surfaces** (`23`) — all-time records, streaks, head-to-head, championships from the ~10-yr history. **Real data viewable now in the offseason.**
- **Mobile PWA shell** (`24`) — installable, shareable, snappy app-shell (functional, not the visual overhaul).

→ Phase 3 made the product **functionally whole**, and the Phase 5 UI/UX overhaul made it **visually complete** (AUSPEX). It remains mock-connected by design until the deferred real-key work (Phase 4).

---

## 🤝🔑 Phase 4 — Reality  *(human-paired + real API keys)*
Flip the discriminated-union mocks to live.
- **Real onboarding capture** — hosted cloud-browser ESPN login (Browserbase-style), mobile-first, the frictionless connect (the #1 past failure). *Primary in-app embedded webview; "open in browser" fallback. The data path already works with a captured session — this builds the capture UX.*
- **Provider breadth** — Sleeper (no-auth) and Yahoo (OAuth + real refresh-token renewal) made production-real, not fixture-backed.
- **Un-mock the paid services** — Anthropic (real AI), The Odds API + SportsDataIO (real odds/settlement), Tavily/Voyage (web grounding + embeddings), Browserbase.
- Confirms the durable-capture model end-to-end: connect once → keep pulling current + future data; rare one-tap reconnect on ESPN session expiry.

---

## 🤝🎨 Phase 5 — Soul  *(human-paired — the differentiator)*
The part that comes after functionality, iterated **with** the user.
- **AI voice / persona tuning** — the cast's actual voice (Commissioner, Narrator, Trash-Talker…); the Phase-1 LLM-judge eval gate becomes the ruler.
- **UI/UX overhaul** — the user's style reference applied; snappy, mobile-first, the editorial identity of *The {League} Press*. *(User to provide the visual reference.)*

→ Turns a working app into the *experience* that creates the football buzz.

---

## 🤝 Phase 6 — Launch-ready  *(production)*
- **Payments/billing** — Stripe over the entitlement gates (free / premium-league / individual).
- **Trust, safety & legal** — AI + user-lore moderation, paper-betting guardrails formalized, ToS.
- **Production infra** — deploy, observability, performance/caching at scale, security review.
- **Beta** — the user's real league (95050) as the first live spectacle → seed invites.

---

## Cross-cutting research tracks (parallel, mostly read-only)
- **Onboarding capture (gates Phase 4)** — hosted-browser vendor eval (Browserbase vs Anchor/Hyperbrowser/Steel/self-hosted), ESPN/Disney OneID auth + ToS, mobile-webview constraints, a live POC on the user's real account. *Highest-leverage research: the connect handshake makes or breaks adoption.*
- **Polling-cost optimization (deferred, NOT a blocker)** — the user's view: with research + clever coding this can be made a near-non-factor, so it's a *later* focus, not a Phase-3 constraint. Phase 3 leaves a **pluggable poll-policy seam** (`specs/19`) so this slots in without rearchitecting. Levers to research: delta-detection / change-only writes, conditional requests (ETag/If-Modified-Since), shared-source fan-in (poll once, fan out to many leagues), provider push/websocket where available, and tiering cadence by entitlement/activity.
- **Weekly content cadence** — the user is researching FantasyPros/podcasts for the real editorial rhythm (feeds `specs/22`).

---

## Sequencing
**P3 next (autonomous) → P4 + P5 together (paired; un-mocking AI in P4 feeds voice tuning in P5) → P6 → beta.** This is a proposed order — the user steers it. The biggest user-provided inputs gating progress: **real API keys** (Phase 4) and the **UI style reference + voice direction** (Phase 5).
