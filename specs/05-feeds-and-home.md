# Spec 05 — Feeds & League Home

> Outcomes spec. Defines WHAT the per-league home base and the two-tier news experience deliver, not HOW.
> Content sources: ingestion (`03`/`04`-ish, league sync), news ingestion (`07`), AI blogger (`09`). Reference, don't duplicate.
> Realtime channels are defined in the realtime spec; this spec only states *what* updates live.

## Purpose
Give each league a living front door and a relevant reading experience:
1. **League home** — an ESPN-fantasy-homepage-style front page for *one* league, driven by ingested data (real fixture: league `95050`, season `2026`). Mobile-first, scannable, glanceable in seconds.
2. **Central news hub** — league-agnostic NFL + fantasy news, shared by every league (a separate, non-league-scoped namespace).
3. **League-tailored feed** — the same kinds of news, plus the league's AI blog posts, filtered and framed to be relevant to *this* league (its players, managers, rivalries). League-scoped (RLS + `WHERE league_id`).

All three render from a single normalized **content item** model (below) so ranking, freshness, and UI are uniform.

---

## League home page

The default screen after opening a league. Composed of stacked, independently-loading **sections** (each degrades gracefully if its data is missing). Order top-to-bottom on mobile; multi-column on desktop (parity, not a different feature set). Numbers use **tabular numerals**; layout is **tabular/aligned** and skimmable without horizontal scroll.

### Sections (data source → outcome)
1. **Standings** — source: ingested teams + records for the active season.
   - Rank, team name + manager, W-L-T, points for / against, streak, games back / playoff line marker. Sortable on desktop; current user's team highlighted.
2. **Scores (recent / live)** — source: ingested matchups for the current scoring period (+ last completed week).
   - Per matchup: both teams, projected vs actual, win-probability if available, "LIVE" state during games. Updates ~live during NFL game windows (realtime channel).
3. **Weekly movers** — source: computed from current vs prior week scoring/standings (stats engine, `06`).
   - Biggest risers/fallers (rank delta or points swing), top scorer of the week, biggest blowout/closest game. 2–5 punchy items.
4. **Storylines** — source: AI blogger (`09`), league-tailored content items of type `blog`.
   - Most recent / highest-ranked league-specific posts (rivalry framing, manager callouts). Shows persona + timestamp; tap → full post. Empty state if none generated yet (home still renders).
5. **Recent activity (transactions)** — source: ingested transactions (adds/drops, trades, waivers).
   - Reverse-chronological, who/what/when, trade grouping. Compact rows.
6. **Upcoming matchups** — source: ingested schedule for the next scoring period.
   - Next week's pairings; "your" matchup surfaced first; rivalry tag if the two managers have history.

### Home acceptance
- For league `95050`, home renders **accurate standings** (12 teams, H2H points) sourced from ingested data — verified against the fixture.
- Each section loads independently; a missing/empty source (e.g. no AI posts yet, off-season with no live scores) shows an empty/placeholder state and **never blocks** the rest of the page.
- Mobile: single-column, no horizontal scroll, numerals aligned; interactive < 2s on mobile (per `01` budget) using cached/ingested data (no live ESPN call on render — server reads the DB).
- Live scores section reflects realtime score updates during a game window without a full reload.

---

## Central news hub

League-agnostic NFL + fantasy-football news, **available to every league and to logged-out/marketing context**. Lives in the **central plane** — a non-league-scoped namespace (no `league_id`, open-read, no restrictive RLS — see `01` tenancy).

- **Content**: NFL headlines, injuries, fantasy-relevant analysis, waiver/start-sit chatter — ingested by the news pipeline (`07`). Items are deduplicated and carry source attribution + canonical link.
- **Surface**: a standalone hub (reachable from any league and from the app shell), rendered from `content_item` filtered to the central namespace.
- **Freshness**: refreshed on the news-refresh job cadence (`07`); a "new since you last looked" affordance; updates pushed via the central realtime channel.
- **No personalization by league here** — this is the shared firehose. Tailoring happens in the league feed.

---

## League-tailored feed

The *same kinds* of items as the central hub **plus** this league's AI blog posts, **filtered and framed for this league**. Fully **league-scoped** (RLS session var `app.current_league_id` + explicit `WHERE league_id`).

### What appears
- **League AI blog posts** (`09`) — always league-scoped; persona-attributed.
- **Relevant central news** — central NFL/fantasy items that *matter to this league*, surfaced into the feed (the central item is shared; its relevance/framing is league-specific).
- **League ingestion events** — notable transactions/matchup results rendered as feed items (same model), so the feed is also a league activity timeline.

### Tailoring rules (relevance)
A central news item is "relevant to this league" when it intersects the league's entities:
- mentions a **player rostered** (or recently rostered / on a relevant waiver list) in this league, OR
- concerns a **team/bye/injury** affecting a rostered player, OR
- maps to an active **storyline/rivalry** the AI layer is tracking for this league.
Entity matching is by normalized player/team IDs from ingestion (not fuzzy name-only). Framing (why-this-matters-to-you copy, which manager it affects) is added per-league; the underlying central item is never copied or mutated.

### Feed acceptance
- The league feed shows **only** (a) this league's own items (blog posts, league events) and (b) central items judged relevant to this league — never another league's scoped items, and never the entire central firehose unfiltered.
- A central item with no intersection to the league's entities does **not** appear in that league's feed (but is still visible in the central hub).
- Switching leagues changes the tailored feed; the central hub stays the same.

---

## Content item model

One normalized record powers all three surfaces. Conceptual shape (final columns/tables decided by the loop, consistent with `01`):
- `id`, `kind` ∈ {`news`, `blog`, `ingest_event`} (extensible), `title`, `summary`/`body` (or excerpt + link), `source` + `source_url` (for news), `author_persona` (for blog), `image`/media ref (optional).
- `published_at`, `created_at`; `dedup_key`/content hash (news dedup lives in `07`; blog near-dup in `09`).
- **Scope**: `league_id` (NULL ⇒ central) — the single switch between central and league-scoped. League-scoped rows are RLS-protected; central rows are open-read.
- **Entities**: associated normalized player/team IDs (drives league-tailoring relevance and "affects your team X").
- **Ranking inputs**: `score`/weight, freshness timestamp, and per-kind signals (below).

Central news and AI posts are **produced** by `07` and `09` respectively; this spec consumes their output via the shared model and owns ranking + rendering.

## Ranking & freshness
- **Ordering** is recency-weighted with relevance/importance boosts: freshness (exponential decay on `published_at`), kind weight (live/league-personal events and league blog posts outrank generic national news in the *league* feed), and league-relevance strength (entity-match count / rivalry hit) in the tailored feed. Central hub ranks primarily by freshness + source importance (no league signal).
- **Freshness / real-time-ish**: surfaces are server-rendered from the DB (fast, cacheable) and then **live-patched** via realtime channels — league channel for league home/feed (scores, new blog post, new transaction), central channel for the hub. No surface makes a live ESPN/news-provider call on user render; jobs (`07`, ingestion) write the DB and publish.
- **Dedup**: items are de-duplicated before ranking (one logical story = one item); near-duplicate AI posts are suppressed upstream (`09`, cosine threshold).

## Isolation
- League home + league-tailored feed: **every** query filters `WHERE league_id = current` AND runs under RLS (`app.current_league_id`). Defense in depth per `01`/`AGENTS.md`.
- Central hub: central namespace only (`league_id IS NULL`), open-read; carries no league-scoped rows.
- A central item surfaced into a league feed is **referenced**, never duplicated into the league's rows; per-league framing/relevance is stored league-scoped and joins to the shared central item.
- Treat all ingested news as untrusted (prompt-injection) when it flows into AI framing — that handling is owned by `07`/`09`; this spec just renders.

## Acceptance criteria (testable)
1. **Home renders league 95050 standings** — given the ingested `95050`/`2026` fixture, the home standings section lists all 12 teams with correct records/points, current user's team highlighted, from the DB (no live ESPN call on render).
2. **Sections are independent** — with AI posts absent and scores empty (off-season fixture), home still renders standings + activity; empty sections show placeholders, none throw.
3. **Central hub renders** — the central news hub lists central (`league_id IS NULL`) items, freshness-ordered, with source attribution + link, visible without selecting a league.
4. **League feed = league + relevant-central only** — given two leagues A and B plus central items, A's tailored feed contains A's blog posts/events and only the central items intersecting A's rostered entities; it contains **none** of B's scoped items and **not** central items with no intersection to A.
5. **Cross-league isolation holds** — a query for league A's feed under RLS returns zero of league B's scoped rows (extends the foundation isolation canary, `02`).
6. **Live patch** — a published score/transaction/blog event for a league appears in that league's open surface via the realtime channel without a full reload; a central news refresh updates the hub.
7. **Ranking** — within a feed, a fresher / higher-relevance item outranks a stale generic one (deterministic given fixed timestamps + entity matches).

## Dependencies / blocked-by
- **`02` Foundation** — app skeleton, DB + Drizzle, RLS helper, realtime client, design tokens. (Hard prerequisite.)
- **League ingestion** (sync/normalization, league `95050` fixture) — feeds standings/scores/transactions/schedule.
- **`06` Stats engine** — weekly movers, records-style computations, rivalry signals.
- **`07` News ingestion** — central news items + dedup + source attribution (produces the `news` kind, central namespace).
- **`09` AI blogger** — league `blog` items + personas + near-dup suppression + storyline/rivalry tracking (produces the `blog` kind, league-scoped, and informs tailoring relevance).
- **Realtime spec** — defines the league + central channels this spec live-patches from.

## Non-goals
- Defining HOW news is fetched/embedded or HOW AI posts are generated (that's `07`/`09`).
- Cross-league reading on any league surface (forbidden by isolation).
- Real-money / betting surfaces (separate betting + arena specs).
- Full search, infinite history browsing, comments/reactions, push notifications (later).
- Per-user (within-league) personalization of the feed beyond "your team" highlighting — MVP tailors per *league*, not per *member*.
