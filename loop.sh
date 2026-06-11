#!/usr/bin/env bash
# Rumbledore v2 Ralph loop with timed Fable -> Codex handoff.
# Usage: ./loop.sh [build|plan] [max_iterations]   (default: build, unlimited)
#
# Phase 1 (first SWITCH_AFTER seconds, default 2h): Claude FABLE (effort max) on account bxbxbxbxbxr (HOME=/home/ubuntu).
# Phase 2 (after that):                             Codex GPT-5.5 xhigh (fast) on the ChatGPT account.
# The switch happens ONLY between iterations (never mid-session). Each iteration is one full, verified, committed session.
# Stop cleanly: `touch ~/rumbledore-loop.STOP` (exits after the current iteration) or Ctrl-C.
set -uo pipefail

# --- account/env pinning (both agents run with HOME=/home/ubuntu) ---
export HOME=/home/ubuntu
unset CLAUDE_CONFIG_DIR 2>/dev/null || true
export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.bun/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true

cd "$(dirname "$0")" || exit 1
MODE="${1:-build}"
MAX="${2:-0}"
PROMPT="PROMPT_build.md"; [ "$MODE" = "plan" ] && PROMPT="PROMPT_plan.md"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
LOGDIR="$HOME/rumbledore-loop-logs"; mkdir -p "$LOGDIR"
SWITCH_AFTER="${SWITCH_AFTER_SECONDS:-7200}"   # 2h Fable, then Codex
START="$(date +%s)"

case "$BRANCH" in
  main|v0.62|v1.0) echo "REFUSING to loop on protected branch '$BRANCH'."; exit 1;;
esac

run_fable() {  # Claude Fable, max effort, on bxbxbxbxbxr
  cat "$PROMPT" | claude -p --dangerously-skip-permissions \
      --model fable --effort max --output-format stream-json --verbose
}
run_codex() {  # GPT-5.5 xhigh fast (model/effort/tier from ~/.codex/config.toml), full-auto
  cat "$PROMPT" | codex exec --dangerously-bypass-approvals-and-sandbox -
}

echo "Ralph loop | mode=$MODE | branch=$BRANCH | HOME=$HOME | Fable->Codex after ${SWITCH_AFTER}s"
i=0
while :; do
  [ -f "$HOME/rumbledore-loop.STOP" ] && { echo "STOP file present — exiting after $i iteration(s)."; rm -f "$HOME/rumbledore-loop.STOP"; break; }
  if [ "$MAX" -gt 0 ] && [ "$i" -ge "$MAX" ]; then echo "Reached max iterations ($MAX)."; break; fi
  i=$((i+1))
  ts="$(date +%Y%m%d-%H%M%S)"
  elapsed=$(( $(date +%s) - START ))
  if [ "$elapsed" -lt "$SWITCH_AFTER" ]; then AGENT="fable"; else AGENT="codex"; fi
  echo "======== iteration $i ($MODE/$AGENT, elapsed ${elapsed}s) @ $ts ========"
  if [ "$AGENT" = "fable" ]; then
    run_fable 2>&1 | tee "$LOGDIR/iter-${MODE}-${AGENT}-${ts}.log"
  else
    run_codex 2>&1 | tee "$LOGDIR/iter-${MODE}-${AGENT}-${ts}.log"
  fi
  git push origin "$BRANCH" 2>&1 | tail -2 || true
  sleep 5
done
echo "Loop ended after $i iteration(s)."
