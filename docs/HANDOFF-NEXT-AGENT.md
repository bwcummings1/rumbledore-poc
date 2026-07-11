# HANDOFF — comprehensive context for the next agent (written 2026-07-11)

> Read `docs/START-HERE.md` first for orientation, `docs/PROGRESS.md` for live state. THIS document is the
> continuity layer between them: what just happened (the July 9–11 arc), the strategic discussions with the
> owner that produced it, the decisions already made vs. still open, hard-won operational knowledge, and the
> agreed next steps. Do not re-litigate decisions recorded here; do verify facts against HEAD before acting.

## 0. Where the project is, in one paragraph

`main` (through `b0e05a9`, CI green, 1,225 tests / 5 honest skips) carries the complete original build (Phases
1–3 + AUSPEX + Increment 1 + data foundation T1–T17) **plus the July arc**: **T18** — the editorial control
plane (`specs/45`: canon provenance/`CanonCatalog`, content lifecycle retract/supersede, editorial ledger,
commissioner retract/regenerate, stat-correction workflow, generation failure queue, persona tone editor, live
embeds, reactions, roast consent) and distribution (`specs/46`: OG share cards, logged-out teasers, launch
edition, mock webhooks/digest, channel preferences); **T19** — pushed-canon player records, per-stat scoring
persistence, substrate-B consumption by AI generation (labeled non-canon), per-league AI usage attribution,
the hardening batch (rate limits, security headers/CSP, e2e-in-CI, dev-DB backup script, Inngest env parity),
`specs/42` H1-12..17 closed, and **all 25 findings from a three-reviewer post-merge adversarial review of T18
fixed with regression tests** (2 HIGH editorial state-machine bugs among them). Everything is still **mock/$0**:
no real LLM/odds/news/embedding call has ever been made; keys are staged in `.env.local`.

## 1. The 2026-07-10 incident (read before touching the dev DB)

`scripts/import-real-league.ts` is a **reset-and-verify harness — it DELETES the league row first**, cascading
away all league-scoped curated state. It was run as a routine backfill; the cascade wiped the dev league's
pushed snapshots, checkpoints, edit ledger, content, and lore (all harness/test artifacts — no owner-authored
curation existed). The run also crashed mid-import on an unchunked season-scale insert (> Postgres's 65,535
bind-parameter cap) — the first time real data volume hit that T19 code path. Recovery (all on `main`):
- `e60842e` — bulk upserts chunk at 1,000 rows + a 4,800-row regression test.
- `b300879` — the harness refuses to run without `--reset-league` and prints the backup/restore procedure.
- League re-imported (NEW internal UUID — always resolve by provider `espn`/`95050`, never a stored UUID),
  canon re-pushed via `scripts/repush-all-seasons.ts`, all 14 integrity check keys PASS.
- First dev-DB backup taken via `scripts/dev-db-dump.sh` (lands in `~/rumbledore-db-backups/` under the
  session's HOME). **No backup cron is installed** — owner decision pending.
Lessons now encoded: never run verification harnesses against shared state without reading their reset
behavior; back up before any destructive dev-DB operation; volume-scale properties belong in tests.

## 2. Established data facts (proven, not assumed)

- ESPN exposes **player-level depth for this league only for 2011–2017 + the current season**; 2018–2025 is a
  provider limitation (proven by two independent full imports), not an import gap. Player records therefore
  draw from those seasons.
- **Per-stat breakdowns exist for the current season only** (~6.2k rows for 2026).
- The league's early era uses old-ESPN position vocabulary — **`TQB` (Team QB), `WR/TE`, `D/ST`, `PK`-era
  codes** — so pure QB/TE/K positional records are legitimately sparse/empty for those years. Whether `TQB`
  should count toward "QB" records is an **open owner curation question**, not a bug.
- The Record Book (including player categories) reads **pushed canon only**; after any snapshot-model
  extension, seasons must be **re-pushed** to surface new facts (`scripts/repush-all-seasons.ts`).

## 3. Recent strategic discussions with the owner (context you'd otherwise lack)

1. **"Do we need a CMS?"** → Resolved: no external CMS. The DB-native pipeline (`content_item` + typed
   templates + judge gate + cadence engine) IS the CMS; what was missing was editorial control, which T18
   built. Remaining "CMS-adjacent" items are Phase-5 human-pass polish (OG card shows "RUMBLEDORE" three
   times + a confusing "SHARE CARD" chip; reaction emoji set; correction-note voice; tone-editor layout).
2. **"What will seem obvious later?"** → Produced `specs/46`. Its §G ops checklist (credential-death alerting,
   production deployment story, generation latency UX, per-league unit economics) is **deliberately unbuilt** —
   it is the Phase-4 checklist. Cost attribution (T19) is already in place so economics data flows from the
   first real API call.
3. **Reliability assessment ("would it work 100% of the time?")** — the honest posture given to the owner:
   - **ESPN**: data core high-confidence for leagues shaped like the validation league (long-running, standard
     H2H points), failing LOUD (integrity gates) rather than corrupting for unknown shapes — but validated
     against exactly ONE league. Weakest links for a stranger: onboarding (hosted cookie capture/Browserbase is
     mock-pinned → manual cookie extraction, the #1 past failure), no credential-expiry alerting, never
     soak-tested during a live NFL week, and no production deployment exists at all.
   - **Yahoo**: scaffolding only — OAuth plumbing exists but fixture-backed, **no decoding dictionary**, needs
     owner's Yahoo developer-app registration. Effectively 0% for a real user today.
   - **Sleeper**: also fixture-backed and dictionary-less (0% today) but the SHORTEST path to real: public API,
     no OAuth — "write the dictionary + unknown-code invariant, verify against real leagues" is one T-task.
4. **"Bulletproof without a closed beta?"** — the agreed methodology (owner engaged, spec NOT yet written):
   replace beta *sampling* with input-space *enumeration*. Five parts: (a) enumerate the full vendor vocabulary
   from ESPN's own client bundles + community clients' issue trackers (cwendt94/espn-api etc.); (b) a
   **public-league corpus harvester** (payloads from publicly-visible leagues across seasons/shapes; read-only,
   rate-limited; do a deliberate ToS review) feeding the vendored CI oracle; (c) **property-based generative
   tests** over the schema space (incl. volume — the bind-param crash class); (d) a **capability probe** that
   measures each league's (season × view) data availability on connect and persists a declared coverage map all
   surfaces read (adaptability = measure, don't predict); (e) **shadow-run connect** (import + full integrity
   suite before the league goes live; failures quarantine + capture payloads into the corpus) + payload-drift
   canaries. → **The natural next spec: `specs/47-ingestion-bulletproofing.md`.** All $0, no keys.

## 4. Decisions already made (do not re-open without the owner)

- Everything merges to `main`; orchestrator owns merges after a full gate run (ORCHESTRATION.md banner).
- No external CMS. Comments are a non-goal (reactions only). League teasers default `robots: noindex`
  (one-line reversible if the owner later wants crawler-driven growth).
- `.orchestration/` operational files stay untracked (owner decision); `REPO-ANALYSIS/` is now committed.
- Mock-pinned/$0 posture holds until the owner flips keys; substrate-B real source is an owner choice
  (SportsDataIO key staged).

## 5. Open items — owner-gated (surface these, don't decide them)

1. **Real-key smoke test** (Phase-4 lite): one controlled real generation run — persona voice sample, latency,
   cost-per-piece (attribution is ready). Highest information-per-dollar move available.
2. **Substrate-B real source** choice; **hosted ESPN capture vendor** (Browserbase key staged); **email
   provider + domain** for the digest; **backup cron** installation (script exists, never scheduled).
3. **Phase-5 voice session** — the persona tone editor (`/leagues/[id]/cast/tone`) with mock preview is the
   built vehicle; the LLM judge is the ruler. Needs real keys to be meaningful.
4. **`TQB`→QB curation question** (§2); the OG-card cosmetic pass; production deployment planning (spec 46 §G).

## 6. Recommended next work (agent-buildable, in order)

1. **Write + build `specs/47-ingestion-bulletproofing`** (§3.4 above) — the highest-value $0 work remaining;
   directly converts the reliability posture from "validated on one league" toward "validated against the
   input space". Well-shaped for the T-loop harness (see §7).
2. **Sleeper decoding dictionary + unknown-code invariant** — cheapest path to a second real provider.
3. Small follow-ons: backup cron (once owner approves), the OG-card polish pass, `specs/20` living-doc
   notification copy nits — batch with whatever runs next.

## 7. Operational knowledge (hard-won; verify before relying, but all true as of writing)

- **The autonomous build harness that produced T18/T19**: `.orchestration/track-runner.sh` in a detached tmux
  session, fresh agent per round, prompt files `.orchestration/prompts/prompt-T{18,19}.md` (use as templates —
  they encode the round protocol, gates, sentinels, and env gotchas), per-task ledgers + orchestrator notes in
  `.orchestration/handoff/`. Rounds ran 20–45 min; RUNNER_MAX 30; sentinels `.track-done`/`.track-blocked`;
  STOP file kills globally. The orchestrator (a Claude session) monitors via background sleep cycles, then
  re-runs the FULL gate suite on the branch head and spot-reviews risk surfaces before merging.
- **Agent-account reality on this VPS** (checked 2026-07-09): `cbx` and `claude2` launchers are **logged
  out**; `claude3`/`~/.claude-third` is the **owner's own account** (shares their usage window — do NOT run
  heavy work on it); **Codex via `cx exec --dangerously-bypass-approvals-and-sandbox` is the proven workstream
  engine** (built T1–T19).
- **gh CLI**: sessions under caam profiles have isolated `XDG_CONFIG_HOME`; gh auth lives in native
  `~/.config/gh` and is symlinked into the claude3 profile. Same symlink pattern fixes any XDG-respecting tool.
- **Post-merge adversarial review pattern** (used on T18, found 25 real issues incl. 2 HIGH): three parallel
  read-only reviewers with distinct lenses (outbound security / public-surface privacy / state-machine
  correctness), findings verified with file:line evidence, consolidated into
  `.orchestration/reviews/T18-review-findings.md`, then appended as fix tranches to the RUNNING loop's prompt
  (the runner re-reads its prompt every round). Cheap, effective — repeat it after big merges.
- **Scripts**: `repush-all-seasons.ts` (steward checkpoint+push-all, prints player-record samples — note its
  console printer treats `positionalBests` as flat and shows "0 entries"; the object is keyed by position);
  `dev-db-dump.sh` (backup); `import-real-league.ts` (**DESTRUCTIVE**, `--reset-league` guarded — for a routine
  refresh use the product import/sync APIs instead).
- **Dev environment**: compose stack (postgres `rumbledore@localhost:5440`, redis 6390); a `next dev` server
  may be running on `:3000`; old `rmbl-*` worktrees (A…V1, T18, T19) are removable clutter
  (`git worktree remove <path>`); prior Claude session transcripts live in the `claude2` caam profile and
  `~/.claude/projects` (not the current profile).
- **Real-league verification loop**: dev DB league = provider `espn`/`95050` "NHS Alumni Annual" (resolve the
  UUID at runtime); read-only for verification; screenshots via
  `SCREENSHOTS=1 PATH=/usr/bin:$PATH pnpm exec playwright test e2e/screenshots.spec.ts`.
- The July 2026 deep audits live in `REPO-ANALYSIS/` (v1 + v2); T19 closed their entire agent-buildable
  recommendation set — treat remaining items there as historical unless cross-checked against HEAD.
