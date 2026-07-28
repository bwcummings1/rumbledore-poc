# Rumbledore v2 — Improvement Backlog: UI/UX & Functionality Optimization Round (delta-only, execution-ready)

- **Pinned to:** local `main` @ `389a912d8c1cc3bb1b1b3ce844924800fcc6abf9` ("merge: REC-003 local test-concurrency cap + REC-006 measurement resolution", 2026-07-24 02:33:06 +0200). Local `main` is **ahead 7 of `origin/main`** (the REC merges have not been pushed) [V: `git status -sb`].
- **Companion:** cross-references `REPO-ANALYSIS/CLAUDE-Codebase-Deep-Dive-Analysis-2026-07-24-v1.md` (this round's audit, pinned one merge earlier at `3f4c503`; refs like "audit §9.1" point there) and the closed REC ledger `CLAUDE-Analysis-and-Improvement-2026-07-23-v1.md`.
- **Date:** 2026-07-24 · **Analyzer:** Claude (Fable 5) via Claude Code.
- **Evidence labels:** **[V]** verified this session · **[I]** inferred (evidence shown) · **[U]** unverified.
- **ID namespace:** this file's recommendations use the **`UIX-###` IDs already published in audit §10** (kept stable so the two documents cross-reference cleanly). The `REC-###` namespace belongs to the 2026-07-23 ledger, which is now **fully closed** (see §1) — new IDs in that namespace would collide with a live execution record. Future agents reconcile against **both** ledgers.

---

## 1. Reconciliation summary

**Snapshot delta since the audit (same session, ~20 minutes):** the audit pinned `3f4c503`; HEAD is now `389a912` on `main`. The delta is exactly 2 commits / 2 files / 13 lines [V: `git log 3f4c503..389a912`, `git diff --stat`]:
- `fac8804` **[REC-003]** — `vitest.config.ts` gains `maxWorkers: process.env.CI ? undefined : "66%"` (local-only DB-contention cap; per-worker test DBs recorded as the durable follow-up).
- `389a912` merge + REC-ledger status edits: **REC-003 → DONE**; **REC-006 → "INVESTIGATED to a measurement-driven no-op"** — the recommended push-keyed snapshot cache was *built, measured slower than baseline (p50 ~1138ms vs 988ms), and reverted*; the read-time cost lives in the derivation, not the compose; write/read drift is already pinned to shared fixture-oracle numbers in `engine.test.ts` + `records-catalog.test.ts` [V: ledger diff read in full].

**Impact on this backlog:** none of the audit's UIX findings touch either changed file; two of my candidate items were killed/strengthened by this delta (§3). **The entire REC-001…007 queue is now closed**, which makes this file the natural next execution queue.

**Execution sources of truth reviewed:**
- **LIVE:** `docs/PROGRESS.md` (SSOT; header currently two merges stale — says HEAD `96eaf7c` [V: `PROGRESS.md:4-5`]), `docs/ROADMAP.md`, `docs/PHASE-4-ACTIVATION-CHECKLIST.md` (owner-gated queue), `REPO-ANALYSIS/CLAUDE-Analysis-and-Improvement-2026-07-23-v1.md` (REC ledger — **closed as of `389a912`**), this round's audit file, `.github/workflows/ci.yml`.
- **HISTORICAL (ruled out as live queues):** `docs/archive/*` (Ralph-loop plans, prior REPO-ANALYSIS @ `84f30fc`), `docs/HISTORY.md` (ends at T16), `.orchestration/*` (untracked; newest artifact 2026-07-15 [V: `ls -t`] — the July-15 fleet's fossil record, not a live queue), `HANDOFF-NEXT-AGENT.md §6` (its items are marked DONE inline).
- **GitHub:** `gh pr list --state all` and `gh issue list --state all` both empty [V] — no PR/issue queue exists.

**Active milestone:** the project remains parked at the **Phase-4 "Reality" owner gate** (real keys/sources/smokes — `PHASE-4-ACTIVATION-CHECKLIST.md` items A–G). With REC closed, **no agent-buildable queue is in flight**; the owner directed this round at **UI/UX + functionality optimization**, which is exactly the lane this backlog fills. The doc-recorded set-asides ("draft/transactions UI", "minor owner-set-aside UI tweaks", deferred S6 ingestion idempotency bucket, central reactive producers — `PROGRESS.md:451-456`) are respected as out of scope.

**Measured baseline (this session):**

| Command | @ `3f4c503` (audit) | @ `389a912` (re-run) |
|---|---|---|
| `pnpm typecheck` | ✅ exit 0 | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 | ✅ exit 0 |
| `pnpm secret-scan` | ✅ exit 0 | — (no tracked-file delta affecting it) |
| `pnpm test` | ✅ **1,412 / 0 fail / 5 skip** | ✅ **1,412 / 0 fail / 5 skip** (first runs under the new local `maxWorkers` cap; clean) |
| `pnpm build` | ✅ exit 0 | carried over (delta touches only vitest config + docs) |
| `pnpm perf:pwa` | ✅ exit 0 — headroom **3.9KB** on `/leagues/[leagueId]/press/[postId]` (296.1/300KB), **5.0KB** on `/leagues/[leagueId]` (295.0/300KB); ~222KB shell floor | carried over (no JS delta) |

**Visibility limits:** paid providers remain mock-pinned ($0) — real-model latency/quality claims stay [I]/[U]; no production exists to profile; runtime web-vitals (FCP/CLS/INP) are *asserted constants, not measured anywhere* (audit §9.4), so performance-perception claims are code-derived [V mechanics / I magnitude] until UIX-016 lands. No mobile-device testing exists in CI; one mobile-behavior claim was accordingly downgraded (§3).

---

## 2. Executive summary

At `389a912` every gate is green (including a clean 1,412-test run) and the REC guardrail queue is fully closed, leaving the project parked at the owner-gated Phase-4 checkpoint with **no live agent-buildable queue**. This round's audit found that the UI *enforcement* layer is excellent (CI-gated tokens/contrast/skeletons/budgets) but roughly twenty shallow, user-facing defects and three pre-scale read paths sit under it — none architectural, all $0, almost all S/M effort. The single most valuable next move is **UIX-001: close the double-bet idempotency window** — a genuine correctness bug on the flagship betting loop, one line of key-minting discipline, verified at file level. Immediately behind it: two more S-size correctness/safety fixes (Data Book restore staleness, un-confirmed destructive commissioner actions), then the shell-bundle tranche that the 3.9KB route-budget headroom makes a prerequisite for *any* future league-home/article feature work. Why now: these are exactly the fixes that get harder once real users and real content cadence arrive, and the two heaviest routes are one medium feature away from breaking the CI budget gate.

---

## 3. Dropped & reclassified candidates

Candidates this round raised (or a generic audit would raise), killed or downgraded by reconciliation. **Do not re-derive.**

| Candidate | Concern | Final classification | Evidence that reclassified it |
|---|---|---|---|
| Cache/unify the Records read path | ~1s per-request re-derivation, duplicated math | **Already Completed (as a measured no-op)** — killed | REC-006 closed at `389a912`: the recommended cache was **built, measured slower (p50 ~1138ms vs 988ms baseline), and reverted**; drift risk already pinned by shared oracle numbers in `engine.test.ts`/`records-catalog.test.ts` [V: ledger diff]. Only a *profiled* derivation-level optimization would justify reopening — with new evidence. |
| Decouple the test DB / fix gate flakes | load-dependent arena/bankroll timeouts | **Already Completed (tranche 1) + recorded follow-up** — killed | `fac8804` lands the local `maxWorkers:"66%"` cap [V]; this session's two full-suite runs were **0-fail** (one pre-cap, one post-cap) [V]. Per-worker DBs are already named upstream as the durable follow-up — recommending them duplicates a recorded plan. |
| "Draft/transactions UI is missing" | no draft or transaction browsing surfaces | **Deliberate set-aside** — killed | `docs/PROGRESS.md:451` and `START-HERE.md:78-79` list "draft/transactions UI" as owner-known deferred follow-on. Out of scope by the mission's own constraint. |
| Remove/shorten the 900ms boot overlay | perceived-latency splash on every mount | **Downgraded to owner decision** (not a REC) | `ShellBootOverlay` (`navigation-shell.tsx:2340-2380` [V]) is a DESIGN.md §3 *signature element* ("Boot… fades to app") with reduced-motion handling. The genuinely broken part — replaying it on every command-palette jump — is fixed by UIX-003 without touching the overlay. Surfaced as Open Question 1. |
| Mobile bottom-tab overflow hides tabs | `overflow-x-auto` grid may hide sections on narrow screens | **Insufficient evidence** — downgraded | Code shape verified (`navigation-shell.tsx:893-895` [V]) but no mobile device/e2e run exists to confirm real-world severity (audit §9.4: Playwright is desktop-Chrome-only). Folded into UIX-016's first measurement pass rather than recommended blind. |
| Build out offline page caching (make the SW cache real) | offline users always get `/offline` | **Challenge-the-premise: recommend *deletion*, decision-gated** — moved to §5 | The network-first page-cache tier has never worked in production (`sw.js:80-86` requires `credentials==="omit"`, never true for navigations [V ✔]); nobody has missed it. The cheap honest fix is deleting the dead branch + documenting shell-only offline; *building* credentialed page caching would cut against the load-bearing league-isolation posture (`private, no-store`) for unproven demand. Owner intent question first (§6.2). |
| ANN index on `ai_memory`; RESP-client dedup; CSP/HSTS hardening; entitlements re-gate; Redis-fallback latches | (various) | **Killed previously — still killed** | All were explicitly non-recommended with evidence in the 2026-07-23 ledger §3/§5; nothing in this round's delta changes those verdicts. Not re-derived. |
| Press-feed infinite history, richer bet-history joins | feed hard-cap, contentless slip rows | **Downgraded to appendix batch** | Real [V: `front-view.tsx:160-226`; `league-bet.ts:344-373`] but lower (harm × frequency) than everything ranked; grouped in UIX-009/UIX-017 one-liners (§4 appendix) so the top queue stays executable. |

---

## 4. The backlog (ranked; severity floor first)

All items: **Not Started** unless noted, $0, no REC overlap (file sets disjoint from the closed REC work). Effort: repo-relative S ≤ half-day, M ≤ 2 days, L > 2 days.

---

### UIX-001 — Mint the bet idempotency key once per staged slip (close the double-bet window)
**Rank 1 (severity floor: correctness on the flagship loop)** · **Not Started** · **Why now:** it is the one verified way a member can be double-charged (paper) stake by normal retry behavior; trivially fixed; gets strictly worse once real odds/settlement cadence increases timeout frequency.

- **Impact:** correctness (bankroll integrity) + user trust, betting desk. **Confidence: High** — mechanism verified end-to-end by me.
- **Effort:** S · **Reversibility:** trivial · **Blast radius:** one client view.
- **Current-state evidence [V ✔]:** `generateIdempotencyKey()` is called inline in the POST body inside `placeSlip` (`src/app/leagues/[leagueId]/bet/league-bet-view.tsx:1141`), under a 15s `AbortController` (`:1137`). Server honors the key (`src/betting/placement.ts:349-355,573`) — but a commit-whose-response-timed-out followed by user retry sends a **fresh key** ⇒ second staked slip.
- **Prior/in-flight evidence [V]:** none — the doc-recorded "S6 idempotency bucket" set-aside (`PROGRESS.md:454`) is *ingestion*-side and unrelated; no betting UI work is in flight (REC ledger closed; no branch touches this file since `main` history).
- **Residual gap:** the idempotency key's lifetime is one fetch attempt instead of one user intent.
- **Delta plan:** mint the key when the slip is staged (or on first submit) and reuse it across retries until the staged slip changes; leave server semantics untouched.
- **Risks:** key reuse across a *modified* slip would wrongly dedupe — regenerate on any stake/leg change.
- **Acceptance:** unit test — submit, abort the response, resubmit ⇒ same key on the wire, server returns the original slip, exactly one `bet_slips` row.

### UIX-002 — Reconcile Data Book draft state after "Restore checkpoint"
**Rank 2 (severity floor: steward data-trust)** · **Not Started** · **Why now:** it makes the league's most authority-critical tool (curation) *display* wrong values right after a destructive recovery action — the exact moment trust matters most.

- **Impact:** correctness-of-display + steward UX. **Confidence: High** (re-verified by the UX auditor at line level; mechanism is standard React state-vs-prop staleness).
- **Effort:** S · **Reversibility:** trivial · **Blast radius:** one client view.
- **Current-state evidence [V]:** `draftData` is `useState(data)` with **no effect reconciling it to a refreshed `data` prop** (`src/app/leagues/[leagueId]/data/data-book-view.tsx:2243`); restore clears draft badges then `router.refresh()` (`:2408-2436`), which re-renders in place without remount — previously edited cell values persist on screen while the DB has reverted.
- **Prior/in-flight evidence [V]:** the two UI-polish waves that touched the Data Book (`ws/ui1-databook-ledger-polish`, `PROGRESS.md:157-164`) predate this component's checkpoint feature and don't address it; nothing in flight.
- **Residual gap:** restore succeeds server-side but the client keeps rendering pre-restore values until a hard reload.
- **Delta plan:** key the editable table on a server-provided checkpoint/version id (remount on change) or add an effect syncing `draftData` when `data` identity changes; while there, give restore the same confirm-dialog treatment as push (see UIX-004).
- **Risks:** an unconditional sync effect could clobber in-progress edits on unrelated refreshes — scope it to checkpoint-version changes.
- **Acceptance:** e2e/component test — edit cell → restore checkpoint → rendered value equals the checkpoint value with no manual reload.

### UIX-004 — Confirmation dialogs on irreversible steward/commissioner actions
**Rank 3 (severity floor: destructive-action safety)** · **Not Started** · **Why now:** commissioner handoff is a one-click, irreversible self-demotion sitting in a console where every *lower*-stakes action confirms — the inconsistency is the hazard.

- **Impact:** safety/UX for commissioners & stewards. **Confidence: High.**
- **Effort:** S–M (pattern exists; 4 call sites) · **Reversibility:** trivial · **Blast radius:** steward/commissioner views only.
- **Current-state evidence [V]:** one-click paths: commissioner handoff (`members/steward/data-steward-review-view.tsx:1019-1047,433-470`), checkpoint restore with hard-coded ledger reason (`data/data-book-view.tsx:804-815`), era-proposal dismiss (`:1903-1912`), webhook delete (`press/webhooks/webhook-manager-view.tsx:507-515`). The repo's own confirm-dialog pattern (curation push, mark-reviewed) is right there in the same files.
- **Prior/in-flight evidence [V]:** T18 review hardening covered editorial *state machines*, not these click paths (ledger + `PROGRESS.md:227`); nothing in flight.
- **Residual gap:** four irreversible actions bypass the established confirmation pattern.
- **Delta plan:** wrap the four actions in the existing dialog component; require a typed/selected reason where a ledger reason is currently hard-coded; fix the dialog-loading-state drop (`setPendingAction(null)` before await, `data-steward-review-view.tsx:225,507-540`) in passing.
- **Risks:** none material (additive UI).
- **Acceptance:** each action shows a confirm dialog naming the consequence; handoff explicitly states "you will lose commissioner access"; component tests assert no mutation fires on dismiss.

### UIX-007+003 — Shell tranche: restore SPA navigation and buy back route-budget headroom
**Rank 4** · **Not Started** · **Why now:** the two heaviest routes have **3.9KB / 5.0KB** gzip headroom against the CI budget [V: `perf:pwa` output this session] — the next league-home or article feature either breaks the gate or forces a silent budget raise (which the gate wouldn't even catch, audit §9.4). This tranche is the unblocking dependency for future UI work.

- **Impact:** performance (every route; ~222KB shell floor) + UX (palette currently hard-reloads) + DX (budget headroom). **Confidence: High** on mechanics; magnitude of KB savings [I] until measured per-split.
- **Effort:** M (tranche of small, independent edits) · **Reversibility:** high · **Blast radius:** navigation shell only; no server changes.
- **Current-state evidence [V ✔]:** (a) palette navigates via `window.location.assign` (`navigation-shell.tsx:507`) — full reload, boot-overlay replay; (b) interaction-gated surfaces statically bundled: `NotificationsMenu` (`:1403`), `AccountMenu` (`:1562`), `WireSheet` (`:1165`), palette payload (`:502`), `MobileSwitcherSheet` (`:909`) — while the file already proves the lazy pattern works (`:82-100` dynamic imports; realtime import-on-connect `:1841,1928`); (c) `activeState` re-derived unmemoized every render (`use-active-navigation-state.ts`; `scope.ts:346`); (d) league-switcher list re-fetched on every pathname change (`:242,270`).
- **Prior/in-flight evidence [V]:** `ws/v1-nav-toggle`, `ws/u1-ui-polish`, `ws/ui2-league-data-nav` are merged fossils (IA fixes, `PROGRESS.md:157-164,581`); none touched code-splitting or the palette nav; nothing in flight.
- **Residual gap:** one-line hard-nav defect + ~5 deferred-loadable chrome surfaces + two per-render/per-nav waste patterns, all in one file.
- **Delta plan:** (1) `router.push` in the palette (S, ship first); (2) `dynamic()`-split the five surfaces; (3) `useMemo` the active-state derivation; (4) key the switcher fetch to session/league-set, not pathname. Explicitly does **not** attempt the full file split (audit UIX-listed as L) — that's a follow-on once the budget pressure is relieved and measured.
- **Risks:** lazy menus add first-open latency (prefetch on hover/focus mitigates); splitting can shift chunk boundaries — re-run `perf:pwa` per step.
- **Acceptance:** palette navigation preserves client-side routing (no boot-overlay replay; asserted in e2e); `perf:pwa` shows the shell floor and the two heaviest routes measurably down (target: ≥25KB headroom on both — [I] estimate, validate by measurement); switcher endpoint called once per session in a nav-crawl test.

### UIX-005+006+011 — Read-path tranche: bound `/news`, short-circuit `/`, dedupe `/arena`, cache the public surfaces
**Rank 5** · **Not Started** · **Why now:** these are the three verified pre-scale hot spots (audit §9.3); `/news` in particular degrades linearly with published central content, and central cadence activation (Phase 4) is the very next owner move.

- **Impact:** performance/scalability of the public hub + logged-in root + arena; correctness unaffected. **Confidence: High** on mechanics [V]; production magnitude [I] (no prod traffic exists).
- **Effort:** M · **Reversibility:** high · **Blast radius:** `src/news/hub.ts`, `src/app/page.tsx` + `your-leagues.ts`, `src/betting/arena.ts`, `next.config.ts` headers.
- **Current-state evidence [V ✔]:** `/news` hardcodes `scanAllCandidates:true, candidateLimit:MAX_LIMIT` (`hub.ts:190-193`), paginates the entire corpus (`:142-172`), filters/sorts/slices to 30 in JS (`:203-213`); root `/` builds per-league cards in a serial 4-queries-per-league loop (`your-leagues.ts:155-172`) then `redirect("/news")` discards them (`page.tsx:22-24`); `/arena` runs 6 sequential awaits where `:1069` is a strict prefix of the `:1072` `MAX_LIMIT` query (`arena.ts:1042-1091`); **zero Next caching primitives repo-wide** despite `/arena*` being viewer-independent [V: routes audit].
- **Prior/in-flight evidence [V]:** league-feed already has the correct pattern (`scanAllCandidates` only when filters are active, `league-feed.ts:340`) — this tranche copies an in-repo convention; REC-007 touched central *generation*, not hub reads; nothing in flight.
- **Residual gap:** hub reads scale with corpus size instead of page size; root pays a discarded N+1; arena double-queries; public pages are uncached.
- **Delta plan:** (1) push section/tag/limit into SQL or at minimum gate `scanAllCandidates` on active filters (mirror `league-feed.ts:340`); (2) in `/`, check league membership *before* card assembly and `Promise.all` the card loop for the zero-league path that still renders it; (3) slice `allLeagueStandings` for the limited view, `Promise.all` the independent arena queries; (4) add `revalidate`-style caching (or CDN headers) to `/arena*` and logged-out `/news*` — explicitly **not** to any league-scoped route (`private, no-store` is load-bearing isolation, `league-cache-headers.ts:1`).
- **Risks:** SQL-side filtering must reproduce the JS `publicationRankScore` ordering — pin with a fixture test; caching public pages must not leak the logged-in `forYourLeague` rail (render it client-side or vary on session presence).
- **Acceptance:** query-count assertions (hub request ≤ page-size-bounded queries regardless of corpus size; arena ≤ 4 round-trips); a seeded 1,000-item corpus serves `/news` with flat query cost; logged-in `/` issues 1 membership query before redirect.

### UIX-008 — Onboarding: live shadow-import progress + batch-import resilience
**Rank 6** · **Partially Completed (server side exists; client never wired)** · **Why now:** onboarding is the documented #1 historical failure point (`HANDOFF §3.3`) and the first thing any real user touches at Phase-4 activation; the fix is wiring, not building.

- **Impact:** UX/reliability-perception of the connect flow (all providers). **Confidence: High.**
- **Effort:** M · **Reversibility:** high · **Blast radius:** onboarding client components only.
- **Current-state evidence [V]:** after import request the client refreshes the inventory exactly once (`onboarding-flow.tsx:326-345`); a `shadow_running` league renders a static "verifying" pill (`:416-417,476-477`) with no poll/subscription — while the server **already publishes** `historyImportProgress` on the league `history` realtime channel (`src/ingestion/historical-import.ts:160`). Multi-league batch import loses succeeded legs on mid-batch failure (`sleeper-connect-panel.tsx:297-308`, ESPN `:353-364`).
- **Prior/in-flight evidence [V]:** 47C built the shadow/quarantine *state machine* and its (good) failure UX (`onboarding-flow.tsx:531-580`); the progress *feed* was simply never consumed; nothing in flight.
- **Residual gap:** progress events exist server-side with zero client subscribers; batch results aren't reported per-leg.
- **Delta plan:** subscribe the discovered-league inventory to the existing channel (the realtime client + token-grant path already exists) or, cheaper, poll the inventory endpoint while any row is `shadow_running`; render per-league step/season progress; report batch imports per-leg (settled results, not all-or-nothing).
- **Risks:** realtime grants for a league still in shadow may need a scope check — fall back to polling if grants assume `live` state [U — verify `subscription-grants.ts` scope rules first].
- **Acceptance:** e2e (mock provider): during a multi-season import the UI shows advancing progress without manual refresh; a 3-league batch with one failure shows 2 imported + 1 failed accurately.

### UIX-012+013 — Reachability & feedback tranche: expose built features, fix self-defeating controls
**Rank 7** · **Partially Completed (features fully built; last-mile UI missing)** · **Why now:** three finished subsystems under-deliver for want of a link, a role check, and a form — highest value-per-line in the backlog.

- **Impact:** UX + functional completeness (notifications, persona tuning, lore stewardship, editorial ops). **Confidence: High.**
- **Effort:** M (bundle of S items) · **Reversibility:** high · **Blast radius:** scattered small client edits.
- **Current-state evidence [V]:** notification-preference matrix API has **zero client callers** (`api/push/preferences/route.ts:30-40`; account panel is a static KVList, `you-account-view.tsx:343-365`); tone editor unreachable — no link to `/leagues/[id]/cast/tone` anywhere (`cast/tone/page.tsx:47-53`); lore "Steward review" renders for every member and dead-ends non-stewards (`lore/league-lore-view.tsx:226-232` vs `lore/steward/page.tsx:38`); retract/regenerate `window.location.reload()` wipes their own success notice (`components/publication/editorial-actions.tsx:48,65`); generation-failure retry styles blocked/failed like success (`generation-failure-retry-button.tsx:63-67`).
- **Prior/in-flight evidence [V]:** T18 built the preference matrix + tone editor + editorial actions (ledger/`PROGRESS`); P1-CUR gated tone editing to platform admins — gating landed, discoverability didn't; nothing in flight.
- **Residual gap:** built capabilities are unreachable or give false/no feedback at the last UI hop.
- **Delta plan:** (1) preference-matrix UI in the account panel wired to the existing PATCH; (2) admin-only tone-editor link on the cast page; (3) role-gate the lore steward button (mirror the `canOpenReview` doorway pattern in members); (4) `router.refresh()` instead of reload in editorial actions; distinct failure styling on retry. Does **not** relitigate the matrix's schema, tone-editor semantics, or judge behavior.
- **Risks:** none material; all additive/visual.
- **Acceptance:** a member can change per-family/channel preferences from `/you` and the API row reflects it; a platform admin reaches the tone editor by navigation alone; non-stewards never see the steward button; retract/regenerate show their outcome without a full reload.

### UIX-016 — Runtime verification layer: mobile e2e project + measured web-vitals (or honest relabeling)
**Rank 8 (structural; makes ranks 1–7 regression-proof)** · **Not Started** · **Why now:** every defect above shipped *through* green gates because the gates measure none of this (audit §9.4); fixing behavior without fixing verification invites regression; and the budget file's self-check would even let the 300KB ceiling be raised silently.

- **Impact:** DX/reliability of the whole UI gate regime (the fleet model's core guarantee). **Confidence: High** on the gap [V]; tooling choice is open.
- **Effort:** L · **Reversibility:** high (additive CI) · **Blast radius:** `playwright.config.ts`, CI workflow, budget script; no product code.
- **Current-state evidence [V]:** `check-mobile-pwa-budget.mjs:34-59` asserts declared JSON constants for FCP/CLS/INP/transition/tap — nothing measures them; `:43` self-checks `maxRouteJsGzipKb` only as ≥1KB (a 300→900 bump passes silently); Playwright has a single desktop-Chrome project (`playwright.config.ts`); CI runs 2 of 8 specs (`ci.yml:105`).
- **Prior/in-flight evidence [V]:** T19 added e2e-to-CI and the budget gate itself — this is a follow-on tranche to that landed work, not a restart; `sleeper-onboarding.spec.ts` exists but was never added to CI.
- **Residual gap:** no runtime metric, no mobile viewport, no a11y assertion, and no budget-ceiling guard is enforced anywhere.
- **Delta plan (staged, ship value early):** (1) S: hard-fail the budget script if `maxRouteJsGzipKb > 300` without an explicit ack constant; add `sleeper-onboarding` to CI; (2) M: add a mobile-viewport Playwright project asserting tap-target ≥44px on key screens (catches the verified 40px reaction buttons, `reaction-strip.tsx:131`) + safe-area smoke; (3) L: measure FCP/CLS/INP via Playwright traces or Lighthouse-CI against the built app on 2–3 routes, enforcing the budget file's existing numbers — or, if the owner declines the cost, **relabel** those numbers "targets (unenforced)" so the gate stops overstating.
- **Risks:** runtime metrics on shared CI runners are noisy — use generous thresholds + medians of 3 runs; keep the mobile project additive so existing specs stay green.
- **Acceptance:** CI fails on a deliberately-planted 40px tap target and on a budget bump to 900KB; web-vitals numbers appear in CI output for the covered routes (or the JSON is relabeled).

---

**Sequencing & dependencies:** UIX-001 → UIX-002 → UIX-004 are independent S-items — land first, in that order (severity). UIX-007+003 unblocks all future league-home/article feature work (budget headroom) and should precede any new UI features. UIX-005+006+011 must land **before** central-content cadence activation (Phase-4) makes `/news` volume real. UIX-008 and UIX-012+013 are independent, parallelizable. UIX-016 stage (1) is a half-day and can ride any tranche; stages (2)-(3) trail. No item touches the closed REC file set; the closest contact is cost *formatting* (appendix) vs REC-005's cost *computation* — disjoint layers.

**Appendix — one-line items (real, verified, below the ranked cut):** settled-slip truthfulness (won/lost/refunded amounts, leg details, local times — `league-bet-view.tsx:892-946`, `league-bet.ts:344-373`) [M]; delete the dead SW page-cache branch after the owner intent question (§6.2) (`sw.js:80-86`) [S]; extend `enforceApiRateLimit` beyond its 2 current callers to lore submit/poll votes/bet slips/invites-create (`rate-limit.ts:65`) [S–M, rides Phase-4]; per-segment `error.tsx` + `global-error.tsx` + home-link on root error [M]; nit batch — reaction clear + 44px, inline-markdown rendering, lore form reset/thread refresh, expired-invite + 429 copy, `$0.000000` → cents formatting (`ai-usage-rollup-view.tsx:61-63`), provider-aware access CTA (`league-section-access-state.tsx:18-24`), press-feed load-more [S each].

---

## 5. Explicit non-recommendations

- **Anything in the closed REC-001…007 set** — completed (or measured no-op) as of `389a912`; re-opening REC-006 caching specifically requires *new profiling evidence* per its recorded resolution.
- **Per-worker test databases** — the durable REC-003 follow-up is already recorded upstream (`vitest.config.ts` comment + ledger); recommending it duplicates a written plan. Revisit only if flakes recur under the new cap (two clean full-suite runs so far [V]).
- **Draft/transactions UI; Yahoo dictionary; real-source/key flips; reactive central producers; backup cron; Browserbase smoke** — owner-gated or explicit set-asides (`PROGRESS.md:451-456`, `PHASE-4-ACTIVATION-CHECKLIST.md`); the active trajectory, not this lane.
- **Boot-overlay removal/shortening** — sanctioned design signature (DESIGN.md §3); the broken interaction is fixed by UIX-003. Owner call only (§6.1).
- **Building real offline page caching** — challenge-the-premise: the tier has never functioned in production and nobody has missed it [V: audit §9.4]; the honest cheap move is deleting the dead branch (appendix) once the owner confirms shell-only offline is acceptable (§6.2). Building credentialed page caching would trade against league-isolation guarantees for unproven demand — negative expected value now.
- **Full navigation-shell file split (the L refactor)** — deferred until after UIX-007's measured splits; a big-bang split of a 3,162-line working file with no behavioral driver is churn risk without measured payoff.
- **CSP/HSTS, entitlements re-gate, Redis-latch hardening, RESP dedup, ANN index** — previously killed with evidence (2026-07-23 ledger §5); verdicts unchanged by this round.

---

## 6. Open questions for maintainers

1. **Boot overlay intent:** is the 900ms splash meant for *every* shell mount or only cold starts? (UIX-003 removes the worst trigger either way; an owner ruling decides whether same-session re-entries should suppress it.)
2. **Offline product intent:** is shell-only offline acceptable (delete the dead `sw.js` page-cache branch, document it), or was "last page available offline" a requirement (larger, isolation-sensitive build)? Evidence: the branch has never populated in production (`sw.js:80-86` [V ✔]).
3. **Live-update reading UX:** realtime swaps RSC content under the reader with no "N new items" affordance (`realtime/client.tsx:362-384`) — fine at current volume; wants a decision before real content cadence.
4. **SSOT hygiene (recurring):** `docs/PROGRESS.md:4-5` header again lags HEAD (says `96eaf7c`; actual `389a912` includes REC + follow-ups). Same pattern flagged 2026-07-23 §6.4. The header may deserve a "run `git log -1` — this header may lag" caveat, since per-merge manual reconciliation demonstrably slips.
5. **Unpushed `main`:** local `main` is 7 commits ahead of `origin/main` [V] — push is presumably an orchestrator/owner action; flagging so the remote doesn't silently diverge from the box this project's continuity depends on.
6. **`aria-labelledby` integrity** in notifications/account panels (`navigation-shell.tsx:1452,1616`): referenced IDs unconfirmed [U] — 5-minute check, fold into UIX-016's a11y pass.

---

## 7. Cross-check addendum (2026-07-27) — independent verification round

- **Added by:** a later session (Claude Fable 5) asked to re-review both 2026-07-24 documents and cross-check them against the code. Pinned to the same `main` @ `389a912`; working tree still carries only the two untracked analysis files.
- **Method:** every `file:line` claim in §§3–6 above and in the companion audit was re-opened and read; five independent read-only auditors then swept planes the UI/UX round did not cover (API routes, client state, the Inngest/settlement plane, and the never-reviewed REC delta). All gates were re-run on this box: typecheck ✅, lint ✅, secret-scan ✅, `eval:ai:offline` ✅ 8/8, **`pnpm test` ✅ 1,412 passed / 0 failed / 5 skipped**, `build` ✅, `perf:pwa` ✅ (unchanged margins: 296.1KB / 295.0KB), **both CI e2e specs ✅**, UBS ✅ 0 critical.
- **Verdict on the two documents:** their factual claims hold. Every substantive `file:line` was CONFIRMED; the corrections in §7.3 are citation-level, not finding-level. What follows is what the round **missed**, most of it outside the self-imposed UI/UX scope.

### 7.1 The gap that matters: three planes were never audited

The 2026-07-24 round scoped itself to UI/UX + functionality and explicitly placed the REC delta out of scope ("assumed passing"). That left **the API-route plane, the async/jobs plane, and the 7 unpushed REC commits** unexamined by anyone. The findings below come from those planes. `UIX-101` continues the existing namespace (100+ marks this addendum's origin).

**UIX-101 — CRITICAL — Paper betting never settles; `game.final` carries the wrong id.** [V ✔ re-verified directly]
`plannedGameFinalEventsFor` (`src/jobs/functions/ingestion-live.ts:1360-1376`) is the **only** production emitter of `game.final`, and it sets `gameId: matchup.id` — a `fantasy_matchups.id` — with no `bettingEventId`. The consumer falls back `bettingEventId: data.bettingEventId ?? data.gameId` (`betting-settle-game-final.ts:529`) and `loadBettingEvent` looks that value up in `betting_event` (`settlement.ts:302-306`). Both tables use independent `uuid().primaryKey().defaultRandom()` (`schema.ts:747` vs `:2723`) — **the lookup can never hit**. Repo-wide, `bettingEventId` is set by **zero** non-test call sites; only `settlement.test.ts` supplies it. Every run therefore returns `skippedReason: "event_not_found"`, `finalizedSlips: 0`, `ok: true` — no error, no alert.
*Failure:* a member places a slip → the game finals → settlement reports success having done nothing → the slip stays `pending` forever, the stake is never returned, and because `pendingSlipCount > 0` blocks rollover (`bankroll-rollover.ts:291-294`) that bankroll week can never close. Contradicts `specs/15-competition-arena.md:166`. **Why the gates are green:** every settlement test hand-supplies `bettingEventId: seeded.event.id` with a throwaway random `gameId` (`betting-settle-game-final.test.ts:349-350,518-519`), so the production payload shape is never exercised. Effort **S** to wire the id; **M** with the regression test that would have caught it. This outranks UIX-001 — the double-bet window is a way to stake twice, this is the whole loop never paying out.

**UIX-102 — CRITICAL — `league_admin` silently holds every `data_steward` power.** [V ✔]
`src/auth/permissions.ts:31-34` declares `league_admin` with `leagueData: ["review"]` — review only, deliberately withholding `manage`. But every guard resolves through a linear ladder, `ROLE_RANK` (`src/auth/guards.ts:44-49`), where `league_admin` (2) outranks `data_steward` (1), so it passes every `minRole: "data_steward"` check. **`hasPermission` has zero server-side callers** — the ACL is decorative for this app's own API surface. Consequence: a league_admin can drive all ten steward-gated endpoints, including `curation/push`, `curation/checkpoints/[id]/restore` (destructive), `steward/integrity` (irreversible identity merge/split), and `lore/claims/[id]/steward` (override a league-wide vote). The 2026-07-23 audit flagged the two authority models as a "review hotspot… nothing observed broken" (§9.9); it is broken — the rank ladder wins and the ACL never runs. Effort **S**.

**UIX-103 — IMPORTANT — Better Auth's organization routes bypass the commissioner-only steward guard.** [V]
`src/app/api/auth/[...all]/route.ts:10-17` mounts the full Better Auth handler with the organization plugin enabled, which HTTP-exposes `update-member-role` / `remove-member`. Their authorization comes from `adminAc.statements` spread into `league_admin` (`permissions.ts:31-34`), granting `member: ["create","update","delete"]`. Meanwhile the app's own path enforces `minRole: "commissioner"` (`src/onboarding/stewards.ts:224-231`). A league_admin refused by `POST /api/leagues/<id>/stewards` can instead `POST /api/auth/organization/update-member-role` and promote an accomplice — with no `requireLeagueRole`, no audit-ledger row, and no cleanup of the removed member's identity claims or push subscriptions. *Verified not exploitable:* self-promotion to commissioner (Better Auth blocks non-creators from touching the `creatorRole`). Effort **M**.

**UIX-104 — IMPORTANT — `readJsonBody` turns unparseable bodies into destructive defaults, and its size cap is bypassable.** [V ✔]
`src/onboarding/http.ts:53-57` returns `ok({})` when `request.json()` throws — a parse failure becomes a **successful empty request**. On routes whose schema is all-optional, `{}` validates and the handler proceeds: `curation/checkpoints/[id]/restore` performs a destructive restore on a body it could not parse, and `push/subscriptions/account` DELETE falls into the `endpoints === undefined` branch, which disables **every** push subscription the user has in **every** league (`src/push/subscriptions.ts:226-247`). Separately, the size cap at `:39-51` sits inside `if (contentLength)`, so any `Transfer-Encoding: chunked` request skips it entirely and `request.json()` buffers the whole body — every `MAX_*_BODY_BYTES` constant (down to the 512-byte reactions cap) is advisory. Not CSRF-reachable (Better Auth cookies are `sameSite: "lax"`; no state-changing GET handlers). Effort **S**.

**UIX-105 — IMPORTANT — Cross-event parlays can strand with every leg graded and the slip still `pending`.** [V]
The settlement advisory lock is per `(leagueId, eventId)` (`settlement.ts:293-295`) and `withLeagueContext` is plain READ COMMITTED, but placement only requires **distinct markets** (`placement.ts:174-180,541-548`) — nothing confines a parlay to one event. Two events finalling in the same poll cycle take *different* locks and run concurrently; each grades its own leg, then each reads slip state and sees the other's uncommitted leg as still `pending`, so both take the reprice branch and neither finalizes. End state: all legs graded, slip `pending`, stake neither paid nor refunded — and nothing re-examines it, because `gradePendingLegs` only picks up `pending` legs. Effort **M**.

**UIX-106 — IMPORTANT — Settlement notifications and the `bet.settled` fan-out are lost on Inngest retry.** [V]
The whole body — settle, arena rebuild, realtime, push — is one `step.run` (`betting-settle-game-final.ts:620-622`), and the notification block is gated on `result.finalizedSlips > 0` (`:538`). If anything after `settleBettingEvent` throws (e.g. `rebuildAllArenaStandings` at `:540-545`, unwrapped), Inngest re-runs the step; settlement is correctly idempotent, so `finalizedSlips` is now 0 and the entire block is skipped. The DB is right and every downstream effect is silently dropped. Effort **M**.

**UIX-107 — IMPORTANT — The 30-minute stale-run sweep does not exist.** [V ✔]
Both 2026-07-24 and 2026-07-23 describe a sweep that surfaces crashed generations ("until the 30-minute `stale_pending` sweep surfaces it"). There is no cron and no job that transitions `running` rows: `listGenerationFailureQueue` is a **read-only UI query** that merely *classifies* old running rows as `stale_pending` for display (`generation-failure-queue.ts:349-360,678-687`). The only writer is `retryGenerationFailureRun`, reachable solely from an HTTP route a human clicks. Compounding it, `content-planning.ts:226-235` counts `running` **and** `published` runs against the weekly cadence cap, so a burst of crashed generations suppresses all further content for that week with no automatic recovery (bounded — the window resets weekly). Effort **M**. *Good news from the same sweep:* `triggerKey` double-publish is blocked by a real DB constraint (`ai_generation_run_idempotency_unique`, `schema.ts:3726`), not just the near-dup heuristic.

**UIX-108 — IMPORTANT — Onboarding realtime is structurally unreachable; UIX-008's primary plan cannot work.** [V ✔]
UIX-008 proposes subscribing onboarding to the existing `historyImportProgress` channel. **That cannot work in the first-run path.** Channel grants resolve through `listLeagueMembershipsForUser` (`subscription-grants.ts:172-183` → `guards.ts:209-212`), and the `members` row is inserted only by `promoteShadowImport` — inside the same transaction that flips state to `live`, *after* the whole import completes (`import-requested.ts:643-652`). While state is `shadow_running` there is no members row, so no grant can be issued and the events published at `historical-import.ts:160` are dead telemetry precisely when the progress UI needs them. Worse, the grant is all-or-nothing: requesting a shadow league alongside live ones returns `LEAGUE_FORBIDDEN` for the **entire** request (`guards.ts:220-225` → 403 at `subscription-grants.ts:96-107`), so a naive implementation would knock out realtime for the user's other leagues. **UIX-008 should take its own cheaper fallback (poll the inventory endpoint) as the primary plan**, or the fix must promote membership earlier / scope progress to a user-keyed channel. This resolves UIX-008's `[U]` risk note definitively.

### 7.2 The unpushed REC delta, reviewed for the first time

Per-REC verdicts against the ledger's own claims: **REC-002, REC-003, REC-004, REC-007 delivered as claimed**; **REC-001 and REC-005 delivered with defects**; REC-006 is consistent (docs-only). Nothing outside the claimed file set was smuggled in — the changed-file list is byte-identical to the union of the five non-merge commits, and both merge commits have empty combined diffs. REC-002 is genuinely strong: verified empirically against the live dev DB, of 65 tables carrying a `league_id` column exactly three fail the enabled+forced+policy assertion, and those three *are* the allowlist — it is not padded. REC-007's `playerRefs` shape matches the tailoring reader field-for-field, per-league `withLeagueContext` is correct, and the upsert is backed by a real unique index.

**UIX-109 — IMPORTANT — REC-005's Opus prices are 3× the real list price, and the test cannot catch it.** [V ✔ — verified against the current Anthropic pricing reference, not from memory]
`src/ai/usage-attribution.ts:145` sets `opus: { cacheCreation: 18.75, cacheRead: 1.5, input: 15, output: 75 }` — i.e. **$15/$75 per MTok**. The pinned flagship is `ANTHROPIC_FLAGSHIP_MODEL = "claude-opus-4-8"` (`model-config.ts:3`), which lists at **$5 input / $25 output** per MTok. The whole row is 3× high; the derived cache rows inherit the error (should be 6.25 / 0.5). The Haiku row (1/5, 1.25, 0.1) is **exactly correct** for `claude-haiku-4-5`. This matters precisely because the ledger positions this field as the Phase-4 §G measured-week instrument "reading real (estimated) dollars" — the first cost-per-piece decision would be off by 3×. The unit test asserts the table against itself (`usage-attribution.test.ts:180`: `.toBe(100 * 15 + 40 * 75)`), so it can never detect a wrong price. Fix: correct the row **and** re-point the test at expected dollars rather than the constants. Effort **S**. (The `voyage` row at $0.02/MTok is plausible but unverified — and currently unreachable, see UIX-111.)

**UIX-110 — IMPORTANT — REC-001's lore fence is escapable, and the judge path was never fenced.** [V]
Two gaps in the prompt-injection work. (a) The fence is built as `` `<untrusted_league_lore>${JSON.stringify(...)}</untrusted_league_lore>` `` (`pipeline.ts:1933`); `JSON.stringify` escapes quotes and control characters but **not** `<`, `>`, or `/`, so a claim statement containing the literal closing tag yields a block with two closing tags and everything after the injected tag reads as un-fenced. Reachability is the sharp part: `data_verifiable` claims **auto-canonize on submission with no league vote** (`lore/engine.ts:136-143`) and `statement` is an unconstrained `text` column with no length or content validation — one member, unilaterally. (b) More consequential: `real.ts:583-586` still passes `canonLore` `title` and `statement` **verbatim** into the judge's user message, and `judgeSystemInstructions()` (`:604-613`) is static with no instruction-hierarchy guardrail — REC-001 added the `leagueLore` framing to the *writer* path only. The judge gates publication (`pipeline.ts:1851-1878`), so injected text aimed at it could push a low-quality piece through or block a league's output entirely. Not CRITICAL because the writer-side fence achieves REC-001's stated objective (lore is out of the *cached, trusted prefix*) and the new guardrail is scope-based rather than position-based. Fix: escape `<` in both fence builders (the same weakness exists in `untrustedNewsBlock`, `pipeline.ts:1894`), and fence the judge path + add its guardrail. Effort **S–M**.

**UIX-111 — MINOR — The cost instrument covers only the league blogger.** [V]
`recordAiUsageEvent` has exactly one non-test caller — `pipeline.ts:414`. `central-pipeline.ts` records nothing, and no embedding path records usage (making the `voyage` price row dead config today). Pre-existing rather than introduced by REC-005, but it means the Phase-4 measured week systematically under-counts and the ledger's framing overstates coverage. Effort **S**. *Related MINOR, same file:* `sum(cost_micros_usd)::int` over an `integer` column (`schema.ts:3771`) now has a real ceiling of ~$2,147 accumulated per league before Postgres raises "integer out of range" — unreachable while the column was always 0, newly reachable now.

**UIX-112 — MINOR batch — Four remaining REC-delta defects, all small.** [V]
(a) **The lore-fence wording edit landed on a dead branch.** `real.ts:485` now names `<untrusted_league_lore>`, but `userTask()` returns `request.prompt.userTask` first (`:478-480`) and the pipeline always populates it, so the string the model actually receives is `prompt-templates.ts:233` — which still mentions only `<untrusted_news>`. Impact is limited (the persona guardrail *does* reach `systemInstructions` and names the block), but the edit should move to where it is read.
(b) **The "injection negative-test" asserts placement, not non-compliance** (`prompt-templates.test.ts:175-222`): it checks the injected string is absent from `systemPrefix` and present inside the fence, never that the instruction was disobeyed. Reasonable as a unit test — but it would pass unchanged against the escapable fence in UIX-110, so the ledger's phrasing implies behavioral coverage that does not exist.
(c) **Three latent gaps in REC-002's completeness query**, each verified as *not* live today: `relkind='r'` would skip a future partitioned table carrying `league_id` (zero exist); the check reads only `p.qual`, never `with_check`, so an `ALL` policy with a correct `USING` and `WITH CHECK (true)` would pass while permitting cross-league **writes** (zero such policies today); and the allowlist branch only raises when a table gains FORCE, so an allowlisted table gaining RLS-enabled-but-not-forced stays silently exempt. Worth closing (b) before a new table lands. Note the suite's own scope caveat: it proves policy *declaration*, not enforcement — the compose user is a superuser, so the non-superuser isolation canary remains the real proof.
(d) **REC-007's fan-out can partially apply with no repair path** (`central-content-generate.ts:76-87`): one try/catch wraps the whole thing and logs a warning. Inside, `tailorCentralNewsToLeagues` iterates **every league in the database** unbounded through `mapWithConcurrency`, whose `Promise.all` rejects on the first worker error (`tailoring.ts:358-377`). References written for leagues 1..k persist, the rest never appear, the job returns success, and nothing re-tailors a published central column later. The upsert is idempotent so a retry would be safe — there just isn't one. Scale note: this runs synchronously inside the Inngest step, so step duration grows with league count. Effort **S** each.

### 7.3 Corrections to the two documents (citation-level; no finding is withdrawn)

| Where | Correction |
|---|---|
| Audit §9.5.5 / UIX-004 | The dropped-loading-state citation `data-steward-review-view.tsx:225` is wrong — that line is `setSuccessMessage(null)` inside a `postAction` that correctly holds `busyKey` across the await via `finally`. The genuine premature clear is **`setPendingAction(null)` at `:530`**, before the awaited confirm/markReviewed/rerun calls. |
| Audit §9.5.4 / UIX-008 | "Refreshes inventory exactly once" is not at `onboarding-flow.tsx:326-345` — that range is buttons in a presentational component. The single refresh lives at `sleeper-connect-panel.tsx:315` / `espn-connect-panel.tsx:371`. Mechanism confirmed; citation wrong. |
| Audit §9.5.6 | `league-section-access-state.tsx` is at `src/app/leagues/[leagueId]/`, not under `src/components/`. |
| Audit §9.2b / §11.5 | **Two claims should be struck.** The boot overlay is *not* unconditional — `:2345-2349` short-circuits when `motion === "off"` or `prefers-reduced-motion: reduce` matches. And the `[U]` `aria-labelledby` item **resolves as correct wiring**: `notifications-panel-title` (`:1468`) and `account-panel-title` (`:1632`) both render on `<h2>` elements inside the same conditional block as their references. Close it rather than carrying it into UIX-016. |
| Audit §9.5.5 / UIX-012 | The press-article page is not a *literal* duplicate fetch — `generateMetadata` calls `getLeaguePressArticleShareMetadata` while the body calls `getLeaguePressArticleData`. Overlapping underlying queries, not the same call. The **invite** page *is* a literal duplicate (`page.tsx:22` and `:52`, identical arguments). "Zero React `cache()` repo-wide" is confirmed. |
| Audit §2 | "116 component files" counts `.tsx` under `src/components` **including 53 test files**, and excludes 8 `.ts` files. Non-test is 63. All other inventory counts verified exact (85 `pgTable`, 36 pages, 57 API routes, 282 test files, 3,162-line shell, migrations through 0078, 1 `error.tsx`, 15 `loading.tsx`, 0 middleware, 0 barrel importers, 0 caching primitives). |
| Both docs, §9.5/§4 | The "30-minute `stale_pending` sweep" does not exist — see UIX-107. |

### 7.4 Revised sequencing

**UIX-101 and UIX-102 land before anything currently in §4.** One is the flagship betting loop never paying out; the other is an authorization model that grants a role powers its own ACL denies. Both are S-effort. Then **UIX-109** (a one-line price correction plus an honest test) before any Phase-4 cost decision, and **UIX-104** (destructive defaults from unparseable bodies). The existing UIX-001/002/004 severity floor follows. **UIX-108 rewrites UIX-008's plan** — take the polling fallback as primary. Everything in §7.1's jobs cluster (UIX-105/106/107) should land before real cadence or a live NFL week, since all three are invisible until a real settlement or a crashed generation happens.

Twelve further client-state defects (stale-prop, double-submit, and error-surfacing classes) were verified but sit below this cut; the sharpest is a **tone-editor rollback that the next Save silently reverts** — `persona-tone-editor-view.tsx:121` seeds the form once and never reconciles, while `expectedToneVersion` reads the *fresh* prop, so the optimistic-concurrency check passes and the rolled-back content is overwritten by exactly what it was rolled back from, having never appeared on screen. Others: the betting desk's `balanceOverrideCents` is set once and never cleared (`league-bet-view.tsx:1050,1058`), so the Available figure and stake ceiling freeze after the first slip; lore vote tallies and the `isOpen` flag freeze at page load; every steward submit reports a *successful* edit as failed when the follow-up ledger read 500s; and clipboard writes assert "Copied" when `navigator.clipboard` is undefined. These belong in a batch alongside UIX-017.

---

---

## 8. Maintainer verdicts applied (2026-07-28) — see `PROJECT_CONTEXT.md`

A 5-round context interview (2026-07-27 → 07-28, pinned `e28265d`) resolved the intent questions this
backlog could not answer from code. **`PROJECT_CONTEXT.md` at the repo root is now the authority on intent**;
the changes it forces are applied here.

**Standing verdict: adopt-all.** Every item in §4 and §7 is adopted. The project is a commercial,
multi-tenant product targeting App Store submission after hardening — *not* a single-league build. Ship
blockers are calibrated accordingly. Sequence is agent-owned but requires maintainer greenlight before
execution.

### 8.1 Reclassified

| Item | Was | Now | Why |
|---|---|---|---|
| **UIX-102** | Fix the rank ladder to match the ACL | **Fix the ACL to match the ladder** — direction inverted | Maintainer ruling: admins (= commissioners) must be able to do anything an assigned role can do. The ladder encodes intent; `permissions.ts` is wrong. Collapse `league_admin` into commissioner; keep role assignment commissioner-only. Wire or delete `hasPermission` — do not leave two authority models. |
| **UIX-109** | MINOR — Opus prices 3× high | **Pricing-blocking** | AI tier pricing is set from measured cost. The meter reads ~3× on the flagship model. |
| **UIX-111** | MINOR — usage recorded for the blogger only | **Pricing-blocking** | Same reason: central pipeline and embeddings record nothing, so totals undercount. |
| **UIX-001** | Bet idempotency (double-stake) | **Reshaped — double-pick idempotency** | No stakes under Pick 'em; the idempotency requirement survives. |
| **UIX-101** | CRITICAL | **CRITICAL (reaffirmed)** | Resolving a real game result to an entry is required under Pick 'em too; the id-class mismatch is design-independent. |

### 8.2 Moot — closed, do not action

- **UIX-009** (settled-slip truthfulness: won/lost/refunded amounts, payout display) — no money in Pick 'em.
- **UIX-105** (cross-event parlay settlement race) — no parlays in Pick 'em.
- Bankroll-rollover concerns embedded in **UIX-107**'s context — the rollover is removed.

These die with the bankroll engine (§8.3). Their *underlying* lessons — grade explainability, and
concurrent grading across events — carry into the Pick 'em grader.

### 8.3 New items

| ID | Item | Note |
|---|---|---|
| **UIX-113** | Pick 'em engine: picks, weekly allowance, roster snapshot, absolute-denominator scoring, 90% participation gate, void-on-push, `DECIMAL(6,4)` accuracy, tie split | Replaces specs 08/15's bankroll model. Odds ingestion, `betting_event`/`betting_market`, the grading trigger and the arena shell all survive. |
| **UIX-114** | Tag-and-delete the bankroll engine | Tag the commit, write an ADR, delete cleanly. No fork, no feature flag — git history is the archive. |
| **UIX-115** | Lore character digest | Replace wholesale claim serialization with a regenerated per-league digest. Refuted claims **stay** (refutation is signal). Guards verbatim parroting, bounds prompt growth, shrinks the injection surface behind UIX-110. Maintainer wants to review a sample before it goes live. |
| **UIX-116** | Yahoo decoding dictionary + registration + real OAuth + closure test | Yahoo ships this season. Today any real Yahoo payload quarantines as `dictionary_missing`. |
| **UIX-117** | Two-axis entitlements | League axis (data → +league AI) and user axis (+personal assistant) are **independent**. Replaces today's open-by-default override. |
| **UIX-118** | Billing | $40/league/year base; league AI and personal assistant monthly/annual with annual discount. |
| **UIX-119** | Prize-readiness data model | Collect `geo_state`, `phone_verified`, tier from first signup while unenforced; keep accuracy independent of prize eligibility. Columns are cheap now, backfilling user actions later is not. |

### 8.4 Explicitly not building

- **The "Basic Sync" free tier.** A legal instrument for a prize that is not shipping in season 1, proposed
  by a model without project access. If a prize activates, a free-entry form is a far cheaper AMOE than free
  league sync. Reasoning recorded in `PROJECT_CONTEXT.md` §4 so it is not re-derived.
- **Dropping refuted lore claims from AI context** — proposed in §7.2 (UIX-110 discussion) and **rejected**
  by the maintainer. Refutation is context, not noise.

---

*Addendum evidence basis: all gates re-run on this box at `389a912` (results above). Five read-only auditors swept API routes, client state, jobs/settlement, doc-claim verification, and the REC delta; every CRITICAL and IMPORTANT finding above was then re-verified directly by the primary analyzer before inclusion — including reading both key spaces in `schema.ts` for UIX-101, the `ROLE_RANK`/ACL pair and the empty `hasPermission` caller set for UIX-102, and the current published Anthropic price sheet for UIX-109. Pricing was checked against the live reference rather than recalled.*

---

*Evidence basis: every `file:line` above was read this session (audit round) at `3f4c503` and the delta to `389a912` was diffed in full (2 commits, 2 files — no overlap with any cited file). Verification runs: audit-round full gates (all green, incl. 1,412/0 tests + `perf:pwa` margins) and a post-delta re-run of typecheck/lint/test (green). Four sub-auditor reports (UI shell, routes, PWA/perf, UX flows) underpin the findings; each ranked item's core claim was independently re-verified by the primary analyzer (✔ marks).*
