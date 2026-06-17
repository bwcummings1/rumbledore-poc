# Spec 18 — The Lore Experience (the league authors its own mythology, made usable)

> Outcomes spec. WHAT the member-facing lore surface delivers, not HOW it is coded. The loop chooses HOW,
> consistent with `specs/01-architecture.md` and `AGENTS.md`.
> Read `docs/NORTH-STAR.md` §"The league writes its own mythology" first — this spec puts a **face** on the
> mechanic `specs/13` already built. **Phase 1 (EXISTS):** the full lore engine as server-side services in
> `src/lore/` (claim → verify/vote → canon → dispute/branch), tables, jobs, and the AI read/write contract.
> **Phase 2 (NEW, this spec):** the member-facing UI + thin RLS-scoped API routes so a member can actually
> **submit a claim, vote, and browse canon** — the mechanic becomes a thing the league *does*, not a service
> nobody can reach.

## Why this exists (soul, not CRUD)
Lore is **how a league authors its own truth** — its grudges, villains, inside jokes, and verdicts — and it is
the AI cast's authenticity substrate: the cast **cites canon as fact** and **instigates** new claims. Today all
of that lives behind functions no human can call from the app. The participatory principle of the North Star
(`the user is a character and a contributor`) is unreachable. This spec is the **floor of the show**: a member
opens a section, posts "the 2019 Watson trade was the worst ever," the league votes, it becomes canon — and then
the Narrator cites it by id in a column that links *back here*. Generic = failure; the lore surface is where the
league's voice is literally typed in by the people in it. **Visual polish is the later human pass** (`specs/10`/`11`
register rules); this spec fixes the structure, flows, states, and the API contract.

## Where lore lives in the IA (per `specs/10` + `specs/11`)
Lore is a **dedicated league-scope surface** — it is canon, not a feed, so it does not dissolve into The Press.
Per `specs/10` the active league exposes Home · The Press · Bet · Records · Members; **Lore** joins them as a
league section (`/leagues/[leagueId]/lore`), the league's **official record**. It sits naturally beside Records
(numbers the system owns) as the league's *narrative* record (truths the league ratified).

- **Route:** `/leagues/[leagueId]/lore` (the canon front), `/leagues/[leagueId]/lore/[claimId]` (a claim/thread
  page), `/leagues/[leagueId]/lore/new` (submit), and a steward review view (role-gated, below). All run under
  that league's RLS context (`app.current_league_id`, `WHERE league_id = current`), guarded by `requireLeagueRole`.
- **Nav presence (`specs/10`):** mobile bottom-tab set and desktop left-sidebar "current league's sections" gain a
  **Lore** entry; active-state reflected on both breakpoints. The Records page and the Press masthead carry a quiet
  cross-link to Lore (Records → "What the league *decided*"); a Press article that cites a canon id deep-links to
  that claim page (below). No provider ever appears as a nav level (`specs/10` invariant).
- **The Press relationship (`specs/11`):** Lore is **NOT** a publication Front. Press *articles* reference canon
  (as tags/citations); the canon entries themselves live on the Lore surface. Lore reuses the **Story Card**
  atomic unit (`src/components/publication/story-card.tsx`) and the Front's lead/secondaries/river tiering so canon
  reads like an edited record, not a flat list — but it is its own register: the league's ratified ledger.

## Submit a claim (the two lore types — `specs/13` §"Two lore types")
`/leagues/[leagueId]/lore/new`. The member **never picks the verification path** — the system classifies by
attempting verification (`submitLoreClaim`). The form collects what each shape needs and routes accordingly:

- **Always:** a **title** (the claim headline) and a **body/statement** (the assertion in the member's words),
  plus optional **subjects** — who/what it's about: person(s), a rivalry (two persons), a season, a week, or a
  record (`LoreSubjectInput`). Subjects are pickers over the league's canonical `person`s / H2H rivalries /
  seasons (`specs/06`), never free text, so a claim survives renames (it references `person.id`).
- **Opinion / narrative (no assertions):** "the 2019 trade was the worst ever," "X is the biggest choker." The
  member writes a subjective claim and (optionally) tags subjects. → `submitLoreClaim` with **no `assertions`** →
  opens in `vote` (`status: "vote"`, `verification: "n_a"`). The UI frames this as **"the league will decide."**
- **Data-verifiable (with assertions):** an optional **"assert a fact"** affordance lets the member attach one or
  more **structured assertions** — a `weekly_statistics` / `season_statistics` / `all_time_record` source, a
  metric (the engine's enumerated `WeeklyLoreMetric`/`SeasonLoreMetric`/record type), the subject person/season/
  week, and the **asserted value** (e.g. "Person X scored 200.4 points_for in Week 5, 2017"). Because the check is
  deterministic against stored stats (`specs/13` non-goal: no NLP fact-extraction), the fact is built from
  **structured pickers**, not parsed prose. → `submitLoreClaim` with `assertions` → the engine **auto-resolves on
  submit**: `match` → **canon** (`verification: "verified"`, no vote), `contradiction` → **rejected**
  (`verification: "refuted"`, true value shown), `uncheckable` → falls through to **vote**
  (`verification: "unverifiable"`).
- **Result feedback (the moment of submission, testable):** the form's response tells the member exactly what
  happened — *"Posted. The league is voting (closes in N days)."* / *"On the record — auto-confirmed canon."* /
  *"Refuted: the actual value was 188.2."* — each mapped 1:1 to the `SubmitLoreClaimResult` discriminant
  (`vote` / `canonized` / `rejected`). A pending opinion claim's author may **edit** before the first vote and may
  **withdraw** (`specs/13`); after voting starts the body is locked and corrections happen via an **addendum**
  branch (offered as an action on the claim page).

## The vote experience (`specs/13` §"Lifecycle & governance")
A claim in `vote` renders a **vote panel** on its claim page and a compact tally on its card. The panel surfaces
exactly the engine's rules — nothing invented client-side:

- **Choices:** `affirm` / `reject` / `abstain` (`castLoreVote`). One vote per member; a member may **change** their
  vote until the window closes (the panel shows the member's current choice and lets them re-cast). The author may
  vote but does not alone decide.
- **Window:** the **vote window** (default 7 days, `vote_closes_at`) shown as a live countdown ("closes in 2d 4h")
  with the open/close timestamps. After `vote_closes_at` the panel is read-only (`castLoreVote` returns
  `LORE_VOTE_CLOSED` / `LORE_CLAIM_NOT_OPEN` → render "voting closed," never a broken page).
- **Current tally:** a running `affirm / reject / abstain` count, the **quorum** target
  (`max(3, ceil(active_members * Q))`, `Q≈0.34`), and a clear read of "will this pass at close?" — affirm > reject
  **and** affirm ≥ quorum. Abstains/non-voters are **never** shown as reject (apathy must not read as veto —
  `specs/13` invariant). The tally mirrors `LoreVoteTally`.
- **Outcome states (clear, distinct):** **pending/open** (voting, countdown), **canon** (ratified — badge says how:
  `verified` "on the record" vs `vote` "the league decided" vs `steward`), **rejected** (with the refuted true value
  when data-verifiable), **disputed** (canon under challenge), **superseded** (replaced by a re-litigation),
  **withdrawn**. State + provenance are always legible — the AI's `provenance` buckets (`specs/13`) made visible.
- **Steward tiebreak (role-gated):** a `data_steward`/`commissioner` review view (own route, `requireLeagueRole`
  `minRole: "data_steward"`) lists **open votes**, **quorum-short-but-majority** claims awaiting a tiebreak, and
  flagged claims. From it: **ratify**, **reject**, **extend once**, or **veto** a ratified claim (`stewardLoreClaim`),
  each requiring a **reason** (audited as a `lore_event`). Non-stewards never see these controls; the surface
  cleanly 403s for them (below). The steward **adjudicates**, never authors canon (`specs/13`).

## Browse canon + branch / dispute trees (reuse `specs/11` patterns)
`/leagues/[leagueId]/lore` is the league's **official record**, rendered with the publication patterns but as its
own register:

- **Canon front** — canon entries as **Story Cards** (`hero`/`secondary`/`river` variants) tiered by recency +
  significance, each badged with provenance (`verified` / `vote` / `steward`) and its subjects. A small
  **"in the arena now"** strip surfaces **open votes** (claims in `vote`) so participation is one tap from the
  front. Filters by **subject** (a person / rivalry / season) so "everything canon about Person X" is reachable —
  the perennial choker has a canon page, mirroring Records' "the choker has a page."
- **Claim / thread page** (`/lore/[claimId]`) — the claim (title, body, author byline: member name or AI persona
  + an **AI badge** when `origin = ai`), its state + provenance, the vote panel (when open), and the **thread tree**:
  the full lineage rooted at `thread_root_id`, each branch labeled by `relation`
  (`response` / `addendum` / `dispute` / `relitigation`). Lineage is **append-only and never collapsed** —
  claim → counter → verdict is visible so the league (and the Narrator) can see "they re-litigated the 2019 trade
  and the league flipped." Superseded entries stay visible, annotated "superseded by →"; upheld canon shows
  "challenged & upheld."
- **Empty / gated states** never break: a league with no canon yet shows an inviting empty state ("No canon yet —
  make the first claim"); a free-tier league shows lore **read-only** with canonization gated (below).

## Challenge / branch from existing canon (`specs/13` §"dispute / re-litigation")
Every **canon** entry's page offers **Challenge** (dispute) and **Add to this** (addendum/response) actions — canon
is *never frozen* (`specs/13`). Challenge opens a **branch claim** (`openOpinionClaim`/`submitLoreClaim` with
`branchOf = <canon id>`, `relation: "dispute"|"relitigation"`), which **starts a new vote** and moves the parent to
`disputed` (the engine's `markChallengeOpenedInTx`). On close: dispute **succeeds** → parent → `superseded`, the
challenger becomes the new `canon`; dispute **fails** → parent stays `canon`, annotated "challenged & upheld." The
UI only offers Challenge on `canon` entries (the engine rejects `LORE_PARENT_NOT_CANON` otherwise — surfaced as a
clean inline error, never a broken page). Addenda/responses are available on any claim and never displace canon.

## The cast's lore activity surfaced (both AI directions — the soul, made visible)
The lore surface is where the cast's participation becomes legible to members:

- **AI-instigated claims (`origin = ai`):** when the Trash-Talker seeds *"Settle it: biggest choker of the decade?"*
  (the instigator/poll path that already creates a `lore_claim`, `origin = ai`, state `vote`), it appears on the
  canon front's open-votes strip and on its claim page **bylined to the persona with an AI badge** and the
  pre-seeded candidate subjects. Members vote on it through the **identical** vote panel — the AI gets no special
  ratification power (`specs/13`). A league that has muted AI instigation simply sees none.
- **Canon cited in articles links back here:** a Press article that asserts a canon fact (the AI reads
  `authenticity.lore.canon` / `trigger.loreClaim` with `ratifiedBy`) renders that citation as a **link to the
  canon claim page** (`/lore/[claimId]`), so a reader can trace "the league decided this, here's the vote." This is
  the round-trip the North Star describes: the cast **cites canon as fact** and the member can **walk to the ledger
  entry**. Un-ratified lore is never linked as fact (the AI hedges `pending`/`disputed` per `specs/13`); the UI
  must not render a `pending` claim as a settled-canon citation.

## API routes (NEW — thin RLS-scoped endpoints over the EXISTING services)
The `src/lore/` services are **server-side only**; the UI needs HTTP endpoints. These routes are **thin**: validate
input, resolve auth/role per request, call the existing engine function, map `AppError` → status. They follow the
established route shape (`requireLeagueRole`, `getDb()`/`getAuth()` per-request never at module scope, `zod` body
validation, `recordApiHandler`, `resultJson`/`errorJson` — as in `src/app/api/leagues/[leagueId]/steward/...`).
Every route is **league-scoped with an explicit `league_id`** from the path and runs inside `withLeagueContext()`
via the engine; cross-league reads are impossible by construction (RLS + explicit filter).

| Route | Method | Service | Guard |
|---|---|---|---|
| `/api/leagues/[leagueId]/lore/claims` | `GET` | canon/open/thread read query (buckets per `specs/13`) | `member` |
| `/api/leagues/[leagueId]/lore/claims` | `POST` | `submitLoreClaim` (opinion or data-verifiable; branch via `branchOf`) | `member` |
| `/api/leagues/[leagueId]/lore/claims/[claimId]` | `GET` | one claim + thread lineage + tally + verification | `member` |
| `/api/leagues/[leagueId]/lore/claims/[claimId]/votes` | `POST` | `castLoreVote` | `member` |
| `/api/leagues/[leagueId]/lore/claims/[claimId]/steward` | `POST` | `stewardLoreClaim` (ratify/reject/extend/veto + reason) | `data_steward` |

- **Read endpoint** returns claims classified into `canon[]` / `pending[]` / `disputed[]` / `refuted[]` (the same
  contract the AI reads, `specs/13`) plus thread lineage and current `LoreVoteTally`, so the canon front, open-votes
  strip, and claim page render from one shape. The `lore.vote.close` job (`specs/13`, EXISTS) still owns automatic
  closing; the steward route only triggers manual adjudication — the UI never closes a vote itself.
- **Gated states render cleanly, never broken pages.** Guard failures map to states, not stack traces:
  `INVALID_LEAGUE_ID` → 404; 401 (no session) → "Sign in required"; 403 (non-member) → "No league access"; steward
  route for a non-steward → 403 read-only. Engine `AppError`s (`LORE_VOTE_CLOSED`, `LORE_PARENT_NOT_CANON`,
  `LORE_STEWARD_REQUIRED`, `LORE_AUTHOR_REQUIRED`, …) surface as inline, human-readable errors with their status.
  Free-tier (`specs/17`): lore **viewing** is free; member **canonization-driving** writes (submit/vote/branch) are
  gated per entitlement — a free league sees the read surface with a clear locked-write state, enforced server-side
  in the route (never a client-only hint).

## Acceptance criteria (testable; mock LLM/stats fixtures, live Postgres)
Gate-verifiable (`pnpm test`, e2e — flows/routing/guards/state, not visual taste):
1. **Submit opinion → pending.** Submitting an opinion claim (no assertions) via `POST …/lore/claims` returns
   `status: "vote"`; the claim then appears on the canon front's **open-votes** strip and on its claim page with an
   open vote panel and a live countdown.
2. **Opinion vote crosses threshold → canon.** With affirm > reject and quorum met at window close, the claim
   transitions to **canon** (driven by the existing `lore.vote.close` job) and renders on the canon front badged
   `vote` ("the league decided"); affirm ≤ reject (or quorum unmet, no steward action) renders **rejected**.
3. **Data-verifiable auto-confirms.** A claim with an assertion matching a `weekly_statistics` fixture returns
   `status: "canonized"`, `verification: "verified"`, **no vote panel**, and renders on the canon front badged
   `verified` ("on the record") with the matched stat referenced. A contradicting assertion returns
   `status: "rejected"`, `verification: "refuted"`, and the UI shows the **true value**.
4. **Browse canon + a branch tree.** The canon front renders canon as Story Cards (lead/secondaries/river); a claim
   page renders the full **thread lineage** (root → dispute → verdict) with each branch's `relation` label, a
   superseded parent annotated, and an upheld parent marked "challenged & upheld."
5. **Challenge from canon.** "Challenge" on a `canon` entry opens a dispute branch, starts a new vote, and moves the
   parent to `disputed`; the action is **absent/disabled** on non-canon claims and any attempt is rejected cleanly
   (`LORE_PARENT_NOT_CANON` → inline error, not a broken page).
6. **Cast activity + citation round-trip.** An `origin = ai` claim renders bylined to its persona with an AI badge in
   the open-votes strip; a Press article citing a canon id renders that citation as a link to `/lore/[claimId]`, and
   a `pending` claim is **never** rendered as a settled-canon citation.
7. **Steward gating.** The steward review route/view requires `data_steward`+; a `member` hitting it gets a clean
   403 read-only state (no controls); a steward `ratify`/`extend`/`veto` with a reason succeeds and writes the
   audit `lore_event` (via the existing service).
8. **RLS isolation.** Lore reads/writes for league A under its route return **zero** of league B's claims/votes
   (the `specs/02` isolation canary holds across every lore route); the read endpoint for league A surfaces only
   league A's canon/pending/disputed/refuted.
9. **Gated states render cleanly.** No-session, non-member, invalid-league-id, voting-closed, and free-tier
   locked-write each render a **clean state** (sign-in / no-access / 404 / read-only / locked), never an unhandled
   error or blank page.

### Needs the later human UI pass (not gate-verifiable here)
The **feel** of the ledger: canon-card density and badge styling, the vote panel's countdown/tally treatment,
thread-tree visualization (how lineage is drawn), the AI-badge and provenance iconography, empty-state copy/art,
and final spacing/typography. This spec fixes the **structure, flows, states, and the API contract**; taste is
tuned with a human in the room (North Star "surface soul later"; AUSPEX-fidelity per `docs/design/rumbledore-design-language.md` rides this).

## Dependencies / blocked-by
- **`specs/13` League Lore (EXISTS)** — the engine (`src/lore/`: `submitLoreClaim`, `castLoreVote`, `closeLoreVote`,
  `openOpinionClaim`, `stewardLoreClaim`), tables, the `lore.vote.close` job, and the AI read/write contract this
  UI sits on. This spec adds **no** new lore mechanics — only surface + thin routes.
- **`specs/10` IA & Navigation** — the league section shell + nav this adds a **Lore** entry to; `requireLeagueRole`.
- **`specs/11` Publication System** — the Story Card (`src/components/publication/story-card.tsx`) and Front tiering
  reused for the canon record; the article→canon citation link.
- **`specs/06` Stats/Identity** — the canonical `person`s / rivalries / seasons / records the subject + assertion
  pickers select over.
- **`specs/17` Entitlements** — gates member canonization-driving writes behind tier; lore **viewing** stays free.

## Non-goals
- No new lore mechanics, tables, or lifecycle rules (owned entirely by `specs/13`; this is its surface).
- No cross-league lore browsing or any cross-league data on a league lore surface (`specs/13`/`02` isolation).
- No free-form wiki editing of canon (canon changes only via dispute/supersede — `specs/13`).
- No NLP fact-extraction in the submit form (assertions are structured pickers; the check is deterministic).
- No reputation/karma on voters, no real-money stakes (`specs/13`/`08`).
- Final visual design, motion, and copy voice tuning (the human UI pass).
