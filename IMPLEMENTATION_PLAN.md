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
- [ ] Build the vote experience surfacing threshold, vote window, tally, and steward tiebreak. (specs/18)
- [ ] Build canon and branch/dispute browsing reusing the publication card/section patterns. (specs/18)
- [ ] Build the challenge/branch flow and surface the cast's instigated claims and cited canon. (specs/18)

## Icebox (value-ranked; the build auto-hardens ×10 after Scope)
Carried forward from Phase 1 — **re-verify each before acting** ("don't assume not implemented"); some may already be fixed by the Phase 1 harden pass.
- [ ] **[security/MED] Invite tokens stored plaintext at rest** — store `sha256(token)`, look up by hash. `src/db/schema.ts` (league_invites) + `src/onboarding/invites.ts`. (Phase 2 onboarding area.)
- [ ] **[correctness/MED] Current sync can downgrade finalized matchups** — preserve `final` over transient provider re-reads returning scheduled/in-progress. `src/ingestion/current-league.ts`.
- [ ] **[correctness/LOW] Lore vote close can run before `vote_closes_at`** — `closeLoreVote()` will tally an open vote early if called directly; guard on the close time.
- [ ] **[correctness/LOW] Publication section/tag filters are candidate-limited in memory** — `src/news/hub.ts` / `src/news/league-feed.ts` fetch a bounded candidate set before filtering, so sparse old beats can vanish as archives grow.
- [ ] **[observability/LOW] Historical import progress is not published to realtime** — onboarding can't subscribe to a live history-build channel yet (relevant to the Phase 2 onboarding activation hook).
- [ ] **[maintainability/LOW] Press route param doubles as section slug and article id** — `/leagues/[leagueId]/press/[postId]`; split routes or use a neutral slug.

## Discoveries / bugs (loop appends here)
- [ ] **[correctness/MED] Bankroll rollover has no production scheduler** — `rolloverBankrollWeek()` is covered in domain tests but no Inngest/cron caller opens/closes weekly rows or triggers arena rebuilds.
- [ ] **[product/MED] Spec says first bet opens the bankroll week, but placement requires an existing open week** — decide whether to implement first-bet week opening or adjust the spec/copy consistently.
- [ ] **[product/LOW] Invite auth return path does not preserve the claim URL** — unauthenticated invite previews send users to provider onboarding without an explicit return-to continuation back to the invite after sign-in/sign-up.
- [ ] **[maintainability/LOW] Activation cast matching is text-search based** — generated league posts do not persist structured team/person subject ids, so activation uses title/summary/body/metadata search before falling back to the latest headline.
- [ ] **[product/MED] Steward review UI lacks advanced identity correction forms** — the doorway now supports rerun, mark-reviewed, and confirming fuzzy links, but merge/split/rename/reassign-to-new-person remain API-backed without full in-app forms.
