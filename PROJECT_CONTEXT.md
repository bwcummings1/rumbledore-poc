# Rumbledore v2 — Project Context (maintainer intent, recorded)

> **This file is an execution source of truth.** It records the maintainer's stated intent, goals, and
> rulings so future agents do not re-ask settled questions. Read it together with
> `REPO-ANALYSIS/CLAUDE-Codebase-Deep-Dive-Analysis-2026-07-24-v1.md` (what the code *is*) and
> `REPO-ANALYSIS/CLAUDE-Analysis-and-Improvement-2026-07-24-v1.md` (what to change).
> The code is authoritative on current behavior; this file is authoritative on intent.

---

## 1. Snapshot & provenance

- **Pinned to:** `e28265de724a757aa0d2249c810fd51c1baeef8a` (2026-07-28), `main` == `origin/main`, CI green.
- **Interviewed:** 2026-07-27 → 2026-07-28. **Answered by:** the project owner/maintainer (`bwcummings1`).
- **Rounds:** 5. **Questions:** 38 asked · 34 answered · 4 parked (§9).
- **Interviewer:** Claude (Fable 5) via Claude Code, from the two 2026-07-24 analysis artifacts plus an
  independent verification round (that round's findings are §7 of the improvement backlog).
- **Key source added mid-interview:** `docs/archive/GEMINI-3.5-PRO-DISCUSSION.md`, pushed to origin
  2026-07-27, which redefines the competition layer. Validated in §7.4 below.

---

## 2. Mission & users

**What this is (confirmed):** a **widely available, scalable commercial product** — a multi-tenant,
mobile-first fantasy-football companion platform. Leagues connect their provider data (ESPN, Sleeper,
Yahoo), the platform organizes and maintains it, and an AI cast produces league-specific content on top
of it. A cross-league prediction competition ties leagues together.

**Who it serves:** fantasy-football leagues as the unit of adoption — a commissioner connects the league
and members join by invite. Not individuals in isolation; the league is the customer.

> **Correction on record (Q1).** The interviewer initially hypothesized this was primarily for the
> maintainer's own league. That was wrong and the maintainer pushed back: the Yahoo and Sleeper adapters,
> the central news hub, and the inter-league arena are unambiguous multi-tenant signals. ESPN league 95050
> was the **test fixture** for validating login and data extraction, never the target market.
> **Future agents: this is a commercial product. Do not infer otherwise from the single validated league.**

**What winning looks like (maintainer's words):** *"everything functioning optimally across leagues.
The structure should ensure that if everything works for one league, then it should work for others."*
Winning is correctness that generalizes — per-league correctness is table stakes, cross-league
consistency is the goal.

---

## 3. Goals & priorities

### 3.1 Standing intents

1. **Full, optimal implementation.** Build every feature production-grade. Do not descope, stage, or
   simplify a design because it looks like a lot of work.
2. **Generalization over one-off correctness.** A feature is done when it works for any league, not the
   test league.
3. **Real commercial product.** The explicit horizon includes App Store submission after hardening and
   security work. Build accordingly.
4. **Testability without compromise.** Conveniences that make the maintainer's own testing easier are
   welcome, but never at the cost of production quality.

### 3.2 Commercial model (confirmed, Q25/Q30/Q31)

Two **independent** billing axes:

| Axis | Tier | Contents |
|---|---|---|
| **League** | $40 / year (base) | Data ingestion, organization, record book, storage + maintenance. **No AI.** |
| **League** | + League AI features | Monthly or annual (annual discounted). Pricing TBD — gated on measuring real cost. |
| **User** | + Personal assistant | Monthly or annual. Bought by the individual. |

**The bifurcation that matters:** a member of a league that pays for league AI features gets those
features through the league — that does **not** grant them the personal assistant, which is purchased
separately per user. Entitlements must model these as two independent axes, not one ladder.

**Consequence:** AI tier pricing is blocked on cost measurement, which makes `ai_usage_event.costMicrosUsd`
load-bearing. See §7.3.

### 3.3 The competition layer (redefined, Q11/Q20/Q21/Q24/Q34)

The bankroll sportsbook specified in `specs/08-betting.md` and `specs/15-competition-arena.md` is
**replaced** by an inter-league **Pick 'em** model:

- Each verified user gets a fixed weekly pick allowance (`MAX_PICKS_PER_USER = 10`, easily tunable).
- Picks are binary selections over the **full Odds API surface** — game lines, totals, player props. Do
  not curate or restrict the pick universe; breadth is both the engagement driver and the anti-syndicate
  defense.
- **Absolute-denominator scoring:** a league's accuracy is `correct_picks / (roster_size × MAX_PICKS)`.
  An unsubmitted pick is mathematically identical to a wrong pick. This normalizes league size, so a
  10-person and a 12-person league compete on equal terms with no tiering.
- Roster size is **snapshotted at the start of each week** so leagues cannot shrink their denominator by
  cutting inactive members mid-week.
- **90% weekly participation floor** gates eligibility for any weekly prize; annual accuracy is recorded
  regardless of participation.
- **Pushes are void** — they count toward neither numerator nor that user's denominator (§7.4).
- Accuracy stored as `DECIMAL(6,4)`; ties split the prize evenly.

### 3.4 Prize handling (Q21)

Build the **full architecture** as if the prize exists; ship season one **without** activating it.
Rationale in the maintainer's words: *"build it fully out. But if we determine it becomes more of a hassle
in the first year to include this, then we can choose to keep it purely competitive leaderboard bragging
rights. But at least we will have the infrastructure and architecture and logic in place."*

This is **not** a deferral of the feature — the maintainer expects to activate it well before a full season
elapses and considers it a significant draw.

**Engineering rule that follows:** collect compliance-relevant data from the first signup even while
unenforced — `geo_state`, `phone_verified`, tier on every user; keep `league_accuracy` computed
independently of `is_eligible_for_weekly_prize`. Columns are cheap to add later; retroactively asking
existing users to verify a phone number is not.

### 3.5 Providers (Q27)

**All three ship this season: ESPN, Sleeper, Yahoo.** Yahoo is explicitly in scope — it is not deferred.
Current readiness in §7.2.

---

## 4. Non-goals & sacred cows

- **No "Basic Sync" free tier.** (Q37) It exists in the Gemini discussion purely as a legal instrument to
  break the sweepstakes consideration prong. It is a Gemini artifact produced without access to the
  project. The maintainer's objections stand: nobody wants a league without their leaguemates, it means
  storing arbitrary free league data indefinitely, and its user-facing utility is unclear.
  **Do not build it.** If a prize is activated later, a free-entry form is a far cheaper AMOE than free
  league sync — see the parked question in §9.
- **No bankroll, stakes, wagers, parlays, or payouts.** Removed with the Pick 'em rewrite. Beyond the
  product decision, the compliance guidance is explicit: user-facing mechanics must never use the words
  *wager*, *bankroll*, *bet*, or *odds* — it is strictly a "Pick 'em."
- **Do not descope on perceived timeline.** Recorded verbatim because it was raised twice:
  *"quit focusing on time because you're using it to split decision making"* and *"we're not just gonna
  half-ass this because of your false simulatory development timelines."* Scale by parallelizing agents,
  not by cutting scope. For calibration: the ESPN and Sleeper decoding dictionaries were each built in
  a few hours.
- **Lore is not a fact store.** See §7.5 — it is ambient background, deliberately not a citable corpus.

---

## 5. Constraints & working agreements

- **Autonomy (Q7, Q29):** the maintainer will supply planning instructions; the agent chooses the
  execution pattern (orchestration vs. direct). Backlog is **adopt-all**, with the agent owning the
  sequence — **but the sequence requires maintainer greenlight before execution begins.**
- **Git:** `main` and `origin/main` must stay in sync. The 2026-07-24 → 07-28 divergence was explicitly
  called out as confusing and is not to recur. Push after green gates.
  - *Process note:* a push was rejected during this interview because the agent trusted a two-hour-old
    `git fetch`. **Always re-fetch immediately before a push decision.**
- **History preservation:** prefer merge over rebase when published documents cite commit SHAs.
- **Risk appetite (Q10):** multi-tenant boundary bugs are ship blockers, not hardening niceties. Security
  posture is "full production application" — hardening and security precede any App Store submission.
- **Gates:** unchanged from `AGENTS.md` — typecheck, lint, test, build, secret-scan, UBS, plus
  `eval:ai:offline` for AI changes, `test:e2e` for flagship flows, `perf:pwa` for shell/route changes.

---

## 6. Verdict ledger

| ID | Question | Answer | Firmness | Consequence |
|---|---|---|---|---|
| Q1 | Who uses this? | Widely available scalable product; ESPN 95050 was only a test fixture | Firm | Re-ranked all security findings as ship blockers |
| Q2 | Timeline a real target? | Yes; do not reason in human-developer timelines | Firm | Timeline removed as a decision axis |
| Q3 | What is winning? | Everything functioning optimally *across* leagues | Firm | Generalization is the acceptance bar |
| Q4 | Is betting flagship? | Redefined entirely — see Q11 | Firm | Triggered the Pick 'em rewrite |
| Q5 | ACL vs rank ladder? | Admin ⊇ all assigned roles | Firm | **Inverted UIX-102's fix** — see §7.1 |
| Q6 | `data_verifiable` auto-canon intended? | Term was misleading; see Q15/§7.5 | Firm | Reframed, not a bug |
| Q8 | Push unpushed `main`? | Yes | Firm | Done, CI green |
| Q9 | Commit analysis docs? | Yes | Firm | Done at `8816078` |
| Q10 | Security posture | Adopt recommended: UIX-102/103 blockers, UIX-104 fast follow | Firm | Sequenced early |
| Q11 | Design of record for betting | Pick 'em per Gemini discussion | Firm | Specs 08/15 to be rewritten |
| Q15 | Lore: spec vs description | Thread already exists; concern was interviewer's framing | Firm | §7.5 |
| Q16 | "Admin" means | Commissioner; collapse with `league_admin` | Firm | Role model simplifies |
| Q17 | Who assigns roles? | Commissioner only | Firm | Keeps `minRole: "commissioner"` on steward assignment |
| Q20 | Preserve bankroll work how? | Tag commit + ADR + delete cleanly | Firm | No fork, no flag |
| Q21 | Prize in season 1? | Build architecture now, activate later | Firm | §3.4 |
| Q22 | Competition needed for first test? | Everything must work | Firm | No partial scope |
| Q23 | `MAX_PICKS_PER_USER` | 10 for now, tunable | Firm | Config, not constant |
| Q24 | Push handling | Keep all lines; void pushes | Firm | §7.4 |
| Q25 | $40 charge in scope? | Yes — league data package | Firm | §3.2 |
| Q26 | Entitlements | Build fully; production-grade | Firm | Two-axis model |
| Q27 | Yahoo this season? | Yes, alongside ESPN + Sleeper | Firm | Decoding dictionary required |
| Q28 | Is lore complete? | Untested; wants overfit protection | Firm | New backlog item |
| Q29 | Adopt-all backlog? | Yes — but show the sequence first | Firm | Greenlight gate |
| Q30 | $40 tier contents | Data, record book, storage/maintenance; no AI | Firm | §3.2 |
| Q31 | AI billing axis | Both league and user, independent | Firm | §3.2 |
| Q33 | Tag-and-delete bankroll? | Yes | Firm | §3.3 |
| Q34 | Pick universe | Everything the Odds API returns | Firm | No curation |
| Q36 | Lore digest? | Wants sample review first | Provisional | §7.5 |
| Q37 | Basic Sync tier? | Drop it; revisit with the prize | Firm | §4, §9 |
| Q38 | Anything missing? | No | Firm | Interview closed |

---

## 7. Intent–reality divergences

### 7.1 `league_admin` privileges — **the ACL is wrong, not the ladder** (resolves UIX-102)

`src/auth/permissions.ts:31-34` declares `league_admin` with `leagueData: ["review"]`, deliberately
withholding `manage`. The guard layer ignores this and uses a linear `ROLE_RANK` where `league_admin`
outranks `data_steward`, so admins pass every steward gate. The prior analysis assumed the ACL expressed
intent and the ladder was the bug.

**Maintainer ruling: the ladder is correct.** Admins (= commissioners) must be able to do anything an
assigned role can do; assigned roles cannot do everything an admin can. `data_steward` is an
admin-assigned role, and only the commissioner may assign roles.

**Resolution:** amend the ACL and its comment to match, collapse `league_admin` into the commissioner
concept, and keep role assignment commissioner-only. This **inverts** the fix direction recorded in
backlog §7.1. `hasPermission` has zero server-side callers today; either wire it to the corrected
statements or delete it, but do not leave two disagreeing authority models in the tree.

**Status: resolved.** T-008 amended the ACL; T-008a completed the collapse — migration 0082 remapped every
`league_admin` row to `commissioner` and rebuilt the `league_role` enum without the label, so the value is
now unrepresentable rather than merely unused. `ROLE_RANK` has three rungs (`member` < `data_steward` <
`commissioner`), and `src/auth/permissions.test.ts` pins the pg enum, the ladder, and the ACL to one
vocabulary so they cannot drift apart again. Role assignment remains `minRole: "commissioner"`.

### 7.2 Provider readiness (answers Q3's stated uncertainty)

- **Sleeper — ready.** Full decoding dictionary registered, provider always real (public read-only API,
  no auth branch), validated 14/14 on two real public leagues. Gap is that fixture-validated ≠
  live-validated; import a real league and read the capability map before relying on it.
- **Yahoo — cannot work for a real user today.** Not present in `PROVIDER_DECODING_DICTIONARIES`
  (`src/providers/decoding.ts`) — only `espn` and `sleeper` are. Any real Yahoo payload fails the
  `provider_code_decoding` integrity check as `dictionary_missing`, quarantining the import **by design**.
  Additionally defaults to fixture-mock mode unless both `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` are set.
  The 43KB `client.ts` already exists, so the HTTP/normalization layer is done. Required: build the
  decoding dictionary, register it, supply real OAuth credentials, and add a vocabulary-closure test.

### 7.3 The cost instrument now blocks pricing

AI tier pricing depends on measuring real per-feature cost (§3.2). That meter is
`ai_usage_event.costMicrosUsd`, and it is wrong twice over: the Opus row prices at $15/$75 per MTok while
the pinned `claude-opus-4-8` lists at **$5/$25** (~3× overstatement, verified against the current pricing
reference), and `recordAiUsageEvent` has exactly one non-test caller — the league blogger — so the central
pipeline and every embedding call record nothing. **Promoted from MINOR to pricing-blocking.**

### 7.4 The Gemini discussion — validated

**Sound and adopted:** the three-prong test (prize + chance + consideration), indirect consideration, the
Dominant Factor Test, the UIGEA fantasy carve-out, AMOE/sweepstakes structure, the equal-treatment rule,
the for-profit charitable-gaming bar, and the absolute-denominator scoring model (whose math error the
maintainer correctly caught mid-conversation).

**Do not carry forward unchecked:**
1. **The "Apostolopoulos doctrine" appears fabricated.** No such recognized doctrine is known in U.S.
   gaming law. The underlying point about esports competitors controlling their own performance is
   directionally real; the named doctrine is not citable.
2. **"Legally indemnifies your company" (re: VPN users) is wrong** and is the most dangerous line in the
   document. A ToS binds users, not regulators. Commercially reasonable geo-blocking helps; indemnification
   is not what occurs.
3. **2026 case citations are unverifiable** (Kentucky AG action, Michigan federal ruling) and the doc
   contradicts itself on Sleeper's restricted-state count (31 vs. ~20).
4. **Material omission — sweepstakes registration and bonding.** New York and Florida require registration
   and a surety bond above $5,000 prize value. The doc floats $50,000 and never mentions it. Prize tax
   reporting is raised and dropped. **Both require counsel before any prize activates.**

**Push handling (Q24):** do not restrict the pick universe to half-point lines — that would shrink the
option space the maintainer explicitly wants to preserve. Keep every line and void pushes at grading.
Half credit was rejected (breaks binary grading, hard to explain); grading a push as *incorrect* was
rejected outright (punishes an undecidable outcome and pushes users away from whole-number lines, which
narrows the pool through the back door). Denominator becomes `allocated_picks − pushes` — still
deterministic and ungameable, since nobody can choose to push.

### 7.5 Lore is ambient context, not a fact store

**The thread already exists and is implemented** — `lore_claim_relation` enum, `thread_root_id` with its
own index, thread lineage assembled in `src/lore/member-experience.ts`, specced in `specs/18` as
root → dispute → verdict. `data_verifiable` narrowly means "makes a checkable numeric assertion, so it
resolves against the stats engine instead of going to a league vote." Opinion claims go to the vote. Both
live inside the thread. The interviewer's earlier framing implied claims resolve in isolation, which is
what prompted the maintainer's concern; that framing was wrong.

**Maintainer's model:** a member records something that happened; others establish its accuracy through
thread replies, votes, and likes — which also signal *which parts* of an account are credible and *who* is
reliable. The result is *"a piece of context that is just part of the league history… a background
feature."* Critically: *"none of those things should be directly referenced word for word in any kind of
context… it's more about just a contextual understanding."*

**The real defect:** all four buckets — canon, disputed, pending, **and refuted** — are serialized into
**every** generation with no relevance filter, no cap, and no scoring, as raw quotable strings. The
overfit risk is **verbatim parroting**, and nothing guards against it. (Contrast `src/ai/editorial-recall.ts`,
which does cosine-scored bounded retrieval.)

**Rejected fix:** dropping refuted claims. The maintainer is right that refutation *is* signal — it tells
the model what the league argues about and rejected.

**Adopted fix (provisional, pending sample review):** a periodically-regenerated **league character
digest** — a few hundred words per league synthesizing what the league is like, its running feuds, which
accounts are settled versus contested, weighted by vote and like signals — passed to generations in place
of raw claims. The model cannot parrot strings it never sees; disputed and refuted material is included
as character; prompt size stops scaling with claim count; and a specific claim can still be pulled in
directly when a piece is genuinely about it. Distillation also becomes a single sanitization point,
shrinking the prompt-injection surface (see UIX-110).

---

## 8. Propagated changes

Applied to `REPO-ANALYSIS/CLAUDE-Analysis-and-Improvement-2026-07-24-v1.md`:

1. **UIX-102 fix direction inverted** — amend the ACL to match the rank ladder, not the reverse (§7.1).
2. **UIX-109 / UIX-111 promoted** from MINOR to pricing-blocking (§7.3).
3. **UIX-009 and UIX-105 marked moot** — settled-slip amounts and the cross-event parlay race disappear
   with the bankroll engine.
4. **UIX-001 reshaped** from double-stake to double-pick idempotency.
5. **UIX-101 reaffirmed critical** — event-identity resolution is required under Pick 'em too.
6. **New items filed:** lore character digest (§7.5); Yahoo decoding dictionary (§7.2); Pick 'em engine;
   bankroll tag-and-delete; two-axis entitlements; billing.
7. **Backlog status:** adopt-all per Q29, sequence pending maintainer greenlight.

---

## 9. Parked questions

| ID | Parked | Reopen when |
|---|---|---|
| P1 | Minimum roster size for a competing entry (whether a solo entry may compete, and how AMOE entrants are scored) | A prize is activated. Absolute-denominator scoring makes a small entry competitive on percentage; the maintainer's counter is that a lone participant must cover the whole roster allotment. Decide alongside the AMOE mechanism. |
| P2 | Boot-overlay intent — 900ms splash on every shell mount vs. cold starts only | Delegated to agent sequencing under Q29. Reopen if a UX decision is contested. |
| P3 | Offline product intent — the SW page-cache branch has never populated in production | Delegated. Resolve as part of the PWA hardening pass. |
| P4 | Live-update reading UX — realtime swaps RSC content with no "N new items" affordance | Reopen before real content cadence goes live. |

---

*Recorded by Claude (Fable 5) via Claude Code, 2026-07-27 → 2026-07-28, pinned to `e28265d`.
Every answer above is the maintainer's, not the interviewer's paraphrase of its own hypothesis. Where the
interviewer's premise was wrong (Q1 market, Q15 lore framing, Q37 Basic Sync), the correction is recorded
alongside the answer so the error is not silently inherited.*
