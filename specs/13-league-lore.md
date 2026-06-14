# Spec 13 — League Lore (the league writes its own mythology)

> Outcomes spec. WHAT, not HOW. The loop chooses HOW, consistent with `specs/01-architecture.md`.
> **NEW feature.** Lives in a new module `src/lore/`. Everything is league-scoped (`WHERE league_id` + RLS).
> Read `docs/NORTH-STAR.md` §"The league writes its own mythology" first — this spec *is* that section, built.

## Why this exists (the soul, not plumbing)
The AI cast can only feel like "someone who's been in your league for a decade" if the decade's **grudges,
villains, inside jokes, and verdicts** are written down as something the league itself ratified. Scraped stats
give the AI facts; **lore gives it authority and attitude.** This spec is the mechanism by which a league
**authors and ratifies its own truth**: a member posts a claim/story → the league **votes** → ratified claims
become **canon** → members **respond, branch, dispute, and re-litigate**. Lore-building *is* engagement (the
participatory principle from the North Star) **and** it is the AI's authenticity substrate: the AI **consumes
canon as fact and never asserts un-ratified league "history,"** and it **instigates** lore (seeds a "settle it"
poll, then writes the verdict when canon forms). Generic = failure; this is the machinery that makes content
unmistakably about *these people*.

## Where it touches the existing system (NEW, but wired in)
- **Identity / history (`specs/06`)**: a lore claim is *about* canonical `person`s, `head_to_head_record`
  rivalries, seasons, and records. Claims reference `person.id` (the durable franchise/owner), NOT raw provider
  team ids, so a "worst trade ever" attached to a person survives renames. **Data-verifiable** claims are checked
  against the `specs/06` materialized stats (`weekly_statistics`/`season_statistics`/`all_time_record`).
- **AI content (`specs/07`)**: the AI retrieval step gains a new trusted source — **canon lore** — alongside
  history/standings/rivalries. Lore enters the `LeagueContext` (trusted, league-owned). The AI also gains an
  **instigation** output path that creates lore claims/polls. Same isolation rules (`WHERE league_id` + RLS).
- **Feeds/home (`specs/05`)**: a ratified canon entry, an open vote, and a verdict are feed-worthy events.
- **Realtime (`specs/01`)**: claim posted / vote tally moved / claim ratified / claim disputed publish typed
  broadcasts to the league channel.
This spec does NOT redefine identity, stats, or the content pipeline — it consumes them.

## Core mechanic & objects
A **lore claim** is a statement a member asserts about the league. It has a **type**, a **subject** (the people /
rivalry / season it's about), a **body**, and a **lifecycle state**. Claims live in **threads**: a claim may
**branch** off an existing canon entry (a counter-claim, an addendum, a re-litigation). Votes ratify or reject.
Canon is the set of claims that reached ratified state; canon is **never frozen** — it stays challengeable.

### Two lore types (the central distinction — drives whether a vote is needed)
1. **Data-verifiable** — a factual assertion the system can check against stored league history, e.g.
   "I scored 200.4 in Week 5, 2017," "X has 3 championships," "X beat Y in the 2019 final." On submission the
   system **auto-resolves** it against `specs/06` stats:
   - **match → auto-confirmed canon**, state `canon`, `verification = verified`, **no vote opened**. The system
     records the exact stat row(s)/value it matched.
   - **contradiction → auto-rejected**, state `rejected`, `verification = refuted`, with the true value attached
     (so the AI can roast the wrong claim: "actually it was 188.2").
   - **un-checkable** (claims a fact we don't store, e.g. lineup we never ingested) → it is **not** auto-confirmed;
     it falls through to the opinion path (league vote) and is flagged `verification = unverifiable`.
   Auto-confirmed canon is flagged **`verified`** distinctly from vote-ratified canon so the AI (and UI) can say
   "on the record" vs "the league decided."
2. **Opinion / narrative** — a subjective claim the data can't settle, e.g. "the 2019 Watson trade was the worst
   ever," "X is the biggest choker," "the 2021 title was tainted." These **require a league vote** to become canon.
   `verification = n/a`.

The submitter does not pick the path; the system classifies (verifiable vs opinion) by attempting verification.
A claim may carry both a verifiable spine and an opinion ("I scored 200 *and it was the best week anyone's ever
had*") — the verifiable part is confirmed/refuted automatically; the opinion part still goes to a vote.

## Lifecycle & governance (states + transitions)
States: `pending` → (`canon` | `rejected`) ; `canon` → `disputed` → (`canon` | `rejected` | `superseded`).
Plus terminal-ish `withdrawn` (author pulls a pending claim) and `superseded` (a re-litigation replaced it).

- **pending** — opinion claim awaiting the vote (data-verifiable claims skip this; they resolve on submit).
- **vote** — open for a window of **N days** (default 7, league-configurable). Members vote `affirm` / `reject`
  (optionally `abstain`). One vote per member per claim; a member may change their vote until the window closes;
  the author's own vote is allowed but does not alone decide.
- **ratification threshold (small-league / voter-fatigue friendly)** — a claim becomes `canon` when, at window
  close, **affirm > reject AND affirm ≥ a quorum** where quorum = `max(3, ceil(active_members * Q))`, `Q` default
  `0.34` (roughly a third, configurable). Abstains and non-voters are NOT counted as reject (apathy must not veto
  lore). If quorum isn't met by window close but affirm is already a strict majority of *votes cast*, the
  **steward/commissioner may ratify or extend** (tiebreak power, below). A tie or affirm ≤ reject → `rejected`.
- **steward/commissioner tiebreak** — the `data_steward` (or `commissioner`, roles per `specs/01`) can: break a
  tie, ratify a quorum-short-but-majority claim, extend the window once, or veto a ratified claim that violates
  league rules (abuse, doxxing). Every such action writes an audit entry (who/when/why). The steward cannot
  silently *invent* canon — they can only adjudicate claims the league actually submitted/voted on.
- **canon** — ratified. Enters the AI's trusted fact set and the feed. Carries who ratified it and how
  (`verified` auto vs `vote` vs `steward`).
- **dispute / re-litigation (canon stays challengeable)** — any member may open a **dispute** on a canon entry
  (rivalries *should* get re-litigated). A dispute is itself a claim that **branches** from the disputed canon
  (`branch_of = <canon id>`, `relation = dispute`). It opens a new vote. Outcomes: dispute **fails** → original
  stays `canon` (now annotated "challenged & upheld"); dispute **succeeds** → original moves to `superseded` and
  the disputing claim becomes the new `canon`. History is **append-only**: nothing is deleted, the thread shows
  the full lineage (claim → counter → verdict) so the AI can narrate "they re-litigated the 2019 trade and the
  league flipped."
- **branching threads** — `relation` ∈ {`response`, `addendum`, `dispute`, `relitigation`}. A branch references
  its parent; the thread is the tree rooted at the first claim about a subject.
- **edits / withdraw** — a `pending` claim's author may edit body/subject before the first vote is cast; after
  voting starts, the body is **locked** (edits would invalidate votes) — corrections happen via an `addendum`
  branch. An author may **withdraw** their own `pending` claim (state `withdrawn`) before ratification; canon
  cannot be withdrawn, only disputed/superseded. Canon is never edited in place.

### Steward review surface
The `data_steward`/`commissioner` gets a league-scoped review surface (RLS-guarded, like the identity steward in
`specs/06`) listing: open votes, quorum-short-but-majority claims awaiting a tiebreak, and any flagged
(abuse/doxxing) claims. From it they can **ratify**, **reject**, **extend once**, **veto a ratified claim**, or
**flag** AI-instigated claims. Every action writes a `lore_event` (`steward_action`, with `reason`) and is
append-only. The steward adjudicates; they never author canon directly.

### Worked example (the headline flow)
"Settle it: biggest choker of the decade?" (Trash-Talker, `origin = ai`, `type = opinion`) opens in `vote` with
candidate subjects pre-seeded from `person`/H2H data → members vote over 7 days → affirm beats reject and clears
quorum → `lore.vote.close` ratifies (`state = canon`, `ratified_by = vote`) → the AI writes the verdict post
citing the new `canon.id`. A season later a member opens a `dispute` branch ("new evidence: the 2024 collapse")
→ new vote → it succeeds → the old canon goes `superseded`, the new one becomes `canon`, and the Narrator
mythologizes "the league re-litigated the choker title and it changed hands." The full lineage survives.

## AI integration (both directions — the soul, made functional)
### Direction 1 — AI **consumes** canon as fact (read contract)
The `specs/07` retrieval step gains a `LoreContext` inside the trusted `LeagueContext`, hard-filtered
`WHERE league_id = :id` + RLS. The contract the AI reads classifies every lore item into exactly one bucket:
- **`canon[]`** — ratified truths the AI **may assert as fact**, each tagged `provenance` ∈
  {`verified` (data-auto-confirmed), `vote` (league-ratified), `steward`}. The AI may state these plainly
  ("the league's worst trade, by a vote, was the 2019 Watson deal").
- **`pending[]`** — open claims/votes the AI may **reference as live debate but NOT assert as settled**
  ("the league is currently arguing whether…"). Never narrated as history.
- **`disputed[]`** — canon currently under challenge; the AI may note it's contested.
- **`refuted[]`** — auto-rejected verifiable claims (with the true value) the AI may use to correct/roast.
**Hard rule:** the AI **never asserts un-ratified league "history."** Anything not in `canon[]` must be hedged
("claims", "they say", "currently debated") or omitted. This is testable: feed a context with only `pending`
lore and assert the generated post does not state it as fact. Cross-league isolation from `specs/07` applies
unchanged — lore is league-scoped and a generation job for league A can only ever read league A's lore.

### Direction 2 — AI **instigates** lore (write path)
A persona (Trash-Talker/Commissioner per `specs/07`) can **open a claim/poll** as a structured pipeline output —
e.g. the Trash-Talker seeds *"Settle it: biggest choker of the decade?"* The instigation creates a real lore
claim of type `opinion`, `origin = ai`, attributed to the persona, in state `vote`, optionally pre-seeding
candidate subjects from `person`/H2H data. The same near-dup/persona-constraint checks from `specs/07` apply
(no abuse, no duplicate of an open poll). When the vote ratifies, the AI **writes the verdict** as a normal
post that cites the new `canon` entry ("The league has spoken: …"). AI-instigated claims follow the *identical*
lifecycle and governance as member claims — the AI gets no special ratification power; it only proposes and
narrates. `origin` ∈ {`member`, `ai`} is recorded for attribution and so a league can mute AI instigation.

## Data model (Drizzle, all league-scoped + RLS)
All tables carry `league_id` and declare a `pgPolicy` `USING/WITH CHECK league_id = current_league_id()` per
`AGENTS.md` (and `FORCE ROW LEVEL SECURITY` hand-added to the migration). Access goes through
`withLeagueContext()` (`src/db/rls.ts`). Money/score values use exact decimal types (no float drift).

- **`lore_claim`** — id, `league_id`, `type` (`data_verifiable` | `opinion`), `state` (`pending` | `vote` |
  `canon` | `disputed` | `rejected` | `superseded` | `withdrawn`), `verification` (`verified` | `refuted` |
  `unverifiable` | `n_a`), `origin` (`member` | `ai`), `author_member_id` (auth-plane member, nullable when AI),
  `author_persona` (nullable, set when `origin = ai`), `title`, `body`, `branch_of` (nullable → `lore_claim.id`),
  `relation` (`root` | `response` | `addendum` | `dispute` | `relitigation`), `thread_root_id`, `vote_opens_at`,
  `vote_closes_at`, `ratified_at`, `ratified_by` (`verified` | `vote` | `steward`), timestamps. Body is locked
  once the first vote exists.
- **`lore_subject`** — links a claim to what it's about: id, `league_id`, `claim_id`, `subject_type`
  (`person` | `rivalry` | `season` | `week` | `record`), and the reference (`person_id` / H2H pair / `season` /
  `week`). Many subjects per claim (a "worst trade" claim references two persons + a season).
- **`lore_verification`** — for data-verifiable claims: id, `league_id`, `claim_id`, `result`
  (`match` | `contradiction` | `uncheckable`), the **asserted value**, the **actual value** found in `specs/06`
  stats, and a pointer to the stat row(s) matched (`weekly_statistics`/`season_statistics`/`all_time_record` id).
  Deterministic and reproducible (same stats → same result).
- **`lore_vote`** — id, `league_id`, `claim_id`, `voter_member_id`, `choice` (`affirm` | `reject` | `abstain`),
  `created_at`, `updated_at`. **Unique `(league_id, claim_id, voter_member_id)`** — one vote per member per claim
  (changeable until window close).
- **`lore_event`** — append-only audit/log: id, `league_id`, `claim_id`, `kind` (`created` | `vote_opened` |
  `voted` | `ratified` | `rejected` | `disputed` | `superseded` | `steward_action` | `edited` | `withdrawn`),
  `actor_member_id` (nullable for AI/system), `before`/`after` snapshot, `reason`, `created_at`. Reject direct
  UPDATE/DELETE; allow FK cascade delete (`pg_trigger_depth() > 1`) per `AGENTS.md` append-only rule.

Canon read contract (`canon`/`pending`/`disputed`/`refuted` buckets) is a **view/query over `lore_claim`**
filtered by state + `verification`, not a separate table.

## Jobs (Inngest, idempotent, per `specs/01`)
- **On submit** of a data-verifiable claim → synchronous (or immediate job) verification against `specs/06`
  stats; resolves to `canon`/`rejected` with a `lore_verification` row. Idempotent on `claim_id`.
- **`lore.vote.close`** — scheduled at `vote_closes_at` (and a periodic sweep as backstop): tally votes, apply
  the quorum/threshold rule, transition `vote → canon | rejected`, write `lore_event`, emit realtime + (on canon)
  enqueue the AI verdict post. Idempotent: a claim transitions out of `vote` at most once.
- **`identity.changed` (from `specs/06`)** → re-run verification for affected data-verifiable claims (a merge/split
  can change whose record a claim matched); annotate, never silently flip canon without an event trail.
- **AI instigation** is a normal `specs/07` pipeline output that creates a `lore_claim` (`origin = ai`).

## Acceptance criteria (testable; mock LLM/stats fixtures, live Postgres)
1. **Claim → vote → canon.** An `opinion` claim opens a vote; with affirm > reject and quorum met at window
   close, `lore.vote.close` transitions it `vote → canon`, sets `ratified_by = vote` and `ratified_at`, and writes
   a `ratified` `lore_event`. Affirm ≤ reject (or quorum unmet with no steward action) → `rejected`.
2. **Quorum / apathy.** Fixture with many members and few votes: a claim with affirm strictly > reject but below
   quorum does **not** auto-ratify; non-voters/abstains are not counted as reject; the steward `ratify` action
   then moves it to `canon` with an audit entry.
3. **Data-verifiable auto-confirm.** A claim "scored 200.4 in Week 5, 2017" matching a `weekly_statistics`
   fixture row resolves **on submit** to `canon`, `verification = verified`, `ratified_by = verified`, **no
   `lore_vote` rows opened**, and `lore_verification` points at the matched stat row.
4. **Data-verifiable refute.** The same claim with a wrong value (`188.2` stored) resolves to `rejected`,
   `verification = refuted`, with the true value attached.
5. **Opinion requires vote.** An unverifiable/opinion claim never auto-confirms — it always enters `vote`.
6. **Dispute / re-litigation.** A `dispute` branch of a `canon` entry opens a new vote; on success the original
   becomes `superseded`, the disputing claim becomes `canon`, the thread lineage (`branch_of`/`thread_root_id`)
   is intact, and nothing is hard-deleted. On failure the original stays `canon`, annotated "challenged & upheld."
7. **AI canon-read contract.** Given a `LeagueContext` containing one `canon`, one `pending`, and one `refuted`
   lore item, the AI post asserts the `canon` item as fact, does **not** state the `pending` item as settled
   (hedged or omitted), and may cite the `refuted` correction. A context with only `pending` lore yields a post
   that asserts no league history as fact.
8. **AI instigation.** A persona instigation creates a real `lore_claim` (`origin = ai`, `type = opinion`,
   state `vote`, `author_persona` set) following the identical lifecycle; on ratification the AI verdict post
   cites the resulting `canon.id`. AI claims get no special ratification power (must still pass the vote).
9. **RLS isolation.** Lore claims/votes/subjects/verifications/events for league A under RLS return zero rows
   from league B (the `specs/02` isolation canary extends to every table here); a generation job for league A
   reads only league A's lore.
10. **Append-only audit.** Every state transition writes a `lore_event`; direct UPDATE/DELETE on `lore_event`
    is rejected while FK cascade delete from a league/user teardown succeeds.

## Dependencies / blocked-by
- **Needs** `specs/02` Foundation (Drizzle/RLS, `current_league_id()`, `withLeagueContext`, Inngest, roles incl.
  `data_steward`/`commissioner`), `specs/06` Stats/Identity (canonical `person`s + materialized stats to verify
  against and to subject claims on), and `specs/07` AI content (the retrieval step it plugs `LoreContext` into and
  the pipeline that instigates/writes verdicts).
- **Feeds** the AI blogger (canon as fact + instigation + verdicts), the league home/feed (claims/votes/canon as
  events), and realtime (claim/vote/ratify/dispute broadcasts).

## Non-goals
- No cross-league lore (lore is league-sandboxed; the arena handles cross-league competition).
- No free-form wiki editing of canon (canon changes only via dispute/supersede, never in-place edit).
- No reputation/karma scoring of voters, no real-money stakes on votes (play-money/arena is `specs/08`).
- No NLP "fact extraction" from the body for verification beyond the structured `lore_subject` references — the
  data-verifiable check is deterministic against `specs/06` stats, not a model guess.
- No UI design here (that's the home/feed views); this spec defines the mechanic, data, and outcomes.
