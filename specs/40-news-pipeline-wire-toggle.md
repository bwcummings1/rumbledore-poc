# Spec 40 — News Pipeline & the General↔Personal Wire Toggle

> Outcomes spec. Sources NFL/fantasy news, **entity-tags** it to players/teams, fills the News environment
> (`specs/39`), and makes the **WIRE a general↔personal toggle** (general NFL/fantasy news ↔ news filtered to the
> user's rostered players). Read `docs/NORTH-STAR.md` first; `DESIGN.md` is a gate. Builds on **`specs/39`** (the
> News environment it fills), `specs/21` (central news — EXISTS), `specs/30` (the WIRE in the shell — EXISTS),
> `specs/19` (ingestion), `specs/25` (real integrations/cost). Lives in `src/news/*`, news ingestion, the WIRE
> component (Track B owns `src/navigation`), provider rosters. **Track B**, after `39`.

## Why this spec exists (the soul)
The owner's wire model: not scope-aware, but a **toggle** — *general* (all NFL/fantasy news) ↔ *personal* (news
about the players on *your* teams). Threads "News" and "Wire" are the **same pipeline**: ingest news → tag it to
players/teams → the News environment is the browsable view, the WIRE is the ticker, and *personal* is just "filter
to what you roster." Personal-relevance is the hook — the app tells you about *your* guys.

## Outcomes
1. **A news pipeline** — ingest NFL/fantasy news, **entity-tag** each item to players/teams (AI), store deduped.
2. **The News environment filled** — tagged items populate `specs/39`'s subsections.
3. **The wire toggle** — general ↔ personal, a user preference (not page scope); personal = items tagged to players
   on any of the user's rostered teams.
4. **Mock-first** — sourcing + tagging behind mocks ($0) until keys (`specs/25`).

---

## A. The news pipeline (ingest → tag → store)
Ingest NFL/fantasy news (source behind mocks until keys, `specs/25`; reuse the `specs/21` central-news ingestion +
canonical-source dedup). **Entity-tag** each item to players/teams using the AI infra (`specs/07`/`12`, model
routing `specs/26`) — store tags on the news item. Tagging runs as an idempotent job (`specs/19`).

## B. The News environment content (fills `specs/39`)
Tagged items populate `specs/39`'s News subsections (Front/Players/Injuries/etc.). `specs/39` owns the
environment/nav; this spec owns the **content** that flows into it.

## C. The wire toggle (general ↔ personal)
The WIRE (EXISTS in the shell, `specs/30`) gains a **toggle**: **general** = all NFL/fantasy news; **personal** =
items whose tagged player/team is on **any team the user rosters across their leagues** (rosters EXIST from the
providers). This **replaces the scope-aware wire** with a user preference, persisted. Personal-feed matching =
`tagged_entities(news) ∩ user_rostered_players`. Designed empty states (no rostered players / no relevant news →
honest empty, not blank).

## D. Mock-first & cost (`specs/25`)
News source + tagging are pluggable and **mocked by default** ($0); flipping live = real keys + `MOCK_*` off
(`specs/25`). No live calls in CI; fixtures drive tests. Polling/cost is a `specs/25` concern, not a blocker here.

## E. Design & EXISTS/NEW
- **Design:** the toggle control + WIRE items in AUSPEX per `DESIGN.md`/`specs/30` (edges/pills, mono text);
  designed empty/loading; token-contract test green.
- **EXISTS — extend:** central-news ingestion + dedup (`specs/21`), the WIRE component (`specs/30`), provider
  rosters, AI infra (`specs/07`/`12`).
- **NEW:** entity-tagging of news to players/teams; the tagged-news store; the personal-feed matching (rosters ×
  tags); the general↔personal toggle UI; content flowing into `specs/39`'s subsections.

## F. Acceptance criteria (testable, fixture-backed)
1. **Ingest + tag.** A news fixture ingests, dedupes, and entity-tags to the right players/teams (mock tagger);
   tags persist on the item.
2. **News environment filled.** `specs/39` subsections render tagged content from the store.
3. **Wire toggle.** The WIRE toggles general ↔ personal; **general** shows all items; **personal** shows only items
   tagged to players on the user's rostered teams (fixture rosters), persisted across navigation.
4. **Graceful.** No rostered players / no relevant news → designed empty personal wire, never blank or broken.
5. **Mock-first.** Tests pass offline on fixtures; live mode is a keys + `MOCK_*` flip (`specs/25`), no CI live
   calls.
6. **AUSPEX + gates.** Fidelity per `DESIGN.md`; `typecheck/lint/test/build/ubs` pass; `perf:pwa` if shell touched.

### Needs the later human pass
Tagging precision tuning, source selection, wire density/refresh cadence — tuned with the owner + real keys.

## Dependencies / blocked-by
- **Builds on** `specs/39` (News environment) — prerequisite; `specs/21` (central news EXISTS), `specs/30` (WIRE
  EXISTS), `specs/19` (ingestion), `specs/25` (real integrations — mock until keys), `specs/07`/`12` (AI tagging).
## Non-goals
- The News environment **structure/nav** (`specs/39`); real news-source **keys/vendor** selection (deferred,
  `specs/25`); the arena (`specs/15`/`39`).
