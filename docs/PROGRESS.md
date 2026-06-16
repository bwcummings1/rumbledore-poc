# Rumbledore v2 — Master State & Handoff

**This is the single source of truth.** Any agent/model/tool continuing this work reads this first.
Keep it current. Last updated: 2026-06-16 — **AUSPEX League Home dashboard landed** with a matchup hero, sortable standings, cast headlines, bankroll preview, and league wire.

---

## 0. TL;DR for whoever picks this up
- We are doing a **clean, first-principles rebuild** of Rumbledore on branch **`rebuild/foundation`**.
- Execution model: **Ralph loop** (autonomous agents in tmux) — see `docs/methodology` below + `AGENTS.md` + `PROMPT_build.md`.
- **Account routing:** the build runs on `bxbxbxbxbxr`, but the Claude account is set by the CONFIG DIR (`CLAUDE_CONFIG_DIR`/`XDG_CONFIG_HOME`), **not** `HOME` — `loop.sh` pins it via `CLAUDE_CONFIG_DIR=/home/ubuntu/.claude`. Use launchers `cbx`/`cbw`/`cx`. Never run heavy work on `bwcummings1` (other agents + shared 5h limit). See `docs/HISTORY.md §3`.
- ESPN ingestion is **proven working** on a real league (95050). Creds are in gitignored `.env.local`.
- Quality gates are **ON** from day one (typecheck, lint, test, build, `ubs`). Never disable them.

## 1. What Rumbledore is (product vision)
A **sandboxed, per-league fantasy-football companion**. Connect your existing ESPN league (later Sleeper + Yahoo), ingest current + ~10 yrs history, and per league get:
- **Per-league home base** — an ESPN-fantasy-homepage-style front page; some content shared across leagues, some league-specific; as real-time as feasible.
- **Two-tier news + AI blogger** — (a) a **central** NFL/fantasy news hub open to all leagues; (b) a **league-tailored** feed; (c) a per-league **AI blogger** with personas (Commissioner, Analyst, Narrator, Trash-Talker, Betting-Advisor) blending league storylines (rivalries, managers, inside jokes from history) with real NFL news. Web-grounded.
- **Paper betting** — DraftKings/FanDuel-style markets, real odds, fake money. **Rolling-minimum weekly bankroll**: floor e.g. $10k; lose all → reset to floor next week; finish above floor → carry balance forward.
- **Central inter-league arena** — leagues are data-sandboxed, but a central plane hosts **league-vs-league + individual** paper-betting leaderboards/competition.
- **League records** — all-time records section built from ~10 yrs of history.
- **Frictionless onboarding (the #1 past failure)** — NO manual cookie/console digging. Connect once → auto-discover ALL your leagues → invite leaguemates (viral seed). Must work on **mobile**.
- **A league "data steward" role** — a designated member who can review/clean their league's data.
- **Bar:** new, snappy, mobile-first (distributed via a shareable link), desktop parity, nothing dated.

## 2. Branch reality (important — `main` is NOT current)
- `main` = 2 commits, the *oldest* checkpoint ("phase 1 complete"). Audited; mostly obsolete.
- The old "real" code reached ~Phase 5 on **`v0.62`** (linear `main→…→v1.0→v0.61→v0.62`, +238k lines) but was **never merged**. It has the same fatal patterns at scale: build gates disabled, `middleware.ts` auth disabled, ~5% test coverage, committed coverage HTML.
- `claude/ultrathink-project-review` is the newest *by date* but a **divergent dead-end** (missing ~238k lines). Ignore it.
- **Decision (user): clean rebuild, reuse only proven assets.** Mine `v0.62` on demand via `git show v0.62:<path>` (good candidates: Prisma schema/domain modeling, `lib/crypto/encryption.ts`, ESPN request/header learnings, identity-resolution logic). Do NOT carry over the disabled-gates/fake-auth patterns.

## 3. Validated facts (proven this session, not assumptions)
- **ESPN cookies work.** `SWID`+`espn_s2` (in `.env.local`) returned HTTP 200.
- **League auto-discovery works** (the onboarding thesis): `GET https://fan.api.espn.com/apis/v2/fans/{SWID}` (cookies only) returns all leagues → discovered league **95050**, season **2026**.
- **Full league ingestion works:** `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/95050?view=mTeam&view=mSettings` → 200, league **"NHS Alumni Annual"**, 12-team `H2H_POINTS`. Use this as the real test fixture.
- Headers that matter for ESPN: real `User-Agent`, `x-fantasy-source: kona`, `x-fantasy-platform: kona`, `X-Personalization-Source: ESPN.com - FAM`. Keep all cookie'd calls **server-side**.

## 4. Recommended stack (locked unless a spec says otherwise)
| Layer | Pick |
|---|---|
| App/UI | **Next.js (App Router) PWA**, mobile-first, Tailwind + shadcn/ui; installable via link |
| Auth | **Better Auth** (organization plugin → league=org; roles incl. commissioner/data-steward) |
| DB | **Neon Postgres + pgvector**, **Drizzle ORM**; local Postgres via Docker for dev |
| Isolation | **Postgres RLS** on `league_id`; central/arena tables open-read |
| Jobs | **Inngest** (cron + event-driven: odds polling, ingestion, AI gen, settlement); Trigger.dev escape-hatch for long AI jobs |
| Realtime | **Supabase Realtime Broadcast** (works with Neon) |
| Cache | **Upstash Redis** (local Redis for dev) |
| AI | **Anthropic SDK direct** (NO LangChain). Claude for flagship voice + a cheaper Claude tier for bulk; prompt-cache persona+league-facts prefix. Confirm exact model IDs/pricing via the `claude-api` skill at build time. |
| Web grounding | **Tavily** + RSS + sports feed |
| Odds/Betting | **The Odds API** (odds) + **SportsDataIO** (results/prop settlement); append-only `odds_snapshots`, odds locked at placement, event-sourced `bankroll_ledger` |
| Provider abstraction | `FantasyProvider` interface; ESPN now, Sleeper (no-auth) + Yahoo (OAuth2) later; normalized model |
Alternatives on file: Railway/Render PaaS monolith (if serverless workers bite); Expo native wrapper (if push-retention demands).

## 5. Methodology & guardrails
- **Ralph loop** (Geoffrey Huntley / Clayton Farr playbook): `specs/*` + `PROMPT_plan.md`/`PROMPT_build.md` + `AGENTS.md` + disposable `IMPLEMENTATION_PLAN.md`; loop runs `claude -p --dangerously-skip-permissions`; **tests/build/lint are mandatory backpressure gates before every commit**. No stubs/placeholders — implement completely.
- **Verification per iteration:** typecheck + lint + unit/integration tests + build + `ubs <changed files>` must pass before commit. (Optionally wire `no-mistakes` as a validated push gate.)
- **UI taste:** follow **impeccable** — maintain `DESIGN.md` + `PRODUCT.md`; run `npx impeccable detect src/` as a CI gate. (UI polish is not the immediate priority, but new UI must not be "AI slop".)
- **Secrets:** never commit. `.env*` is gitignored. Add a secret-scan gate.
- **Git:** work on `rebuild/foundation` (or child branches), commit often, push freely. NEVER force-push; NEVER touch `main`/`v0.62`.
- **Accounts:** the Claude account is the CONFIG DIR, not `HOME` (this run's Fable phase mistakenly used `bwcummings1` because only `HOME` was set — now fixed). Launchers in `~/.local/bin`: `cbx` (Claude bxbxbxbxbxr), `cbw` (Claude bwcummings1 — reserved), `cx` (Codex). `loop.sh` pins Fable via `CLAUDE_CONFIG_DIR=/home/ubuntu/.claude`.
- **Model plan:** Fable 5 at max effort for the build window (~2h), then switch to Codex 5.5 high. This doc + the specs make the handoff seamless.

## 6. Research briefs (full reasoning lives in the planning conversation; key conclusions here)
- **Onboarding/mobile:** browser extensions CAN'T read ESPN HttpOnly cookies on mobile (iOS Safari / no Android extensions). Mobile primary = **hosted live-browser login** (Browserbase-style: user logs into ESPN in an embedded cloud browser, capture session server-side). Desktop fallback = MV3 extension. `chrome-devtools-mcp` is a dev tool, NOT a consumer channel.
- **Betting:** play-money (no real prize) = low legal risk; never add real prizes, never use sportsbook trademarks, license odds (don't scrape a book). Parlays: all legs win; push/void leg drops & re-prices.
- **AI:** treat all web/RSS as untrusted (prompt-injection); enforce league isolation in SQL (`WHERE league_id`) + RLS, never trust the model; near-dup check generated posts (cosine > ~0.92).

## 7. Current state & next steps (build complete 2026-06-12)
All planned scope (P0–P5) is built, committed on `rebuild/foundation`, and behind green gates (typecheck/lint/test/build/ubs; ~300 tests vs a live Postgres). See §8 for the build log and `docs/HISTORY.md` for the trajectory + independent review.
- **Real & verified:** per-league RLS isolation (binding non-superuser canary), Better Auth, ESPN/Sleeper/Yahoo ingestion (vs the 95050 fixture), stats/records/identity, AI content pipeline, betting engine + rolling-min bankroll + central arena, realtime + push.
- **Mocked (drop-in keys later):** Anthropic, The Odds API, SportsDataIO, Tavily, Voyage, Browserbase. Real Browserbase cookie-capture is the one un-wired seam (ESPN onboarding runs fixture-backed by default).
- **Known issues to fix (from review; logged in `IMPLEMENTATION_PLAN.md` Icebox):** AI near-dup uses no vector ordering (`src/ai/pipeline.ts`); stats playoff/championship flags hardcoded false (`src/stats/engine.ts`); identity over-merges Sleeper co-owners; invite tokens stored plaintext; bet placement reads balance before the week lock.
- **Next:** fix the above (`./loop.sh harden 10` works the highest-value Icebox items), wire real service keys, and do a human UX pass on the front-end.

## 8. Recent (loop log; newest first)
- 2026-06-16: AUSPEX League Home dashboard landed — league home now composes the matchup hero, local wire, scoreboard, sortable standings, Press rail, bankroll preview, records, teams, and responsive empty states without changing the scoped loader.
- 2026-06-16: AUSPEX article page landed — publication articles now carry sticky reading progress, orb/source bylines, pull quotes, structured inline data blocks, canon/tags, and non-dead-end related/next reading paths.
- 2026-06-16: AUSPEX publication fronts landed — Rumbledore News and The Press now share a mastheaded editorial grid with section-front context, responsive rail/river hierarchy, empty states, and publication-shaped loading skeletons.
- 2026-06-16: AUSPEX editorial reading register landed — PublicationStoryCard now supports hero/secondary/river/rail/compact/inFeed variants with cast-orb bylines, and article bodies share the `prose-auspex` long-form skin.
- 2026-06-16: Realtime shell/PWA affordances landed — the WIRE ticker and notifications now consume scoped realtime events, league presence is surfaced in the switcher/chrome, and the boot, install, and offline states use AUSPEX treatment.
- 2026-06-16: AUSPEX scope switcher landed — the unified MRU league switcher now promotes the Global Your Leagues row, uses provider-tagged scope rows with optional presence labels, supports keyboard row navigation, and opens as a focus-managed mobile Sheet.
- 2026-06-16: Responsive AUSPEX app shell landed — desktop rail/topbar, tablet collapse persistence, mobile header/tabs, WIRE strip/sheet, notification/account chrome, live clock, skip link, and persisted motion controls now compose the existing two-scope IA.
- 2026-06-16: Live AUSPEX spectacle primitives landed — WIRE ticker, scoreboard strip, count-up readouts, live pulse dots, cast orb states, stingers, vote/canon moments, and a deterministic conductor now share the reduced-motion master switch.
- 2026-06-16: Rumbledore-native viz catalog landed — bankroll equity, standings bump, playoff-odds cone, win-probability timeline, odds drift, season arc, H2H flow, activity calendar, power ladder, leverage gauge, record chase, projection violin, and season dial now share the typed AUSPEX chart contract with table fallbacks and focused fixtures.
- 2026-06-16: AUSPEX chart library landed — a typed shared SVG primitive now formalizes the 18 canonical generators with non-color encodings, focusable marks, table fallbacks, responsive reductions, state handling, and reduced-motion CSS.
- 2026-06-16: AUSPEX navigation atoms landed — shared breadcrumbs, tabs, pagination, wizard steps, and a Ctrl/Cmd-K command palette now ship with focused tests and real shell/news/press/onboarding/arena adoption.
- 2026-06-16: AUSPEX feedback/overlay components landed — shared alerts, banners, toasts, dialogs, responsive sheets, tooltips, popovers, skeletons, and empty/gated states now ship with focused tests and route-safe adoption.
- 2026-06-16: AUSPEX data-display components landed — table-to-mobile-card primitives, status/badge/tag/edge labels, KV rows, avatars/presence, meters/pips, and stat tiles now ship with focused tests and are adopted by the Arena leaderboard.
- 2026-06-16: AUSPEX control library landed — shared Button, Field/Input/Search/Textarea/Select/Stepper/Switch/Segmented/Slider/Checkbox/Radio/Chip primitives now carry tokenized states, a11y wiring, and adoption in league switcher, push toggle, lore, and bet flows.
- 2026-06-16: AUSPEX motion and a11y foundation landed — named motion/easing tokens now cover atmosphere, orb, count-up, draw-in, staged process, hover-lift, focus bloom, and marquee flows, with audited focus contrast plus global reduced-motion-safe keyboard focus.
- 2026-06-16: AUSPEX signature primitives landed — global foundation utilities now cover the conic AI orb with motion-safe states, Y2K bezel/chip chrome, and glass panel/cell surfaces with opaque fallbacks.
- 2026-06-16: AUSPEX atmosphere foundation landed — the app now mounts one decorative starfield/scanline/grain/vignette layer tree behind content, with desktop-only drift plus tablet, mobile, and reduced-motion static fallbacks.
- 2026-06-16: AUSPEX typography system landed — Michroma/Saira/JetBrains Mono/Inter now load through `next/font`, the theme contract exposes display/body/3xl/prose/numeric tokens, and global utilities cover gradient-clipped headings, LCD numerics, keyboard glyphs, and the reading register.
- 2026-06-16: AUSPEX theme registration landed — canonical AUSPEX raw tokens now populate the Phase 4 theme framework, `auspex` is the default active theme, neutral-dark remains selectable as fallback, and the contrast gate audits the new hex palette.
- 2026-06-16: Component token migration landed — shared UI, app badges, and navigation shell literals now resolve through token utilities, default transitions route through motion tokens, and a token-contract test blocks raw component color/font/radius/duration literals.
- 2026-06-16: Token accessibility gates landed — registered themes now run WCAG contrast checks over semantic foreground/background pairs, prove bad palettes fail, and verify reduced-motion CSS collapses all motion duration tokens.
- 2026-06-16: ThemeProvider swap landed — registered neutral-light plus palette-a/palette-b slots now cascade through `data-theme`, with SSR cookie resolution, a pre-paint theme script, and persisted runtime switching.
- 2026-06-16: Design-token system landed — the neutral-dark baseline now lives as typed primitives plus semantic aliases, generated into CSS vars and bridged through Tailwind utilities for type, spacing, radii, elevation, motion, and colors.
- 2026-06-16: AI variant A/B eval harness landed — `pnpm eval:ai:variants` now scores deterministic model×tone variants across golden fixtures/content types, writes a machine-readable scorecard, names a winner, and disqualifies leaking variants.
- 2026-06-16: Versioned prompt-template management landed — AI generation now renders ordered prompt sections with template id/version metadata, feeds rendered system/user instructions to real providers, and records template/tone/model provenance on generation runs.
- 2026-06-16: Versioned AI tone-profile records landed — persona cards now persist editable tone profiles with version/attribution, render tone/guardrail framing from data, and deterministic mocks prove tone edits change prompts and drafts.
- 2026-06-16: Data-driven AI model routing landed — generation now resolves bulk/flagship/custom providers per persona/content-type route config, supports exact task overrides, and falls back safely when optional custom routes are unavailable.
- 2026-06-16: Pluggable AI model-provider seam landed — generation can now use the existing Anthropic path, an Anthropic-compatible custom endpoint, or an OpenAI-compatible custom endpoint selected by validated env config while preserving the pipeline's `LlmClient` contract.
- 2026-06-16: Fixture-first paid-provider VCR harness landed — Anthropic, Tavily, Voyage, The Odds API, and SportsDataIO now replay scrubbed cassettes offline, live smoke is gated by `LIVE_SMOKE=1`, and Anthropic structured output now uses per-content schemas small enough for real Haiku validation.
- 2026-06-16: Provider usage observability landed — guarded real provider calls now emit secret-free usage logs with token/request counts and expose provider usage totals through health metrics.
- 2026-06-16: Per-provider spend guard landed — real Anthropic, Tavily, Voyage, Odds, and SportsDataIO paths now cap Redis-backed usage and demote to deterministic mocks on breach.
- 2026-06-16: Cheap AI model-tier defaults landed — Anthropic now defaults every persona to Haiku with an opt-in mixed tier, and Voyage embedding model selection is env-overridable while defaulting to voyage-4-lite.
- 2026-06-16: Clean provider mock→real selection verification landed — env parsing and dependency factories now assert key-present real paths plus forced-mock paths for Anthropic, Odds, SportsDataIO, Tavily, and Voyage.
- 2026-06-16: Mobile PWA perf budget landed — App Router skeleton loading states now cover the mobile shell route families, CI runs a post-build route JS budget check, and the budget locks FCP/repeat-start/transition/CLS/INP/tap-target targets.
- 2026-06-15: Share-link deep routing landed — unauthenticated league-scope links now bounce through onboarding with a safe preserved destination, invite links return after provider connection, and matching league imports continue to the saved destination.
- 2026-06-15: PWA cache-safety hardening landed — service worker runtime caches now skip API/cross-origin/auth/private/no-store/Vary responses, sign-out clears page caches, and browser push is unsubscribed before session exit.
- 2026-06-15: PWA install affordance landed — `/you` now exposes Android `beforeinstallprompt` install flow, iOS Safari Share→Add instructions, standalone hiding, and persisted dismissal.
- 2026-06-15: Central news tailoring hand-off landed — refreshes now carry provider-player refs into central metadata, match them against latest league rosters, and upsert league-scoped feed references for the existing `/news` rail and Press blend.
- 2026-06-15: Central News editorial front hardening landed — `/news` and section fronts now rank the full central corpus by freshness plus editorial importance before tiering into lead, secondaries, and river.
- 2026-06-15: Multi-source central news pipeline landed — central refresh now fans in mocked web-grounding plus RSS adapters, carries publication metadata/provenance, and merges duplicate citations across refreshes.
- 2026-06-15: Reactive cadence enrichment landed — game-final pieces now share weekly-wrap idempotency, reactive lore/bet/arena keys carry NFL-week framing, and generation prompts receive structured cadence stakes.
- 2026-06-15: Offseason/quiet-week cadence landed — scheduled AI planning now has a weekly offseason beat, preseason countdown slate, explicit quiet-week signal, complete-season offseason eligibility, stable keys, and gated tests.
- 2026-06-15: In-season weekly cadence slate landed — scheduled AI planning now supports explicit missed-week NFL state for backfill, phase-specific cast pairings are locked by tests, and the cron wrapper path is covered.
- 2026-06-15: NFL calendar cadence seam landed — scheduled AI cadence now uses a mockable league-agnostic week state for phase/game-state slates and calendar-stable cron keys.
- 2026-06-15: Notification taxonomy/preferences landed — Web Push now has lore and arena-rival event types, per-league RLS opt-outs, a guarded preferences API, and fan-out filtering before delivery.
- 2026-06-15: Web Push end-to-end scoping landed — league notification toggles now verify per-league endpoint rows before showing enabled, empty personal recipient sets no longer fan out league-wide, and VAPID public-key exposure is covered.
- 2026-06-15: Realtime client reconnect hardening landed — league-scoped subscriptions now refetch short-lived grants before expiry and recover from Supabase channel failures or token fetch errors with fallback backoff.
- 2026-06-15: Lore realtime broadcast fan-out landed — lore vote-opened/canonized events now publish on league-scoped realtime channels from member submissions, steward actions, poll instigations, vote closes, and record-broken verified hooks.
- 2026-06-15: Record-broken cast/lore hooks landed — incremental record displacements now emit stable record-broken cast events, seed idempotent AI-origin data-verifiable lore claims, and give milestone generation the displaced prior holder.
- 2026-06-15: Record-book aggregate materialization landed — all-time standings and keeper milestones now persist as RLS-scoped aggregates, full and targeted stats recomputes refresh them idempotently, and live finalized-score changes run a distinct records pass.
- 2026-06-15: League Records surface deepening landed — `/records` now renders a structured record book with standings, records, championships, rivalries, and dedicated per-manager plus canonical head-to-head pages.
- 2026-06-15: Symmetric H2H and postseason records catalog landed — record-book reads now expose all-time/per-season rivalry ledgers, mirrored manager H2H lines, championship seasons, and playoff/title records from trusted materialized stats.
- 2026-06-15: All-time records catalog aggregates landed — standings, highs/lows, head-to-head-only blowouts/closest wins, and cross-season streaks now assemble behind an integrity-quarantined records catalog service.
- 2026-06-15: Same-auth season rollover landed — live ingestion now re-discovers connected credentials, persists newly exposed seasons, advances durable league roots, and fans out next-season ingest events without re-onboarding.
- 2026-06-15: Reconnect-on-expiry scheduler pause landed — live ingestion now reports invalid credential targets with provider reconnect CTAs, skips fan-out until reconnect, and still treats auth expiry as non-retriable.
- 2026-06-15: Finalized-state ingestion hardening landed — current sync now rejects final-to-non-final matchup flaps with steward-visible integrity notes, preserves completed league seasons, allows final score corrections, and fans out hash-keyed `game.final` events from live ingest.
- 2026-06-15: Pluggable ingestion poll policy landed — cadence now lives in a validated data config with env/global and explicit override seams, while `ingestion.tick` consumes the injectable policy interface.
- 2026-06-15: Adaptive ingestion cadence landed — `ingestion.tick` now consults an injectable game-state provider and `data_coverage` freshness to fast-path live matchup polling while skipping off-hours rows before their window.
- 2026-06-15: Live ingestion heartbeat landed — `ingestion.tick` now cron-plans connected discovered leagues into provider-scoped `league.ingest` workers that reuse stored credentials and current sync.
- 2026-06-15: First-bet bankroll opening landed — bet placement now atomically opens the current rolling-minimum week when no active week exists, the Bet surface submits first slips against the floor, and settlement/rollover arena rebuilds now fan out only to affected arena seasons.
- 2026-06-15: Lore challenge/citation round-trip landed — claim pages now create response/addendum/dispute/re-litigation branches, AI-origin votes show cast bylines, and Press articles link canon citations back to lore claims.
- 2026-06-15: Lore canon browsing landed — the Lore front now tiers ratified canon with publication Story Cards and subject filters, while claim pages render full branch/dispute lineage with superseded/upheld annotations.
- 2026-06-15: Lore vote experience landed — open claims now expose live tally/quorum/window state, members can recast votes through guarded APIs, and stewards can ratify/reject/extend quorum-short votes from a lore review surface.
- 2026-06-15: Lore IA submit surface landed — league navigation now includes Lore, Records/Press cross-link to the canon ledger, and members can submit opinion or structured data-verifiable lore claims through a guarded API route.
- 2026-06-15: Entitlement caps/admin path landed — cadence planning now enforces weekly AI post caps with league overrides, personal-agent league caps remain server-side, and platform admins can grant league/user entitlements with append-only audit.
- 2026-06-15: Individual personal-agent gate landed — `/you` now resolves `ai.individual.agent` before cross-league briefing work, renders a locked individual-tier state for free users, and caps active coverage from entitlement config.
- 2026-06-15: Premium AI gate landed — league cast generation now blocks before web/LLM/embed spend for free leagues and cadence planners skip free-league fan-out while preserving dev/test override.
- 2026-06-15: Entitlement resolver landed — capability checks now resolve league premium, user individual, dev override, expiry/suspension, caps, and advisory arena gating from one injectable server-side path.
- 2026-06-15: Entitlement model landed — auth-plane league/user entitlement rows now represent FREE/PREMIUM league access and INDIVIDUAL user access with append-only audit events.
- 2026-06-15: Data-steward doorway landed — commissioners can appoint league-scoped stewards, flagged imports deep-link to review, and stewards can confirm fuzzy links or mark integrity flags reviewed.
- 2026-06-15: Invite activation hook landed — claimed members now see their team, current matchup, all-time stats/record hits, and cast coverage on league home with latest-headline fallback.
- 2026-06-15: Claim-your-team invite flow landed — Members can copy a reusable roster claim link, invitees can pick an unclaimed imported team, and acceptance now maps user→provider-member before granting league access.
- 2026-06-15: Primary roster invites landed — Members now bulk-copy roster invite links, keep SMS as the prominent contact-supplied path, and keep email behind an entered-address fallback with hashed/hinted destinations.
- 2026-06-15: Leaguemate detection surface landed — imports now carry provider-aware "we found your N leaguemates" summaries, exclude the connector's known team slot, and link directly into roster invites.
- 2026-06-15: Unified onboarding inventory landed — ESPN, Sleeper, and Yahoo discovered leagues now aggregate in one persisted "Your leagues" list with provider-aware import from any connect screen.
- 2026-06-15: Arena recap narration landed — the AI cast now has a structured `arena_recap` content type, aggregate arena context in prompts, post-odds-refresh and standings-swing planning, and settlement-driven swing fanout.
- 2026-06-15: Settlement reactions landed — settled slips now send member-specific outcome/payout/bankroll push notifications, refresh league/arena realtime leaderboards, and emit idempotent arena standings-swing signals from materialized rank deltas.
- 2026-06-15: Arena rivalry framing landed — `/arena` now carries focused league context, computes league head-to-head leaders/margins from aggregate standings, and renders compare-against rivalry links.
- 2026-06-15: Arena season movement landed — `/arena` now defaults to the active arena season, links prior seasons, stamps prior-rank deltas on materialized league/individual standings, and surfaces biggest risers/fallers.
- 2026-06-15: Mock market depth landed — every mocked NFL event now carries moneyline, spread, total, and player-prop markets with matching mock player stats, plus placement/settlement coverage for prop parlays.
- 2026-06-15: Bankroll loop surface landed — league Bet now shows this-week balance, open exposure, open upside, best-case balance, and auditable reset/carryover opening context from the append-only ledger.
- 2026-06-14: Bet slip placement landed — league Bet now builds singles/parlays from locked snapshot selections, previews stake/payout against live bankroll, submits through an authenticated idempotent placement route, and surfaces stale-line/balance errors.
- 2026-06-14: Sportsbook board grouping landed — league Bet now groups mocked odds by event, renders market rows with selectable locked-price buttons, and stages picks for the slip flow.
- 2026-06-14: Bidirectional AI-lore contract landed — AI context now carries canon/pending/disputed/refuted lore buckets with canon-only assertion rules, and planned instigations now seed poll-backed AI-origin lore claims before verdict canonization.
- 2026-06-14: Challengeable canon landed — dispute/relitigation branches now mark canon as contested, supersede it on successful challenges, restore it as upheld on failed challenges, and preserve thread lineage with append-only events.
- 2026-06-14: Lore two-type submission landed — data-verifiable claims now resolve synchronously against league stats into verified canon/refuted rejection/unverifiable vote fallback, while pure opinion claims stay vote-ratified.
- 2026-06-14: Lore vote lifecycle landed — opinion claims now open first-class votes, one-vote-per-member tallies enforce quorum/majority canonization, and commissioners/data stewards can ratify/reject/extend/veto with append-only audit plus `lore.vote.close` fan-out.
- 2026-06-14: League lore data model landed — claims now carry verification/body/branch/thread/vote metadata, claim-native subjects/verifications/votes are RLS-scoped, and the canary covers cross-league isolation plus one-vote-per-member.
- 2026-06-14: Offline LLM-judge eval gate landed — deterministic mock judge scores generated cast output for authenticity, persona match, and cross-league leakage across all content types in CI.
- 2026-06-14: Authenticity engine landed — AI prompts now carry league-scoped canonical people, rivalries, record facts, and ratified canon; generic drafts retry/skip, and near-dup checks query nearest same-content vectors before publishing.
- 2026-06-14: Instigator engine landed — grounded settle-it seeds now create first-class instigations, polls, one-vote-per-member tallies, poll-derived canon claims, and idempotent Commissioner verdict columns with RLS/append-only coverage.
- 2026-06-14: AI cadence and trigger framework landed — mid-week cadence, event-driven planners for transactions/waivers/records/lore/polls/bet settlements, rivalry/milestone/instigation/verdict templates, and bet-settled fan-out now emit idempotent content generation candidates.
- 2026-06-14: Structured AI content templates landed — generation jobs now carry content types, persist typed template structures, and mock/real LLM contracts cover recaps, rankings, previews, awards, reactions, and arcs.
- 2026-06-14: Persona cast contract landed — six AI cast cards now include Beat Reporter plus explicit beat, POV, and performance triggers in persisted persona cards and cached generation prompts.
- 2026-06-14: AI article-shape generation landed — league blog generation now emits/persists headline, dek, persona byline metadata, league section, tags, and structured body blocks for Press articles.
- 2026-06-14: For-your-league central News rail landed — `/news` can now carry an active-league rail of matched central stories via league feed references without reframing the central Front.
- 2026-06-14: Publication Story Card/register separation landed — fronts, article rails, central/league teasers, and League Home's small From the Press module now share one story-card contract with optional thumbnails and relative time.
- 2026-06-14: Publication Article archetype landed — league Press and central News stories now open full article pages with bylines, dek, structured body rendering, tag links, and related-story rails.
- 2026-06-14: Publication section fronts landed — central News and league Press now expose typed section taxonomies with section-filtered Front routes and empty-state-safe beat navigation.
- 2026-06-14: Publication Front archetype landed — `/news` and league Press now render ranked lead/secondary/river tiers from a shared story-card contract, with editorial importance able to beat pure recency.
- 2026-06-14: Targeted incremental stats recompute landed — changed finalized matchups now refresh only affected season/championship rows plus affected H2H pairs, with `stats_calculation` logs proving no full all-time rebuild on routine sync.
- 2026-06-14: Data integrity and stewardship landed — recomputes now record reconciliation/standings/schedule/identity/coverage checks, unresolved failures quarantine trusted record reads, and steward actions can review/rerun/rename/reassign with audit.
- 2026-06-14: League edge-case substrate landed — normalized scoring settings, keeper markers, divisions, matchup kind, and roster keeper metadata now persist across providers, with stats keeping median/all-play rows out of H2H records.
- 2026-06-14: Postseason stats hardening landed — provider postseason settings now persist per league-season, weekly playoff/championship flags derive from settings plus finals, and championship records use title-game scores when identified.
- 2026-06-14: Co-owner identity hardening landed — identity resolution now scopes shared owner-member overlap to provider team slots, preserves co-owner owner history, and guards weekly stats against cross-slot over-merge.
- 2026-06-14: Historical depth hardening landed — imports now default through 10 prior seasons, extend shorter completed checkpoints without reprocessing, and remember provider history exhaustion in checkpoint cursors.
- 2026-06-14: Provider parity/coverage landed — ESPN/Sleeper/Yahoo now declare per-data-class capability matrices, ingestion persists roster entries/transactions where normalized, and RLS `data_coverage` records complete/partial/stale/unavailable/error states instead of treating missing classes as empty-complete.
- 2026-06-14: IA route migration landed — `/you`, league Press/Bet/Records/Members routes now exist with auth guards, legacy feed/posts/invite URLs redirect into the new IA, and the full gate suite plus e2e is green.
- 2026-06-14: Your Leagues landing landed — `/` now renders the authenticated cross-league lobby with MRU-ordered league cards, matchup score context, latest league Press headlines, and logged-out/zero-league connect states.
- 2026-06-14: Responsive nav shell landed — root chrome now derives scope from URL, exposes mobile top/scope sheet plus bottom tabs, desktop/tablet collapsible sidebar, and client-loaded unified league switcher data.
- 2026-06-14: Unified league switcher landed — membership MRU persistence, all-provider provider-badged list data, searchable/groupable switcher UI, and active-league recency bumps are covered.
- 2026-06-14: Phase 1 IA foundation landed — Global-vs-League section taxonomy, provider-badge labels, URL-derived active navigation state, and legacy feed/post/invite section mapping are now typed and covered.
- 2026-06-12: Scores realtime publishing landed — current sync now emits typed `scores.updated` broadcasts for changed matchup rows after commit, with Supabase and in-process publish/subscribe coverage.
- 2026-06-12: Invite acceptance landed — share-token invites now grant member access, persist RLS-scoped provider-member identity claims, and turn accepted invite targets off across active invite links.
- 2026-06-12: Leaguemate invite MVP landed — league home now opens an invite screen populated from imported fantasy members/teams, creating RLS-scoped share links with public previews plus mock-recorded SMS/email sends.
- 2026-06-12: Provider reconnect CTAs landed — invalid ESPN/Sleeper/Yahoo credentials now surface provider-specific reconnect actions on onboarding/import screens and only true auth-expired errors mark stored credentials invalid.
- 2026-06-12: Shared auth guards landed — `requireSession`/`requireLeagueRole` now centralize protected league access for league pages, realtime grants, push subscriptions, and onboarding session wrappers.
- 2026-06-12: Yahoo onboarding/import landed — Yahoo OAuth connect now persists encrypted credentials, discovers Yahoo Fantasy leagues, imports selected leagues through provider-generic sync/history dispatch, and runs fixture-backed by default without live Yahoo credentials.
- 2026-06-12: Yahoo provider landed — a server-only OAuth2 adapter now normalizes Yahoo Fantasy leagues, teams, members, rosters, scoreboards, historical season bundles, and transactions behind the `FantasyProvider` interface with fixture-backed coverage.
- 2026-06-12: Sleeper onboarding/import landed — public username/user-id connect now discovers Sleeper leagues, imports selected leagues through provider-generic current sync, and dispatches historical import jobs to Sleeper.
- 2026-06-12: Sleeper provider landed — a server-only no-auth adapter now normalizes public Sleeper leagues, teams, members, rosters, matchups, historical seasons, and transactions behind the `FantasyProvider` interface with fixture-backed coverage.
- 2026-06-12: Observability health/metrics landed; `/api/health` now checks DB, Redis, configured Supabase Realtime and Inngest reachability, exposes process-local API/job metrics, and app-owned API routes plus registered Inngest functions record status/duration without leaking secrets.
- 2026-06-12: PWA push notifications landed — league members can opt into Web Push from league home, subscriptions are RLS-scoped and membership-checked, and fresh blog posts plus finalized betting settlements now fan out through mock-by-default/real VAPID delivery.
- 2026-06-12: Client realtime subscriptions landed — league, feed, central news, and arena pages now use guarded Supabase grants to subscribe to typed broadcast channels and refresh server-rendered data on live updates.
- 2026-06-12: Realtime subscription grants landed — `/api/realtime/token` now issues membership-guarded, short-lived channel grants for league and central broadcasts without exposing Supabase service credentials.
- 2026-06-12: Central arena leaderboard landed — central arena seasons/standings now materialize league and individual paper-betting rankings from RLS-scoped bankroll ledgers, rebuild after finalized settlements, and render at `/arena`.
- 2026-06-12: Betting settlement landed — `game.final` now grades pending singles/parlays from results providers, handles push/void repricing/refunds, writes idempotent settlement audits, and credits bankroll ledgers exactly once.
- 2026-06-12: Bet placement landed — RLS-scoped slips/legs now lock selected odds snapshots, validate stake/freshness/distinct parlay markets, and atomically debit bankroll ledgers with idempotent retry protection.
- 2026-06-12: Bankroll ledger foundation landed — league-scoped bankroll weeks plus append-only ledger opening/rollover logic now enforce rolling-minimum resets, current-balance replay, and RLS isolation.
- 2026-06-12: Betting odds catalog landed — central events/markets/append-only odds snapshots, mock + The Odds API providers, idempotent `odds.poll`, and DB/job coverage are green.
- 2026-06-12: Realtime blog publish events landed — AI generation now emits typed `blog.published` broadcasts to `league:{leagueId}:blog` after new league posts commit, with mock/no-op local defaults and Supabase REST publishing when configured.
- 2026-06-12: League blog post details landed — league home/feed blog cards now open `/leagues/[leagueId]/posts/[postId]`, backed by membership checks plus RLS-scoped blog-only content queries.
- 2026-06-12: League-tailored feed landed — `league_feed_reference` joins scoped league posts with explicitly relevant central news, `/leagues/[leagueId]/feed` renders the mixed feed, and isolation tests are green.
- 2026-06-11: Content planning landed — scheduled weekly planners and `game.final` fan-out now emit stable idempotent `content.generate` events for AI blogger personas.
- 2026-06-11: Real AI/news clients landed — Anthropic structured blog generation, Tavily grounding/news search, and Voyage embeddings are env-selected behind mocks.
- 2026-06-11: Central news hub landed — `/news` renders central `content_item` headlines with attribution, excludes league-scoped rows, and is reachable from home and league pages.
- 2026-06-11: Central news ingestion landed — canonical source dedup, central `content_item` news persistence, `news.refresh` job wiring, and DB-level central dedup are green.
- 2026-06-11: AI blogger foundation landed — RLS content/persona/generation/memory tables, mock generation pipeline, `content.generate`, and league-home storylines are green.
- 2026-06-11: Provider final standings persistence landed — historical import now stores official final ranks/playoff seeds and stats/championship records prefer them over computed rank fallback.
- 2026-06-11: P2 stats/records landed — canonical person identity resolution, materialized weekly/season/H2H/all-time records, steward merge/split corrections, import-triggered recompute, and league-home record book are green.
- 2026-06-11: `import.requested` job wiring landed — onboarding imports now request checkpointed historical import from stored encrypted ESPN credentials through a registered Inngest handler.
- 2026-06-11: Resumable ESPN historical import landed — leagueHistory seasons normalize into persisted historical rows with RLS-protected checkpoints and resume-after-failure coverage.
- 2026-06-11: Playwright vertical-slice e2e landed — mock ESPN connect signs in, imports fixture league 95050, and opens the league home with standings assertions.
- 2026-06-11: League home landed — ESPN team records persist through ingestion, authenticated members can open `/leagues/[leagueId]` for mobile-first standings/current matchups/team cards, and onboarding imports now link to the home page.
- 2026-06-11: Durable ESPN league discovery/import screen landed — persisted discoveries reload after connect, latest FFL leagues default selected, imported state is inferred from league membership, and selected imports are covered by service/UI tests.
- 2026-06-11: ESPN onboarding connect flow landed — mock hosted-browser + manual cookie paths store encrypted credentials, persist discovered leagues, and import selected leagues through current sync with commissioner membership.
- 2026-06-11: Idempotent current-league ingestion landed — normalized ESPN league/team/member/matchup rows now upsert under RLS with deterministic content hashes, zero-write repeat syncs, and 95050 fixture-backed persistence tests.
- 2026-06-11: ESPN current-league fetch adapter landed — 95050/2026 fixture-backed league/team/member/matchup normalization, required headers, scoring-period filtering, and optional-field fallbacks are green.
- 2026-06-11: ESPN Fan API auth/discovery adapter landed — server-only cookie session validation, required ESPN headers, fixture-backed league 95050 discovery, and typed provider errors are green.
- 2026-06-11: Membership source-of-truth cleanup landed — legacy RLS `league_members` is backfilled into auth-plane `members` then dropped; RLS catalog/canary coverage now rides on real fantasy domain tables.
- 2026-06-11: P1 provider/domain model landed — `FantasyProvider` contract + typed provider errors, normalized league metadata, RLS-protected `fantasy_teams`/`fantasy_members`/`fantasy_matchups`, and focused provider/domain/RLS tests are green.
- 2026-06-11: P0 foundation docs landed — tracked `.env.example` plus clean-clone README quickstart/health/gates; P0 backlog is complete and all local gates are green.
- 2026-06-11: CI gate landed — GitHub Actions now runs secret-scan, typecheck, lint, tests, build, and changed-file UBS with pgvector/Redis services; all local gates green.
- 2026-06-11: Ops basics landed — `/api/health` checks DB+Redis, root error fallback, secret-redacting structured logger, and `AppError`/`Result` convention with focused coverage; all gates green.
- 2026-06-11: Inngest scaffold landed — `src/jobs` client/event registry + idempotent sample `app.ping` step function, `/api/inngest` serve route, `pnpm jobs:dev` wired to the local dev server, `@inngest/test` coverage; all gates green.
- 2026-06-11: Better Auth scaffold landed — email/password + Google stub (placeholder creds, drop-in real), org plugin mapped league=org onto `leagues` (+slug/logo/metadata) with central `members`/`invitations`, AC roles incl. data_steward (`leagueData` resource), lazy `/api/auth/[...all]`; 6 live-DB integration tests; all gates green.
- 2026-06-11: RLS isolation canary landed — `rls-canary.test.ts` proves two-league read/write isolation under a dedicated non-superuser role (spec 02 §7 acceptance); P0 data layer complete, all gates green.
- 2026-06-11: RLS plumbing landed — migration 0002 (current_league_id() fn, ENABLE+FORCE RLS, league_members_isolation policy) + `withLeagueContext()` tx helper; 8 integration tests; canary test next; all gates green.
- 2026-06-11: Drizzle landed — users/leagues/league_members schema + first migrations (0000 pgvector, 0001 baseline), server-only `getDb()`, 7-test live-DB integration suite; all gates green.
- 2026-06-11: `src/core/env` landed — zod-4-validated env, paid APIs default to mocks via MOCK_* discriminated unions, local-stack URL defaults; 10 unit tests; all gates green.
- 2026-06-11: docker-compose local stack (pgvector pg17 + redis 7) on ports 5440/6390 with healthchecks; verified up + vector extension; all gates green.
- 2026-06-11: PWA shell landed — manifest + service worker (offline fallback, installable), icon set, safe-area utilities; all gates green.
- 2026-06-11: Tailwind v4 + shadcn/ui (base-nova) initialized; DESIGN.md tokens wired dark-first into the Tailwind theme; all gates green.
- 2026-06-11: P0 scaffold landed — Next 16.2.9 App Router + TS strict + Biome + Vitest(+RTL); all gates (typecheck/lint/test/build/ubs/impeccable) green.
