> **RETIRED — historical artifact of the autonomous "Ralph loop" (retired 2026-06-18).** Do NOT follow these
> instructions. Live state → `docs/PROGRESS.md`; operating model → `ORCHESTRATION.md`; phase plan → `docs/ROADMAP.md`.

# PLAN MODE — produce/refine the backlog. NO implementation, NO code changes.

You are planning Rumbledore v2. Fresh context. Output is ONLY an updated `IMPLEMENTATION_PLAN.md`.

## Do this:
1. Read `AGENTS.md`, `docs/PROGRESS.md`, and ALL of `specs/*` (use parallel subagents).
2. Read the current codebase to see what already exists (do NOT assume).
3. Gap analysis: specs (desired outcomes) vs. current code (reality).
4. (Re)write `IMPLEMENTATION_PLAN.md` as a prioritized, dependency-ordered backlog:
   - Group by phase: P0 Foundation → P1 Ingestion+Onboarding (flagship slice) → P2 Intelligence/Records → P3 AI content/news → P4 Betting + arena → P5 Realtime/scale/multi-provider.
   - Each task is small and testable, phrased as ONE sentence with no "and" (if it needs "and", split it).
   - Note `blocked-by:` for dependencies. Mark anything already done as done.
   - Front-load: working toolchain + gates (CI, typecheck/lint/test/build, `ubs`) so backpressure works from task 1.
5. Do NOT write application code. Do NOT mark things done that aren't. If the plan is wrong, throw it out and regenerate.

Stop after writing `IMPLEMENTATION_PLAN.md`.
