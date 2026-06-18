# ORCHESTRATION.md — the next-increment build model

**This supersedes the Ralph loop.** The autonomous loop is retired (`loop.sh` is guarded off; `PROMPT_build.md` / `PROMPT_harden.md` / `PROMPT_plan.md` and the "pick the next `IMPLEMENTATION_PLAN.md` task and loop forever" model are historical). This file is how the Rumbledore build runs now.

Base: **`main`** (untouched this increment). Integration/review branch: **`review/increment-1`** (cut from `main`; the owner reviews this). Specs of record: `specs/00–35` (delivered) + **`specs/36+`** (this increment). Conventions/gates: `AGENTS.md`. Vision: `docs/NORTH-STAR.md`. Visual system (a hard gate): `DESIGN.md`.

---

## 1. The model in one paragraph
An **orchestrator agent** plus a small number of **workstream agents**, each working a single spec inside its **own git worktree** on its **own branch**, touching **only its file-ownership boundary**. Tracks run **in parallel where the dependency graph and file-ownership allow, serial where they share files.** Workstream agents **commit + push their branch at every completion round** — they **never merge to `main`**. The **orchestrator owns all merges into the integration branch** (`review/increment-1`, cut from `main` — `main` is never touched this increment): after a push, it pulls the branch, verifies against the spec's acceptance criteria, runs the full gate suite + design fidelity + the fixture oracle, and only then merges. `DESIGN.md` and the `AGENTS.md` gates are hard gates on every round — new surfaces ship in the AUSPEX language, never as generic shells.

---

## 2. Roles

### Orchestrator agent
- Owns the **dependency-ordered sequence** (§4) and dispatches each spec to a workstream agent with its file-ownership boundary.
- On each workstream push: `git fetch` the branch → review the diff against the spec's **acceptance criteria** → run the **full integrated gate suite** (§6) including design-fidelity screenshots and the fixture oracle for data work → **merge into `review/increment-1`** if green, else **kick back** with specific findings (not a vague "redo").
- Manages **cross-track coordination points** (§3) — e.g. the ambient agent's shell mount waits for Track B's shell work; nobody but Track A edits `schema.ts`.
- Updates `docs/PROGRESS.md` after each merge (one line per merged round).
- **Writes no feature code.** It reviews, integrates, sequences, and merges.

### Workstream agent
- Reads its spec (`specs/36+`) + `DESIGN.md` + the `AGENTS.md` conventions/gates **before** writing code.
- Works **only inside its file-ownership boundary** (§3). If it must touch another track's files, it **stops and flags the orchestrator** rather than reaching across.
- Runs in its **own worktree** on `ws/<track>-<spec>` (§5).
- **Per completion round** (§ the round protocol below): implement the next acceptance-criterion slice → run all applicable gates → **commit + push its branch**. Never merges to `main`.
- Verifies all data/records work against the **old-league fixtures** as the oracle (§6).

### The round protocol (this is the loop replacement)
A workstream **round** =
1. `git pull` `review/increment-1` into your worktree branch (the orchestrator keeps it ahead).
2. Implement the next acceptance-criterion slice from your spec — **completely** (no stubs; `AGENTS.md` hard rules).
3. **Gates:** `pnpm typecheck` · `pnpm lint` · `pnpm test` (touched units + suite) · `pnpm build` · `ubs <changed>` · `pnpm secret-scan`; **+** `pnpm perf:pwa` if shell/routes changed; **+** `pnpm eval:ai:offline` if AI touched; **+** design fidelity (`DESIGN.md` + screenshots) if UI touched. (Run pnpm with `PATH=/usr/bin:$PATH`.)
4. **Commit** (conventional message) **+ push your branch.** The push *is* the signal to the orchestrator.

An orchestrator **round** = fetch branch → verify vs acceptance criteria → full integrated gate run + design review + fixture oracle → **merge into `review/increment-1`** (or kick back).

---

## 3. Tracks, file-ownership, and coordination

| Track | Specs (serial within track) | Owns (may edit) | Must NOT touch |
|---|---|---|---|
| **A — Data & Records** | `36` → `37` → `38` | `src/db/schema.ts`, Drizzle migrations, `src/stats/*`, `src/app/leagues/[leagueId]/records/*`, the edit/ledger UI + commissioner authority (`src/auth/guards`, members) | `src/navigation/*`, `src/app/news/*`, `src/app/arena/*`, entitlement gating |
| **B — Environments & Feed** | `39` → `40` | `src/navigation/*` (the shell), `src/app/news/*`, `src/app/arena/*`, `src/news/*`, the wire component, news ingestion | `src/db/schema.ts`, `src/stats/*` |
| **C — Premium AI** | `41` | the ambient-agent UI + WizKit surface, `src/ai/personal-agent*`, entitlement gating for the premium tier | `src/db/schema.ts`, `src/stats/*` (reads only, via Track A's merged APIs) |

**Coordination points (orchestrator-enforced):**
- `src/db/schema.ts` is **Track A exclusive.** If B or C needs a column, it requests it through the orchestrator; A adds it.
- The **shell (`src/navigation`) is Track B exclusive.** Track C's any-page agent panel mounts via a **bounded region** that B exposes; the orchestrator sequences C's shell mount **after** B's shell work merges.
- **Entitlements stay ungated** (free = all features) until the pricing decision; Track C builds the premium *gate mechanism* but leaves it open.

Parallelism is real but bounded: **A ∥ B from the start** (file-disjoint). C starts after `36` merges. Within a track, specs are **serial** because they share files.

---

## 4. Dependency-ordered sequence
1. **`36` (Data foundation)** and **`39` (News/Arena environments)** in parallel — Track A ∥ Track B.
2. **`37` (Records parameterization + Record Book)** after `36`; **`40` (News pipeline + wire toggle)** after `39` — A ∥ B continues.
3. **`38` (Commissioner handoff + public ledger + edit UX)** after `36` (Track A).
4. **`41` (Ambient agent + WizKit tier)** after `36` is merged **and** after `39`'s shell work (Track C).

`36` is the keystone: it unblocks the record book *and* the agent, and seeding its data fills the empty Record Book/Arena surfaces in one move.

---

## 5. Worktrees, branches & the review target
- **`main` is NEVER touched by this increment.** All work lands on branches; the owner reviews a single integration branch.
- **Integration/review branch:** `review/increment-1`, cut from `main`, carrying the planning docs (this file + `specs/36`–`41` + the de-staled docs). Track branches are cut from **`review/increment-1`** (not `main`) so they have the specs.
- One worktree per concurrent track. Branch naming: `ws/<track>-<spec-slug>` (e.g. `ws/a-data-foundation`, `ws/b-news-arena-env`).
- Workstream agents **commit + push their `ws/*` branch every round** — never `main`, never `review/increment-1` directly.
- **The orchestrator merges each completed, gate-green track branch into `review/increment-1`** (running the full integrated gate suite on the result) and keeps it ahead so agents pull it at the start of each round. `main` stays clean for the owner's morning review.
- An unused worktree is cheap to remove (`git worktree remove`).

## 6. Gates (mandatory; never disabled)
The `AGENTS.md` gate list applies in full. Two "taste" gates matter most for this increment:
- **Design fidelity** — every new/changed surface matches `DESIGN.md` + `docs/screenshots/reference-images/`; the token-contract test (`src/theme/component-token-contract.test.ts`) must pass (no raw hex/rgb/inline transitions outside tokens). New functionality is built **in the AUSPEX language from the start** — the "build generic, sweep later" pattern is banned.
- **Fixture oracle (data work)** — Track A runs the engine over the ~80 old-league JSON outputs (`/home/ubuntu/espn-api-old-2024/scripts-output/`, ~2011–2023) and asserts it reproduces the known record-book numbers, then seeds them so Record Book/Arena are not empty.

## 7. Accounts — balance across codex1 / codex2 / codex3
All three Codex accounts (**codex1, codex2, codex3**) are available and **must be used, balanced** (≈ even; need not be perfect). Assignment rule: **least-loaded account per track/spec**, respecting deps + file-ownership (one account per *active* track at a time, so two accounts never edit the same track's files). Across the 6 specs that lands ≈ **2 specs per account**; because Track C is blocked early, its account picks up the next unblocked Track-A spec to stay balanced. The orchestrator runs on a Claude account (`cbx`), consuming **no** Codex budget. Per-account invocation (launcher names / config-dir or caam-profile routing) is owner-specified — the old single `cx` is replaced by explicit per-account targeting.

---

## 8. The four data decisions (locked defaults — detailed in spec `36`)
1. **Era boundaries:** the system **auto-detects** candidate boundaries from setting changes (size, roster, scoring) and the **commissioner confirms/adjusts** (each confirm is a ledger entry). Not fully manual, not silently automatic.
2. **Record lenses (v1):** **era** *and* **regular/playoff/both** *and* **cumulative** — all four.
3. **Multi-week games:** a matchup may span **N scoring periods**; default normalization = **per-week for averages, full total for W/L**.
4. **Public ledger scope:** both **per-league** (full, filterable history) and **per-entity** (click a team/person → its trail).

## 9. The guiding architecture (so specs stay coherent)
- **Rigid shape, flexible interpretation.** A **rigid canonical substrate** (facts + dimensions in one consistent, universally-interpretable shape) carries everything true of *all* leagues. A **general curation toolkit** — corrections, groupings, normalization — lets a league express *its own* situation. Nothing league-specific is hard-coded; "eras" and "two-week games" are *uses* of general primitives, invisible to a clean single-league user.
- **Integrity = transparency, not frozen data.** Data is editable; the **ledger is the immutable, league-visible point of truth** (who/what/before→after/when). Dimensions (people/teams) are edited **once** and propagate via stable keys; facts are rarely touched. The current correction trail is narrow (identity + integrity-review only) — spec `36` **generalizes** it to "edit any editable field → ledger it."
