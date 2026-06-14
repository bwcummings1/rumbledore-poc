# Spec 11 — The Publication System

> Outcomes spec. Defines WHAT a Rumbledore publication is, not HOW each surface is coded.
> Embed the North Star: Rumbledore is **a real publication** the league stars in — "content has journalistic
> structure (lead, sections, articles, bylines), not a feed of blobs." Round one shipped exactly the failure the
> North Star warns against: the central News hub and the league feed are **flat reverse-chron card grids**, and
> AI posts are `title + summary + body` blobs rendered as raw paragraphs. There is **no editorial hierarchy, no
> dek, no section, no tags, no real byline, no hero, no related stories** — so the cast reads like a database
> dump, not an outlet. This spec turns those bare surfaces into PUBLICATIONS.
> References: `05` (feeds/home, content model + tailoring), `07`/`09` (AI content production), `10` (IA — The
> Press / News routes + register placement), `00` (product). Real modules: `src/db/schema.ts`
> (`content_item`, `league_feed_reference`), `src/news/*` (`hub.ts`, `league-feed.ts`, `blog-post.ts`),
> `src/ai/personas.ts`, `src/ai/pipeline.ts`, `src/app/news/*`, `src/app/leagues/[leagueId]/{feed,posts}/*`.

## Purpose
Every news/media product reduces to **three page archetypes + one atomic unit**:

1. **The Front** — an *edited* hierarchy: a lead, a few secondaries, then a river. (The #1 thing missing today.)
2. **The Section Front** — the same archetype, scoped to one beat (NFL, Recaps, Trash Talk…).
3. **The Article** — headline, dek, persona byline, hero, typographic body, tags, related stories.
4. **The Story Card** (atomic unit) — defined **once**, reused on every front, section, rail, and teaser.

The system is shared by two distinct **publications** plus a third surface that must *not* become one. Getting
these three **registers** kept separate — dashboard vs league outlet vs sport outlet — is as important as the
hierarchy itself.

---

## The model: 3 archetypes + 1 atomic unit

### The Story Card (atomic unit — define once, reuse everywhere)
A single card composition, the molecule the whole system is built from. Fields, in priority order:

- **headline** (`content_item.title`, or `league_feed_reference.framing_title` when a central story is framed
  for a league),
- **dek** — a one-line standfirst (NEW; see model changes),
- **byline** — persona display name for `blog` (from `author_persona`, `src/ai/personas.ts`); source name for
  `news` (`content_item.source`),
- **section tag** — the beat label (NEW; see model changes),
- **time** — relative timestamp (`published_at`, e.g. "2h ago"),
- **thumbnail** — hero/thumbnail image ref (NEW; optional; graceful when absent).

The card has **size variants** (`hero`, `secondary`, `river`, `rail`/`teaser`) that show *more or fewer* of the
same fields — never a different field set. A `hero` shows all six prominently; a `rail`/`teaser` may show
headline + section tag + time only. One component, one prop contract, every surface. This atomic unit replaces
the three near-duplicate inline cards that exist today (news-hub card, league-feed card, storyline card).

### Archetype A — The Front (edited hierarchy, NOT reverse-chron)
A Front is a **publication home or a section front**. It is an **edited hierarchy**, not a flat list:

1. **Lead / hero** — one story, given the most weight (largest card variant, top of the page). The single most
   important thing right now.
2. **Secondaries** — **2–4** stories below/beside the lead at medium weight.
3. **River** — the remaining stories as a uniform card grid (the existing reverse-chron list, demoted to the
   *bottom tier* where a flat list is appropriate).

The hierarchy is **selected**, not purely chronological: a fresher-but-minor item must not displace the lead if
an editorial **importance** signal ranks the lead higher. The ordering combines freshness, kind/importance
weight, and (in a league) league-relevance — the ranking inputs `05` already defines — to **assign tiers**, then
renders the tiers. "Pick a lead, pick 2–4 secondaries, river the rest" is the whole archetype, and it is what is
missing today.

### Archetype B — The Section Front
A Front scoped to one **beat**. Same lead/secondaries/river shape, filtered to one section tag. Reachable from the
publication home (its sections are navigable) and by direct URL. A section with too few stories degrades to just
a river (or an empty state) and never throws.

### Archetype C — The Article page
The destination for one story. Composition, top to bottom:

- **headline** (large), **dek** (standfirst under the headline),
- **persona byline + timestamp** — the persona's display name (and, later, persona avatar/role line) for `blog`;
  source + canonical link for `news`,
- **hero** — lead image/media when present (graceful when absent),
- **body** — *typographic* rendering: real paragraphs, headings/subheads, blockquotes, lists where the content
  has them — **not** a single `whitespace-pre-line` blob (today's behavior),
- **tags** — the story's tags, each linking to a filtered view,
- **related stories** — 2–4 **Story Cards** of related items (same section and/or shared tags/entities), so a
  reader moves laterally through the publication instead of hitting a dead end.

---

## The three registers (keep distinct — do not blur)

These three surfaces must read as **three different kinds of thing**. Conflating them is the round-one failure.

### Register 1 — League Home = a DASHBOARD (not a publication, not a feed)
`/leagues/[leagueId]` (`05` home, `10` League → Home). This stays a **glanceable dashboard**: standings, scores,
movers, activity, upcoming matchups. It is **NOT** a Front and **NOT** a feed.

- Its only publication element is a **small "From the Press" teaser module**: 2–3 **Story Cards** (`rail`/`teaser`
  variant) of the latest/most-important league Press items, with a "Read The Press →" link. This replaces the
  current "Storylines" sidebar list. It teases the spectacle; it does not *become* it.

### Register 2 — The League Publication: "The {League} Press"
`/leagues/[leagueId]/press` (`10`). The league's own media universe — **the AI cast's editorial about THIS
league** (rivalries, managers, inside jokes, canon lore). This is **The Front** for the league outlet:

- A **masthead** — the publication's name "**The {League Name} Press**" (e.g. "The NHS Alumni Annual Press") and
  its section nav. The masthead makes it unmistakably *a publication about your league*, not a feed tab.
- Lead / secondaries / river of the league's `blog` items **and** the league-relevant central stories surfaced
  via `league_feed_reference` (`05` tailored feed) — blended, tiered, bylined by the cast.
- **Section fronts** for the league publication's beats (see taxonomy). Posts open as **Article** pages at
  `/leagues/[leagueId]/press/[postId]` (`10`; old `/feed` and `/posts/[postId]` re-home/redirect here).

### Register 3 — The Central Publication (the sport's news)
`/news` (`05` central plane, `league_id IS NULL`, open-read; `10` Global → News). The **sport's** publication —
NFL/fantasy news shared by every league. This is **The Front** for the central outlet (masthead → "Rumbledore
News" or similar; lead/secondaries/river; section fronts for NFL / Fantasy / Injuries / Rankings).

- **"For your league" rail** — when viewed *with an active league*, the central publication carries a rail
  surfacing central stories that are **about players on this league's rosters** (the entity-intersection
  relevance from `05` / `league_feed_reference.matched_entities`). It is a *rail on the shared firehose*, never a
  reframing of the whole page, and it disappears (with no error) when there's no active league or no intersection.
  Cross-league isolation still holds: the rail shows central rows only, framed for the one active league.

| Register | Route | What it is | Publication shape |
|---|---|---|---|
| League Home | `/leagues/[id]` | Dashboard | NOT a front — gets a "From the Press" teaser module |
| The {League} Press | `/leagues/[id]/press` | League outlet (the cast) | Front + section fronts + Article; masthead |
| Central News | `/news` | Sport outlet (firehose) | Front + section fronts + Article; "For your league" rail |

---

## Section taxonomy (beats)

Sections are the navigable beats of each publication. A story's **section** is a single tag (NEW field).

- **Central Publication** sections: **NFL**, **Fantasy**, **Injuries**, **Rankings**. (News items map to a
  section at ingestion (`07`); unmapped → a default beat, never blank.)
- **League Publication** sections: **Recaps**, **Power Rankings**, **Trash Talk**, **Records**, **Previews**.
  These map naturally to the cast: Narrator → Recaps, Analyst → Power Rankings, Trash-Talker → Trash Talk,
  Commissioner → Previews/Records, etc. (mapping is editorial, not hard-locked to one persona).

Section fronts route as `/news/[section]` and `/leagues/[id]/press/[section]` (loop decides exact slug shape;
`10` owns the nav shell). Sections with no stories render an empty state and never break the publication home.

---

## How AI-generated content becomes ARTICLES (not blobs)

Today `src/ai/pipeline.ts` emits a `BlogDraft` of `{ title, summary, body }` and persists `content_item` with
only those three text fields filled — so the cast can only ever render as a blob. To read like a real outlet, the
cast must produce **articles**. AI generation (`07`/`09`) is extended to populate, per post:

- **headline** (`title`) — sharp, specific to this league,
- **dek** (NEW) — the one-line standfirst,
- **byline** = the **persona** (`author_persona`) — the cast member who "wrote" it; the persona's display
  name/role line *is* the byline,
- **body** — structured for typographic rendering (paragraphs, optional subheads/quotes/lists), not one block,
- **section** (NEW) — which beat it belongs to (Recaps / Power Rankings / Trash Talk / Records / Previews),
- **tags** (NEW) — entities/topics (managers, teams, rivalries, canon lore) for related-stories + tag views.

These fields are what make the Front's hierarchy and the Article page possible: a post the Narrator "files" as a
Recap with a dek, a byline, tags for the two rival managers, and a structured body **is** an article and slots
directly into the lead/secondary/river tiers and the related-stories rail. This is the functional expression of
the cast-not-a-tool ethos: the soul rides *inside* the article structure.

---

## What EXISTS vs what CHANGES

### Exists (reuse — do not rebuild)
- `content_item` (`src/db/schema.ts`): `id, league_id (NULL⇒central), kind {news,blog,ingest_event}, title,
  summary, body, source, source_url, author_persona, published_at, dedup_key, content_hash, metadata (jsonb)`,
  RLS scope policy, dedup indexes. **Kept as the single normalized record** (`05`).
- `league_feed_reference`: `league_id, content_item_id, relevance_score, reason, framing_title, framing_summary,
  matched_entities` — the central-into-league framing join. **Kept**; powers the "For your league" rail + Press
  blend.
- `src/news/{hub,league-feed,blog-post}.ts` queries; `src/ai/personas.ts` (5 personas); the ranking inputs (`05`).
- The current flat card grids — their *card content* is salvaged into the Story Card; their *flat layout* is
  demoted to the **river** tier only.

### Changes
- **New publication fields** on the story: **dek**, **section**, **tags**, **hero image ref**. Add them as
  first-class `content_item` columns (preferred) or as a typed, validated shape in `metadata` — loop decides,
  but they must be **queryable** (section/tag filtering and tiering need them) and **typed**, not loose blobs.
  News items get section/dek/hero/tags at ingestion (`07`); blog items get them from generation (`09`).
- **One Story Card component** replaces the three inline card implementations (news-hub, league-feed, storyline).
- **The Front archetype**: `/news` and `/leagues/[id]/press` render lead → secondaries → river (tiered by the
  `05` ranking), not a flat grid.
- **Section fronts**: new routed beat views for both publications.
- **The Article page**: `/leagues/[id]/press/[postId]` (and central article view) render dek + persona byline +
  hero + typographic body + tags + related stories — replacing today's `whitespace-pre-line` blob view.
- **Masthead** on both publications; **"From the Press" teaser** on League Home (replacing the storylines list);
  **"For your league" rail** on `/news`.
- **AI pipeline** emits the extended article shape (dek/section/tags/structured body), not a 3-field draft.

---

## Acceptance criteria (testable)

Gate-verifiable (`pnpm test`, e2e — structure/routing/data, not visual taste):

1. **Front hierarchy (not reverse-chron)** — given ≥6 stories with mixed timestamps and importance, the Press
   front and `/news` render exactly one **lead**, 2–4 **secondaries**, and the rest in a **river**; an older but
   higher-importance story can hold the lead over a fresher minor one (deterministic given fixed
   timestamps/weights). A pure reverse-chron ordering is **not** what renders.
2. **Story Card reuse** — the lead, secondaries, river items, the Home teaser, and the "For your league" rail all
   render from a **single** Story Card component/contract; its variants change emphasis, not the field set.
3. **Section routing** — each publication exposes its declared sections (Central: NFL/Fantasy/Injuries/Rankings;
   League: Recaps/Power Rankings/Trash Talk/Records/Previews); a section front shows only that section's stories
   (lead/secondaries/river), and an empty section renders a placeholder without throwing.
4. **Article rendering** — a `blog` post opens as an Article with headline, dek, **persona byline** + timestamp,
   hero-when-present, a **multi-paragraph/structured** body (not one pre-line blob), its tags, and 2–4 related
   Story Cards. A `news` item's article shows source byline + canonical link.
5. **Register separation** — `/leagues/[id]` is a dashboard with a *small* "From the Press" teaser (2–3 cards),
   **not** a Front and **not** the full feed; `/leagues/[id]/press` is a masthead'd Front (the cast about this
   league); `/news` is a masthead'd Front of central stories. The three are structurally distinct surfaces.
6. **Tailoring rail** — `/news` viewed with an active league shows a "For your league" rail of **central** stories
   intersecting that league's rostered entities (via `league_feed_reference`/`matched_entities`); with no active
   league or no intersection the rail is absent and the page still renders. No league-scoped row and no other
   league's framing ever appears (`05` isolation canary still holds).
7. **AI article shape** — a generated post persists a populated **dek**, **section** (∈ league taxonomy),
   **byline** = persona, **tags**, and a structured body; these fields are queryable and drive tiering, the
   section fronts, and related-stories. A post missing them is rejected/flagged, not silently rendered as a blob.
8. **Migration intact** — old `/leagues/[id]/feed` and `/posts/[postId]` resolve into The Press / Press article
   (`10`); `/news`, `/leagues/[id]`, `/leagues/[id]/press` work; existing `content_item` rows without the new
   fields still render (default section/no-dek/no-hero) without error.

### Needs the later human UI pass (not gate-verifiable here)
The **feel** of "a real publication": exact card density and grid composition per breakpoint, masthead/typography
treatment, lead-vs-secondary visual weight, hero crop/aspect ratios, section-nav styling, related-stories
placement, and the final tuning of persona byline presentation. This spec fixes the **structure and the rules**
(hierarchy, archetypes, registers, the atomic unit, the article fields); **taste is tuned with a human in the
room** (North Star "surface soul later").

### Quality gate (where correctness gates can't see)
Beyond `pnpm test`/`impeccable`, an **LLM-judge eval** on generated articles: *"Does this read as a real,
edited article about THIS league — sharp headline, true-to-persona byline, a dek that earns the click, a body
with structure — or as a generic blob with the league name pasted in?"* (North Star bar). A post that scores as a
blob fails the gate. The structural acceptance above is necessary; this judge approximates *"is it good."*

---

## Dependencies / blocked-by
- **`05` Feeds & Home** — the `content_item` model, `league_feed_reference`, ranking inputs, tailoring relevance,
  and the home/feed/news surfaces this spec restructures (hard prereq).
- **`07` News ingestion** — must emit **section** (NFL/Fantasy/Injuries/Rankings), **dek**, **hero**, **tags** for
  central `news` items.
- **`09` AI content** — must emit the extended **article** shape (dek/section/tags/structured body) per post and
  pass the LLM-judge gate.
- **`10` IA & Navigation** — owns the Press/News routes, masthead placement, section-nav shell, and register
  routing this spec fills with publication structure.
- **`02` Foundation** — design tokens, layouts, the impeccable gate (the later UI pass rides this).

## Non-goals
- Defining HOW news is fetched/parsed for dek/hero/section or HOW AI bodies are generated (owned by `07`/`09`).
- Final visual design, motion, masthead art, and voice tuning (the human UI pass).
- Comments/reactions, full-text search, infinite archive browsing, draft/scheduled-publish workflows, editorial
  curation by humans (later).
- Cross-league reading on any league surface, or reframing the central firehose per-league beyond the rail
  (forbidden by `05`/`10` isolation).
- Lore/canon mechanics themselves (consumed here as `tags`/sections when present; the mechanic is its own spec).
