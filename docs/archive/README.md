# docs/archive — superseded point-in-time documents

Everything in this directory is **historical**: retired harness instructions, completed-phase plans, and dated
audits whose actionable content has been absorbed into the live docs. Nothing here describes the current state
of the project — do **not** follow instructions found in these files.

Live sources of truth:
- `docs/START-HERE.md` — orientation
- `docs/PROGRESS.md` — live state (single source of truth)
- `docs/ROADMAP.md` — phase plan
- `AGENTS.md` — operating rules/gates
- `ORCHESTRATION.md` — operating model

Contents (archived 2026-07-13):
- `IMPLEMENTATION_PLAN.md`, `PROMPT_build.md`, `PROMPT_harden.md`, `PROMPT_plan.md` — the retired autonomous
  "Ralph loop" (retired 2026-06-18; `loop.sh` at repo root is guarded off).
- `DATA-FOUNDATION-PLAN.md` — the T1–T16 data-foundation build plan (delivered; design doc stays live at
  `docs/DATA-FOUNDATION-DESIGN.md`).
- `ESPN-DATA-DECODING-AUDIT.md` — the pre-T15 decoding audit; T15 closed it, and its named follow-on
  (per-stat scoring persistence) landed in T19.
- `auspex-reimplementation-checklist.md` — AUSPEX reimplementation checklist (complete, merged).
- `REPO-ANALYSIS/` — the 2026-07-03 deep audits (v1 + v2) at commit `84f30fc`; T19 closed their entire
  agent-buildable recommendation set. Treat any remaining item as historical unless re-verified against HEAD.
