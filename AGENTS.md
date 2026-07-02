# AGENTS.md — Rumbledore v2 operational guide

Keep this lean and operational. This file is HOW to work; the WHAT/WHY live in the docs below.

## Start here — documentation map (read in this order)
1. **`docs/NORTH-STAR.md`** — the product's soul (what Rumbledore *is* + why): data substrate → AI cast/spectacle →
   league-vs-league competition. The orienting truth every spec derives from.
2. **`specs/00-09`** — the full product + architecture spec set (product, architecture, foundation, ingestion,
   onboarding, feeds/home, stats/records, AI content, betting, platform services).
3. **`docs/PROGRESS.md`** — the SINGLE SOURCE OF TRUTH for live state: what's built, what's current, what's next.
   Read this first to know where the project actually is. (State/status notes go HERE.)
4. **`docs/ROADMAP.md`** — the durable phase plan toward the North Star (done vs. next; the deferred follow-ons).
5. **`docs/DATA-FOUNDATION-{DESIGN,PLAN,AUDIT}.md`** + **`.orchestration/handoff/T*.md`** — the recent data-foundation
   arc (T1–T17): substrate/curation/records model, the ESPN decoding audit, and the per-task handoffs (task ledger).
6. **`ORCHESTRATION.md`** (operating model — orchestrator + workstream agents) + **`DESIGN.md`** (AUSPEX design).

> **Retired relics — do NOT treat as live:** `IMPLEMENTATION_PLAN.md`, `loop.sh`, `PROMPT_build.md`/`PROMPT_harden.md`/
> `PROMPT_plan.md` (the autonomous Ralph loop). Live state → `docs/PROGRESS.md`; plan → `docs/ROADMAP.md`.

> **Operating model (2026-06-18): `ORCHESTRATION.md` is authoritative.** The autonomous Ralph loop is **retired** (`loop.sh` is guarded off; `PROMPT_build.md` / `PROMPT_harden.md` / `PROMPT_plan.md` and the "pick the next `IMPLEMENTATION_PLAN.md` task and loop" model are **historical** — do not follow them). You are either the **orchestrator** or a **workstream agent**: read `ORCHESTRATION.md` for your role, your file-ownership boundary, and the per-round commit→push→(orchestrator-)merge protocol. Everything below (gates, hard rules, conventions, gotchas) still applies.

## What this is
Sandboxed per-league fantasy-football companion (ESPN now; Sleeper/Yahoo later): per-league home, AI blogger,
paper betting with a central inter-league arena, league records. Mobile-first PWA. See `docs/PROGRESS.md` §1.

## Stack
Next.js (App Router) PWA · TypeScript (strict) · Drizzle + Neon Postgres + pgvector · Better Auth ·
Inngest (jobs) · Upstash Redis · Supabase Realtime · Anthropic SDK (no LangChain) · provider-abstracted ingestion.

## Commands / validation gates (run after every change; ALL must pass before commit)
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Tests: `pnpm test` (unit/integration) — run the tests for the unit you touched, plus the suite before commit. Requires the local stack (`pnpm db:up`) for db integration tests.
- AI eval (if you touched AI/cast/content quality): `pnpm eval:ai:offline` (offline mock LLM/judge; CI gate).
- E2E: `pnpm test:e2e` for onboarding/flagship-flow changes. It auto-migrates and starts Next on `127.0.0.1:3100`; first run may need `pnpm exec playwright install chromium`.
- Build: `pnpm build`
- PWA perf (if shell/PWA/routes changed; run after build): `pnpm perf:pwa`
- Secret scan: `pnpm secret-scan`
- Bug scan: `ubs <changed files>` (exit 0 required; see /home/ubuntu/AGENTS.md UBS section)
- UI (only if you touched UI): must be faithful to the authoritative design doc — AUSPEX-fidelity per `DESIGN.md` + `docs/screenshots/reference-images/` (near-pixel)
- Authoritative design source: `DESIGN.md` + `docs/screenshots/reference-images/` (AUSPEX, near-pixel).

## Hard rules
- NEVER disable gates. No `ignoreBuildErrors`, no `eslint.ignoreDuringBuilds`, no skipping tests to go green.
- Implement COMPLETELY. No stubs/placeholders/TODO-as-done. If you must defer, record it in `docs/PROGRESS.md` (live state) / `docs/ROADMAP.md` (phase plan).
- League isolation is sacred: every league-scoped query filters `WHERE league_id = …` AND relies on Postgres RLS. Central/arena tables are the only cross-league ones.
- Secrets live ONLY in `.env.local` (gitignored). Never commit secrets. Never log cookies/tokens.
- ESPN calls are server-side only. Real test fixture: league `95050` season `2026` (creds in `.env.local`). Mock paid APIs (Anthropic/Odds/SportsDataIO/Tavily/Browserbase) behind interfaces until keys exist.
- Yahoo OAuth connect defaults to fixture-backed mock mode unless `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` are both set; real redirect URI is `YAHOO_REDIRECT_URI` or `${BETTER_AUTH_URL}/api/onboarding/yahoo/callback`, scope defaults to `fspt-r`.
- Provider credentials only become `invalid` on `PROVIDER_AUTH_EXPIRED`; blocked/rate-limited provider failures should retry/fail without forcing reconnect CTAs.
- "Don't assume not implemented" — search the codebase before building something.

## Git
- **Workstream agents:** work in your own git worktree on your `ws/<track>-<spec>` branch (see `ORCHESTRATION.md`). Commit small/descriptive/often; push **your branch** at each completion round. Do **NOT** merge to `main`.
- **The orchestrator owns all merges to `main`** (the live/integration branch) after review + a full gate run.
- NEVER force-push. Workstream agents never commit or push to `main` directly. (`v0.62` etc. are read-only history.)

## Mining the old code (reference only; do not copy patterns blindly)
`git show v0.62:<path>` — e.g. `prisma/schema.prisma`, `lib/crypto/encryption.ts`, `lib/identity/*`, ESPN client headers.
If the local `v0.62` ref is absent, use `git show origin/v0.62:<path>`.
The old build had disabled gates + fake auth — DO NOT reproduce those.

## Code conventions
- Config: server code reads env ONLY via `getEnv()` from `src/core/env` (server-only, validated). Paid services are discriminated unions `{mock:true}|{mock:false,apiKey}` — branch on `.mock`, never read key vars directly.
- RLS: every new league-scoped table declares a `pgPolicy` `USING/WITH CHECK league_id = current_league_id()` in `src/db/schema.ts` AND gets `FORCE ROW LEVEL SECURITY` hand-added to the generated migration (drizzle-kit doesn't emit FORCE). League-scoped access goes through `withLeagueContext()` (`src/db/rls.ts`).
- Auth: server code uses `getAuth()` from `src/auth` (pure factory in `src/auth/instance.ts` for tests). Better Auth owns the central auth plane (users/sessions/accounts/verifications/members/invitations + leagues-as-organizations) — NO restrictive RLS there (membership must be readable before a league context exists). Leagues are created by domain code, never `createOrganization`. Role strings must match the `league_role` pg enum.
- Platform-admin actions (entitlement grants, future ops) use central `platform_admins` plus `requirePlatformAdmin()`; league roles, including commissioner, are not app admins.
- DB tests: call `migrateSerialized()` (`src/db/test-support.ts`), never `migrate()` directly — parallel vitest processes race on unapplied migrations.
- DB tests: after an expected constraint/RLS error, do not keep using that same transaction (Postgres marks it aborted); assert expected failures in their own `withLeagueContext()`/transaction.
- DB code/tests: do not `Promise.all` queries on the same Drizzle transaction/`withLeagueContext`; one transaction is one pg client, so run queries sequentially inside it.
- Vitest's 30s timeout budget is intentional: DB-backed integration tests run alongside the UI suite and can exceed defaults under local worker load. Split DB tests before lowering it.
- DB-heavy tests should inherit the suite's 30s timeout budget; avoid stale per-test 10s caps on arena/bankroll/stat recomputes that legitimately exceed 10s under full-suite load.
- Manual migration SQL files must also be listed in `src/db/migrations/meta/_journal.json`; otherwise `migrateSerialized()`/Drizzle migrator will not apply them.
- Never call `getEnv()`/`getAuth()` at module scope in route files — `next build` evaluates them with NODE_ENV=production; resolve per-request.
- DB-backed App Router pages with static-looking paths must opt into request-time rendering (`export const dynamic = "force-dynamic"`) before calling `getDb()` in the page.
- Content/feed: `content_item.league_id NULL` is central/open content; league home/feed queries still explicitly filter `league_id = current` inside `withLeagueContext()`, and league feeds include central news only via `league_feed_reference`. DB-level dedup for central rows needs a partial unique index (`WHERE league_id IS NULL`) because normal unique indexes treat NULLs as distinct.
- Realtime: browser clients use `/api/realtime/token` for short-lived channel grants; real Supabase mode requires `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` — never expose the service-role key or JWT secret to clients.
- Realtime: client modules import grant DTOs from `src/realtime/grants.ts`; `src/realtime/subscription-grants.ts` is server-only (Node crypto/DB/auth dependencies) and must not enter a `"use client"` bundle.
- Push: Web Push subscriptions are per-origin in the browser but stored as per-league RLS rows; real delivery requires `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`, and only the public key may reach the client.
- UI/PWA: route views should import UI primitives directly from their component modules instead of the `@/components/ui` barrel when they are inside PWA-budgeted routes; the barrel can pull unrelated client primitives into the route manifest.
- Invites: provider-member leaguemate invites live in RLS-scoped `league_invites`, not Better Auth's email-only `invitations`; public previews use `/invite/[leagueId]/[token]` and must query with `withLeagueContext()` plus explicit `league_id`/token filters.
- Invites: accepted share-token claims live in RLS-scoped `league_member_identity_claims`; acceptance grants auth-plane `members.role='member'` and should not assume provider credential subject ids equal imported provider member ids across providers.
- Invites: leaguemate detection excludes the connector's known team through `onboarding_discovered_leagues.provider_team_id` when the provider exposes it; keep provider discovery → persisted inventory → invite target filtering wired together.
- Jobs: Inngest config is `getEnv().jobs.inngest`; empty local config is mock/no enqueue, `INNGEST_DEV`/`INNGEST_DEVSERVER_URL` is dev mode, and `INNGEST_EVENT_KEY` is cloud mode; do not read `process.env.INNGEST_*` directly.
- Jobs tests: planner functions that call `step.sendEvent` should assert the planning step with `InngestTestEngine.executeStep(...)`; full `execute(...)` attempts a real send unless an Inngest event key is configured.
- Jobs: `game.final.gameId` is used by AI content as a `fantasy_matchups.id`; betting settlement should pass `bettingEventId` for central `betting_event.id` and only rely on the `gameId` fallback for direct betting-event producers.
- AI: Anthropic `zodOutputFormat` schemas must be JSON-Schema-compatible (no Zod transforms); normalize/validate after parse or in the pipeline.
- Append-only tables that also cascade from leagues/users need triggers that reject direct UPDATE/DELETE but allow FK-maintenance UPDATE/DELETE (`pg_trigger_depth() > 1`, including `ON DELETE SET NULL` updates), or test/prod cleanup will fail.
- Stats identity resolution must keep different same-season provider team slots mapped to separate people even when owner/member ids overlap; Sleeper co-owner data can overlap and weekly stats require one person row per team per week.
- Stats postseason flags read persisted `league_season_settings` plus `provider_final_standings`; provider adapters should populate optional postseason metadata when raw settings expose regular-season end/playoff start/title week.

## Environment gotchas
- `node` on PATH is a bun shim that breaks Next/tsc — run pnpm scripts with `PATH=/usr/bin:$PATH` (real Node v22).
- `rm -rf` is blocked by a command guard; use `mv` to `/tmp` instead.
- `/api/health` reports the local compose DB role as unsafe because the official Postgres `POSTGRES_USER` is a superuser; this is report-only outside production, while production health fails on superuser/BYPASSRLS.
- In zsh, build changed-file UBS args as an array (or run the expansion under bash); a single space-joined string is treated as one filename.
- Next/font variable values must be literal strings; AUSPEX font declarations live in root `auspex-fonts.ts` so `src/` stays clean.
- Next dev forces dynamic App Router page `Cache-Control: no-cache, must-revalidate`; verify production cache headers through `next.config`/production server checks, not dev-server Playwright response headers.
- `ubs` false positives (e.g. fixture "keys" in tests): suppress with inline `// ubs:ignore — reason` after verifying it's not real. EXCEPTION: the "secret compared with ==/!=" checker strips comments before honoring `ubs:ignore` — restructure the code instead (switch/truthiness instead of `==`/`!=`).
- Live paid-provider smoke uses `.env.local` keys but may need the local force-mock flags overridden: source `.env.local`, set `MOCK_ANTHROPIC=false MOCK_VOYAGE=false MOCK_TAVILY=false MOCK_ODDS=false MOCK_SPORTSDATAIO=false`, then run `pnpm test:live-smoke`.

## Runtime note (accounts & launchers)
An agent's account is set by the CONFIG DIR (`CLAUDE_CONFIG_DIR`/`XDG_CONFIG_HOME`), **not** `HOME` — a tmux session that
only sets `HOME` keeps whatever account the inherited config dir points to. Use the verified launchers in `~/.local/bin`:
`cbx` (Claude `bxbxbxbxbxr`), `cbw` (Claude `bwcummings1` — reserved for other agents), `cx` (Codex). Assign each
**concurrent** agent its own account so parallel tracks don't share a 5-hour limit (see `docs/HISTORY.md §3`).
**The build harness is now `ORCHESTRATION.md`, not the loop.** `loop.sh` is retired/guarded; worktree + tmux setup, the
per-round protocol, and the orchestrator's merge duties live in `ORCHESTRATION.md`. Full trajectory: `docs/HISTORY.md`.
