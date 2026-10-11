#!/usr/bin/env bash
# Stop the facilitator and x402 server started by start.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"

# pnpm -> tsx -> node forms a child-process chain, so terminate descendants first
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

for name in x402server facilitator; do
  pid_file="$RUN_DIR/$name.pid"

  if [[ ! -f "$pid_file" ]]; then
    echo "[skip] No PID file found for $name"
    continue
  fi

  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill_tree "$pid"
    echo "[stop] $name (PID $pid)"
  else
    echo "[skip] $name is already stopped"
  fi
  rm "$pid_file"
done
