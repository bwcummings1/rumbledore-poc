# Rumbledore — Project History & Trajectory

> A reference for *how this project got here*: what existed before, the decision to rebuild, the methodology,
> the autonomous build, and the current state. Technically detailed and accurate as of **2026-06-12**.
> For current architecture/state see `docs/PROGRESS.md`; for conventions see `AGENTS.md`; for intent see `PRODUCT.md` + `specs/`.

---

## 0. What Rumbledore is (one paragraph)
A **sandboxed, per-league fantasy-football companion.** You connect your existing ESPN league (Sleeper/Yahoo too), it
ingests current + historical data, and each league gets its own home page, an AI "blogger" with personas, paper-money
betting on real odds with a rolling-minimum weekly bankroll, a **central cross-league arena** (leagues are data-isolated
but compete on shared leaderboards), two-tier news (central + league-tailored), and all-time league records. Mobile-first
PWA, distributed via a shareable link. Per-league isolation is the defining architectural principle.

---

## 1. Era 0 — The original build (Aug–Nov 2025), and why it was abandoned

The project first existed as a Next.js + Prisma app built across **16 "sprints" in roughly two days (Aug 20–21, 2025)** —
i.e. very high-velocity, AI-generated. Its history lives on version branches, **none of which were ever merged to `main`**:

- `main` = 2 commits ("phase 1 complete") — the *oldest* checkpoint. This is what a fresh clone showed.
- `v0.21` (phase 2) → `v0.34` (phase 3) → `v0.43` (phase 4, betting) → `v0.51` (sprint 15) → `v1.0` ("before phase 6")
  → `v0.61`/`v0.62` (Nov 17, 2025). **`v0.62` is the real high-water mark**: ~Phase 5, **+238k lines / 580 files** over `main`.
- `claude/ultrathink-project-review` (Nov 18) is the newest *by date* but a **divergent dead-end** (−238k vs `v0.62`); ignore it.

**Why it was abandoned (audit findings, June 2026).** Despite the breadth, the code had systemic, disqualifying problems:
- **Authentication was fake.** Login never verified the password; the session token was literally `'dev-token-'+userId`;
  API routes trusted a client-supplied `x-user-id` header → trivial IDOR; `middleware.ts` auth was commented out
  ("TEMPORARILY DISABLED FOR DEVELOPMENT").
- **Quality gates were disabled.** `next.config` set `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds`, hiding
  ~60 real type errors. Test coverage was **~4.8%** (the one API test couldn't even run). Coverage HTML was committed.
- **The "app" was a v0.dev template.** The only rendered page showed `mock.json` ("M.O.N.K.Y OS") unrelated to fantasy
  football; the real backend components were orphaned (never imported).
- **`npm install` didn't even work** (React 19 vs `vaul` peer conflict).

The per-league "sandbox isolation" — the product's whole premise — was architectural fiction. **Decision: clean rebuild.**

---

## 2. Era 1 — The rebuild decision & plan (2026-06-11)

The owner chose a **clean, first-principles rebuild** (reuse only proven *assets*, not patterns), explicitly open to a new
stack. Key inputs that shaped it:

**Expanded product vision** (captured in `PRODUCT.md` + `specs/`): per-league home base; an AI **blogger** blending league
storylines with real NFL news; **paper betting** modeled on DraftKings/FanDuel with a **rolling-minimum weekly bankroll**
(floor e.g. $10k; lose all → reset to floor; finish above → carry forward); a **central inter-league arena** (league-vs-league
+ individual leaderboards on top of sandboxed leagues); **two-tier news** (central hub + league-tailored feed); a **data-steward**
role for cleaning league data; **frictionless onboarding** (the #1 past failure — no manual cookie/console digging; connect
once → auto-discover all leagues → invite leaguemates); and a **multi-platform** roadmap (ESPN now; Sleeper, Yahoo later);
plus all-time **league records**.

**Research & validation (done live before building):**
- **ESPN ingestion proven on a real league.** With only the `SWID`+`espn_s2` cookies, `fan.api.espn.com/.../fans/{SWID}`
  returned all leagues → discovered league **95050 "NHS Alumni Annual"** (12-team H2H), and `lm-api-reads.fantasy.espn.com`
  returned full league data. This became the real test fixture. (Onboarding research: browser extensions can't read ESPN
  HttpOnly cookies on mobile → the real mobile path is a hosted live-browser login, e.g. Browserbase.)
- **Stack selected from 2026 best-practice research** (see `docs/PROGRESS.md §4`): Next.js App Router **PWA**;
  **Drizzle + Neon Postgres + pgvector** with **Postgres RLS** for isolation; **Better Auth** (org = league);
  **Inngest** jobs; **Upstash Redis**; **Supabase Realtime**; **Anthropic SDK** (no LangChain) for AI content;
  **The Odds API** + **SportsDataIO** for betting; provider abstraction for ESPN/Sleeper/Yahoo.

**Methodology chosen by the owner:** an autonomous **Ralph loop** (Geoffrey Huntley / Clayton Farr playbook) — a loop that
reads file-based specs/plan, builds one increment, runs gates as backpressure, commits, repeats. Plus **impeccable** for UI
taste, **no-mistakes** discipline, and **caam** (Coding Agent Account Manager) for multi-account switching.

---

## 3. Era 2 — The autonomous build (2026-06-11 13:52 → 2026-06-12)

Branch **`rebuild/foundation`**, cleared to a clean slate, seeded with the control plane: `AGENTS.md`, `PROMPT_build.md`,
`PROMPT_plan.md`, `loop.sh`, `specs/00–09`, `IMPLEMENTATION_PLAN.md`, `DESIGN.md`, `PRODUCT.md`. The loop ran headless
agents in tmux (`rumbledore-loop`), with a shell **watchdog** (`rumbledore-watch`) that auto-restarts on death and logs to
`~/rumbledore-loop-logs/STATUS.log`.

**Agent/model plan:** Claude **Fable 5 (max effort)** for the first ~2h, then auto-switch at an iteration boundary to
**Codex `gpt-5.5` (xhigh, fast)** on a ChatGPT account — `loop.sh` does this on elapsed time so it never interrupts a session.

**Timeline & notable events:**
- **13:52** launch. P0 foundation built first (toolchain + gates **ON** from commit #1, Drizzle, **RLS + a binding two-league
  isolation canary**, Better Auth, Inngest, CI). P0 (15 tasks) done by ~**17:20**.
- **~15:39** — Fable hit Claude **rate limits**, causing a brief spin of failed iterations. Resolved by the **2h auto-switch
  to Codex at ~16:11** (clean, at an iteration boundary; no session interrupted). **Zero Claude burn since.**
- **Overnight on Codex** (ChatGPT account) the loop built P1→P5 and *past* the roadmap: ESPN/Sleeper/Yahoo providers +
  onboarding, stats/records/identity-resolution, AI content + personas + two-tier news, betting engine + rolling-min bankroll
  + central arena, realtime subscriptions + grants, PWA push, health metrics, leaguemate invites.
- By **06-12 ~09:00**: **~50 commits**, **52→54 of the planned tasks done**, ~30k LOC source + **15.7k LOC tests (299 tests)**,
  all behind green gates. The loop then worked its own **~79-item discovered backlog** (real bug-fixes + hardening).

**A correction worth recording (account isolation).** The loop's `loop.sh` pinned `HOME=/home/ubuntu` intending to run Fable
on account `bxbxbxbxbxr`. But **Claude Code resolves its account from `XDG_CONFIG_HOME`/config-dir, not `HOME`** — and the
tmux server's inherited `XDG_CONFIG_HOME` pointed at the caam `claude2` profile. **So the Fable phase actually ran on
`bwcummings1`**, sharing that account with other agents; the 15:39 rate-limit was its *collective* 5-hour cap. (The Codex
phase was correctly isolated on the ChatGPT account.) Fix: account is now pinned via `CLAUDE_CONFIG_DIR`/`XDG_CONFIG_HOME`,
exposed as verified launchers **`cbx`** (Claude bxbxbxbxbxr), **`cbw`** (Claude bwcummings1), **`cx`** (Codex) in
`/home/ubuntu/.local/bin` — these work correctly in any tmux session. See `AGENTS.md` runtime notes.

**Supporting infra created during the run:** `rumbledore-watchdog.sh` (cheap, LLM-free monitor + auto-restart),
`rumbledore-autostop.sh` (stops the loop cleanly once the final planned tasks complete, killing the watchdog first so it
can't resurrect the loop). A 10-minute *LLM* watchdog was tried first and removed — it re-ingested the whole conversation
each fire (token-expensive); the shell watchdog replaced it.

---

## 4. Era 3 — Current state & independent review (2026-06-12)

A 4-dimension review (security/isolation, data/ingestion/stats, AI/betting, test-quality) found this is **genuine engineering,
not scaffolding** — the opposite of Era 0.

**Verified real & correct:**
- **Isolation/auth** is genuinely sound: real RLS + `FORCE` on every league-scoped table, `withLeagueContext()` sets
  `app.current_league_id` transaction-locally, a **canary test that binds under a real NOSUPERUSER role**, membership+role
  checks on all league routes (no IDOR), encrypted provider creds, no committed secrets.
- **Ingestion** (ESPN/Sleeper/Yahoo) makes real HTTP calls with retry/backoff/zod/normalization; verified vs the 95050 fixture.
- **Betting** (odds locked at placement, parlay/push/void settlement, event-sourced rolling-min bankroll, central arena) is
  real and correct — no negative/double-spend path found.
- **Gates are honest:** `pnpm typecheck`/`lint`/`test` all pass live (299 tests vs a real Postgres); no `ignoreBuildErrors`,
  no skipped tests, surgical mocking only at external boundaries.

**Known issues to fix (real bugs in the autonomous output):**
- 🔴 AI near-dup detection isn't real vector search (`src/ai/pipeline.ts` loads first 20 rows, no `ORDER BY embedding <=>`).
- 🔴 Stats playoff/championship flags hardcoded `false` (`src/stats/engine.ts`) → those stats are silently zeroed.
- 🟠 Identity resolution over-merges Sleeper co-owners (any owner-id overlap = 100% confidence).
- 🟠 Invite tokens stored plaintext at rest (should store `sha256`).
- 🟠 Bet placement reads balance before taking the week lock (no double-spend, but a confusing error).
- 🟡 Lower-severity: central-content write check, arena-standings RLS, Yahoo positional home/away, invite-endpoint rate-limit.

**Honest gaps:** all paid services are **mocked** (Anthropic, Odds, SportsDataIO, Tavily, Browserbase) — runs on local
Postgres/Redis + fixtures; **real Browserbase cookie-capture is the one "not wired yet" seam** (ESPN onboarding runs
fixture-backed in mock mode by design); UI/UX has not had a human pass.

**Bottom line:** a legitimate, test-backed, properly-isolated foundation that delivers the roadmap — *not* production
(needs the bug fixes, real-key wiring, and a human UX pass), but a trustworthy base.

---

## 5. Operational reference
- **Repo/branch:** `rebuild/foundation` (never touch `main`/`v0.62`; mine old assets via `git show v0.62:<path>`).
- **Accounts (tmux-safe launchers in `~/.local/bin`):** `cbx` = Claude `bxbxbxbxbxr`, `cbw` = Claude `bwcummings1`
  (busy — other agents), `cx` = Codex (ChatGPT). Bare `claude` defaults to `bwcummings1`; bare `codex` is broken in tmux.
- **Build harness:** `loop.sh [build|plan]` (Fable→Codex timed switch). Stop: `touch ~/rumbledore-loop.STOP`.
  Monitor: `tail -f ~/rumbledore-loop-logs/STATUS.log` (free) or `tmux attach -t rumbledore-loop`.
- **Manage from phone:** `ssh` (Termius) → `tmux attach -t manage` → `cbx "$(cat ~/rumbledore-manage-prompt.txt)"`.
- **Source of truth for state:** `docs/PROGRESS.md`. Conventions: `AGENTS.md`. Specs of record: `specs/00–09`.

## 6. Key decisions & rationale (quick reference)
| Decision | Rationale |
|---|---|
| Clean rebuild (not patch v0.62) | v0.62 had systemic fake-auth/disabled-gates/fictional-isolation; faster to rebuild right than to un-rot |
| Postgres RLS for isolation | DB-enforced sandboxing kills the "forgotten WHERE clause" class — the exact failure of the old build |
| Next.js PWA (not native) | Distributed via a shareable link; installable on phone+desktop from one codebase |
| Anthropic SDK direct (no LangChain) | Lean, modern; LangChain considered dated for greenfield TS in 2026 |
| Ralph loop + gates-as-backpressure | Autonomous build only commits when typecheck/lint/test/build/ubs pass — quality can't silently rot |
| Fable max → Codex 5.5 switch at 2h | Use the strong/fast model for the burst, then a separate account to preserve Claude limits |
