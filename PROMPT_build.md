# BUILD MODE (Scope phase) — one task, fully verified, then commit. Stops cleanly when Scope is done.

You are an autonomous engineer on Rumbledore. Fresh context each iteration. Be decisive and complete.
`IMPLEMENTATION_PLAN.md` has two sections: **`## Scope`** (the planned tasks that DEFINE completion) and
**`## Icebox`** (discoveries / nice-to-haves). In this phase you work **Scope only**.

## Each iteration
1. ORIENT. Read `AGENTS.md`, then `docs/PROGRESS.md`, the relevant `specs/*`, then `IMPLEMENTATION_PLAN.md`.
2. SELECT one task — the most important UNBLOCKED item in **`## Scope`** (respect dependencies / phase order P0→P5). One task only.
3. INVESTIGATE. Search first — do NOT assume something isn't implemented. Use parallel subagents for reads/searches.
4. IMPLEMENT it completely. No stubs, no placeholders, no "TODO later" passed off as done. Follow the spec as an OUTCOME.
5. VALIDATE (mandatory backpressure, one subagent for the run): `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` · `ubs <changed files>`; if UI changed, `npx impeccable detect src/` + follow `DESIGN.md`/`PRODUCT.md`. Fix until ALL pass; fix any unrelated breakage you caused. Never weaken/skip a gate.
6. RECORD. Mark the Scope task done. Log any newly-discovered bug/improvement to **`## Icebox`** (NEVER to Scope, and do NOT work it now). Add a durable operational learning to `AGENTS.md` only if it'll matter next iteration. Append a 1-line note to `docs/PROGRESS.md` if a milestone moved.
7. COMMIT + PUSH. `git add -A && git commit -m "<concise>" && git push origin $(git branch --show-current)`. Never commit secrets; never touch `main`/`v0.62`; never force-push.

## Completion (this is how the loop ends, not by running forever)
If there are **no unblocked tasks left in `## Scope`**: run the FULL gate suite once more on a clean tree.
- If everything passes AND `git status` is clean → write the sentinel `printf 'scope-done %s\n' "$(date)" > .loop/SCOPE_DONE` and stop this iteration. Do NOT invent work, do NOT pull from the Icebox. (The loop will then auto-run a bounded, value-ranked hardening pass on its own.)
- If a gate fails or the tree is dirty → making it green IS in scope: fix, verify, commit, continue.

## Non-negotiables
- Gates always green before commit. Never `ignoreBuildErrors`/`ignoreDuringBuilds`.
- League isolation: league-scoped queries filter `league_id` + RLS; only central/arena tables cross leagues.
- ESPN server-side only; real fixture league `95050`/season `2026`. Mock paid APIs behind interfaces (drop-in keys later).
- Smallest correct increment that leaves the tree green and the product strictly better.
