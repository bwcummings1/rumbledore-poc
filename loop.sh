#!/usr/bin/env bash
# Rumbledore v2 Ralph loop.
# Usage: ./loop.sh [build|plan] [max_iterations]   (default: build, unlimited)
# Runs on Claude account bxbxbxbxbxr@gmail.com (HOME=/home/ubuntu). bwcummings1 is reserved for other agents.
# Stop cleanly: `touch ~/rumbledore-loop.STOP` (loop exits after the current iteration) or Ctrl-C.
set -uo pipefail

# --- account pinning: force the second account, not the caam claude2 profile ---
export HOME=/home/ubuntu
unset CLAUDE_CONFIG_DIR 2>/dev/null || true
# ensure claude + pnpm are findable even from a non-login shell
export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.bun/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true

cd "$(dirname "$0")" || exit 1
MODE="${1:-build}"
MAX="${2:-0}"
PROMPT="PROMPT_build.md"; [ "$MODE" = "plan" ] && PROMPT="PROMPT_plan.md"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
LOGDIR="$HOME/rumbledore-loop-logs"; mkdir -p "$LOGDIR"   # outside the repo so commits stay clean

# Safety: never run the loop on protected branches.
case "$BRANCH" in
  main|v0.62|v1.0) echo "REFUSING to loop on protected branch '$BRANCH'."; exit 1;;
esac

echo "Ralph loop | mode=$MODE | branch=$BRANCH | account=bxbxbxbxbxr (HOME=$HOME) | prompt=$PROMPT"
i=0
while :; do
  [ -f "$HOME/rumbledore-loop.STOP" ] && { echo "STOP file present — exiting after $i iteration(s)."; rm -f "$HOME/rumbledore-loop.STOP"; break; }
  if [ "$MAX" -gt 0 ] && [ "$i" -ge "$MAX" ]; then echo "Reached max iterations ($MAX)."; break; fi
  i=$((i+1))
  ts="$(date +%Y%m%d-%H%M%S)"
  echo "================ iteration $i ($MODE) @ $ts ================"
  cat "$PROMPT" | claude -p \
      --dangerously-skip-permissions \
      --model fable --effort max \
      --output-format stream-json --verbose \
      2>&1 | tee "$LOGDIR/iter-${MODE}-${ts}.log"
  # Persist progress even if the agent forgot to push.
  git push origin "$BRANCH" 2>&1 | tail -2 || true
  sleep 5
done
echo "Loop ended after $i iteration(s)."
