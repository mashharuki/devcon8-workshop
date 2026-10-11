#!/usr/bin/env bash
# facilitator (:4022) と x402 server (:4021) をバックグラウンドでまとめて起動する
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
mkdir -p "$RUN_DIR"

# name:package:port
SERVICES=("facilitator:facilitator:4022" "x402server:x402server:4021")

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

for entry in "${SERVICES[@]}"; do
  IFS=: read -r name pkg port <<<"$entry"
  pid_file="$RUN_DIR/$name.pid"
  log_file="$RUN_DIR/$name.log"

  if is_running "$pid_file"; then
    echo "[skip] $name は既に起動中です (PID $(cat "$pid_file"))"
    continue
  fi

  (cd "$ROOT_DIR" && nohup pnpm --filter "$pkg" dev >"$log_file" 2>&1 &
    echo $! >"$pid_file")
  echo "[start] $name (port $port) PID $(cat "$pid_file") log: $log_file"
done

echo "停止するには: scripts/stop.sh"
