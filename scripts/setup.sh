#!/bin/sh
set -eu

# Keep settings filled in during workshop preparation when setup is run again.
for example in \
  pkgs/client/.env.example \
  pkgs/server/.env.example pkgs/server/.dev.vars.example \
  pkgs/facilitator/.env.example pkgs/facilitator/.dev.vars.example \
  pkgs/mcp/.env.example pkgs/mcp/.dev.vars.example \
  pkgs/server/wrangler.jsonc.example pkgs/mcp/wrangler.jsonc.example \
  pkgs/config/.env.example
do
  target=${example%.example}
  if [ -e "$target" ]; then
    printf 'Keeping %s\n' "$target"
  else
    cp "$example" "$target"
    printf 'Created %s\n' "$target"
  fi
done
