# Spec 33 — AI Cast, Lore & Onboarding Surfaces (the spectacle + the flows, in AUSPEX)

> Phase 5 UI/UX. WHAT the cast-presence, lore, and onboarding **surfaces** look and behave like in the AUSPEX visual
> language — not new mechanics. Read `DESIGN.md` (tokens/type/motion/signatures) FIRST, then this.
> Builds on the engines `specs/12` (AI cast/instigator), `specs/13` (lore mechanic), `specs/18` (lore UI structure),
> `specs/16` (onboarding completeness). Restyle + extend, never re-mechanic. Sibling specs: `28` foundations, `29`
> component library, `30` shell/nav, `31` editorial register, `32` feature surfaces. **AI voice/character tuning is the
> user's later step** — these surfaces must keep tone/persona-copy swappable (read from cards, never hardcoded).
> North-Star ethos throughout: **the league authors its own mythology**, and the cast is a media universe *about these
> specific people*. Mobile-first PWA → tablet → desktop; AA contrast, keyboard, focus, ≥44px, reduced-motion, live regions.

## 0. EXISTS vs NEW (do not rebuild)
- **NEW (net-new surfaces, this spec designs them):** the **cast presence** system — the orb-as-identity, persona
  cards/bylines/avatars, the cast "performing" surfaces (`.chat.ai` cast column/thread, insight/read cards), the
  **instigator UI** (seed-a-debate / run-a-poll / open-a-lore-claim / verdict column), the **poll vote widget**, and the
  **hosted-browser login FRAME** framing/states. No orb, persona-card, chat, or poll component exists in `src/app/**`
  today (only `press`/`news/articles` editorial pages and the lore + onboarding views below).
- **EXISTS — restyle to AUSPEX, keep behavior/routes/props:**
  - Lore views: `src/app/leagues/[leagueId]/lore/league-lore-view.tsx` (canon front + open-votes strip + subject filters),
    `…/lore/[claimId]/league-lore-claim-view.tsx` (claim, vote panel, thread tree, branch controls, steward controls),
    `…/lore/new/league-lore-submit-view.tsx`, `…/lore/steward/lore-steward-review-view.tsx`. Shapes from `@/lore/member-ui`
    (`LoreClaimCard`, `LoreVoteStatusSummary`, `LoreSectionData`, `LoreClaimDetailData`) — render from these unchanged.
  - Onboarding panels: `…/onboarding/{espn,sleeper,yahoo}/*-connect-panel.tsx`, `leaguemate-detection-callout.tsx`
    (`ImportLeaguemateSummary`), `reconnect-cta.tsx`, `return-to-invite-link.tsx`. The ESPN panel already renders the
    hosted-browser `<iframe src={liveViewUrl}>` and the `DiscoveredLeagueCandidate[]` inventory — restyle, add states.
  - Engine/data: `src/ai/personas.ts` (`AI_PERSONAS` = commissioner·analyst·narrator·trash_talker·beat_reporter·
    betting_advisor; `PersonaCardDefaults` has `name/beat/pointOfView/tone`), `src/ai/content-types.ts`
    (`InstigationColumnStructure`, `VerdictColumnStructure`, etc.), lore engine `src/lore/*`, `src/onboarding/*`.
- **Boundary:** this spec changes only presentation, states, a11y, and responsive layout. No new routes/tables/lifecycle
  except thin presentational additions noted as "NEW surface" (which still call existing services/routes).

## 1. The AUSPEX register for this spec (how these surfaces sit in the system)
Three registers coexist (per design doc §8/§9): the **HUD/data** register (orb, telemetry, vote tallies, charts), the
**editorial** register (`31` — the cast's published prose), and these **flow** surfaces (lore + onboarding). All share
tokens from `28`: `--void*` background under `.atmos.*` (starfield/scanline/grain/vignette), `.panel` glass + `--hair`
hairlines (never solid grey rules), `--bevel` chrome, lilac=interactive/AI, amber=value, jade=positive, coral=negative,
steel=secondary. Lore canon is a **calmer, lower-chrome ledger** (it borrows the editorial register's legibility); the
cast presence + instigator + poll widgets are **HUD-register** (telemetry, halos, the orb). Onboarding is a **steps
wizard** (`.steps`) over glass, mobile-first.

---

## PART A — THE AI CAST PRESENCE (the orb is the cast's living identity)

### A1. The orb as the cast's signature (NEW)
The conic-gradient **orb** (`.orb`/`.orb.think`, design §5) is the single visual anchor of the AI presence — it *is* the
cast. One orb component, four states, used everywhere the cast speaks or acts:
- **`idle`** — slow conic spin (lilac→steel→lilac), soft `--glow-lilac` halo. The cast is present, listening.
- **`think`** — faster spin + pulse, used while a piece/instigation/verdict is generating (maps to a pipeline run).
- **`speaking`** — a gentle amplitude ring while a cast item is the focus (article hero, verdict reveal).
- **`muted`** — desaturated, no spin: a league that has **muted AI instigation** (`origin=ai` suppressed per `specs/12`).
- **Per-persona tint:** the orb's conic stops shift subtly per persona so the same shape reads as a *different character*
  (Commissioner = steel-lilac authority, Trash-Talker = coral-warm, Analyst = cool steel, Narrator = deep lilac, Beat
  Reporter = amber-quick, Betting-Advisor = amber-steel). Tints come from `PersonaCardDefaults` mapping in `28`, **not**
  hardcoded per surface — so retuning a persona shifts every byline at once.
- **Sizes:** `orb-sm` (16–20px byline/avatar), `orb-md` (28–32px card header), `orb-lg` (44–64px hero/empty/think).
- **Reduced-motion:** all spin/pulse/amplitude collapse to a static tinted conic disc with a faint halo (no animation).
- **A11y:** decorative orb is `aria-hidden`; when it carries state meaning (think/muted) it pairs with text
  ("Generating…" / "AI muted") — never color/motion alone.

### A2. Persona cards, bylines & avatars (NEW; conic-orb avatar)
The cast is **six characters**, each rendered from its `PersonaCardDefaults` (name/beat/pointOfView/tone) — copy is
**read from the card, never literal in JSX**, so the user's later voice pass changes nothing here.
- **Persona avatar** = an `orb-sm`/`orb-md` with the persona tint + a tiny `.chip-glyph` beat icon (gavel/chart/quill/
  flame/mic/dice). No photographic faces — the orb *is* the face.
- **Byline** (used in The Press `31`, lore claims, insight cards, instigations): `[orb avatar] {persona.name} · {beat}`
  in `--head`/`--mono`, plus an **AI badge** (`.st` pill, lilac, `<Bot>` glyph) wherever `origin=ai` (mandatory per
  `specs/18`/`13` — already in lore views; standardize the badge token across all cast surfaces).
- **Persona card (full)** — a glass `.panel` dossier: orb avatar, name, beat, point-of-view one-liner, an enabled/muted
  `.switch`, and a sparkline of recent output cadence. Used in a league **"Cast" roster** view (NEW surface, read-only
  presentation of `ai_persona_cards`; tuning controls are gated/later but the surface exists). A disabled persona card
  reads `muted` orb + "Not performing in this league."
- **Tablet/desktop:** persona cards in a 2/3-up grid; **mobile:** single column, avatar-left compact rows.

### A3. The cast performing — chat/thread, insight & read cards (NEW)
The cast must feel **alive without being noisy**. Two performance surfaces, both HUD-register:
- **Cast column / thread (`.chat.ai`)** — a conic-orb-avatared message stream where the cast narrates/reacts inline (e.g.
  on a league-home "what the cast is saying" rail, or a thread under an event). Each turn: orb avatar + persona byline +
  the line + a timestamp `--mono`. Turns stream in with a **staged-process** reveal (orb `think`→`speaking`→settle). The
  column is **collapsible** and **rate-shaped**: a soft `--hair` separator, no badges screaming, at most one
  `think`-state orb visible at a time. On mobile it's a **tap-to-expand sheet** (like the WIRE ticker, design §9.1), not
  an always-open panel — quiet by default.
- **Insight / read cards (`.insight`)** — the cast's structured "reads": a power-ranking slot, a matchup edge, a villain
  crown, a rivalry note. Glass card, persona byline, a one-line `--head` claim, an optional `.spark`/`.gauge`/`.edge`
  data chip (lilac/amber/jade/coral by semantic), and a deep-link to the full piece in The Press (`31`) or to the lore
  claim. These are **read from existing `content_item`** (RLS-scoped), never fabricated client-side.
- **"Alive, not noisy" rules (testable):** (a) no auto-playing motion when the column/cards are off-screen; (b) a single
  global cast-activity indicator (one pulsing `orb-sm` in the shell, `30`) rather than per-card pulses; (c) new cast
  turns/cards announce **once** via a polite `aria-live` region with a digest ("The cast posted 2 new reads"), not
  per-item spam; (d) honor `prefers-reduced-motion` (no stream animation; items just appear).

### A4. The instigator UI (NEW — the soul made interactive)
The instigator is how the cast **pulls members into the show** (`specs/12` §3). It surfaces as a **provocation card** plus
its lifecycle. The cast *seeds*; members *act*; the cast writes the *verdict*. Four instigation kinds, one card shape:
- **Provocation card** (HUD glass): persona byline + AI badge, the `instigation_column` `lead` (the provocation), "the
  two sides," and a primary CTA that matches the kind:
  - **`settle_it_poll`** → **"Settle it"** → opens/links the **poll vote widget** (A5).
  - **`villain_crown`** → "Crown the villain" → links the crowned manager + grounding fact; CTA to affirm/dispute as lore.
  - **`manufactured_rivalry`** → "Make it a rivalry" → shows the H2H grounding chip; CTA to ratify as lore.
  - **`user_move_reaction`** → quotes the member's move (roster/bet) + the cast's needle; CTA to reply in the cast thread.
- Every provocation **cites ≥1 grounding ref** (a record/H2H/transaction) rendered as a `.tag`/`.edge` chip — no
  provocation from thin air (the engine's invariant, made visible).
- **Verdict column** — when a poll closes / lore canonizes, the **verdict_column** (`VerdictColumnStructure`) renders as a
  hero editorial card (Commissioner rules / Narrator mythologizes): the question → the league's vote → the ruling → the
  **new canon**, with a link to the canon claim page (`/lore/[claimId]`). Orb in `speaking` on reveal (count-up the tally).
- **Where it lives:** instigator provocations appear in the cast column (A3), on the lore canon front's "in the arena now"
  strip (the open-vote already there, `specs/18`), and as a Press story card. The **seed/run controls** (a steward or the
  cast triggering an instigation) are an authoring affordance gated to the appropriate role — present as a labeled
  control set ("Seed a debate / Run a poll / Open a lore claim") but never available to plain members.

### A5. The poll vote widget (NEW; shared with lore-vote, A-B aligned)
A single **vote widget** powers both instigator polls and lore opinion votes (the engine resolves a closed poll into an
opinion lore claim, `specs/12` §3 / `specs/13`). It renders **exactly the engine's rules** (`LoreVoteStatusSummary` /
poll shape) — nothing invented client-side:
- **Options/choices:** for a poll, the N options as `.radio`/segmented tappable rows; for a lore vote, `affirm/reject/
  abstain` (the EXISTING three-button grid). One vote per member; **re-castable until close** (shows current choice).
- **Threshold + quorum marker:** a horizontal **meter** with a **quorum tick** at `max(3, ceil(active·Q))` and a
  pass-line; the bar fills lilac (affirm) vs coral (reject), abstain shown neutral steel and **never as reject** (apathy
  must not read as veto — the `specs/13`/`18` invariant, visually enforced).
- **Live tally** — `--mono` tabular counts that **count-up** on update; a one-line read ("Passing if it closed now" /
  "Needs N more affirm to clear quorum and lead reject") straight from `voteRead`/`LoreVoteStatusSummary.affirmNeeded`.
- **Window** — a live **countdown** ("closes in 2d 4h") + open/close timestamps; after close the widget is **read-only**
  ("Voting closed") — never a broken page (maps `LORE_VOTE_CLOSED`/`LORE_CLAIM_NOT_OPEN`).
- **States:** open(votable) · open(read-only, my-vote-locked-after-close) · closed/resolved (shows outcome + provenance
  badge) · gated (free-tier locked-write, A-B `specs/18`) · offline (cached tally, vote queued/disabled with notice).
- **A11y:** the widget is a labeled group; tally + countdown updates announce via a polite `aria-live` (throttled, digest
  form — "Affirm 7, reject 3, closes in 2 days"); meter has `role="meter"` with `aria-valuenow/min/max` and a text equiv;
  every choice ≥44px; keyboard arrow-selectable; quorum tick has a text label not color-only.

---

## PART B — THE LORE MECHANIC UI (the league's official mythology) — restyle EXISTS + extend

### B1. Submit-a-claim — the two types (EXISTS: `league-lore-submit-view.tsx`)
The member **never picks the verification path** (`specs/18`); the system classifies. Restyle the existing form to AUSPEX:
- A glass `.panel` form: **title** (`--head`) + **body/statement** (`.textarea`) + optional **subjects** (pickers over
  canonical persons/rivalries/seasons — `.chips`, never free text), plus an optional **"Assert a fact"** disclosure that
  reveals the structured assertion pickers (stat source · metric · subject · asserted value). Opinion (no assertions) is
  framed **"the league will decide"**; the assert affordance is framed **"checked against the record."**
- **Result feedback (the moment, testable, 1:1 to `SubmitLoreClaimResult`):** a result panel with an orb `speaking` flash:
  - `vote` → "Posted. The league is voting (closes in N days)." (lilac)
  - `canonized` → "On the record — auto-confirmed canon." (jade, `.st` "verified" badge)
  - `rejected` → "Refuted: the actual value was {actual}." (coral, shows the true value)
- **States:** idle · validating · submitting(orb think, button loading) · the three results · error(inline coral panel,
  field-level) · gated(free-tier: form locked-write with a clear "viewing is free, canonizing is gated" state, server-
  enforced) · offline(submit disabled, "reconnect to post," draft preserved).

### B2. The vote widget on a claim (EXISTS: claim view vote panel) → adopt A5
The claim page's existing `affirm/reject/abstain` grid + threshold copy becomes the **shared vote widget (A5)** styled in
AUSPEX: the meter with quorum tick, count-up tally, live countdown, read-only-after-close. Keep all current behavior
(`castVote` → `LoreVoteCastResponse`, optimistic update, re-cast until close). The "no open vote" branch becomes a clean
read-only state, not a dead panel.

### B3. The canon record — the league's official mythology (EXISTS: `league-lore-view.tsx`)
The canon front is the **ledger** — calmer, lower-chrome (editorial-leaning register), not a HUD dashboard:
- **Front tiering** (already via `buildPublicationFront`): lead hero card → secondaries → river, each a Story Card (`31`)
  badged with **provenance** as a semantic `.st` pill — **verified** "on the record" (jade), **vote** "the league
  decided" (lilac), **steward** (steel). Subjects render as `.tag` chips linking to the subject-filtered view.
- **Status tiles** (canon / open votes / refuted counts) become AUSPEX `.stat` tiles with `--mono` LCD readouts.
- **"In the arena now"** open-votes strip uses the **vote widget** compact variant (A5) so participation is one tap from
  the front; AI-instigated claims show the persona byline + AI badge here.
- **Subject filters** = `.chips` nav (a person/rivalry/season) with the active chip marked (`aria-current`), so
  "everything canon about Person X" is reachable — the perennial choker's canon page.
- **Empty/gated:** "No canon yet — make the first claim" (inviting, orb-lg muted-then-idle); subject-empty "Clear the
  filter"; free-tier read-only with a locked-write banner. None ever a broken page.

### B4. Branch / dispute trees (EXISTS: claim view thread tree) → AUSPEX lineage
The **thread tree** (`buildThreadTree`, recursive `ThreadNodeView`) restyles as an **append-only lineage rail**: each
branch is a glass node indented under its parent along a lilac `--hair` connector, labeled by `relation`
(Original/Response/Addendum/Dispute/Re-litigation) as a `.tag`, with status + provenance `.st` pills. Lineage
annotations stay verbatim: **"Superseded by →"**, **"Challenged and upheld"**, **"Challenge open."** Nothing collapses —
the full claim→counter→verdict chain is visible (so the Narrator's "they re-litigated the 2019 trade and the league
flipped" is traceable on screen).
- **Mobile:** the tree is a left-rail-indented vertical stack with reduced indent depth (cap nesting visual to ~3 levels,
  deeper nodes get a "↳ in {parent}" affordance) so it never overflows a phone width.
- **A11y:** the tree is a `role="tree"`/`treeitem` (or nested list) with proper `aria-level`; the connector is decorative;
  relation/status are text, not color-only.

### B5. Challenge-from-canon flow (EXISTS: `BranchControls`)
Every **canon** entry offers **Challenge (dispute/re-litigation)** + **Add to this (response/addendum)** (existing branch
controls). Restyle to AUSPEX glass form. Challenge is **only offered on `canon`** (engine rejects `LORE_PARENT_NOT_CANON`
otherwise → surface as a clean inline coral error, never a broken page). On success the parent flips to `disputed`
(optimistic, already implemented) and a success panel links to the new branch. Addenda/responses available on any claim,
never displace canon. Steward controls (`StewardControls`: ratify/reject/extend/veto + required audited reason) restyle
as a role-gated `.panel`; non-stewards never see it (clean absence, not a disabled husk).

---

## PART C — THE ONBOARDING FLOWS (frictionless, mobile-first, the magical moment)

### C1. The wizard shell & provider pickers (EXISTS: connect panels) → `.steps`
Onboarding is a **steps wizard** (`.steps`, design §6/§8) over the void+atmosphere, mobile-first:
- **Steps:** Connect a provider → (hosted-browser frame, C2) → Discover leagues (C3) → Import → "We found your N
  leaguemates" (C4) → Invite (C5) → Claim-your-team (C6). The step rail is a top progress strip on mobile, a left
  `.steps` ladder on tablet/desktop; current/done/upcoming states with `aria-current="step"`.
- **Provider picker** — three glass cards (ESPN / Sleeper / Yahoo), each with provider badge (read from
  `getProviderBadgeLabel`, never branch on the string), a one-line "how it connects" (ESPN hosted-browser, Sleeper
  username, Yahoo OAuth), and a `connected/not-connected` `.st` pill. Connecting a **second** provider **appends** to the
  inventory (never replaces) — the picker stays visible so "connect once → all your leagues across all providers" is the
  obvious affordance (`specs/16` A).

### C2. The hosted-browser login FRAME (EXISTS: ESPN `<iframe src={liveViewUrl}>`) — its in-app framing & states
This is the trust-critical surface. Frame the embedded cloud-browser (`BrowserStartResult{sessionId,liveViewUrl,
expiresAt}`) inside an AUSPEX **bezel** so it reads as *part of Rumbledore*, not a raw popup:
- **Framing:** a `.bezel` chrome around the `<iframe>` with a title ("Secure ESPN login — hosted by Rumbledore"), a
  `--mono` session/expiry readout, and a reassurance line ("Your password never touches our servers; we capture only the
  session"). The frame fills width on mobile (min-height generous, scroll-safe), constrained card on desktop.
- **States (all required, testable):**
  - **idle/pre-start** — "Connect ESPN" CTA, no frame yet, explainer.
  - **starting** — orb `think` + skeleton frame while `…/browser/start` resolves.
  - **live/connecting** — the iframe shown; a live "session active, expires {countdown from expiresAt}" status; a
    **Capture** action (existing) once the user has logged in inside the frame.
  - **capturing** — orb `think`, button loading, frame dimmed.
  - **captured/success** — jade success state, orb `speaking`, "Connected — found your leagues" → advances to C3.
  - **expired** — the session window lapsed (`expiresAt` passed): coral state, frame replaced by "Session expired — start
    again," a one-tap restart. Never leave a dead iframe.
  - **error/unavailable** — hosted flow failed → reveal the **manual fallback** (existing SWID/espn_s2 paste form) framed
    as "only when the hosted flow is unavailable"; cookies are `type="password"`, never echoed/logged.
  - **offline** — cannot reach the session: "You're offline — reconnect to finish connecting," frame hidden, no spinner-
    forever.
- **Mock note (`specs/16`):** real Browserbase capture stays MOCKED; the frame must look/behave identically against
  `MockBrowserSession` (fixture `95050`) — the design is independent of the capture backend.
- **A11y:** the iframe has a meaningful `title`; status/expiry updates announce via `aria-live`; the frame is keyboard-
  reachable and never a focus trap; success/expired are announced as text, not color/motion only.

### C3. Multi-league discovery — "we found N of your leagues" (EXISTS: discovered inventory)
Restyle the existing `DiscoveredLeagueCandidate[]` inventory as a unified **"Your leagues"** list aggregating **every
connected provider** (not one screen per provider, `specs/16` A):
- Each row: league name (`--head`), provider badge `.tag`, season · size · teamName, and an `imported` jade check or an
  **Import** action; recommended (current-season FFL) rows pre-selected (`isRecommendedImport`). A header "{N} leagues
  found across connected providers" + **multi-select import** (bulk) + **Refresh** (re-discovery).
- A `reconnect`-blocked row shows a coral "reconnect" CTA (existing `ReconnectActionLink`) instead of Import — never a
  broken import button.
- **States:** discovering(skeleton rows) · found(N) · **no-leagues**("No fantasy football leagues found on this account —
  try another provider or the manual fallback") · partial(some imported) · importing(per-row + bulk loading) ·
  error(inline) · offline(cached inventory, import disabled with notice). Imported rows deep-link to the league home.

### C4. Leaguemate detection — "we found your N leaguemates" (EXISTS: `leaguemate-detection-callout.tsx`)
Restyle the existing callout (`ImportLeaguemateSummary`) as the **viral moment**:
- "We found your {N} leaguemates" headline (orb `speaking`), then the roster of OTHER members (non-self, non-claimed —
  already filtered by `listLeaguemateInviteTargets`), each with display name, team name(s), and a **suggested channel**
  chip (`email` only when an email truly exists, else `sms`/`share` — the no-emails reality, `specs/16` B). A steward
  "data review items" link when identity resolution flagged ambiguity (deep-links to `specs/14` §E, never mutates here).
- **States:** detecting · found(N roster) · none("You're the only one imported so far — invite the rest") · post-invite
  (sent/accepted reflected per target).

### C5. Invite via SMS / copy-link (EXISTS: invite service `src/onboarding/invites.ts`)
Bulk-capable, **share-link + SMS primary, email present-only** (`specs/16` B). A **per-leaguemate channel chooser**:
- **Share link** (primary, offline, zero external service): generate `/invite/{leagueId}/{token}` → a **copy-link** chip
  with a copy-to-clipboard affordance + "drop this in your league group chat." Generating is instant and works offline.
- **SMS** (primary): inviter enters the leaguemate's phone (normalized, hinted `***1234`, **never cleartext** — hashed
  `target_hash`/`target_hint`); sends via `Notifier` (mock-recorded). Number field `inputMode="tel"`.
- **Email** (fallback): only offered when an email exists; prefilled or inviter-typed; no "we'll email them" affordance
  ever shown for a member with no email (the invariant, visually enforced).
- A general **league share link** for the group-chat drop coexists with per-target tokens. Re-invite is idempotent
  (upsert); accepted targets flip off active links (existing behavior). Per-target status pill: not-invited / link-copied
  / sms-sent / accepted.
- **States:** ready · link-generating · copied(jade flash + `aria-live` "Link copied") · sms-sending · sms-sent(recorded)
  · email-sending · sent · error · offline(share-link still works; SMS/email queued/disabled with notice).
- **A11y:** copy-success and send-success announce via `aria-live`; channel chooser is a labeled radio group ≥44px.

### C6. Claim-your-team — the activation hook (EXISTS: `/invite/[leagueId]/[token]`, `acceptLeagueInvite`)
The magical moment: the invitee lands on **a show already about them** (`specs/16` C/D).
- **Pre-auth landing** — the public invite landing shows, before sign-in: league name + season, the invitee's display
  name, and **their team name(s)** — "You're {Manager}, the {Team}. Your league is on Rumbledore." Glass hero, orb
  `speaking`, no chrome overload. Expired/canceled/already-claimed → clean not-found (no leak), never a stack trace.
- **Sign-up → claim** — after auth, accepting maps the user to the imported provider-member + team (one
  `league_member_identity_claims` row), joins the league, flips the invite. **Targeted link** pre-fills the team;
  **open/group-chat link** presents the still-**unclaimed** teams as a picker (same conflict guards). A second user
  claiming a taken member → clean `CLAIM_CONFLICT` (409) inline message, no partial state.
- **The activation payload** — on claim, the league home immediately renders **their** team: standings slot, current
  matchup, season record, all-time record/record-book entries (post-history), plus a **"the cast has been covering your
  league"** teaser — ≥1 existing `content_item` (RLS-scoped) referencing the claimer's team rendered as an **insight card
  (A3)** with the cast byline; deterministic fallback to the league's latest headline when none references them yet.
  Content is **read, never fabricated at claim time.**
- **States:** valid-token(preview) · expired/canceled/claimed-by-another(clean not-found) · signing-up · claiming(orb
  think) · claimed(success → activation payload) · conflict(409 inline) · offline.

---

## D. Cross-cutting MANDATES (apply to every surface above)

### D1. Responsive (mobile / tablet / desktop)
- **Mobile-first PWA:** single-column; cast column + WIRE-style strips are **tap-to-expand sheets**, not always-open
  panels; lore thread tree caps visual nesting; onboarding `.steps` is a top progress strip; provider/persona cards
  stack; the hosted-browser frame fills width. Bottom-tab shell (`30`) hosts Lore as a league section; the global cast
  orb lives in the mobile header.
- **Tablet:** 2-up persona/provider/league grids; cast column may dock as a side rail; `.steps` as a left ladder.
- **Desktop:** persona-card grid 3-up; cast column docked rail; lore lineage with full indent; vote widget + verdict side
  by side; the hosted-browser frame a constrained card with the explainer beside it.

### D2. Universal states (every surface, no exceptions)
loading/skeleton · empty(inviting, never blank) · error(inline human-readable from `AppError`, never stack/blank) ·
**offline (PWA)**(cached-read where possible, writes disabled with a clear notice, never spinner-forever) · gated
(entitlement free-tier: lore viewing free, canonizing-writes gated, server-enforced; premium/upgrade CTA, never a broken
page). Onboarding adds: connecting · captured · **expired** · no-leagues · conflict. Map guard failures to states:
401→"Sign in required", 403(non-member)→"No league access", 403(non-steward)→read-only, 404/`INVALID_LEAGUE_ID`→not-found.

### D3. Accessibility (AA, all three breakpoints)
- **Live regions:** cast turns/cards announce as a polite, **throttled digest** (not per-item spam); vote/poll tally +
  countdown announce via polite `aria-live` (debounced) with a text summary; copy/send/connect successes announce once.
  Assertive only for errors that block (expired session, conflict).
- **Keyboard:** every interactive element reachable + operable; vote choices arrow-selectable; thread tree is a proper
  tree/list with `aria-level`; the hosted-browser iframe is reachable and **not** a focus trap; visible focus-bloom on
  all controls.
- **Contrast:** AA for all text incl. `--mono` LCD readouts and `.st`/`.tag` pills against glass; meaning never by color
  alone (provenance/status/relation/quorum all carry text labels + glyphs).
- **Targets:** ≥44px touch for all controls (vote choices, channel chips, import checkboxes, copy buttons, step nav).
- **Reduced-motion:** orb spin/pulse/amplitude, count-up, draw-in, staged stream, marquee, focus-bloom all collapse to
  static; no information conveyed only by motion.

## E. Acceptance criteria (testable — flows/states/a11y/responsive, not visual taste)
1. **Orb identity.** A single orb component renders idle/think/speaking/muted with per-persona tint sourced from persona
   cards (not hardcoded per surface); reduced-motion yields a static tinted disc; the orb is `aria-hidden` when decorative
   and paired with text when stateful (think/muted).
2. **Cast bylines/AI badge.** Every `origin=ai` surface (Press byline, lore claim, insight card, instigation, verdict)
   shows the persona orb avatar + name + beat + the standardized AI badge; persona copy is read from the card (swapping a
   card's name/tone changes every byline with no JSX change).
3. **Alive-not-noisy.** The cast column is collapsed/sheet by default on mobile; no off-screen autoplay; new cast items
   announce once as a polite digest, not per-item; a muted-AI league shows the `muted` orb and no instigations.
4. **Instigator → poll → verdict.** A provocation card renders per kind with ≥1 grounding chip and the matching CTA; the
   poll opens the shared vote widget; on close the verdict_column renders with the tally and a link to `/lore/[claimId]`.
5. **Vote widget (shared).** Renders engine rules verbatim: quorum tick at `max(3,ceil(active·Q))`, affirm-vs-reject
   meter, abstain never shown as reject, count-up tally, live countdown, read-only after close (`LORE_VOTE_CLOSED` not a
   broken page); `role="meter"` + text equivalents; choices ≥44px and keyboard-operable; tally updates announce politely.
6. **Lore submit results.** The three `SubmitLoreClaimResult` discriminants map 1:1 to vote / on-the-record / refuted(+true
   value) feedback; gated free-tier shows server-enforced locked-write, not a client-only hint.
7. **Canon + lineage.** Canon front tiers as Story Cards with provenance pills (verified/vote/steward), subject-filter
   chips, an open-votes strip using the vote widget; the thread tree renders append-only lineage with relation labels and
   "superseded by"/"challenged & upheld" annotations, caps nesting on mobile, and exposes a tree/list a11y role.
8. **Challenge-from-canon.** Challenge offered only on canon; a non-canon attempt surfaces `LORE_PARENT_NOT_CANON` as a
   clean inline error; on success the parent flips to disputed and links the new branch; non-stewards never see steward
   controls.
9. **Hosted-browser frame states.** idle/starting/live/capturing/captured/expired/error/offline each render distinctly;
   expired replaces a dead iframe with a restart; error reveals the manual fallback; cookies never echoed/logged; behaves
   identically on `MockBrowserSession` (`95050`); iframe titled, keyboard-reachable, not a focus trap; status announced.
10. **Multi-provider discovery.** "Your leagues" aggregates every connected provider in one list; recommended FFL
    pre-selected; multi-select + bulk import; no-leagues / reconnect-blocked / importing / offline states render cleanly;
    no domain code branches on the provider string (reads badge/shape).
11. **Leaguemate + invite.** "We found your N leaguemates" lists every non-self/non-claimed member with a suggested
    channel that is `email` only when an email exists; share-link generates offline + copy-announces; SMS hits
    `Notifier.sendSms` (recorded); email only when supplied; phone/email hashed+hinted, never cleartext; per-target status
    reflects link-copied/sms-sent/accepted.
12. **Claim-your-team activation.** Valid token previews the correct team pre-auth; claim maps to the imported member/team
    and renders the team + ≥1 existing cast insight card (RLS-scoped; deterministic fallback when none); expired/claimed-
    by-another → clean not-found; second claimant → `CLAIM_CONFLICT` inline.
13. **Universal a11y/responsive/states.** Every surface passes AA contrast, ≥44px targets, keyboard, reduced-motion, and
    renders all required states (loading/empty/error/offline/gated; onboarding connecting/captured/expired/no-leagues) at
    mobile/tablet/desktop with no broken/blank pages.

## F. Dependencies / non-goals
- **Depends on** `specs/28` (tokens/orb/atmosphere/`.steps`/`.chat`/`.insight`/`.st`/charts), `29` (component library inc.
  the orb, vote/meter, story card), `30` (shell/nav: Lore section, global cast orb, sheets), `31` (editorial register for
  canon/verdict/insight prose), `32` (entitlement/gated patterns) — and the engines `specs/12`/`13`/`16`/`18` (consumed,
  never re-mechaniced).
- **Non-goals:** AI **voice/character tuning** and final persona wording (the user's later human-paired step — keep all
  copy card-sourced and swappable); new lore mechanics/tables/lifecycle; new providers or new connect flows; real
  Browserbase/Twilio/Resend (mocks only); cross-league lore/data on any league surface; final pixel taste, motion easing,
  and copy voice (the later human UI pass — this spec fixes structure, states, flows, a11y, and the AUSPEX register).
