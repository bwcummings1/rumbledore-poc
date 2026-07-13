# START HERE — Rumbledore onboarding (read this first)

> One-page orientation for any agent/person picking up this project. If you read one doc first, read this.
> **Last reconciled: 2026-07-10 (through T19; migrations through 0072).** Keep this current when the
> project's shape changes; keep live task state in `docs/PROGRESS.md`.

You are picking up **Rumbledore v2** — a mobile-first, per-league fantasy-football companion PWA (Next.js App Router,
Drizzle/Postgres + RLS, Better Auth, Inngest, Anthropic; ESPN now, Sleeper/Yahoo later). The project is well-documented
— orient fully before acting. Do **not** assume things are unbuilt; search the codebase and read the docs first.

## 1. Read these in order (the canonical path)
- **`AGENTS.md`** — operating rules + the documentation map.
- **`docs/NORTH-STAR.md`** — the product's **soul** (read fully). Three layers: (1) a faithful multi-provider **data
  substrate** (connect a league, store full history, keep recording); (2) an AI **cast** (personas — Narrator,
  Commissioner, Trash-Talker, Analyst) that turns a league's seasons/rosters/rivalries into an ongoing **spectacle the
  members star in**, plus a league-authored **lore** mechanic; (3) league-vs-league **competition** (paper betting +
  arena). Personalized, participatory, a little unhinged — content should read like it was "written by someone who's
  been in your league for a decade." This is the orienting truth.
- **`docs/PROGRESS.md`** — the **single source of truth** for live state (read fully; the top summarizes built/current/next).
- **`docs/ROADMAP.md`** — the phased plan toward the North Star (done vs. next).
- **`specs/00-09`** — the full product + architecture spec set (skim all; deep-read your work area).
- **`docs/DATA-FOUNDATION-DESIGN.md`** + **`.orchestration/handoff/T*.md`** — the data-foundation/editorial/hardening
  arcs (T1–T19) and per-task handoffs (the task ledger). (The completed plan + decoding audit are in `docs/archive/`.)
- **`ORCHESTRATION.md`** (how work is done: orchestrator + workstream agents in git worktrees) + **`DESIGN.md`** (AUSPEX UI fidelity).
- **IGNORE as retired/historical:** `loop.sh` (guarded off) and everything in `docs/archive/` (the old autonomous
  "Ralph loop" files, completed-phase plans, dated audits). Live state lives in `docs/PROGRESS.md`, not these.

> **Continuity note:** for the full context of the July 2026 arc — T18/T19 (both MERGED to `main`), the post-merge
> adversarial review, the 2026-07-10 dev-DB incident + recovery, provider reliability posture, and the agreed next
> steps — read **`docs/HANDOFF-NEXT-AGENT.md`** after this page.

## 2. Current state (through T19, merged to `main`; migrations through 0072)
The **data substrate (layer 1) is built and hardened**:
- Per-league **curated data** with a save→push state machine + edit ledger + eras, and a read-only **Record Book**
  projected from pushed snapshots, including player-level records from pushed player/draft/roster facts (T1–T11, T19).
- A **mock** general-stats **substrate B** for the AI writers, now consumed as explicitly non-canon general NFL context
  by league AI generation and central-news tailoring (T12, T19).
- A **clean-import guarantee** = fixture isolation + idempotent per-season reconciliation + an import integrity
  invariant (T13).
- **Player-level depth** = rosters, per-player weekly scores, lineups, draft (T14).
- **Complete + correct ESPN decoding** = full canonical dictionaries (positions incl. IDP, lineup slots, pro teams,
  ~200 scoring stats) behind a provider-agnostic model + a coverage invariant that flags any undecoded code (T15).
- **Per-stat scoring persistence** = per-player-week stat id/value/points rows plus `stat_breakdown_coverage`, surfaced
  in Data Book Weeks (T19).

The owner's **real ESPN league — provider id `95050`, "NHS Alumni Annual," 2011–2026** — is imported into the shared
dev DB with real names, correct rosters/positions, records, and eras (screenshots in `docs/screenshots/real-95050/`).
Refer to that league by **provider id 95050**, never a hardcoded internal UUID (it changes across local DB resets).
Product imports write to `env.databaseUrl` (the app DB) — there is no DB-routing issue.
Nightly dev DB backups should run with `PATH=/usr/bin:$PATH RUMBLEDORE_BACKUP_DIR=/home/ubuntu/rumbledore-db-backups pnpm db:dump`;
the script writes `pg_dump` custom-format files outside the repo and prunes old dumps by retention.

The **editorial and arrival layer is built behind mock/$0 boundaries**:
- AI league context and records provenance use pushed canon through a branded `CanonCatalog`.
- Content has lifecycle state, append-only editorial actions, retract/regenerate/correction controls, generation failure
  visibility, versioned persona tone editing, typed live embeds, reactions, and roast-consent guardrails.
- Distribution has social metadata/OG cards, logged-out league article teasers, launch editions, mock league webhooks,
  mock weekly digest email, and one push/digest/none notification preference matrix.
- T19 hardens the T18 editorial/webhook/digest/OG state machines, adds per-league AI usage attribution/rollups, rate
  limits, security headers, CI e2e, and dev-DB backup scripts.

## 3. What's left (deferred follow-ons — see `docs/ROADMAP.md` for the full phase plan)
- **Sleeper/Yahoo** decoding dictionaries (the canonical model is ready — "add a dictionary").
- Make **substrate B** a **real** NFL-stats source (owner is evaluating sources).
- **Phase 4 "Reality"** — real API keys, hosted ESPN capture/onboarding, real Sleeper/Yahoo, and real webhook/email
  delivery providers/domains.
- **Phase 5 "Soul"** — use the versioned tone tooling for AI voice/persona tuning with the owner.
- **Phase 6** — launch: Stripe/entitlements, moderation, infra, beta/legal/observability. Plus minor owner-set-aside UI
  tweaks and draft/transaction UI polish.

## 4. Hard rules (from `AGENTS.md` — do not violate)
- Run all gates green before commit, with `PATH=/usr/bin:$PATH`: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
  (+ `pnpm perf:pwa` for UI/PWA, `ubs <changed files>`, `pnpm secret-scan`). **Never disable gates.**
- **League isolation is sacred:** every league-scoped query filters `WHERE league_id = …` AND relies on Postgres RLS
  (`withLeagueContext`); new league tables need `FORCE ROW LEVEL SECURITY`.
- Secrets **only** in gitignored `.env.local`; never log/commit ESPN cookies; ESPN calls are server-side only; paid
  APIs stay mock-pinned until keys exist.
- Implement **completely** (no stubs/TODO-as-done). Match existing patterns and AUSPEX design fidelity for any UI.

## 5. Then
Summarize your understanding of the current state + the next-work options back to the owner, and either take the task
they direct or propose the highest-value next step from the follow-on list. **Keep `docs/PROGRESS.md` current as you work.**
