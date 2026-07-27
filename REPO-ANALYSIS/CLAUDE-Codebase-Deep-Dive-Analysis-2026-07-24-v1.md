# Rumbledore v2 — Codebase Deep-Dive Analysis (UI/UX & Functionality Optimization Round)

- **Date of analysis:** 2026-07-24
- **Snapshot:** branch `ws/rec-followups-2026-07-24` @ `3f4c5036444e8bcc443335d47df1929439cfb96a` ("merge: REC guardrails + hardening", 2026-07-24 02:13:49 +0200). Working tree clean. `origin/main` is at `96eaf7c` (2026-07-15); the delta between them is exactly the five REC commits (`4be95ab`, `bef18c2`, `5bebab2`, `50cb1c3`, merge `3f4c503`) — ~1,000 insertions confined to `src/ai/*`, `src/db/rls.test.ts`, `src/jobs/functions/central-content-generate.ts`, and docs [V: `git diff --stat origin/main..HEAD`].
- **Analyzer:** Claude (Fable 5) via Claude Code, orchestrating four read-only subsystem auditors (UI shell/components/theme, routes/data-fetching, PWA/perf, product-UX flows) plus a full local gate run and direct spot-verification of every headline claim.
- **Evidence labels:** **[V]** = verified this session (code read or command executed by me or an auditor whose claim I spot-checked); **[I]** = inferred from evidence; **[U]** = unverified.
- **Mission constraint (owner-directed):** an active agent owns the REC items from `REPO-ANALYSIS/CLAUDE-Analysis-and-Improvement-2026-07-23-v1.md`; those implementations are **assumed passing** and are out of scope here. This round focuses on **everything else, primarily UI/UX and functionality optimization**. REC deliverables were confirmed *present* at HEAD (fenced `<untrusted_league_lore>` block `src/ai/pipeline.ts:1933`; schema-driven RLS test `src/db/rls.test.ts:100-113`; `MODEL_PRICE_MICROS_PER_TOKEN` `src/ai/usage-attribution.ts:141`; post-publish `tailorCentralNewsToLeagues` call `src/jobs/functions/central-content-generate.ts:78`) [V] but not audited.
- **Environment caveats:** local Docker stack (pgvector Postgres @5440, Redis @6390) up and healthy [V: `docker ps`]. Full gate suite executed at this HEAD (§8). GitHub PRs/issues remain **empty** [V: `gh pr list`/`gh issue list`] — repo conversation lives in `docs/` ledgers, as before.
- **Prior analyses:** `REPO-ANALYSIS/CLAUDE-Codebase-Deep-Dive-Analysis-2026-07-23-v1.md` (pinned @ `96eaf7c`, one merge behind this snapshot) and `CLAUDE-Analysis-and-Improvement-2026-07-23-v1.md` (the REC backlog). The former was re-checked selectively at HEAD; its architectural sections remain accurate — **this report does not re-derive them wholesale** and instead cross-references (`prior §N`) while carrying forward only the load-bearing facts. Everything new in this report is this round's UI/UX + functionality audit.

---

## 1. Executive summary

Rumbledore v2 is a mobile-first, per-league fantasy-football companion PWA (Next.js 16 App Router, Drizzle/Postgres+RLS, Better Auth, Inngest, mock-pinned paid providers) built June–July 2026 by an orchestrated fleet of AI agents under a strict gate regime, validated against one real ESPN league and parked at the owner-gated Phase-4 "Reality" checkpoint (prior §1 — still true). At this snapshot, **every local gate is green, including the first fully-clean test run observed across three analysis sessions** (1,412 passed / 0 failed; §8). This round's finding, in one sentence: **the app's UI implementation quality is genuinely high (CI-gated design tokens, contrast, skeletons, reduced-motion; server-rendered charts; disciplined 44px targets), but a layer of ~20 concrete, mostly small defects sits between it and "polished product"** — a real double-bet idempotency window, a Data Book restore that leaves stale values on screen, a command palette that hard-reloads the app, an offline page-cache that never populates in production, an unbounded `/news` read path, an unreachable notification-preferences feature, and destructive commissioner actions with no confirmation — plus a **verification-layer gap**: the "perf gate" measures only bundle size (FCP/CLS/INP/tap budgets are unenforced constants) and CI e2e is two desktop-Chrome specs, so none of these regressions would be caught today. The consolidated, ranked backlog is §10 (IDs `UIX-001`…); nothing in it touches REC territory.

## 2. System map (delta view)

The full component map in prior §3 remains accurate at this HEAD (85 `pgTable`s, migrations through `0078`, 36 page routes + 56 API `route.ts` files, 282 test files, 116 component files — recounted this session [V]). What this round adds is the **UI-plane map**, which the prior report covered only at survey depth:

```
src/app/layout.tsx (the ONLY layout.tsx in the app)          [V layout.tsx:36-64]
 ├─ ThemePreloadScript / ThemeTokenStyle / ThemeProvider      three-layer FOUC-free theming
 ├─ AuspexAtmosphere                                          fixed background layers
 ├─ NavigationShell  ("use client", 3,162 lines)              wraps ALL 36 pages; children stay
 │   ├─ Desktop: Sidebar + TopBar   Mobile: TopBar + BottomTabs   server-rendered (children-as-prop)
 │   ├─ ShellWire (ticker) · NotificationsMenu · AccountMenu · CommandPalette · ShellBootOverlay(900ms)
 │   ├─ useShellRealtime → dynamic import("@/realtime/client") on connect
 │   └─ client fetches: /api/navigation/league-switcher (per pathname!), /news/wire
 └─ ServiceWorkerRegistration (production only)
src/components/ui  ~58 primitives (Base UI + CVA; barrel exists but has 0 importers [V])
src/components/publication|curation|lore|cast|pwa  feature views (mostly server components)
src/theme/registry.ts  5 themes → CSS generated at SSR; token-contract + WCAG-contrast tests gate CI
public/sw.js  v2: shell/pages/assets caches; nav=network-first, static=cache-first, api=bypass
```

Everything below the UI plane (auth, providers, ingestion, stats/curation, AI pipelines, betting, jobs, realtime/push) is unchanged from prior §3 except the four REC touchpoints listed in the header.

## 3. Critical flows

Flows A (connect→import→canon→Record Book) and B (cadence→generate→judge→publish→feed) were verified end-to-end in prior §4 and their code paths are untouched by the REC delta except where noted in the header [V: diffstat]. This round traced the two flows this mission cares about:

**Flow C — a league page render (the UX spine)** [V, traced this session]:
`src/app/layout.tsx:36` (async server layout; theme cookie read `:66-70`) → `NavigationShell` (`layout.tsx:57`) renders chrome, passes server-rendered `children` through (`navigation-shell.tsx:219,283` — the client boundary does **not** force pages client) → page e.g. `leagues/[leagueId]/page.tsx`: `export const dynamic="force-dynamic"` → `requireLeagueRole` (`src/auth/guards.ts:141`) → `markLeagueOpened` (blocking write on the critical path, `league-switcher-data.ts:81-106`) → `get…Data` module (all queries sequential; no page uses `Promise.all` [V: routes audit §1]) → view component → per-route `loading.tsx` (15 of them, all delegating to `MobileRouteSkeleton` [V]) covers the transition; failures bubble to the **single root** `src/app/error.tsx` (no per-segment boundaries [V: `find src/app -name error.tsx` → 1]).

**Flow D — a bet placement (the sharpest functional edge found)** [V, re-verified by me]:
`bet/league-bet-view.tsx` stages selections client-side → `placeSlip()` builds the POST body **minting `generateIdempotencyKey()` inline per attempt** (`league-bet-view.tsx:1141`) with a 15s abort (`:1137`) → `/api/leagues/[id]/bet/slips` → `placeBetSlip` (`src/betting/placement.ts:349-355`) honors the key — so a commit-then-timeout followed by user retry submits a **new** key and stakes twice (§9.5, UIX-002).

## 4. Tech stack & dependencies

Unchanged from prior §5 [V: `package.json` unchanged in the REC delta]: Next.js 16.2.9 / React 19.2.4 / TS strict / pnpm 10.28.2; Drizzle 0.45.2 + pg + Postgres 17 pgvector; Better Auth 1.6.16; Inngest 4.5.1; `@anthropic-ai/sdk` 0.104.1 (models pinned `claude-opus-4-8` / `claude-haiku-4-5-20251001`, all mock-pinned, $0 to date); Tailwind 4.3 + Base UI 1.5 + CVA; Biome, Vitest 3.2, Playwright 1.60, fast-check; hand-rolled RESP Redis client (triplicated — known, deliberately deferred, prior §5/backlog §5).

## 5. Navigation guide (this round's additions)

Prior §6's table stands. Additions a UI/UX-focused agent needs:

| Need | Look in |
|---|---|
| Shell chrome (bars, wire, palette, menus, boot overlay) | `src/navigation/navigation-shell.tsx` (single 3,162-line file; internal map in §9.1) |
| Active-scope derivation | `src/navigation/scope.ts:346` via `use-active-navigation-state.ts` |
| Theming (5 themes, cookie+localStorage, FOUC guard) | `src/theme/registry.ts:83-158`, `theme-provider.tsx:136-158`, `theme-script.tsx` |
| Design-token/contrast/skeleton/CLS enforcement | `src/theme/component-token-contract.test.ts`, `contrast.test.ts`, `src/pwa/mobile-performance-budget.test.ts`, `scripts/check-mobile-pwa-budget.mjs` |
| Route skeletons | `src/components/pwa/mobile-route-skeleton.tsx` (8 variants; every `loading.tsx` delegates) |
| Service worker + registration | `public/sw.js`, `src/components/pwa/service-worker-registration.tsx` |
| Feed/press reading surfaces | `src/components/publication/{front-view,article-view,story-card,reaction-strip}.tsx` |
| Data Book steward UI (save→push, checkpoints) | `src/app/leagues/[leagueId]/data/data-book-view.tsx` (large client component) |
| Betting desk UI | `src/app/leagues/[leagueId]/bet/league-bet-view.tsx` |
| Steward/commissioner console | `src/app/leagues/[leagueId]/members/steward/data-steward-review-view.tsx` |
| Push opt-in + (orphaned) preference matrix | `src/components/pwa/league-notification-toggle.tsx`, `src/app/api/push/preferences/route.ts` |

## 6. Conventions & working agreements

As practiced, unchanged from prior §7 (orchestrator + `ws/*` worktree agents; gates never disabled; league isolation sacred; hand-authored migrations ≥0035; `getEnv()` discipline). Two conventions this round proved are **real, enforced, and healthy** [V]: the `@/components/ui` barrel-import ban (0 violations repo-wide) and the spinner ban (0 spinners; enforced in `mobile-performance-budget.test.ts:30,39`). One doc note: the workspace-level `/home/ubuntu/CLAUDE.md` still points at Prime-Lab boilerplate (`/home/ubuntu/AGENTS.md`, `/home/ubuntu/environments/AGENTS.md`); only its UBS section applies to this repo — the real conventions are `rumbledore-poc/AGENTS.md` (same hazard prior §12 flagged).

## 7. Recent trajectory (30 days)

132 commits in 30 days [V: `git log --since='30 days ago'`]. Arcs: T18/T19 + incident recovery (Jul 9–11) → specs/47+48 fleet day (Jul 13) → specs/49 editorial P0–P3 (Jul 15) → **8 quiet days** → the 2026-07-23 analysis pair + REC guardrails branch, merged 2026-07-24 as `3f4c503` (current HEAD), with `ws/rec-followups-2026-07-24` created as the live working branch for the REC-owning agent [V: branch list, log]. Direction unchanged: parked at the Phase-4 owner gate; the REC agent works guardrail follow-ups (REC-003 test-DB decoupling and REC-006 canon-read caching were explicitly held/deferred as design items [V: backlog §2b]); this analysis supplies the *next* round's UI/UX + functionality queue.

## 8. Build/test/CI ground truth (executed this session, at `3f4c503`)

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ exit 0 |
| `pnpm lint` (biome) | ✅ exit 0 |
| `pnpm secret-scan` | ✅ exit 0 (1,233 tracked files) |
| `pnpm test` | ✅ **1,412 passed / 0 failed / 5 skipped** (279 files, 157s) — first fully-clean full-suite run observed in three sessions; the documented arena/bankroll load-flake class did not reproduce (box was moderately loaded with 4 read-only auditors). Skips = `LIVE_SMOKE=1` smokes. |
| `pnpm build` | ✅ exit 0 (Next 16 / Turbopack) |
| `pnpm perf:pwa` | ✅ exit 0 — **but see §9.4**: headroom on the two heaviest routes is now **3.9KB** (`/leagues/[leagueId]/press/[postId]` 296.1KB) and **5.0KB** (`/leagues/[leagueId]` 295.0KB) against the 300KB gzip budget; floor across all 25 routes ≈222KB = the shell [V: gate output]. |

CI (`.github/workflows/ci.yml`) unchanged: one Verify job, same suite + corpus privacy tripwire + two flagship e2e specs + perf budget + UBS. No deployment workflow; no production exists (prior §8).

## 9. Key insights & risks — this round's findings

Sub-audits: four parallel auditors (UI shell, routes/data, PWA/perf, UX flows); every top-ranked claim below was **independently re-verified by me at HEAD** where marked ✔. Prior-round risks (canon-boundary regimes, RLS caveats, migration inversion, mock-pinning economics, entitlements-open-by-default, sticky Redis fallbacks, Inngest env theater, security headers) all still stand as written in prior §9 and are not repeated.

### 9.1 The navigation shell is the single biggest UI lever [V]
One 3,162-line `"use client"` module (`src/navigation/navigation-shell.tsx`) mounted from the only layout in the app, containing ~30 components + 11 hooks (16 `useState`, 16 `useEffect`). It is the ~**222KB-gzip floor under every route** — with the two heaviest routes at 296.1/295.0KB against a 300KB budget, **the app effectively cannot add a feature to league-home or the article page without first shrinking the shell**. Mitigations already present: children-as-prop keeps pages server-rendered; realtime client is import-on-connect (`:1841,1928`); two `dynamic()` splits exist (`:82-100`). Cheap wins verified: `NotificationsMenu` (`:1403`), `AccountMenu` (`:1562`), `WireSheet` (`:1165`), `CommandPalette` payload (`:502`), `MobileSwitcherSheet` (`:909`) are interaction-gated but statically bundled; `activeState` is re-derived unmemoized every render (`use-active-navigation-state.ts`; `scope.ts:346`); the league-switcher list re-fetches `/api/navigation/league-switcher` on **every pathname change** (`:242,270`).

### 9.2 Two shell behaviors actively fight the SPA model [V ✔]
(a) **Command-palette navigation is a full page reload**: `window.location.assign(item.href)` (`navigation-shell.tsx:507`) — discards client routing/prefetch, re-downloads the shell, and **replays the 900ms boot overlay** on every palette jump. One-line class of fix (`router.push`). (b) **The boot overlay itself** (`ShellBootOverlay`, `:2340-2380` ✔): a fixed 900ms `backdrop-blur-xl` splash on every shell mount. It is a DESIGN.md §3 signature ("Boot… fades to app") and honors reduced-motion, so it's *intended* — but it multiplies with (a), and it is exactly the perceived-latency cost the skeleton regime everywhere else avoids. Worth an owner decision: keep for cold loads, suppress for same-session re-entries.

### 9.3 Read-path efficiency: three verified hot spots, all pre-scale [V ✔]
- **`/news` hub scans the entire published central-news corpus per request**: `getCentralNewsHubData` hardcodes `scanAllCandidates:true, candidateLimit:MAX_LIMIT` (`src/news/hub.ts:190-193` ✔), paginating everything into memory (loop `:142-172`), then filters section/tag and `slice(0, 30)` **in JS** (`:203-213`). Public page, no cache, unbounded growth — this is the first read path that will degrade when central generation runs on cadence.
- **Logged-in `/` pays a serial 4+4×N-query N+1, then discards it**: `getYourLeaguesLandingData` builds per-league cards in a sequential `for` loop (`src/stats/…/your-leagues.ts:155-172`, 4 serial queries each) and `page.tsx:22-24` ✔ then `redirect("/news")` whenever the user has any league — i.e., the entire cost is paid on every logged-in root hit and thrown away. Reorder the check before the fetch.
- **`/arena` is 6 sequential awaits including a literal duplicate**: `standingsForKind("league", {limit})` at `arena.ts:1069` is a strict prefix of the `MAX_LIMIT` call at `:1072` ✔ — one `.slice()` removes a round-trip; the rest parallelize. Fully public page, zero caching.
Related posture [V: routes audit]: **no Next caching primitive is used anywhere** (`revalidate`/`unstable_cache`/`"use cache"`: zero hits) and every page is force-dynamic — correct for league surfaces (`private, no-store` is load-bearing isolation), but `/arena*` and logged-out `/news*` are viewer-independent and safely cacheable. Also: `markLeagueOpened` (a write + redundant membership re-check) blocks every league page's critical path (`league-switcher-data.ts:81-106`); `generateMetadata`+page duplicate the same Drizzle fetch on article/invite/press pages (React `cache()` fixes).

### 9.4 The offline story and the perf gate both promise more than they deliver [V ✔]
- **The SW page cache never populates in production.** `canStorePageFallback` requires `request.credentials === "omit"` (`public/sw.js:80-86` ✔), which real browser navigations (credentialed) never satisfy — so `PAGES_CACHE` is only ever filled by the e2e test that seeds it manually (`e2e/pwa-cache-isolation.spec.ts:130-144`), and every offline navigation lands on `/offline`. The league-isolation posture (league HTML `private, no-store` + sign-out purge, `sw.js:69-78,137-142`) is intact and good; the "cached page → offline shell" tier (`sw.js:92` comment) is dead code. Decide: deliberately cache non-league pages, or delete the branch and document shell-only offline.
- **The perf gate is bundle-size-only.** `scripts/check-mobile-pwa-budget.mjs` (1) asserts the *declared JSON constants* for FCP/CLS/INP/transition/tap are within spec (`:34-59`) — nothing measures them at runtime; (2) enforces skeletons/spinner-ban in `loading.tsx` (`:61-101`); (3) gzips route JS (`:203-235`) — the only real measurement. Self-check quirk: `maxRouteJsGzipKb` is validated only as ≥1KB (`:43`), so raising 300→900 passes silently.
- **E2E is two desktop-Chrome specs** (`ci.yml:105`; `playwright.config.ts` has no mobile project). Consequence [V/I]: sub-44px targets, safe-area regressions, the dead page cache, font-swap shift, and every §9.5 defect below would ship undetected today. For a "mobile-first PWA" whose UI gates are otherwise exemplary, the *runtime* verification layer is the missing organ.

### 9.5 Functional UX defects (the sharp edges) [V; top two ✔ by me]
1. **Double-bet window**: idempotency key minted per attempt inside `placeSlip` (`bet/league-bet-view.tsx:1141` ✔) — commit-then-timeout (15s abort `:1137`) + retry = double stake. Paper money, real correctness bug; distinct from the doc-noted S6 *ingestion* idempotency set-aside. Fix: mint per staged slip.
2. **Data Book "Restore checkpoint" shows stale values**: `draftData` state is initialized from `data` and never reconciled (`data/data-book-view.tsx:2243` ✔ per UX auditor's re-verification); restore clears Draft badges + `router.refresh()` (`:2408-2436`) but edited cell values persist on screen — the steward believes the revert half-worked.
3. **Settled slips mislabel outcomes**: lost bets still display "Potential $X" (`league-bet-view.tsx:902-909`); push/void/partial-void share one tone, no won/lost/net amounts; history rows carry no leg detail and cap at 5 (`league-bet.ts:25,344-373`); all bet times render UTC (`:92-100`).
4. **Onboarding shadow-import shows a static "verifying" pill forever** — no poll, no realtime; yet the progress events already publish server-side (`src/ingestion/historical-import.ts:160` `historyImportProgress`) and no onboarding component subscribes (`onboarding-flow.tsx:326-345,416-417`). Also: mid-batch multi-league import failure discards already-succeeded legs (`sleeper-connect-panel.tsx:297-308`).
5. **Editorial controls fight the user**: retract/regenerate do `window.location.reload()` wiping their own success notice (`components/publication/editorial-actions.tsx:48,65`); generation-failure retry renders blocked/failed in the same muted style as success (`press/failures/generation-failure-retry-button.tsx:63-67`); steward confirm-dialogs drop their loading state pre-await (`data-steward-review-view.tsx:225,507-540`).
6. **Smaller verified nits**: reactions are upsert-only (can't be cleared; silent no-op POST on re-click, `content/reactions.ts:194-213`); inline markdown (`**bold**`, links) renders literally in articles (`article-view.tsx:45-96`); lore branch post doesn't refresh the thread and claim-submit leaves the form re-enabled (dup-submission risk); expired invite = bare 404 (`invite/.../page.tsx:57-59`) and the accept client has no 429 message despite the route's 10/min limit; usage dashboard prints raw micro-dollars `$0.000000` (`press/usage/ai-usage-rollup-view.tsx:61-63` — display formatting only, not REC-005's internals); access-denied CTA hardcodes "Connect ESPN" for all providers (`league-section-access-state.tsx:18-24`); reaction tap targets are 40px vs the 44px rule (`reaction-strip.tsx:131`).

### 9.6 Destructive-action safety is inconsistent [V]
**Commissioner handoff — irreversible self-demotion — is one un-confirmed click** (`data-steward-review-view.tsx:1019-1047`), while lower-stakes actions in the same console are dialog-gated. Same pattern: checkpoint restore (one click + hard-coded ledger reason, `data-book-view.tsx:804-815`), era-proposal dismiss (`:1903-1912`), webhook delete (`webhook-manager-view.tsx:507-515`). The repo has a good confirm-dialog pattern (curation push); it's just unevenly applied.

### 9.7 Built-but-unreachable features [V]
- **The notification-preference matrix has a full API and zero UI**: `/api/push/preferences` PATCH (`route.ts:30-40`) has no client caller (✔ re-verified by UX auditor: only the barrel re-export references it); the account panel renders preferences as a static KVList (`you/you-account-view.tsx:343-365`). The only reachable control is the league-home on/off toggle.
- **The persona tone editor is undiscoverable**: no link to `/leagues/[id]/cast/tone` exists anywhere in the app — platform admins must type the URL (repo-wide search; `cast/tone/page.tsx:47-53`).
- **Lore "Steward review" renders for everyone** and dead-ends non-stewards into an access-denied page (`lore/league-lore-view.tsx:226-232` vs `lore/steward/page.tsx:38`).
- Rate limiting exists but guards only 2 of 56 API routes (invite-accept, personal-agent; `src/core/rate-limit.ts:65` callers) — lore submit, poll votes, press regenerate (inline AI), tone preview (inline AI), bet slips, invites-create are unthrottled [V: routes audit §3]. Mock-mode makes this cheap today; it's one `enforceApiRateLimit` call per route.

### 9.8 What is genuinely strong (do not regress) [V]
CI-gated: design-token contract (no raw colors/px), WCAG contrast across all five themes, skeleton/spinner ban, CLS via fixed image dims, route-JS budgets, ESPN-corpus privacy tripwire. Architectural: the 3,279-line chart library is a **pure server component** (zero client JS); barrel ban fully honored; three-layer FOUC-free theming; dual-path reduced-motion (OS + in-app toggle) forced through motion tokens; runtime dev assertion that icon buttons have accessible names (`button.tsx:97-115`); skip link; Base UI focus management with correct combobox semantics in the palette; realtime degradation (offline banner, 60s reconnect, wire fallback to fetched news) is graceful; push opt-in flow handles unsupported/blocked/iOS-A2HS correctly. Empty states and permission-denied states are consistently designed. The UX defects in §9.5 are shallow — none require architectural change.

## 10. Consolidated ranked backlog (this round's output; IDs stable for the next agent)

Non-REC, $0, agent-buildable. Ranked by (user harm × frequency) ÷ effort. Effort S ≤ half-day, M ≤ 2 days, L > 2 days. Every item cites §9 evidence.

| ID | Item | Files | Effort |
|---|---|---|---|
| UIX-001 | Mint bet idempotency key once per staged slip (close the double-bet window) | `bet/league-bet-view.tsx:1128-1141` | **S** |
| UIX-002 | Reconcile Data Book `draftData` after checkpoint restore (effect on `[data]` or key-remount) | `data/data-book-view.tsx:2243,2408-2436` | **S** |
| UIX-003 | Command palette: `router.push` instead of `window.location.assign` | `navigation-shell.tsx:507` | **S** |
| UIX-004 | Confirmation dialogs on commissioner handoff, checkpoint restore, era dismiss, webhook delete | `data-steward-review-view.tsx:1019-1047` et al. | **S–M** |
| UIX-005 | Gate `/news` hub's full-corpus scan (limit/section/tag into SQL; drop `scanAllCandidates:true` default) | `news/hub.ts:142-213` | **M** |
| UIX-006 | Root `/`: check membership before building league cards; `Promise.all` the card loop | `app/page.tsx:19-24`, `your-leagues.ts:155-172` | **S–M** |
| UIX-007 | Lazy-load interaction-gated shell surfaces (NotificationsMenu, AccountMenu, WireSheet, palette payload) + memoize `activeState` + stop re-fetching league-switcher per pathname | `navigation-shell.tsx:1403,1562,1165,502,242-270` | **M** |
| UIX-008 | Onboarding: subscribe discovered-league inventory to the existing `historyImportProgress` channel (or light poll); preserve succeeded legs on mid-batch failure | `onboarding-flow.tsx:326-345`, `historical-import.ts:160` | **M** |
| UIX-009 | Settled-slip truthfulness: won/lost/refunded amounts, distinct push/void copy, leg details, local times, settledAt | `league-bet-view.tsx:892-946`, `league-bet.ts:344-373` | **M** |
| UIX-010 | Fix or delete the dead SW page-cache branch; add SW-update "refresh" toast | `public/sw.js:80-86`, `service-worker-registration.tsx:5-21` | **M** |
| UIX-011 | Arena: dedupe the double standings query, `Promise.all` the waterfall; add `revalidate`-style caching to `/arena*` + logged-out `/news*` | `arena.ts:1042-1091`, `next.config.ts` | **M** |
| UIX-012 | Editorial feedback: replace `window.location.reload()` with `router.refresh()`; distinct retry-failure styling; keep dialog loading state | `editorial-actions.tsx:48,65`, `generation-failure-retry-button.tsx:63-67` | **S** |
| UIX-013 | Reachability: link the tone editor from cast page (admin-only); role-gate the lore steward button; wire the notification-preference matrix UI to its API | `cast/…`, `lore/league-lore-view.tsx:226`, `you-account-view.tsx:343-365` | **M** |
| UIX-014 | Extend `enforceApiRateLimit` to the unthrottled mutation/AI routes | `src/core/rate-limit.ts:65` + ~7 routes | **S–M** |
| UIX-015 | Per-segment `error.tsx` for `leagues/[leagueId]` + `global-error.tsx`; home link on root error | `src/app/**` | **M** |
| UIX-016 | Runtime perf verification: mobile Playwright project + web-vitals assertions (or relabel budgets as targets); budget-ceiling self-check | `playwright.config.ts`, `check-mobile-pwa-budget.mjs:34-59,43` | **L** |
| UIX-017 | Small-nit batch: reaction clear-on-re-click + 44px; inline-markdown rendering; lore form reset/thread refresh; invite expired/429 copy; micro-dollar formatting; provider-aware access CTA; press-feed pagination | §9.5.6 refs | **S each** |

**Sequencing:** UIX-001/002/003/004 first (S-effort, user-facing correctness/safety); UIX-005/006 before any central-content cadence activation (read-path scale); UIX-007 before any feature lands on league-home/article routes (3.9KB headroom); UIX-016 is the structural investment that makes the rest regression-proof. Coordinate nothing with the REC agent — file sets are disjoint (closest contact: UIX-017's cost *formatting* vs REC-005's cost *computation*; and UIX-005/011 don't touch `central-content-generate.ts`).

## 11. Open questions & unverified areas (ranked)

1. **Is the 900ms boot overlay owner-intended on every mount, or only cold starts?** DESIGN.md §3 sanctions a boot splash; its interaction with palette hard-nav (UIX-003) makes it feel broken today. Ask before changing the overlay itself; UIX-003 is safe regardless.
2. **Offline product intent** (UIX-010): was "cached last page when offline" ever a requirement, or is shell-only offline acceptable? The code implies the former; production behavior is the latter. [V mechanics / U intent]
3. **Live-update reading UX**: realtime currently swaps RSC content under the reader (coalesced `router.refresh()`, `realtime/client.tsx:362-384`) with no "N new" affordance — acceptable now, worth a decision before real content cadence. [I]
4. **Bottom-tab overflow on mobile** ([I], from code): league scopes with many sections horizontally scroll `MobileBottomTabs` (`navigation-shell.tsx:893-895`) with no affordance — needs a device check to confirm severity (no mobile e2e exists to answer it; UIX-016).
5. **`aria-labelledby` integrity** in notifications/account panels (`navigation-shell.tsx:1452,1616`) — auditor could not confirm the referenced IDs render; 5-minute check. [U]
6. **Test-flake status**: this session's fully-clean run suggests the arena/bankroll flake class may be load-dependent-only; REC-003 (held) remains the owner's call. [V one run / I trend]
7. Carried forward unresolved from prior §11: live-week soak, Yahoo reality gap, multi-instance fallback latches, Inngest cloud config — all Phase-4/6 gated, unchanged.

## 12. Documentation upkeep performed

`AGENTS.md` and `README.md` were audited section-by-section against code **yesterday** (prior §12) and the REC delta touches neither's subject matter; both remain accurate, so no edits were made (the one flagged aspirational line — "Neon…Upstash" — remains an owner-wording decision). Current staleness found this session: `docs/PROGRESS.md:4-5` again lags HEAD by one merge (says "P3-FIX merged, HEAD `96eaf7c`"; actual HEAD `3f4c503` includes the REC merge) — left to the orchestrator per SSOT ownership, flagged here. `docs/START-HERE.md` and `HANDOFF-NEXT-AGENT.md` were reconciled in the REC round and are current through their own scope. This file (v1, 2026-07-24) is the durable artifact of the UI/UX round; it deliberately does not restate prior-round architecture — read it together with `CLAUDE-Codebase-Deep-Dive-Analysis-2026-07-23-v1.md` (architecture/security/data planes) and `CLAUDE-Analysis-and-Improvement-2026-07-23-v1.md` (REC ledger, owned by the active REC agent).

---

*Appendix — evidence of execution: gate log in session scratchpad (`gates.log`: lint/secret-scan/test/build all exit 0; test summary 1,412/0/5), `perf:pwa` route-size output quoted in §8, and direct re-verification reads quoted inline (sw.js cache gate, palette assign, boot overlay, hub scan, root redirect, arena duplicate query, bet idempotency mint, REC artifacts). Four auditor sub-reports (UI shell, routes, PWA/perf, UX flows) are preserved in this session's transcript; their top findings were independently spot-checked before inclusion.*
