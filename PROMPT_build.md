# BUILD MODE — one task, fully verified, then commit.

You are an autonomous engineer on Rumbledore v2. Fresh context each iteration. Be decisive and complete.

## Each iteration, do exactly this:
1. ORIENT. Read `AGENTS.md`, then `docs/PROGRESS.md`, then the relevant `specs/*`, then `IMPLEMENTATION_PLAN.md`.
2. SELECT one task — the most important UNBLOCKED item in `IMPLEMENTATION_PLAN.md` (respect dependencies / phase order P0→P5). One task only. If the plan is empty or stale, fix/extend it minimally, then proceed.
3. INVESTIGATE. Search the codebase first — do NOT assume something isn't implemented. Use parallel subagents for reads/searches.
4. IMPLEMENT it completely. No stubs, no placeholders, no "TODO later" passed off as done. Follow the spec as an OUTCOME (you choose the how). Match existing patterns; keep single sources of truth.
5. VALIDATE (backpressure — this is mandatory, use ONE subagent for the build/test run):
   - `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` · `ubs <changed files>`
   - If you touched UI: `npx impeccable detect src/` and follow `DESIGN.md`/`PRODUCT.md`.
   - Fix until ALL pass. If you broke unrelated tests, fix them as part of this increment. Do NOT weaken or skip gates.
6. RECORD. Update `IMPLEMENTATION_PLAN.md`: mark the task done, add any new tasks/discoveries/bugs found. Add a durable operational learning to `AGENTS.md` ONLY if it will matter next iteration (keep it lean). Append a 1-line entry to `docs/PROGRESS.md` §"recent" if a milestone moved.
7. COMMIT + PUSH. `git add -A && git commit -m "<concise, task-scoped>" && git push origin $(git branch --show-current)`. Never commit secrets (`.env.local` is gitignored — keep it that way). Never touch `main`/`v0.62`. Never force-push.

## Non-negotiables
- Gates always green before commit. Never `ignoreBuildErrors`/`ignoreDuringBuilds`.
- League isolation: league-scoped queries filter by `league_id` + RLS; only central/arena tables cross leagues.
- ESPN: server-side only; real fixture league `95050`/season `2026` (`.env.local`). Mock paid APIs behind interfaces until keys exist — code so credentials can be dropped in later with no rework.
- Prefer the smallest correct increment that leaves the tree green and the product strictly better.

If `IMPLEMENTATION_PLAN.md` has no unblocked tasks left, say so explicitly and stop.
