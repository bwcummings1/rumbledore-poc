# Spec 35 — Audit-Findings Hardening Pass

A 5-agent audit (2026-06-16) of completed Phases 1–5 confirmed the system is real, well-tested, and RLS-isolated, and surfaced a set of concrete, fixable gaps. This pass turns each into a testable hardening task. **Build + test against mocks/fixtures — keep all paid services mock-pinned (`MOCK_*=true`); real adapters stay dormant.** Every fix ships with a test. RLS, isolation, and the quality gates remain non-negotiable. Embed the `docs/NORTH-STAR.md` ethos. Order roughly by the harden rubric: correctness/security → product → quality → housekeeping.

---

### 1. Wire live-game polling (the dormant 1-min cadence)
- **Finding:** the adaptive "live window" ingestion cadence never fires; `defaultGameStateProvider` (`src/jobs/functions/ingestion-live.ts:~97-103`) only returns `off_season`/`in_season_off_hours`. The real `HeuristicNflCalendar` (`src/sports/nfl-calendar.ts`) is wired to content crons but NOT to ingestion.
- **Fix:** inject the NFL-calendar game-state provider into the ingestion scheduler so it returns `live_window` during game windows, activating the existing 1-min matchup / 5-min roster poll tier (`src/ingestion/poll-policy.ts`).
- **Acceptance:** with a controllable clock at a Sunday game window, `leagueIngest` selects the `live_window` cadence; off-hours selects the relaxed tier; idempotent re-poll still never downgrades finalized matchups. Tested.

### 2. Real LLM-judge eval gate (currently dead code)
- **Finding:** `src/ai/judge.ts` + `MockLlmJudge` exist but **nothing calls them**; the real publish gate is deterministic only. The advertised "LLM-judge scores authenticity" is not wired, and no Anthropic-backed judge exists.
- **Fix:** implement a real `AnthropicLlmJudge` behind the existing `LlmJudge` interface (dormant under `MOCK_ANTHROPIC`), and wire `assertLlmJudgeScorePasses` into `generateLeagueBlogPost` (`src/ai/pipeline.ts`) as a post-validate gate — scoring authenticity/persona-fit/no-leakage, regenerate-once-then-skip on fail, mirroring the near-dup gate.
- **Acceptance:** pipeline calls the judge before publish; a low-authenticity draft is regenerated/skipped (tested with the mock judge); the gate is a no-op-safe when mocked; real judge selected only when unmocked.

### 3. Real NFL schedule source (replace the date heuristic)
- **Finding:** `HeuristicNflCalendar` guesses week/phase from the UTC date — playoffs/week-numbers won't track the real season.
- **Fix:** implement a real schedule-backed `NflCalendar` behind the existing injectable interface, sourced from a free/available feed (e.g., ESPN's public schedule endpoint or SportsDataIO behind its mock), fixture-tested; keep the heuristic as the offline fallback.
- **Acceptance:** given a recorded schedule fixture, the calendar returns correct week/phase/game-state; cadence + (task 1) live polling consume it; offline fallback still works.

### 4. Wire transaction/waiver content triggers
- **Finding:** the `transaction`/`waiver` content planners are implemented + tested with synthetic events but have **no production emitter**, so the beat-reporter's core beat never fires.
- **Fix:** emit `transaction`/`waiver` job events from the ingestion path when new transactions/waivers are detected (dedup-keyed), feeding the existing planners.
- **Acceptance:** ingesting a fixture with a new transaction emits the event once (idempotent) and plans the beat-reporter content; entitlement-gated as usual. Tested.

### 5. Constrain the lore steward "tiebreak"
- **Finding:** `stewardLoreClaim` ratify/reject only requires `status==="vote"` — a steward can override ANY open vote, not just break ties (`src/lore/engine.ts`).
- **Fix:** restrict ratify/reject-as-tiebreak to genuine tie / quorum-short / window-expired conditions; keep an explicit, separately-named `override` action (audited) for true commissioner overrides.
- **Acceptance:** steward tiebreak is rejected on a clear-majority open vote; allowed on a tie/quorum-short/expired vote; override path is audited. Tested.

### 6. Hash invite tokens at rest
- **Finding (verify-then-fix):** invite tokens may be stored plaintext (`src/db/schema.ts` `league_invites` + `src/onboarding/invites.ts`).
- **Fix:** store `sha256(token)`, look up by hash; the raw token only ever appears in the share link, never at rest. Migrate existing rows if any.
- **Acceptance:** created invites persist only the hash; acceptance verifies by hash; no plaintext token column remains. Tested.

### 7. Startup assertion: DB role lacks BYPASSRLS
- **Finding:** the entire isolation model assumes the app's DB role is non-superuser/non-BYPASSRLS, but nothing asserts it at runtime.
- **Fix:** add a startup/health check that queries `rolsuper`/`rolbypassrls` for the current role and hard-fails (or loudly warns) in production if either is true.
- **Acceptance:** health check reports the role's privileges; a simulated BYPASSRLS role triggers the failure path. Tested.

### 8. PWA cache hardening
- **Finding:** SW correctly never caches `/api`/credentialed responses, but league-page HTML isolation leans on `credentials:"omit"`; no end-to-end cross-account cache test.
- **Fix:** set `Cache-Control: private, no-store` on league-scoped pages (defense-in-depth) and add a login-A → logout → login-B test proving no cached league/user data leaks.
- **Acceptance:** league pages carry the private cache header; the A→B e2e test confirms no cross-account leak.

### 9. Records-engine test coverage
- **Finding:** `src/stats/records-catalog.ts` (~1.8K lines, correctness-critical aggregation/milestones) has **no dedicated test file**.
- **Fix:** add a dedicated test suite over a seeded multi-season fixture covering the record catalog, milestones, and edge cases (co-owner identity, ties).
- **Acceptance:** records-catalog has direct tests; aggregation correctness asserted against the fixture.

### 10. ESPN final-rank / championship derivation
- **Finding:** ESPN `finalStandingsFromTeams` falls back to regular-season sort when `rankFinal`/`rankCalculatedFinal` is absent; championship detection is heuristic (`src/providers/espn/client.ts`, `src/stats/engine.ts`).
- **Fix:** validate against a real multi-season ESPN history pull (league 95050); prefer true playoff/final results, flag low-confidence derivations via the integrity-check layer rather than silently asserting them.
- **Acceptance:** final-rank/champion derivation is correct or explicitly flagged low-confidence on the fixture; tested.

### 11. Spend-guard test gaps
- **Finding:** the rolling-24h TTL/expiry path and the provider-unavailable→mock fallback are implemented but untested.
- **Fix:** add tests for the rolling-24h window (with a controllable clock) and the unavailable→mock catch for the LLM/web/embedding guards.
- **Acceptance:** TTL expiry resets the counter; provider-unavailable demotes to mock; tested.

### 12. Reconcile doc drift
- **Finding:** `docs/PROGRESS.md` / `docs/HISTORY.md` still list already-fixed bugs (bet-placement lock, playoff flags, AI near-dup vector ordering) as open Icebox items.
- **Fix:** update those docs to mark the resolved items resolved (with the fixing commit), and refresh the build-state summary to reflect Phases 1–5 + this hardening pass.
- **Acceptance:** docs no longer list fixed bugs as open; build-state is current.
