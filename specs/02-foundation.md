# Spec 02 — Foundation (P0)

> The first thing the loop builds. Establishes the app skeleton + the gates that make backpressure real.
> Done = `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green, CI green, app boots, RLS isolation test passes.

## Outcomes
1. **Next.js (App Router) PWA**, TypeScript **strict**, pnpm. Scripts: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint`, `test`, `test:e2e`.
   - `next.config` MUST NOT set `ignoreBuildErrors` or `eslint.ignoreDuringBuilds`. Ever.
2. **Lint/format**: Biome (or ESLint+Prettier) — one source of truth, wired into `pnpm lint`.
3. **Test runner**: Vitest (unit + integration). Playwright installed for later e2e. At least one real passing test (not a placeholder).
4. **PWA**: web manifest + service worker; installable; mobile-first base layout + safe-area handling; offline app shell. Lighthouse PWA basics pass.
5. **Styling**: Tailwind + shadcn/ui initialized; design tokens wired from `DESIGN.md`.
6. **Data**: Drizzle + `pg`; `docker-compose.yml` for local Postgres (pgvector image) + Redis. First migration. **RLS helper** that sets `app.current_league_id` per request/tx. A `users` + `leagues` + `league_members` baseline.
7. **Isolation proof**: an integration test that creates two leagues and proves a league-scoped query under RLS cannot read the other league's rows. This test is the canary for the whole isolation model.
8. **Auth**: Better Auth scaffold (email/password + one social provider stub), session, organization plugin baseline (org = league) with roles enum incl. `data_steward`.
9. **Jobs**: Inngest scaffold (dev server wired) + one sample function + its test.
10. **Config**: `src/core/env` — zod-validated env (required vs optional), with `MOCK_*` toggles so paid integrations (Anthropic/Odds/SportsDataIO/Tavily/Browserbase) default to mock implementations and the app runs with only local Postgres/Redis.
11. **Ops basics**: `/api/health` (db + redis check), root error boundary, structured logger that never logs secrets, a `Result`/error-type convention in `src/core`.
12. **CI**: GitHub Actions running `typecheck + lint + test + build + ubs` on push/PR; failing gates fail the build. Secret-scan step that blocks committed secrets.
13. **Hygiene**: `.gitignore` keeps `.env*`, `node_modules`, `.next`, coverage out of git. `.env.example` documents every env var (no values). README quickstart that actually works.

## Acceptance criteria (testable)
- Fresh clone + `pnpm install` + `pnpm build` succeeds with gates enabled.
- `pnpm test` runs ≥1 unit + the RLS isolation integration test, all green.
- App boots; `/api/health` returns ok with local Postgres+Redis (docker-compose up).
- CI workflow exists and runs all gates; a deliberately-broken type fails CI.
- No secrets in git; `.env.example` complete.

## Non-goals
- No product features yet (that's P1+). No paid API calls (mocks only). No deploy config beyond what CI needs.
