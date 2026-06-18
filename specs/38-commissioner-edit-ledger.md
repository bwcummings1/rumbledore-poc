# Spec 38 — Commissioner Authority, Edit Flow & Public Ledger

> Outcomes spec. The member-facing surfaces on top of `specs/36`'s substrate: **commissioner default + handoff**,
> the **edit flow** (fix fixed-variables once per season; rare fact corrections), the press-a-button **public
> ledger view**, and the **era-confirm** UX. Read `docs/NORTH-STAR.md` first; `DESIGN.md` is a gate. Builds on
> **`specs/36`** (the edit service + ledger read-model + groupings), `specs/14` (steward — EXISTS), `specs/17`
> (entitlements), `specs/01` (auth roles). Lives in `src/app/leagues/[leagueId]/*`, `src/auth/guards`, members.
> **Track A**, after `36`.

## Why this spec exists (the soul)
The owner's real pain: data needs **editing** (doubled names, the 12-team-split season someone wrote down,
formatting), but it must stay **honest** — *"keeps the commissioner honest."* `specs/36` built the substrate
(editable data + an immutable ledger + groupings); this spec is the **human surface**: who has authority, how they
edit fixed variables in one place, how everyone *sees* what changed, and how eras get confirmed. Integrity =
transparency: the ledger is **league-visible**, not buried in an admin tool.

## Outcomes
1. **Commissioner = creator by default, with handoff.** First signer is commissioner; they can hand it off.
2. **Edit fixed variables once.** Per-season review of names/teams/owners (dimensions) — edit once, propagate
   (`specs/36 §B`); rare numeric/structural corrections clearly marked substantive.
3. **A public, press-a-button ledger.** A drawer (not a page) showing the merged who/what/before→after/when
   timeline, filterable **per-league and per-entity** (`ORCHESTRATION.md §8`), visible to **all league members**.
4. **Confirm eras.** Surface `specs/36`'s auto-detected proposed groupings for commissioner confirm/adjust.

---

## A. Commissioner default + handoff
Default commissioner = creator (EXISTS: `creatorRole: "commissioner"`, role hierarchy in `auth/guards`). **NEW:**
a **handoff** action that transfers the commissioner role to another member (role-gated to the current
commissioner; written to the ledger; old commissioner demoted to member or a defined role). RLS/role-guarded.

## B. The edit flow (fixed variables once; rare fact edits)
A league surface (commissioner + data-steward) presenting, **per season**, the "fixed variables" — team names,
person/owner names — as edit-once fields that propagate via keys (`specs/36 §B`); each edit calls `specs/36`'s edit
service (applies + ledgers + recomputes). **Cosmetic** edits (name formatting) are low-friction; **substantive**
edits (a score, a matchup span, a missing-season add) are clearly flagged and the most prominent in the ledger.
Re-import stickiness is inherited from `specs/36 §F` (manual edits aren't clobbered).

## C. The public ledger view (press-a-button)
A **drawer/popover** (not a standalone page) over `specs/36`'s unified ledger read-model: who/what/before→after/
when/why, filterable **per-league** (full history) and **per-entity** (click a team/person → its trail). Visible to
**all league members** (not steward-only) — that visibility *is* the integrity mechanism. AUSPEX, with designed
empty (a clean league shows an empty, honest ledger) and loading states.

## D. Era-confirm UX
Surface `specs/36`'s `proposed` groupings: the commissioner sees detected boundaries (size/roster/scoring changes),
confirms or adjusts the season membership (arbitrary sets allowed, `specs/36 §C`), and each confirm writes the
grouping + a ledger row. Optional — a league that ignores it stays cumulative.

## E. Design & EXISTS/NEW
- **Design:** AUSPEX per `DESIGN.md` (panels, mono labels, drawer per `specs/29`); graceful empty/loading; ≥44px;
  a11y. Token-contract test green.
- **EXISTS — extend:** the steward review surface (`specs/14`, admin), `creatorRole`, `identity_audit_log`, role
  guards.
- **NEW:** commissioner handoff; the **member-facing** edit flow (not steward-only); the **public** ledger drawer
  (per-league + per-entity, league-visible); the era-confirm UX.

## F. Acceptance criteria (testable, fixture-backed)
1. **Handoff.** A commissioner hands off; the role transfers, guards update, and a ledger row records it; a
   non-commissioner cannot hand off.
2. **Edit-once propagation.** Fixing a person/team name once updates all weeks (via keys), writes a ledger row, and
   appears in the public ledger (ties to `specs/36 §B`).
3. **Public ledger.** The drawer renders the merged timeline filterable per-league and per-entity; it is visible to
   an ordinary member (not steward-only); a clean league shows a designed empty ledger.
4. **Era confirm.** Confirming a proposed grouping writes the grouping + a ledger row; adjusting season membership
   persists; a league that ignores it stays cumulative.
5. **Guards/RLS.** All edit/handoff/confirm actions are league-scoped, RLS- + role-guarded; cross-league isolation
   holds (canary).
6. **AUSPEX + gates.** Fidelity per `DESIGN.md`; `typecheck/lint/test/build/ubs/secret-scan` pass.

### Needs the later human pass
Edit-surface layout/density, ledger drawer composition, the cosmetic/substantive presentation — tuned with the
owner.

## Dependencies / blocked-by
- **Builds on** `specs/36` (edit service + ledger read-model + groupings) — hard prerequisite; `specs/14` (steward
  EXISTS), `specs/17` (entitlements), `specs/01` (roles).
## Non-goals
- The substrate/services/engine (`specs/36`); the records lens UI (`specs/37`); pricing/billing (deferred).
