# IMPLEMENTATION_PLAN.md — Hardening Pass: Audit Findings

Disposable, loop-maintained backlog. The loop works `## Scope` until none unblocked + gates green (writes `.loop/SCOPE_DONE`), then auto-runs the value-ranked `## Icebox` ×10 (`PROMPT_harden.md`), then stops at the review checkpoint. **This is the LAST autonomous pass — nothing chains after it; it stops for review when done.**
One task = one sentence, no "and". **Spec of record: `specs/35`. Build toward `docs/NORTH-STAR.md`.** Phases 1–5 are complete (git history + `docs/PROGRESS.md §8`). Source: the 2026-06-16 5-agent audit.

**NON-NEGOTIABLES:**
- Keep all paid services **mock-pinned** (`MOCK_*=true`); build + test real adapters dormant. Every fix ships a test. RLS/isolation + all quality gates stay green.

## Scope — Hardening (build in order; correctness/security first)
- [x] Wire the NFL calendar into the ingestion game-state provider so the 1-min live-window cadence fires during games. (specs/35 §1)
- [x] Constrain the lore steward tiebreak to genuine tie/quorum-short/expired conditions, with a separate audited override. (specs/35 §5)
- [x] Validate and correct ESPN final-rank and championship derivation against real multi-season history, flagging low-confidence cases. (specs/35 §10)
- [x] Implement a real Anthropic-backed LLM-judge (dormant under mock) and wire it into the publish pipeline as a post-validate gate. (specs/35 §2)
- [x] Replace the heuristic NFL calendar with a real schedule-backed source behind the injectable interface, with the heuristic as fallback. (specs/35 §3)
- [x] Hash invite tokens at rest (store sha256, look up by hash), migrating any existing rows. (specs/35 §6)
- [ ] Add a startup/health assertion that the app's DB role lacks superuser/BYPASSRLS. (specs/35 §7)
- [x] Harden the PWA cache: set `private, no-store` on league pages and add a login-A→logout→login-B cache-isolation test. (specs/35 §8)
- [ ] Wire production emitters for the transaction/waiver content triggers from the ingestion path. (specs/35 §4)
- [ ] Add a dedicated test suite for `records-catalog.ts` over a seeded multi-season fixture. (specs/35 §9)
- [ ] Cover the spend-guard rolling-24h TTL and provider-unavailable→mock fallback paths with tests. (specs/35 §11)
- [ ] Reconcile `docs/PROGRESS.md` / `docs/HISTORY.md` (mark fixed bugs resolved; refresh build-state). (specs/35 §12)

## Icebox (value-ranked; the build auto-hardens ×10 after Scope)
- [ ] **[a11y/correctness] LiveClock SSR hydration mismatch** — `src/navigation/navigation-shell.tsx:~2210` renders the live time server-side; server vs client differ by ~1s → a React hydration error on every page. Render the clock client-only (mount-gated) or suppress hydration on that node. (surfaced during the Phase-5 screenshot run)
- [ ] (loop appends discovered bugs/improvements here during this pass)

## Discoveries / bugs (loop appends here)
- (none yet)
