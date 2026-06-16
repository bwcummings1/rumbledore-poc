# Spec 31 — Editorial / Publication Reading Register (AUSPEX long-form)

> Phase 5, AUSPEX overhaul. The **net-new** register the AUSPEX reference (`docs/design/auspex-reference.html`,
> `rumbledore-design-language.md`) does NOT cover: long-form **reading**. The template is a HUD/data tool — chrome,
> charts, LCDs, near-zero prose. This spec defines a **calmer, lower-chrome, highly legible reading surface that
> still unmistakably reads AUSPEX** (void + glass + hairlines + the conic orb byline + restrained accents) for "The
> {League} Press" and "Rumbledore News". It is the most delicate design work in Phase 5: legibility must win without
> abandoning the language.
> Structure/data/routing already exist and are FIXED by `specs/11` (publication system) and `specs/12` (the cast as
> bylines). This spec is the **visual/UX layer over that structure** — it adds no new content model. Reads with
> `28` (foundations/tokens/a11y), `29` (components), `30` (app shell — owns nav chrome around these surfaces), `32`
> (feature surfaces — League Home dashboard, the third register), `33` (cast surfaces — orb/persona identity).
> North Star: *Rumbledore is a real publication the league stars in.* This is where the spectacle goes to **print**.

## 0. EXISTS vs NEW (do not rebuild structure; restyle it)

EXISTS (keep the contract, restyle the surface):
- `src/components/publication/story-card.tsx` — `PublicationStoryCard` with variants `hero | secondary | river | rail`;
  `story.ts` holds `PublicationStory` (headline, dek, byline, sectionTag, publishedAt, thumbnail, href, sourceUrl,
  relevanceReason). One component, one contract, every surface (spec 11 acceptance #2). **Restyle; do not fork.**
- `src/components/publication/article-view.tsx` — `PublicationArticleView`: header (back/publication links, section,
  headline, dek, byline + bylineDetail, timestamp), hero image, parsed body blocks (`heading|paragraph|quote|list`),
  cited-canon aside, tags nav, related-stories rail. **Restyle; keep `parseArticleBodyBlocks`.**
- `src/news/front.ts` — `buildPublicationFront` (lead + 2–4 secondaries + river) and `publicationRankScore`. Tiering
  is decided here, FIXED. The visual layer renders tiers; it never re-sorts.
- Routes: `/news`, `/news/[section]`, `/news/articles/[articleId]`, `/leagues/[id]/press`,
  `/leagues/[id]/press/[postId]` (section slug or article), legacy `/leagues/[id]/feed`, `/posts/[postId]`.
- `personaLabel()` (in `league-feed-view.tsx`) maps the six personas → display names. The persona IS the byline.

NEW (this spec):
- Two added story-card variants — `compact` (dense list rows) and `inFeed` (a card that sits inside dashboard/wire
  contexts). Both render the SAME field set (spec 11 rule: variants change emphasis, never the field set).
- The **editorial reading skin**: a long-form type system (measure, prose scale, line-height) layered on AUSPEX
  tokens; the **masthead**; the **front layout grid** (lead/secondaries/river as an editorial hierarchy, not a flat
  grid); the **section-front** treatment; the **article reading column** (orb persona byline, pull quotes, inline
  data/charts/embeds, reading-progress); all three register's visual separation; all states per breakpoint.
- An extracted **`<EditorialProse>`** wrapper + token set so the prose scale is defined once and reused by article
  body, deks, and pull quotes (replaces the per-block Tailwind in `article-view.tsx` with a shared scale).

## 1. The editorial skin — AUSPEX, but for reading

The HUD register and the editorial register share the **same void, the same glass, the same hairlines, the same
orb, the same accents** — they diverge only in *density and chrome*. A reader must feel they walked from the
control room into the library, not into a different app.

**What carries over (unmistakably AUSPEX):**
- The `--void`/`--void-2` background with the atmosphere layers (`.atmos.*`: faint starfield, scanlines, grain,
  vignette) at **reduced intensity** behind reading surfaces — present, never busy (see §8 contrast).
- Content on **glass panels** (`--panel`, `backdrop-blur`) divided by **translucent hairlines** (`--hair`), never
  solid grey rules. The masthead, cards, article column, rails are all glass.
- **Michroma** (`--head`, white→lilac gradient text-clip) for the masthead wordmark and article headlines.
- The **conic-gradient orb** as the cast/persona avatar in bylines (`.orb` — the single strongest AUSPEX tell that a
  human-feeling outlet is actually the AI cast).
- Restrained accents carrying meaning (lilac = AI/cast/interactive, amber = value/money, steel = data, jade/coral).

**What changes for reading (the discernment work):**
- **Lower chrome.** Article body panels drop bezels/halos/heavy borders; the reading column floats on a barely-there
  glass with one hairline edge. No LCD glow, no scanlines *over* body text, no marquee inside prose.
- **Body type is Inter**, used *generously* here (inverting the HUD rule "Inter sparingly") — long-form needs a
  humanist reading face, not Michroma/mono. Mono (`--mono`) appears only for inline data tokens, stat call-outs,
  and timestamps.
- **Calmer motion.** Only a quiet fade/rise on card and article mount and the reading-progress bar; no count-ups,
  draw-ins, or equalizers in prose. All motion collapses under `prefers-reduced-motion` (§8).
- **Ink hierarchy tuned for prose:** body uses `--ink` (`#E7E9F3`) on `--void`/glass at the reading size for AA+;
  deks/captions use `--ink-2`; metadata/timestamps `--ink-3`. `--ink-3`/`--ink-4` NEVER carry body copy (§8).

## 2. Reading ergonomics (the legibility spine)

- **Measure:** body sets a max width of **~60–72ch** (target ~66ch). Implement as `max-width: 38rem`–`42rem` on the
  prose column (independent of the page's wider `max-w-5xl` shell — the current `max-w-3xl` on `<article>` is close;
  pin it to a `ch`/`rem` measure token, not a layout breakpoint).
- **Prose scale (defined once, in `<EditorialProse>`):** base body **18px desktop / 17px mobile**, `line-height
  1.7–1.75`; paragraph spacing ~`0.9em`–`1em` (rhythm, not `<br>`). Headings within body (Michroma, smaller than the
  H1): subhead ~22–24px. Pull quote ~22–26px Saira/Inter italic-weighted. Dek ~19–20px `--ink-2`. Caption/figure
  ~14px `--ink-3`. Lists indent to the measure; blockquote keeps a 2px lilac left-rule (already present — keep).
- **Dark-mode long-form legibility:** the single hardest requirement. Pure-white text on near-black void causes
  halation; `--ink` (`#E7E9F3`, a soft off-white) is the body color **by design** — do not "fix" it to `#fff`.
  Behind body text the glass panel sits **slightly lifted** off pure void (`--void-2`/`--panel`) so contrast is from
  a controlled surface, not raw void, and atmosphere grain is suppressed under the measure.
- **Scannability:** deks, subheads every few paragraphs (cast articles ship `structure` sections per spec 12 — map
  section breaks to subheads), pull quotes to break the column, generous paragraph rhythm. A reader skimming the
  first line of each paragraph + the subheads should get the gist.
- **Reading-progress:** a thin (2px) lilac progress bar pinned under the app header on the **article page only**,
  tracking scroll through the prose column (not the whole page). Hidden under `prefers-reduced-motion`? No — it's an
  orientation aid, not decoration; keep it but make it non-animated (instant position) under reduced-motion. An
  estimated read-time chip ("6 min read", `--mono`) sits in the byline row.
- **Respects user font-size/zoom:** all prose sizes in `rem`; the measure in `ch`/`rem`; layout reflows (no fixed
  px heights on text containers) up to 200% zoom with no clipping or horizontal scroll of body text (§8, WCAG 1.4.4
  / 1.4.10 reflow).

## 3. The Story Card atomic unit — six variants, one field set

One component (`PublicationStoryCard`), one prop contract (`PublicationStory`). Variants change **emphasis and
chrome**, never which fields exist (spec 11 acceptance #2). AUSPEX glass-card skin for all.

| Variant | Where | Shows | Chrome / weight |
|---|---|---|---|
| `hero` (lead) | front lead, section-front lead | thumbnail 16:9, section tag (lilac eyebrow), Michroma headline (clamp 3), dek (clamp 3–4), orb byline, time, CTA | Largest. Glass panel, soft lilac edge-glow on hover-lift. The page's visual anchor. |
| `secondary` | 2–4 under/beside lead | thumb 16:9 optional, tag, headline (clamp 2–3), short dek (clamp 2), byline, time | Medium glass card, hairline border, subtle hover-lift. |
| `river` | the uniform grid below | thumb optional, tag, headline (clamp 2), dek (clamp 2), byline, time | Uniform glass cards, equal weight, denser. |
| `rail` / teaser | Home "From the Press", "For your league", related | tag, headline (clamp 2), time; byline/dek optional | Compact glass; the lightest chrome. (Exists.) |
| `compact` *(new)* | section-front overflow, search/archive, "more from this beat" | one row: tag dot + headline (clamp 1) + byline + time | List row, hairline divider between rows, no thumbnail. For dense lists where cards would be noise. |
| `inFeed` *(new)* | League wire, activity surfaces in the HUD register | tag, headline (clamp 2), orb byline, time | A glass card sized to drop INTO the HUD/wire stream — bridges editorial into dashboard contexts without becoming a Front. |

- **The orb byline is the cast tell.** For `blog` items (a cast member wrote it), the byline shows a **small
  conic-orb avatar** (`.orb`, ~20–24px) + persona display name (from `personaLabel`) — instantly "the AI cast,
  performing." For `news` items the byline shows the **source name** (no orb; it's a real outlet). The card reads the
  same shape either way; the orb's presence/absence encodes register origin.
- **Section tag** renders as a lilac eyebrow (`.eyebrow`, uppercase, tracked). **Time** is `--mono`, `--ink-3`,
  `<time dateTime>`. **`relevanceReason`** (the "For your league" rail) renders as a quiet inset hairline-bordered
  note, `--ink-2`, lilac left tick — "why you're seeing this."
- **Thumbnail graceful absence:** no thumbnail → the card composes cleanly without a gap (the headline becomes the
  top element). A `hero` with no image leans on a larger Michroma headline + dek to hold weight (do not stretch a
  placeholder box). Maintain 16:9 (`5:3` for rail) when present; `object-cover`, hairline border, `--r-md` radius.

## 4. The Publication Front — an edited hierarchy, not a flat list

`/news` (Rumbledore News) and `/leagues/[id]/press` (The {League} Press) are **Fronts**: lead → secondaries → river,
tiered by `buildPublicationFront` (FIXED). The visual job is to make the **hierarchy legible at a glance** — the
lead must dominate; secondaries must read as a clear second tier; the river as the demoted flat list.

**Masthead (NEW visual, both publications):**
- League Press wordmark: **"The {League Name} Press"** in Michroma (white→lilac gradient), an `.eyebrow` kicker
  ("LEAGUE DISPATCH" / the cast tagline), and the **section nav** (Recaps · Power Rankings · Trash Talk · Records ·
  Previews). Central: **"Rumbledore News"** wordmark, sections (NFL · Fantasy · Injuries · Rankings).
- The masthead sits on a glass bar with a single hairline base rule and a faint amber/lilac hairline flourish — it
  must read as a **publication banner**, not a tab strip. It is the strongest "this is a real outlet" signal.
- Section nav = AUSPEX segmented/tab control; the active section uses the lilac active state (`aria-current="page"`).
  On scroll, the masthead may condense to a slim sticky bar (wordmark + section nav) — sticky, not fixed-overlapping.

**Desktop (≥1024px):** a true editorial grid.
- Masthead full-width across the top.
- **Lead** spans a wide left column (≈8/12) with the `hero` card; a **rail** of 2 stacked `secondary` cards sits to
  the right (≈4/12). (When there's a "For your league" rail on `/news`, it can occupy this right column above the
  fold; on the Press front the right column holds secondaries.)
- Below: remaining **secondaries** in a 2–3 col band, then the **river** as a 3-col uniform grid.
- Generous gutters; hairline dividers between bands; never let secondaries read as the same weight as the lead.

**Tablet (640–1023px):** lead full-width `hero`; secondaries 2-col; river 2-col. Right-rail collapses below the lead.

**Mobile (<640px):** strict single column. Lead `hero` first, then secondaries stacked, then river stacked
(1-col). Section nav becomes a horizontally scrollable chip row under the wordmark (no wrap to two lines on small
screens). The "For your league" rail (on `/news`) appears as a labeled single-column band above the lead OR
collapsed into a "For your league →" link if space-constrained. ≥44px touch targets on all nav chips and CTAs.

The current `news-hub-view.tsx` / `league-feed-view.tsx` already render `lead → secondaries → river` with
`data-front-tier` attributes — **keep those attributes** (they're test hooks for spec 11 acceptance #1) and reskin
the wrappers to the grid above.

## 5. The Section Front

Same archetype as the Front, scoped to one beat — visually a **sub-front under the masthead** with the active
section highlighted in the nav. The wordmark stays; an `.eyebrow` reads "{Section} · The {League} Press". Same
lead/secondaries/river grid. When a section is thin it **degrades gracefully** (spec 11): fewer secondaries → wider
lead; only a river → drop the lead tier and show a labeled river; **empty section → empty state** (§7), never a
throw. A section with a long tail uses `compact` rows below the river for "older in {Section}".

## 6. The Article Page — the reading destination

Top-to-bottom (extends the existing `PublicationArticleView`; restyle + add):
1. **Context row** — back link + "{Publication}" link (AUSPEX ghost/outline buttons). Reading-progress bar pins
   under the app header here.
2. **Section eyebrow** (lilac, links to the section front).
3. **Headline (H1)** — **Michroma**, white→lilac gradient, large (≈34–40px desktop / 28px mobile), `leading-tight`.
   This is the single biggest Michroma moment in the app — it must feel like a cover headline.
4. **Dek** — Saira/Inter, ~19–20px, `--ink-2`, the standfirst that earns the read.
5. **Persona byline** — **the orb.** A spinning conic-orb avatar (`.orb`, ~28–32px) + persona display name + role
   line (`bylineDetail`, e.g. "Narrator · weaves the week into legend") + `<time>` + read-time chip (`--mono`).
   For `news` articles: source name + canonical "Open source ↗" + no orb. This row is where editorial meets cast:
   the orb makes it unmistakable a *character* filed this, not a feed.
6. **Hero** — 16:9 glass-bordered image when present; graceful absence (headline+dek carry the top).
7. **Body** — the **`<EditorialProse>`** column at the ~66ch measure, AUSPEX-calm: Inter 18px/1.7, Michroma subheads,
   blockquotes with the lilac left-rule, lists, and:
   - **Pull quotes** — a large Saira/Inter quote pulled from the body, lilac quotation flourish, spanning slightly
     wider than the measure on desktop (a "break" in the column). Used 0–2× per article; from `structure` when the
     cast marks a quote, else editorially derived. Reduced-motion safe (no animated reveal).
   - **Inline data / charts / embeds** — when a cast article carries structured data (e.g. `power_rankings` ranked
     array, a recap's standings shift), render it inline as an **AUSPEX data block** (a ranked `.tbl`, a `spark`/bar
     chart, a stat tile row) from the `29` chart library — the one place the HUD register reaches into prose. These
     blocks **break the measure** (full reading-width or wider), sit on their own glass cell with a caption, and are
     keyboard/SR-accessible (data also available as a table). They never animate-distract mid-read.
8. **Cited canon aside** — keep the existing glass aside (Landmark icon, provenance label). AUSPEX `.insight`-style
   card; lilac accent (canon = ratified league fact, spec 12/13).
9. **Tags** — AUSPEX chips linking to filtered views (`?tag=`), at the measure.
10. **Related / next** — 2–4 `rail` cards (same section / shared tags) so the reader moves laterally, plus a
    prominent **"Next in {Section} →"** affordance. A dead-end article is a failure (spec 11 acceptance #4).

**Article layouts:**
- **Mobile (<640px):** single column; everything at the measure (which ~= full width minus padding); hero full-bleed
  to the gutter; pull quotes and data blocks full-width; related as 1-col stack.
- **Tablet (640–1023px):** centered measure column; related as 2-col; data blocks may go slightly wider than measure.
- **Desktop (≥1024px):** centered ~66ch measure with **generous void margins**; an optional **left/right margin
  rail** (sticky) for: reading progress (vertical), share/save, tags, or a mini "in this article" jump list from the
  `structure` sections — margin furniture only, never crowding the measure. Related as 3–4 col band full-width below.
  Pull quotes/data blocks bleed into the margin slightly (the only elements wider than the measure).

## 7. The three registers — keep them visually distinct (spec 11's central rule)

| Register | Route | Reads as | Visual signature |
|---|---|---|---|
| **League Home** | `/leagues/[id]` | a **dashboard** (HUD register — owned by `32`) | Stat tiles, LCDs, charts, ladders, the wire. Its ONLY editorial element is a **"From the Press" teaser** module: 2–3 `rail` cards + "Read The Press →". This spec styles that module to read as a *teaser into* the publication (orb bylines, lilac eyebrow), clearly a visitor from another register — NOT a Front. |
| **The {League} Press** | `/leagues/[id]/press` | the **league outlet** (editorial register) | Masthead "The {League} Press", lead/secondaries/river, orb bylines everywhere, calm reading skin. The cast about THIS league. |
| **Central News** | `/news` | the **sport outlet** (editorial register) | Masthead "Rumbledore News", source bylines (NO orbs — real outlets), the "For your league" rail. The firehose, in print. |

The HUD↔editorial divergence (§1: density/chrome) is what keeps Home from blurring into the Press; the orb-vs-source
byline is what keeps the Press (cast) distinct from Central (real news). Acceptance #5 (spec 11) is structural; this
spec makes the distinction **legible at a glance** so a user never confuses dashboard, league outlet, and sport
outlet. `inFeed`/`rail` cards are the only editorial atoms allowed to appear inside the HUD register, and they always
link **out** to the Press, never inline-expand into a reading surface there.

## 8. Accessibility (critical — long-form is read assistively)

- **Semantic structure:** the article is a single `<article>` with one `<h1>`; body subheads are `<h2>`/`<h3>` in
  order (no skipped levels); pull quotes use `<figure>`/`<blockquote>`+`<figcaption>` (decorative quote marks
  `aria-hidden`); the related band is a labeled `<nav>`/`<section>`; the canon aside is `<aside aria-label>`. The
  Front uses `<main>` with labeled `<section>`s per tier (the existing `aria-label`/`data-front-tier` stay).
- **Reading order:** DOM order = visual reading order at every breakpoint (the desktop margin rail and right-column
  secondaries must come AFTER the lead/body in source, positioned via grid — not before).
- **AA contrast on glass/void:** body text (`--ink` on `--panel`/`--void`) verified ≥ **4.5:1**; large headings ≥
  **3:1**; metadata in `--ink-3` only at non-essential sizes still ≥ 4.5:1 or treated as large. Atmosphere
  (grain/scanlines/vignette) is **suppressed/dimmed beneath the prose measure** so it never erodes body contrast —
  test contrast against the *composited* surface, not the flat token (`28` owns the contrast table; this spec
  mandates it for prose).
- **Font-size / zoom:** `rem`-based prose + `ch` measure reflow to 200% zoom and at the OS large-text setting with no
  clipping, overlap, or horizontal scroll of body text (WCAG 1.4.4 / 1.4.10).
- **Reduced motion:** `prefers-reduced-motion` collapses card/article mount fades, orb spin (orb becomes a static
  conic disc — identity preserved), pull-quote reveals, and progress-bar animation (bar still tracks, just jumps).
- **Links/targets:** tag chips, section nav, CTAs ≥ 44×44px touch; visible AUSPEX focus-bloom ring on every
  interactive element; "Read story"/"Read source" links have discernible names (no bare "Read more"); external
  source links carry an icon + visually-hidden "(opens in new tab)".
- **Inline data blocks** expose the data as a real `<table>` (or have an accessible text alternative) so charts
  aren't SR dead-ends; caption associated via `<figcaption>`.

## 9. States — every surface, every breakpoint

- **Loading / skeleton:** AUSPEX skeleton (glass shimmer, reduced-motion → static). Front: a `hero` block + 2
  secondary blocks + a river grid of shimmer cards, matching the final grid so there's no layout shift. Article: a
  headline bar, dek lines, byline row (with a static orb placeholder), then ~6 prose lines at the measure. Skeletons
  respect the measure and breakpoint grid.
- **Empty:** Front with no stories → masthead + an AUSPEX `.empty` panel ("The {League} Press hasn't filed yet —
  the cast is watching the league.") with a quiet orb, never a blank Front. Empty **section** → "No {Section}
  stories yet" panel, masthead + nav intact, sibling sections still reachable (spec 11 acceptance #3). Article with
  no body → the existing dashed "no body text yet" note (keep), headline/byline still render.
- **Error:** a glass error panel (coral accent) with a retry affordance, masthead preserved where possible; never a
  white crash page. A missing article → `notFound()` (exists). Access-denied → the existing
  `LeagueSectionAccessState` (sign-in / no-access) reskinned to AUSPEX (glass panel, orb, clear CTA).
- **Offline (PWA):** previously-read articles render from cache with an offline ribbon; un-cached Fronts show an
  AUSPEX offline panel ("You're offline — last filed stories shown"). (`24`/`30` own the PWA shell; editorial honors
  it.)
- **Gated / entitlement:** a premium-gated article/section shows a glass gate panel (amber = value) with the
  headline+dek as a teaser and an upgrade CTA — never a broken page (`17`/`32` own entitlements; editorial renders
  the gated teaser shape).

## 10. Acceptance criteria (testable)

Structural/routing/data invariants are owned by spec 11 (`pnpm test`/e2e) and unchanged. This spec adds **visual +
a11y + responsive** gates:

1. **AUSPEX reading skin** — Front, section front, and article render on the void with glass panels + hairlines (no
   solid grey rules), Michroma masthead/headline, Inter body, and the conic-orb byline on `blog` items; visual
   regression / DOM snapshots confirm the AUSPEX surface, not the round-one card grid.
2. **Front hierarchy is legible** — the `hero` lead is visually dominant; `secondary` and `river` tiers are distinct
   weights; `data-front-tier="lead|secondary|river"` hooks present (spec 11 #1 still passes). Exactly one lead, 2–4
   secondaries, rest river, at each breakpoint (mobile 1-col → desktop editorial grid).
3. **One card, six variants** — `hero|secondary|river|rail|compact|inFeed` all render from `PublicationStoryCard`
   with the same `PublicationStory` field set; a snapshot per variant; orb shown iff the item is a cast `blog` byline
   and absent for `news`/source bylines.
4. **Reading measure** — the article prose column computes to **60–72ch** at desktop default; body is `rem`-based
   18px/1.7 (17px mobile); reflows to 200% zoom with no horizontal scroll of body text (automated viewport test).
5. **Article composition** — headline (Michroma H1), dek, persona orb byline + role line + read-time, hero-when-
   present, structured body (paragraph/heading/quote/list via `parseArticleBodyBlocks`), ≥0 pull quotes, inline data
   blocks when `structure` carries data, tags, cited-canon aside when present, and 2–4 related/next cards — no
   dead-end (spec 11 #4 passes).
6. **Register distinction** — `/leagues/[id]` Home shows only a 2–3 card "From the Press" teaser (not a Front);
   `/leagues/[id]/press` shows the masthead Front with orb bylines; `/news` shows the masthead Front with source
   bylines (no orbs) + the "For your league" rail when an active league intersects. Snapshots confirm three distinct
   surfaces (spec 11 #5).
7. **Accessibility** — axe/lighthouse: one `<h1>`/article, ordered headings, labeled landmarks, AA body contrast on
   the composited glass surface, 44px targets, visible focus, DOM order = reading order, inline charts have a table/
   text alternative; `prefers-reduced-motion` disables fades/spin/reveals (orb static) — automated + manual gate.
8. **All states** — loading skeleton (no layout shift, matches grid), empty Front, empty section (siblings intact),
   error (glass + retry), no-body article, gated teaser, and offline panel each render per breakpoint without
   throwing; section-empty and access-denied paths preserve the masthead/shell.

### Needs the human UI pass (not gate-verifiable)
Exact lead-vs-secondary visual weight, masthead flourish, hero crops, pull-quote selection taste, where data blocks
break the measure, and final persona-byline presentation. This spec fixes the **system** (skin, measure, variants,
layouts, states, a11y); taste is tuned with a human in the room (North Star "surface soul later").

## 11. Dependencies
- **`11` Publication system** (FIXED structure: archetypes, registers, story card contract, front tiering).
- **`12` AI cast** (the personas as bylines; `structure`/`content_type` that drive subheads, pull quotes, inline data).
- **`28` Foundations** (tokens, the prose contrast table, type, reduced-motion), **`29` Components** (story card,
  chart library for inline data, skeleton/empty/error/gate panels, segmented nav, orb), **`30` App shell** (the nav
  chrome around these surfaces, sticky header the progress bar pins under, PWA/offline), **`32`** (League Home
  dashboard + entitlement gates — the other two registers), **`33`** (orb/persona identity surfaces).
