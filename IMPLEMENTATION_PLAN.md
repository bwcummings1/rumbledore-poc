# IMPLEMENTATION_PLAN.md — Phase 2: Competition, Onboarding & Entitlements

Disposable, loop-maintained backlog. The loop works `## Scope` until none unblocked + gates green (writes `.loop/SCOPE_DONE`), then auto-runs the value-ranked `## Icebox` ×10 (`PROMPT_harden.md`), then stops at the review checkpoint.
One task = one sentence, no "and". **Build toward `docs/NORTH-STAR.md` — embed the ethos in every task** (the league-vs-league reframe; the cast narrates the rivalry; onboarding is viral). Phase 1 (spectacle core) is complete; its record is in git history + `docs/PROGRESS.md §8`. Specs of record: `specs/15` (competition/arena), `specs/16` (onboarding), `specs/17` (entitlements).

## Scope — Phase 2

### F. Competition & arena (see specs/15)
- [x] Build the browse-and-bet sportsbook board over the mocked odds (markets list). (specs/15)
- [x] Build the bet slip for singles and parlays with odds locked at placement and stake validation. (specs/15)
- [x] Surface the weekly rolling-minimum bankroll loop (this-week balance, win/lose, reset/carryover). (specs/15)
- [x] Add market depth (moneyline/spread/total plus a player-props framework) over mocks. (specs/15)
- [x] Build the Arena with league-vs-league and individual leaderboards, seasons, and rank movement. (specs/15)
- [x] Add league head-to-head and rivalry framing to the Arena. (specs/15)
- [x] Wire settlement notifications and standings-swing signals. (specs/15)
- [x] Add the arena_recap AI content type so the cast narrates the betting rivalry. (specs/15, specs/12)

### G. Onboarding completeness (see specs/16)
- [x] Implement multi-league discovery: connect once, discover all the user's leagues across ESPN/Sleeper/Yahoo. (specs/16)
- [x] Implement leaguemate detection from imported members and the "we found your N leaguemates" surface. (specs/16)
- [x] Implement SMS and copy-link invites as the primary path, with email only where an address exists (mock delivery). (specs/16)
- [x] Implement the claim-your-team invitee flow mapping the user to an imported provider-member. (specs/16)
- [x] Implement the activation hook (their team and records waiting; the cast already wrote about them). (specs/16)
- [x] Complete the data-steward cleaning doorway per specs/14 §E. (specs/16)

### H. Entitlements (see specs/17)
- [x] Build the entitlement model: FREE and PREMIUM league tiers plus an INDIVIDUAL tier, per-league and per-user. (specs/17)
- [x] Implement the injectable `resolveEntitlement` resolver with a dev override. (specs/17)
- [x] Gate AI content generation and cadence behind premium, failing gracefully into an upgrade state. (specs/17)
- [x] Gate the individual personal-agent feature behind the individual tier. (specs/17)
- [x] Implement configurable caps (posts/week, leagues) plus an admin grant path. (specs/17)

### I. Lore member experience (see specs/18)
- [x] Build the lore section in the league IA with the submit-claim entry for both lore types. (specs/18)
- [x] Build the vote experience surfacing threshold, vote window, tally, and steward tiebreak. (specs/18)
- [x] Build canon and branch/dispute browsing reusing the publication card/section patterns. (specs/18)
- [x] Build the challenge/branch flow and surface the cast's instigated claims and cited canon. (specs/18)

## Icebox (value-ranked; the build auto-hardens ×10 after Scope)
Carried forward from Phase 1 — **re-verify each before acting** ("don't assume not implemented"); some may already be fixed by the Phase 1 harden pass.
- [x] **[security/MED] Invite tokens stored plaintext at rest** — store `sha256(token)`, look up by hash. `src/db/schema.ts` (league_invites) + `src/onboarding/invites.ts`. (Verified already fixed by `token_hash`, migration `0033_hash_invite_tokens.sql`, and invite tests.)
- [x] **[correctness/MED] Current sync can downgrade finalized matchups** — preserve `final` over transient provider re-reads returning scheduled/in-progress. `src/ingestion/current-league.ts`. (Verified already fixed by matchup upsert guard and regression tests.)
- [x] **[correctness/LOW] Lore vote close can run before `vote_closes_at`** — fixed by guarding `closeLoreVote()` against pre-deadline close-outs and proving early attempts leave the claim open.
- [x] **[correctness/LOW] Publication section/tag filters are candidate-limited in memory** — fixed by paging through the full candidate set when section/tag filters are active, preserving sparse older beats without changing the default front window.
- [x] **[observability/LOW] Historical import progress is not published to realtime** — fixed by adding the league `history` realtime channel, typed `history.import.progress` payloads, best-effort checkpoint progress publishing from historical imports, production job wiring, and publisher/grant/import regressions.
- [ ] **[maintainability/LOW] Press route param doubles as section slug and article id** — `/leagues/[leagueId]/press/[postId]`; split routes or use a neutral slug.

## Discoveries / bugs (loop appends here)
- [ ] **[correctness/MED] Bankroll rollover has no production scheduler** — `rolloverBankrollWeek()` is covered in domain tests but no Inngest/cron caller opens/closes weekly rows or triggers arena rebuilds.
- [x] **[product/MED] Spec says first bet opens the bankroll week, but placement requires an existing open week** — fixed by atomically opening the current Monday-UTC bankroll week during placement when no active week exists, and by letting the Bet surface submit the first slip against the floor.
- [ ] **[product/LOW] Invite auth return path does not preserve the claim URL** — unauthenticated invite previews send users to provider onboarding without an explicit return-to continuation back to the invite after sign-in/sign-up.
- [ ] **[maintainability/LOW] Activation cast matching is text-search based** — generated league posts do not persist structured team/person subject ids, so activation uses title/summary/body/metadata search before falling back to the latest headline.
- [ ] **[product/MED] Steward review UI lacks advanced identity correction forms** — the doorway now supports rerun, mark-reviewed, and confirming fuzzy links, but merge/split/rename/reassign-to-new-person remain API-backed without full in-app forms.
- [x] **[correctness/MED] Member-submitted lore votes are not scheduled for automatic close-out** — `lore.vote.close` exists, but `submitLoreClaim()`/the POST claim route do not enqueue it when an opinion claim opens a vote. Fixed by scheduling `lore.vote.close` from the submit route when Inngest is configured.
- [x] **[product/LOW] AI canon citation metadata is inferred from exact title/statement matches** — fixed by exposing canon claim IDs in the AI prompt contract, accepting validated `citedCanonClaimIds` from generated drafts, and persisting citation metadata even when canon is paraphrased.
- [ ] **[correctness/MED] Lore vote extensions do not enqueue replacement close events** — if a steward extends a vote after its original close event was scheduled, the extended window needs a fresh `lore.vote.close` event.
- [ ] **[correctness/LOW] Default publication fronts are still candidate-window ranked** — unfiltered central/league fronts rank only the recent bounded candidate window, so very old high-importance stories will not lead without a future DB-backed ranking/indexing strategy.
- [ ] **[product/LOW] Onboarding pages do not render historical import progress yet** — the realtime `history.import.progress` substrate now exists, but the onboarding inventory API/page state still needs checkpoint fields or a small progress component to show it.

## Harden shortlist
1. [x] **Invite tokens stored plaintext at rest** — security/isolation risk: leaked invite rows are reusable bearer tokens, so hashing materially reduces credential blast radius. Verified already fixed.
2. [x] **Current sync can downgrade finalized matchups** — correctness risk: transient provider states can corrupt settled/final league history and downstream records. Verified already fixed.
3. [x] **Member-submitted lore votes are not scheduled for automatic close-out** — functionality risk: votes can remain pending indefinitely without manual intervention.
4. [x] **Bankroll rollover has no production scheduler** — functionality risk: weekly betting balances and arena standings can stale without an automated rollover path. Fixed by the scheduled `bankroll-rollover` Inngest job, which skips weeks with pending slips, opens the next bankroll week, rebuilds arena standings, and publishes realtime leaderboard updates.
5. [x] **First bet requires an existing open bankroll week** — functionality/product risk: the intended first-bet flow can fail for leagues without pre-created weeks. Fixed by first-bet auto-opening plus regression coverage; settlement/rollover arena rebuilds are now scoped to affected seasons discovered during validation.
6. [x] **Lore vote close can run before `vote_closes_at`** — correctness risk: direct callers can finalize votes before their announced window ends. Fixed by returning `LORE_VOTE_STILL_OPEN` before tally/mutation until the voting deadline is reached.
7. [x] **Publication section/tag filters are candidate-limited in memory** — correctness/scale risk: sparse sections can disappear as archives grow. Fixed by full candidate pagination only when section/tag filters are active, with central and league Press regressions for matches buried beyond the first 100 candidates.
8. [x] **Invite auth return path does not preserve the claim URL** — robustness risk: unauthenticated invitees can lose the claim context after auth. Fixed by carrying sanitized local `returnTo` paths from invite previews into provider onboarding, preserving them through Yahoo OAuth, and surfacing return-to-invite continuation links.
9. [x] **Historical import progress is not published to realtime** — robustness/UX risk: long onboarding history builds lack live progress feedback. Fixed by publishing `history.import.progress` events on a member-scoped league history channel from each durable checkpoint transition.
10. [x] **AI canon citation metadata is inferred from exact title/statement matches** — fixed by carrying structured canon claim IDs through LLM output validation and article metadata, with paraphrase and non-canon rejection coverage.
