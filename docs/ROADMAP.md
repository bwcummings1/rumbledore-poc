# Rumbledore — Phase Roadmap

The durable phase plan toward the North Star (`docs/NORTH-STAR.md`). Live state lives in `docs/PROGRESS.md`; this file is the stable map of what each phase is and what still remains. (The old `IMPLEMENTATION_PLAN.md` loop-backlog is retired/historical — see the banner atop that file.) Timeline anchors: **~1 month to football buzz, ~3 months to the season** (season opens ~Sept 2026; this was written in the June 2026 offseason).

> **Status (2026-07-09) — this phased plan is essentially delivered; `docs/PROGRESS.md` is the live state.** Phases 1–3,
> the AUSPEX UI/UX overhaul, Increment 1 (`specs/36`–`41`), the data-foundation T1–T16 arc, and the T18 editorial/
> distribution arc (`specs/45`/`46`) are **done or ready for orchestrator merge**. The app now has clean-import
> invariants, player-depth substrate A, complete ESPN decoding, pushed-canon editorial provenance, content lifecycle/
> correction/governance tools, share/teaser/launch arrival, mock webhook/email delivery, and the real ESPN validation
> league `95050` / **"NHS Alumni Annual"** populated in the shared dev DB with screenshots. The remaining roadmap items
> are deliberate follow-ons: production-real paid-provider keys/capture (Phase 4), real webhook/email credentials and
> domains, real substrate-B source wiring, player-level records and draft/transaction UI, Sleeper/Yahoo dictionaries,
> minor owner-set-aside UI tweaks, and Stripe/beta hardening (Phase 6). Work now runs per **`ORCHESTRATION.md`**; the
> Ralph loop is retired.

The work splits along one line: **orchestrated-agent buildable** (functional, fully mockable, gateable) vs
**human-paired** (needs the user and/or real API keys — voice, design, real integrations).

---

## ✅ Done
- **Round 1 (P0–P5):** foundation — data substrate, ESPN ingestion, Postgres RLS isolation, Better Auth (leagues-as-orgs), betting/bankroll/arena skeleton, basic onboarding, basic publication/AI.
- **Phase 1 — Spectacle Core:** IA/nav, data-foundation depth, the publication system, the AI cast (instigator, authenticity, LLM-judge eval gate), and the league lore mechanic.
- **Phase 2 — Competition, Onboarding, Entitlements, Lore UI:** sportsbook + bankroll loop, the league-vs-league Arena, onboarding completeness (multi-league discovery, SMS/link invites, claim-your-team), free/premium/individual entitlement gates, and the member-facing lore UI.
- **Increment 1 + data foundation T1-T16:** data curation/save-push/edit-ledger/eras, expanded Record Book, mock substrate
  B, clean-import guarantee, player-level league depth, complete ESPN decoding, and real ESPN 95050 dev-DB population +
  screenshots.
- **T18 editorial control + arrival (`specs/45`/`46`):** compiler-enforced pushed-canon AI context, content lifecycle,
  append-only editorial actions, commissioner retract/regenerate/correction controls, failure queue, persona tone editor,
  live article embeds, reactions and roast consent, OG/share/teaser surfaces, launch edition, mock webhooks/digests, and
  shared notification channel preferences.

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
- **Un-mock delivery** — wire the new webhook and digest boundaries to real provider credentials/domains only after owner
  choices are made; the T18 implementation records delivery through mock boundaries until then.
- Confirms the durable-capture model end-to-end: connect once → keep pulling current + future data; rare one-tap reconnect on ESPN session expiry.

---

## 🤝🎨 Phase 5 — Soul  *(human-paired — the differentiator)*
The part that comes after functionality, iterated **with** the user.
- **AI voice / persona tuning** — the editable/versioned tone tools exist, but the cast's actual voice
  (Commissioner, Narrator, Trash-Talker…) still needs human-paired direction; the LLM-judge eval gate remains the ruler.
- **UI/UX overhaul** — the user's style reference applied; snappy, mobile-first, the editorial identity of *The {League} Press*. *(User to provide the visual reference.)*

→ Turns a working app into the *experience* that creates the football buzz.

---

## 🤝 Phase 6 — Launch-ready  *(production)*
- **Payments/billing** — Stripe over the entitlement gates (free / premium-league / individual).
- **Trust, safety & legal** — AI + user-lore moderation, paper-betting guardrails formalized, ToS.
- **Production infra** — deploy, observability, performance/caching at scale, security review.
- **Beta** — the user's real league (provider id `95050`, **"NHS Alumni Annual"**) is already populated in the shared dev
  DB as the first spectacle candidate; production beta still needs hosted capture/real provider posture, invite seeding,
  observability, and legal/billing decisions.

---

## Cross-cutting research tracks (parallel, mostly read-only)
- **Onboarding capture (gates Phase 4)** — hosted-browser vendor eval (Browserbase vs Anchor/Hyperbrowser/Steel/self-hosted), ESPN/Disney OneID auth + ToS, mobile-webview constraints, a live POC on the user's real account. *Highest-leverage research: the connect handshake makes or breaks adoption.*
- **Polling-cost optimization (deferred, NOT a blocker)** — the user's view: with research + clever coding this can be made a near-non-factor, so it's a *later* focus, not a Phase-3 constraint. Phase 3 leaves a **pluggable poll-policy seam** (`specs/19`) so this slots in without rearchitecting. Levers to research: delta-detection / change-only writes, conditional requests (ETag/If-Modified-Since), shared-source fan-in (poll once, fan out to many leagues), provider push/websocket where available, and tiering cadence by entitlement/activity.
- **Weekly content cadence** — the user is researching FantasyPros/podcasts for the real editorial rhythm (feeds `specs/22`).

---

## Sequencing
Current next work is selective, not phase-bulk: choose among production-real provider/key capture, delivery-provider
activation, substrate-B real-source wiring, player-level records/draft/transaction UI, Sleeper/Yahoo dictionaries, owner
UI tweaks, and launch/billing work. The biggest user-provided inputs still gating production are real API/provider
credentials, hosted capture posture, email/webhook provider/domain choices, final voice direction, pricing, and beta/legal
choices.
