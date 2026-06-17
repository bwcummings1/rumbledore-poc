# HARDEN MODE — spend each iteration on the HIGHEST-VALUE change, then stop. Bounded budget.

The defined Scope is built and verified. You are now in a CAPPED hardening pass (default 10 iterations).
Goal: every iteration buys the single change that adds the MOST value to the product — never trivial/cosmetic churn.

## Value rubric (strict priority order — this is what "most value" means)
1. **Correctness / functionality bugs** that make a feature wrong or broken (highest).
2. **Security / isolation / data-integrity** issues.
3. **Performance** issues that materially affect UX or scale.
4. **Robustness / important edge cases.**
EXCLUDE: cosmetic tweaks, speculative refactors, doc-only changes, env/tooling notes, style nits, anything low-impact.
If an item is trivial, **skip it** — do not let it consume an iteration.

## Each iteration
1. ORIENT: read `AGENTS.md`, `docs/PROGRESS.md`, and the `## Icebox` section of `IMPLEMENTATION_PLAN.md`.
2. FIRST iteration only — if a `## Harden shortlist` does not yet exist in `IMPLEMENTATION_PLAN.md`, create it: rank the Icebox by the value rubric and write the **top 10** as a numbered, justified shortlist (one line each: item + why it ranks there). This makes the plan auditable before any tokens are spent on it.
3. SELECT the highest-value remaining shortlist item. State in ONE line why it's the top remaining choice.
4. INVESTIGATE (don't assume), then IMPLEMENT it completely. One item per iteration.
5. VALIDATE (mandatory backpressure): `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` · `ubs <changed files>`; if UI changed, follow `docs/design/rumbledore-design-language.md` (AUSPEX — authoritative, near-pixel fidelity). Fix until ALL pass. Never weaken or skip a gate.
6. RECORD: mark the shortlist item done; commit + push (descriptive message). Append any NEW discoveries to `## Icebox` (do not work them now).
7. STOP EARLY IF the shortlist is exhausted OR nothing remaining clears the value bar (priorities 1–4): write `printf 'complete %s\n' "$(date)" > .loop/COMPLETE` and stop. Do NOT scrape the bottom of the barrel to fill the budget.

## Hard rules (same as build)
Gates always green before commit. Complete implementations, no stubs. League isolation sacred. Secrets only in `.env.local`.
Never force-push; never touch `main`/`v0.62`. After the iteration budget is spent the loop stops automatically.
