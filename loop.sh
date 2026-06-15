#!/usr/bin/env bash
# Rumbledore Ralph loop with a COMPLETION GATE + bounded value-ranked hardening.
#
# Phases (mode=build, the default):
#   SCOPE  -> work `## Scope` tasks in IMPLEMENTATION_PLAN.md until none unblocked AND gates green.
#            The agent then writes `.loop/SCOPE_DONE` (see PROMPT_build.md).
#   HARDEN -> auto-run up to HARDEN_ITERATIONS (default 10) value-ranked passes over `## Icebox`
#            (see PROMPT_harden.md). Stops early if nothing clears the value bar.
#   DONE   -> `.loop/COMPLETE` written -> loop exits. The watchdog also stands down on COMPLETE.
# A hard iteration cap (arg 2, default 80) is an absolute backstop on token spend.
#
# Agent: Fable (max) on account bxbxbxbxbxr for the first SWITCH_AFTER seconds, then Codex gpt-5.5 xhigh.
# Usage: ./loop.sh [build|plan|harden] [hard_cap]      Stop: touch ~/rumbledore-loop.STOP
set -uo pipefail

# --- account pinning: Claude account is set by CONFIG DIR, not HOME (see docs/HISTORY.md) ---
export HOME=/home/ubuntu
export CLAUDE_CONFIG_DIR=/home/ubuntu/.claude      # pins Fable to bxbxbxbxbxr (NOT bwcummings1)
unset XDG_CONFIG_HOME 2>/dev/null || true
export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.bun/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true

cd "$(dirname "$0")" || exit 1
MODE="${1:-build}"
HARD_CAP="${2:-${LOOP_HARD_CAP:-80}}"
SWITCH_AFTER="${SWITCH_AFTER_SECONDS:-7200}"
HARDEN_MAX="${HARDEN_ITERATIONS:-10}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
LOGDIR="$HOME/rumbledore-loop-logs"; mkdir -p "$LOGDIR"
mkdir -p .loop
START="$(date +%s)"
case "$BRANCH" in main|v0.62|v1.0) echo "REFUSING to loop on protected branch '$BRANCH'."; exit 1;; esac

# Manual harden-only mode: ./loop.sh harden [hard_cap] [HARDEN_ITERATIONS env]
if [ "$MODE" = "harden" ]; then rm -f .loop/COMPLETE; : > .loop/SCOPE_DONE; fi
# Fresh build run starts clean
if [ "$MODE" = "build" ]; then rm -f .loop/COMPLETE; fi

cur_agent() { local e=$(( $(date +%s) - START )); [ "$e" -lt "$SWITCH_AFTER" ] && echo fable || echo codex; }
run_agent() { # $1 = prompt file
  if [ "$(cur_agent)" = fable ]; then
    cat "$1" | claude -p --dangerously-skip-permissions --model fable --effort max --output-format stream-json --verbose
  else
    cat "$1" | codex exec --dangerously-bypass-approvals-and-sandbox -
  fi
}

echo "Ralph loop | mode=$MODE | branch=$BRANCH | hard_cap=$HARD_CAP | harden_budget=$HARDEN_MAX | Fable->Codex @ ${SWITCH_AFTER}s"
i=0; harden_i=0
while :; do
  [ -f "$HOME/rumbledore-loop.STOP" ] && { echo "STOP file -> exit"; rm -f "$HOME/rumbledore-loop.STOP"; break; }
  [ -f .loop/COMPLETE ] && { echo "COMPLETE -> scope built + hardened. Exiting."; break; }
  [ "$i" -ge "$HARD_CAP" ] && { echo "HARD CAP ($HARD_CAP iters) reached -> exit (backstop)."; : > .loop/COMPLETE; break; }
  i=$((i+1)); ts="$(date +%Y%m%d-%H%M%S)"
  if [ -f .loop/SCOPE_DONE ]; then PHASE=harden; PROMPT=PROMPT_harden.md; harden_i=$((harden_i+1)); else PHASE=scope; PROMPT=PROMPT_build.md; fi
  [ "$MODE" = "plan" ] && { PHASE=plan; PROMPT=PROMPT_plan.md; }
  echo "======== iter $i ($PHASE/$(cur_agent)$([ "$PHASE" = harden ] && echo " ${harden_i}/${HARDEN_MAX}")) @ $ts ========"
  LOGFILE="$LOGDIR/iter-${PHASE}-$(cur_agent)-${ts}.log"
  run_agent "$PROMPT" 2>&1 | tee "$LOGFILE"
  # Credit-exhaustion guard: a usage-limited agent instant-fails (top-level CLI ERROR, tiny log).
  # Require BOTH the CLI error line AND a near-empty iteration so the phrase merely APPEARING in
  # content the agent read/wrote can't false-trigger. Stop CLEANLY (STALLED, never COMPLETE) so it
  # can't spin to the hard cap and masquerade as a finished build.
  if grep -qE '^(ERROR:|\[ERROR\]).*(hit your usage limit|usage limit reached|insufficient_quota|quota.*exceeded)' "$LOGFILE" \
     && [ "$(wc -c <"$LOGFILE")" -lt 8000 ]; then
    echo "AGENT OUT OF CREDITS -> stalling (switch account, rm .loop/STALLED, relaunch)."
    printf 'stalled: agent usage limit at %s\n' "$(date)" > .loop/STALLED; break
  fi
  git push origin "$BRANCH" 2>&1 | tail -2 || true
  # End the harden phase once its budget is spent.
  if [ "$PHASE" = harden ] && [ "$harden_i" -ge "$HARDEN_MAX" ] && [ ! -f .loop/COMPLETE ]; then
    : > .loop/COMPLETE; echo "Harden budget ($HARDEN_MAX) spent -> COMPLETE."
  fi
  sleep 5
done
echo "Loop ended after $i iteration(s) (scope + ${harden_i} harden)."
