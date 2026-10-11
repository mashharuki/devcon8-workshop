#!/usr/bin/env bash
# start.sh で起動した facilitator と x402 server をまとめて停止する
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"

# pnpm -> tsx -> node と子プロセスが連なるため、子孫から順に終了させる
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
    echo "[skip] $name の PID ファイルがありません"
    continue
  fi

  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill_tree "$pid"
    echo "[stop] $name (PID $pid)"
  else
    echo "[skip] $name は既に停止しています"
  fi
  rm "$pid_file"
done
