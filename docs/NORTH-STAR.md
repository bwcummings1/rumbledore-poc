# Rumbledore — North Star (the product's soul)

> Read this **before** any spec. Every spec and every loop task must serve what's here. Round one came out a
> soulless data system because the specs described plumbing, not this. Functionality is how the concept gets
> built; the ethos belongs **inside each task's instructions**, not bolted on later.

## What it really is
At the base, Rumbledore is a **data system**: connect any fantasy league (ESPN, Sleeper, Yahoo), store its full
history, and keep recording new history. That alone is just plumbing.

What makes it different is that **AI agents act on that data** — turning a league's seasons, rosters, rivalries, and
results into an **ongoing spectacle the members are characters in.** Users aren't operating software; they're the
**witting subjects of a show being written about them** — one that narrates, jokes, instigates, and competes
*alongside* them. The league stops being a spreadsheet of matchups and becomes a living, recurring production.

## The three layers
1. **The substrate (data).** Multi-provider connect + complete history + ongoing recording. Bedrock. Must be
   bulletproof and *faithful* — everything acts on it, so its truth is sacred. (Most loop-verifiable; build it deep.)
2. **The spectacle (the AI cast).** A cast of characters — journalists, a Commissioner, an Analyst, a Narrator, a
   Trash-Talker — who *act on* the data: write the recaps, rank the power, run the awards, start the arguments. The
   league's own media universe, about *these specific people.* This is the soul.
3. **The new competition (league-vs-league).** Paper betting + the arena reframe fantasy from *individual vs
   individual* to **also league vs league** — a genuinely new axis: your league competes with other leagues, and you
   within yours. A whole new dynamic stacked on the classic one.

## The AI is a **cast**, not a tool
- The personas have **distinct voices and beats** and they *participate* — they don't summarize, they perform. The
  Trash-Talker antagonizes; the Narrator mythologizes; the Commissioner adjudicates; the Analyst is dry and credible.
- They are **instigators**, not just reporters: they seed debates, run "settle it" polls, crown villains, manufacture
  rivalries, react to your moves. The user is pulled *into* the show, not handed a report.
- The bar: a post should feel like it was written **by someone who's been in your league for a decade** — names,
  grudges, inside jokes, the perennial choker — not like generic fantasy content with your team's name pasted in.

## The league writes its own mythology (lore)
Authenticity isn't scraped — it's **authored and ratified by the league.** Members make claims/stories ("the 2019
trade was the worst ever"); the league **votes**; ratified claims become **canon** that members branch off, dispute,
and re-litigate. Two kinds: **data-verifiable** (the system auto-confirms against stored history) and
**opinion/narrative** (the league votes). The AI **consumes canon as fact** (and never asserts un-ratified "history")
**and instigates it** ("Settle it: who's the biggest choker?" → then writes the verdict). Lore-building *is* the show.

## What makes it different (the wedge)
FantasyPros, the podcasts, ESPN's fantasy page — all write for a **general audience.** Rumbledore writes for
**this league, these people.** Personalized, participatory, recurring, a little chaotic. That shift — from
general-audience media to a league-specific spectacle the members star in — is the entire differentiation.

## Experience principles (the feel)
- **Alive** — it has a pulse: things happen, the cast reacts, the standings and arguments move.
- **Personal** — it's unmistakably about *your* league; generic = failure.
- **Funny / a little unhinged** — it has a sense of humor and a point of view; it antagonizes affectionately.
- **Participatory** — the user is a character and a contributor (lore, bets, disputes), not an audience.
- **A real publication** — content has journalistic structure (lead, sections, articles, bylines), not a feed of blobs.

## What this means for how we build
- **Embed the ethos in every task.** Not "generate a post" → "the Narrator mythologizes the week's biggest collapse,
  citing canon lore and the rivalry, as a column with a byline." The concept rides *inside* the functional spec.
- **Functionality first, surface soul later.** These headless sessions build the complete functional system —
  including the *functional* expression of the voice (the cast, the instigation, the lore mechanic, the league-vs-league
  reframe). The **surface** soul — UI/UX polish and final voice tuning — waits for human-in-the-room direction.
- **Add quality gates where correctness-gates can't see.** For AI content, an LLM-judge eval ("does this read as
  authentic to *this* league?"); for UI, fidelity to the AUSPEX reference (`docs/design/rumbledore-design-language.md`). These approximate "is it good," which `pnpm test` can't.
- **This doc is the orienting truth.** Every `specs/*` derives from it; every loop run is pointed at it.
