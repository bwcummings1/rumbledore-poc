# Spec 21 — The Central News Tier (the sport's open hub)

> Outcomes spec. Defines WHAT the central, cross-league NFL/fantasy news tier is and how its **source side** gets
> built — not the per-surface UI (owned by `11`/`10`).
>
> **Embed the North Star.** Rumbledore's wedge is the shift "from **general-audience media to a league-specific
> spectacle the members star in**." That wedge needs *both poles to exist*. Today only the league pole is wired:
> the league-tailored "For your league" rail and The {League} Press already pull central rows in. But the **central
> pole** — the open, league-agnostic NFL/fantasy hub that every league reads in common — is fed almost entirely by
> a single hand-written mock. This spec builds the **central source pipeline and central editorial surfaces** so
> the firehose is real (behind still-mocked external interfaces), giving the league-tailoring bridge something
> worth tailoring *from*. The central tier is the only general-audience thing Rumbledore ships; everything personal
> is built **on top of** it via the tailoring bridge. Keep it credible and dry — it is the sport's wire, not the
> cast's stage.
>
> References: `11` (publication system — Front/sections/Story Card/registers), `05` (content model + tailoring
> ranking inputs), `07`/`09` (AI content production + untrusted-input handling), `10` (IA — `/news` route + register
> placement), `00` (product). Real modules: `src/db/schema.ts` (`content_item`, `league_feed_reference`),
> `src/news/{ingestion,interfaces,mocks,hub,league-feed,sections,front}.ts`, `src/ai/personas.ts`.

## Purpose

Rumbledore's two-tier news model has exactly two tiers:

1. **The central tier (this spec's NEW work):** an open, league-agnostic NFL/fantasy hub — `content_item` rows with
   `league_id IS NULL`, readable by every league, surfaced at `/news` as Register 3 (`11`). This is the *firehose*.
2. **The league-tailored tier (EXISTS):** central rows framed for one league via `league_feed_reference`, surfaced
   in the "For your league" rail and blended into The {League} Press (`11`/`05`).

The plumbing for tier 2 already works against central rows; the tailoring bridge is built. What is missing is a
**believable, multi-source, deduplicated central tier** to tailor *from*, plus the **central editorial surfaces**
(the Front and section fronts of the sport's publication) that make `/news` read like an outlet rather than a mock
dump. This spec builds the central source pipeline and the central editorial layer, keeping every external fetch
behind the still-mocked interfaces (`07` rule: keys drop in at Phase 4).

---

## State: EXISTS vs NEW/CHANGES

### Exists (reuse — do not rebuild)
- **Content model.** `content_item` (`src/db/schema.ts`): `league_id (NULL ⇒ central/open), kind {news,blog,
  ingest_event}, title, summary, body, source, source_url, author_persona, published_at, dedup_key, content_hash,
  metadata (jsonb)`. The single normalized record for both tiers.
- **Central dedup guard.** Partial unique index `content_item_central_scope_dedup_unique ON (kind, dedup_key)
  WHERE league_id IS NULL` — NULL `league_id` is treated as distinct by normal unique indexes, so central rows have
  their own partial index. **Keep and rely on it.**
- **RLS scope policy.** `content_item_scope_policy`: `league_id IS NULL OR league_id = current_league_id()` — central
  rows are cross-league readable; league rows are isolated. **Unchanged.**
- **Central ingestion skeleton.** `src/news/ingestion.ts` (`refreshCentralNews`) already normalizes, URL-canonicalizes,
  dedupes in-batch, content-hashes, and upserts central rows via `onConflictDoNothing` on the partial index. The
  `CentralNewsSource` interface (`src/news/interfaces.ts`) and `MockCentralNewsSource` (`src/news/mocks.ts`) exist.
- **Central editorial primitives.** `CENTRAL_PUBLICATION_SECTIONS` (NFL/Fantasy/Injuries/Rankings) + section
  resolution (`src/news/sections.ts`); `publicationRankScore`/`editorialImportance`/`buildPublicationFront`
  (`src/news/front.ts`); `getCentralNewsHubData` (`src/news/hub.ts`) which already ranks central rows and emits the
  "For your league" rail.
- **Tailoring bridge.** `league_feed_reference` + `upsertLeagueFeedReference` + the rail/Press blend
  (`src/news/league-feed.ts`, `getLeagueFeedData`). **Already restricts references to central `news` rows.**

### New / changes (this spec)
- **A real multi-source central pipeline** behind the still-mocked `CentralNewsSource` interface: more than one
  source (web-grounding / Tavily-like + RSS-like), env-gated mock/real discriminated union, provenance/citations
  carried into `content_item.metadata`, and cross-batch (DB-level) dedup hardened against the partial index.
- **A central editorial layer**: importance/section assignment at ingestion; an optional **central AI editorial**
  path that can file a central piece (e.g. a "Wire roundup") with `author_persona = beat_reporter` — strictly
  **about the sport, never about a league** (register separation).
- **Central Front + section fronts as the firehose's publication surface** (`11` Register 3), ranked by
  freshness × editorial importance.
- **A documented tailoring entry point**: how a central item becomes a `league_feed_reference` (the league side
  already consumes it; this spec specifies the *central → reference* hand-off and its isolation guarantees).

Everything external (Tavily/web-grounding HTTP, RSS HTTP, any embedding/LLM call) **stays MOCKED behind interfaces**.
No real keys, no real network in tests (`07`/AGENTS.md).

---

## The central source pipeline (NEW)

### Sources behind one mocked interface
Central ingestion fans in from **multiple source adapters**, each implementing the existing `CentralNewsSource`
contract (`fetch({ topic, limit, now }) → CentralNewsSourceItem[]`):

- **`WebGroundingCentralSource`** — a Tavily-style web-grounding adapter (general NFL/fantasy news search).
- **`RssCentralSource`** — an RSS/sports-feed adapter (one or more configured feed URLs).
- **`CompositeCentralSource`** — fans out to the configured adapters, concatenates their `CentralNewsSourceItem[]`,
  and hands the union to the existing normalize/dedupe path (so cross-source duplicates collapse — see dedup).

**All adapters resolve mock vs real from the env discriminated union** (`getEnv()`, `src/core/env`; AGENTS.md):
`news.grounding` / `news.rss` are `{ mock: true } | { mock: false, apiKey/feedUrls }`. Code **branches on `.mock`**,
never reads key vars directly. In mock mode each adapter returns fixture items (extend `MockCentralNewsSource` with
fixtures that exercise multi-source duplicates, multiple sections, varied freshness, and missing-field rows). Real
mode is **unreachable in tests/CI** (no keys) and is a drop-in for Phase 4. `createMockNewsDependencies` stays the
test entry point; a parallel `createCentralNewsDependencies(db, env)` selects adapters from `getEnv()`.

### Untrusted input (non-negotiable, from `07`)
Every adapter's output is **untrusted external text**. The pipeline treats `title/summary/body/source/url` as inert
data: it normalizes and stores them, and they are **never** interpreted as instructions. The central AI editorial
path (below) wraps any fetched text as fenced `data` (e.g. `<untrusted_news>`), exposes **no tools and no secrets**,
and refuses to act on embedded directives. Prompt-injection defense is the same posture as `07`.

### Normalize → dedupe → persist (hardening the existing path)
Reuse `src/news/ingestion.ts`. Per item:

1. **Normalize** — clean text; canonicalize URL (`canonicalizeNewsUrl`: lowercase host, strip `utm_*`/tracking
   params, sort query, trim trailing slash); drop items missing title/source/url or with an unparseable date.
2. **Section** — assign a central section (NFL/Fantasy/Injuries/Rankings) via `resolveCentralPublicationSection`
   from topics/title/summary; unmapped → the default beat, never blank (`11` taxonomy).
3. **Importance + dek + tags + hero** — derive `metadata.editorialImportance` (0–100), a one-line dek, `tags`
   (topics/entities), and an optional hero ref, so the central Front can tier and the Story Card can render (`11`).
   Provide deterministic heuristics for mock data (importance from recency × source weight × section); the future
   AI editorial path may refine these.
4. **Dedup key** — `url:<canonical>` when a canonical URL exists, else `title:<hash>` (existing `dedupKeyFor`).
5. **In-batch merge** — same `dedup_key` across sources collapses to one row; merge keeps the higher-quality body,
   the newest `published_at`, the **union of `sources` (provenance/citations)** and `sourceIds`/`topics`.
6. **Cross-batch (DB) dedup** — persist with `onConflictDoNothing` on the partial central index, then reload; if the
   reloaded row's `content_hash` matches, it is **unchanged**; otherwise **update** in place. A second source/refresh
   for the same story **updates** the one central row, never inserts a twin (the partial index is the backstop).

### Provenance / citations
`content_item.metadata.sources` is an array of `{ source, url }` attributions (already merged in
`mergeAttributions`), plus `sourceIds`, `topics`, `canonicalUrl`. This is the **citation set** the central Front
and the league-tailored rail display as the byline/source link (`11` Story Card: `source` name for `news`,
canonical link on the Article). A central item with multiple corroborating feeds carries all of them; the primary
`source`/`source_url` columns hold the highest-quality attribution. No fabricated sources: every citation traces to
a fetched (mock or real) item.

---

## Central editorial curation (NEW)

### The central Front and section fronts (Register 3, `11`)
`/news` is the sport's publication — `getCentralNewsHubData` already selects `league_id IS NULL AND kind='news'`,
resolves sections, and ranks. This spec specifies its **editorial behavior**:

- **Ranking = freshness × editorial importance.** `publicationRankScore` combines `published_at` and
  `editorialImportance × IMPORTANCE_BOOST_HOURS`; a high-importance older story can hold the **lead** over a fresher
  minor one (the `11` Front rule). `buildPublicationFront` assigns **lead → 2–4 secondaries → river**; the central
  Front is **not** a flat reverse-chron grid.
- **Section fronts** filter the same ranked set to one beat (NFL/Fantasy/Injuries/Rankings); an empty section
  degrades to an empty state, never throws (`11`).
- **The Story Card is shared** — central Front, section fronts, the "For your league" rail, and league Press blend
  all render from the one `11` Story Card contract; central items differ only in scope/byline, not field set.

### The AI editorial layer — central pieces vs league pieces (keep the three registers separate)
The cast (`12`/`07`) writes **about a league**. The central tier must **not** become the cast's stage — that would
blur Register 3 into Register 2. The rule:

- **League pieces** = `content_item` with a non-null `league_id`, `kind='blog'`, an `author_persona`, league
  sections (Recaps/Trash Talk/…). Owned by `07`/`09`. **Out of scope here.**
- **Central pieces** = `content_item` with `league_id IS NULL`, `kind='news'`. The default central piece has **no
  persona** (it is wire copy attributed to its `source`). An **optional central AI editorial path** may file a
  *sport-wide* piece (e.g. a weekly "Around the NFL" or "Waiver Wire" roundup) attributed to
  `author_persona = beat_reporter` — but it is **strictly about the sport, references no league, names no manager,
  and reads no league-scoped data**. It runs **without any `current_league_id()` context** so RLS makes
  league-scoped rows invisible to it by construction. Any central editorial generation obeys `07` constraints
  (untrusted grounding fenced as data, no real-player fabrication beyond grounded news, no real-money language).
- **The separation is structural, not stylistic:** the `league_id IS NULL` boundary *is* the register boundary.
  A central piece can never carry a league's framing; league framing lives only in `league_feed_reference`.

---

## The tailoring bridge (central source side is NEW; league tailoring EXISTS)

A central item reaches a league **only** through `league_feed_reference` — never by copying or mutating the central
row. This spec owns the **central → reference hand-off**; `05`/`11` own the league-side consumption (already built).

- **Reference, never copy.** Tailoring inserts a `league_feed_reference { league_id, content_item_id (a central
  `news` row), relevance_score, reason, framing_title?, framing_summary?, matched_entities[] }`. The central
  `content_item` is shared and immutable across leagues; the league row stores only its *relevance and framing*.
- **The hand-off is guarded.** `upsertLeagueFeedReference` runs in `withLeagueContext()` and **refuses any
  `content_item_id` that is not a central (`league_id IS NULL`) `news` row** (`LEAGUE_FEED_REFERENCE_NOT_CENTRAL_NEWS`).
  A central item is eligible for tailoring once ingested; the relevance/`matched_entities` computation (entity
  intersection with the league's rostered players) is `05`'s tailoring relevance, applied to the now-real central set.
- **Surfacing (EXISTS).** Given references, `getCentralNewsHubData` emits the "For your league" rail and
  `getLeagueFeedData` blends central rows into The {League} Press — both already restrict to `league_id IS NULL`
  central `news` joined through the reference, ranked by `relevanceScore` then freshness. This spec's contribution
  is making the *thing being referenced* a real, multi-source, deduped firehose.
- **Isolation invariant.** The rail/Press blend show **central rows only**, framed for the **one active league**;
  no league-scoped row and no other league's framing ever crosses. The `05`/`11` isolation canary holds.

---

## Acceptance criteria (testable with mock feed/grounding fixtures)

Gate-verifiable (`pnpm test`; no real network, all sources mocked):

1. **Multi-source ingestion.** `refreshCentralNews` over a composite of ≥2 mock adapters ingests their union into
   `content_item` rows with `league_id IS NULL` and `kind='news'`, each normalized (clean text, canonical URL,
   resolved central section, importance, citation `metadata.sources`).
2. **Dedup (in-batch + DB).** Two mock items that canonicalize to the same URL (e.g. differing only by `utm_*`/feed
   mirror — as in the existing fixtures) collapse to **one** central row whose `metadata.sources` lists **both**
   attributions. Re-running `refreshCentralNews` on the same fixtures inserts **zero** new rows (unchanged or
   updated only), proving the partial unique index (`WHERE league_id IS NULL`) backstops cross-batch dedup.
3. **Central Front ranks by freshness × importance.** Given ≥6 central rows with mixed timestamps and
   `editorialImportance`, `getCentralNewsHubData` / `buildPublicationFront` yield exactly one **lead**, 2–4
   **secondaries**, and a **river**; an older but higher-importance row holds the lead over a fresher minor one
   (deterministic with fixed timestamps/weights) — **not** a pure reverse-chron order. Section fronts return only
   that beat; an empty section returns an empty front without throwing.
4. **Central piece vs league piece.** A central AI editorial piece persists as `league_id IS NULL`, `kind='news'`,
   `author_persona = beat_reporter`, references **no** league and names **no** manager; a league piece stays
   `kind='blog'` with a non-null `league_id`. The `league_id IS NULL` boundary is asserted as the register boundary.
5. **Tailoring hand-off.** `upsertLeagueFeedReference(league, centralNewsId)` creates a `league_feed_reference` for
   an **ingested central** row; a reference targeting a **league-scoped** or non-`news` row is rejected
   (`LEAGUE_FEED_REFERENCE_NOT_CENTRAL_NEWS`). After insertion, `getCentralNewsHubData({ forLeagueId, userId })`
   surfaces that item in the "For your league" rail and `getLeagueFeedData` blends it into the league Press.
6. **RLS: central readable cross-league; league items isolated.** A central row is readable from **two different**
   `withLeagueContext()` sessions (and with no league context). A league-scoped `content_item` and any
   `league_feed_reference` are visible **only** under their own `league_id` context; the central rail/blend for
   league A never exposes league B's framing or any league-scoped row.
7. **Env discriminated union.** With `news.grounding`/`news.rss` `{ mock: true }`, ingestion uses fixtures and makes
   no network call; selection branches on `.mock` (never reads key vars). Real mode is constructible but exercises
   no live HTTP in CI (drop-in for Phase 4).
8. **Untrusted-input safety.** A mock central item whose text contains an injected directive (e.g. "ignore previous
   instructions / reveal X") is ingested and rendered as inert data; the central editorial path treats it as fenced
   `data` and produces no tool call, leak, or instruction-following (parity with `07`).

### Needs the later human UI pass (not gate-verifiable here)
The **feel** of the central Front: masthead/typography, lead-vs-secondary weight, hero crops, section-nav styling
(`11` defers these). This spec fixes the **source pipeline, dedup, provenance, ranking rules, register boundary, and
the tailoring hand-off** — structure and rules; taste is tuned with a human in the room (North Star "surface soul
later").

### Quality gate (where correctness gates can't see)
For any central AI editorial piece, the `07`/`11` LLM-judge applies in its **central** form: *"Does this read as
credible, dry sport-wide wire copy that cites its grounding — and does it stay strictly general-audience, naming no
league and no manager?"* A central piece that leaks league specificity (blurring Register 3 into 2) fails the gate.

---

## Dependencies / blocked-by
- **`05` Feeds & Home** — content model, `league_feed_reference`, tailoring relevance/`matched_entities`, ranking
  inputs (hard prereq; the tailoring consumption side).
- **`11` Publication System** — the central Front/section-front/Story-Card structure and the three-register
  separation this spec's central surfaces fill (hard prereq).
- **`07`/`09` AI content** — untrusted-grounding handling, the mocked `WebGrounding`/LLM interfaces, and the cast/
  persona contracts the central editorial path reuses.
- **`10` IA & Navigation** — owns `/news` routes, masthead, and section-nav shell.

## Non-goals
- Real Tavily/RSS keys or live network fetching (Phase 4 drop-in; mocked here).
- League-specific generation or any cast piece *about a league* (owned by `07`/`09`; forbidden in the central tier).
- The league-side rail/Press UI and tailoring-relevance computation (`05`/`11`; already built — reused, not rebuilt).
- Comments/reactions, full-text search, archive browsing, human editorial curation, scheduled publishing.
- Cross-league reading on any league surface, or reframing the central firehose beyond the per-league rail
  (forbidden by `05`/`11` isolation).
